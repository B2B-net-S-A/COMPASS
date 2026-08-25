'use server'

import { logCompat } from '@/lib/logger'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/actions/audit'
import { computeDueDate } from '@/lib/utils/sla'
import {
    INBOX_CATEGORY_SLUGS,
    TICKET_SUBJECT_MAX,
    TICKET_SUBJECT_MIN,
    type ConsultantSearchResult,
    type CreateInboxTicketInput,
    type InboxSummary,
    type InboxTicketWithMeta,
    type SupportActionResult,
    type SupportComment,
    type SupportInboxMeta,
    type TicketStatus,
} from '@/lib/types/support'

interface ProfileLite {
    id: string
    full_name: string | null
    email: string
}

/**
 * Komunikat błędu także z obiektów nie-Error — postgrest-js po odrzuceniu fetch
 * (zerwany transfer) zwraca ZWYKŁY obiekt { message, details, ... }, nie instancję
 * Error. Sam `instanceof Error` maskował wtedy przyczynę generycznym fallbackiem
 * (incydent 2026-08-25: baner mówił „Błąd pobierania zgłoszeń" zamiast
 * „TypeError: fetch failed").
 */
function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) return error.message
    if (error && typeof error === 'object' && 'message' in error) {
        const m = (error as { message: unknown }).message
        if (typeof m === 'string' && m.length > 0) return m
    }
    return fallback
}

async function isCallerHandler(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
    const { data } = await supabase
        .from('profiles')
        .select('role, is_inbox_handler, has_tcm_access')
        .eq('id', userId)
        .single()
    if (!data) return false
    // Decyzja Artura 2026-08-25: rola talent_community implikuje dostęp do
    // skrzynki, a grant has_tcm_access (Phase 45 — People Ops dla nie-TCM,
    // np. finanse/Dominik) otwiera też kanban Spraw — lustro SQL
    // is_inbox_handler(). Grant bramkowany do HR-zone (nie-konsultant), jak
    // w has_lifecycle_access(). Flaga is_inbox_handler zostaje jako
    // per-osoba „obsługuję skrzynkę" (lista osób odpowiedzialnych).
    return data.role === 'admin'
        || data.role === 'talent_community'
        || data.is_inbox_handler === true
        || (data.has_tcm_access === true && data.role !== 'consultant')
}

async function getInboxCategoryIds(supabase: ReturnType<typeof createClient>): Promise<string[]> {
    // Incydent 2026-08-25 („zniknął nam cały kanban"): awaria tego zapytania była
    // po cichu połykana — `data = null` → `[]` → caller zwracał sukces z pustymi
    // kolumnami i tablica renderowała się pusta BEZ żadnego komunikatu. Awaria
    // zapytania ≠ brak kategorii — rzucamy, żeby caller pokazał jawny błąd
    // (audyt P1.1/P1.7: odmowa dostępu / awaria zapytania ≠ pusta lista).
    const { data, error } = await supabase
        .from('support_categories')
        .select('id')
        .in('slug', INBOX_CATEGORY_SLUGS as unknown as string[])
    if (error) throw error
    return (data ?? []).map((c: { id: string }) => c.id)
}

export async function listInboxTickets(filter?: {
    priority_level?: 'P1' | 'P2' | 'P3'
    consultant_id?: string
    assignee_id?: string
}): Promise<SupportActionResult<Record<TicketStatus, InboxTicketWithMeta[]>>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        if (!(await isCallerHandler(supabase, user.id))) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        const inboxCategoryIds = await getInboxCategoryIds(supabase)
        if (inboxCategoryIds.length === 0) {
            return {
                success: true,
                data: { open: [], in_progress: [], waiting_user: [], resolved: [], closed: [] },
            }
        }

        // Incydent 2026-08-25 (część sieciowa): transfer odpowiedzi > ~100 kB
        // z PostgREST do kontenera bywa zrywany w locie (TypeError: fetch failed
        // mimo retry w hardenedFetch), podczas gdy odpowiedzi do ~25 kB przechodzą
        // niezawodnie (Pulpit ~544 wierszy działa). Do czasu naprawy sieci hosta
        // tablica pobiera dane PARTIAMI mieszczącymi się pod progiem:
        // tickety stronami po 30 (≈20 kB z body_md), meta paczkami po 60 id
        // (≈22 kB po odchudzeniu tabeli). Mechanizm poprawny także na zdrowej
        // sieci — tylko kilka żądań więcej.
        const TICKETS_PAGE_SIZE = 30
        const TICKETS_PAGE_CAP = 40 // twardy sufit 1200 ticketów — pętla nie może być nieskończona
        type TicketRow = {
            id: string
            user_id: string
            assignee_id: string | null
            category_id: string
            subject: string
            body_md: string
            status: TicketStatus
            priority: string
            resolved_at: string | null
            created_at: string
            updated_at: string
        }

        const ticketRows: TicketRow[] = []
        for (let page = 0; page < TICKETS_PAGE_CAP; page++) {
            let query = supabase
                .from('support_tickets')
                .select('*')
                .in('category_id', inboxCategoryIds)
                .order('updated_at', { ascending: false })
                .range(page * TICKETS_PAGE_SIZE, (page + 1) * TICKETS_PAGE_SIZE - 1)
            if (filter?.assignee_id) query = query.eq('assignee_id', filter.assignee_id)

            const { data: pageRows, error } = await query
            if (error) throw error
            // null bez błędu ≠ pusta lista — sygnał, że odpowiedź nie
            // zmaterializowała się w runtime (incydent 2026-08-25).
            if (pageRows === null) throw new Error('Brak odpowiedzi z support_tickets (data=null bez błędu)')
            ticketRows.push(...(pageRows as TicketRow[]))
            if (pageRows.length < TICKETS_PAGE_SIZE) break
            if (page === TICKETS_PAGE_CAP - 1) {
                logCompat.warn('[listInboxTickets] osiągnięto sufit stron — tablica może być niepełna', {
                    cap: TICKETS_PAGE_CAP * TICKETS_PAGE_SIZE,
                })
            }
        }

        if (ticketRows.length === 0) {
            return {
                success: true,
                data: { open: [], in_progress: [], waiting_user: [], resolved: [], closed: [] },
            }
        }

        const ticketIds = ticketRows.map((t) => t.id)
        const userIds = Array.from(new Set([
            ...ticketRows.map((t) => t.user_id),
            ...ticketRows.map((t) => t.assignee_id).filter((x): x is string => !!x),
        ]))

        // KRYTYCZNE: jawna lista kolumn, NIE select('*') (incydent 2026-08-25 —
        // martwe kolumny email z Phase 44 pompowały odpowiedź do ~4 MB; zdjęte
        // migracją inbox_email_archive_and_drop, lista zostaje jako pas
        // bezpieczeństwa i dokumentacja kształtu = interfejs SupportInboxMeta).
        // Meta pobierane PACZKAMI po 60 id (≈22 kB) — patrz komentarz sieciowy wyżej.
        const META_CHUNK = 60
        const metas: SupportInboxMeta[] = []
        for (let i = 0; i < ticketIds.length; i += META_CHUNK) {
            const chunkIds = ticketIds.slice(i, i + META_CHUNK)
            const { data: metaChunk, error: metaErr } = await supabase
                .from('support_inbox_meta')
                .select('ticket_id, source, external_message_id, consultant_id, consultant_name, consultant_phone, client_name, contractor_id, priority_level, due_date, email_from, email_subject, email_received_at, created_at')
                .in('ticket_id', chunkIds)
            // Meta jest warunkiem renderowania karty (`if (!meta) continue` niżej) —
            // cicha awaria wycinała WSZYSTKIE tickety bez błędu. Rzucamy, żeby UI
            // dostał jawny baner; null bez błędu traktujemy tak samo.
            if (metaErr) throw metaErr
            if (metaChunk === null) throw new Error('Brak odpowiedzi z support_inbox_meta (data=null bez błędu)')
            metas.push(...(metaChunk as unknown as SupportInboxMeta[]))
        }

        const [profilesRes, categoriesRes] = await Promise.all([
            supabase.from('profiles').select('id, full_name').in('id', userIds),
            supabase.from('support_categories').select('id, slug, name_pl').in('id', inboxCategoryIds),
        ])
        // Profile i kategorie są tylko dekoracją (nazwiska, etykiety) — ich awaria
        // degraduje wyświetlanie do null/'', ale nie może chować ticketów.
        const profiles = profilesRes.data
        const categories = categoriesRes.data

        const metaMap = new Map<string, SupportInboxMeta>()
        for (const m of (metas ?? []) as SupportInboxMeta[]) metaMap.set(m.ticket_id, m)

        const consultantIds = Array.from(
            new Set(((metas ?? []) as SupportInboxMeta[]).map((m) => m.consultant_id).filter((x): x is string => !!x))
        )
        const { data: consultantProfiles } = consultantIds.length > 0
            ? await supabase.from('profiles').select('id, full_name').in('id', consultantIds)
            : { data: [] as Array<{ id: string; full_name: string | null }> }
        const consultantMap = new Map(
            (consultantProfiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name])
        )

        const profileMap = new Map(
            (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name])
        )
        const categoryMap = new Map(
            (categories ?? []).map((c: { id: string; slug: string; name_pl: string }) => [c.id, c])
        )

        const grouped: Record<TicketStatus, InboxTicketWithMeta[]> = {
            open: [], in_progress: [], waiting_user: [], resolved: [], closed: [],
        }

        for (const t of ticketRows) {
            const meta = metaMap.get(t.id)
            if (!meta) continue
            // Phase 44 — tickety z usuniętego auto-importu maili nie wracają na tablicę.
            // Zamknięcie ich (migracja phase44) zdjęło je z kolumn roboczych, ale 178 sztuk
            // zalewało kolumnę „Zamknięte" i zostawiało dokładnie ten bałagan, przez który
            // integracja poszła precz. Wiersze zostają w bazie — karta jest wciąż pod
            // /admin/inbox/{id}, jeśli ktoś będzie czegoś szukał.
            if (meta.source === 'email') continue
            if (filter?.priority_level && meta.priority_level !== filter.priority_level) continue
            if (filter?.consultant_id && meta.consultant_id !== filter.consultant_id) continue
            const cat = categoryMap.get(t.category_id)
            const item: InboxTicketWithMeta = {
                id: t.id,
                user_id: t.user_id,
                assignee_id: t.assignee_id,
                category_id: t.category_id,
                subject: t.subject,
                body_md: t.body_md,
                status: t.status,
                priority: t.priority as InboxTicketWithMeta['priority'],
                resolved_at: t.resolved_at,
                created_at: t.created_at,
                updated_at: t.updated_at,
                category_slug: cat?.slug ?? '',
                category_name_pl: cat?.name_pl ?? '',
                user_name: profileMap.get(t.user_id) ?? null,
                assignee_name: t.assignee_id ? (profileMap.get(t.assignee_id) ?? null) : null,
                comment_count: 0,
                meta,
                consultant_name: meta.consultant_name ?? (meta.consultant_id ? (consultantMap.get(meta.consultant_id) ?? null) : null),
                consultant_phone: meta.consultant_phone ?? null,
                client_name: meta.client_name ?? null,
            }
            grouped[t.status].push(item)
        }

        return { success: true, data: grouped }
    } catch (error: unknown) {
        const msg = errorMessage(error, 'Błąd pobierania zgłoszeń')
        logCompat.error('[listInboxTickets]', error)
        return { success: false, error: msg }
    }
}

export async function getInboxTicketDetail(
    ticketId: string,
): Promise<SupportActionResult<InboxTicketWithMeta & { comments: SupportComment[]; can_reply: boolean; can_change_status: boolean }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        if (!(await isCallerHandler(supabase, user.id))) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        const { data: ticket, error: ticketErr } = await supabase
            .from('support_tickets')
            .select('*')
            .eq('id', ticketId)
            .single()
        if (ticketErr || !ticket) return { success: false, error: 'Zgłoszenie nie istnieje lub brak dostępu' }

        const { data: meta, error: metaErr } = await supabase
            .from('support_inbox_meta')
            .select('*')
            .eq('ticket_id', ticketId)
            .single()
        if (metaErr || !meta) return { success: false, error: 'To zgłoszenie nie jest typu inbox' }

        const userIds = Array.from(new Set([ticket.user_id, ticket.assignee_id, meta.consultant_id].filter((x): x is string => !!x)))
        const [{ data: profiles }, { data: category }, { data: rawComments }] = await Promise.all([
            supabase.from('profiles').select('id, full_name').in('id', userIds),
            supabase.from('support_categories').select('id, slug, name_pl').eq('id', ticket.category_id).single(),
            supabase.from('support_ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true }),
        ])
        const profileMap = new Map(
            (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name])
        )

        const commentAuthorIds = Array.from(new Set(((rawComments ?? []) as Array<{ author_id: string }>).map((c) => c.author_id)))
        const { data: commentProfiles } = commentAuthorIds.length > 0
            ? await supabase.from('profiles').select('id, full_name').in('id', commentAuthorIds)
            : { data: [] as Array<{ id: string; full_name: string | null }> }
        const commentProfileMap = new Map(
            (commentProfiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name])
        )

        const comments: SupportComment[] = ((rawComments ?? []) as Array<{
            id: string; ticket_id: string; author_id: string; body_md: string; is_internal: boolean; created_at: string
        }>).map((c) => ({
            id: c.id,
            ticket_id: c.ticket_id,
            author_id: c.author_id,
            author_name: commentProfileMap.get(c.author_id) ?? null,
            body_md: c.body_md,
            is_internal: c.is_internal,
            created_at: c.created_at,
        }))

        return {
            success: true,
            data: {
                id: ticket.id,
                user_id: ticket.user_id,
                assignee_id: ticket.assignee_id,
                category_id: ticket.category_id,
                subject: ticket.subject,
                body_md: ticket.body_md,
                status: ticket.status as 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed',
                priority: ticket.priority as 'low' | 'normal' | 'high' | 'urgent',
                resolved_at: ticket.resolved_at,
                created_at: ticket.created_at,
                updated_at: ticket.updated_at,
                category_slug: category?.slug ?? '',
                category_name_pl: category?.name_pl ?? '',
                user_name: profileMap.get(ticket.user_id) ?? null,
                assignee_name: ticket.assignee_id ? (profileMap.get(ticket.assignee_id) ?? null) : null,
                comment_count: comments.length,
                meta: meta as SupportInboxMeta,
                consultant_name: meta.consultant_name ?? (meta.consultant_id ? (profileMap.get(meta.consultant_id) ?? null) : null),
                consultant_phone: meta.consultant_phone ?? null,
                client_name: meta.client_name ?? null,
                comments,
                can_reply: true,
                can_change_status: true,
            },
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania zgłoszenia'
        logCompat.error('[getInboxTicketDetail]', error)
        return { success: false, error: msg }
    }
}

export async function createInboxTicket(
    input: CreateInboxTicketInput,
): Promise<SupportActionResult<{ ticketId: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        if (!(await isCallerHandler(supabase, user.id))) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        if (!input.subject || input.subject.trim().length < 3) {
            return { success: false, error: 'Tytuł musi mieć co najmniej 3 znaki' }
        }
        if (!input.body_md || input.body_md.trim().length < 10) {
            return { success: false, error: 'Treść musi mieć co najmniej 10 znaków' }
        }
        if (!['P1', 'P2', 'P3'].includes(input.priority_level)) {
            return { success: false, error: 'Nieprawidłowy priorytet' }
        }

        // Verify category is an inbox category (defense-in-depth on top of RLS)
        const { data: cat } = await supabase
            .from('support_categories')
            .select('slug')
            .eq('id', input.category_id)
            .single()
        if (!cat || !cat.slug.startsWith('inbox_')) {
            return { success: false, error: 'Nieprawidłowa kategoria inbox' }
        }

        const fromDate = input.email_received_at ? new Date(input.email_received_at) : new Date()
        const dueDate = computeDueDate(input.priority_level, fromDate)

        // Phase 40 — normalise consultant fields (all optional; manual entry allowed).
        const consultantName = input.consultant_name?.trim() || null
        const consultantPhone = input.consultant_phone?.trim() || null
        const clientName = input.client_name?.trim() || null
        const contractorId = input.contractor_id || null

        // Step 1: insert into support_tickets
        const { data: ticket, error: ticketErr } = await supabase
            .from('support_tickets')
            .insert({
                user_id: user.id,
                assignee_id: input.assignee_id ?? user.id,
                category_id: input.category_id,
                subject: input.subject.trim(),
                body_md: input.body_md.trim(),
                priority: 'normal',
                status: 'open',
            })
            .select('id')
            .single()
        if (ticketErr || !ticket) {
            return { success: false, error: ticketErr?.message ?? 'Błąd tworzenia zgłoszenia' }
        }

        // Step 2: insert into support_inbox_meta — compensate on failure
        const { error: metaErr } = await supabase.from('support_inbox_meta').insert({
            ticket_id: ticket.id,
            source: input.source ?? 'manual_paste',
            external_message_id: input.external_message_id ?? null,
            consultant_id: input.consultant_id ?? null,
            consultant_name: consultantName,
            consultant_phone: consultantPhone,
            client_name: clientName,
            contractor_id: contractorId,
            priority_level: input.priority_level,
            due_date: dueDate.toISOString(),
            email_from: input.email_from ?? null,
            email_subject: input.subject.trim(),
            email_received_at: input.email_received_at ?? null,
        })
        if (metaErr) {
            await supabase.from('support_tickets').delete().eq('id', ticket.id)
            return { success: false, error: metaErr.message }
        }

        // Phase 40 — the consultant list "learns" phone numbers: when a matched
        // contractor is linked and a phone was provided, persist it back to the
        // directory so future tickets auto-fill it. Best-effort — never blocks the
        // ticket. Uses a service client (contractors is admin/TCM-gated by RLS).
        if (contractorId && consultantPhone) {
            try {
                const service = createServiceClient()
                const { data: existing } = await service
                    .from('contractors')
                    .select('phone')
                    .eq('id', contractorId)
                    .single()
                if (existing && (existing.phone ?? '') !== consultantPhone) {
                    await service
                        .from('contractors')
                        .update({ phone: consultantPhone })
                        .eq('id', contractorId)
                }
            } catch (e) {
                logCompat.warn('[createInboxTicket] contractor phone write-back failed:', e)
            }
        }

        // Step 3: notify assignee if different from creator
        if (input.assignee_id && input.assignee_id !== user.id) {
            try {
                await supabase.from('notifications').insert({
                    user_id: input.assignee_id,
                    type: 'inbox_ticket_assigned',
                    title_pl: 'Nowe zgłoszenie inbox',
                    title_en: 'New inbox ticket',
                    body_pl: input.subject.trim(),
                    body_en: input.subject.trim(),
                    priority: 'normal',
                })
            } catch (e) {
                logCompat.warn('[createInboxTicket] notification insert failed:', e)
            }
        }

        revalidatePath('/admin/inbox')
        return { success: true, data: { ticketId: ticket.id } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd tworzenia zgłoszenia'
        logCompat.error('[createInboxTicket]', error)
        return { success: false, error: msg }
    }
}

export async function moveInboxTicket(
    ticketId: string,
    newStatus: TicketStatus,
): Promise<SupportActionResult<void>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        if (!(await isCallerHandler(supabase, user.id))) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        // Verify this is an inbox ticket — prevents cross-contamination with user tickets
        const { data: meta } = await supabase
            .from('support_inbox_meta')
            .select('ticket_id')
            .eq('ticket_id', ticketId)
            .single()
        if (!meta) return { success: false, error: 'To zgłoszenie nie jest typu inbox' }

        const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() }
        if (newStatus === 'resolved' || newStatus === 'closed') {
            updates.resolved_at = new Date().toISOString()
        } else {
            updates.resolved_at = null
        }

        const { error } = await supabase.from('support_tickets').update(updates).eq('id', ticketId)
        if (error) throw error

        revalidatePath('/admin/inbox')
        revalidatePath(`/admin/inbox/${ticketId}`)
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zmiany statusu'
        logCompat.error('[moveInboxTicket]', error)
        return { success: false, error: msg }
    }
}

/**
 * Phase 49 — zmiana tytułu zgłoszenia (People Ops → Sprawy).
 * Tytuł bywa nadany w pośpiechu albo przeklejony z maila; bez edycji zostawał
 * na tablicy na zawsze. Nie ruszamy `support_inbox_meta.email_subject` — to zapis
 * historyczny tego, z czym zgłoszenie przyszło, a nie nazwa robocza sprawy.
 */
export async function renameInboxTicket(
    ticketId: string,
    subject: string,
): Promise<SupportActionResult<{ subject: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        if (!(await isCallerHandler(supabase, user.id))) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        const trimmed = (subject ?? '').trim().replace(/\s+/g, ' ')
        if (trimmed.length < TICKET_SUBJECT_MIN) {
            return { success: false, error: `Tytuł musi mieć co najmniej ${TICKET_SUBJECT_MIN} znaki` }
        }
        if (trimmed.length > TICKET_SUBJECT_MAX) {
            return { success: false, error: `Tytuł może mieć maksymalnie ${TICKET_SUBJECT_MAX} znaków` }
        }

        // Ta sama bariera co w moveInboxTicket: akcja obsługuje wyłącznie zgłoszenia
        // inboxu, nie tickety helpdesku ani lustro spraw kontraktorskich.
        const { data: meta } = await supabase
            .from('support_inbox_meta')
            .select('ticket_id')
            .eq('ticket_id', ticketId)
            .single()
        if (!meta) return { success: false, error: 'To zgłoszenie nie jest typu inbox' }

        // Brak wiersza traktujemy jak błąd, nie jak cichy sukces: UPDATE na zero
        // wierszy zwraca w PostgREST `error: null`, więc bez tej bramki akcja
        // zameldowałaby zmianę i zapisała do audytu parę [null, nowy] dla
        // nieistniejącego zgłoszenia.
        const { data: before } = await supabase
            .from('support_tickets')
            .select('subject')
            .eq('id', ticketId)
            .single()
        if (!before) return { success: false, error: 'Zgłoszenie nie istnieje lub brak dostępu' }
        const previous = before.subject
        if (previous === trimmed) return { success: true, data: { subject: trimmed } }

        const { error } = await supabase
            .from('support_tickets')
            .update({ subject: trimmed, updated_at: new Date().toISOString() })
            .eq('id', ticketId)
        if (error) throw error

        await logAudit(user.id, 'INBOX_TICKET_RENAMED', {
            ticket_id: ticketId,
            subject: [previous, trimmed],
        })

        revalidatePath('/admin/inbox')
        revalidatePath(`/admin/inbox/${ticketId}`)
        // Kanban Spraw żyje w hubie People Ops — bez tego stary tytuł zostaje na kafelku.
        revalidatePath('/internal/people')
        return { success: true, data: { subject: trimmed } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zmiany tytułu'
        logCompat.error('[renameInboxTicket]', error)
        return { success: false, error: msg }
    }
}

export async function assignInboxTicket(
    ticketId: string,
    handlerId: string | null,
    consultantId?: string | null,
): Promise<SupportActionResult<void>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        if (!(await isCallerHandler(supabase, user.id))) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        const { data: meta } = await supabase
            .from('support_inbox_meta')
            .select('ticket_id')
            .eq('ticket_id', ticketId)
            .single()
        if (!meta) return { success: false, error: 'To zgłoszenie nie jest typu inbox' }

        const ticketUpdates: Record<string, unknown> = {
            assignee_id: handlerId,
            updated_at: new Date().toISOString(),
        }
        if (handlerId) ticketUpdates.status = 'in_progress'
        const { error: tErr } = await supabase.from('support_tickets').update(ticketUpdates).eq('id', ticketId)
        if (tErr) throw tErr

        if (consultantId !== undefined) {
            const { error: mErr } = await supabase
                .from('support_inbox_meta')
                .update({ consultant_id: consultantId })
                .eq('ticket_id', ticketId)
            if (mErr) throw mErr
        }

        if (handlerId && handlerId !== user.id) {
            const { data: ticket } = await supabase
                .from('support_tickets')
                .select('subject')
                .eq('id', ticketId)
                .single()
            try {
                await supabase.from('notifications').insert({
                    user_id: handlerId,
                    type: 'inbox_ticket_assigned',
                    title_pl: 'Przypisano Cię do zgłoszenia inbox',
                    title_en: 'Assigned to inbox ticket',
                    body_pl: ticket?.subject ?? '',
                    body_en: ticket?.subject ?? '',
                    priority: 'normal',
                })
            } catch (e) {
                logCompat.warn('[assignInboxTicket] notification insert failed:', e)
            }
        }

        revalidatePath('/admin/inbox')
        revalidatePath(`/admin/inbox/${ticketId}`)
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd przypisania'
        logCompat.error('[assignInboxTicket]', error)
        return { success: false, error: msg }
    }
}

export async function listInboxHandlers(): Promise<SupportActionResult<ProfileLite[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        if (!(await isCallerHandler(supabase, user.id))) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        // Osoby odpowiedzialne = faktyczni operatorzy skrzynki: cały zespół TCM
        // (rola implikuje obsługę — decyzja Artura 2026-08-25) + osoby z flagą
        // is_inbox_handler (np. manager). Bare-admini świadomie POZA listą —
        // właściciele firmy nie obsługują skrzynki (zgłoszenie Dominika);
        // admin, który chce obsługiwać, ustawia sobie flagę.
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, role, is_inbox_handler')
            .or('is_inbox_handler.eq.true,role.eq.talent_community')
            // Ticket przypisany osobie, która odeszła, nie ma kto obsłużyć.
            .neq('employment_status', 'exited')
            .order('full_name', { ascending: true })

        if (error) throw error
        const items = ((data ?? []) as Array<ProfileLite & { role: string; is_inbox_handler: boolean }>).map((p) => ({
            id: p.id,
            full_name: p.full_name,
            email: p.email,
        }))
        return { success: true, data: items }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania handlerów'
        logCompat.error('[listInboxHandlers]', error)
        return { success: false, error: msg }
    }
}

/**
 * Phase 40 — search the contractors directory (~588 people, Phase 33) for the
 * "Podpięty konsultant" typeahead. The old implementation searched
 * profiles(role='consultant') — only 3 internal accounts, which is why linking
 * a real consultant never worked. Uses a service client because contractors is
 * gated by has_lifecycle_access() (admin/TCM) and inbox handlers may not qualify;
 * the isCallerHandler guard above keeps this restricted to handlers.
 */
export async function searchConsultants(query: string): Promise<SupportActionResult<ConsultantSearchResult[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        if (!(await isCallerHandler(supabase, user.id))) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        const trimmed = query.trim()
        if (trimmed.length < 2) return { success: true, data: [] }

        const service = createServiceClient()
        const pattern = `%${trimmed.replace(/[%_]/g, (m) => `\\${m}`)}%`
        const { data, error } = await service
            .from('contractors')
            .select('id, full_name, phone, current_client, current_position')
            .ilike('full_name', pattern)
            .order('full_name', { ascending: true })
            .limit(15)

        if (error) throw error
        return { success: true, data: (data ?? []) as ConsultantSearchResult[] }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd wyszukiwania konsultantów'
        logCompat.error('[searchConsultants]', error)
        return { success: false, error: msg }
    }
}

// Phase 34 — lightweight inbox counts for the Talent Community Pulpit (open / overdue / unassigned).
export async function getInboxSummary(): Promise<SupportActionResult<InboxSummary>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        if (!(await isCallerHandler(supabase, user.id))) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        const inboxCategoryIds = await getInboxCategoryIds(supabase)
        if (inboxCategoryIds.length === 0) {
            return { success: true, data: { open: 0, overdue: 0, unassigned: 0 } }
        }

        // Jak w listInboxTickets: awaria zapytania nie może udawać „0 spraw".
        const { data: tickets, error: ticketsErr } = await supabase
            .from('support_tickets')
            .select('id, status, assignee_id')
            .in('category_id', inboxCategoryIds)
        if (ticketsErr) throw ticketsErr
        const rows = (tickets ?? []) as Array<{ id: string; status: TicketStatus; assignee_id: string | null }>
        const openRows = rows.filter((t) => t.status !== 'resolved' && t.status !== 'closed')

        // Overdue = open tickets whose inbox meta due_date is in the past.
        let overdue = 0
        const openIds = openRows.map((t) => t.id)
        if (openIds.length > 0) {
            const { data: metas } = await supabase
                .from('support_inbox_meta')
                .select('ticket_id, due_date')
                .in('ticket_id', openIds)
            const nowIso = new Date().toISOString()
            overdue = ((metas ?? []) as Array<{ ticket_id: string; due_date: string | null }>)
                .filter((m) => m.due_date != null && m.due_date < nowIso).length
        }

        return {
            success: true,
            data: {
                open: openRows.length,
                overdue,
                unassigned: openRows.filter((t) => t.assignee_id == null).length,
            },
        }
    } catch (error: unknown) {
        const msg = errorMessage(error, 'Błąd pobierania podsumowania skrzynki')
        logCompat.error('[getInboxSummary]', error)
        return { success: false, error: msg }
    }
}

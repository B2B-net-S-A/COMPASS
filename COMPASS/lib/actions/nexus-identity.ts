'use server'

import { revalidatePath } from 'next/cache'
import { ExpectedError, runAction, type ActionResult } from '@/lib/actions/action-result'
import { logAudit } from '@/lib/actions/audit'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireRows } from '@/lib/supabase/select-in-chunks'
import {
    currentContract,
    groupByPerson,
    namesMatch,
    nexusFullName,
    suggestionsFor,
    type NexusContractor,
    type NexusSuggestion,
} from '@/lib/contractors/nexus-match'

/**
 * Kolejka ręcznego dopasowania kontraktorów do NEXUSA.
 *
 * Cron (`/api/cron/nexus-contractors-sync`) linkuje AUTOMATEM wyłącznie przy
 * e-mailu unikalnym po obu stronach. Wszystko inne — a dziś to praktycznie
 * wszystko, bo kontraktorzy COMPASSA nie mają e-maili — czeka tutaj na człowieka.
 *
 * DLACZEGO AUTOMAT NIE DOKOŃCZY TEGO SAM: dopasowanie po nazwisku do ~49 tys.
 * kandydatów w NEXUSIE skleja ludzi po cichu i trwale. Compass podjął tę
 * decyzję już raz — `20260714183425_consultant_success_hub.sql` („Name matching
 * is intentionally forbidden"). Nazwisko służy tu wyłącznie do PODPOWIEDZI.
 *
 * Audyt integracji 14.09 (INT-02, INT-06): podpowiedzi z migawki eksportu
 * zamiast przepisywania numeru, weryfikacja ID po stronie serwera, rozdzielenie
 * „automat nie znalazł" od „człowiek odrzucił" oraz korekta błędnych decyzji.
 */

const HUB = '/internal/people'

/** PostgREST przekazuje kod Postgresa: 42703 = undefined_column, 42P01 = undefined_table. */
const UNDEFINED_COLUMN = '42703'
const UNDEFINED_TABLE = '42P01'
const UNIQUE_VIOLATION = '23505'
/** PostgREST domyślnie tnie odpowiedź do 1000 wierszy — migawkę czytamy stronami. */
const SNAPSHOT_PAGE = 1000
const REASON_MIN = 3
const REASON_MAX = 500

export type NexusQueueView = 'open' | 'auto_not_found' | 'dismissed' | 'linked'

export type NexusQueueRow = {
    id: string
    fullName: string
    currentClient: string | null
    matchStatus: string | null
    matchReason: string | null
    decidedByName: string | null
    decidedAt: string | null
    syncedAt: string | null
    /** Osoby z ostatniego eksportu NEXUSA pasujące e-mailem albo nazwiskiem. */
    suggestions: NexusSuggestion[]
    /** Dla widoku „Powiązani": bieżący kontrakt powiązanej osoby. */
    linked: NexusSuggestion | null
    nexusContractId: number | null
}

export type NexusQueue = {
    view: NexusQueueView
    rows: NexusQueueRow[]
    counts: Record<NexusQueueView, number | null>
    /** Migawka odczytana — bez niej puste podpowiedzi znaczą „nie wiem", nie „brak trafień". */
    snapshotAvailable: boolean
    snapshotSeenAt: string | null
    /** Kolumny/tabele jeszcze nie istnieją — migracja nie została zaaplikowana. */
    migrationPending: boolean
}

type SnapshotRow = {
    nexus_contract_id: number
    nexus_candidate_id: number
    name: string | null
    lastname: string | null
    email: string | null
    client_name: string | null
    job_title: string | null
    status: string | null
    start_date: string | null
    end_date: string | null
    lacks_current_order: boolean
    source_updated_at: string | null
    seen_at: string
}

type ServiceClient = ReturnType<typeof createServiceClient>

function toNexusContractor(r: SnapshotRow): NexusContractor {
    return {
        nexus_contract_id: r.nexus_contract_id,
        candidate: { id: r.nexus_candidate_id, name: r.name, lastname: r.lastname, email: r.email },
        client_name: r.client_name,
        job_title: r.job_title,
        status: r.status,
        start_date: r.start_date,
        end_date: r.end_date,
        lacks_current_order: r.lacks_current_order,
        updated_at: r.source_updated_at,
    }
}

function errorCode(error: unknown): string | undefined {
    return (error as { code?: string } | null)?.code
}

const SNAPSHOT_COLUMNS =
    'nexus_contract_id, nexus_candidate_id, name, lastname, email, client_name, job_title, status, start_date, end_date, lacks_current_order, source_updated_at, seen_at'

async function loadSnapshot(
    admin: ServiceClient,
): Promise<{ rows: SnapshotRow[]; missing: boolean; failed: boolean }> {
    const rows: SnapshotRow[] = []
    for (let from = 0; ; from += SNAPSHOT_PAGE) {
        const { data, error } = await admin
            .from('nexus_contract_snapshot')
            .select(SNAPSHOT_COLUMNS)
            .order('nexus_contract_id')
            .range(from, from + SNAPSHOT_PAGE - 1)
        if (error) {
            return { rows: [], missing: errorCode(error) === UNDEFINED_TABLE, failed: true }
        }
        const page = (data ?? []) as SnapshotRow[]
        rows.push(...page)
        if (page.length < SNAPSHOT_PAGE) return { rows, missing: false, failed: false }
    }
}

function statusFilter(view: NexusQueueView): string[] {
    switch (view) {
        case 'open':
            return ['pending', 'ambiguous']
        case 'auto_not_found':
            return ['auto_not_found']
        case 'dismissed':
            return ['dismissed']
        case 'linked':
            return ['linked']
    }
}

const VIEWS: readonly NexusQueueView[] = ['open', 'auto_not_found', 'dismissed', 'linked']

function toSuggestion(personId: number, rows: readonly NexusContractor[]): NexusSuggestion | null {
    const current = currentContract(rows)
    if (!current) return null
    return {
        nexusCandidateId: personId,
        nexusContractId: current.nexus_contract_id,
        fullName: nexusFullName(current),
        email: current.candidate.email,
        clientName: current.client_name,
        jobTitle: current.job_title,
        status: current.status,
        startDate: current.start_date,
        endDate: current.end_date,
        contractCount: rows.length,
        matchedBy: 'name',
    }
}

/**
 * Wiersze danego widoku kolejki z podpowiedziami.
 *
 * `requireRows` dla kontraktorów, bo to jest TREŚĆ ekranu: pusta lista przy
 * awarii odczytu wyglądałaby jak „wszystko dopasowane". Migawka, liczniki
 * i nazwiska decydujących to DEKORACJA — ich awaria degraduje widok.
 */
export async function listNexusMatchQueue(
    input: { view?: NexusQueueView } = {},
): Promise<ActionResult<NexusQueue>> {
    return runAction('listNexusMatchQueue', async () => {
        await requireLifecycleManagerAction()
        const view: NexusQueueView = VIEWS.includes(input.view as NexusQueueView)
            ? (input.view as NexusQueueView)
            : 'open'
        const admin = createServiceClient()

        const emptyCounts: Record<NexusQueueView, number | null> = {
            open: null,
            auto_not_found: null,
            dismissed: null,
            linked: null,
        }
        const pendingMigration: NexusQueue = {
            view,
            rows: [],
            counts: emptyCounts,
            snapshotAvailable: false,
            snapshotSeenAt: null,
            migrationPending: true,
        }

        const res = await admin
            .from('contractors')
            .select(
                'id, full_name, email, current_client, nexus_match_status, nexus_match_reason, nexus_match_decided_by, nexus_match_decided_at, nexus_synced_at, nexus_contract_id, nexus_candidate_id',
            )
            .in('nexus_match_status', statusFilter(view))
            .order('full_name')
        // Migracja wjeżdża osobno (baza produkcyjna nie przyjmuje DDL z deployu),
        // więc brak kolumn/tabeli to znany stan przejściowy, nie awaria.
        if (errorCode(res.error) === UNDEFINED_COLUMN) return pendingMigration
        const contractors = requireRows('kolejki dopasowania NEXUSA', res)

        const snapshot = await loadSnapshot(admin)
        if (snapshot.missing) return pendingMigration
        const nexus = snapshot.rows.map(toNexusContractor)
        const byPerson = groupByPerson(nexus)

        const counts = { ...emptyCounts }
        await Promise.all(
            VIEWS.map(async (v) => {
                const { count, error } = await admin
                    .from('contractors')
                    .select('id', { count: 'exact', head: true })
                    .in('nexus_match_status', statusFilter(v))
                counts[v] = error ? null : (count ?? 0)
            }),
        )

        const deciderIds = Array.from(
            new Set(
                contractors
                    .map((c) => c.nexus_match_decided_by)
                    .filter((id): id is string => Boolean(id)),
            ),
        )
        const deciderNames = new Map<string, string>()
        if (deciderIds.length > 0) {
            const { data } = await admin.from('profiles').select('id, full_name').in('id', deciderIds)
            for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
                deciderNames.set(p.id, p.full_name ?? '—')
            }
        }

        const seenAt = snapshot.rows.reduce<string | null>(
            (latest, r) => (latest === null || r.seen_at > latest ? r.seen_at : latest),
            null,
        )

        return {
            view,
            migrationPending: false,
            snapshotAvailable: !snapshot.failed,
            snapshotSeenAt: seenAt,
            counts,
            rows: contractors.map(
                (c): NexusQueueRow => ({
                    id: c.id,
                    fullName: c.full_name,
                    currentClient: c.current_client,
                    matchStatus: c.nexus_match_status,
                    matchReason: c.nexus_match_reason,
                    decidedByName: c.nexus_match_decided_by
                        ? (deciderNames.get(c.nexus_match_decided_by) ?? null)
                        : null,
                    decidedAt: c.nexus_match_decided_at,
                    syncedAt: c.nexus_synced_at,
                    nexusContractId: c.nexus_contract_id,
                    suggestions: view === 'linked' ? [] : suggestionsFor(c, nexus),
                    linked:
                        view === 'linked' && c.nexus_candidate_id != null
                            ? toSuggestion(c.nexus_candidate_id, byPerson.get(c.nexus_candidate_id) ?? [])
                            : null,
                }),
            ),
        }
    })
}

export type LinkContractorResult =
    | { status: 'linked' }
    /** Nazwisko w NEXUSIE różni się od kartoteki — potrzebne jawne potwierdzenie. */
    | { status: 'name_mismatch'; nexusName: string; compassName: string }

/**
 * Wiąże kontraktora z OSOBĄ w NEXUSIE — decyzja człowieka.
 *
 * ID kontraktu jest weryfikowane w ostatnim kompletnym eksporcie NEXUSA:
 * dawniej wystarczała dowolna dodatnia liczba, więc literówka wiązała
 * kontraktora z obcą osobą, a automat chronił potem ten błąd.
 */
export async function linkContractorToNexus(input: {
    contractorId: string
    nexusContractId: number
    confirmNameMismatch?: boolean
}): Promise<ActionResult<LinkContractorResult>> {
    return runAction('linkContractorToNexus', async (): Promise<LinkContractorResult> => {
        const ctx = await requireLifecycleManagerAction()
        if (!input.contractorId) throw new ExpectedError('Brak kontraktora.')
        if (!Number.isInteger(input.nexusContractId) || input.nexusContractId <= 0) {
            throw new ExpectedError('Podaj poprawne id kontraktu z NEXUSA.')
        }

        const admin = createServiceClient()
        const snap = await admin
            .from('nexus_contract_snapshot')
            .select(SNAPSHOT_COLUMNS)
            .eq('nexus_contract_id', input.nexusContractId)
            .maybeSingle()
        if (snap.error) throw new Error(`Odczyt migawki NEXUSA nie powiódł się: ${snap.error.message}`)
        if (!snap.data) {
            throw new ExpectedError(
                'Kontrakt nie istnieje w ostatnim eksporcie NEXUS. Sprawdź numer albo poczekaj na najbliższą synchronizację.',
            )
        }
        const chosen = toNexusContractor(snap.data as SnapshotRow)

        const contractorRes = await admin
            .from('contractors')
            .select('id, full_name, nexus_match_status')
            .eq('id', input.contractorId)
            .maybeSingle()
        if (contractorRes.error) {
            throw new Error(`Odczyt kontraktora nie powiódł się: ${contractorRes.error.message}`)
        }
        const contractor = contractorRes.data as
            | { id: string; full_name: string; nexus_match_status: string | null }
            | null
        if (!contractor) throw new ExpectedError('Nie znaleziono kontraktora.')

        const mismatch = !namesMatch(contractor.full_name, chosen)
        if (mismatch && input.confirmNameMismatch !== true) {
            return {
                status: 'name_mismatch',
                nexusName: nexusFullName(chosen),
                compassName: contractor.full_name,
            }
        }

        const personId = chosen.candidate.id
        const other = await admin
            .from('contractors')
            .select('id, full_name')
            .eq('nexus_candidate_id', personId)
            .neq('id', input.contractorId)
            .limit(1)
        if (other.error) throw new Error(`Sprawdzenie powiązań nie powiodło się: ${other.error.message}`)
        const otherRow = ((other.data ?? []) as Array<{ id: string; full_name: string }>)[0]
        if (otherRow) {
            throw new ExpectedError(
                `Ta osoba z NEXUSA jest już powiązana z kontraktorem „${otherRow.full_name}". Najpierw odepnij tamto powiązanie.`,
            )
        }

        // Kotwicą jest osoba; zapisujemy jej BIEŻĄCY kontrakt — tak samo jak cron,
        // żeby kolejny bieg nie przepisywał wiersza tylko dlatego, że człowiek
        // kliknął starszą umowę tej samej osoby.
        const personRows = await admin
            .from('nexus_contract_snapshot')
            .select(SNAPSHOT_COLUMNS)
            .eq('nexus_candidate_id', personId)
        if (personRows.error) {
            throw new Error(`Odczyt kontraktów osoby nie powiódł się: ${personRows.error.message}`)
        }
        const current =
            currentContract(((personRows.data ?? []) as SnapshotRow[]).map(toNexusContractor)) ?? chosen

        const now = new Date().toISOString()
        const { error } = await admin
            .from('contractors')
            .update({
                nexus_contract_id: current.nexus_contract_id,
                nexus_candidate_id: personId,
                nexus_match_status: 'linked',
                nexus_match_decided_by: ctx.userId,
                nexus_match_decided_at: now,
                nexus_match_reason: mismatch ? 'Potwierdzono mimo różnicy nazwiska' : null,
                nexus_synced_at: now,
            })
            .eq('id', input.contractorId)

        if (error) {
            // Częściowy indeks unikalny: kontrakt albo osoba są już przypięte do
            // kogoś innego. To NIE jest awaria — człowiek musi wybrać, która
            // decyzja jest błędna.
            if (errorCode(error) === UNIQUE_VIOLATION) {
                throw new ExpectedError('Ta osoba albo kontrakt z NEXUSA jest już powiązana z innym kontraktorem.')
            }
            throw new Error(`Nie udało się powiązać kontraktora: ${error.message}`)
        }

        await logAudit(ctx.userId, 'CONTRACTOR_LINKED_TO_NEXUS', {
            contractor_id: input.contractorId,
            nexus_contract_id: current.nexus_contract_id,
            chosen_nexus_contract_id: input.nexusContractId,
            nexus_candidate_id: personId,
            previous_status: contractor.nexus_match_status,
            name_mismatch_confirmed: mismatch,
        })
        revalidatePath(HUB)
        return { status: 'linked' }
    })
}

/**
 * Korekta błędnego powiązania: wiersz wraca do kolejki (`pending`).
 * Kolejny bieg crona oceni go od nowa — automat powiąże ponownie wyłącznie
 * przy e-mailu unikalnym po obu stronach.
 */
export async function unlinkContractorFromNexus(input: {
    contractorId: string
    reason?: string
}): Promise<ActionResult<void>> {
    return runAction('unlinkContractorFromNexus', async () => {
        const ctx = await requireLifecycleManagerAction()
        if (!input.contractorId) throw new ExpectedError('Brak kontraktora.')
        const reason = (input.reason ?? '').trim().slice(0, REASON_MAX) || null

        const admin = createServiceClient()
        const before = await admin
            .from('contractors')
            .select('id, nexus_match_status, nexus_candidate_id, nexus_contract_id')
            .eq('id', input.contractorId)
            .maybeSingle()
        if (before.error) throw new Error(`Odczyt kontraktora nie powiódł się: ${before.error.message}`)
        const row = before.data as
            | {
                  id: string
                  nexus_match_status: string | null
                  nexus_candidate_id: number | null
                  nexus_contract_id: number | null
              }
            | null
        if (!row) throw new ExpectedError('Nie znaleziono kontraktora.')
        if (row.nexus_match_status !== 'linked') {
            throw new ExpectedError('Ten kontraktor nie jest powiązany z NEXUSEM — odśwież widok.')
        }

        const { data, error } = await admin
            .from('contractors')
            .update({
                nexus_contract_id: null,
                nexus_candidate_id: null,
                nexus_match_status: 'pending',
                nexus_match_decided_by: ctx.userId,
                nexus_match_decided_at: new Date().toISOString(),
                nexus_match_reason: reason,
            })
            .eq('id', input.contractorId)
            .eq('nexus_match_status', 'linked')
            .select('id')
        if (error) throw new Error(`Nie udało się odpiąć powiązania: ${error.message}`)
        if (!data || data.length === 0) {
            throw new ExpectedError('Powiązanie zmieniło się w międzyczasie — odśwież widok.')
        }

        await logAudit(ctx.userId, 'CONTRACTOR_NEXUS_UNLINKED', {
            contractor_id: input.contractorId,
            previous_nexus_candidate_id: row.nexus_candidate_id,
            previous_nexus_contract_id: row.nexus_contract_id,
            reason,
        })
        revalidatePath(HUB)
    })
}

/**
 * „Tej osoby nie ma w NEXUSIE" — świadome zamknięcie wiersza z powodem.
 *
 * Tylko ten stan jest chroniony przed automatem. „Automat nikogo nie znalazł"
 * (`auto_not_found`) to co innego i jest oceniany od nowa przy każdym biegu.
 */
export async function dismissNexusMatch(input: {
    contractorId: string
    reason: string
}): Promise<ActionResult<void>> {
    return runAction('dismissNexusMatch', async () => {
        const ctx = await requireLifecycleManagerAction()
        if (!input.contractorId) throw new ExpectedError('Brak kontraktora.')
        const reason = (input.reason ?? '').trim()
        if (reason.length < REASON_MIN) {
            throw new ExpectedError('Podaj powód odrzucenia (np. „kontraktor sprzed wdrożenia NEXUSA").')
        }
        if (reason.length > REASON_MAX) {
            throw new ExpectedError(`Powód jest za długi (max ${REASON_MAX} znaków).`)
        }

        const admin = createServiceClient()
        const before = await admin
            .from('contractors')
            .select('id, nexus_match_status')
            .eq('id', input.contractorId)
            .maybeSingle()
        if (before.error) throw new Error(`Odczyt kontraktora nie powiódł się: ${before.error.message}`)
        const row = before.data as { id: string; nexus_match_status: string | null } | null
        if (!row) throw new ExpectedError('Nie znaleziono kontraktora.')
        if (row.nexus_match_status === 'linked') {
            throw new ExpectedError('Kontraktor jest powiązany z NEXUSEM — najpierw odepnij powiązanie.')
        }

        const { data, error } = await admin
            .from('contractors')
            .update({
                nexus_contract_id: null,
                nexus_candidate_id: null,
                nexus_match_status: 'dismissed',
                nexus_match_decided_by: ctx.userId,
                nexus_match_decided_at: new Date().toISOString(),
                nexus_match_reason: reason,
            })
            .eq('id', input.contractorId)
            .neq('nexus_match_status', 'linked')
            .select('id')
        if (error) throw new Error(`Nie udało się zamknąć wiersza: ${error.message}`)
        if (!data || data.length === 0) {
            throw new ExpectedError('Wiersz zmienił się w międzyczasie — odśwież widok.')
        }

        await logAudit(ctx.userId, 'CONTRACTOR_NEXUS_DISMISSED', {
            contractor_id: input.contractorId,
            previous_status: row.nexus_match_status,
            reason,
        })
        revalidatePath(HUB)
    })
}

/** Cofnięcie ręcznego odrzucenia — wiersz wraca do kolejki (`pending`). */
export async function reopenNexusMatch(input: {
    contractorId: string
}): Promise<ActionResult<void>> {
    return runAction('reopenNexusMatch', async () => {
        const ctx = await requireLifecycleManagerAction()
        if (!input.contractorId) throw new ExpectedError('Brak kontraktora.')

        const admin = createServiceClient()
        const { data, error } = await admin
            .from('contractors')
            .update({
                nexus_match_status: 'pending',
                nexus_match_decided_by: ctx.userId,
                nexus_match_decided_at: new Date().toISOString(),
                nexus_match_reason: null,
            })
            .eq('id', input.contractorId)
            .eq('nexus_match_status', 'dismissed')
            .select('id')
        if (error) throw new Error(`Nie udało się otworzyć wiersza: ${error.message}`)
        if (!data || data.length === 0) {
            throw new ExpectedError('Ten wiersz nie jest odrzucony — odśwież widok.')
        }

        await logAudit(ctx.userId, 'CONTRACTOR_NEXUS_REOPENED', { contractor_id: input.contractorId })
        revalidatePath(HUB)
    })
}

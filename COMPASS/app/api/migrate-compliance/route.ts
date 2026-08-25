import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CURRENT_TERMS_VERSION } from '@/lib/constants/compliance'
import { documentTypeForSlug } from '@/lib/constants/legal-documents'

// ════════════════════════════════════════════════════════════════════════════
// Seed dokumentów prawnych do `um_legal_documents`.
//
// Audyt 2026-08 (C5) — co tu było zepsute i dlaczego trasa wyglądała na sprawną:
//
//  1. UPSERT PO NIEISTNIEJĄCEJ KOLUMNIE. Zapis szedł po `slug` + `content_html`
//     + `visibility` + `requires_acceptance`, a produkcja ma `document_type` +
//     `content` + `effective_date` z UNIQUE(document_type, version). PostgREST
//     odbijał to błędem 42703, ale trasa zapisywała go tylko w `results[]`
//     i kończyła `{ success: true }`. Seed był „zielony" i nie wgrywał nic.
//  2. DDL W RUNTIME. Pierwszym krokiem było `rpc('exec_sql', …)` z kluczem
//     service-role, czyli wykonanie dowolnego SQL-a spoza migracji. Funkcja
//     `exec_sql` na produkcji NIE ISTNIEJE (sprawdzone w `pg_proc`), więc krok
//     był martwy — a jednocześnie był najgroźniejszą ścieżką w całym pliku.
//     Schemat należy do `supabase/migrations/`, nie do trasy HTTP.
//
// Zasada zapisu: WSTAW BRAKUJĄCE, NIGDY NIE NADPISUJ. Na produkcji leżą wersje
// `privacy_policy` i `terms_of_service` dłuższe i z inną (aktualną) identyfikacją
// spółki niż zaszyte niżej. Upsert nadpisujący zamieniłby dokument obowiązujący
// użytkowników na krótszy stub — dlatego `ignoreDuplicates`.
//
// Osiem pozostałych dokumentów (`help`, `security`, `ai-notice`, `cooperation`,
// `electronic-signature`, `access-management`, `incident-response`,
// `data-retention`) CHECK na `document_type` odrzuca, więc ich treść nie jest tu
// duplikowana — żyje w `lib/constants/fallback-docs.ts`, skąd serwuje ją
// `getLegalDocument()`. Żeby trafiły do bazy, trzeba najpierw ŚWIADOMIE poszerzyć
// CHECK migracją.
// ════════════════════════════════════════════════════════════════════════════

interface SeedDocument {
    slug: string
    title: string
    content_html: string
}

const SEED_DOCUMENTS: SeedDocument[] = [
    {
        slug: 'privacy-policy',
        title: 'Polityka Prywatności (RODO)',
        content_html: '<h1>Polityka Prywatności</h1><p><strong>Administrator danych:</strong> B2B.net S.A., Aleje Jerozolimskie 180, 02-485 Warszawa, KRS: 0000387063</p><h2>1. Cele przetwarzania danych</h2><p>Dane osobowe przetwarzamy w celu: świadczenia usług platformy COMPASS (art. 6 ust. 1 lit. b RODO), realizacji obowiązków prawnych (art. 6 ust. 1 lit. c RODO), prawnie uzasadnionych interesów administratora (art. 6 ust. 1 lit. f RODO).</p><h2>2. Zakres danych</h2><p>Przetwarzamy: imię i nazwisko, adres e-mail, numer telefonu, dane zawodowe (CV, kompetencje, doświadczenie), dane dotyczące umów B2B, adres IP i dane techniczne sesji.</p><h2>3. Prawa podmiotów danych</h2><p>Przysługuje Ci prawo do: dostępu do danych, sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych, sprzeciwu, cofnięcia zgody.</p><h2>4. Okres retencji</h2><p>Dane przechowujemy przez okres obowiązywania umowy + 5 lat. Logi systemowe: 12 miesięcy. Dane rekrutacyjne: 24 miesiące.</p><h2>5. IOD</h2><p>Kontakt: iod@b2bnetwork.pl</p>',
    },
    {
        slug: 'terms',
        title: 'Regulamin Platformy COMPASS',
        content_html: '<h1>Regulamin Platformy COMPASS</h1><h2>§1. Definicje</h2><p><strong>Platforma</strong> — aplikacja webowa COMPASS. <strong>Operator</strong> — B2B.net S.A. <strong>Konsultant</strong> — osoba współpracująca na podstawie umowy B2B.</p><h2>§2. Rejestracja</h2><p>Wymaga: adresu @b2bnetwork.pl, akceptacji Regulaminu i Polityki Prywatności, zgody RODO.</p><h2>§3. Role</h2><p>Konsultant, Centrala, Administrator — z odpowiednimi uprawnieniami.</p><h2>§4. Zasady</h2><p>Użytkownik podaje prawdziwe dane, nie udostępnia loginu osobom trzecim, informuje o naruszeniach.</p><h2>§5. SLA</h2><p>Gwarantowana dostępność: 99.5%. Okno serwisowe: sobota 02:00-06:00 CET.</p><h2>§6. Odpowiedzialność</h2><p>Operator nie odpowiada za siłę wyższą ani treści użytkowników.</p><h2>§7. Zmiany</h2><p>Informacja z 14-dniowym wyprzedzeniem.</p>',
    },
]

export async function GET(request: Request) {
    // Security: refuse to run if CRON_SECRET is unconfigured. Without this guard,
    // an env-vault misconfiguration (CRON_SECRET removed but route still
    // deployed) would skip authentication entirely. This route writes with the
    // Supabase service-role key, so any auth gap = unauthenticated DB write.
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }
    // Prefer Authorization: Bearer <secret> header — query strings end up in CF
    // / proxy / Sentry trace logs, leaking the secret. Fall back to ?secret= for
    // legacy callers but log a deprecation warning to drive migration.
    const headerSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const querySecret = new URL(request.url).searchParams.get('secret')
    const provided = headerSecret || querySecret
    if (!provided || provided !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!headerSecret && querySecret) {
        logCompat.warn('[migrate-compliance] secret in query param — migrate caller to Authorization: Bearer header (query strings appear in proxy/Sentry/CF logs)')
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRole) {
        return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceRole, {
        auth: { persistSession: false },
    })

    // Tabela powstaje migracją, nie tą trasą. Brak tabeli to błąd konfiguracji
    // środowiska i ma być widoczny statusem, a nie polem w JSON-ie.
    const { error: probeError } = await supabase.from('um_legal_documents').select('id').limit(1)
    if (probeError) {
        return NextResponse.json(
            {
                error: 'Tabela um_legal_documents niedostępna — zastosuj migracje przed seedem.',
                detail: probeError.message,
            },
            { status: 503 },
        )
    }

    const skipped = SEED_DOCUMENTS.filter(d => documentTypeForSlug(d.slug) === null).map(d => d.slug)

    const rows = SEED_DOCUMENTS.flatMap(doc => {
        const documentType = documentTypeForSlug(doc.slug)
        if (!documentType) return []
        return [{
            document_type: documentType,
            title: doc.title,
            content: doc.content_html,
            version: CURRENT_TERMS_VERSION,
            // NOT NULL bez wartości domyślnej. Data wgrania jest jedyną datą,
            // którą kod uczciwie zna — dat obowiązywania nie zgadujemy.
            effective_date: new Date().toISOString().slice(0, 10),
            is_active: true,
        }]
    })

    const { data: inserted, error: seedError } = await supabase
        .from('um_legal_documents')
        .upsert(rows, { onConflict: 'document_type,version', ignoreDuplicates: true })
        .select('document_type')

    if (seedError) {
        logCompat.error('[migrate-compliance] seed failed:', seedError)
        return NextResponse.json({ error: 'Seed nie powiódł się.', detail: seedError.message }, { status: 500 })
    }

    const { data: allDocs } = await supabase
        .from('um_legal_documents')
        .select('document_type, version, is_active')

    return NextResponse.json({
        success: true,
        // Puste `inserted` na produkcji jest OCZEKIWANE: dokumenty już tam są,
        // a trasa ich świadomie nie nadpisuje.
        inserted: (inserted ?? []).map(d => d.document_type),
        skippedByCheckConstraint: skipped,
        documentsInDb: allDocs?.length ?? 0,
    })
}

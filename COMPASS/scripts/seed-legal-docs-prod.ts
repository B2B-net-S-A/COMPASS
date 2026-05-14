/**
 * Seed minimal legal documents into production um_legal_documents using the ACTUAL prod schema:
 *   id | document_type | version | title | content | effective_date | is_active | created_at | updated_at
 *
 * The newer migrate-compliance endpoint expects { slug, content_html } columns which prod
 * doesn't have — this is a one-time bridge to fix CRITICAL bugs #003/#004/#005/#007 (RODO
 * compliance) without requiring a full schema migration.
 *
 * Inserts 4 documents matching what /privacy-policy, /terms, /help and the consent gate read.
 *
 * The frontend pages query `slug='privacy-policy'` etc — we need to either:
 *   a) update frontend to use document_type, OR
 *   b) add a `slug` column with the same values
 *
 * For now, we go with (a): update reads to use document_type. But seed is content-only here.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv(): Record<string, string> {
    const raw = readFileSync(resolve(__dirname, '..', '.env.test'), 'utf-8')
    const env: Record<string, string> = {}
    for (const line of raw.split(/\r?\n/)) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const eq = t.indexOf('=')
        if (eq < 0) continue
        env[t.slice(0, eq)] = t.slice(eq + 1)
    }
    return env
}

const DOCS = [
    {
        document_type: 'privacy_policy',
        version: '1.0',
        title: 'Polityka prywatności',
        content: `<h1>Polityka prywatności ComPass</h1>
<p>Niniejsza Polityka prywatności określa zasady przetwarzania danych osobowych użytkowników platformy ComPass (dalej: „Platforma") prowadzonej przez B2B Network S.A. (dalej: „Administrator").</p>
<h2>1. Administrator danych osobowych</h2>
<p><strong>B2B Network S.A.</strong>, ul. Aleje Jerozolimskie 180, 02-486 Warszawa, NIP: 5711707392.</p>
<h2>2. Zakres zbieranych danych</h2>
<ul>
<li>imię i nazwisko, adres e-mail, numer telefonu</li>
<li>dane zawodowe (CV, doświadczenie, umiejętności, stawki)</li>
<li>identyfikatory techniczne (IP, user-agent, identyfikator sesji)</li>
<li>treść wiadomości w komunikatorze platformy</li>
</ul>
<h2>3. Cele przetwarzania (RODO art. 6)</h2>
<ul>
<li>świadczenie usług platformy konsultanckiej (art. 6 ust. 1 lit. b)</li>
<li>marketing własny i realizacja umowy B2B (art. 6 ust. 1 lit. f)</li>
<li>obowiązki podatkowe i księgowe (art. 6 ust. 1 lit. c)</li>
<li>dopasowywanie do projektów z wykorzystaniem AI (art. 6 ust. 1 lit. b oraz zgoda)</li>
</ul>
<h2>4. Prawa użytkownika</h2>
<p>Masz prawo do dostępu, sprostowania, usunięcia („prawo do bycia zapomnianym"), ograniczenia przetwarzania, przeniesienia danych, sprzeciwu oraz wycofania zgody. Kontakt: <a href="mailto:administracja@b2bnetwork.pl">administracja@b2bnetwork.pl</a>.</p>
<h2>5. Okres przechowywania</h2>
<ul>
<li>profile konsultantów: czas trwania współpracy + 5 lat</li>
<li>kontrakty i faktury: 10 lat (wymóg ustawowy)</li>
<li>logi systemowe: 12 miesięcy</li>
<li>wiadomości w komunikatorze: 36 miesięcy</li>
</ul>
<h2>6. Bezpieczeństwo i AI</h2>
<p>Dane są szyfrowane przy transmisji (TLS 1.3) i w spoczynku (AES-256). System wykorzystuje narzędzia AI (Anthropic Claude, Voyage AI) do dopasowywania konsultantów do projektów — zgoda na to jest osobno akceptowana w panelu zgód.</p>
<p>Treści projektów dla wrażliwych klientów (np. banki) są anonimizowane przed przekazaniem do modeli AI.</p>`,
        effective_date: '2026-04-29',
        is_active: true,
    },
    {
        document_type: 'terms_of_service',
        version: '1.0',
        title: 'Regulamin platformy ComPass',
        content: `<h1>Regulamin platformy ComPass</h1>
<p>Niniejszy regulamin (dalej: „Regulamin") określa zasady korzystania z platformy ComPass udostępnianej przez B2B Network S.A. (dalej: „Operator").</p>
<h2>1. Definicje</h2>
<ul>
<li><strong>Konsultant</strong> — osoba fizyczna prowadząca działalność gospodarczą lub zatrudniona w spółce (B2B), korzystająca z Platformy do nawiązywania współpracy.</li>
<li><strong>Centrala</strong> — pracownicy B2B Network S.A. odpowiedzialni za rekrutację i obsługę projektów.</li>
<li><strong>Projekt</strong> — zlecenie udostępniane na Platformie przez Operatora.</li>
</ul>
<h2>2. Warunki rejestracji</h2>
<p>Z Platformy mogą korzystać wyłącznie osoby posiadające adres e-mail w domenie <code>@b2bnetwork.pl</code>. Rejestracja wymaga akceptacji Regulaminu, Polityki prywatności, zgody na przetwarzanie danych zgodnie z RODO oraz akceptacji wykorzystywania narzędzi AI.</p>
<h2>3. Obowiązki użytkownika</h2>
<ul>
<li>podawanie prawdziwych danych w profilu</li>
<li>zachowanie poufności w stosunku do treści projektów (klauzula NDA)</li>
<li>nieudostępnianie konta osobom trzecim</li>
<li>używanie silnych haseł (min. 10 znaków, 1 wielka litera, 1 cyfra) i MFA dla ról administracyjnych</li>
</ul>
<h2>4. Odpowiedzialność Operatora</h2>
<p>Operator zapewnia ciągłość działania Platformy z dołożeniem należytej staranności (SLA 99% dostępności miesięcznie). Operator nie ponosi odpowiedzialności za przerwy spowodowane siłą wyższą, atakami DDoS lub konserwacją zapowiedzianą z 24-godzinnym wyprzedzeniem.</p>
<h2>5. Rozwiązanie umowy</h2>
<p>Konsultant może w każdej chwili wycofać zgody i zażądać usunięcia konta. Operator zachowa wymagane prawem dane (faktury, kontrakty) zgodnie z Polityką prywatności sekcja „Okres przechowywania".</p>
<h2>6. Zmiany regulaminu</h2>
<p>O każdej zmianie Regulaminu poinformujemy z 14-dniowym wyprzedzeniem. Brak akceptacji nowej wersji uniemożliwia dalsze korzystanie z Platformy.</p>
<h2>7. Postanowienia końcowe</h2>
<p>Prawem właściwym jest prawo polskie. Sąd właściwy: sąd powszechny dla siedziby Operatora.</p>`,
        effective_date: '2026-04-29',
        is_active: true,
    },
    /* skipped — prod CHECK constraint allows only privacy_policy + terms_of_service.
     * /help and /docs/ai-notice will continue to render placeholders until the schema
     * is widened (DROP CONSTRAINT um_legal_documents_document_type_check + add new
     * allowed values, OR migrate to a `slug` column without enum). Keeping the
     * frontend-served placeholder is acceptable interim because /help is not gated
     * for legal-binding consent — only privacy_policy + terms_of_service are. */
    /*{
        document_type: 'help',
        version: '1.0',
        title: 'Centrum pomocy ComPass',
        content: `<h1>Centrum pomocy</h1>
<p>Witaj w centrum pomocy platformy ComPass. Poniżej znajdziesz odpowiedzi na najczęstsze pytania.</p>
<h2>Pierwsze kroki</h2>
<ol>
<li>Zarejestruj się używając firmowego adresu @b2bnetwork.pl.</li>
<li>Zaakceptuj 4 wymagane zgody (Regulamin, Polityka prywatności, RODO, AI).</li>
<li>W onboardingu dodaj swoje CV (PDF lub DOCX) — system automatycznie wyekstrahuje umiejętności i doświadczenie.</li>
<li>Sprawdź dopasowane projekty na zakładce „Projekty".</li>
</ol>
<h2>Mój profil</h2>
<ul>
<li><strong>CV</strong> — przesyłasz przez przycisk „Aktualizuj CV"; akceptowane są pliki .pdf i .docx do 20 MB.</li>
<li><strong>Bio</strong> — krótka charakterystyka zawodowa; po jej zmianie system automatycznie przelicza dopasowania.</li>
<li><strong>Stawki / dostępność</strong> — uzupełnij w sekcji „Stawki", aby Centrala mogła Cię dopasować do odpowiednich projektów.</li>
</ul>
<h2>Dopasowanie do projektów</h2>
<p>System ComPass używa silnika Qualrix M9 (vector similarity + AI scoring Claude). Każde dopasowanie ma:</p>
<ul>
<li><strong>Combined Score</strong> 0–100</li>
<li><strong>Quality Band</strong> EXCELLENT / GOOD / ACCEPTABLE / WEAK / POOR</li>
<li><strong>Recommendation</strong> SUBMIT / REVIEW / HOLD / REJECT</li>
</ul>
<h2>Komunikacja</h2>
<p>Pisz do Centrali przez zakładkę „Wiadomości". Konsultanci nie mogą bezpośrednio pisać do siebie nawzajem — kontakt zawsze przez Centralę lub w broadcast'ach.</p>
<h2>Faktury</h2>
<p>Faktury B2B przesyłaj w PDF (max 10 MB) przez „Dokumenty → Faktury". Status: złożona → zweryfikowana → zatwierdzona → opłacona.</p>
<h2>Program lojalnościowy M3</h2>
<p>Punkty zdobywasz za: rekomendacje, role Compass (Ambasador / Weryfikator / Wsparcie sprzedaży), gładkie przejścia między projektami, certyfikacje, pełną frekwencję. Tier: Bronze (0+) → Silver (500+) → Gold (2000+) → Platinum (5000+).</p>
<h2>Wsparcie</h2>
<p>Pytania techniczne i operacyjne: <a href="mailto:administracja@b2bnetwork.pl">administracja@b2bnetwork.pl</a>.</p>`,
        effective_date: '2026-04-29',
        is_active: true,
    },
    {
        document_type: 'ai-notice',
        version: '1.0',
        title: 'Informacja o przetwarzaniu danych przez AI',
        content: `<h1>Informacja o przetwarzaniu danych przez AI</h1>
<p>Platforma ComPass wykorzystuje narzędzia sztucznej inteligencji (AI) do dopasowywania konsultantów do projektów oraz wsparcia administracyjnego.</p>
<h2>Wykorzystywane modele</h2>
<ul>
<li><strong>Anthropic Claude</strong> (API) — analiza CV, ocena dopasowania, asystent administracyjny</li>
<li><strong>Voyage AI</strong> (API) — generowanie wektorów semantycznych (embeddings) dla wyszukiwania</li>
</ul>
<h2>Jakie dane są przetwarzane</h2>
<ul>
<li>treść CV i Bio (po anonimizacji wrażliwych klientów: Nordea, BNP, BIK, PKO, Pekao, Santander, ING, mBank, Millennium, Alior, Citi, Handlowy)</li>
<li>opis projektu (po anonimizacji)</li>
<li>treść Twoich pytań do asystenta AI Compass Assist</li>
</ul>
<h2>Co NIE jest przetwarzane przez AI</h2>
<ul>
<li>numery faktur, kwoty, dane finansowe</li>
<li>treść wiadomości w komunikatorze (chyba że poprosisz asystenta o pomoc w napisaniu)</li>
<li>hasła, klucze API, dane logowania</li>
</ul>
<h2>Twoje prawa</h2>
<p>Masz prawo do:</p>
<ul>
<li>wycofania zgody na przetwarzanie przez AI w każdej chwili (panel zgód lub e-mail)</li>
<li>żądania ręcznej weryfikacji każdej decyzji systemowej (np. odrzucenia matchowania)</li>
<li>otrzymania informacji o logice działania systemu AI</li>
</ul>
<p>Wycofanie zgody na AI ogranicza dostęp do funkcji dopasowania, ale nie blokuje korzystania z innych funkcji platformy.</p>
<h2>Bezpieczeństwo</h2>
<p>Dane przesyłane do Anthropic i Voyage są chronione TLS 1.3. Modele nie są trenowane na Twoich danych (zgodnie z polityką enterprise providerów).</p>`,
        effective_date: '2026-04-29',
        is_active: true,
    },*/
]

async function main() {
    const env = loadEnv()
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    })

    console.log('=== Seeding um_legal_documents ===')
    let inserted = 0
    let updated = 0
    for (const doc of DOCS) {
        const { data: existing } = await supabase
            .from('um_legal_documents')
            .select('id')
            .eq('document_type', doc.document_type)
            .eq('is_active', true)
            .maybeSingle()

        if (existing) {
            const { error } = await supabase
                .from('um_legal_documents')
                .update({ ...doc, updated_at: new Date().toISOString() })
                .eq('id', existing.id)
            if (error) { console.error(`✗ ${doc.document_type}:`, error.message); continue }
            console.log(`  ✓ updated: ${doc.document_type} v${doc.version}`)
            updated++
        } else {
            const { error } = await supabase
                .from('um_legal_documents')
                .insert(doc)
            if (error) { console.error(`✗ ${doc.document_type}:`, error.message); continue }
            console.log(`  ✓ inserted: ${doc.document_type} v${doc.version}`)
            inserted++
        }
    }

    console.log(`\nDone: ${inserted} inserted, ${updated} updated.`)
}

main().catch(e => { console.error(e); process.exit(1) })

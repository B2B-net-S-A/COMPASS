/**
 * Fallback content for legal/help documents.
 *
 * Used when the prod DB schema (`um_legal_documents` with CHECK constraint
 * limiting `document_type` to `privacy_policy` + `terms_of_service`) does not
 * yet contain the requested doc. Schema widening requires direct DDL
 * (`DROP CONSTRAINT um_legal_documents_document_type_check` + new constraint
 * with widened enum), which Supabase REST API does not support — must be run
 * once via Supabase Dashboard → SQL Editor.
 *
 * Until that DDL runs, every page that needs `help`, `ai-notice`, etc. falls
 * back to the content here. After the DDL runs and the rows are seeded, the
 * DB content takes precedence and these constants become dead code (still
 * harmless).
 */

export interface FallbackDoc {
    title: string
    version: string
    content_html: string
}

export const FALLBACK_DOCS: Record<string, FallbackDoc> = {
    'help': {
        title: 'Centrum pomocy',
        version: '1.0',
        content_html: `<h1>Centrum pomocy</h1>
<p>Witaj w centrum pomocy platformy COMPASS. Poniżej znajdziesz odpowiedzi na najczęstsze pytania.</p>
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
<p>System COMPASS używa silnika Qualrix M9 (vector similarity + AI scoring Claude). Każde dopasowanie ma:</p>
<ul>
<li><strong>Combined Score</strong> 0–100</li>
<li><strong>Quality Band</strong> EXCELLENT / GOOD / ACCEPTABLE / WEAK / POOR</li>
<li><strong>Recommendation</strong> SUBMIT / REVIEW / HOLD / REJECT</li>
</ul>
<h2>Komunikacja</h2>
<p>W sprawach bieżących pisz na <strong>administracja@b2bnetwork.pl</strong> albo złóż zgłoszenie w Support Center. Konsultanci nie kontaktują się bezpośrednio między sobą — zawsze przez Centralę.</p>
<h2>Faktury</h2>
<p>Faktury B2B przesyłaj w PDF (max 10 MB) przez „Dokumenty → Faktury". Status: złożona → zweryfikowana → zatwierdzona → opłacona.</p>
<h2>Program lojalnościowy M3</h2>
<p>Punkty zdobywasz za: rekomendacje, role Compass (Ambasador / Weryfikator / Wsparcie sprzedaży), gładkie przejścia między projektami, certyfikacje, pełną frekwencję. Tier: Bronze (0+) → Silver (500+) → Gold (2000+) → Platinum (5000+).</p>
<h2>Wsparcie</h2>
<p>Pytania techniczne i operacyjne: <a href="mailto:administracja@b2bnetwork.pl">administracja@b2bnetwork.pl</a>.</p>`,
    },

    'ai-notice': {
        title: 'Informacja o przetwarzaniu danych przez AI',
        version: '1.0',
        content_html: `<h1>Informacja o przetwarzaniu danych przez AI</h1>
<p>Platforma COMPASS wykorzystuje narzędzia sztucznej inteligencji (AI) do dopasowywania konsultantów do projektów oraz wsparcia administracyjnego.</p>
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
    },

    'security': {
        title: 'Polityka bezpieczeństwa',
        version: '1.0',
        content_html: `<h1>Polityka bezpieczeństwa COMPASS</h1>
<h2>Szyfrowanie</h2>
<ul>
<li>Wszystkie połączenia: TLS 1.3</li>
<li>Dane w spoczynku: AES-256 (Supabase encryption at rest)</li>
<li>Hasła: bcrypt z saltem</li>
</ul>
<h2>Uwierzytelnianie</h2>
<ul>
<li>Hasła min. 10 znaków, 1 wielka litera, 1 cyfra</li>
<li>MFA (TOTP email) wymagane dla ról administracyjnych (admin, centrala, administrator)</li>
<li>Ograniczenie domeny: tylko @b2bnetwork.pl</li>
<li>Rate limiting: 5 nieudanych logowań / 15 min na adres email</li>
</ul>
<h2>Autoryzacja</h2>
<p>Row-Level Security (RLS) na poziomie PostgreSQL na wszystkich wrażliwych tabelach: profiles, candidates, conversations, messages, documents, invoices, loyalty_*, match_results.</p>
<h2>Audyt</h2>
<p>Wszystkie istotne akcje logowane do <code>audit_logs</code>: LOGIN, LOGIN_FAILED, ROLE_CHANGE, BLOCK_USER, DELETE_USER, MFA_VERIFY.</p>
<h2>Zgłaszanie incydentów</h2>
<p>Naruszenia bezpieczeństwa zgłaszaj na: <a href="mailto:administracja@b2bnetwork.pl">administracja@b2bnetwork.pl</a>. Czas odpowiedzi do 24h.</p>`,
    },

    'cooperation': {
        title: 'Zasady współpracy',
        version: '1.0',
        content_html: `<h1>Zasady współpracy B2B Network ↔ Konsultant</h1>
<h2>Forma współpracy</h2>
<p>Współpraca prowadzona jest w modelu B2B (umowa o świadczenie usług między dwoma podmiotami gospodarczymi). Konsultant jest niezależnym podwykonawcą, nie pracownikiem.</p>
<h2>Stawki i rozliczenia</h2>
<ul>
<li>Stawki ustalane indywidualnie per projekt (PLN/h lub PLN/dzień, netto)</li>
<li>Rozliczenie miesięczne na podstawie faktury VAT przesłanej przez Konsultanta</li>
<li>Termin płatności: 14 dni od daty wystawienia faktury</li>
<li>Faktury przesyłane przez Platformę COMPASS (zakładka Dokumenty → Faktury)</li>
</ul>
<h2>Poufność (NDA)</h2>
<p>Konsultant zobowiązuje się do zachowania poufności w stosunku do treści projektów, danych Klienta i wewnętrznych procesów B2B Network. Naruszenie NDA podlega karze umownej zgodnie z umową współpracy.</p>
<h2>Własność intelektualna</h2>
<p>Wyniki pracy Konsultanta na rzecz Klienta są przekazywane Klientowi zgodnie z warunkami umowy ramowej B2B Network ↔ Klient. Konsultant zachowuje prawa do narzędzi, frameworków i bibliotek własnych użytych podczas realizacji.</p>
<h2>Rozwiązanie współpracy</h2>
<p>Każda ze stron może rozwiązać współpracę z 30-dniowym okresem wypowiedzenia. W przypadku poważnego naruszenia umowy — natychmiastowo.</p>`,
    },

    'electronic-signature': {
        title: 'Podpis elektroniczny',
        version: '1.0',
        content_html: `<h1>Polityka podpisu elektronicznego</h1>
<p>Platforma COMPASS umożliwia elektroniczne podpisywanie dokumentów (umowy, aneksy, NDA) zgodnie z eIDAS i Kodeksem cywilnym RP.</p>
<h2>Forma podpisu</h2>
<p>Stosujemy <strong>podpis elektroniczny zwykły</strong> — kliknięcie przycisku „Podpisz dokument" rejestrowane wraz z:</p>
<ul>
<li>identyfikatorem użytkownika (UUID)</li>
<li>adresem IP i User-Agent</li>
<li>datą i godziną z dokładnością do milisekund</li>
<li>hash SHA-256 podpisanego dokumentu</li>
</ul>
<h2>Skuteczność prawna</h2>
<p>Zgodnie z art. 781 § 2 KC oświadczenie woli złożone w postaci elektronicznej jest równoważne z oświadczeniem na piśmie, jeśli zostało utrwalone w sposób umożliwiający odtworzenie i autoryzację składającego.</p>
<h2>Audyt</h2>
<p>Każdy podpis można zweryfikować w panelu „Dokumenty → Historia podpisów".</p>`,
    },

    'access-management': {
        title: 'Zarządzanie dostępem (admin)',
        version: '1.0',
        content_html: `<h1>Zarządzanie dostępem</h1>
<h2>Role w systemie</h2>
<ul>
<li><strong>consultant</strong> — domyślna rola, dostęp do własnych danych, projektów, lojalności</li>
<li><strong>centrala</strong> — pracownik B2B Network, podgrupa: recruiter / delivery_lead / finance</li>
<li><strong>admin</strong> — pełny dostęp operacyjny (kandydaci, projekty, import)</li>
<li><strong>administrator</strong> — admin + zarządzanie uprawnieniami i kontami administratorów (Super Admin)</li>
</ul>
<h2>Macierz uprawnień (RBAC)</h2>
<p>Konfigurowana w <code>/admin/settings/permissions</code>. Każda rola × każda funkcja = jedna z wartości: true / false / portfolio / full / readonly.</p>
<h2>Lifecycle konta</h2>
<ol>
<li>Signup → automatycznie rola consultant</li>
<li>Promocja do centrala/admin: przez admin/administrator z panelu /admin/settings/team</li>
<li>Promocja do administrator: tylko Super Admin (email w SUPER_ADMIN_EMAILS env) — przez /admin/settings/admins</li>
<li>Blokada/usunięcie: admin może zablokować konto; Super Admin może je usunąć</li>
</ol>`,
    },

    'incident-response': {
        title: 'Procedura reakcji na incydent',
        version: '1.0',
        content_html: `<h1>Procedura reakcji na incydent</h1>
<h2>Klasyfikacja</h2>
<ul>
<li><strong>P1 (Critical)</strong> — pełna niedostępność, utrata danych, naruszenie bezpieczeństwa. SLA odpowiedzi: 1h.</li>
<li><strong>P2 (High)</strong> — częściowa niedostępność, krytyczny bug. SLA: 4h.</li>
<li><strong>P3 (Medium)</strong> — bug nieblokujący. SLA: 24h (dni robocze).</li>
<li><strong>P4 (Low)</strong> — kosmetyka. SLA: 5 dni roboczych.</li>
</ul>
<h2>Naruszenie bezpieczeństwa danych (RODO art. 33-34)</h2>
<ol>
<li>Wykrycie → zgłoszenie do <a href="mailto:administracja@b2bnetwork.pl">administracja@b2bnetwork.pl</a> w ciągu 1h</li>
<li>Klasyfikacja przez DPO w ciągu 4h</li>
<li>Jeśli wpływa na dane osobowe i ryzyko jest wysokie: zgłoszenie do UODO w ciągu 72h</li>
<li>Powiadomienie poszkodowanych użytkowników (jeśli wymagane)</li>
<li>Post-mortem w ciągu 7 dni roboczych — opublikowany w panelu</li>
</ol>`,
    },

    'data-retention': {
        title: 'Polityka retencji danych',
        version: '1.0',
        content_html: `<h1>Polityka retencji danych</h1>
<table>
<tr><th>Kategoria</th><th>Okres przechowywania</th><th>Podstawa prawna</th></tr>
<tr><td>Profile konsultantów (active)</td><td>Czas trwania współpracy + 5 lat</td><td>Art. 6 ust. 1 lit. b RODO</td></tr>
<tr><td>Kontrakty B2B</td><td>10 lat</td><td>Ustawa o rachunkowości art. 74</td></tr>
<tr><td>Faktury</td><td>5 lat</td><td>Ordynacja podatkowa art. 70 § 1</td></tr>
<tr><td>Logi systemowe</td><td>12 miesięcy</td><td>Art. 6 ust. 1 lit. f RODO</td></tr>
<tr><td>Dane rekrutacyjne (kandydaci)</td><td>24 miesiące od ostatniej aktywności</td><td>Zgoda kandydata</td></tr>
<tr><td>Wiadomości w komunikatorze</td><td>36 miesięcy</td><td>Art. 6 ust. 1 lit. b RODO</td></tr>
<tr><td>Audit logs</td><td>5 lat</td><td>Art. 6 ust. 1 lit. f RODO + wymóg ISO 27001</td></tr>
<tr><td>Zgody RODO (um_user_consents)</td><td>Bezterminowo (do żądania usunięcia)</td><td>Art. 7 ust. 1 RODO — dowód udzielenia zgody</td></tr>
</table>
<h2>Procedura usuwania</h2>
<p>Po upływie okresu retencji dane są <strong>permanentnie usuwane</strong> z baz danych przy najbliższym cron job (uruchamiany 1. dnia każdego miesiąca). Usunięcia nie da się cofnąć.</p>
<h2>Prawo do bycia zapomnianym (art. 17 RODO)</h2>
<p>Użytkownik może w każdej chwili zażądać usunięcia swoich danych przez panel ustawień konta lub e-mailem na <a href="mailto:administracja@b2bnetwork.pl">administracja@b2bnetwork.pl</a>. Wyjątek: dane wymagane prawem (faktury, kontrakty) — pozostają do końca ustawowego okresu.</p>`,
    },
}

export function getFallbackDoc(slug: string): FallbackDoc | null {
    return FALLBACK_DOCS[slug] || null
}

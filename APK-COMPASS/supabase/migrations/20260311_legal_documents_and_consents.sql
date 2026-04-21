-- ============================================================
-- Migration: Legal Documents & User Consents
-- Date: 2026-03-11
-- Purpose: Compliance infrastructure for ComPass platform
-- Tables: um_legal_documents, um_user_consents
-- ============================================================

-- 1. Legal documents table (stores all compliance documents as HTML)
CREATE TABLE IF NOT EXISTS um_legal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    content_html TEXT NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    requires_acceptance BOOLEAN NOT NULL DEFAULT FALSE,
    -- visibility: 'public' (no auth needed) | 'authenticated' (logged in) | 'admin' (admin only)
    visibility VARCHAR(20) NOT NULL DEFAULT 'authenticated'
        CHECK (visibility IN ('public', 'authenticated', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. User consents table (tracks acceptance of legal documents)
CREATE TABLE IF NOT EXISTS um_user_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    accepted_terms BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_privacy BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_data_processing BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_ai BOOLEAN NOT NULL DEFAULT FALSE,
    terms_version VARCHAR(20) NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_ip INET,
    accepted_ua TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_legal_documents_slug ON um_legal_documents(slug);
CREATE INDEX IF NOT EXISTS idx_legal_documents_active ON um_legal_documents(is_active);
CREATE INDEX IF NOT EXISTS idx_user_consents_user ON um_user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_version ON um_user_consents(terms_version);
CREATE INDEX IF NOT EXISTS idx_user_consents_user_version ON um_user_consents(user_id, terms_version);

-- 4. RLS Policies
ALTER TABLE um_legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE um_user_consents ENABLE ROW LEVEL SECURITY;

-- Legal documents: public docs visible to all, authenticated docs to logged-in users, admin docs to admins
CREATE POLICY "legal_docs_public_read" ON um_legal_documents
    FOR SELECT USING (visibility = 'public');

CREATE POLICY "legal_docs_authenticated_read" ON um_legal_documents
    FOR SELECT TO authenticated
    USING (visibility IN ('public', 'authenticated'));

CREATE POLICY "legal_docs_admin_read" ON um_legal_documents
    FOR SELECT TO authenticated
    USING (
        visibility = 'admin' AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator')
        )
    );

-- Admin can manage legal documents
CREATE POLICY "legal_docs_admin_manage" ON um_legal_documents
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator')
        )
    );

-- User consents: users see only their own
CREATE POLICY "user_consents_own_read" ON um_user_consents
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Users can insert their own consents
CREATE POLICY "user_consents_own_insert" ON um_user_consents
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Admin can read all consents (audit)
CREATE POLICY "user_consents_admin_read" ON um_user_consents
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'administrator')
        )
    );

-- 5. Seed: insert all 10 legal documents
INSERT INTO um_legal_documents (slug, title, content_html, version, is_active, requires_acceptance, visibility) VALUES

-- PUBLIC documents (visible on login page footer)
('privacy-policy', 'Polityka Prywatności (RODO)', '<h1>Polityka Prywatności</h1>
<p><strong>Administrator danych:</strong> B2B.net S.A., Aleje Jerozolimskie 180, 02-485 Warszawa, KRS: 0000387063</p>
<h2>1. Cele przetwarzania danych</h2>
<p>Dane osobowe przetwarzamy w celu:</p>
<ul>
<li>Świadczenia usług platformy ComPass (art. 6 ust. 1 lit. b RODO)</li>
<li>Realizacji obowiązków prawnych (art. 6 ust. 1 lit. c RODO)</li>
<li>Prawnie uzasadnionych interesów administratora (art. 6 ust. 1 lit. f RODO)</li>
</ul>
<h2>2. Zakres danych</h2>
<p>Przetwarzamy: imię i nazwisko, adres e-mail, numer telefonu, dane zawodowe (CV, kompetencje, doświadczenie), dane dotyczące umów B2B, adres IP i dane techniczne sesji.</p>
<h2>3. Prawa podmiotów danych</h2>
<p>Przysługuje Ci prawo do: dostępu do danych, sprostowania, usunięcia (prawo do bycia zapomnianym), ograniczenia przetwarzania, przenoszenia danych, sprzeciwu wobec przetwarzania, cofnięcia zgody w dowolnym momencie.</p>
<h2>4. Okres retencji</h2>
<p>Dane przechowujemy przez okres obowiązywania umowy + 5 lat (obowiązek podatkowy) lub do czasu wycofania zgody. Logi systemowe: 12 miesięcy. Dane rekrutacyjne: 24 miesiące od ostatniej aktywności.</p>
<h2>5. Inspektor Ochrony Danych</h2>
<p>Kontakt z IOD: <a href="mailto:iod@b2bnetwork.pl">iod@b2bnetwork.pl</a></p>
<h2>6. Odbiorcy danych</h2>
<p>Dane mogą być udostępniane: klientom końcowym (w zakresie niezbędnym do realizacji projektu), dostawcom usług IT (Supabase, Render), organom państwowym na podstawie przepisów prawa.</p>
<h2>7. Przekazywanie do państw trzecich</h2>
<p>Dane mogą być przekazywane do USA (Supabase Inc.) na podstawie standardowych klauzul umownych (SCC) zgodnych z decyzją Komisji Europejskiej.</p>', '1.0', TRUE, TRUE, 'public'),

('terms', 'Regulamin Platformy ComPass', '<h1>Regulamin Platformy ComPass</h1>
<p><strong>Wersja 1.0</strong> | Obowiązuje od: 11 marca 2026 r.</p>
<h2>§1. Definicje</h2>
<p><strong>Platforma</strong> — aplikacja webowa ComPass dostępna pod adresem compass.b2bnetwork.pl. <strong>Operator</strong> — B2B.net S.A. <strong>Konsultant</strong> — osoba fizyczna prowadząca działalność gospodarczą, współpracująca z Operatorem na podstawie umowy B2B. <strong>Centrala</strong> — pracownik/współpracownik Operatora z uprawnieniami zarządzania. <strong>Administrator</strong> — osoba z pełnymi uprawnieniami do zarządzania Platformą.</p>
<h2>§2. Rejestracja i dostęp</h2>
<p>Rejestracja wymaga: adresu e-mail w domenie @b2bnetwork.pl, akceptacji niniejszego Regulaminu, akceptacji Polityki Prywatności, wyrażenia zgody na przetwarzanie danych (RODO). Konto jest aktywowane po weryfikacji e-mail i ukończeniu procesu onboardingu.</p>
<h2>§3. Role i uprawnienia</h2>
<p>System definiuje trzy role: Konsultant (dostęp do własnych danych, umów, dokumentów), Centrala (zarządzanie konsultantami, projektami, umowami), Administrator (pełny dostęp, konfiguracja systemu, compliance).</p>
<h2>§4. Zasady korzystania</h2>
<p>Użytkownik zobowiązuje się do: podawania prawdziwych danych, nieudostępniania danych logowania osobom trzecim, niezwłocznego informowania o naruszeniu bezpieczeństwa konta, korzystania z Platformy zgodnie z jej przeznaczeniem.</p>
<h2>§5. Dostępność usługi (SLA)</h2>
<p>Operator dokłada starań, aby Platforma była dostępna 24/7, z wyłączeniem planowanych przerw serwisowych (okno serwisowe: sobota 02:00-06:00 CET). Gwarantowana dostępność: 99.5% w skali miesiąca.</p>
<h2>§6. Odpowiedzialność</h2>
<p>Operator nie ponosi odpowiedzialności za: przerwy spowodowane siłą wyższą, utratę danych wynikającą z działań Użytkownika, treści wprowadzone przez Użytkowników.</p>
<h2>§7. Zmiany regulaminu</h2>
<p>Operator zastrzega sobie prawo do zmiany Regulaminu. O zmianach Użytkownicy zostaną poinformowani z 14-dniowym wyprzedzeniem. Dalsze korzystanie z Platformy po zmianie oznacza akceptację nowych warunków.</p>', '1.0', TRUE, TRUE, 'public'),

('help', 'Centrum Pomocy ComPass', '<h1>Centrum Pomocy ComPass</h1>
<h2>Logowanie</h2>
<p><strong>Nie mogę się zalogować</strong> — Upewnij się, że używasz adresu e-mail w domenie @b2bnetwork.pl. Sprawdź poprawność hasła (min. 10 znaków, 1 duża litera, 1 cyfra). Po 5 nieudanych próbach konto zostaje zablokowane na 15 minut.</p>
<p><strong>Zapomniałem hasła</strong> — Kliknij "Nie pamiętasz hasła?" na stronie logowania. Link do resetowania zostanie wysłany na Twój e-mail.</p>
<h2>Umowy</h2>
<p><strong>Jak podpisać umowę?</strong> — Przejdź do zakładki "Dokumenty", wybierz umowę, przeczytaj warunki, zaznacz wymagane checkboxy i kliknij "Podpisz elektronicznie". Podpis jest rejestrowany z Twoim adresem IP, datą i informacją o przeglądarce.</p>
<h2>Profil</h2>
<p><strong>Jak zaktualizować CV?</strong> — Wejdź w "Ustawienia" → "Mój profil" → kliknij "Zaktualizuj CV". Akceptowane formaty: PDF (max 5 MB).</p>
<h2>Kontakt</h2>
<p>W razie pytań: <a href="mailto:support@b2bnetwork.pl">support@b2bnetwork.pl</a> lub skorzystaj z komunikatora wewnętrznego w Platformie.</p>', '1.0', TRUE, FALSE, 'public'),

-- AUTHENTICATED documents (visible to logged-in users)
('security', 'Polityka Bezpieczeństwa', '<h1>Polityka Bezpieczeństwa ComPass</h1>
<h2>1. Szyfrowanie</h2>
<p>Wszystkie dane przesyłane między przeglądarką a serwerem są szyfrowane protokołem TLS 1.3. Dane w bazie chronione są przez Row Level Security (RLS) — każdy użytkownik widzi wyłącznie swoje dane.</p>
<h2>2. Uwierzytelnianie</h2>
<p>System wymaga silnych haseł (min. 10 znaków). Dla ról administracyjnych wymagana jest weryfikacja dwuetapowa (MFA) z kodem wysyłanym na e-mail. Po 5 nieudanych próbach logowania konto jest blokowane na 15 minut.</p>
<h2>3. Backup i ciągłość</h2>
<p>Kopie zapasowe bazy danych wykonywane automatycznie co 24h. Point-in-time recovery (PITR) dostępne dla ostatnich 7 dni. Infrastruktura hostowana na Render.com + Supabase z gwarancją SLA.</p>
<h2>4. Klasyfikacja danych</h2>
<p>Dane dzielimy na: Publiczne (treści marketingowe), Wewnętrzne (dane operacyjne), Poufne (dane osobowe, warunki umów), Ściśle poufne (dane finansowe, stawki).</p>
<h2>5. Audyt</h2>
<p>Wszystkie logowania i operacje krytyczne są rejestrowane w tabeli login_attempts. Logi przechowywane przez 12 miesięcy.</p>', '1.0', TRUE, FALSE, 'authenticated'),

('cooperation', 'Warunki Współpracy z Konsultantami', '<h1>Warunki Współpracy</h1>
<h2>1. Zakres usług B2B.net</h2>
<p>B2B.net S.A. świadczy usługi pośrednictwa w zakresie zatrudnienia specjalistów IT na podstawie umów B2B. Platforma ComPass służy do zarządzania współpracą, dokumentacją i komunikacją.</p>
<h2>2. Obowiązki konsultanta</h2>
<p>Konsultant zobowiązuje się do: terminowego raportowania czasu pracy, utrzymywania aktualnych danych w profilu, przestrzegania zasad poufności projektu klienta, informowania o zmianach w dostępności.</p>
<h2>3. Poufność (NDA)</h2>
<p>Konsultant zobowiązuje się do zachowania poufności informacji uzyskanych w trakcie współpracy. Zakaz obowiązuje w trakcie współpracy oraz 24 miesiące po jej zakończeniu.</p>
<h2>4. Odpowiedzialność</h2>
<p>B2B.net odpowiada za: terminowe rozliczenia, zapewnienie narzędzi (Platforma ComPass), wsparcie administracyjne. B2B.net nie odpowiada za: decyzje biznesowe klienta końcowego, zmiany zakresu projektu u klienta.</p>', '1.0', TRUE, FALSE, 'authenticated'),

('ai-notice', 'Informacja o AI Assistant', '<h1>AI Assistant Notice</h1>
<h2>1. Zakres wykorzystania AI</h2>
<p>Platforma ComPass wykorzystuje technologię sztucznej inteligencji (OpenAI) do: sugestii klauzul umownych, analizy ryzyka kontraktowego, wspomagania wyszukiwania kompetencji, automatyzacji procesów onboardingowych.</p>
<h2>2. Ograniczenia</h2>
<p>AI NIE podejmuje autonomicznych decyzji. Każda sugestia AI wymaga weryfikacji i akceptacji przez człowieka (zasada human-in-the-loop). AI nie ma dostępu do danych finansowych ani stawek.</p>
<h2>3. Dane wejściowe</h2>
<p>AI przetwarza wyłącznie dane, do których użytkownik ma uprawnienia w ramach swojej roli. Dane nie są wykorzystywane do trenowania modeli. Prompty i odpowiedzi nie są przechowywane dłużej niż czas sesji.</p>
<h2>4. Prawo do wyłączenia</h2>
<p>Każdy użytkownik może wyłączyć funkcje AI w ustawieniach profilu. Wyłączenie AI nie wpływa na podstawową funkcjonalność Platformy.</p>', '1.0', TRUE, TRUE, 'authenticated'),

('electronic-signature', 'Warunki Podpisu Elektronicznego', '<h1>Warunki Podpisu Elektronicznego</h1>
<h2>1. Podstawa prawna</h2>
<p>Podpis elektroniczny w Platformie ComPass działa na podstawie art. 60 Kodeksu cywilnego — oświadczenie woli wyrażone w postaci elektronicznej.</p>
<h2>2. Mechanizm identyfikacji</h2>
<p>Przy każdym podpisie rejestrujemy: adres IP podpisującego, User-Agent przeglądarki, dokładny timestamp (UTC), identyfikator sesji użytkownika.</p>
<h2>3. Wymogi techniczne</h2>
<p>Do złożenia podpisu wymagane jest: aktywna sesja uwierzytelniona, zaznaczenie wymaganych checkboxów akceptacji, potwierdzenie tożsamości (MFA dla ról admin/centrala).</p>
<h2>4. Archiwizacja</h2>
<p>Podpisane dokumenty przechowywane są przez minimum 10 lat od daty podpisania, zgodnie z wymogami prawa podatkowego i handlowego.</p>', '1.0', TRUE, FALSE, 'authenticated'),

-- ADMIN documents (visible only to administrators)
('access-management', 'Polityka Zarządzania Dostępem', '<h1>Polityka Zarządzania Dostępem</h1>
<h2>1. Model RBAC</h2>
<p>System ComPass stosuje model Role-Based Access Control (RBAC) z rolami: Konsultant, Centrala (recruiter/manager/director), Administrator. Uprawnienia definiowane są na poziomie roli, nie indywidualnego użytkownika.</p>
<h2>2. Provisioning / Deprovisioning</h2>
<p>Nowe konta tworzone wyłącznie dla adresów @b2bnetwork.pl. Dezaktywacja konta następuje w ciągu 24h od zakończenia współpracy. Usunięcie danych na żądanie — w ciągu 30 dni.</p>
<h2>3. Zasada Least Privilege</h2>
<p>Każdy użytkownik otrzymuje minimalne uprawnienia niezbędne do wykonywania swoich obowiązków. Eskalacja uprawnień wymaga zatwierdzenia przez Administratora.</p>
<h2>4. Przeglądy dostępów</h2>
<p>Kwartalne przeglądy list dostępowych (admin_access_list, centrala_access_list). Roczny audyt uprawnień wszystkich użytkowników. Automatyczne powiadomienia o nieaktywnych kontach (90+ dni).</p>', '1.0', TRUE, FALSE, 'admin'),

('incident-response', 'Procedura Reagowania na Incydenty', '<h1>Procedura Reagowania na Incydenty</h1>
<h2>1. Klasyfikacja incydentów</h2>
<p><strong>P1 (Krytyczny)</strong> — wyciek danych osobowych, brak dostępu do systemu. Czas reakcji: 1h. <strong>P2 (Wysoki)</strong> — awaria modułu, błędy uprawnień. Czas reakcji: 4h. <strong>P3 (Średni)</strong> — błędy UI, problemy z wydajnością. Czas reakcji: 24h. <strong>P4 (Niski)</strong> — feature requesty, drobne poprawki. Czas reakcji: 5 dni roboczych.</p>
<h2>2. Procedura eskalacji</h2>
<p>Krok 1: Identyfikacja i klasyfikacja. Krok 2: Powiadomienie zespołu (Slack #incidents). Krok 3: Izolacja problemu. Krok 4: Naprawa i weryfikacja. Krok 5: Post-mortem (dla P1/P2).</p>
<h2>3. Obowiązek RODO</h2>
<p>W przypadku naruszenia danych osobowych (P1): zgłoszenie do UODO w ciągu 72 godzin, powiadomienie osób, których dane dotyczą, dokumentacja incydentu i podjętych działań.</p>', '1.0', TRUE, FALSE, 'admin'),

('data-retention', 'Polityka Retencji Danych', '<h1>Polityka Retencji Danych</h1>
<h2>1. Okresy retencji</h2>
<p><strong>Dane profilu użytkownika:</strong> czas trwania współpracy + 5 lat. <strong>Dane umów:</strong> 10 lat od zakończenia umowy (wymóg podatkowy). <strong>Logi logowania:</strong> 12 miesięcy. <strong>Dane rekrutacyjne:</strong> 24 miesiące od ostatniej aktywności. <strong>Wiadomości wewnętrzne:</strong> 36 miesięcy. <strong>Dane o zgodach (consents):</strong> czas trwania współpracy + 5 lat.</p>
<h2>2. Automatyczne usuwanie</h2>
<p>System automatycznie archiwizuje logi starsze niż 12 miesięcy. Konta nieaktywne powyżej 24 miesięcy są oznaczane do przeglądu. Usunięcie danych wymaga zatwierdzenia przez Administratora.</p>
<h2>3. Prawo do bycia zapomnianym</h2>
<p>Na żądanie użytkownika dane osobowe usuwane są w ciągu 30 dni, z wyjątkiem danych wymaganych przepisami prawa (dokumentacja podatkowa, umowy).</p>', '1.0', TRUE, FALSE, 'admin')

ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    content_html = EXCLUDED.content_html,
    version = EXCLUDED.version,
    is_active = EXCLUDED.is_active,
    requires_acceptance = EXCLUDED.requires_acceptance,
    visibility = EXCLUDED.visibility,
    updated_at = NOW();

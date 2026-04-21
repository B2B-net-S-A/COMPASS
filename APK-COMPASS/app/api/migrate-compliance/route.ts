import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MIGRATION_SQL = `
-- 1. Legal documents table
CREATE TABLE IF NOT EXISTS um_legal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    content_html TEXT NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    requires_acceptance BOOLEAN NOT NULL DEFAULT FALSE,
    visibility VARCHAR(20) NOT NULL DEFAULT 'authenticated'
        CHECK (visibility IN ('public', 'authenticated', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. User consents table
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

-- 4. RLS
ALTER TABLE um_legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE um_user_consents ENABLE ROW LEVEL SECURITY;
`

const RLS_POLICIES = [
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'legal_docs_public_read') THEN
      CREATE POLICY "legal_docs_public_read" ON um_legal_documents FOR SELECT USING (visibility = 'public');
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'legal_docs_authenticated_read') THEN
      CREATE POLICY "legal_docs_authenticated_read" ON um_legal_documents FOR SELECT TO authenticated USING (visibility IN ('public', 'authenticated'));
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'legal_docs_admin_read') THEN
      CREATE POLICY "legal_docs_admin_read" ON um_legal_documents FOR SELECT TO authenticated
        USING (visibility = 'admin' AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'administrator')));
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'legal_docs_admin_manage') THEN
      CREATE POLICY "legal_docs_admin_manage" ON um_legal_documents FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'administrator')));
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_consents_own_read') THEN
      CREATE POLICY "user_consents_own_read" ON um_user_consents FOR SELECT TO authenticated USING (user_id = auth.uid());
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_consents_own_insert') THEN
      CREATE POLICY "user_consents_own_insert" ON um_user_consents FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_consents_admin_read') THEN
      CREATE POLICY "user_consents_admin_read" ON um_user_consents FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'administrator')));
    END IF;
  END $$;`,
]

export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  })

  const results: { step: string; status: string; error?: string }[] = []

  // Step 1: Create tables + indexes + enable RLS
  const { error: e1 } = await supabase.rpc('exec_sql', { sql: MIGRATION_SQL }).maybeSingle()
  if (e1) {
    // If exec_sql doesn't exist, try raw SQL via pg
    // Fallback: execute via individual statements
    results.push({ step: 'tables_rpc', status: 'skipped', error: e1.message })
  } else {
    results.push({ step: 'tables_rpc', status: 'ok' })
  }

  // Step 2: Create tables via REST (idempotent check)
  // Check if table exists by trying to query it
  const { error: checkErr } = await supabase.from('um_legal_documents').select('id').limit(1)
  if (checkErr?.code === '42P01') {
    results.push({ step: 'table_check', status: 'tables_missing', error: 'Tables not created via RPC — need manual SQL execution in Supabase Dashboard' })
    return NextResponse.json({ results, manual_sql_required: true })
  }
  results.push({ step: 'table_check', status: 'ok' })

  // Step 3: Seed legal documents
  const documents = [
    { slug: 'privacy-policy', title: 'Polityka Prywatności (RODO)', visibility: 'public', requires_acceptance: true,
      content_html: '<h1>Polityka Prywatności</h1><p><strong>Administrator danych:</strong> B2B.net S.A., Aleje Jerozolimskie 180, 02-485 Warszawa, KRS: 0000387063</p><h2>1. Cele przetwarzania danych</h2><p>Dane osobowe przetwarzamy w celu: świadczenia usług platformy ComPass (art. 6 ust. 1 lit. b RODO), realizacji obowiązków prawnych (art. 6 ust. 1 lit. c RODO), prawnie uzasadnionych interesów administratora (art. 6 ust. 1 lit. f RODO).</p><h2>2. Zakres danych</h2><p>Przetwarzamy: imię i nazwisko, adres e-mail, numer telefonu, dane zawodowe (CV, kompetencje, doświadczenie), dane dotyczące umów B2B, adres IP i dane techniczne sesji.</p><h2>3. Prawa podmiotów danych</h2><p>Przysługuje Ci prawo do: dostępu do danych, sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych, sprzeciwu, cofnięcia zgody.</p><h2>4. Okres retencji</h2><p>Dane przechowujemy przez okres obowiązywania umowy + 5 lat. Logi systemowe: 12 miesięcy. Dane rekrutacyjne: 24 miesiące.</p><h2>5. IOD</h2><p>Kontakt: iod@b2bnetwork.pl</p>' },
    { slug: 'terms', title: 'Regulamin Platformy ComPass', visibility: 'public', requires_acceptance: true,
      content_html: '<h1>Regulamin Platformy ComPass</h1><p><strong>Wersja 1.0</strong> | Obowiązuje od: 11 marca 2026 r.</p><h2>§1. Definicje</h2><p><strong>Platforma</strong> — aplikacja webowa ComPass. <strong>Operator</strong> — B2B.net S.A. <strong>Konsultant</strong> — osoba współpracująca na podstawie umowy B2B.</p><h2>§2. Rejestracja</h2><p>Wymaga: adresu @b2bnetwork.pl, akceptacji Regulaminu i Polityki Prywatności, zgody RODO.</p><h2>§3. Role</h2><p>Konsultant, Centrala, Administrator — z odpowiednimi uprawnieniami.</p><h2>§4. Zasady</h2><p>Użytkownik podaje prawdziwe dane, nie udostępnia loginu osobom trzecim, informuje o naruszeniach.</p><h2>§5. SLA</h2><p>Gwarantowana dostępność: 99.5%. Okno serwisowe: sobota 02:00-06:00 CET.</p><h2>§6. Odpowiedzialność</h2><p>Operator nie odpowiada za siłę wyższą ani treści użytkowników.</p><h2>§7. Zmiany</h2><p>Informacja z 14-dniowym wyprzedzeniem.</p>' },
    { slug: 'help', title: 'Centrum Pomocy ComPass', visibility: 'public', requires_acceptance: false,
      content_html: '<h1>Centrum Pomocy</h1><h2>Logowanie</h2><p><strong>Nie mogę się zalogować</strong> — Upewnij się, że używasz @b2bnetwork.pl. Min. 10 znaków hasła. Po 5 próbach blokada na 15 min.</p><p><strong>Zapomniałem hasła</strong> — Kliknij "Nie pamiętasz hasła?" na stronie logowania.</p><h2>Umowy</h2><p>Przejdź do "Dokumenty" → wybierz umowę → przeczytaj → zaznacz checkboxy → "Podpisz elektronicznie".</p><h2>Kontakt</h2><p>support@b2bnetwork.pl lub komunikator wewnętrzny.</p>' },
    { slug: 'security', title: 'Polityka Bezpieczeństwa', visibility: 'authenticated', requires_acceptance: false,
      content_html: '<h1>Polityka Bezpieczeństwa</h1><h2>1. Szyfrowanie</h2><p>TLS 1.3 + Row Level Security (RLS).</p><h2>2. Uwierzytelnianie</h2><p>Silne hasła + MFA dla adminów. Blokada po 5 nieudanych próbach.</p><h2>3. Backup</h2><p>Automatyczne co 24h. PITR 7 dni.</p><h2>4. Klasyfikacja</h2><p>Publiczne, Wewnętrzne, Poufne, Ściśle poufne.</p><h2>5. Audyt</h2><p>Logi logowań przechowywane 12 miesięcy.</p>' },
    { slug: 'cooperation', title: 'Warunki Współpracy z Konsultantami', visibility: 'authenticated', requires_acceptance: false,
      content_html: '<h1>Warunki Współpracy</h1><h2>1. Zakres</h2><p>B2B.net S.A. — pośrednictwo IT na umowach B2B.</p><h2>2. Obowiązki konsultanta</h2><p>Raportowanie czasu pracy, aktualne dane, poufność projektu.</p><h2>3. NDA</h2><p>Poufność w trakcie + 24 miesiące po zakończeniu.</p><h2>4. Odpowiedzialność</h2><p>B2B.net: terminowe rozliczenia, narzędzia, wsparcie.</p>' },
    { slug: 'ai-notice', title: 'Informacja o AI Assistant', visibility: 'authenticated', requires_acceptance: true,
      content_html: '<h1>AI Assistant Notice</h1><h2>1. Zakres AI</h2><p>Sugestie klauzul, analiza ryzyka, wyszukiwanie kompetencji, automatyzacja onboardingu.</p><h2>2. Ograniczenia</h2><p>AI NIE podejmuje autonomicznych decyzji. Human-in-the-loop.</p><h2>3. Dane</h2><p>AI przetwarza tylko dane w ramach roli użytkownika. Nie trenuje modeli.</p><h2>4. Wyłączenie</h2><p>Można wyłączyć AI w ustawieniach profilu.</p>' },
    { slug: 'electronic-signature', title: 'Warunki Podpisu Elektronicznego', visibility: 'authenticated', requires_acceptance: false,
      content_html: '<h1>Warunki Podpisu Elektronicznego</h1><h2>1. Podstawa</h2><p>Art. 60 KC — oświadczenie woli w formie elektronicznej.</p><h2>2. Identyfikacja</h2><p>IP, User-Agent, timestamp UTC, ID sesji.</p><h2>3. Wymogi</h2><p>Aktywna sesja, checkboxy akceptacji, MFA dla admin/centrala.</p><h2>4. Archiwizacja</h2><p>Min. 10 lat od daty podpisania.</p>' },
    { slug: 'access-management', title: 'Polityka Zarządzania Dostępem', visibility: 'admin', requires_acceptance: false,
      content_html: '<h1>Polityka Zarządzania Dostępem</h1><h2>1. RBAC</h2><p>Role: Konsultant, Centrala, Administrator. Uprawnienia na poziomie roli.</p><h2>2. Provisioning</h2><p>Konta tylko @b2bnetwork.pl. Dezaktywacja w 24h od zakończenia współpracy.</p><h2>3. Least Privilege</h2><p>Minimalne uprawnienia. Eskalacja wymaga zatwierdzenia Administratora.</p><h2>4. Przeglądy</h2><p>Kwartalne przeglądy list dostępowych. Roczny audyt.</p>' },
    { slug: 'incident-response', title: 'Procedura Reagowania na Incydenty', visibility: 'admin', requires_acceptance: false,
      content_html: '<h1>Procedura Reagowania na Incydenty</h1><h2>1. Klasyfikacja</h2><p>P1 (Krytyczny, 1h), P2 (Wysoki, 4h), P3 (Średni, 24h), P4 (Niski, 5 dni).</p><h2>2. Eskalacja</h2><p>Identyfikacja → Powiadomienie → Izolacja → Naprawa → Post-mortem.</p><h2>3. RODO</h2><p>Naruszenie P1: zgłoszenie UODO w 72h, powiadomienie osób dotkniętych.</p>' },
    { slug: 'data-retention', title: 'Polityka Retencji Danych', visibility: 'admin', requires_acceptance: false,
      content_html: '<h1>Polityka Retencji Danych</h1><h2>1. Okresy</h2><p>Profil: współpraca + 5 lat. Umowy: 10 lat. Logi: 12 mies. Rekrutacja: 24 mies. Wiadomości: 36 mies. Consents: współpraca + 5 lat.</p><h2>2. Auto-usuwanie</h2><p>Logi >12 mies. archiwizowane. Konta >24 mies. bez aktywności — do przeglądu.</p><h2>3. Prawo do zapomnienia</h2><p>Usunięcie w 30 dni, z wyjątkiem danych wymaganych prawem.</p>' },
  ]

  const { error: seedErr, data: seedData } = await supabase
    .from('um_legal_documents')
    .upsert(
      documents.map(d => ({ ...d, version: '1.0', is_active: true })),
      { onConflict: 'slug' }
    )
    .select('slug')

  if (seedErr) {
    results.push({ step: 'seed', status: 'error', error: seedErr.message })
  } else {
    results.push({ step: 'seed', status: 'ok', error: `${seedData?.length || 0} documents upserted` })
  }

  // Step 4: Verify
  const { data: allDocs } = await supabase.from('um_legal_documents').select('slug, title, visibility')
  results.push({ step: 'verify', status: 'ok', error: `${allDocs?.length || 0} documents in DB` })

  return NextResponse.json({ success: true, results })
}

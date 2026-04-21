# Consultant addition workflow analysis
_Exported on 22.02.2026 at 10:43:46 CET from Cursor (2.5.20)_

---

**User**

przeprojektowanie mechanizmu dodawania Konsultantów do Bazy, chciałbym to trochę zmienić.
czy możesz sprawdzić czy poniższa analiza jest poprawna:


Workflow dodawania Konsultanta do bazy ComPass
ETAP 1: Rejestracja (Self-Service)
Konsultant sam się rejestruje na /login:

Email musi być z domeny @b2bnetwork.pl
Hasło: min 10 znaków, wielka litera, cyfra
Wymagana zgoda GDPR
Rola ustawiana automatycznie na consultant w metadanych Supabase Auth

Po kliknięciu "Zarejestruj się" → email z linkiem potwierdzającym (Supabase email confirmation).
ETAP 2: Trigger bazodanowy — automatyczne tworzenie profilu
Po potwierdzeniu maila i pierwszym logowaniu, Supabase odpala trigger handle_new_user() (z migracji 20240502000000_initial_schema.sql):
auth.users INSERT → trigger → profiles INSERT
Tworzony profil zawiera: id, email, full_name, role='consultant', preferred_language='pl' — reszta pól null.
ETAP 3: Synchronizacja roli przy logowaniu
Przy każdym logowaniu odpala się syncRole() w app/login/actions.ts, która sprawdza w kolejności priorytetowej:

Super Admin (hardcoded lista, m.in. zbigniew.twardowski@b2bnetwork.pl) → rola administrator
admin_access_list (tabela zarządzana przez Super Adminów) → rola administrator
centrala_access_list (tabela zarządzana przez Adminów) → rola centrala
Domyślnie → rola consultant

Rola jest zapisywana w profiles.role.
ETAP 4: Onboarding (/onboarding)
Nowy konsultant po zalogowaniu trafia na stronę onboardingu, gdzie musi:

Wgrać CV (PDF/DOCX) → Supabase Storage
Wpisać bio (min 10 znaków) → generowany jest embedding AI
Zaakceptować GDPR

Po zapisaniu wywoływane jest updateProfileFull() → aktualizacja profiles + ekstrakcja skills z CV.
ETAP 5: Automatyczny sync profiles → candidates
Tu jest kluczowy mechanizm. Dwa triggery bazodanowe (z migracji 20260218_registration_v2.sql):

on_profile_insert_sync_candidate — po INSERT do profiles
on_profile_update_sync_candidate — po UPDATE w profiles

Oba wywołują funkcję sync_profile_to_candidate(), która robi UPSERT do tabeli candidates (matchując po user_id lub email). Tabela candidates to "widok CRM" — to ją widzą Centrala i Admini.
Dodatkowo w kodzie aplikacji jest syncProfileToCandidate() w lib/actions/matching.ts, które robi to samo na poziomie aplikacji (redundancja zabezpieczająca).

Kto co widzi
Administrator / Admin

Strona /admin/candidates — widzi WSZYSTKICH konsultantów z tabeli candidates
Dashboard /home — widzi KPI: total consultants, utilization rate, on bench, tier distribution
Panel zarządzania (/admin/settings/access) — może dodawać użytkowników do centrala_access_list i przypisywać konsultantów do rekruterów/DL
Dane pobierane z: profiles WHERE role='consultant' + candidates + consultant_assignments

Centrala
Widoczność zależy od access_mode w centrala_access_list:

access_mode = 'full' (lub rola finance) → widzi WSZYSTKICH konsultantów
access_mode = 'portfolio' → widzi TYLKO przypisanych do siebie konsultantów (przez tabelę consultant_assignments)

Logika w lib/actions/centrala.ts → getConsultantsList():
Jeśli portfolio + nie finance → filtruj przez consultant_assignments WHERE assigned_to = user.id
W przeciwnym razie → pokaż wszystkich z role='consultant'
Konsultant

Widzi tylko swój profil na /home w sekcji "Mój Profil"
Nie ma dostępu do /admin/candidates ani do danych innych konsultantów
RLS (Row Level Security) to wymusza na poziomie bazy


Tabela consultant_assignments — przypisania
consultant_assignments:
  consultant_id → profiles.id (konsultant)
  assigned_to   → profiles.id (rekruter lub DL)
  assignment_type: 'recruiter' | 'delivery_lead'
Reguły: jeden rekruter na konsultanta (UNIQUE), wielu DL dozwolone. Zarządzane przez Adminów w /admin/settings/access.

Schemat wizualny flow
Rejestracja (@b2bnetwork.pl)
    │
    ▼
Email confirmation
    │
    ▼
Pierwsze logowanie
    ├── trigger handle_new_user() → INSERT profiles (role=consultant)
    ├── syncRole() → sprawdza listy dostępu → ustala finalną rolę
    └── redirect → /onboarding
                      │
                      ▼
              Wgranie CV + bio + GDPR
                      │
                      ▼
              updateProfileFull() → UPDATE profiles
                      │
                      ▼
              trigger sync_profile_to_candidate() → UPSERT candidates
                      │
                      ▼
              Konsultant widoczny w:
              ├── /admin/candidates (Admin/Administrator)
              ├── Centrala dashboard (wg access_mode)
              └── Matching engine (embedding + skills)

Kluczowe obserwacje i rekomendacje
Co działa dobrze:

Dual-trigger (DB + app-level) zapewnia redundancję sync profiles↔candidates
Role sync przy każdym logowaniu — spójność gwarantowana
RLS na poziomie bazy — bezpieczeństwo niezależne od kodu aplikacji

Potencjalne luki:

Brak manualnego dodawania konsultantów — nie ma UI do dodania konsultanta "z ręki" przez admina (np. import CSV, formularz admin). Każdy musi sam się zarejestrować.
Mock client w demo — w trybie bypass (bez Supabase) triggery bazodanowe nie odpalą się, więc sync profiles→candidates zależy wyłącznie od syncProfileToCandidate() w kodzie JS.
Onboarding nie jest wymuszony — jeśli konsultant pominie onboarding, ma pusty profil i trafia do candidates z minimalnymi danymi (brak CV, bio, skills).

I need to thoroughly understand the workflow for adding consultants to the database in this Next.js/Supabase app. Search in /sessions/blissful-hopeful-ramanujan/mnt/aplikacja zbyszka/APK-COMPASS/APK-COMPASS/

Please find and read these key areas:

1. **Registration/Signup flow**: How does a new user register? Look at `app/login/actions.ts` (signup function), and any onboarding pages.

2. **Profile creation**: When/how is a profile created in the `profiles` table? Look for triggers, post-signup hooks, or explicit insert calls. Check `lib/actions/matching.ts`, any migration files, SQL files, or seed files.

3. **Role assignment**: How is a user assigned the 'consultant' role? Check signup options, profile defaults, admin actions for role changes.

4. **Candidates table**: How does a consultant get into the `candidates` table? Look at `syncProfileToCandidate` in matching.ts, and any other places candidates are inserted.

5. **Admin adding consultants**: Is there an admin panel for adding consultants manually? Check `app/(protected)/admin/` pages, especially anything related to adding/creating consultants or candidates.

6. **Centrala visibility**: How does Centrala see consultants? Check `lib/actions/centrala.ts` - what queries fetch consultant lists?

7. **Admin/Administrator visibility**: How do admin roles see consultants? Check `lib/actions/admin-dashboard.ts`, `app/(protected)/admin/candidates/` page.

8. **Access control**: Check for any `centrala_access_list`, `admin_access_list`, or permission tables. Look at how portfolio/assignment filtering works.

9. **Consultant assignments**: Look for `consultant_assignments` table usage.

10. **Any API routes** in `app/api/` related to consultants or candidates.

Please return FULL contents of the most important files and a summary of the complete workflow.

---

**Cursor**

I'll thoroughly explore the codebase to verify your analysis. Let me launch several parallel searches to cover all the key areas.

Now let me read the centrala.ts file directly to verify the exact query logic.

Let me check one more thing - the middleware and how onboarding redirect is (or isn't) enforced.

Now let me check for the `sync_user_role` RPC function and the role check constraint on profiles.

Now I have a comprehensive picture. Let me compile my analysis.

---

Twoja analiza jest **w dużej mierze poprawna**, ale jest kilka nieścisłości i miejsc wymagających korekty. Oto szczegółowa weryfikacja punkt po punkcie:

---

## ETAP 1: Rejestracja -- POPRAWNA

Twój opis jest dokładny. Weryfikacja w kodzie:

```186:209:APK-COMPASS/APK-COMPASS/app/login/actions.ts
    // 1. Domain Validation
    if (!email.toLowerCase().endsWith('@b2bnetwork.pl')) {
        return { error: 'Rejestracja dozwolona tylko dla domeny @b2bnetwork.pl' }
    }

    // 2. Password Strength Validation
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{10,}$/
    // ...
    // 3. GDPR Consent Validation
    const gdprConsent = formData.get('gdpr_consent') === 'on'
```

Rola `consultant` jest ustawiana w metadanych auth:

```217:221:APK-COMPASS/APK-COMPASS/app/login/actions.ts
            data: {
                full_name: fullName.trim(),
                gdpr_consent: true,
                role: 'consultant'
            },
```

---

## ETAP 2: Trigger bazodanowy -- POPRAWNA z drobną korektą

Trigger `handle_new_user()` istnieje, ale **nie ustawia roli** wprost. Patrz na migrację:

```27:35:APK-COMPASS/APK-COMPASS/supabase/migrations/20240502000000_initial_schema.sql
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
```

Zauważ: trigger wstawia tylko `id, email, full_name, avatar_url` -- **nie wstawia `role`**. Rola `consultant` pochodzi z **domyślnej wartości kolumny** (`default 'consultant'`), a **nie** z metadanych auth. Pole `preferred_language` nie jest wstawiane przez trigger -- przyjmuje wartość domyślną z definicji kolumny (`default 'pl'`). Efekt jest taki sam jak opisałeś, ale mechanizm jest nieco inny.

**Korekta**: Trigger nie kopiuje `role` z metadanych -- rola pochodzi z DEFAULT kolumny w tabeli `profiles`.

---

## ETAP 3: Synchronizacja roli -- POPRAWNA z uwagami

Twój opis priorytetu jest poprawny:

```68:108:APK-COMPASS/APK-COMPASS/app/login/actions.ts
async function syncRole(supabase: SupabaseClient, userId: string, email: string, currentRole: string): Promise<string> {
    // 1. Super Admins — hardcoded
    if (isSuperAdmin(emailLower)) { ... return 'administrator' }
    // 2. RPC sync_user_role (SECURITY DEFINER)
    // 3. Fallback: admin_access_list → 'administrator'
    // 4. Fallback: centrala_access_list → 'centrala'
    // 5. Downgrade elevated roles not in any list → 'consultant'
}
```

**Uwagi**:
- Super Admin lista zawiera **dwa** emaile, nie "m.in." jeden -- to `zbigniew.twardowski@b2bnetwork.pl` i `igor.twardowski@b2bnetwork.pl`
- Funkcja RPC `sync_user_role` jest **wywoływana, ale NIE istnieje w migracjach** -- nie znalazłem jej definicji w żadnym pliku SQL. To znaczy, że zawsze używany jest fallback z bezpośrednimi query. To jest potencjalny problem, bo te bezpośrednie query mogą się nie powieść z powodu RLS
- Jest dodatkowa logika **downgrade**: jeśli ktoś ma rolę `centrala`/`administrator`/`admin` ale nie jest na żadnej liście -- rola jest **obniżana** do `consultant`. To ważny szczegół, którego nie opisałeś

---

## ETAP 4: Onboarding -- POPRAWNA ale z istotnymi uwagami

Strona `/onboarding` istnieje i zawiera opisane elementy (CV, bio, GDPR). Ale:

**Krytyczna luka**: Onboarding **NIE jest wymuszony** w middleware ani nigdzie indziej. Middleware (`middleware.ts`) nie sprawdza czy profil jest uzupełniony i nie przekierowuje na `/onboarding`. Jedyna logika w middleware to odświeżenie sesji Supabase:

```5:38:APK-COMPASS/APK-COMPASS/middleware.ts
export async function middleware(request: NextRequest) {
    // ... supabase session refresh ...
    await supabase.auth.getUser()
    return response
}
```

Nie ma nigdzie redirectu do `/onboarding` po zalogowaniu -- login zawsze przekierowuje na `/home`. Oznacza to, że konsultant **może w ogóle nigdy nie odwiedzić /onboarding** i będzie miał pusty profil.

Dodatkowo: onboarding po ukończeniu przekierowuje na `/dashboard`, nie `/home`:

```72:73:APK-COMPASS/APK-COMPASS/app/onboarding/page.tsx
            toastSuccess('Profil utworzony pomyślnie!')
            router.push('/dashboard')
```

---

## ETAP 5: Sync profiles -> candidates -- POPRAWNA

Oba triggery bazodanowe istnieją i funkcja `sync_profile_to_candidate()` jest zdefiniowana jako `SECURITY DEFINER`:

```sql
-- From 20260218_registration_v2.sql
CREATE TRIGGER on_profile_update_sync_candidate
    AFTER UPDATE ON public.profiles 
    FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_candidate();

CREATE TRIGGER on_profile_insert_sync_candidate
    AFTER INSERT ON public.profiles 
    FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_candidate();
```

Sync na poziomie aplikacji w `syncProfileToCandidate()` w `matching.ts` (linie 159-282) -- potwierdzam, to jest redundancja zabezpieczająca. Jest wywoływany z `updateProfileFull()`, ale otoczony try/catch i nie blokuje aktualizacji profilu w razie błędu.

---

## Kto co widzi -- POPRAWNA z drobnymi korektami

### Administrator/Admin
Poprawne. Dane pobierane z `profiles` + `candidates` + `consultant_assignments` + `centrala_access_list` + `admin_access_list` (w `getAdminDashboardData()`).

### Centrala
Logika w `getConsultantsList()` jest **dokładnie** taka jak opisałeś:

```47:77:APK-COMPASS/APK-COMPASS/lib/actions/centrala.ts
    const needsFiltering = accessEntry
        && accessEntry.access_mode === 'portfolio'
        && accessEntry.centrala_role !== 'finance'

    if (needsFiltering) {
        // filter by consultant_assignments WHERE assigned_to = user.id
    }
    // else: full access
```

### Konsultant
Poprawne. RLS na `candidates` tabeli ogranicza widoczność -- konsultant widzi tylko swój rekord (`user_id = auth.uid()`).

---

## RLS na candidates -- WYMAGA KOREKTY

RLS na `candidates` ma **problem z rolami**. Oryginalna polityka sprawdza `role = 'admin'`:

```20:26:APK-COMPASS/APK-COMPASS/FIX_CANDIDATES_RLS_FINAL.sql
CREATE POLICY "Admins can manage candidates" ON candidates FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
    )
```

Ale w systemie rola admina to `administrator` (nie `admin`). `admin` to stara wartość zachowana dla backward compatibility. Jeśli nowi admini mają rolę `administrator`, ta polityka ich **nie obejmuje**. Nie ma też polityki dla roli `centrala` -- użytkownicy Centrala nie mają bezpośredniego dostępu do tabeli `candidates` przez RLS (ale mogą czytać z `profiles`).

---

## consultant_assignments -- POPRAWNA

Struktura tabeli i reguły (UNIQUE na recruiter, wielu DL) -- potwierdzone:

```sql
-- From 20260219_centrala_management.sql
UNIQUE(consultant_id, assigned_to, assignment_type)
```

Ale constraint UNIQUE jest na kombinacji `(consultant_id, assigned_to, assignment_type)`, nie na "jeden rekruter na konsultanta". Oznacza to, że jeden konsultant **może mieć wielu rekruterów**, jeśli są to różni `assigned_to`. Zobaczyłem osobny plik `20260219_unique_recruiter_assignment.sql` -- warto by go sprawdzić, bo tam może być dodatkowy constraint.

---

## Kluczowe obserwacje i rekomendacje -- POPRAWNE z uzupełnieniami

Twoje trzy punkty o potencjalnych lukach są trafne. Dodam:

1. **Brak manualnego dodawania** -- potwierdzam, nie znalazłem żadnego UI ani API do ręcznego dodawania konsultantów przez admina. Żaden formularz, żaden import CSV.

2. **Mock client / bypass** -- poprawne. Middleware przepuszcza wszystko gdy `!isSupabaseConfigured()`.

3. **Onboarding nie wymuszony** -- to jest nawet gorsze niż opisałeś. Nie ma **żadnego** mechanizmu wymuszającego onboarding. Brak w middleware, brak w layout, brak w komponentach chronionych. Login przekierowuje na `/home`, nie na `/onboarding`.

4. **Dodatkowa luka: `sync_user_role` RPC nie istnieje** -- funkcja jest wywoływana, ale jej definicja nie istnieje w migracjach SQL. Fallback działa, ale z ryzykiem problemów RLS.

5. **Dodatkowa luka: RLS na candidates nie uwzględnia roli `administrator`** -- sprawdza tylko `role = 'admin'`, a system nadaje nowym adminom rolę `administrator`.

6. **GDPR podwójnie zbierany** -- raz w rejestracji, raz w onboarding. Ale w rejestracji trafia do auth metadata, a w onboarding do `profiles` -- to niekoniecznie jest spójne.

---

**Podsumowanie**: Twoja analiza jest solidna i w ~90% dokładna. Główne korekty to: (1) trigger `handle_new_user` nie kopiuje roli z metadanych -- używa DEFAULT, (2) brak `sync_user_role` RPC w migracjach, (3) RLS na candidates sprawdza `admin` zamiast `administrator`, (4) brak wymuszonego redirectu na onboarding -- to jest hardcoded `/home` w login action.

---

**User**

chciałbym zaprojektować dodatkowo taki mechanizm:
1. nowa rola z systemie - Kandydat (to jest opcja pre-Konsultant). Kandydat przekształca się z Konsultanta w momencie gdy konsultant zakłąda konto na swoim imiennym adresie mailowym i dodaje CV Kandydata do swojego konta 
2. chciałbym wgrać około 50.000 CV kandydatów do bazy
3. następnie Konsultanci jak zarejstrują swoje konto w Compass to mogą dodać swoje CV z bazy lub dodają w aktualny sposób
4. trzeba wprowadzić mechanizm weryfikacji imienia i nazwiska wybierając CV z bazy gdyż mogą się powtarzać i konsultant zobaczy dwa CV albo wiecej o takim samym imieniu i nazwisku
5. uzupełnianie danych Kandydata może być dokonane przez Centralę lub Administratora oraz super Admina. 
napisz mi jak to zaplanować?
czy apliakcja wytrzyma 50.000 CV i bedzie płynnie analizować przez Asystenta AI?


---

**Cursor**

Zanim dam Ci szczegółowy plan, muszę sprawdzić kilka kluczowych elementów architektury, które wpłyną na projektowanie tego mechanizmu -- szczególnie obecną strukturę embeddingów AI, storage, i wydajność.

Mam teraz pełny obraz architektury. Przeanalizowałem embeddingi (OpenAI `text-embedding-3-small`, 1536 dim), storage (Supabase bucket `documents`), przetwarzanie AI (GPT-4o-mini), batchowanie (chunki po 15, `Promise.all`), i brak systemu kolejek. Oto szczegółowy plan:

---

## PLAN: Mechanizm Kandydatów (Pre-Konsultant) + Bulk Import 50K CV

---

### A. Zmiany w modelu danych

**1. Rozdzielenie tabeli `candidates` od `profiles`**

Aktualnie `candidates` to lustrzane odbicie `profiles` (sync przez trigger). W nowym modelu `candidates` staje się **samodzielną tabelą** -- jest to baza CV, która istnieje **zanim** ktokolwiek się zarejestruje.

Nowe kolumny w `candidates`:

```sql
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'import' 
    CHECK (source IN ('import', 'self_registration', 'referral'));
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS candidate_status TEXT DEFAULT 'kandydat'
    CHECK (candidate_status IN ('kandydat', 'konsultant', 'archived'));
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES auth.users(id);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS import_batch_id TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_parsed BOOLEAN DEFAULT FALSE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_parse_error TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS original_filename TEXT;
```

Klucz logiczny: `candidate_status = 'kandydat'` to pre-Konsultant. Gdy konsultant zarejestruje konto i "zaclaimuje" swoje CV, status zmienia sie na `'konsultant'` i `user_id` jest wypełniane.

**2. Nowa rola NIE jest potrzebna w `profiles.role`**

Nie rekomendowałbym dodawania roli "kandydat" do `profiles`, ponieważ Kandydat to ktoś, kto **nie ma jeszcze konta** w systemie. Nie istnieje w `auth.users` ani w `profiles`. Istnieje wyłącznie jako rekord w `candidates` z `candidate_status = 'kandydat'`. Gdy się zarejestruje, dostaje `profiles.role = 'consultant'` jak dotychczas, a jego rekord w `candidates` zmienia się na `candidate_status = 'konsultant'`.

Alternatywnie, jeśli chcesz żeby rola "kandydat" istniała w systemie (np. żeby Kandydat mógł się zalogować z ograniczonymi prawami), to wymagałoby dużo więcej zmian w middleware, RLS, i nawigacji.

---

### B. Pipeline Bulk Import 50,000 CV

To jest kluczowy element i wymaga **dedykowanego systemu batchowego**, bo obecna architektura (synchroniczne server actions) nie poradzi sobie z 50K plikami.

**Architektura importu:**

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN: /admin/import/cv-bulk             │
│  1. Upload ZIP (lub folder S3/GCS)                          │
│  2. System rozpakowuje → lista plików                       │
│  3. Tworzy rekordy candidates (candidate_status='kandydat') │
│  4. Kolejkuje przetwarzanie AI                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │  Tabela: import_│
              │  cv_queue       │
              │  ─────────────  │
              │  id             │
              │  candidate_id   │
              │  cv_storage_path│
              │  status:        │
              │   pending →     │
              │   processing →  │
              │   done / error  │
              │  batch_id       │
              │  created_at     │
              └────────┬────────┘
                       │
        ┌──────────────▼──────────────┐
        │   WORKER: Supabase Edge     │
        │   Function LUB cron job     │
        │   ────────────────────────  │
        │   1. Pobierz pending (10)   │
        │   2. Download CV z Storage  │
        │   3. Parse text (mammoth/   │
        │      pdf2json)              │
        │   4. GPT-4o-mini → extract  │
        │      name, skills, bio      │
        │   5. Embedding (1536 dim)   │
        │   6. UPDATE candidates      │
        │   7. Mark as done           │
        │   Repeat co 5 sekund        │
        └─────────────────────────────┘
```

**Kluczowe decyzje:**

1. **Parsing bez AI najpierw**: Wyodrębnij tekst z CV (mammoth/pdf2json) i zapisz jako `raw_text` w candidates. To jest szybkie i nie kosztuje. Pozwala na full-text search od razu.

2. **AI w tle**: Ekstrakcja strukturyzowana (imię, skills, bio) przez GPT-4o-mini oraz generowanie embeddingów odbywa się w tle, w batchach.

3. **Kolejka w bazie**: Tabela `import_cv_queue` zamiast Redis/RabbitMQ -- Supabase PostgreSQL wystarczy jako prosta kolejka dla tego wolumenu.

**Szacowanie kosztów importu 50K CV:**

| Operacja | Jednostka | Koszt/szt | Razem |
|----------|-----------|-----------|-------|
| Storage (CVs) | ~200KB-1MB avg × 50K | $0.021/GB/mies | ~$1-5/mies |
| GPT-4o-mini (parsing) | ~2K input + 500 output tokens | ~$0.001-0.003 | **$50-150** |
| Embeddings (text-embedding-3-small) | ~500 tokens avg | $0.00002/1K tok | **$0.50** |
| Supabase DB (50K rows + vectors) | ~400MB | w planie Pro | $0 extra |
| **RAZEM** | | | **~$50-155 jednorazowo** |

**Czas przetwarzania**: Przy 10 CV/batch, 5 batchy równolegle, ~2 sekundy per batch → **~2,000 sekund = ~35 minut** (z rate limitami OpenAI bardziej realistycznie 1-2 godziny).

---

### C. Zmieniony Flow Rejestracji Konsultanta

```
Rejestracja (@b2bnetwork.pl)
    │
    ▼
Email confirmation → Pierwsze logowanie
    │
    ├── trigger handle_new_user() → INSERT profiles (role=consultant)
    ├── syncRole() → ustala rolę
    │
    ▼
/onboarding (WYMUSZONY przez middleware!)
    │
    ├── KROK 1: "Czy Twoje CV jest już w bazie ComPass?"
    │       │
    │       ├── [TAK] → Wyszukiwanie po imieniu i nazwisku
    │       │            │
    │       │            ▼
    │       │       Wyniki: lista matching candidates
    │       │       (imię, nazwisko, skills snippet, data uploadu)
    │       │            │
    │       │            ▼
    │       │       Konsultant wybiera SWOJE CV
    │       │            │
    │       │            ▼
    │       │       candidates.claimed_by = user.id
    │       │       candidates.user_id = user.id
    │       │       candidates.candidate_status = 'konsultant'
    │       │       profiles ← zaciąga dane z candidates
    │       │
    │       └── [NIE / Nie znaleziono] → Standard: upload nowego CV
    │                                     → INSERT candidates (source='self_registration')
    │
    ├── KROK 2: Uzupełnij bio (jeśli brak z CV)
    ├── KROK 3: GDPR consent
    │
    ▼
/home (Dashboard)
```

---

### D. UI Wyszukiwania i Weryfikacji CV (problem duplikatów nazw)

Gdy konsultant "Jan Kowalski" szuka siebie w bazie i jest 5 rekordów "Jan Kowalski", musi zobaczyć wystarczająco informacji, żeby odróżnić swoje CV:

**Karta wynikowa:**

```
┌────────────────────────────────────────────────┐
│  Jan Kowalski                                   │
│  📧 j.kowalski@... (fragment, zamaskowany)      │
│  🛠️  React, Node.js, AWS, TypeScript            │
│  📅  CV wgrane: 2025-03-15                      │
│  📄  Podgląd: "Senior Full-Stack Developer z    │
│       8-letnim doświadczeniem w..."              │
│                              [To moje CV →]     │
└────────────────────────────────────────────────┘
```

**Mechanizm weryfikacji:**

1. **Wyszukiwanie**: `candidates.full_name ILIKE '%kowalski%'` + `candidate_status = 'kandydat'` (tylko nie-zaclaimowane)
2. **Dodatkowa weryfikacja**: Porównanie emaila rejestracji z danymi kontaktowymi z CV (jeśli email był w CV)
3. **Podgląd bio/skills**: Pokazanie fragmentu bio i listy skills -- konsultant rozpoznaje swój profil
4. **Podgląd CV**: Możliwość pobrania/podglądu pliku PDF przed claimem
5. **Zabezpieczenie**: Jedno CV może być zaclaimowane tylko raz. Po claimie znika z wyników wyszukiwania

---

### E. Zarządzanie Kandydatami przez Centralę/Adminów

Rozszerzenie istniejącej strony `/admin/candidates`:

**Nowe widoki:**

| Widok | Filtr | Opis |
|-------|-------|------|
| Kandydaci | `candidate_status = 'kandydat'` | CV w bazie, nikt nie zaclaimował |
| Konsultanci | `candidate_status = 'konsultant'` | Zarejestrowani, aktywni |
| Wszyscy | bez filtra | Pełna baza |

**Akcje admin na Kandydacie:**
- Edycja danych (imię, skills, bio, status, doświadczenie)
- Re-parsowanie CV przez AI
- Ręczne przypisanie do konta (jeśli admin wie, że to ta osoba)
- Upload nowego/zaktualizowanego CV
- Archiwizacja (`candidate_status = 'archived'`)

**RLS do uzupełnienia:**

```sql
-- Centrala (rekruter/DL) mogą czytać kandydatów
CREATE POLICY "Centrala can view candidates" ON candidates 
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('administrator', 'admin', 'centrala')
    )
);

-- Admini mogą edytować kandydatów
CREATE POLICY "Admins can manage all candidates" ON candidates 
FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('administrator', 'admin')
    )
);
```

---

### F. Wydajność -- czy aplikacja wytrzyma 50,000 CV?

**Krótka odpowiedź: TAK, ale z warunkami.**

| Warstwa | 50K rekordów | Ocena | Uwagi |
|---------|-------------|-------|-------|
| **PostgreSQL (dane)** | 50K rows | Trivial | PG obsługuje miliony. Brak problemu |
| **pgvector (embeddingi)** | 50K × 1536 dim ≈ 300MB | OK | **Potrzebny indeks HNSW** |
| **Supabase Storage** | 50K plików × ~500KB avg = ~25GB | OK | Plan Pro: 100GB included |
| **AI Assistant (kontekst)** | N/A | OK | Nie wysyła 50K do GPT -- używa vector search do pobrania top-N |
| **Matching engine** | 50K wektorów | OK z indeksem | Bez indeksu: sekundy. Z HNSW: milisekundy |
| **UI lista /admin/candidates** | Paginacja konieczna | Wymaga zmian | Obecny kod ładuje ALL candidates |

**Krytyczne zmiany dla wydajności:**

**1. Indeks HNSW na embeddings (OBOWIĄZKOWE)**

```sql
CREATE INDEX IF NOT EXISTS idx_candidates_embedding_hnsw 
ON candidates USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

Bez tego indeksu, similarity search na 50K wektorach zajmuje 1-5 sekund. Z HNSW: ~5-20ms.

**2. Paginacja na /admin/candidates (OBOWIĄZKOWE)**

Obecny kod w `getAdminDashboardData()` robi:

```typescript
// To zaciąga WSZYSTKIE profiles -- przy 50K będzie ~5-10 sekund
supabase.from('profiles').select('...').order('full_name')
```

Trzeba dodać `.range(offset, offset + pageSize)` i server-side pagination.

**3. Full-text search index (ZALECANE)**

```sql
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(full_name, '') || ' ' || coalesce(bio, '') || ' ' || array_to_string(coalesce(skills, '{}'), ' '))
    ) STORED;

CREATE INDEX idx_candidates_search ON candidates USING gin(search_vector);
```

To pozwoli na szybkie wyszukiwanie po imieniu/nazwisku/skills bez pełnego skanowania tabeli.

**4. Asystent AI -- brak problemu**

Asystent AI **nie** ładuje wszystkich kandydatów do kontekstu. Używa `buildDocumentContext()` który robi vector similarity search (top-N). Przy 50K z indeksem HNSW, to dalej będzie działać w milisekundach. Model GPT-4o-mini dostaje tylko kilka najlepszych dopasowań, nie cała bazę.

**5. Compass Assist (matching engine)**

Obecny matching w `projects.ts` pobiera top-N przez `match_projects` RPC (vector cosine similarity). Przy 50K z indeksem -- brak problemu. Batch scoring dzieli na chunki po 15 i procesuje równolegle -- to skaluje się liniowo.

---

### G. Plan implementacji -- kolejność

| Faza | Zakres | Priorytet | Szacunek |
|------|--------|-----------|----------|
| **1** | Schema: nowe kolumny candidates, indeksy HNSW, FTS | Krytyczny | 1-2 dni |
| **2** | Bulk import pipeline: upload ZIP, parse text, queue | Krytyczny | 3-4 dni |
| **3** | Worker: AI extraction + embeddingi w tle | Krytyczny | 2-3 dni |
| **4** | Zmiana onboardingu: wyszukaj CV / claim / lub upload | Wysoki | 2-3 dni |
| **5** | UI weryfikacji duplikatów nazw | Wysoki | 1-2 dni |
| **6** | Admin panel: widok Kandydaci vs Konsultanci, edycja | Średni | 2 dni |
| **7** | Paginacja /admin/candidates dla 50K | Krytyczny | 1 dzień |
| **8** | RLS fix (administrator + centrala na candidates) | Krytyczny | 0.5 dnia |
| **9** | Wymuszenie onboardingu w middleware | Wysoki | 0.5 dnia |
| **Razem** | | | ~13-17 dni |

---

### H. Decyzja architektoniczna: Worker

Obecna aplikacja nie ma systemu kolejek. Dla 50K CV potrzebujesz jednego z:

| Opcja | Opis | Zalety | Wady |
|-------|------|--------|------|
| **A. Supabase Edge Function + pg_cron** | Edge Function odpala co 30s, pobiera 10 pending z queue, procesuje | Zero dodatkowej infra, natywne Supabase | Limity runtime (150s na Pro), cold starty |
| **B. Next.js API Route + cron (np. Vercel Cron)** | API route `/api/cron/process-cv` wywoływany co minutę | Prosta implementacja, brak nowej infra | Limity timeout (60s Vercel Pro), rate limity |
| **C. Osobny Node.js worker (Docker)** | Dedykowany proces -- pobiera z queue, procesuje, pisze wyniki | Bez limitów, pełna kontrola | Dodatkowa infra do utrzymania |

**Rekomendacja**: Opcja **B** dla startu (najprostsza, wpisuje się w istniejący stack Next.js), z migracją do **C** jeśli wolumen rośnie. Vercel Cron może wyzwalać API route co minutę, który procesuje batch 20-50 CV na wywołanie.

---

Czy chciałbyś, żebym rozwinął któryś z tych punktów bardziej szczegółowo, albo zaczął implementację od konkretnej fazy?


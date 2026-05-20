# UI Bugs / UX Issues Report

**Środowisko:** https://compass.dynaminds.pl (Hetzner staging)
**Tester:** Claude Code (autonomous via Chrome MCP)
**Data startu:** 2026-04-28
**Stan:** w trakcie eksploracji

---

## Legenda

- **CRITICAL** — blokuje główny user journey, app nie działa
- **HIGH** — istotny błąd UX, frustracja userów, ale flow obejść można
- **MEDIUM** — drobny błąd UX, nieintuicyjność, brak hint'a
- **LOW** — kosmetyczne, dla nice-to-have

---

## #001 [HIGH] — Komunikat o domain whitelisting pokazany dopiero po submit signup

**Strona:** `/login` (signup form)
**Rola:** publiczny / przyszły user
**Severity:** HIGH (frustracja)

### Repro
1. Otwórz `https://compass.dynaminds.pl/login`
2. Kliknij "Zarejestruj się"
3. Wpisz email z domeny innej niż `@b2bnetwork.pl` (np. `test@compass.test`)
4. Wypełnij imię, password, RODO
5. Kliknij "Zarejestruj się"

### Obserwowane zachowanie
Po submit pokazuje się czerwony komunikat: **"Rejestracja dozwolona tylko dla domeny @b2bnetwork.pl"**.

### Oczekiwane zachowanie
Komunikat o ograniczeniu domeny powinien być widoczny:
- jako hint/placeholder pod polem email **przed** submit, np. "Tylko email firmowy @b2bnetwork.pl"
- albo na walidacji email field on-blur (real-time, gdy user kończy pisać)

### Konsekwencja dla testów
Wszystkie test accounts muszą być na `@b2bnetwork.pl`. Wymaga decyzji od stakeholdera:
- czy używamy plus-aliasów (np. `e2e+consultant@b2bnetwork.pl`)
- czy wyłączamy guard w środowisku staging
- czy rozszerzamy whitelist o `@compass.test` w env

### Plik(i) backendu (do prześledzenia)
- guard prawdopodobnie w server action `signup` w `app/login/page.tsx` lub `lib/actions/auth.ts`
- alternatywnie: trigger PG `handle_new_user` lub policy w Supabase Auth → "Email signups → restrict domain"

### Status
Otwarty — czeka na decyzję usera przy tworzeniu test accounts.

### Screenshot
`docs/screenshots/consultant/signup-domain-blocked.png` (do dograć)

---

## #002 [INFO] — Email confirmation wymagana, brak "wyślij ponownie" w UI

**Strona:** `/login`
**Rola:** publiczny / nowo zarejestrowany user
**Severity:** LOW

### Repro
1. Zarejestruj nowe konto (`e2e+consultant@b2bnetwork.pl`)
2. Otrzymasz "Rejestracja zakończona sukcesem!"
3. Spróbuj się od razu zalogować
4. Pokazuje się: **"Twoje konto czeka na aktywację. Sprawdź skrzynkę pocztową — wysłaliśmy Ci link potwierdzający."**

### Brakuje
- Brak buttonu "Wyślij ponownie link aktywacyjny" (gdy email nie dotarł / spam)
- Brak countdown'a "Kolejny link za 60s" (rate limit info)
- Brak hint'a co zrobić jeśli email nie dotrze (sprawdzić spam, zmienić email)

### Sugestia
Pod komunikatem dodać sekcję "Nie dostałeś maila?" z buttonem "Wyślij ponownie" i info o spam check.

### Plik(i) do modyfikacji
- `app/login/page.tsx` — sekcja błędu logowania (gdzie pojawia się komunikat "Twoje konto czeka na aktywację")

### Status
Otwarty — fix nie blokujący, dodać do backlogu.

---

## #003 [CRITICAL] — `/privacy-policy` pusta na prod (RODO compliance ryzyko)

**Strona:** `/privacy-policy`
**Rola:** publiczny
**Severity:** CRITICAL (prawne ryzyko)

### Repro
1. Otwórz `https://compass.dynaminds.pl/privacy-policy`
2. Widzisz: **"Strona w przygotowaniu. Treść polityki prywatności i informacje o przetwarzaniu danych osobowych (RODO) zostaną udostępnione wkrótce."**

### Konsekwencja prawna
W signup formie user akceptuje "Politykę prywatności" przez RODO checkbox + signup formularz dodatkowo łączy się z polityką prywatności i przetwarzaniem danych. Z prawnej perspektywy:
- Akceptacja "polityki prywatności" gdy polityka jest pusta jest **nieskuteczna jako zgoda RODO**
- Każda zarejestrowana osoba ma podstawę prawną do unieważnienia zgody
- W razie audytu/skargi UODO → poważne ryzyko kary

### Diagnoza
Frontend ([app/privacy-policy/page.tsx:9–15](COMPASS/app/privacy-policy/page.tsx)) poprawnie czyta z `um_legal_documents` table przez Supabase. Pokazuje placeholder gdy `doc === null`.

Tabela `um_legal_documents` na prod jest **PUSTA**. Migracja `supabase/migrations/20260311_legal_documents_and_consents.sql` (która seedie 10 legal docs: privacy-policy, terms, help, security, cooperation, ai-notice, electronic-signature, access-management, incident-response, data-retention) **nie została uruchomiona** lub jej seed został usunięty.

### Fix natychmiastowy (do uruchomienia przez admin z dostępem do CRON_SECRET)
```bash
curl -X GET "https://compass.dynaminds.pl/api/migrate-compliance?secret=$CRON_SECRET"
```

To uruchomi: tworzenie tabel (idempotent) + seed 10 dokumentów + RLS policies. Po wywołaniu wszystkie 3 strony (#003, #004, #005) zaczną pokazywać prawdziwą treść.

### Pliki referencyjne
- [app/privacy-policy/page.tsx](COMPASS/app/privacy-policy/page.tsx) — frontend (działa)
- [app/api/migrate-compliance/route.ts](COMPASS/app/api/migrate-compliance/route.ts) — endpoint do uruchomienia migracji
- [supabase/migrations/20260311_legal_documents_and_consents.sql](COMPASS/supabase/migrations/20260311_legal_documents_and_consents.sql) — seed danych

### Status
**OTWARTY — wymaga natychmiastowego fixu.** Dopóki nie ma poprawnej polityki prywatności, blokuje produkcyjne onboarding nowych konsultantów.

---

## #004 [CRITICAL] — `/terms` pusta na prod (legal compliance ryzyko)

**Strona:** `/terms`
**Severity:** CRITICAL

### Repro
1. Otwórz `https://compass.dynaminds.pl/terms`
2. Widzisz: **"Terms of Service / Regulamin — Strona w przygotowaniu. Regulamin korzystania z usługi COMPASS zostanie udostępniony wkrótce."**

### Konsekwencja
Identyczna jak #003 — Regulamin musi istnieć żeby użytkownik mógł go skutecznie zaakceptować w signup. Bez niego cała umowa B2B między B2B Network a konsultantem jest zwarcie nieprzejrzysta.

### Fix
Ten sam co #003 — `GET /api/migrate-compliance?secret=...` insertuje też dokument o slug `terms`.

### Pliki
- [app/terms/page.tsx](COMPASS/app/terms/page.tsx) (frontend — OK)

### Status
**OTWARTY — wymaga fixu razem z #003 (jedno wywołanie migrate-compliance załatwi oba).**

---

## #005 [HIGH] — `/help` pusta na prod (UX bez dokumentacji)

**Strona:** `/help`
**Severity:** HIGH

### Repro
1. Otwórz `https://compass.dynaminds.pl/help` (lub link "Pomoc" ze stopki signup)
2. Widzisz: **"Centrum Pomocy — Strona w przygotowaniu. Treść centrum pomocy zostanie udostępniona wkrótce."**

### Konsekwencja
- Nowi konsultanci nie wiedzą jak zacząć
- Nie ma FAQ ani onboarding instructions
- Każde zapytanie do supportu = ticket

### Fix
Identycznie — `GET /api/migrate-compliance?secret=...`. Jeśli seed nie zawiera dokumentu `help` — trzeba go dodać do migracji.

### Status
OTWARTY.

---

## #006 [MEDIUM] — 404 nie jest pokazywane dla zalogowanego usera bez consent

**Strona:** `/<dowolny nieistniejący URL>` gdy user jest zalogowany ale nie zaakceptował consent
**Severity:** MEDIUM (UX/debuggability)

### Repro
1. Zaloguj się (rola admin)
2. Jeśli current terms version != accepted version → middleware redirect do `/consent`
3. Otwórz `/jakas-strona-ktora-nie-istnieje`
4. Zostaniesz przekierowany do `/consent` zamiast widzieć 404

### Diagnoza
[middleware.ts:39–80](COMPASS/middleware.ts) najpierw robi consent gate sprawdzanie i wszystkie URL przekierowuje do `/consent`. Dopiero PO submit consent dostaję się do faktycznej strony — gdzie wówczas jest 404.

### Konsekwencja
- Jeśli admin ma niezakceptowane consent + przejdzie po 404 link → utknie w consent loopie
- Debug w sytuacjach edge-case bardzo trudny

### Sugestia
W middleware: jeśli requested URL nie pasuje do żadnej znanej route (i nie jest /consent /onboarding /login), pokaż 404 wraz z linkiem "Najpierw zaakceptuj regulaminy".

### Pliki
- [middleware.ts](COMPASS/middleware.ts) — kolejność guards (consent → not-found)

### Status
OTWARTY, niski priorytet. Zostawić do listy enhancement.

---

## #007 [HIGH] — Akceptacja regulaminów wymaga dokumentów które są PUSTE

**Strona:** `/consent`
**Severity:** HIGH (compound bug z #003/#004/#005)

### Repro
1. Zaloguj się (admin lub konsultant z niezaakceptowanym consent)
2. Pokazuje się modal "Akceptacja regulaminów" z 4 checkboxami:
   - Akceptuję Regulamin platformy COMPASS + link "Przeczytaj dokument" → `/terms` (PUSTE — bug #004)
   - Zapoznałem/am się z Polityką prywatności + link "Przeczytaj dokument" → `/privacy-policy` (PUSTE — bug #003)
   - Wyrażam zgodę na przetwarzanie danych osobowych zgodnie z RODO (no doc link)
   - Akceptuję korzystanie z narzędzi AI w systemie + link "Przeczytaj dokument" → `/docs/ai-notice` (prawdopodobnie też PUSTE — to potwierdzić)

### Konsekwencja
**Złamane wymaganie RODO:** zgody są wymagane na pustkach. User akceptuje 4 dokumenty których nie może przeczytać. To typowy "dark pattern" prawnie nielegalny w UE.

### Fix
Te same migrate-compliance jak w #003/#004/#005 wstawi te dokumenty. Plus należy zablokować consent UI gdy `getLegalDocument(slug) === null` ([app/(protected)/consent/page.tsx](COMPASS/app/(protected)/consent/page.tsx)).

### Status
**KRYTYCZNY** — connected to #003/#004/#005. Jeden fix (migrate-compliance) załatwia większość, ale dodatkowo zablokować consent gdy doc missing (defense in depth).

---

(kolejne bugi będą dopisywane podczas eksploracji)

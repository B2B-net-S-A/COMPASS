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

(kolejne bugi będą dopisywane podczas eksploracji)

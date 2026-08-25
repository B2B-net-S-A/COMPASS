# Incydent 2026-08-25 — „zniknął nam cały kanban" (skrzynka administracja@)

**Środowisko:** produkcja `compass.dynaminds.pl` (Coolify / Hetzner) + Supabase `shduiynzemftkqqefscd`
**Zgłoszenie:** Artur, ~10:20 czasu PL — tablica Zgłoszeń pusta (0 w każdej kolumnie), bez komunikatu błędu
**Przywrócenie:** ~12:15 czasu PL, deploy `d9883de` — komplet 219 spraw z powrotem na tablicy
**Utrata danych:** **żadna** — wszystkie 219 spraw, komentarze, przypisania i priorytety były w bazie przez cały czas

---

## Streszczenie wykonawcze

Tablica Kanban skrzynki administracja@ (`/internal/people?tab=sprawy` oraz `/admin/inbox`) renderowała się
pusta, mimo że dane były nietknięte, RLS przepuszczał, a Supabase odpowiadał `200` z kompletem wierszy.

**Prawdziwa przyczyna: długość URL-a zapytania.** Aplikacja pytała o metadane spraw przez
`support_inbox_meta?ticket_id=in.(397 UUID)` — query string ~15 kB. Takie żądania były ucinane na trasie
do kontenera aplikacji. Naprawa: pytanie **paczkami po 60 id** (URL ~2,5 kB).

Diagnoza zajęła ~2 h, bo problem był przykryty trzema niezależnymi warstwami — każda maskowała następną
i każda wymagała osobnej naprawy. Dwie z nich to realne defekty, które istniały wcześniej i zostały
przy okazji usunięte.

---

## Oś czasu

| Czas (PL) | Zdarzenie |
|---|---|
| ~10:20 | Zgłoszenie: pusta tablica, zero komunikatu |
| 10:30 | Weryfikacja bazy: 219 spraw na miejscu, RLS OK (symulacja JWT) — dane bezpieczne |
| 10:45 | Znaleziona **warstwa 1** (ciche połykanie błędów) → PR #343 |
| 11:00 | Deploy #343 → zamiast pustki pojawia się baner `TypeError: fetch failed` |
| 11:20 | Znaleziona **warstwa 2** (zatruty Data Cache) + over-fetch 4 MB → PR #344 + migracja |
| 11:55 | Deploy #344 → baner nadal; hipoteza „za duża odpowiedź" |
| 12:05 | **Obalenie hipotezy:** zakładki Exit/Onboarding/Mapa renderują 0,8–1 MB i działają |
| 12:08 | **Rozstrzygnięcie:** analiza edge logów przy pojedynczym renderze → długość URL |
| 12:15 | Deploy #346 (pytanie paczkami) → **tablica wróciła, 219 spraw** |
| 12:21 | Deploy #345 — dostępy TCM/finanse (osobny wątek, prośba Artura w trakcie incydentu) |

---

## Warstwy przyczyn

### Warstwa 1 — ciche połykanie błędów (defekt istniejący wcześniej)

`listInboxTickets` w trzech miejscach ignorował `error` z zapytania (`const { data } = await …`).
Awaria → `data = null` → pusta `metaMap` → `if (!meta) continue` wycinało **każdy** ticket → funkcja
zwracała `success: true` z pustymi kolumnami.

**Skutek diagnostyczny:** awaria infrastruktury wyglądała jak „nie ma żadnych spraw". Wszystkie warstwy
(baza, RLS, sieć na poziomie edge) raportowały zdrowie, więc pierwsze 40 minut poszło na wykluczanie
rzeczy, które działały.

**Naprawa (PR #343):** awarie zapytań krytycznych dla renderu → `throw` → jawny baner z przyczyną.
Awarie zapytań dekoracyjnych (nazwiska, etykiety) świadomie zostają miękkie — degradują wyświetlanie,
nie chowają danych.

### Warstwa 2 — zatruty Data Cache Next.js (defekt istniejący wcześniej)

Nieudany rezultat fetchu lądował w Data Cache pod kluczem URL-a i był odtwarzany przy kolejnych
renderach **bez dotykania sieci**. Dowód: rendery z błędem, dla których w edge logach Supabase nie ma
ani jednego zapytania. Świeży kontener psuł się po pierwszym nieudanym fetchu i taki zostawał — stąd
mylące wrażenie „deterministycznej awarii aplikacji".

**Dodatkowe ryzyko (usunięte przy okazji):** klucz Data Cache to URL bez nagłówków, więc zapytanie
uwierzytelnione per-user mogło w zasadzie zostać zaserwowane innemu użytkownikowi.

**Naprawa (PR #344):** `hardenedFetch` — wymuszone `cache: 'no-store'` na serwerowych klientach
Supabase + retry sieciowych GET/HEAD.

### Warstwa 3 — długość URL-a zapytania (**właściwa przyczyna incydentu**)

Po zdjęciu warstw 1–2 baner pokazał `TypeError: fetch failed`. Analiza edge logów przy pojedynczym
renderze rozstrzygnęła sprawę:

| Zapytanie | Długość URL | Odpowiedź Supabase | Wynik w kontenerze |
|---|---|---|---|
| `support_tickets?category_id=in.(5 UUID)` | ~300 B | 200, 397 wierszy (259 kB) | ✅ za pierwszym razem |
| `support_inbox_meta?ticket_id=in.(397 UUID)` | **~15 kB** | 200, 397 wierszy — **3× pod rząd** | ❌ `fetch failed` × 3 |

Trzy próby to retry z `hardenedFetch`. Supabase za każdym razem odpowiadał poprawnie i kompletnie —
odpowiedź nie docierała do aplikacji.

**Hipoteza „za duża odpowiedź" — obalona:** zakładki Exit (1,0 MB), Onboarding (829 kB) i Mapa
technologiczna (803 kB) renderowały się bez błędu przez cały czas trwania incydentu. Ten sam 17 kB URL
wykonany z laptopa przechodził — problem leży na trasie do kontenera (proxy/edge po stronie hosta).

**Naprawa (PR #346):** meta pobierane paczkami po 60 id (URL ~2,5 kB), tickety stronicowane po 30
(profilaktycznie). Mechanizm poprawny także na zdrowej sieci — koszt to kilkanaście małych żądań
zamiast dwóch dużych.

---

## Znalezione przy okazji (naprawione)

| Znalezisko | Skala | Naprawa |
|---|---|---|
| `select('*')` na `support_inbox_meta` ciągnął ~4,1 MB martwych treści maili (Phase 44) przy każdym renderze; pojedyncze wiersze do 441 kB | over-fetch na każdym wejściu na tablicę | Jawna lista kolumn + migracja: treści do `support_inbox_email_archive` (178 wierszy, service-only), 5 martwych kolumn zdjętych |
| Data Cache mógł serwować odpowiedź jednego użytkownika innemu | ryzyko wycieku danych | `cache: 'no-store'` na klientach serwerowych |
| `postgrest-js` po odrzuceniu fetchu zwraca zwykły obiekt, nie `Error` — `instanceof Error` maskował przyczynę | błędy w UI jako generyczny fallback | Helper `errorMessage()` czytający `.message` z obiektów nie-`Error` |
| Dryf typów: `pinned_at`/`pinned_by` (Phase 52) nigdy nie trafiły do `database.types.ts` | `tsc --noEmit` czerwony na czystym `main` | Typy uzupełnione |

---

## Zmiany (wszystkie na produkcji)

| PR | Zawartość |
|---|---|
| [#343](https://github.com/artur-t-96/compass/pull/343) | Awaria zapytania nie udaje pustej tablicy (guardy + jawna lista kolumn) |
| [#344](https://github.com/artur-t-96/compass/pull/344) | `hardenedFetch` (no-store + retry), archiwum treści maili + DROP 5 kolumn, `errorMessage()`, sync typów |
| [#346](https://github.com/artur-t-96/compass/pull/346) | **Naprawa incydentu:** pytanie paczkami / stronicowanie |
| [#345](https://github.com/artur-t-96/compass/pull/345) | Dostępy: rola TCM + grant `has_tcm_access` otwierają skrzynkę i People Ops |

**Migracje (zaaplikowane przez MCP):** `inbox_email_archive_and_drop`, `tcm_role_inbox_access`.
**Testy:** 26 w `support-inbox.test.ts` (+ paginacja, + dostęp TCM, + awarie zapytań), 6 w `fetch-hardening.test.ts`.

---

## Wnioski na przyszłość

1. **Nie wrzucaj setek id do `.in()`.** Przy ~400 UUID query string ma 15 kB i bywa ucinany między edge
   a aplikacją. Pytaj paczkami (60 id ≈ 2,5 kB), listy stronicuj `.range()`.
2. **Cicha degradacja kosztuje godziny.** `const { data } = await …` bez sprawdzenia `error` zamienia
   awarię infrastruktury w „pustą listę bez błędu" — wszystkie warstwy wyglądają zdrowo. Zawsze
   `if (error) throw` **oraz** `if (data === null) throw` przy zapytaniach wielowierszowych.
3. **Wzorzec diagnostyczny dla „dane są, UI puste":**
   - render z wynikiem, ale **bez zapytań w edge logach** → odpowiedź przyszła z Data Cache;
   - zapytanie **200 z pełnym `content-range`**, a aplikacja mówi `fetch failed` → porównaj **długość URL-i**
     żądań, które przechodzą, z tymi, które padają (nie rozmiar odpowiedzi — to myląca pierwsza hipoteza).
4. **Testuj hipotezę na kontrprzykładzie, zanim ją wdrożysz.** Teza „za duża odpowiedź" upadła w minutę,
   gdy sprawdziłem inne zakładki ciągnące 1 MB. Gdybym sprawdził to wcześniej, oszczędziłbym jeden cykl
   deployu (~15 min).
5. **`select('*')` na tabeli z tłustymi kolumnami to bomba z opóźnionym zapłonem** — rozmiar rośnie
   z danymi. Jawna lista kolumn w zapytaniach listowych; `select('*')` tylko dla pojedynczego wiersza.

---

## Dług otwarty

- **Przyczyna po stronie hosta nie została naprawiona** — obcinanie długich URL-i na trasie do kontenera
  (proxy/edge Coolify?) nadal istnieje. Aplikacja jest na to odporna (krótkie URL-e), ale inne moduły
  mogą wdepnąć w to samo. Diagnoza wymaga dostępu SSH do serwera compass — poza zasięgiem tej sesji.
- **Audyt pozostałych `.in()` z dużymi listami** w `lib/actions/` — ten sam wzorzec może czekać gdzie indziej.
- **Deploye Coolify padają przejściowo** (exit 255 na `docker compose build`, ~75 s) — 2 z 4 deployów
  tej sesji wymagały ręcznego retry. Warto dodać automatyczny retry w workflow.

# Opieka TCM — uzupełnienie opiekunów + auto-usuwanie po NEXUSIE (2026-09-07)

Raport z realizacji dwóch zadań wokół zakładki **People Ops → Opieka**. Źródło danych:
arkusz `Opiekunowie TCM klienci all POPRAWNY.xlsx` (zakładka `Kontrakty`, 456 wierszy / 449 osób,
kolumna „Opiekun TCM" z imieniem: Patryk / Ignacy / Paula / Błażej).

---

## Zadanie 1 — przypisanie opiekunów w „Opiece" ✅ WDROŻONE NA PRODUKCJI

### Co zrobiono
Migracja **`20260907114609_opieka_owner_tcm_backfill`** ustawia `contractors.owner_tcm_id`
dla osób z listy opieki, zgodnie z arkuszem. Zaaplikowana przez Supabase MCP 2026-09-07;
plik w `COMPASS/supabase/migrations/`. Migracja jest idempotentna i ma self-check, który
cofa całość, gdyby liczba trafień odbiegała od oczekiwanej.

### Mapowanie imię → konto opiekuna
Arkusz podaje tylko imię. Mapujemy na jedyne konta z rolą `talent_community`:

| Arkusz | Konto Compass | `profiles.id` |
|---|---|---|
| Patryk | Patryk Świętoń | `5b22476f-0318-4292-8be9-368aef5c6173` |
| Ignacy | Ignacy Kotecki | `313dcd27-b3fa-4d49-9322-0152f20caea5` |
| Paula | **Paulina Makuch** | `7dcf283f-63e3-4951-97e7-8aaa24d3f807` |
| Błażej | Błażej Bęben | `7964a947-b277-407c-b587-1e90abf68771` |

> ⚠ „Paula" = Paulina Makuch to **założenie**: to jedyna osoba na „Paul…" w roli TCM,
> a moduł `name-normalization.ts` celowo zostawia „Paula" jako niejednoznaczne. Jeśli chodziło
> o kogoś innego — daj znać, zmiana to jedna linia UUID.

### Dopasowanie nazwisk
W bazie nazwiska bywają z literówkami, odwróconym imieniem/nazwiskiem, w wersalikach i z twardą
spacją. Dopasowanie = **fold diakrytyków** (`lower` → `translate`) + **sort tokenów**, ograniczone
do osób **na liście opieki** (u klienta / bench, liczonej z `client_entries` / `client_departures`
/ `contractor_bench`) i tylko do trafień z **jednoznacznym** opiekunem.

### Wynik (stan po wdrożeniu)
Lista opieki: **330 osób**. Po backfillu **238 ma opiekuna**, 92 nie ma.

| Opiekun | Na liście opieki |
|---|---|
| Ignacy Kotecki | 74 |
| Błażej Bęben | 70 |
| Paulina Makuch | 63 |
| Patryk Świętoń | 31 |
| (brak) | 92 |

Zapisano opiekuna dla **233 osób** (231 dopasowań algorytmicznych + 2 korekty ręczne poniżej);
pozostałe 5 z 238 miało już wcześniej poprawnego opiekuna. Rozkład na liście opieki różni się od
sum w arkuszu (Patryk 131 / Ignacy 109 / Paula 108 / Błażej 108) — bo arkusz obejmuje też osoby,
które **już zeszły z projektów** i nie są na dzisiejszej liście opieki (np. duży portfel Patryka na
Nordei już odszedł).

### Korekty ręczne (poza dopasowaniem algorytmicznym)
- **Agnieszka Lisiecka** — w arkuszu u dwóch klientów z różnym opiekunem (Polkomtel = Paula,
  Cyfrowy Polsat = Ignacy). Rozstrzygnięto po **bieżącym kliencie** (Cyfrowy Polsat → **Ignacy**).
- **Tomasz Murgarbia** — literówka w arkuszu „Murgrabia" (Nordea → **Błażej**).

### Świadomie NIE ruszone (92 bez opiekuna)
Pełna lista z powodami: **`docs/opieka-bez-opiekuna-2026-09-07.csv`**. Kategorie:

1. **Łukasz Śniadowski** (ATOS) — w arkuszu ma Nordea/Paula i MS Enter-Prise/Ignacy, a w Compassie
   siedzi na ATOS → z arkusza nie da się rozstrzygnąć. Wymaga ręcznej decyzji.
2. **Do weryfikacji (możliwa literówka)**:
   - **Ihar Taras** (Nordea) ≈ arkusz „Igor Taras" (Paula) — inna transliteracja imienia.
   - **Jacek Kossowski** (Bank Pocztowy) ≈ arkusz „Jacek Kosowski", ale u innego klienta (Nordea)
     — może inna osoba.
3. **Duplikat rekordu**: **Andrzej Strożyński** i **Andrzej Stróżyński** (oba PFRON) to najpewniej
   ta sama osoba w dwóch rekordach `contractors` (różnica `ó`/`o`). Żadnego nie ma w arkuszu.
   Warto scalić rekordy niezależnie od opieki.
4. **Reszta (~87)** — osoby, których **klienta arkusz nie obejmuje** (PFRON, BIK, Carrefour, NBP,
   Samsung, Santander, XPERI, mLeasing, ERGO, EY, PEKAO, Wedel, Ministerstwo Sprawiedliwości,
   BNP Paribas Cardif, Frontex/Atos, ATOS) albo są tylko na benchu i nie ma ich w pliku. Arkusz nie
   niesie dla nich informacji o opiekunie → zostawione bez zmian. Do uzupełnienia ręcznego (masowe
   przypisanie w zakładce Opieka) albo kolejnym arkuszem.

### Weryfikacja
Zweryfikowane bezpośrednio na bazie produkcyjnej (rozkład opiekunów na liście opieki, powyżej).
Weryfikacja UI (renderowanie zakładki Opieka) wymaga zalogowania konta z rolą TCM/admin — zakładka
czyta dokładnie te dane z `contractors.owner_tcm_id`, które potwierdzono zapytaniem.

---

## Zadanie 2 — auto-usuwanie po „WSPÓŁPRACA ZAKOŃCZONA" w NEXUSIE ⏳ WYMAGA NAJPIERW MOSTU TOŻSAMOŚCI

### Ustalenia
- Cel: gdy w NEXUSIE status konsultanta zmienia się na **„WSPÓŁPRACA ZAKOŃCZONA"**, Compass ma
  **zapisać zejście** (osoba znika z listy opieki) i **zdjąć opiekuna TCM**. Decyzja o semantyce:
  *zejście + zdjęcie opiekuna* (zachowuje pełną historię; spójne z tym, jak Compass modeluje odejścia).
- **Sygnał jest dziś ignorowany.** Cron `nexus-contractors-sync` (`app/api/cron/nexus-contractors-sync/route.ts`)
  odbiera z NEXUSA pola `status` / `end_date` / `lacks_current_order`, ale **żadnego nie czyta** —
  dopisuje wyłącznie tożsamość (`nexus_contract_id`), nie rusza kartoteki. Napis „WSPÓŁPRACA ZAKOŃCZONA"
  nie występuje nigdzie w kodzie Compassa.
- Compass **nigdy nie usuwa** kontraktora (brak `.delete()` na `contractors`), a `contractors.status`
  jest martwe w logice. „Zejście z listy opieki" modeluje się wpisem do `client_departures`.

### Blokada: most tożsamości NEXUS↔Compass jest PUSTY
Stan produkcji 2026-09-07: **0 / 691** kontraktorów ma `nexus_contract_id`; wszystkie mają
`nexus_match_status = null`, `nexus_synced_at = null`. Czyli sync tożsamości **nigdy nikogo nie
powiązał**. Powód: auto-link działa **tylko po unikalnym e-mailu**, a kontraktorzy nie mają e-maili
(dopasowanie po nazwisku jest w kodzie celowo zabronione). Bez powiązania sygnał „zakończenia"
z NEXUSA **nie ma jak trafić** na właściwego kontraktora w Compassie.

### Diagnoza dokładna (2026-09-07)
Kod mostu jest **kompletny i dobrze pomyślany** — brakuje tylko jego URUCHOMIENIA:
- `app/api/cron/nexus-contractors-sync/route.ts` pobiera kontraktorów z NEXUSA, liczy werdykty
  (`lib/contractors/nexus-match.ts`) i zapisuje `nexus_contract_id` / `nexus_match_status` / `nexus_synced_at`.
- Reguła: auto-link **tylko** po unikalnym e-mailu; bez e-maila (dziś wszystkie) → **podpowiedzi po
  nazwisku** trafiające do **kolejki człowieka** (`pending` / `ambiguous`), a ręczne „nie ma w NEXUSIE"
  zostaje `not_found`. Kolejkę obsługuje zakładka **People Ops → Tożsamość NEXUS**
  (`NexusIdentityQueue.tsx`, akcje `linkContractorToNexus` / `dismissNexusMatch`).
- `NexusContractor` **już niesie** `status` / `end_date` / `lacks_current_order` — sygnały do Zadania 2.

**Sync NIGDY nie ruszył:** `audit_logs` ma **0** zdarzeń `NEXUS_CONTRACTORS_SYNC_RUN` /
`CONTRACTOR_LINKED_TO_NEXUS`; brak workflow GH Actions dla tej trasy (są tylko dla `legal-monitor-alerts`
i `timesheet-reminder`), a crony Coolify są zawodne (patrz saga martwych cronów). Dlatego `nexus_match_status`
= `null` u wszystkich 691 i kolejka „Tożsamość NEXUS" jest pusta.

### Checklist aktywacji mostu (kolejność: „najpierw most tożsamości")
1. **[strona NEXUSA — poza tym repo]** Wystawić endpoint eksportu kontraktorów, który Compass pobiera:
   paginowany `{ items: NexusContractor[], has_more }`, gdzie każdy `item` niesie `nexus_contract_id`,
   `candidate {name,lastname,email}`, `client_name`, `status`, `start_date`, `end_date`, `lacks_current_order`.
2. **[Coolify env vault]** Ustawić `NEXUS_CONTRACTORS_URL` (adres z p.1) + `NEXUS_CONTRACTORS_API_KEY`
   (nagłówek `X-API-Key`). Bez nich trasa zwraca 500 (`stage:config`) — świadomie widoczna awaria.
3. **[Compass repo — mogę zrobić]** Dodać scheduler GH Actions `cron-nexus-contractors-sync.yml`
   (wzór: `cron-legal-monitor-alerts.yml`, Bearer `CRON_SECRET`, minuta ≠ :00). GH, nie Coolify —
   bo to ścieżka zweryfikowana i widoczna w UI.
4. **[ludzie]** Po pierwszym przebiegu przejść kolejkę „Tożsamość NEXUS" i pozostawiać `linked` /
   `not_found`. Dopiero powiązani kontraktorzy będą podatni na auto-usuwanie.
5. **[Compass repo — kolejny etap]** Wpiąć obsługę „WSPÓŁPRACA ZAKOŃCZONA": w cronie sync, dla
   kontraktora `linked` z odpowiednim sygnałem (`status`/`end_date`/`lacks_current_order`) →
   zapis `client_departures` + `owner_tcm_id = null` (semantyka ustalona wyżej).

Punkty 1–2 są **blokujące i po Waszej stronie** (NEXUS + env); bez nich scheduler tylko generuje
awarie 500. Punkty 3 i 5 mogę zrobić w Compassie, gdy 1–2 są gotowe (albo 3 od razu jako dormant/manual).

### Zrobione teraz: scheduler DORMANT + runbook
Dodano `.github/workflows/cron-nexus-contractors-sync.yml` w stanie **dormant** (tylko `workflow_dispatch`,
`schedule:` zakomentowany). Rozróżnia 500 „stage:config" (most nieustawiony → run zielony, ostrzeżenie)
od realnej awarii (czerwony), więc bezpiecznie testuje przed konfiguracją.

**Jak domknąć most (gdy zechcesz):**
1. Ustal, czy NEXUS wystawia eksport kontraktorów (repo `artur-t-96/Nexus`; kształt w kroku 1 checklisty).
   Jeśli nie — to najpierw praca po stronie NEXUSA.
2. Wrzuć adres i klucz jako **sekrety repo** (np. `NEXUS_CONTRACTORS_URL`, `NEXUS_CONTRACTORS_API_KEY`),
   potem odpal workflow **„Coolify set env"** dwa razy z `value_from_secret` (żeby wartość nie trafiła do
   metadanych runa). To ustawi je w env vault Coolify + zrobi restart.
3. Odpal **„NEXUS contractors sync (DORMANT — manual only)"** ręcznie (Run workflow). Oczekiwane:
   `HTTP 200` + `{linked, pending, ambiguous, not_found}`. Wynik `stage:config` = env dalej brak.
4. Wejdź w People Ops → **Tożsamość NEXUS** i przejdź kolejkę (zatwierdź powiązania / odrzuć „nie ma w NEXUSIE").
5. Gdy przebieg jest stabilny — odkomentuj `schedule:` w workflow (minuta ≠ :00). Wtedy dopiero ma sens
   krok 5 checklisty (obsługa „WSPÓŁPRACA ZAKOŃCZONA") — mogę go dołożyć.

---

## Pliki
- `COMPASS/supabase/migrations/20260907114609_opieka_owner_tcm_backfill.sql` — backfill (wdrożony).
- `COMPASS/docs/opieka-bez-opiekuna-2026-09-07.csv` — 92 osoby bez opiekuna, z powodem.
- `.github/workflows/cron-nexus-contractors-sync.yml` — scheduler mostu tożsamości, DORMANT (manual).

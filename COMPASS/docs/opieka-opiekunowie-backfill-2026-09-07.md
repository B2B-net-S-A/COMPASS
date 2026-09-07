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

### Kolejność (decyzja: „najpierw most tożsamości")
1. **Najpierw** doprowadzić powiązanie kontraktorów z NEXUSEM do realnego działania — to jest właściwa
   blokada (brak e-maili / klucza do linkowania; sprawdzić, czy cron w ogóle jest odpalany i czy
   `NEXUS_CONTRACTORS_URL` / `NEXUS_CONTRACTORS_API_KEY` są ustawione).
2. **Dopiero potem** wpiąć obsługę „WSPÓŁPRACA ZAKOŃCZONA": po stronie crona sync, dla powiązanego
   kontraktora → zapis `client_departures` + `owner_tcm_id = null`.

To osobny kawałek pracy, zależny od strony NEXUSA (jakie dokładnie pole/wartość wysyła i jak
zbudować most tożsamości). Semantyka po stronie Compassa jest już ustalona (patrz wyżej).

---

## Pliki
- `COMPASS/supabase/migrations/20260907114609_opieka_owner_tcm_backfill.sql` — backfill (wdrożony).
- `COMPASS/docs/opieka-bez-opiekuna-2026-09-07.csv` — 92 osoby bez opiekuna, z powodem.

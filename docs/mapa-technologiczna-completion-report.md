# Mapa technologiczna — raport ukończenia Etapu 1 (Phase 46, 2026-08-03)

## Co zostało zbudowane (Etap 1 — MVP: karta rozmowy)

Moduł tech-intel dla zespołu TCM: po każdej rozmowie z kontraktorem u klienta TCM wypełnia
strukturalną kartę wg skryptu (blok A zawsze + rotacyjny B/C/D). Karty będą agregowane
w mapę technologiczną klientów (Etap 2). Moduł jest **ewolucją modułu Kontraktorzy** —
reużywa `contractors`, `clients`, guardów TCM i huba People Ops; karta żyje obok
istniejącego logu rozmów opieki (`contractor_conversations`), z którym dzieli oś czasu.

## Pliki

**Migracje (aplikowane przez Supabase MCP przy wdrożeniu):**
- `COMPASS/supabase/migrations/20260803120000_phase46a_tech_map_dictionaries.sql` —
  `technologies` (stabilny slug pod sync z NEXUS, aliasy, kategorie, is_verified, seed ~130),
  `vendors`, `client_areas`; RLS split select/insert/update (bez DELETE) na `has_lifecycle_access()`.
- `COMPASS/supabase/migrations/20260803121000_phase46b_tech_interview_cards.sql` —
  `tech_interview_cards` (draft→finalizacja, pola bloków, `*_alerted_at` pod Etap 3),
  junctions `_technologies`/`_vendors` (RESTRICT), `_initiatives`, `tech_block_assignments`
  (UNIQUE per kontraktor/kwartał, source auto/manual).

**Backend:**
- `COMPASS/lib/types/tech-map.ts` — enumy + etykiety PL + Row/ViewModel + `generateTechSlug`.
- `COMPASS/lib/tech-map/{validation,block-rotation,freshness}.ts` + `__tests__/` (44 testy) —
  matryca kompletności finalizacji, cykl B→C→D (`computePlannedBlock` — czysty, bez zapisu
  w renderze), świeżość danych (progi 6 mies. / 90 dni pod Etapy 2-3).
- `COMPASS/lib/actions/tech-map.ts` + `__tests__/tech-map.test.ts` (16 testów) — słowniki
  (tag-picker dodaje unverified; admin CRUD; delete łapie 23503), karty (createCardDraft /
  saveCard / finalizeCard z regułą zgodności przydziału, listCards, getCardDetail),
  `getPreInterviewBrief` (blok + prefill klienta przez normalizeClientName + wspólna oś czasu
  kart i rozmów), `createClientForTechMap` (świadome rozszerzenie: TCM dodaje klienta
  z formularza — znormalizowane, audytowane, ta sama tabela `clients`).
- `COMPASS/lib/actions/audit.ts` — 10 nowych literałów `TECH_*` + `CLIENT_CREATED_FROM_TECH_MAP`.
- `COMPASS/lib/actions/internal-clients.ts` — `deleteClient` tłumaczy 23503 (pierwsze FK do clients).
- `COMPASS/lib/supabase/database.types.ts` — 7 tabel dodanych ręcznie (regen uzupełni Relationships).

**UI:**
- `COMPASS/components/internal/people/mapa/` — `TagMultiSelect` (NOWY generyczny tag-picker,
  pierwszy w repo), `InterviewCardForm` (dynamiczne sekcje per blok, draft + finalizacja
  z pre-walidacją client-side), `PreInterviewBrief`, `NewInterviewPicker`, `CardsListSection`
  (filtry client-side), `DictionaryAdminSection` (admin only).
- Routes: `app/(protected)/internal/people/mapa/{layout,wywiad/[contractorId]/page,karta/[cardId]/page}.tsx`
  (guard `requireTalentCommunityOrAdminLayout`).
- `app/(protected)/internal/people/page.tsx` — zakładka `mapa`; `components/layout/Sidebar.tsx` —
  deep-link „Mapa technologiczna" w grupie People Ops; profil kontraktora
  (`kontraktorzy/[id]` + `ContractorDetailClient`) — sekcja kart wywiadów.

## Decyzje projektowe (zatwierdzone w planie)

1. Bloki: **A** = status, satysfakcja(+komentarz przy ≤3), koniec projektu/nie wie, szukają
   ludzi(+role+źródło), zdanie warte zapamiętania; **B** = technologie + stare/nowe + zespół;
   **C** = inicjatywy; **D** = vendorzy + notatka.
2. Karta **obok** logu rozmów (kategorie logu to sprawy opieki) — wspólna oś czasu, zero migracji.
3. Uprawnienia bez nowego bytu: guard lifecycle (admin | TCM | grant `has_tcm_access`).
4. Rotacja bez side-effectów w renderze: brief liczy czysto; materializacja przy zapisie karty
   (Etap 1), cron + przycisk admina (Etap 2). Ręczny przydział lepki; finalizacja z innym
   blokiem nadpisuje przydział (source=manual).
5. `slug` w technologies zostaje mimo braku precedensu w repo — jawny wymóg pod sync z NEXUS.

## Weryfikacja

- `tsc --noEmit` — czysty; `next lint` — exit 0 (zero nowych warningów po poprawkach cudzysłowów).
- `npm run test:unit` — **1070/1070** (60 nowych testów modułu; 1 znany flake support-inbox
  pod pełnym obciążeniem, w izolacji przechodzi).
- Kontrola dostępu: testy jednostkowe odrzucania bez guardu + RLS spot-check na prodzie po deployu.

---

# Etap 2 — karta klienta + rotacja bloków (2026-08-03)

**Bez migracji** — `tech_block_assignments` powstało w 46b, karty też; Etap 2 to wyłącznie odczyt,
agregacja i materializacja przydziałów.

## Pliki

- `COMPASS/lib/tech-map/aggregation.ts` + `__tests__/aggregation.test.ts` (15 testów) —
  `buildClientTechMap`: technologie/vendorzy (wskazania + ostatnie potwierdzenie + obszary),
  inicjatywy scalane po nazwa+rodzaj (priorytet `wysoki` wygrywa), sygnały popytu, oś końców
  projektów, macierz pokrycia obszary×bloki (rozróżnia „brak" od „przeterminowane"), notatki,
  wielkość zespołu. Czysta funkcja, `todayISO` wstrzykiwany. **Test pilnuje, że wynik nie zawiera
  id kart ani nazwisk.**
- `COMPASS/lib/tech-map/block-rotation.ts` — dodane `computeRotationInserts` (+ 6 testów
  w `__tests__/rotation-sweep.test.ts`): kto dostaje przydział w tym kwartale, kto jest pomijany.
- `COMPASS/lib/tech-map/rotation-sweep.ts` — `sweepBlockAssignments` (plain module, wspólny dla
  crona i przycisku admina) z heartbeatem `TECH_MAP_ROTATION_RUN` w `audit_logs`.
- `COMPASS/app/api/cron/tech-map-rotation/route.ts` — `withCronAuth`, try/catch + Sentry,
  `{ok, period, population, assigned, skipped, errors}`.
- `COMPASS/lib/actions/tech-map.ts` — `getClientTechMap`, `listClientsWithCards`,
  `getRotationOverview` (bez zapisu), `recalcBlockAssignments` (admin), `overrideBlockAssignment`
  (admin, lepki `source=manual`) + 11 nowych testów akcji.
- UI: `app/(protected)/internal/people/mapa/klienci/[clientId]/page.tsx`,
  `components/internal/people/mapa/{ClientTechMapView,ClientsWithCardsSection,RotationAdminSection}.tsx`,
  wpięcie w `MapaTabPanel` + klikalny klient w liście kart.

## Decyzje

1. **Agregat tylko z kart sfinalizowanych** — draft to notatka w toku, nie wiedza o kliencie.
2. **Zero nazwisk w agregacie** (egzekwowane testem) — widok gotowy pod dostęp sprzedaży w Etapie 3
   bez zmiany kształtu danych.
3. **Cron dzienny, nie kwartalny** — kontraktorzy aktywują się w środku kwartału, a crony Coolify
   potrafią milczeć tygodniami (historia inbox-ingest/tc-sync); dzienny przebieg nadrabia sam.
4. **Ręczny przydział jest lepki** — cron i „Przelicz" pomijają każdy istniejący wiersz kwartału.
5. **Przegląd rotacji nie zapisuje** — materializacja tylko w cronie, przycisku i przy zapisie karty
   (audyt P1.8: render bez side-effectów).

## Weryfikacja

- `tsc --noEmit` czysty, `next lint` exit 0, `npm run test:unit` — **1105/1105** (+35 testów Etapu 2).
- Kontrola dostępu: 5 nowych akcji w tabeli testów odrzucania bez guardu; `recalc`/`override`
  dodatkowo wymagają admina (osobne testy).

## Ops po deploy

1. Zarejestrować cron `tech-map-rotation` (`30 5 * * *`) w Coolify — **uwaga na `container_name`
   w `scheduled_tasks`** (compose z >1 serwisem: puste pole = zadanie nie odpala).
2. Po pierwszym przebiegu sprawdzić `audit_logs`:
   `select details from audit_logs where action='TECH_MAP_ROTATION_RUN' order by created_at desc limit 2`
   — para `start` + `done` = cron żyje.

## Znane ograniczenia / TODO (świadome)

- **Etap 3 (osobny PR):** alerty (koniec projektu <60 dni → właściciel benchu; hiring=TAK →
  sprzedaż; odbiorcy w `system_settings`), KPI w Analityce, flaga `can_view_tech_map`,
  migracja 46c (typy notyfikacji przepisane z ŻYWEJ listy).
- Karta klienta nie ma jeszcze filtrów po obszarze ani eksportu CSV — do rozważenia, gdy
  pojawi się realny wolumen kart.
- Rotacja obejmuje tylko `contractors.status='active'`; prospekci i osoby w offboardingu
  świadomie poza populacją.
- Seed słownika to praca redakcyjna — admin weryfikuje/scala pozycje z tag-pickera.
- `contractors.current_client` (wolny TEXT) może dryfować od `clients` → prefill wtedy nie
  trafia i TCM wybiera ręcznie; picker w edycji kontraktora = follow-up.
- Retencja/RODO dla komentarzy i „plotek" — do przemyślenia po okresie próbnym Etapu 1.

# COMPASS — reconciliation historii migracji

Status: **P1, przygotowane lokalnie; wdrożenie produkcyjne zablokowane do czasu preflightu**

Branch bazowy: `origin/main` @ `0c3f266530dc0cd1653c0d555645468935469a49`

CLI użyte do weryfikacji: `supabase@2.109.1`
Pełne mapowanie: [`migration-reconciliation-map.csv`](./migration-reconciliation-map.csv)

## Co naprawia ten branch

- Każda aktywna migracja ma unikalną, 14-cyfrową wersję i nazwę
  `YYYYMMDDHHMMSS_snake_case.sql`.
- 21 kolidujących grup wersji zostało rozdzielonych w deterministycznej
  kolejności odpowiadającej dotychczasowej kolejności nazw plików.
- Bazowy setup komunikatora został przeniesiony z `_archive_scripts` do
  aktywnej historii przed migracjami naprawiającymi jego RLS.
- Trzy pliki zostały wyłączone przez rozszerzenie `.sql.disabled`:
  - duplikat tworzący szerokie polityki publicznych attachmentów,
  - seed użytkownika ze stałym hasłem,
  - policy pozwalająca przejąć nieprzypisanego kandydata.
- Historyczny seed użytkownika jest tombstonem bez adresu, hasła ani SQL-a.
  Oryginał pozostaje tylko w historii Git jako materiał incydentowy.
- Wszystkie tombstony są wyłącznie komentarzami. Przypadkowa zmiana
  rozszerzenia nie może uruchomić historycznego SQL-a.
- Usunięto historyczny debugowy `UPDATE`, który promował wszystkie profile do
  administratora, oraz identity-specific DML nadający rolę konkretnemu kontu i
  usuwający konta E2E. Migracje odtwarzają schemat, a nie operatorów systemu.
- Naprawiono zależności wymagane przez fresh replay: brakujące kolumny statusu,
  konfigurację FTS, brakującą extension, kolidujące policy, zależność od ręcznej
  tabeli `match_results`, cast enumu używanego przez news policy oraz stary
  overload `sync_user_role`.
- Archiwalny schemat `compass_legacy` ma jawnie odebrane granty klienta i
  włączone RLS; service-role zachowuje dostęp audytowy.
- Usunięto odziedziczoną policy `USING (true)` ujawniającą cały rejestr
  `admin_access_list` każdemu zalogowanemu; finalny fresh schema wymaga `is_admin()`.
- PL/pgSQL hard-delete używa jawnego `array_append`, dzięki czemu świeży schemat
  przechodzi `supabase db lint` bez błędu typów.

Ten branch **nie zawiera migracji P0** i nie zmienia żadnej zdalnej bazy.

## Znane ostrzeżenia poza zakresem reconciliation

Lokalny Security Advisor ma zero wyników poziomu `ERROR`. Nadal raportuje
ostrzeżenia wymagające osobnych migracji forward-only: funkcje z mutowalnym
`search_path`, szeroki insert do `lifecycle_events` oraz historyczne polityki
task board. Performance Advisor raportuje m.in. ponowne obliczanie `auth.uid()`,
wiele permissive policies i dwa duplikaty indeksów. Nie są ukrywane ani
automatycznie „naprawiane” przez zmianę historii; należą do kolejnych zadań P1.

Przed zmianą domyślnej ekspozycji Supabase trzeba również skodyfikować jawne
grants dla wszystkich aktywnych tabel Data API. Ten branch robi to tylko dla
zamkniętego schematu `compass_legacy`, bo jego docelowy kontrakt jest
jednoznaczny (brak dostępu klienta, service-role/DBA only).

## Dlaczego nie wolno wykonać zwykłego `db push`

Produkcja ma ledger, który historycznie powstał częściowo przez CLI, częściowo
przez SQL Editor/MCP i zawiera wersje inne niż repo. Samo przemianowanie pliku
powoduje, że Supabase widzi go jako nową migrację. `db push --include-all`
spróbowałby więc ponownie wykonać dużą część starego DDL/DML.

To jest bramka fail-closed:

- **nigdy** nie uruchamiaj `supabase db reset --linked`;
- **nigdy** nie uruchamiaj `supabase db push --include-all` na produkcji;
- `migration repair` zmienia wyłącznie metadane ledgeru — nie naprawia schematu;
- status `applied` można nadać nowej wersji tylko po udowodnieniu, że jej efekt
  już istnieje w produkcji albo został dostarczony osobną migracją forward-only.

## Bramka 0 — warunki wejścia

Przerwij procedurę, jeśli choć jeden warunek nie jest spełniony:

1. P0 COMPASS został wdrożony i obserwowany co najmniej 24 godziny.
2. Jest snapshot/backup bazy oraz potwierdzony test restore na izolowanej bazie.
3. Jest zapisany dokładny SHA aplikacji i migration head produkcji.
4. Zbadano, czy historyczny seed utworzył konto. Jeśli tak: konto jest
   wyłączone, sesje unieważnione, aktywność przejrzana i istnieje decyzja DPO.
5. Nie ma ręcznych zmian schematu w toku ani równoległego deployu.
6. Branch został zrebase'owany na finalny P0 i fresh reset + pgTAP ponownie są
   zielone.
7. `SHOW server_version_num` i lista rozszerzeń z produkcji zostały porównane z
   `supabase/config.toml`; nie wolno uznać replayu na innej głównej wersji
   PostgreSQL za dowód zgodności.

## Etap A — tylko odczyt i materiał dowodowy

Wszystkie artefakty przechowuj w szyfrowanym katalogu incydentu, poza Git.

```bash
cd COMPASS
npx --yes supabase@2.109.1 migration list --linked
npx --yes supabase@2.109.1 db dump --linked \
  --schema public,compass_legacy,storage \
  --file <encrypted-dir>/prod-schema-before.sql
npx --yes supabase@2.109.1 db diff --linked \
  --schema public,compass_legacy,storage \
  --output <encrypted-dir>/live-vs-migrations-before.sql
```

Dodatkowo wyeksportuj ledger bez jego modyfikowania:

```sql
select version, name, statements
from supabase_migrations.schema_migrations
order by version;
```

Jeżeli kolumny różnią się w danej wersji Supabase, najpierw odczytaj
`information_schema.columns` i zapisz pełny wynik tabeli. Nie zgaduj formatu.

## Etap B — klasyfikacja każdego wiersza manifestu

Dla każdej pozycji CSV nadaj jedną decyzję z podpisem reviewera:

- `equivalent`: treść jest identyczna, zmienił się tylko numer;
- `superseded`: późniejszy DDL dowodnie daje ten sam końcowy efekt;
- `forward_fix_required`: poprawiony historyczny plik różni się od live i efekt
  trzeba dostarczyć nową migracją forward-only;
- `intentionally_disabled`: kod jest niebezpieczny/duplikatem i nie może być
  wykonany;
- `unknown`: brak dowodu — **blokuje całą procedurę**.

Szczególnej weryfikacji wymagają wiersze `content_changed=true`. Nie wolno ich
oznaczyć jako `applied` tylko dlatego, że fresh reset jest zielony.

Osobno udokumentuj rezultat historycznych operacji na tożsamościach: globalnej
promocji do admina, promocji konta po stałym UUID/e-mailu, usunięcia kont E2E
oraz seeda konta ze stałym hasłem. Brak danych w świeżej bazie nie dowodzi, że
operacje nie wykonały się wcześniej na produkcji.

## Etap C — próba na izolowanym snapshotcie

1. Przywróć produkcyjny snapshot do odizolowanego projektu bez aplikacji,
   cronów, emaili i zewnętrznych integracji.
2. Zastosuj wyłącznie zatwierdzone migracje forward-only dla brakującego delta.
3. Porównaj schemat izolowanej bazy z czystą bazą zbudowaną z repo:

```bash
npx --yes supabase@2.109.1 db diff \
  --from <isolated-snapshot-url> \
  --to <fresh-replay-url> \
  --schema public,compass_legacy,storage \
  --output <encrypted-dir>/snapshot-vs-fresh.sql
```

4. Każdą różnicę sklasyfikuj jako świadomy wyjątek albo dodaj forward fix.
5. Uruchom pgTAP, role matrix, krytyczne E2E oraz test restore jeszcze raz.

## Etap D — przygotowanie planu `migration repair`

Plan buduje się na podstawie **rzeczywistego** ledgeru produkcji i CSV. Nie ma
w repo gotowej komendy, ponieważ przy duplikatach wersji (np. `20260208`) ledger
nie mówi sam z siebie, który z kilku plików został wykonany.

Przykładowa składnia — wartości są placeholderami, nie poleceniem do wykonania:

```bash
# stara wersja występuje w ledgerze, a jej efekty zostały potwierdzone
npx --yes supabase@2.109.1 migration repair --linked \
  --status reverted <OLD_VERSION>

# nowa wersja może być oznaczona applied dopiero po dowodzie efektu
npx --yes supabase@2.109.1 migration repair --linked \
  --status applied <NEW_VERSION_1> <NEW_VERSION_2>
```

Przed akceptacją plan musi zawierać:

- pełny ledger przed i po;
- checksum/diff dla każdego `equivalent`;
- dowód obiektowy dla każdego `superseded`;
- SHA osobnych forward fixes;
- komendy cofające samą zmianę ledgeru;
- dwóch niezależnych reviewerów.

## Etap E — wykonanie na produkcji

1. Freeze migracji i deployów.
2. Nowy snapshot oraz zapis ledgeru.
3. Najpierw zastosuj zatwierdzone forward fixes; błąd zatrzymuje procedurę.
4. Wykonaj wyłącznie zreviewowany plan `migration repair`.
5. Zweryfikuj:

```bash
npx --yes supabase@2.109.1 migration list --linked
npx --yes supabase@2.109.1 db push --linked --dry-run
```

`db push --dry-run` musi pokazać wyłącznie oczekiwane, nowe migracje po headzie.
Jakakolwiek historyczna migracja na liście = natychmiastowy stop.

6. Uruchom readiness, role matrix, REST/RPC negative tests i E2E.
7. Obserwuj minimum 24 godziny. Dopiero potem kończy się freeze.

## Rollback

`migration repair` nie zmienia schematu, więc jego rollback polega na
odtworzeniu dokładnych statusów z zapisanego ledgeru. Forward migrations są
forward-only: naprawa odbywa się kolejną migracją albo restore snapshotu, jeśli
naruszone są dane lub dostępność.

Nie przywracaj trzech plików `.disabled`. Nie przywracaj starego seeda konta.

## Lokalne komendy weryfikacyjne

```bash
cd COMPASS
npm run db:migrations:check
npx --yes supabase@2.109.1 db start
npx --yes supabase@2.109.1 db reset --local --no-seed
npx --yes supabase@2.109.1 test db --local \
  supabase/tests/migration_reconciliation.sql
npx --yes supabase@2.109.1 db lint --local \
  --schema public,compass_legacy --level warning --fail-on error
npx --yes supabase@2.109.1 stop --no-backup
```

## Definition of done reconciliation

- 180 bazowych migracji plus późniejsze migracje mają unikalne wersje.
- Fresh reset i pgTAP są zielone w CI.
- Live/fresh diff nie ma niewyjaśnionych różnic.
- Produkcyjny dry-run nie proponuje żadnego historycznego pliku.
- Konto z historycznego seeda ma zamkniętą analizę incydentową.
- Produkcyjna lista administratorów została porównana z zatwierdzonym rejestrem;
  nie pozostała rola nadana przez historyczny debug/backfill.
- Restore i cofnięcie ledgeru zostały przećwiczone na izolowanym środowisku.

# Akademia: zgodność migracji repozytorium z produkcją

Stan odczytany 2026-09-24 z `origin/main` (`8f57fd16f86ad53d9f2c903e0fa298a7bae9bf10`) oraz z rejestru `supabase_migrations.schema_migrations` projektu Compass `shduiynzemftkqqefscd`. Audyt był wyłącznie odczytowy. Porównano nazwy, wersje, długości i MD5 zapisanej treści SQL; nie uruchamiano żadnej migracji ani naprawy rejestru.

## Wynik dla Akademii

Wszystkie 32 pliki `academy_*` z repozytorium mają jednoznaczny odpowiednik po nazwie w rejestrze produkcyjnym. Treść 31 par jest identyczna bajt w bajt. W ostatniej parze (`academy_activation_invitation_budget`) treść produkcyjna jest identyczna po usunięciu z pliku repozytorium jedynie otwierającego `BEGIN;` i końcowego `COMMIT;`. Wersja numeryczna zgadza się tylko dla 4 z 32 par. Samo dopasowanie nazwy lub numeru nie byłoby wystarczającym dowodem zastosowania migracji; poniższe porównanie treści ten dowód wzmacnia. Nie dowodzi ono niezależnie stanu wszystkich obiektów bazy, które mogły zmienić późniejsze migracje.

| Migracja `academy_*` | Wersja pliku w repo | Wersja w produkcji | Treść SQL |
| --- | --- | --- | --- |
| `versioned_foundation` | `20260922082902` | `20260922141922` | identyczna |
| `materials` | `20260922083658` | `20260922141927` | identyczna |
| `live_sessions` | `20260922083836` | `20260922141931` | identyczna |
| `staff_and_legacy_review` | `20260922093544` | `20260922141936` | identyczna |
| `run_materials` | `20260922100010` | `20260922141941` | identyczna |
| `completion_revocations` | `20260922102847` | `20260922141946` | identyczna |
| `rollout_gate` | `20260922102848` | `20260922141952` | identyczna |
| `session_obligations` | `20260922102931` | `20260922141958` | identyczna |
| `material_cleanup` | `20260922103100` | `20260922142003` | identyczna |
| `review_submission_token` | `20260922105234` | `20260922142007` | identyczna |
| `roster_progress` | `20260922151500` | `20260922154408` | identyczna |
| `operations_health` | `20260922152000` | `20260922154414` | identyczna |
| `attendance_recovery` | `20260922152500` | `20260922154418` | identyczna |
| `archive_controls` | `20260923093316` | `20260923093316` | identyczna |
| `review_history` | `20260923093432` | `20260923093432` | identyczna |
| `archive_prerequisite_guard` | `20260923102832` | `20260923102832` | identyczna |
| `runs_pagination` | `20260923102836` | `20260923102836` | identyczna |
| `material_review_independence` | `20260923114717` | `20260923121227` | identyczna |
| `qa_reward_bounds` | `20260923120805` | `20260923123854` | identyczna |
| `quiz_attempt_window` | `20260923121456` | `20260923125544` | identyczna |
| `gdpr_attendance_roster` | `20260923135155` | `20260923141526` | identyczna |
| `integration_issues_pagination` | `20260923144907` | `20260923154003` | identyczna |
| `verified_invitation_targets` | `20260923173043` | `20260923180135` | identyczna |
| `my_enrollments_page` | `20260923201432` | `20260923203110` | identyczna |
| `m365_identities_page` | `20260923203337` | `20260923205429` | identyczna |
| `my_run_overview` | `20260923211818` | `20260923212911` | identyczna |
| `managed_organizer_budget` | `20260924081737` | `20260924083051` | identyczna |
| `activation_invitation_budget` | `20260924091126` | `20260924093729` | tylko obramowanie transakcji |
| `material_read_projection` | `20260924100210` | `20260924100852` | identyczna |
| `material_invoker_projection` | `20260924100211` | `20260924101249` | identyczna |
| `material_revoke_raw_read` | `20260924100212` | `20260924104028` | identyczna |
| `run_caption_association` | `20260924100309` | `20260924101350` | identyczna |

W parze `activation_invitation_budget` lokalny MD5 to `5caa2ca7d64fc9036654016f5d81ea8a`, a MD5 treści zapisanej w produkcji to `b73d8c4bd3c4dcf1f61b6763e65a736a`. Po usunięciu wyłącznie dwóch wyżej wskazanych poleceń transakcyjnych pozostałe 12 809 bajtów są identyczne. Starszy `20260429_lms_akademia.sql` nie należy do grupy `academy_*`; w produkcji widnieje jako `20260429100130_lms_akademia`, lecz jego równoważności treści i schematu tu nie potwierdzono.

## Rozjazd całego repozytorium

| Miara | Wynik |
| --- | ---: |
| Pliki `.sql` w `COMPASS/supabase/migrations/` | 277 |
| Pliki z 14-cyfrowym prefiksem wersji | 206 |
| Pliki z krótszym prefiksem | 71 |
| Nieprawidłowe daty/czasy wśród 206 prefiksów | 7 |
| Nadmiarowe pliki o tej samej wersji (12 grup kolizji) | 13 |
| Wpisy rejestru produkcyjnego | 218 |
| Pliki i wpisy o tej samej wersji | 16; nazwa zgadza się we wszystkich 16 |
| Pliki 14-cyfrowe bez tej samej wersji w produkcji | 190 |
| Z powyższych: z dopasowaniem po nazwie / bez takiego dopasowania | 172 / 18 |
| Wpisy produkcyjne bez tej samej wersji w repozytorium | 202 |
| Pliki 14-cyfrowe o identycznej treści SQL przy dopasowaniu po nazwie | 35 z 206 |
| Pliki z tą samą nazwą, ale innym MD5 / bez dopasowanej nazwy | 153 / 18 |
| Wpisy produkcyjne bez zapisanej treści `statements` | 2 |

Odmienny MD5 poza Akademią nie przesądza, że migracja miała inne działanie: część historycznych wpisów przechowuje skrócony SQL bez komentarzy lub opakowania transakcji. Nie wolno jednak uznać ich za równoważne bez porównania treści i końcowego schematu. Obecny katalog zawiera również kolizje wersji, które uniemożliwiają bezpieczne automatyczne odtworzenie historii. Liczby opisują tylko `origin/main` i wskazany projekt w chwili audytu; przed działaniem trzeba je odświeżyć.

## Bezpieczna procedura

1. Dla następnych zmian stosować pojedyncze, recenzowane migracje przez istniejący proces `apply_migration`, z odczytowym preflightem wersji, stanu obiektów i zgodności wdrażanego kodu. Zapis wersji nadanej przez produkcję oraz skrótu treści dołączyć do PR. Nie tworzyć płatnego projektu ani gałęzi Supabase.
2. W osobnym PR skorygować nazwy 32 plików Akademii do wersji już zapisanych w produkcji, bez ponownego wykonywania SQL. Przed zmianą sprawdzić zależności od ścieżek plików i kolejność: produkcyjnie `run_caption_association` poprzedziła `material_revoke_raw_read`. Zachować stare wersje w historii Git i uruchomić istniejące testy CI. Sam ten PR **nie** uzgodni całego katalogu migracji.
3. Dla całej historii zbudować odczytowy manifest `wersja repo → nazwa → MD5 → wersja produkcyjna → MD5 → status dowodu`, osobno rozstrzygnąć 153 różne treści, 18 braków nazw, 71 krótkich nazw, 7 błędnych dat, 12 grup kolizji i 2 wpisy bez treści. Udokumentować końcowy schemat przez odczyt metadanych `pg_catalog`/`information_schema` lub kontrolowany zrzut samego schematu, bez danych osobowych i sekretów.
4. Dopiero po uzgodnieniu znaczenia każdej historycznej zmiany przygotować kanoniczny, odtwarzalny zestaw migracji albo zweryfikowany punkt bazowy. Sprawdzić go na istniejącym, hostowanym CI z testową bazą, bez lokalnego Dockera i bez nowej płatnej infrastruktury. Przed dopuszczeniem `db push` odczytowa lista lokalnych i zdalnych wersji musi się zgadzać, a odtworzony schemat i uprawnienia muszą przejść testy. Wymaga to osobnego przeglądu, gdyż dwa wpisy nie zawierają treści SQL.

**Nie wykonywać teraz:** `supabase db push`, hurtowego `supabase migration repair`, ręcznego `INSERT`/`DELETE` w `supabase_migrations.schema_migrations`, ponownego uruchamiania starych plików, ani `db reset` na produkcji. Według [dokumentacji Supabase](https://supabase.com/docs/reference/cli/supabase-migration-repair) `migration repair --status applied|reverted` zmienia tylko wpis rejestru, a nie schemat; użycie go do masowego „zazielenienia” historii stworzyłoby fałszywy dowód. Również `db push` mógłby wykonać historyczne DDL drugi raz lub w niewłaściwej kolejności.

Odczytowy punkt startowy do ponownej weryfikacji (bez zapisu treści SQL ani danych):

```bash
git fetch origin
git ls-tree -r --name-only origin/main COMPASS/supabase/migrations
```

```sql
select version, name, array_length(statements, 1) as statement_count,
       md5(statements[1]) as sql_md5
from supabase_migrations.schema_migrations
order by version;
```

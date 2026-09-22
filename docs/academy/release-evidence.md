# Academy — dowody przed wydaniem

Stan na 22.09.2026, PR [#384](https://github.com/B2B-net-S-A/COMPASS/pull/384). Moduł nie jest jeszcze wdrożony ani odebrany produkcyjnie. Poniższe wyniki nie zastępują testów kolejnych commitów.

## Checkpoint `f0627dfdc20c158722e5219d6161483c66199708`

- [PostgreSQL — job 106770305792](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35735107639/job/106770305792): **PASS**, dokładna zgodność 18 tabel, 16 funkcji i 3 enumów przed migracjami; wszystkie 10 migracji, 191 asercji historycznego backfillu oraz komplet testów autoryzacji i współbieżności.
- [Natywny Supabase — job 106770699481](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35735107627/job/106770699481): **PASS**, 70 asercji Auth/Storage/TUS i kontrola końcowych ACL. Historyczny job w tym samym przebiegu pozostał **FAIL**; nie zmieniamy tego wyniku.
- [ClamAV 35735107911](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35735107911): **PASS**, AMD64 i ARM64.
- Ponowny odczyt katalogu produkcyjnego: cały zapisany kontrakt zgodny, również przychodzące FK, event triggery i default privileges. Powtórzony preflight: 1 kurs, 1 lekcja, 0 zapisów/certyfikatów, Academy jeszcze nie zainstalowana; rejestr zawiera 185 wcześniejszych migracji i żadnej nowej migracji Academy.
- [Host 35735050293](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35735050293): root, flock i systemd dostępne, brak hostowego Node (`nodeMajor=0`). Przygotowywany jest osobny przypięty runtime; bez instalacji pakietów systemowych i bez operacji produkcyjnych na tym etapie.

**Decyzja o zakresie bramki:** po rzeczywistym zielonym wyniku aktualizacji i native Storage oraz niezależnym przeglądzie granic, release Academy opiera się na tych bramkach, aplikacyjnym CI i ClamAV. Historyczny replay wydzielono do manualnego `academy-history-audit.yml`, z zachowaniem niezerowego statusu błędów. Nie jest to zaliczenie odtwarzania całej bazy. Kontrakt aktualizacji: [canonical-dependency-contract.md](./canonical-dependency-contract.md).

## Checkpoint `9502a9b117e7e0b294f3f32d77f026855aff2dab`

- [Build check 35732199044](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35732199044): **PASS** — aplikacja oraz testy uprawnień i współbieżności PostgreSQL.
- [ClamAV 35732199058](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35732199058): **PASS** na AMD64 i ARM64, w tym 20/20 testów sterowania usługami bez pominięć w hosted CI.
- [Storage 35732199033](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35732199033): natywny Auth/Storage **PASS**; historyczny replay **FAIL** na starym operacyjnym seedzie konta (`42P10`). Nie zmieniamy natywnego Auth ani nie odtwarzamy kont, aby zaliczyć historyczny seed.
- [Readiness 35732193145](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35732193145): odczyt zakończony. W sprawdzonym vault brak czterech nazw połączenia DB: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`. Nie odczytywano ani nie publikowano wartości sekretów.

**Bieżąca ścieżka weryfikacji aktualizacji:** zamiast rekonstruować niezależne operacyjne skrypty całej historii, testujemy jawny kontrakt zależności Academy od aktualnej produkcji: 18 tabel, 3 enumy i 16 funkcji, z kolumnami, indeksami, triggerami, RLS i uprawnieniami. Snapshot zawiera wyłącznie definicje schematu. Test wymaga zgodności katalogu przed zastosowaniem nowych migracji oraz zachowania syntetycznej historii kursów, zapisów, ukończeń i nagród. Pełny `pg_dump` nie jest warunkiem tego ograniczonego testu; jego granice opisuje osobny kontrakt. Nowa ścieżka musi jeszcze uzyskać wynik w natywnym hosted PostgreSQL/Supabase. Historyczna bramka pozostaje na tym etapie niezmieniona i niezaliczona.

**Przygotowanie hosta:** wersjonowane pliki obejmują instalator nieaktywnych usług, osobny seed sygnatur i blokadę współbieżności skanowania, aktualizacji i deployu. Nie były jeszcze instalowane ani uruchamiane na produkcji. Pierwszy merge wymaga wcześniejszej instalacji i seed przez istniejący, przypięty kanał SSH. Włączenie blokady jest zapisane w workflow; nie wymaga nowych uprawnień do ustawień GitHub.

## Checkpoint `b86f4df4a20b0d81a4d59ae65fd7701bd4eaebe5`

- [Build check 35731018357](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35731018357): **PASS**, wszystkie zadania.
- [ClamAV 35731018470](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35731018470): **PASS**, AMD64 i ARM64.
- [Storage 35731018359](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35731018359): pełny workflow nadal **FAIL**. Historyczny replay rozpoczął 46 z 255 plików i zatrzymał się na `20260220_create_centrala_user.sql` (42P10). To operacyjny seed konta zakładający pełną unikalność `auth.users.email`; odczyt produkcyjnego katalogu potwierdza indeks częściowy. Nie odtwarzamy kont ani nie zmieniamy natywnego Auth, aby wymusić przejście starego skryptu.
- Ówczesna propozycja pełnego eksportu schematu została zastąpiona opisanym wyżej, ograniczonym kontraktem zależności. Historyczny wynik FAIL pozostaje faktem; nie stanowi wyniku nowego testu aktualizacji.
- [Graph 35731009774](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35731009774): `Calendars.ReadWrite=true`; `OnlineMeetings.Read.All`, `OnlineMeetings.ReadWrite.All`, `OnlineMeetingArtifact.Read.All` — wszystkie **false**. Nie nadano nowych zgód. Zewnętrzny link i ręczna obecność nie zależą od tych ról.

## Checkpoint `272d2c14fd0bdd2fe9372f3502d1d545f52e4011`

- [Build check 35729921406](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35729921406): **PASS**, lint, typy, testy, build i PostgreSQL authorization/concurrency.
- [Storage 35729921436](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35729921436): natywny fixture **PASS**; historyczny replay **FAIL**, rozpoczęte 30 z 255 plików, liczba poprawnie zastosowanych nieustalona. Przyczyna: historyczny indeks wymaga nieistniejącej konfiguracji wyszukiwania `polish` (42704).
- Odczyt produkcyjnego katalogu potwierdził brak `polish` i istniejący `idx_app_documents_text_search` używający `simple` dla `text_content`, `title`, `description`. Historyczne definicje są korygowane do tego rzeczywistego schematu. Funkcja `search_documents_for_ai` nie istnieje na produkcji; jej usunięcie opisuje migracja phase9. Bez zmian produkcyjnych i bez odczytu treści dokumentów.
- [Graph 35729914405](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35729914405): obecne `Calendars.ReadWrite`; brak dokładnych ról `OnlineMeetings.Read.All` oraz `OnlineMeetingArtifact.Read.All`. Ten przebieg nie badał szerszej `OnlineMeetings.ReadWrite.All`; nie dowodzi więc braku wszystkich uprawnień odczytu spotkań. Diagnostyka została rozszerzona o czwartą dokładną rolę.

## Checkpoint `08ec2ccfe2022ca6d44e337639d645aaa8c13f1d`

- [Supabase Storage 35728768205](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35728768205): job `academy-fixture` **PASS, 70 asercji**. Natywne logowanie, upload TUS z przerwaniem i wznowieniem, odzyskanie finalizacji, odmowy błędnego rozmiaru/MIME oraz odebranego grantu, izolacja materiałów lekcji i edycji, drip, moderacja i anulowanie. Werdykt skanera w tym teście jest symulowany; rzeczywisty silnik sprawdza osobna bramka.
- [ClamAV 35728768214](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35728768214): **PASS**, AMD64 i ARM64.
- Historyczny replay nadal **FAIL**: zatrzymany na `20260216_availability_overhaul.sql`, brak `current_status` (42703). Rozpoczął 20 z 254 migracji; nie jest to dowód wykonania 20 migracji. Trwa odtworzenie jawnych zależności historycznego bootstrapu.
- [Odczyt infrastruktury 35728764000](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35728764000): rzeczywisty pomiar przez istniejący SSH, bez modyfikacji. RAM 7 915 716 KiB, dostępne 5 440 720 KiB, 4 CPU, wolny dysk 61 106 832 KiB, load average 0,72. Wykrycie powiązanego serwera działa mimo 404 endpointu destinations. Pomiar nie dowodzi zapasu w szczycie ani bezpiecznej równoległości skanowania, aktualizacji sygnatur i buildu.
- Chrome w profilu użytkownika otwiera uwierzytelnione `/home` obecnej produkcji. To potwierdzenie dostępu do późniejszego odbioru, a nie test wdrożonej Academy.

## Poprzedni checkpoint `8c003aeb8d10026915644526ea79d431b284ff8b`

| Bramka | Obserwacja |
| --- | --- |
| Główne CI | [Build check 35721038633](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35721038633): sukces; lint, typy, testy, build oraz PostgreSQL authorization/concurrency |
| Rzeczywisty silnik antywirusowy | [35721038615](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35721038615): sukces na AMD64 i ARM64 |
| Natywne Supabase Auth/Storage | [35721038605](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35721038605): logowanie i przerwany/wznowiony upload TUS działają; test zatrzymany na `author_cannot_scan`. Trwa korekta odtwarzania uprawnień testowej bazy; nie oznacza to zaliczenia bramki |
| Historia migracji | Ten sam workflow: błąd powtórnego tworzenia starej polityki Storage. Historia nie została poprawnie odtworzona |
| Infrastruktura | [35721032932](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35721032932): odczyt ukończony; brak potwierdzonego skanera, schedulerów i pojemności serwera |

## Odczyt produkcyjnej bazy przed migracją

Potwierdzony projekt: `compass-prod`, ref `shduiynzemftkqqefscd`. Wykonano wyłącznie odczyt odpowiadający [preflight.sql](../../ops/academy/preflight.sql):

```json
{
  "academy_already_installed": false,
  "courses": 1,
  "lessons": 1,
  "enrollments": 0,
  "completed_enrollments": 0,
  "certificates": 0,
  "unrecognized_course_states": 0,
  "orphan_enrollments": 0,
  "required_legacy_constraints": 3,
  "academy_bucket_exists": false
}
```

Odczyt potwierdza te konkretne warunki backfillu, nie pełną zgodność schematu ani bezpieczeństwo wszystkich migracji. Przed aplikacją trzeba powtórzyć odczyt; nie uruchamiać całej starej historii na produkcji ani używać `db push` do wyrównywania rozbieżnego rejestru.

## Kolejność odbioru

1. Usunąć przyczyny niepowodzenia bramek i uzyskać zielone CI dla dokładnego SHA PR.
2. Potwierdzić zasoby skanera i konfigurację jego prywatnego połączenia, trwałych sygnatur oraz schedulerów. Nowe koszty lub rozszerzenie zgód Microsoft wymagają osobnej decyzji.
3. Zastosować wyłącznie zatwierdzony zestaw nowych migracji Academy po weryfikacji projektu i stanu rejestru. Zachować dane starego LMS; rollout początkowo `closed`.
4. Wdrożyć przez udokumentowany workflow, porównać SHA w `/api/health`, sprawdzić stan migracji i heartbeat workerów.
5. Na wskazanych kontach pilota sprawdzić w rzeczywistym interfejsie: trener → upload → skan → niezależna akceptacja → zapis uczestnika → nauka/quiz lub Teams/obecność → certyfikat. Osobno odmowy dostępu i zewnętrzny prowadzący. Zaproszenia wysyłać tylko do wskazanej grupy za zgodą użytkownika.
6. Dopiero po tym uznać moduł za odebrany. Usuwanie plików według retencji pozostaje wyłączone do osobnego zatwierdzenia polityki usuwania.

# Academy — dowody przed wydaniem

Stan na 22.09.2026, PR [#384](https://github.com/B2B-net-S-A/COMPASS/pull/384). Moduł nie jest jeszcze wdrożony ani odebrany produkcyjnie. Poniższe wyniki nie zastępują testów kolejnych commitów.

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

# Academy — dowody przed wydaniem

Stan na 22.09.2026, PR [#384](https://github.com/B2B-net-S-A/COMPASS/pull/384), sprawdzony commit `8c003aeb8d10026915644526ea79d431b284ff8b`. Moduł nie jest jeszcze wdrożony ani odebrany produkcyjnie. Poniższe wyniki nie zastępują testów kolejnych commitów.

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

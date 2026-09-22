# Academy: uruchomienie skanowania materiałów

Stan przygotowania: 2026-09-22. Kod, konfiguracja i test hosted są WIP. Nie uruchomiono skanera, schedulerów ani nowych uprawnień w produkcji. Nie wykonywano lokalnych poleceń Docker. Ten dokument nie potwierdza wdrożenia.

## Warunki przed udostępnieniem uploadów

1. Zielony workflow `Academy malware gate`, oba joby: `ClamAV real scan (ubuntu-24.04)` i `ClamAV real scan (ubuntu-24.04-arm)`. Test działa na odizolowanym runnerze GitHub; nie wymaga dostępu do produkcji ani jej sekretów.
2. Potwierdzone zasoby i prywatne połączenie skanera z aplikacją. Nie dodawać skanera do obecnego compose bez pomiaru pojemności.
3. Działające i monitorowane `clamd`, aktualizator `freshclam`, trwały katalog sygnatur oraz dysk roboczy. Sam status kontenera lub odpowiedź `PING` nie wystarczą.
4. Migracje Academy, aplikacja z kontrolą gotowości skanera oraz scheduler `academy-materials` muszą być wdrożone przed akceptacją uploadu do publikacji. Do tego czasu pliki pozostają w kwarantannie.

## Obraz i test rzeczywistego silnika

Źródło obrazu: oficjalny `clamav/clamav`, LTS `1.4.6-debian13-slim`. Dokładny indeks i obie platformy są zapisane w [`image-lock.json`](../../ops/academy/clamav/image-lock.json). Manifest indeksu:

`sha256:b12ef8fefddbba7d88de59bea8a32622f365339154adf02d38fd089112e6745a`

Weryfikator pobiera manifesty przez HTTPS, sprawdza ich SHA-256 i platformy; nie pobiera warstw ani nie uruchamia Docker. Bezpieczna kontrola na stacji roboczej:

```sh
node COMPASS/scripts/verify-academy-clamav-image.mjs
```

Oficjalna tabela podaje wsparcie LTS 1.4 do 2027-08-15. Przed końcem wsparcia oraz po każdej poprawce bezpieczeństwa operator aktualizuje obraz, lock, próg wersji w `clamav-readiness.ts` i oczekiwaną wersję testu, następnie przeprowadza oba joby. Pin obrazu nie zastępuje bieżących sygnatur. Źródło: [polityka wsparcia ClamAV](https://docs.clamav.net/faq/faq-eol.html).

Workflow [academy-malware.yml](../../.github/workflows/academy-malware.yml) uruchamia rzeczywisty daemon na AMD64 i ARM64, odświeża sygnatury i sprawdza adapter aplikacji `scanWithClamav`:

| Przypadek | Wymagany wynik |
| --- | --- |
| Zwykły tekst | Akceptacja |
| Nieszkodliwy wzorzec testowy EICAR, tworzony tylko w pamięci runnera | Odrzucenie materiału |
| Zaszyfrowany ZIP z nieszkodliwym tekstem | Odrzucenie materiału |
| Strumień 1 GiB danych bez infekcji | Akceptacja; aplikacja nie alokuje całego pliku w RAM |
| Plik większy niż obniżony testowo `MaxFileSize` | Odrzucenie, nigdy ciche pominięcie skanowania |
| Strumień większy niż obniżony testowo `StreamMaxLength` | Błąd, nigdy akceptacja |
| Wersja załadowanej bazy | Wspierany silnik, znacznik czasu nie starszy niż 48 godzin |

Kontener aktualizatora oraz daemon mają ograniczenia RAM/CPU; sprzątanie usuwa wyłącznie ich tymczasowe zasoby na runnerze. Skrypt odmawia wykonania poza GitHub-hosted runnerem. Udany test z syntetycznym 1 GiB potwierdza obsługę limitu, nie wydajność jednoczesnych produkcyjnych uploadów.

## Konfiguracja procesu i sieci

Konfiguracje wzorcowe to [`clamd.conf`](../../ops/academy/clamav/clamd.conf) i [`freshclam.conf`](../../ops/academy/clamav/freshclam.conf). Polityka:

- `MaxThreads 1`, `MaxQueue 2`, `ConcurrentDatabaseReload no`: ograniczona równoległość; przeładowanie sygnatur na chwilę zatrzymuje skanowanie zamiast uruchamiać drugi silnik.
- `StreamMaxLength` i `MaxFileSize` po 1100 MiB: niewielki zapas ponad limit aplikacji 1 GiB. `MaxScanSize 2048M`, `MaxFiles 10000`, `MaxRecursion 16` i czas skanowania ograniczają rozpakowywanie.
- `AlertExceedsMax yes`, `AlertEncrypted yes`, `HeuristicAlerts yes`: przekroczenie limitu lub szyfrowanie uniemożliwiają zwolnienie pliku z kwarantanny.
- `FailIfCvdOlderThan 2` blokuje start ze starą bazą; `SelfCheck 600` wykrywa zaktualizowane pliki. `freshclam` sprawdza aktualizacje 12 razy dziennie, testuje pobrane bazy i powiadamia `clamd`.
- `TZ=Etc/UTC` jest wymagane dla obu procesów i interpretacji `VERSION`. Aplikacja pyta o wersję rzeczywiście załadowanej bazy przed pobraniem zadania; brak odpowiedzi, stara baza i błędny format zatrzymują skanowanie.

ClamAV nie uwierzytelnia i nie szyfruje protokołu TCP. Port 3310 ma być dostępny wyłącznie z procesu Compass na prywatnej sieci. Nie wystawiać go na publicznym adresie, domenie Traefik ani publicznym porcie hosta. Między oddzielnymi hostami użyć prywatnego, szyfrowanego tunelu/VPN z regułą dopuszczającą tylko aplikację. Adapter Node nie obsługuje samodzielnie TLS. Źródła: [oficjalny obraz Docker](https://docs.clamav.net/manual/Installing/Docker.html), [protokół INSTREAM](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), [limity skanowania](https://docs.clamav.net/manual/Usage/Scanning.html).

Procesy `clamd` i `freshclam` muszą być nadzorowane i automatycznie restartowane. Współdzielą trwały katalog `/var/lib/clamav`; daemon może mieć go tylko do odczytu, aktualizator potrzebuje zapisu. `freshclam` musi mieć prywatną drogę do `clamd` dla `NotifyClamd`; przy rozdzieleniu na kontenery podać w jego pliku docelowy adres daemonu, nie `0.0.0.0`. Nie modyfikować w tym celu konfiguracji nasłuchującego daemonu. Początkowe odświeżenie przeprowadzić przed jego startem, bez `NotifyClamd`, jak w teście CI.

Daemon potrzebuje zapisywalnego `/scan-tmp` i niewielkiego `/tmp`; katalog roboczy powinien znajdować się na dysku, nie w 1 GiB tmpfs. Oficjalny obraz używa użytkownika `clamav` (UID/GID 1000); operator musi nadać mu dostęp do tych katalogów. Uruchomić daemon bez uprawnień roota, z ograniczeniami zasobów, `no-new-privileges`, usuniętymi capabilities i systemem plików tylko do odczytu poza wymaganymi katalogami. Produkcyjny katalog roboczy nie może być współdzielony z innymi usługami ani dostępny dla innych użytkowników. Tryb 0777 w skrypcie CI dotyczy wyłącznie tymczasowych, syntetycznych danych odizolowanego runnera.

## Pojemność i dostęp operacyjny

Dokumentacja repo opisuje obecny host Compass jako maszynę z 4 GB RAM. Bieżących zasobów ani wolnej pamięci nie udało się potwierdzić. ClamAV zaleca minimum 3 GiB, preferowane 4 GiB RAM dla samego skanera; testowanie i przeładowywanie baz wymaga zapasu. Bez pomiaru nie ma podstaw do umieszczenia go obok aplikacji, Coolify i pozostałych usług na tym hoście. Proponowany punkt startowy osobnego węzła: 2 vCPU, 8 GiB RAM, trwały katalog sygnatur i co najmniej 10 GiB wolnego dysku roboczego. To propozycja do pomiaru i zatwierdzenia kosztu, nie dokonana rezerwacja ani wynik testu obciążeniowego.

Read-only rozpoznanie 2026-09-22:

- `/api/health` odpowiadał `healthy`, wersja `867b2b6b76f760d4612af704ee03f2c197967de2`; jest to wcześniejsza aplikacja, nie wdrożenie Academy.
- Coolify `/api/v1/version` zwróciło 401, a Chrome pokazał formularz logowania; brak aktywnej sesji operatora.
- Próba SSH `root@178.104.220.48` w tej sesji zadania wcześniej skończyła się odmową klucza. Nie uzyskano danych o zasobach.
- Próba odczytania samych nazw sekretów przez zwykły GitHub CLI zwróciła 401, przez `codex-gh` 403. Nazwy `COOLIFY_APP_UUID`, `COOLIFY_TOKEN`, `COOLIFY_URL`, `HETZNER_HOST`, `HETZNER_SSH_KEY`, `HETZNER_USER`, `CRON_SECRET` są referencjami w istniejących workflow; nie stanowi to potwierdzenia, że sekrety są ustawione.
- Istniejące `coolify-ops` ma akcję `cron-list`, ale wypisuje pełne rekordy schedulerów i logi. Nie uruchamiano jej: treść komend może zawierać sekrety. `coolify-set-env` zmienia stan, więc także nie służy do odczytu.

Minimalny następny krok: po przeglądzie i push uruchomić przygotowany [odczyt konfiguracji przez istniejący dostęp CI](./readiness-inventory.md). Ustali on dostępne metadane aplikacji, obecność ustawień i stan znanych schedulerów bez ich komend lub wartości sekretów. Osobno w uwierzytelnionym panelu lub istniejącym monitoringu odczytać typ serwera, RAM dostępny/limit usług, CPU i wolny dysk; udokumentowane API metadanych serwera tego nie podaje. Jeżeli obecny host nie ma niezależnego zapasu 4 GiB plus miejsca na proces aktualizacji, wybrać osobny węzeł. Dopiero po tym przygotować prywatną usługę skanera z przypiętym obrazem i wymaganymi katalogami. Ten dokument nie przyznaje uprawnień do zakupu zasobów ani zmiany sieci produkcyjnej.

## Podłączenie Compass i odbiór

W chronionej konfiguracji runtime aplikacji potrzebne są `ACADEMY_CLAMAV_HOST` i `ACADEMY_CLAMAV_PORT` (domyślnie 3310). `SUPABASE_SERVICE_ROLE_KEY` i `CRON_SECRET` pozostają wyłącznie po stronie serwera. Sam skaner nie wymaga klucza aplikacji; potrzebuje kontrolowanego ruchu wychodzącego do oficjalnego serwera aktualizacji ClamAV i DNS. Nie przekazywać mu sekretów Supabase, Microsoft ani aplikacji.

Po potwierdzeniu gotowości utworzyć scheduler wywołujący `GET /api/cron/academy-materials` z nagłówkiem `Authorization: Bearer <wartość CRON_SECRET z vault>`. Sekretu nie umieszczać w URL, treści repo, logach ani argumentach ręcznego workflow. Jako początek przyjąć uruchomienie co minutę z blokadą nakładania przebiegów i timeoutem przekraczającym 300 sekund; pojedynczy przebieg obsługuje jedno zadanie. W Coolify wskazać rzeczywisty kontener aplikacji, nie losowy kontener z compose. Jeżeli wybrany scheduler nie zapewnia blokady, skonfigurować ją w mechanizmie harmonogramu przed włączeniem. Zwiększenie przepustowości wymaga pomiaru oraz wspólnej zmiany limitów daemonu i workerów.

Odbiór wymaga odrębnych dowodów:

1. Oba testy hosted są zielone dla SHA wdrażanego kodu.
2. Z sieci aplikacji `assertClamavReadiness` potwierdza świeżość sygnatur i oczekiwaną wersję; port nie jest publicznie dostępny.
3. Czysty materiał testowy przesłany przez zalogowanego trenera przechodzi `quarantined → ready`, po akceptacji kursu uczestnik może go odtworzyć. Odrzucenie, brak skanera i przerwane połączenie zachowują kwarantannę; EICAR i zaszyfrowany ZIP testować wyłącznie w odizolowanym środowisku QA.
4. Scheduler ma heartbeat `ACADEMY_MATERIAL_SCAN_RUN`, kolejka nie rośnie bez alertu; obserwować wiek najstarszego zadania, błędy, odrzucenia, wiek sygnatur, zajętość dysku i OOM. Wyłącznie metadane, bez zawartości plików i podpisanych URL w logach.
5. Potwierdzone zachowanie po restarcie daemonu/aktualizatora i ponowieniu zadania; sama odpowiedź health aplikacji nie zastępuje tego testu.

Wycofanie integracji przez wyłączenie schedulera lub usunięcie adresu skanera zatrzymuje zwalnianie nowych materiałów z kwarantanny. Nie oznaczać oczekujących materiałów jako bezpieczne ręcznie i nie usuwać ich bez osobnej decyzji dotyczącej danych.

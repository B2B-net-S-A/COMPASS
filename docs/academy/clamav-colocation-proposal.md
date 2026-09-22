# ClamAV na obecnym hoście Compass — wariant do kwalifikacji

Stan: 2026-09-22. **Propozycja, nie wdrożenie ani potwierdzenie wystarczającej pojemności.** Repozytorium definiuje w `docker-compose.yml` prywatną sieć app + skaner; jej utworzenie nastąpi dopiero przez normalny deploy. Skaner i timery pozostają osobną, jeszcze nieaktywną instalacją. Limity istniejących usług nie są tu zmieniane. Nie wykonywano lokalnych poleceń Docker ani zdalnych operacji. Ten wariant zastępuje wcześniejsze założenie o hoście z 4 GB RAM; nie znosi warunków odbioru z [runbooka](./clamav-operations.md).

## Co wynika z pomiaru

[Odczyt readiness 35728764000](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35728764000) przekazał:

| Metryka | Odczyt | Interpretacja |
| --- | ---: | --- |
| RAM całkowity | 7 915 716 KiB = 7,549 GiB | Budżet całego systemu, aplikacji i procesów utrzymaniowych |
| RAM dostępny | 5 440 720 KiB = 5,189 GiB | Pojedynczy pomiar; nie rezerwacja ani minimum z okresu obciążenia |
| CPU | 4 | Liczba procesorów; brak pomiaru szczytowej zajętości |
| Dysk dostępny | 61 106 832 KiB = 58,276 GiB | Bez kosztu kolejnego obrazu/builda i retencji |
| Swap wykorzystany | około 0,66 GiB | Nie dodajemy go do budżetu skanera; sam stan nie dowodzi bieżącej presji |

**Nie rekomenduję stałego uruchomienia clamd + freshclam + builda na podstawie tego odczytu.** Suma proponowanych limitów daemonu 4 GiB i aktualizatora 3 GiB zostawiałaby tylko 0,549 GiB na cały pozostały host. Przy samym daemonie limit 4 GiB zostawia według odczytu około 1,189 GiB dodatkowego zapasu; rzeczywisty zapas podczas ruchu i builda nie jest znany.

ClamAV zaleca co najmniej 3 GiB, preferowane 4 GiB dla silnika; jego pomiary bazowe nie obejmują innych aplikacji. To uzasadnienie punktu startowego limitu, nie gwarancja dla każdego pliku. [Wymagania producenta](https://docs.clamav.net/#recommended-system-requirements)

`ConcurrentDatabaseReload no` ogranicza dodatkowy silnik **w clamd**. `freshclam` z `TestDatabases yes` nadal ładuje nową bazę do pamięci przed jej podmianą; są to dwa odrębne szczyty. Zachowujemy test bazy i rozdzielamy procesy w czasie. [Konfiguracja clamd 1.4.6](https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/etc/clamd.conf.sample), [konfiguracja freshclam 1.4.6](https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/etc/freshclam.conf.sample)

## Konkretna konfiguracja kandydująca

Dwa oddzielne pliki/projekty: [daemon](../../ops/academy/clamav/compose.daemon.proposal.yml) oraz [jednorazowa aktualizacja](../../ops/academy/clamav/compose.update.proposal.yml). Nie łączyć ich z compose aplikacji ani uruchamiać równolegle. Nie używamy profili jako zabezpieczenia, ponieważ repo opisuje wcześniejsze pomijanie profili przez Coolify.

| Proces | Twardy RAM | CPU | PID | Swap | Tryb |
| --- | ---: | ---: | ---: | ---: | --- |
| clamd | 4 GiB | maks. 2 | 128 | 0 | Jeden silnik, `MaxThreads 1`, `MaxQueue 2`, istniejące limity plików/rozpakowania |
| freshclam | 3 GiB | maks. 2 | 64 | 0 | One-shot, `TestDatabases yes`, clamd zatrzymany; limit polecenia 610 s w kontrolerze |
| Build Compass | Bez nowej propozycji limitu | Do pomiaru | Do pomiaru | Bez zmiany | clamd i freshclam zatrzymane; nie narzucamy niezweryfikowanego limitu istniejącej aplikacji |

`memswap_limit` równe `mem_limit` wyłącza swap kontenera. `mem_reservation: 3g` daemonu jest tylko miękkim limitem; nie rezerwuje pamięci przed innymi usługami. Nie wyłączamy OOM killera. [Semantyka limitów Docker](https://docs.docker.com/engine/containers/resource_constraints/)

Oba procesy używają dokładnego obrazu z [image-lock.json](../../ops/academy/clamav/image-lock.json), użytkownika `1000:1000`, tylko odczytu rootfs, `cap_drop: ALL`, `no-new-privileges`, ograniczonych logów i żadnych sekretów Compass. Bez domyślnego entrypointu obrazu: daemon uruchamia wyłącznie `clamd`, updater wyłącznie `freshclam`.

Daemon dołącza do przygotowanej wcześniej **wewnętrznej** sieci z dokładnie dwoma członkami: Compass i clamd. W compose daemonu sieć ma `external: true`, ponieważ tworzy ją normalny deploy compose aplikacji; instalator jej nie tworzy. Przed użyciem konieczny dowód `Internal=true` oraz listy członków. Nie może to być wspólna sieć wszystkich aplikacji Coolify. Brak `ports`, host networking, domeny i etykiet Traefik. `academy-clamd:3310` jest adresem do ustawienia w runtime Compass dopiero przy wdrożeniu. Updater ma osobną sieć z DNS/CDN egress i nie łączy się z aplikacją. Protokół ClamAV TCP nie ma uwierzytelniania ani szyfrowania. [Oficjalna dokumentacja obrazu](https://docs.clamav.net/manual/Installing/Docker.html)

`ACADEMY_CLAMAV_STATE_DIR` wskazuje wcześniej utworzony katalog operatora, nie checkout i nie katalog innych usług. Podkatalogi `signatures`, `scan-tmp`, `update-tmp` należą do UID/GID 1000, mode 0700. Compose odmawia automatycznego tworzenia brakujących bind mountów. Sygnatury są trwałe i w daemonie tylko do odczytu; scratch znajduje się na dysku. Proponowane kwoty filesystemu: sygnatury 5 GiB, scan-tmp 8 GiB, update-tmp 2 GiB. **Compose nie egzekwuje tych kwot**: trzeba zweryfikować je w filesystemie lub wydzielonym wolumenie, zanim variant zostanie uznany za operacyjny. Po zabitym procesie sprzątanie dotyczy wyłącznie jego dedykowanego scratch, przy zatrzymanej usłudze.

Healthcheck używa osobnego [klienta loopback](../../ops/academy/clamav/clamd-health.conf), a nie adresu nasłuchu `0.0.0.0`. Sprawdza tylko proces. Zwolnienie zadania nadal wymaga aplikacyjnego `VERSION` i bazy młodszej niż 48 h; `PING` nie otwiera kwarantanny. [Parametr clamdscan --ping](https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/docs/man/clamdscan.1.in)

## Kolejność pracy i aktualizacji

Repo zawiera kontroler utrzymaniowy i hook w istniejącej trasie Coolify; nie są jeszcze uruchomione na produkcyjnym hoście. Oddzielne compose same nie zapewniają wzajemnego wykluczenia. Dopóki faktyczny proces build/deploy nie respektuje blokady, wariant wspólnego hosta jest niedopuszczony.

1. Aktualizacja co dwie godziny: pobrać tę samą blokadę hosta, którą musi uzyskać każdy build/deploy/restart związany z tym stosem. Zapisać cel operacji i deadline; blokada tylko w skrypcie freshclam bez udziału Coolify nie wystarcza.
2. Wstrzymać nowe wywołania workera skanowania, dokończyć aktywny skan (budżet 300 s), zatrzymać daemon i potwierdzić jego zakończenie. Timeout drenażu oznacza odroczenie operacji, nie nakładanie procesów ani uznanie skanu za czysty.
3. Uruchomić updater z [freshclam.serialized.conf](../../ops/academy/clamav/freshclam.serialized.conf), bez `NotifyClamd`, bez `--daemon`. Deadline 600 s. Zatrzymać/odczytać jego końcowy stan przed ponownym startem clamd. Brak równoległego buildera przez cały czas.
4. Zapisać odczyt wolnej pamięci i dysku; uruchomić daemon, sprawdzić świeżą **wczytaną** bazę przez readiness Compass, wznowić worker i dopiero zwolnić blokadę. Zmierzyć czas niedostępności skanowania; deadline aktualizatora 600 s i istniejący startup readiness 180 s dają ograniczone okno operacji. Przekroczenie kończy operację błędem i alarmem.
5. Błąd aktualizacji: zatrzymać updater. Można wznowić daemon na ostatniej bazie tylko jeśli ją poprawnie ładuje i spełnia 48 h; w innym przypadku nowe pliki pozostają w kwarantannie. Alarm natychmiast po nieudanej aktualizacji, ostrzeżenie o bazie ≥ 24 h, blokada ≥ 48 h. Powtórzenia muszą respektować ograniczenia CDN/Retry-After.
6. Build Compass używa tej samej blokady i drenażu: na czas całego build/deploy clamd oraz updater są zatrzymane. Wznowienie skanera dopiero po zakończeniu buildera i pozytywnym pomiarze. Żadnego montowania Docker socket do aplikacji/updatera. Ręczny deploy, restart hosta i recovery także wymagają tej samej procedury.

Pierwsze przygotowanie sygnatur to osobne zakończone uruchomienie updatera; nie uruchamiać daemonu z pustą bazą. Trwały katalog eliminuje pobieranie pełnego zestawu przy każdym starcie. Automatyczny restart daemonu po OOM nie jest dowodem zdrowia: alarm i wstrzymanie nowych zadań, bez samoczynnego podnoszenia capów.

### Konkretny hook do istniejącej trasy Coolify

Aktualny kontrakt jest zaimplementowany w [runbooku kontrolera](./clamav-host-control.md). Trigger i polling pozostają w workflow GitHub. Hostowy hook przed triggerem zapisuje trwały marker owner/run/attempt/SHA/nonce i zatrzymuje skaner pod flock. Unknown HTTP (także 429), utrata runnera albo brak końcowego statusu zachowują pauzę. Po potwierdzonym końcu wszystkich deploymentów ten sam owner może wznowić skaner. Updater respektuje marker i blokadę; worker materiałów trzyma shared lock aż do końca ograniczonego requestu. Nie przenosimy całego pollingu do nowej usługi hosta.

Repo zawiera instalator plików i nieaktywne jednostki systemd. `seed` przygotowuje bazę przed pierwszym deployem sieci, bez startu daemonu. Instalacja/seed oraz aktywacja to osobne kroki. Kontroler z checkpointu `9502a9b` przeszedł hosted testy ARM64/AMD64 (20/20, w tym flock); nowe testy instalatora/seed wymagają własnego wyniku hosted. Test kontrolera nie stanowi potwierdzenia gotowości produkcyjnego hosta. Ręczny deploy również musi respektować protokół pauzy; nieznany wynik wymaga recovery, nigdy automatycznego usunięcia markera.

## Mierzalne bramki

Poniżej są sprawdzalne kryteria tego wariantu, **nie uzyskane wyniki**. Dotychczasowy hosted gate sprawdza realne skanowanie na obu architekturach, ale nie raportuje szczytów ani nie testuje wrappera/compose tego wariantu. Nie dodajemy obowiązkowej doby obserwacji ani arbitralnego progu p95 jako warunku wydania.

| Bramka | Próba i dowód | Warunek przejścia |
| --- | --- | --- |
| Hosted AMD64 + ARM64 | Przypięty obraz; pusta baza → freshclam TestDatabases → exit → clamd → obecne clean/EICAR/encrypted/1 GiB/limits | Wszystkie wyniki zgodne; rzeczywiste limity pamięci, swap, CPU, UID, mounts i brak publikowanego portu sprawdzone przez inspect |
| Peak procesów | Osobne nowe cgroup dla freshclam, startu clamd i skanu 1 GiB; raport `memory.peak`, `memory.events`, `memory.swap.current`, `cpu.stat`; odczyt przed usunięciem kontenerów | Zero `oom`/`oom_kill`; zero swap skanera; rzeczywiste memory.max 3/4 GiB zgodne z compose, brak automatycznych restartów; peak ujawniony w wyniku |
| Ograniczenia bieżącej polityki | Zaszyfrowane archiwum, przekroczenie rozpakowania/rozmiaru i dwie konkurencyjne prośby; raport czasu i scratch | Brak cichego pominięcia; istniejący timeout 240 s dla skanu 1 GiB; quota nie uszkadza hosta, wynik błędu zachowuje kwarantannę |
| Cykl aktualizacji | Ponowny TestDatabases na podpisanej bazie, restart i aktualny VERSION, potem czysty plik i EICAR | Brak nakładania updater/daemon; zmierzony czas i respektowane deadline; nie wystarczy freshclam „up-to-date”, który nie ładuje nowej bazy — tę ścieżkę uzupełnia test pustej bazy |
| Wykluczenie i błędy | Hosted test wrappera: jednoczesne update/build/scan, przerwany update, zabity wrapper, restart daemonu, odzyskanie po nieudanym buildzie | Maksymalnie jeden proces zasobożerny; żaden claim podczas utrzymania; brak automatycznego overlap; nieznany stan buildu zachowuje wyłączenie skanera, deadline i alarm działają |
| Rzeczywisty host | Odczyt tuż przed startem oraz po rozgrzaniu skanera; istniejący monitoring hosta/aplikacji; bez produkcyjnego stress testu | Zapisane MemAvailable, swap-in/out, OOM i heartbeat; twardy cap działa; build odbywa się przy zatrzymanym skanerze. Dłuższa obserwacja po starcie jest zaleceniem operacyjnym, nie dodatkową bramką wydania |
| Dysk | Quota/prawa katalogów, szczyt scratch i stan filesystemu | Dedykowane przestrzenie nie przekraczają ustalonych kwot, brak ENOSPC i ingerencji w dane innych usług; alarm wolnego miejsca zanim zabraknie miejsca na skonfigurowany scratch |

`memory.peak` uwzględnia cgroup i potomków; nie zastępować go pojedynczym RSS lub `docker stats`. Nie wszystkie ślady presji są błędem, ale zdarzenia OOM mają zatrzymać kwalifikację. [Dokumentacja cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)

Alarmy po starcie: każde OOM/restart, nieudana aktualizacja, brak heartbeat, wzrost wieku kolejki, baza ≥ 24 h (przy ≥ 48 h twarda blokada), zbliżenie do kwoty dysku oraz istotna presja pamięci/swapowania hosta. Mogą skutkować wstrzymaniem skanera, nigdy oznaczeniem plików jako bezpieczne. Dłuższy monitoring i porównanie opóźnień aplikacji to zalecenie dalszej eksploatacji.

Jeżeli capy lub integracja blokady z Coolify nie przejdą, pozostawić uploady w kwarantannie i rozważyć oddzielny węzeł po osobnej decyzji kosztowej. Alternatywa wyłączenia `TestDatabases` nie jest rekomendowana: zmniejsza walidację bazy, a nie rozwiązuje konkurencji builda. Na obecnym dowodzie status brzmi **kandydat wymagający integracji i testu**, nie „host wystarcza”.

## Sprawdzenie lokalne bez Dockera

`node --test ops/academy/clamav/proposal.test.mjs` waliduje strukturę propozycji, lock obrazu, caps, brak publicznego portu/sekretów i zgodność konfiguracji updatera. Nie uruchamia usług i nie stanowi dowodu wydajności ani walidacji przez silnik Compose. Render Compose, pomiary cgroup i próby utrzymania należą wyłącznie do przyszłego hosted gate.

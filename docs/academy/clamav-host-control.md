# Kontroler pauzy ClamAV na hoście

Stan: kontroler z checkpointu `9502a9b` przeszedł hosted testy (20/20, ARM64 i AMD64, w tym rzeczywisty flock). Instalator, seed i jednostki poniżej są kolejnym etapem przygotowania; nie uruchomiono ich w produkcji. Kontroler zarządza wyłącznie clamd/freshclam. Nie zatrzymuje publicznej aplikacji i nie wywołuje API Coolify. Trigger i polling deploymentu pozostają po stronie zaufanego workflow.

`deploy.yml` włącza hook przez jawne `env.ACADEMY_CLAMAV_COLOCATED=true` w wersjonowanym workflow. Instalacja i odbiór hostowego kontrolera oraz przygotowanie sygnatur są warunkiem **przed merge** tego wydania. Nie wymaga to nowej zmiennej ani zmiany uprawnień w ustawieniach GitHub. Hook używa istniejącego SSH, przypiętego klucza hosta, JSON na stdin i tymczasowego klucza mode 0600 usuwanego po każdym wywołaniu. Żaden krok wdrożenia nie działa poza `main` źródłowego repozytorium.

## Instalacja i granica dostępu

Publiczny punkt wejścia: `/opt/compass-academy/host-control.sh <action>`. Przyjmuje pojedynczy JSON na stdin, zwraca JSON `{ok:true,op:...}`; błąd daje niezerowy kod i bezpieczny identyfikator, bez surowych logów runtime. Nie podawać sekretów w argumentach ani JSON.

Na docelowym **Linux** wymagane są hostowe Node.js ≥ 20, `flock`, GNU `timeout`, Docker z Compose v2 i działający systemd. [Instalator](../../ops/academy/clamav/install-host.sh) sprawdza te zależności, lecz nie instaluje pakietów, nie aktualizuje globalnego Node ani nie kupuje zasobów. Katalog `/opt/compass-academy` oraz pliki kontrolera/configów należą do root; skrypty mają mode 0755, pozostałe pliki 0644. Nie wywoływać modułów `.mjs` bez wrapperów. Instalować z zaufanego, sprawdzonego checkoutu dokładnego SHA wydania.

Stałe wartości nie wymagają interaktywnego shell environment:

| Zasób | Wartość |
| --- | --- |
| Stan kontrolera | `/var/lib/compass-academy-control`, root:root, 0700; przygotowany przed pierwszym wywołaniem |
| Marker | `pause.json` wewnątrz stanu, mode 0600, zapis temp → fsync → rename → fsync katalogu |
| Blokada | `control.lock` w tym samym prywatnym katalogu; `flock --exclusive --wait 330` |
| Stan silnika | `/var/lib/compass-academy/{signatures,scan-tmp,update-tmp}`, UID/GID 1000, 0700 |
| Sieć daemonu | `compass-academy-private`, wewnętrzna sieć z definicji app compose; powstaje podczas jego normalnego deploymentu |
| Runtime Docker | Wyłącznie `unix:///var/run/docker.sock`, niezależnie od wybranego Docker context |

Marker przetrwa restart hosta, utratę runnera i zmianę checkoutu. Brak katalogu, niepoprawne prawa, symlink lub uszkodzony JSON oznaczają odmowę. Instalator zachowuje marker, blokady, sygnatury i scratch; nie tworzy sieci ani nie zmienia compose aplikacji. Przed startem sprawdzić sieć, katalogi i limity z [propozycji compose](./clamav-colocation-proposal.md).

### Instalacja plików i seed przed merge

Poniższe polecenia dotyczą wyłącznie docelowego hosta Linux, nigdy lokalnej stacji. Z checkoutu zatwierdzonego SHA:

```bash
sudo bash ops/academy/clamav/install-host.sh
sudo /opt/compass-academy/host-control.sh status </dev/null
sudo /opt/compass-academy/host-control.sh seed </dev/null
```

Instalacja kopiuje jawny manifest runtime i sześć jednostek systemd, tworzy katalog kontrolera root:root/0700 oraz katalogi silnika UID/GID 1000/0700, a następnie wykonuje tylko `systemctl daemon-reload`. Nie pobiera obrazów, nie uruchamia ani nie włącza usług/timerów. Zapisuje hashe plików w `/opt/compass-academy/installed-files.json`. Odmawia nadpisania symlinków, zapisywalnych przez inne konta plików oraz instalacji przy aktywnych/włączonych harmonogramach lub zajętych blokadach. Wczesny błąd pozostawia usługi nieaktywne; ponowienie z tego samego checkoutu jest bezpieczne.

`seed` to jawna, osobna operacja runtime. Trzyma flock, zapisuje marker i zatrzymuje tylko kontenery o stałych etykietach projektów/usług skanera. Uruchamia jednorazowy freshclam z `TestDatabases yes`; po potwierdzonym końcu pozostawia daemon zatrzymany i usuwa marker. Nie wymaga sieci `compass-academy-private` i nie uruchamia clamd. Updater używa tylko własnej sieci egress Compose. Błąd zachowuje marker `update/blocked`; ponowne `seed` odzyskuje osierocony updater. Pauza deploymentu blokuje seed, bez ingerencji w jej właściciela. Nigdy nie usuwać markera ręcznie. Sukces seed oznacza przygotowaną bazę, a nie potwierdzenie gotowości działającego skanera.

### Timery — dopiero po gotowości

| Jednostka | Harmonogram | Timeout fetch / host / systemd |
| --- | --- | --- |
| `compass-academy-materials` | 1 min po końcu poprzedniego wywołania | 300 / 330 (+10 kill) / 350 s |
| `compass-academy-sync` | 1 min po końcu poprzedniego wywołania | 180 / 210 (+10 kill) / 230 s |
| `compass-academy-clamav-update` | 2 h po końcu poprzedniego update | kontroler / 1800 s |

`OnUnitInactiveSec` liczy odstęp od zakończenia usługi, a systemd nie uruchamia drugiej instancji już działającej jednostki. Wrappery dodają per-worker flock także dla ręcznych wywołań. Worker materiałów trzyma shared `control.lock` i odracza HTTP przy markerze lub operacji utrzymaniowej; update/deploy potrzebują exclusive lock. [Semantyka timerów systemd](https://github.com/systemd/systemd/blob/main/man/systemd.timer.xml).

Host wykonuje wyłącznie stały `docker exec --interactive compass-app node --input-type=module - <worker>`; kod jest przekazany stdin. Sekret `CRON_SECRET` odczytuje dopiero Node wewnątrz kontenera, wywołując allowlistowany `http://127.0.0.1:10000/api/cron/academy-materials` albo `academy-sync`. Nie ma sekretu na hoście, w argumentach, jednostce czy logu. Log zawiera tylko wynik, worker i HTTP status; błędy mają stałe identyfikatory. Docker exec dziedziczy konfigurację środowiska istniejącego kontenera. [Dokumentacja Docker exec](https://docs.docker.com/reference/cli/docker/container/exec/).

Aktywacja jest oddzielnym krokiem po wdrożeniu migracji/aplikacji, utworzeniu sieci normalną trasą deploy, odebraniu VERSION i skanu oraz potwierdzeniu bezpiecznej retencji dla sync. Nie ma jednostki cleanup. `ACADEMY_MATERIAL_CLEANUP_ENABLED` pozostaje false, a `ACADEMY_ATTENDANCE_RETENTION_DAYS` nie należy ustawiać bez decyzji retencyjnej. [Pomocnik aktywacji](../../ops/academy/clamav/activate-host.sh) przyjmuje pojedynczy JSON `{ "sha": "<pełny SHA wydania>" }` na stdin. Pod exclusive control.lock odmawia przy jakimkolwiek markerze, wymaga wewnętrznej sieci z dokładnie app i clamd, sprawdza załadowaną bazę VERSION oraz health/config aplikacji wewnątrz jej kontenera. Akceptuje dokładny pełny SHA lub jego siedem znaków; nie akceptuje innego commita ani potomka. Wymaga `ACADEMY_CLAMAV_HOST=academy-clamd`, portu 3310 i obecnego `CRON_SECRET`, którego wartość nie opuszcza aplikacji. Dopiero wtedy włącza trzy timery. Nie zmienia flag Teams/cleanup. Przykład na hoście (plik stdin zawiera wyłącznie oczekiwany SHA):

```bash
sudo /opt/compass-academy/activate-host.sh < /root/academy-expected-release.json
sudo systemctl list-timers 'compass-academy-*' --all
sudo journalctl -u compass-academy-materials.service -u compass-academy-sync.service -u compass-academy-clamav-update.service --since '30 minutes ago' --no-pager
```

Przy częściowym błędzie aktywacji pomocnik wyłącza tylko nowo włączony autostart i zatrzymuje tylko wcześniej nieaktywne timery; zachowuje również timer aktywny ręcznie bez autostartu. Nie zabija już rozpoczętych workerów. Nieudane cofnięcie zwraca osobny błąd wymagający inspekcji jednostek. `OnBootSec` może uruchomić pierwsze wywołanie od razu przy włączeniu timera na działającym hoście. Odbiór wymaga heartbeat start/done w aplikacji i wyniku właściwego zadania, nie tylko aktywnego timera. Failed service, brak heartbeat, długotrwałe deferred i zatrzymany scanner wymagają alarmu w istniejącym monitoringu; nie dodano zewnętrznego systemu powiadomień.

### Wycofanie bez kasowania danych

```bash
sudo systemctl disable --now compass-academy-materials.timer compass-academy-sync.timer compass-academy-clamav-update.timer
sudo systemctl is-active compass-academy-materials.service compass-academy-sync.service compass-academy-clamav-update.service
```

Wyłączenie timerów nie zabija już działającego wywołania. Zaczekać na jego ograniczony czasem koniec; nie zatrzymywać updatera w połowie przez systemctl. Dopiero gdy jednostki są nieaktywne, uruchomić instalator z poprzedniego sprawdzonego checkoutu zgodnego z formatem markera i ponownie wykonać odbiór. Instalator nie usuwa baz, markerów, kontenerów ani obrazów. Poprzednie wersje sprzed instalatora wymagają zachowania bieżących wrapperów/jednostek i ręcznego review zgodności; nie kopiować dowolnie starych plików na aktywny kontroler. Zatrzymanie skanera w ramach recovery wykonuje `pause` z audytowalnym owner według protokołu poniżej, bez wyłączania publicznej aplikacji.

## Protokół workflow

Każde mutujące polecenie deploya otrzymuje `owner`:

```json
{"runId":"35728764000","attempt":"1","sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","nonce":"<64 znaki hex SHA256(runId:attempt:sha)>"}
```

Kontroler weryfikuje deterministyczne nonce i porównuje wszystkie cztery pola. UUID deploymentu jest identyfikatorem Coolify, nie nonce właściciela. `triggerNonce` ma format `deployAttempt-httpAttempt`, np. `1-1`.

| Akcja | JSON na stdin | Warunek/wynik |
| --- | --- | --- |
| `status` | `{}` | Bieżący rodzaj/etap pauzy i właściciel; bez zmiany runtime |
| `pause` | `{owner}` | Trwale zapisuje pauzę, zatrzymuje freshclam i clamd, potwierdza brak działających/paused/restarting kontenerów. Dopiero sukces pozwala na trigger |
| `begin-trigger` | `{owner,triggerNonce}` | Ponownie potwierdza zatrzymanie; zapisuje pending **przed każdym HTTP trigger**. Pending lub nieukończony deployment blokuje kolejny trigger |
| `bind` | `{owner,triggerNonce,deploymentUuid}` | CAS pending → powiązany UUID. Powtórzenie z tym samym UUID jest idempotentne; zmiana UUID odrzucona |
| `terminal` | `{owner,deploymentUuid,status}` | `finished`, `failed` lub `cancelled`, po rzeczywistym odczycie końcowego stanu tego UUID. Sprzeczna zmiana terminalnego wyniku odrzucona |
| `resume` | `{owner}` | Wymaga braku pending triggerów i zakończenia wszystkich powiązanych deploymentów; startuje clamd i sprawdza załadowaną wersję/bazę. Marker usuwa na końcu |
| `update` | `{}` | Jeśli istnieje pauza deploya: `{ok:true,op:"update",deferred:true}`, bez runtime. W przeciwnym razie serializuje stop → freshclam → stop freshclam → start/readiness clamd |
| `seed` | `{}` | Tylko przygotowanie bazy: odmawia przy pauzie deploya, stop → freshclam → potwierdzenie stop. Sukces usuwa marker, daemon pozostaje zatrzymany; błąd zachowuje marker |

Root-owned SSH dostęp jest granicą autoryzacji. `terminal` nie odpytuje Coolify samodzielnie; zaufany workflow musi przekazywać zaobserwowany status. Nigdy nie mapować nieznanego stanu na `failed`. Nie ma API odrzucenia triggera: nawet HTTP 429 może oznaczać cudzy trwający build.

Normalna ścieżka: `pause → begin-trigger → HTTP → bind → polling UUID → terminal → resume`. Jeżeli build zakończył się błędem i workflow ma wykonać drugą próbę, zachowuje marker: `terminal(failed) → begin-trigger(nowy nonce) → ...`. Nie uruchamia skanera pomiędzy próbami. Przy każdym non-200/201, w tym HTTP 429, błędzie sieci lub 200/201 bez UUID: **nie ponawiać triggera**, marker pozostaje pending i wymaga uzgodnienia z Coolify. Recovery musi uwzględnić także cudze aktywne/zakolejkowane buildy aplikacji.

Jeżeli pierwszy build zakończył się błędem przed utworzeniem prywatnej sieci, `resume` nie uruchomi daemonu i pozostawi pauzę. Nowy run może przejąć taką pauzę wyłącznie w fazie `paused`/`resuming`, gdy istnieje co najmniej jeden zapisany deployment, wszystkie deploymenty są terminalne i nie ma pending triggera. Przejęcie zapisuje nowego ownera, zatrzymuje i sprawdza oba procesy przed zgodą na nowy trigger. Stary owner nie może już wznowić skanera. Faza `pausing`, nieznany wynik, trwający build i marker bez powiązanego deploymentu nadal wymagają recovery poprzedniego runa.

Wczesny błąd przygotowania przed pierwszym `begin-trigger` pozwala na `resume` z pustą listą prób. Krok `always()` może poprosić kontroler o `resume`, ale nie może ominąć odmowy: pending lub nieukończony deployment pozostawia pauzę i czerwony wynik kroku. Manualny deploy Coolify wymaga tej samej procedury pauzy i końcowego potwierdzenia. Stary run nie może usunąć pauzy nowszego.

## Aktualizacja i odzyskiwanie

`flock` obejmuje całą akcję. Dla update pozostaje zajęty podczas stopu, pobierania/testu bazy i wznowienia. Updater używa stałej usługi Compose (`up --exit-code-from`), aby następna operacja mogła znaleźć i zatrzymać jego kontener po śmierci klienta Docker. Nie używamy anonimowego `run --rm`, którego późniejsze `compose stop` mogłoby nie objąć.

Akcja update zapisuje własny trwały marker przed runtime. Po błędzie aktualizacji próbuje wznowić daemon na nadal poprawnej bazie; jeżeli to się uda, usuwa marker, ale zwraca błąd aktualizacji do alarmu. Przy błędzie startu lub VERSION zatrzymuje clamd i pozostawia marker. Startup wymaga dokładnej wersji z image lock i bazy nie starszej niż 48 h. Aktualizacja używa istniejącego `TestDatabases yes`.

Po SIGKILL wrappera blokada OS zostanie zwolniona, ale marker zostanie. Osierocony updater może nadal działać: kolejne `pause` lub `update` najpierw zatrzymuje go, zanim potwierdzi bezpieczny stan. Nie ma auto-clear, TTL ani automatycznego resume opartego wyłącznie na wieku markera. `unless-stopped` utrzymuje ręcznie zatrzymany daemon po restarcie Dockera; zewnętrzny supervisor nie może omijać kontrolera.

Recovery po utracie runnera: odczytać owner/próby z root-owned markera i z istniejącego runa GitHub; sprawdzić faktyczne deploymenty aplikacji w Coolify. Powiązać znany UUID z pending triggerem, zapisać rzeczywisty status terminalny, następnie `resume` z tym samym owner. Jeśli nie wiadomo, czy trigger utworzył deployment, pozostawić skaner wyłączony i zgłosić alarm — nie kasować pliku. Dla osieroconego markera update ponowić `update`, które najpierw sprząta proces poprzednika.

Oczekiwanie na lock ma 330 s, updater do 610 s, startup do 210 s; zatem pause podczas wyjątkowo długiej aktualizacji może bezpiecznie odmówić przed triggerem. Hook SSH musi mieć timeout wystarczający dla lock + stop (330 + 330 s) albo traktować zerwane wywołanie jako brak zgody na deploy. Zmiana tych limitów powinna być wspólna dla hooka i kontrolera; nie ponawiać HTTP triggera po timeoutcie pauzy.

Marker zachowuje stan konserwatywnie. Samo `VERSION` przed claim nie daje idealnego drenażu: wcześniej rozpoczęty skan może przy zatrzymaniu trafić do retry. Plik pozostaje w kwarantannie. Aplikacja publiczna działa przez całą pauzę; po błędzie przywracania nowe materiały nie są uznawane za bezpieczne.

## Dowody i ograniczenia

- `host-control.test.mjs`: lokalne testy trwałości/CAS, pending unknown, kolejnych prób, odroczenia updatera, błędów i ograniczenia runtime do usług skanera. Wykorzystują atrapy; nie wykonują Docker ani SSH.
- `host-lock.test.mjs`: wyłącznie GitHub-hosted Linux uruchamia rzeczywisty flock, procesy core i trwałe pliki testowe; sprawdza wyścig update/pause i SIGKILL. Nadal bez Docker. Na stacji roboczej jawny skip.
- `proposal.test.mjs`: lock obrazu, caps, sieci/mounty i zachowanie testowania bazy.
- `host-install.test.mjs`: instalacja i ponowienie na katalogach tymczasowych, zachowanie stanu, odmowa aktywnych timerów/symlinków, allowlista endpointów i brak sekretów w wynikach. systemctl i Docker są atrapami; instalator nie jest wykonywany na stacji roboczej.
- `host-activation.test.mjs`: odmowa niewłaściwego SHA, pauzy, publicznej sieci, obcego członka, niegotowego procesu/bazy/config; dopiero potem allowlista timerów i cofnięcie częściowej aktywacji. Nie uruchamia Dockera ani systemd lokalnie.
- Rzeczywisty daemon/aktualizator, restart, limity RAM oraz pełna integracja z deploy-hook wymagają istniejącego hosted malware gate. Testy atrap nie potwierdzają zużycia RAM, możliwości uruchomienia Compose ani gotowości produkcji.

Kontroler nie wywołuje Coolify; nieaktywne jednostki systemd są instalowane oddzielnie. Alarmy: retained pause/unknown trigger, maintenance timeout, update failure, readiness failure, OOM, wiek sygnatur i backlog. Pełny polling oraz odzyskanie nieznanego triggera pozostają po stronie integracji/operatora.

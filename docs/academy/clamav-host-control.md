# Kontroler pauzy ClamAV na hoście

Stan: implementacja z opcjonalnym hookiem deploy, oczekująca hosted weryfikacji; nie uruchomiono jej w produkcji. Kontroler zarządza wyłącznie clamd/freshclam. Nie zatrzymuje publicznej aplikacji i nie wywołuje API Coolify. Dotychczasowy trigger i polling deploymentu pozostają po stronie zaufanego workflow.

`deploy.yml` używa hooka tylko przy repo variable `ACADEMY_CLAMAV_COLOCATED=true`. Włączyć ją dopiero po instalacji i odbiorze hostowego kontrolera, przed uruchomieniem stałego daemonu. Hook używa istniejącego SSH, przypiętego klucza hosta, JSON na stdin i tymczasowego klucza mode 0600 usuwanego po każdym wywołaniu. Żaden krok wdrożenia nie działa poza `main` źródłowego repozytorium.

## Instalacja i granica dostępu

Publiczny punkt wejścia: `/opt/compass-academy/host-control.sh <action>`. Przyjmuje pojedynczy JSON na stdin, zwraca JSON `{ok:true,op:...}`; błąd daje niezerowy kod i bezpieczny identyfikator, bez surowych logów runtime. Nie podawać sekretów w argumentach ani JSON.

Na docelowym **Linux** wymagane są hostowe Node.js ≥ 20, `flock`, Docker z Compose v2. Katalog `/opt/compass-academy` oraz pliki kontrolera/configów należą do root; skrypt ma mode 0755, pliki nie mogą być zapisywalne przez aplikację/clamav. Operator instaluje z tego samego SHA: `host-control.sh`, `host-control.mjs`, `host-control-core.mjs`, oba `compose.*.proposal.yml`, `clamd.conf`, `clamd-health.conf`, `freshclam.serialized.conf`, `image-lock.json`. Nie wywoływać modułu `.mjs` bez wrappera.

Stałe wartości nie wymagają interaktywnego shell environment:

| Zasób | Wartość |
| --- | --- |
| Stan kontrolera | `/var/lib/compass-academy-control`, root:root, 0700; przygotowany przed pierwszym wywołaniem |
| Marker | `pause.json` wewnątrz stanu, mode 0600, zapis temp → fsync → rename → fsync katalogu |
| Blokada | `control.lock` w tym samym prywatnym katalogu; `flock --exclusive --wait 330` |
| Stan silnika | `/var/lib/compass-academy/{signatures,scan-tmp,update-tmp}`, UID/GID 1000, 0700 |
| Sieć daemonu | `compass-academy-private`, wcześniej utworzona wewnętrzna sieć app + clamd |
| Runtime Docker | Wyłącznie `unix:///var/run/docker.sock`, niezależnie od wybranego Docker context |

Marker przetrwa restart hosta, utratę runnera i zmianę checkoutu. Brak katalogu, niepoprawne prawa, symlink lub uszkodzony JSON oznaczają odmowę. Nie resetować markera podczas instalacji kolejnej wersji. Przed startem sprawdzić sieć, katalogi i limity z [propozycji compose](./clamav-colocation-proposal.md). Nie ma instalatora ani automatycznego zakupu zasobów.

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

Root-owned SSH dostęp jest granicą autoryzacji. `terminal` nie odpytuje Coolify samodzielnie; zaufany workflow musi przekazywać zaobserwowany status. Nigdy nie mapować nieznanego stanu na `failed`. Nie ma API odrzucenia triggera: nawet HTTP 429 może oznaczać cudzy trwający build.

Normalna ścieżka: `pause → begin-trigger → HTTP → bind → polling UUID → terminal → resume`. Jeżeli build zakończył się błędem i workflow ma wykonać drugą próbę, zachowuje marker: `terminal(failed) → begin-trigger(nowy nonce) → ...`. Nie uruchamia skanera pomiędzy próbami. Przy każdym non-200/201, w tym HTTP 429, błędzie sieci lub 200/201 bez UUID: **nie ponawiać triggera**, marker pozostaje pending i wymaga uzgodnienia z Coolify. Recovery musi uwzględnić także cudze aktywne/zakolejkowane buildy aplikacji.

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
- Rzeczywisty daemon/aktualizator, restart, limity RAM oraz pełna integracja z deploy-hook wymagają istniejącego hosted malware gate. Testy atrap nie potwierdzają zużycia RAM, możliwości uruchomienia Compose ani gotowości produkcji.

Kontroler nie tworzy nowego schedulera ani nie zmienia `deploy.yml`. Alarmy: retained pause/unknown trigger, maintenance timeout, update failure, readiness failure, OOM, wiek sygnatur i backlog. Pełny polling oraz odzyskanie nieznanego triggera pozostają po stronie integracji/operatora.

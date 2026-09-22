# Lokalny runtime Node dla kontrolera Akademii

Instalator [`install-node-runtime.sh`](../../ops/academy/clamav/install-node-runtime.sh)
przygotowuje wyłącznie `/opt/compass-academy-node` na **Linux ARM64 jako root**.
Nie używa Docker, nie instaluje pakietów systemowych, nie aktualizuje istniejącego
Node i nie zmienia profili powłoki ani globalnego PATH. Nie aktywuje usług.

## Przypięte źródło

Oficjalne [wydanie Node.js 22.23.0](https://nodejs.org/en/blog/release/v22.23.0)
oraz [SHASUMS256.txt](https://nodejs.org/dist/v22.23.0/SHASUMS256.txt), zweryfikowane
przez HTTPS 2026-09-22:

| Artefakt | Wartość |
| --- | --- |
| Archiwum | `https://nodejs.org/dist/v22.23.0/node-v22.23.0-linux-arm64.tar.gz` |
| Rozmiar archiwum | `56748954` bajty |
| SHA-256 archiwum | `0c96aa074abd109e0b5da8d10202a9bbcea9bcf9ddb587b20944f71b8f21f8c8` |
| SHA-256 `bin/node` z tego archiwum | `def9c87b46712844ffeb3435dde14f5d0bed3d10723ea305e4355203b5e043a0` |
| SHA-256 `LICENSE` z tego archiwum | `c738ae413cf561f174e34f6961f8ca458aae2369a73640dda6234c629b98bcc4` |

Pobrane archiwum zostało lokalnie porównane z oficjalną sumą. Nie wykonywano
binarnego pliku Linux na stacji roboczej. Weryfikacja sumy opiera się na
oficjalnym źródle HTTPS; nie deklarujemy niezależnego sprawdzenia podpisu PGP.

## Wywołanie na docelowym hoście

Instalator z zatwierdzonego SHA przyjmuje dokładnie jeden argument:

```bash
# Preferowana ścieżka operacyjna: zweryfikowane archiwum przekazane na stdin.
sudo bash ops/academy/clamav/install-node-runtime.sh - < node-v22.23.0-linux-arm64.tar.gz

# Alternatywnie wyłącznie ta stała ścieżka, regularny plik root:root / 0600.
sudo bash ops/academy/clamav/install-node-runtime.sh /opt/compass-academy-node-v22.23.0-linux-arm64.tar.gz
```

Właściwy workflow przesyła zweryfikowane archiwum i installer przez istniejącą
trasę SSH. Instalator nie pobiera niczego sam. Wymaga standardowych narzędzi
hosta: Bash, GNU stat/head/mv, sha256sum, tar/gzip, flock i narzędzi plikowych.
Brak zależności kończy się odmową, bez uruchomienia menedżera pakietów.

Sprawdza `uname`, UID, właścicieli i prawa `/` oraz `/opt`, symlinki i hardlinki.
Prywatny staging powstaje przez `mktemp` pod `/opt`; osobny root-owned lock
serializuje instalacje. Odczyt wejścia jest ograniczony do przypiętego rozmiaru
plus jeden bajt. Sprawdzenie rozmiaru i SHA odbywa się **przed rozpakowaniem**.
Rozpakowywane są wyłącznie `bin/node` i `LICENSE`; npm/corepack są pomijane.

Katalog i `bin/node` mają mode 0555, licencja i manifest 0444, właściciel root:root.
To prawa plików, nie systemowy atrybut `chattr +i`. Przed atomowym przeniesieniem
katalogu instalator ponownie sprawdza hashe, manifest, zestaw plików oraz
`node --version` w pustym środowisku. Runtime zajmuje około 122 MB plus licencja;
podczas instalacji potrzebne jest dodatkowo około 57 MB na archiwum.

Powtórzenie z tym samym archiwum weryfikuje istniejące pliki i zwraca
`installed:false` bez ich zastępowania. Inna wersja, zmienione bajty, niespodziewane
pliki, prawa lub symlinki powodują odmowę. Nie ma automatycznej ścieżki upgrade
ani usuwania poprzedniego runtime. SIGKILL przed publikacją może pozostawić
prywatny staging; nie zmienia istniejącego runtime. Ponowienie po publikacji jest
idempotentne, także gdy poprzedni klient nie odebrał odpowiedzi.

`install-host.sh`, `host-control.sh` i `activate-host.sh` dodają stałe
`/opt/compass-academy-node/bin` na początek własnego PATH. Dotyczy to tylko tych
procesów, również uruchamianych przez systemd. Workery HTTP korzystają z Node
wewnątrz istniejącego kontenera aplikacji i nie wymagają zmiany.

## Dowód i ograniczenia

`node --test ops/academy/clamav/node-runtime.test.mjs`: 9 focused testów lokalnie
PASS. Testy wykonują przepływ rzeczywistego skryptu na jawnie przepisanej kopii
w katalogu tymczasowym: stałe ścieżki, UID i hashe odnoszą się do syntetycznego
archiwum, a ARM binary i flock są atrapami. Sprawdzają powtórzenie, brak nadpisania,
ograniczenie wejścia, checksum, uprawnienia, symlinki/hardlinki i niepoprawną wersję.
Produkcyjny skrypt nie ma takich przełączników ani zmiennych obejścia.

Nie jest to dowód wykonania oficjalnego Node na docelowym hoście. Odbiór operacji
wymaga wyniku instalatora, `/opt/compass-academy-node/bin/node --version` równego
`v22.23.0` oraz ponownej kontroli gotowości wrapperów. Przygotowanie plików w repo
nie oznacza instalacji ani aktywacji produkcyjnej.

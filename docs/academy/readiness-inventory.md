# Odczyt konfiguracji Academy przez istniejący dostęp CI

Workflow [`Academy infrastructure inventory`](../../.github/workflows/academy-readiness.yml) wykonuje wyłącznie zapytania GET do znanych endpointów Coolify. Używa istniejących sekretów wdrożeniowych: `COOLIFY_URL`, `COOLIFY_TOKEN`, `COOLIFY_APP_UUID`. Nie nadaje uprawnień, nie ustawia zmiennych, nie tworzy schedulerów i nie uruchamia zdalnych poleceń.

## Uruchomienie przed merge

Pierwszy push brancha `feat/academy-enterprise` w repozytorium `B2B-net-S-A/COMPASS` uruchomi odczyt, jeżeli obejmuje pliki Academy, jej konfigurację operacyjną lub sam workflow. Dzięki zdarzeniu `push` nowy workflow nie musi wcześniej istnieć na `main`. Po merge te same filtry działają na `main`; dostępny jest też `workflow_dispatch` dla tych dwóch branchy. Nie używamy `pull_request_target` ani kodu z forków.

Runner pobiera tylko `ops/academy`, uruchamia test sanitizacji bez sekretów, a następnie przekazuje sekrety wyłącznie do kroku odczytu. Skrypt nie instaluje zależności i nie wykonuje hooków repozytorium. GitHub token ma jedynie `contents: read`; po checkout nie pozostają poświadczenia Git.

## Co zawiera wynik

W logu i podsumowaniu joba pojawia się ten sam jawnie zbudowany raport JSON:

- Status aplikacji, rodzaj buildu oraz booleany healthcheck/prywatnej sieci.
- Obecność znanych nazw ustawień Graph, skanera, Supabase i crona; osobno niepusta konfiguracja i oznaczenie runtime. Wartości nigdy nie trafiają do raportu. Redakcja po stronie API daje `null`, nie domniemanie, że sekret istnieje lub jest pusty.
- Dane powiązanego serwera: główny/dodatkowy, osiągalny/używalny i włączone metryki. Identyfikatory, adres IP, konto SSH, token Sentinel i inne ustawienia nie są wypisywane.
- Wyłącznie zadania nazwane `academy-materials` i `academy-sync`: obecność, aktywność, częstotliwość, duplikaty, ustawiony kontener i timeout. Komenda, jej zgodność z oczekiwanym endpointem, logi i historia wykonań nie są odczytywane do raportu. Zadanie o innej nazwie nie jest automatycznie utożsamiane na podstawie komendy.
- Status każdego odczytu, np. `read`, `http_403`, `http_404`, `unknown_schema`, `unavailable`. Brak wspieranego endpointu lub uprawnienia pozostaje jawnie nieustalony.

Raport nigdy nie kopiuje całych odpowiedzi API. Przetwarza je wyłącznie w pamięci, do limitu 2 MiB, z timeoutem 15 sekund na żądanie. Dopuszczony host to `https://coolify-compass.dynaminds.pl`, przekierowania są blokowane. Skrypt może używać tylko GET aplikacji, jej envów, zadań, destinations i konkretnych serwerów wskazanych przez destinations. Nie korzysta z listy wszystkich serwerów, logów ani endpointów wykonujących polecenia.

## Jak odczytać rezultat

`inspection: complete` oznacza ukończony odczyt metadanych. `operationalReadiness` pozostaje `not_established`: zielony job nie jest zgodą na uruchomienie Academy.

Obecność wartości w vault nie dowodzi dostarczenia jej do działającego kontenera. Dane Graph nie potwierdzają zgód aplikacyjnych, ograniczenia skrzynek organizatorów, licencji ani polityk Teams. Adres ClamAV nie potwierdza działania daemonu i świeżych sygnatur. Obecność aktywnego schedulera nie dowodzi wykonania requestu i heartbeat.

Publiczny kontrakt GET serwera nie zawiera bieżącego RAM ani wolnego dysku; raport jawnie zwraca `null` i `not_exposed_by_documented_read_api`. Nie zastępujemy tego arbitralnym poleceniem SSH ani uruchomieniem zadania przez API. Zasoby wymagają osobnego odczytu z istniejącego monitoringu lub panelu operatora. Warunki uruchomienia skanera opisuje [runbook ClamAV](./clamav-operations.md).

W razie 401/403 używany istniejący token nie ma wystarczającego dostępu albo jest nieważny; skrypt nie próbuje nadawać nowych zgód lub szukać innych sekretów. W razie 404/nieznanego schematu dana wersja Coolify może nie obsługiwać endpointu. W obu przypadkach zachowujemy pozostałe poprawnie odczytane metadane.

Lokalna kontrola bez połączenia do Coolify:

```sh
node --test ops/academy/coolify-readiness.test.mjs
```

Test obejmuje whitelistę projekcji, zakaz przekierowań i obcych originów, maskowane/brakujące wartości, odmowę uprawnień, nieznany schemat, ograniczenie rozmiaru oraz zakaz rozszerzenia odczytu przez spreparowany identyfikator serwera.

## Oficjalne kontrakty API

- [Pobranie aplikacji](https://coolify.io/docs/api/endpoints/applications/get-application-by-uuid) i [zmiennych](https://coolify.io/docs/api/endpoints/applications/list-envs-by-application-uuid).
- [Destinations aplikacji](https://coolify.io/docs/api/endpoints/applications/list-application-destinations) i [pobranie powiązanego serwera](https://coolify.io/docs/api/endpoints/servers/get-server-by-uuid).
- [Lista harmonogramów aplikacji](https://coolify.io/docs/api/endpoints/scheduled-tasks/list-scheduled-tasks-by-application-uuid).
- [Uprawnienia i redakcja danych w API](https://coolify.io/docs/api/permissions). Wykorzystujemy istniejący token; jego uprawnień ten odczyt nie zmienia.

## Wynik pierwszego odczytu — 22.09.2026

[Run 35719877087](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35719877087), commit 24a5c02, zakończył odczyt bez mutacji. Zredagowana projekcja: [readiness-observation.json](./readiness-observation.json).

- Odczyt aplikacji, zmiennych i harmonogramów zakończył się powodzeniem. Destinations zwróciło HTTP 404, więc metadane serwera i pojemność nadal są nieustalone.
- Nazwy AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, CRON_SECRET i Supabase są obecne, mają niepuste wartości i flagę runtime. To nie dowodzi zgód Graph ani rzeczywistego dostarczenia zmiennych do kontenera.
- Brak ustawień ACADEMY_CLAMAV_HOST/PORT, ACADEMY_TEAMS_ENABLED i ACADEMY_ATTENDANCE_RETENTION_DAYS.
- Brak zadań o nazwach academy-materials oraz academy-sync.
- Status operacyjnej gotowości pozostaje not_established. Przed uruchomieniem potrzebne są skaner, potwierdzona pojemność, harmonogramy, migracje i pilot.

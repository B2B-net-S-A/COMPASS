# Academy: uruchomienie spotkań i schedulerów

Ten runbook opisuje istniejący kod. Nie potwierdza uprawnień Microsoft ani uruchomienia schedulerów. Ostatni zapisany odczyt produkcji znajduje się w [readiness-observation.json](./readiness-observation.json): skonfigurowane nazwy Azure/cron/Supabase, brak skanera i zadań `academy-materials` / `academy-sync`. Nowy odczyt CI dopiero ma ustalić zasoby hosta; nie należy zastępować go informacją o historycznym typie maszyny.

## Kolejność uruchomienia

1. Zielone bramki dla dokładnego SHA: CI aplikacji, rzeczywisty PostgreSQL, Storage/Auth/TUS i ClamAV AMD64/ARM64. Osobno rozstrzygnąć pełny historyczny replay i zgodność rejestru migracji przed zmianą schematu produkcji. Fixture Academy nie jest dowodem odtworzenia całej bazy.
2. Addytywne migracje, wdrożenie zgodnego kodu i kontrola wersji `/api/health`. Zachować rollout `closed` do potwierdzenia integracji; następnie dopuścić wskazane konta pilota przez ustawienia Academy. Samo menu lub HTTP 200 nie jest dowodem dostępu ani zgodnego SHA.
3. Zasoby i prywatny ClamAV według [runbooka skanera](./clamav-operations.md). Nie dodawać daemonu do głównego compose na podstawie samego wpisu hosta. Compose aplikacji już przekazuje flagi Academy, adres skanera oraz istniejące poświadczenia Azure/Supabase/cron; skanera nie zawiera.
4. Skonfigurować schedulery poniżej. `academy-sync` jest potrzebny także przy wyłączonym managed Teams — wysyła przypomnienia w aplikacji dla zewnętrznych linków. Potwierdzić pary heartbeat `start`/`done` i wynik zadania, nie tylko zapis konfiguracji.
5. Odebrać scenariusz linku zewnętrznego z ręczną obecnością. Oddzielnie zweryfikować gospodarza, istniejące zgody/polityki M365 i dopiero wtedy włączyć managed Teams oraz odebrać jego pilot.

## Kontrakt harmonogramów

| Nazwa | Początkowy harmonogram | Endpoint GET | Minimalny timeout schedulera | Heartbeat |
| --- | --- | --- | --- | --- |
| `academy-materials` | co minutę | `/api/cron/academy-materials` | 330 s | `ACADEMY_MATERIAL_SCAN_RUN` |
| `academy-sync` | co minutę | `/api/cron/academy-sync` | 210 s | `ACADEMY_SYNC_RUN` |
| `academy-material-cleanup` | co 5 minut, opcjonalny raport | `/api/cron/academy-material-cleanup` | 90 s | `ACADEMY_MATERIAL_CLEANUP_RUN` |

Scheduler ma wskazywać rzeczywisty kontener aplikacji z uruchomionego compose, posiadać blokadę nakładania przebiegów i używać `Authorization: Bearer` z istniejącego `CRON_SECRET` runtime. Sekret nie może trafić do URL, zapisanej komendy, argumentów procesu lub logów. Dla polecenia wykonywanego w kontenerze preferować klienta czytającego sekret bezpośrednio ze środowiska. Ustawienie samego tekstu `$CRON_SECRET` nie dowodzi, że scheduler uruchamia polecenie w poprawnym kontenerze.

Przykładowa treść polecenia dla schedulera uruchamianego **wewnątrz kontenera aplikacji**, po zatwierdzeniu konfiguracji. Nie uruchamiać jako test read-only — endpoint wykonuje pracę kolejki. Pokazany przykład dotyczy skanera; dla pozostałych zmienić tylko stałą nazwę endpointu i limit czasu zgodnie z tabelą.

```sh
node -e 'const secret=process.env.CRON_SECRET;if(!secret)process.exit(2);fetch("http://127.0.0.1:10000/api/cron/academy-materials",{headers:{Authorization:"Bearer "+secret},redirect:"error",signal:AbortSignal.timeout(300000)}).then(async r=>{const body=await r.json();console.log(JSON.stringify({status:r.status,ok:body.ok===true}));if(!r.ok||body.ok!==true)process.exitCode=1}).catch(()=>{console.error("academy_scheduler_request_failed");process.exitCode=1})'
```

Nie wywoływać przez publiczne proxy podczas długiego skanowania, jeżeli jego timeout jest krótszy od czasu zadania. Wywołanie lokalne omija ten limit i nie ujawnia sekretu na zewnątrz. Blokada harmonogramu jest nadal wymagana; lease zapobiega równoległemu przetwarzaniu jednego pliku/sesji, lecz nie ogranicza wszystkich wywołań do jednej pracy naraz.

`ACADEMY_MATERIAL_CLEANUP_ENABLED` pozostaje `false` bez zaakceptowanej polityki usuwania. Parametry 48 godzin/30 dni są domyślnymi progami raportu. Puste `ACADEMY_ATTENDANCE_RETENTION_DAYS` nie usuwa raportów; ustawienie liczby 30–3650 włącza usuwanie surowych raportów przez `academy-sync` i wymaga wcześniejszej decyzji o retencji. [Retencja materiałów](./material-retention.md).

## M365: fakty i warunki do sprawdzenia

Kod tworzy wydarzenie w kalendarzu wskazanego wewnętrznego organizatora z `isOnlineMeeting=true` i `teamsForBusiness`, aktualizuje je i odwołuje przez ten sam identyfikator. Tworzenie wydarzenia z uczestnikami powoduje wysłanie zaproszeń przez Microsoft. Uprawnienie aplikacyjne do tego API to `Calendars.ReadWrite`; zakres dostępnych skrzynek trzeba sprawdzić osobno. Sam fakt ustawienia trzech zmiennych Azure nie potwierdza żadnej zgody. [Microsoft: create event](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0).

Odszukanie `onlineMeeting` po URL i pobranie obecności używa oddzielnych API. Dla ścieżki app-only przewidziano `OnlineMeetings.Read.All` i `OnlineMeetingArtifact.Read.All` oraz odpowiednią application access policy dla organizatora. Nie nadawać `OnlineMeetings.ReadWrite.All` wyłącznie na potrzeby tworzenia wydarzenia kalendarzowego; obecny adapter nie zarządza rolami prezenterów ani nagrywaniem przez to API. Weryfikacja zgód musi uwzględnić faktycznie używane API i tenant. [Microsoft: get onlineMeeting](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-get?view=graph-rest-1.0), [attendance reports](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-list?view=graph-rest-1.0).

Warunki niepotwierdzone w samym kodzie: aktywna skrzynka/Teams organizatora, licencja, konfiguracja raportów obecności, dozwolony udział zewnętrznego prezentera, lobby i możliwość prezentacji. Administrator mapuje organizatora na znany profil Compass, tenant ID i Entra object ID. Zewnętrzny trener może prezentować przy wewnętrznym gospodarzu; jego konto federacyjne nie jest automatycznie kontem współorganizatora. Sprawdzić rzeczywiste wejście, udostępnianie ekranu i raport w pilocie.

Alternatywnie trener dostarcza link spotkania własnej organizacji. Compass obsługuje zapisy, powiadomienia, ICS i audytowaną ręczną obecność. Nie zmienia cudzego kalendarza ani nie obiecuje raportów Graph. Nagranie jest opcjonalnym materiałem edycji: upload, skan i niezależna moderacja; automatyczne nagrywanie/import nie jest zaimplementowane.

Przy firmowym spotkaniu Graph zaproszenie dla każdego prowadzącego i uczestnika kieruje się na jego jedyny potwierdzony adres Teams. Jeśli administrator powiązał kilka różnych adresów, musi oznaczyć jeden jako adres zaproszeń w panelu „Teams i synchronizacja”; bez tego worker zgłosi błąd konfiguracji i nie wywoła Graph. Gdy nie ma potwierdzonego aliasu M365, używany jest tylko potwierdzony e-mail logowania Compass. Ten sam adres wybrany dla dwóch kont Compass również blokuje wysyłkę. Zmiana lub usunięcie powiązania oraz nadanie/odebranie uprawnienia trenera zleca aktualizację przyszłych firmowych spotkań. Autor z odebranym uprawnieniem trenera nie pozostaje na liście prowadzących; osoba nadal zapisana jako uczestnik zachowuje własne zaproszenie. Dla linku zewnętrznego Compass nie wysyła zaproszeń przez Graph.

Przy błędzie Graph nie wklejać równoległego spotkania do tej samej sesji. Ponowić uzgodnienie kolejki albo odwołać spotkanie i użyć jawnego zastępstwa po potwierdzeniu odwołania. Odwołanie nie zwalnia uczestników z zamrożonego obowiązku. [Zasady sesji i zastępstw](./session-obligations.md).

## Minimalny dowód odbioru

Zapisany trener przesyła czysty materiał; po skanie i akceptacji uczestnik właściwej edycji może go odczytać, osoba spoza edycji nie może. Scheduler pozostawia aktualne heartbeat i stabilną kolejkę. Pilot zewnętrznego konta przechodzi zapis, wejście, prezentację, zmianę terminu, odwołanie/zastępstwo i obecność. Pilot managed dodatkowo potwierdza pojedyncze wydarzenie po ponowieniu oraz import raportu bez dopasowywania po nazwie. Końcowe ukończenie i certyfikat muszą wynikać z rzeczywistych zamrożonych wymagań. Żaden z tych dowodów nie wynika z zielonego samego inventory.

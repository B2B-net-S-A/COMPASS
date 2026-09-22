# Compass — plan panelu szkoleniowego

Data: 22.09.2026. Status: realizacja w PR #384, bez wdrożenia i zmian danych produkcyjnych.

**Bieżące dowody realizacji:** [release-evidence.md](./release-evidence.md) zawiera wyniki PR #384, hosted CI oraz odczytu produkcyjnej bazy. Ma pierwszeństwo przed starszym checkpointem poniżej; plan produktu i kryteria odbioru pozostają aktualne.

**Tryb pracy: realizacja wznowiona.** Użytkownik polecił kontynuować aktywny cel dokończenia modułu enterprise. Prace odbywają się w izolowanym checkoutcie; plan i lokalne testy nie oznaczają gotowości produkcyjnej.

**Stan przygotowania:** kod obejmuje model danych, uprawnienia, wersjonowanie, panele, upload, certyfikaty, współprowadzących oraz integrację Teams. Dla `b86f4df` główne hosted CI i rzeczywisty ClamAV AMD64/ARM64 przeszły; natywny fixture Supabase potwierdza Auth/TUS/Storage. Pełny historyczny replay pozostaje niezaliczony z powodu starego operacyjnego skryptu tworzenia konta. Nie ma jeszcze testu aktualizacji z pełnego schematu produkcji, testu Teams z kontami pilota ani odbioru produkcyjnego. Główny katalog użytkownika jest zachowany. Macierz w §14 i poniższy przegląd przed PR są wcześniejszymi checkpointami; aktualne wyniki i ich granice zawiera release-evidence.md.

**Ustalenia przeglądu przed PR:**

- Naprawiono lokalnie P1 moderacji: formularz musi przekazywać token konkretnego zgłoszenia, sprawdzany atomowo w bazie. Stary ekran administratora nie może zaakceptować treści zmienionej po odrzuceniu i ponownym zgłoszeniu tej samej wersji. Podgląd PDF/wideo oraz blokada decyzji przy błędzie odczytu mają lokalną poprawkę i 6 testów jednostkowych, bez odbioru produkcyjnego.
- Retencja osieroconych plików ma lokalne poprawki i 54 kontrole na PGlite. Pozostają rzeczywiste wyścigi w PostgreSQL, test usunięcia przez Storage i odzyskania limitu oraz odbiór filtrów/paginacji. Czyszczenie produkcyjne pozostaje wyłączone.
- Workflow academy-storage.yml oraz scripts/test-academy-storage.mjs są przygotowane do pierwszego wykonania w hosted CI. Test obejmuje rzeczywiste Auth/TUS/Storage; osobny job odtwarza historię migracji. Lokalne testy kontraktów nie potwierdzają jeszcze wykonania tej bramki.

## 1. Docelowy efekt i uzgodnione decyzje

Rozbudowujemy istniejącą **Akademię** w Compass. Konsultant może być uczestnikiem, a po nadaniu dodatkowego uprawnienia również trenerem. Trener dodaje materiały, przygotowuje kurs i prowadzi spotkania przez Teams. Uczestnik zapisuje się, uczy, dołącza do spotkań i otrzymuje potwierdzenie ukończenia.

**Potwierdzone przez użytkownika:**

- Szkolenie wymaga zatwierdzenia przez administratora przed publikacją.
- Część prowadzących korzysta z kont Microsoft 365 spoza organizacji.
- Obecne zadanie obejmuje pełny plan; analizę wykonano z udziałem trzech agentów.

**Przyjęte założenia produktowe:**

- Pierwszym odbiorcą są konsultanci mający konto Compass: wszyscy konsultanci objęci dostępem do Akademii mogą się uczyć, a tylko wskazani mogą tworzyć/prowadzić. Trener zachowuje możliwość uczestniczenia w cudzych kursach. „Wszyscy” w tym planie nie oznacza automatycznie wszystkich globalnych ról Compass.
- Uprawnienie trenera nadaje administrator; samo posiadanie konta nie pozwala publikować ani tworzyć szkoleń.
- Początkowo moderuje istniejący administrator Compass. Osobne, delegowane uprawnienie administratora Akademii można dodać bez nadawania pełnego admina całej aplikacji.
- Obsługujemy trzy formy: **materiały do samodzielnej nauki, spotkania na żywo, kurs mieszany**.
- Nauka jest wewnętrzna i bezpłatna. Płatności, sprzedaż publiczna i rozliczenia trenerów nie są częścią pierwszego wydania.
- Dostęp ról HR, managera i finansów nie zostaje automatycznie rozszerzony. To odrębna decyzja od nadania konsultantowi uprawnienia trenera.

### Zakres pierwszego wydania

Uczestnik otrzymuje katalog, „Moje szkolenia”, kalendarz, lekcje, quiz, obecność, certyfikat i informację zwrotną. Wybrany konsultant dodatkowo otrzymuje „Prowadzę”: edytor, upload, zgłoszenia do akceptacji, terminy i własne grupy. Administrator zarządza nadaniami, akceptacją, wyjątkami, raportem i gotowością integracji.

Pierwsze wydanie obejmuje wszystkie trzy formy szkolenia oraz kompletny przebieg z ręcznie dodanym linkiem Teams. Automatyczne tworzenie spotkań firmowych i pobieranie obecności mają osobny odbiór, ale pozostają w pełnym zakresie planu. Płatności, automatyczny import nagrań, SCORM i obowiązkowe szkolenia HR opisano jako późniejszy rozwój.

**Główny przebieg:** trener przygotowuje program i materiały → administrator zatwierdza wersję → uczestnik zapisuje się → realizuje materiały i/lub Teams → system sprawdza warunki ukończenia → uczestnik pobiera certyfikat.

## 2. Co już istnieje i co trzeba rozbudować

Analiza kodu dotyczy odświeżonego `origin/main`: **867b2b6b76f760d4612af704ee03f2c197967de2**. Pracowano na osobnym checkoutcie; główny katalog użytkownika pozostał nietknięty. Poniższe ustalenia nie są testem produkcji ani potwierdzeniem obecnego schematu bazy i uprawnień Microsoft 365.

| Obszar | Stan w repozytorium | Decyzja |
|---|---|---|
| Katalog i moje szkolenia | `/learning`, `/learning/moje` | Rozbudować obecne ekrany |
| Panel autora | `/learning/tworze`, kreator, lekcje, quiz | Zachować i ograniczyć dostęp do trenerów |
| Moderacja | `/admin/learning`, statusy draft/pending_review/published/rejected/archived | Zachować kolejkę, dodać wersjonowanie i szczelną kontrolę przejść |
| Treści | Markdown, URL wideo, upload PDF do 10 MB | Dodać bezpieczne materiały biurowe i upload nagrań |
| Nauka | Zapisy, postęp, quiz, certyfikat | Zachować, ujednolicić warunki zaliczenia |
| Dodatki | Q&A, ankiety, analityka, ścieżki nauki, rekomendacje, punkty | Dostosować do wersji kursów; nie budować ponownie |
| Dostęp do Akademii | `learning` w `COMING_SOON_FEATURES`; menu ukrywa moduł | Uruchomić kontrolowanie po odbiorze |
| Teams | Wspólny klient Graph oraz helpery kalendarza | Reużyć transport i wzorce obsługi błędów; dodać domenę szkoleń |
| Szkolenia na żywo | Brak modelu edycji, sesji i obecności w LMS | Nowa funkcjonalność |

**Ważne:** istniejące `course_type = company/consultant` oznacza pochodzenie kursu i wpływa na punkty. Nie należy zmieniać znaczenia tego pola na „online/nagranie”. Forma szkolenia dostaje osobne `delivery_mode`.

### Warunki konieczne przed uruchomieniem

1. **Uprawnienia:** tworzenie kursów jest dziś dostępne dla zalogowanych użytkowników; wymagany jest guard trenera w UI, akcjach, RPC i politykach bazy.
2. **Akceptacja wersji:** opublikowany kurs może być edytowany bez ponownej moderacji. Publikacja musi dotyczyć konkretnej, niezmiennej wersji.
3. **Wiarygodność ukończeń:** polityki z migracji wymagają ograniczenia bezpośrednich zapisów statusów kursu, wyniku quizu i ukończenia. Potwierdzić efektywne polityki/granty w środowisku docelowym, a następnie przetestować próby obejścia przez API.
4. **Pobieranie materiałów:** `LessonPlayer` odsyła do `/api/learning/attachment`, podczas gdy w repo istnieje `/api/akademia/attachment`. Ujednolicić trasę i sprawdzić autoryzację dostępu do konkretnego pliku.
5. **Postęp i nagrody:** ukończenie, certyfikat i punkty muszą wynikać z tych samych warunków, być zapisane atomowo i odporne na powtórzenie żądania.
6. **Wynik quizu:** obecny ekran wyników odczytuje wynik z URL. Powinien pobierać własną zapisaną próbę z bazy; powtórzone identyfikatory pytań w żądaniu muszą być odrzucane.
7. **Publikacja live bez quizu:** obecny formularz wymaga lekcji i co najmniej czterech pytań. Walidacja musi zależeć od formy szkolenia, aby legalny kurs oparty na obecności nie wymagał fikcyjnego quizu.

## 3. Uprawnienia i odpowiedzialność

„Trener” jest dodatkowym uprawnieniem konsultanta, a zakres pracy wynika z przypisania do kursu lub edycji. Jedna osoba może łączyć role autora i prowadzącego oraz uczestniczyć w cudzych kursach.

| Rola w Akademii | Może | Granica uprawnień |
|---|---|---|
| Uczestnik | Przeglądać katalog, zapisać się, realizować własny program, uczestniczyć w Teams, pobierać własny certyfikat | Bez tworzenia kursów, danych cudzych zapisów i ręcznego ustawiania wyniku |
| Autor / właściciel kursu | Tworzyć szkic, dodawać materiały, ustalać program, zapraszać uprawnionych współpracowników, zgłaszać do moderacji | Bez zatwierdzania własnej publikacji; opublikowana wersja niezmienna |
| Redaktor | Edytować szkice i materiały przydzielonego kursu, przygotować zgłoszenie | Samo przypisanie nie daje list uczestników, obecności ani prowadzenia spotkań |
| Prowadzący / współprowadzący | Widzieć przypisane edycje, dokładny program grupy, listę uczestników, postęp i obecność tej grupy, odpowiadać na Q&A, dodawać materiały po zajęciach | Bez zmiany programu, kluczy odpowiedzi quizu, zatwierdzania publikacji i własnej obecności |
| Administrator Akademii | Nadawać/odbierać trenerów w zatwierdzonym zakresie, moderować, otwierać zapisy, przydzielać zastępstwa, obsługiwać wyjątki i raporty | Bez automatycznego rozszerzenia dostępu do HR, finansów i konfiguracji całego Compass |
| Administrator Compass | Zarządzać zakresem dostępu do modułu i obsadą administratorów Akademii | Nadal obowiązuje niezależność akceptacji własnej treści |

**Etapowanie administracji:** w pierwszym wydaniu funkcję administratora Akademii mogą pełnić obecni administratorzy Compass. Delegowanie samej Akademii innej osobie powinno używać osobnego uprawnienia; nie należy w tym celu nadawać globalnego admina. Obsada i uruchomienie delegacji wymagają decyzji właściciela modułu. Lokalny WIP obecnie korzysta z administratora globalnego.

Implementacja: dedykowane nadanie uprawnienia z osobą nadającą, zakresem i datami; bez nowej globalnej roli HR „trainer”. Osobne przypisania redaktora i prowadzącego do kursu/edycji. Interfejs, akcje serwerowe, RPC i RLS korzystają z tego samego modelu. Autor bez przypisania prowadzenia nie uzyskuje prawa samodzielnego potwierdzania własnego udziału.

Odebranie uprawnienia blokuje nowe operacje od następnego żądania. Opublikowane materiały i historia pozostają, a przyszłe sesje trafiają na listę wymagającą zastępstwa. Administrator przejmuje albo przypisuje nowego prowadzącego; nie anulujemy automatycznie spotkań.

**Dane prowadzącego:** imię i nazwisko uczestnika, status zapisu, wymagane elementy programu, procent postępu, wynik zaliczenia, status/czas obecności oraz kontakt używany do tego szkolenia. Bez prywatnych pól profilu, danych HR, odpowiedzi z innych kursów i cudzych edycji. Indywidualne odpowiedzi quizu nie są domyślnym elementem listy uczestników.

**Zewnętrzne konto Teams nie oznacza profilu is_external w Compass.** Osoba dodająca materiały musi mieć zwykłe, uwierzytelniane konto Compass. Konto Microsoft jest osobną, weryfikowaną tożsamością; adresy nie muszą być identyczne.

## 4. Ekrany i nawigacja

Jedno wejście w menu: **Akademia**. Zachowujemy adresy `/learning` i istniejące linki.

| Widok | Zawartość i główna akcja |
|---|---|
| Katalog | Wyszukiwanie, kategoria, poziom, prowadzący, forma, najbliższy termin; „Zobacz szkolenie” |
| Szczegóły szkolenia | Cel, program, wymagania, trenerzy, materiały, terminy, zasady zaliczenia; „Zapisz się” |
| Moje szkolenia | Do rozpoczęcia / w trakcie / ukończone, postęp, termin, „Kontynuuj” lub „Dołącz do Teams” |
| Kalendarz Akademii | Lista/miesiąc, własne spotkania i dostępne terminy; zapis do kalendarza |
| Lekcja | Wideo/tekst/PDF, załączniki, następna lekcja, pytania, postęp |
| Moje certyfikaty | Pobranie własnego PDF i data ukończenia; może być zakładką w „Moje szkolenia” |
| Prowadzę | Tylko trener: własne kursy, status moderacji, najbliższe sesje, zadania do poprawy |
| Edytor kursu | Informacje → program i materiały → quiz/zaliczenie → podgląd → zgłoszenie |
| Edycja na żywo | Terminy, uczestnicy, lista rezerwowa, połączenie Teams, obecność, materiały po spotkaniu |
| Administracja Akademii | Kolejka akceptacji, trenerzy, wszystkie szkolenia, problemy synchronizacji, raporty |

Proponowane nowe adresy: `/learning/kalendarz`, `/learning/tworze/[id]/edycje`, `/learning/edycje/[id]`, `/admin/learning/trainers`, `/admin/learning/integrations`. Ostateczne nazwy zgodne z konwencją projektu.

UI musi pokazywać rzeczywisty stan: „Oczekuje na akceptację”, „Trwa tworzenie spotkania”, „Wymaga poprawy”, „Brak wolnych miejsc”, „Obecność oczekuje na potwierdzenie”. Sam zapis formularza nie oznacza udanej operacji Microsoft.

Widoki mobilne: najbliższe spotkanie i przycisk dołączenia na pierwszym planie, czytelne nazwy plików, upload z postępem/wznawianiem. Obsługa klawiatury, etykiety pól, brak statusów rozróżnianych wyłącznie kolorem; materiały wideo z możliwością dodania napisów/transkrypcji przez autora.

## 5. Proces trenera i publikacji

1. Administrator nadaje uprawnienie trenera.
2. Trener tworzy szkic: tytuł, opis, cel, kategoria, poziom, język, wymagania wstępne, forma, orientacyjny czas.
3. Dodaje program i materiały oraz ewentualny quiz. Przy live określa plan spotkań i prowadzących.
4. Ustala zasady ukończenia spośród dozwolonych reguł. Uczestnik zobaczy je przed zapisem.
5. Podgląda kurs tak jak uczestnik i zgłasza wersję do sprawdzenia. Po zgłoszeniu ta wersja jest zamrożona.
6. Administrator akceptuje albo zwraca z obowiązkowym komentarzem. Podgląd obejmuje pliki, program, quiz i warunki ukończenia.
7. Dopiero zaakceptowana wersja może być opublikowana. Samo zatwierdzenie materiału nie wysyła zaproszeń na spotkanie.
8. Przy live trener zapisuje szkic edycji i terminów oraz wskazuje organizatora. Proponowany model operacyjny: administrator sprawdza gotowość i otwiera zapisy na edycję; trener później prowadzi zajęcia i zarządza zatwierdzonymi terminami w swoim zakresie. Publikacja uruchamia kolejkę synchronizacji; zaproszenia dotyczą wyłącznie zapisanych uczestników. Akceptacja programu i otwarcie zapisów to dwa jawne działania.

**Rekomendacja: niezależna akceptacja.** Autor i osoby współtworzące daną wersję nie zatwierdzają jej, nawet jeśli mają uprawnienia administratora albo później usunięto ich przypisanie. Analogicznie administrator nie zatwierdza własnych materiałów po zajęciach ani przygotowanej przez siebie edycji. Właściciel Akademii wyznacza zastępcę moderatora; jeśli nie ma niezależnej osoby, publikacja czeka zamiast omijać regułę.

Administrator sprawdza: cel i odbiorców, kompletność programu, poprawność plików, warunki ukończenia, quiz, wymagania wstępne, dostępność materiałów oraz zakres dostępu. Odrzucenie wskazuje konkretną poprawkę. Widoczna jest wersja i historia decyzji, aby nie zatwierdzić przypadkiem innego szkicu.

Przepływ wersji: **Szkic → Do akceptacji → Opublikowana** albo **Do poprawy → Szkic**. Archiwizacja zatrzymuje nowe zapisy, zachowując historię. Wycofanie materiału z powodu błędu jest osobną, audytowaną operacją administratora.

**Zmiany po publikacji:** nowy szkic kopiuje aktualną wersję; materiały i quiz opublikowanej wersji pozostają niezmienne. Po akceptacji nowa wersja trafia do nowych zapisów. Osoby już zapisane kończą swoją wersję; administrator może zaproponować migrację, ale nie może po cichu skasować ich postępu lub zaliczenia.

Wyjątek od wyboru najnowszej wersji: przy zapisie na konkretną edycję uczestnik zawsze otrzymuje wersję przypisaną do tej edycji, nawet jeśli katalog pokazuje już nowszą. Cała grupa realizuje ten sam zatwierdzony program.

Terminy należą do edycji, nie do wersji materiałów. Zmiana godziny nie wymaga ponownej moderacji programu, lecz zapisuje autora zmiany, powoduje aktualizację kalendarza i odwołuje stare przypomnienia. Zmiana organizatora wymaga kontrolowanego anulowania i utworzenia nowego spotkania, z informacją do uczestników. Po otwarciu zapisów lista wymaganych sesji i reguły ukończenia są zamrożone. Nowego obowiązku nie dopisujemy istniejącym uczestnikom; zmiana programu wymaga nowej wersji/edycji i jawnej decyzji uczestnika o przeniesieniu. Anulowana wymagana sesja czeka na zastępczy termin pod tym samym logicznym obowiązkiem; samo anulowanie nie przyznaje ukończenia.

## 6. Uczestnictwo, terminy i ukończenie

### Materiały do samodzielnej nauki

Katalog → zapis → lekcje → quiz, jeśli wymagany → ukończenie → certyfikat/ankieta. System pamięta ostatnią lekcję. Oznaczenie materiału jako przeczytanego jest deklaracją uczestnika; nie należy przedstawiać go jako dowodu przyswojenia wiedzy.

### Szkolenie na żywo

Szczegóły → wybór edycji → rezerwacja miejsca → potwierdzenie i kalendarz → Teams → obecność → quiz, jeśli wymagany → ukończenie.

- Kurs może mieć kilka edycji, a edycja jedno lub kilka spotkań. Uczestnik zapisuje się na wybraną edycję.
- Limit miejsc i kolejka rezerwowa działają transakcyjnie. Dwa równoczesne zapisy na ostatnie miejsce nie mogą przekroczyć limitu.
- Rezygnacja zwalnia miejsce; awans z listy rezerwowej jest jednoznaczny i powoduje powiadomienie tylko raz.
- Anulowanie terminu wyłącza przycisk dołączenia, anuluje przyszłe przypomnienia i synchronizuje zmianę. Historia pozostaje.
- Daty przechowywane są jako UTC wraz ze strefą edycji; domyślnie `Europe/Warsaw`. Test obejmuje zmianę czasu letniego/zimowego.
- Link Teams widzą zapisani uczestnicy oraz właściwi prowadzący/administratorzy. Rezygnacja usuwa dostęp w Compass i aktualizuje listę spotkania zarządzanego, lecz nie unieważnia wcześniej poznanego URL Teams. Organizator stosuje zasady lobby i dopuszczania uczestników; ten scenariusz należy sprawdzić w pilocie.

### Domyślne zasady zaliczenia — propozycja

| Forma | Warunek |
|---|---|
| Samodzielna | Wszystkie obowiązkowe lekcje oraz quiz, jeżeli został ustawiony |
| Live | Potwierdzona obecność na wymaganych sesjach oraz ewentualny quiz |
| Mieszana | Wymagane materiały + wymagane sesje + quiz, jeżeli ustawiony |

Proponowany próg quizu dla nowych kursów: **80%**. Proponowany próg obecności: **80% czasu każdej wymaganej sesji**, liczony w oknie faktycznie prowadzonego szkolenia. Wartości są konfiguracją zatwierdzaną razem z kursem, a nie zmienną regułą po zapisie. Backfill zachowuje wcześniejsze zasady (w obecnym module próg quizu wynosi 70%); nie zaostrza reguł rozpoczętych szkoleń. Oglądanie nagrania zastępuje obecność tylko wtedy, gdy program od początku na to pozwala.

Wiele połączeń do Teams należy zsumować jako unię przedziałów, bez podwójnego liczenia równoczesnych urządzeń. Dopasowanie obecności: powiązana tożsamość M365, następnie zatwierdzony adres; nigdy sama nazwa wyświetlana. Niejednoznaczne wpisy trafiają do ręcznej weryfikacji. Brak raportu nie oznacza automatycznej nieobecności.

Ręczne potwierdzenie wymaga wskazania sesji, osoby, decyzji i uzasadnienia; zapisujemy kto/kiedy. Prowadzący potwierdza faktyczne rozpoczęcie i zakończenie szkolenia; korekta tych godzin jest audytowana. Trener nie zatwierdza własnego zaliczenia ani nie otrzymuje nagrody za ukończenie własnego kursu. Certyfikat zachowuje nazwę kursu, wersję, edycję, uczestnika, datę i identyfikator ukończenia; wystawianie i naliczanie punktów musi być odporne na ponawianie.

**Powtórny udział — rekomendacja:** ukończenie kolejnej edycji daje osobne potwierdzenie tego udziału, po ponownym spełnieniu warunków. Nagroda za dany kurs pozostaje jednorazowa. Ważność czasowa uprawnień i obowiązkowa recertyfikacja pozostają poza pierwszym wydaniem. Nie uruchamiamy automatycznie całej League wraz z Akademią.

**Błędne zaliczenie:** administrator zapisuje uzasadnioną korektę dowodu obecności lub wyniku. Jeżeli zmienia ona ważność wystawionego potwierdzenia, oddzielna audytowana decyzja oznacza certyfikat jako unieważniony; historia i wcześniejszy dokument pozostają powiązane. System nie usuwa po cichu ukończenia i nie obiecuje odebrania PDF już pobranego na urządzenie. Nowe pobranie musi pokazać aktualny status. Ten proces wymaga implementacji i własnego testu przed uznaniem pełnego zakresu za odebrany.

## 7. Teams i prowadzący z zewnętrznym kontem

### Wariant A — spotkanie w naszej organizacji, rekomendowany

- Organizatorem jest wskazane, uprawnione i odpowiednio licencjonowane konto wewnętrzne; dla zewnętrznego trenera wyznaczamy wewnętrznego gospodarza.
- Compass tworzy wydarzenie kalendarza organizatora z Teams i zapisuje identyfikatory zdarzenia, organizatora i spotkania oraz adres dołączenia.
- Trener zewnętrzny prowadzi jako prezenter. Nie zakładamy, że zwykłe konto z innej organizacji może zostać współorganizatorem.
- Jeśli role uczestników nie mogą być ustawione bezpiecznie przez API, gospodarz nadaje rolę prezentera w Teams. Nie ustawiamy wszystkich jako prezenterów dla wygody.
- Na pilocie sprawdzamy wejście przez lobby, udostępnianie ekranu i prezentację z konta zewnętrznego.
- Konto gościa B2B w naszym tenant to osobny wariant tożsamości, do zatwierdzenia i skonfigurowania przez administratora M365.

Rozróżnienie użytkownika zewnętrznego i gościa w organizacji jest istotne przy uprawnieniach współorganizatora. [Microsoft — współorganizatorzy](https://support.microsoft.com/en-us/teams/meetings/add-co-organizers-to-a-meeting-in-microsoft-teams).

### Wariant B — spotkanie organizuje trener u siebie

- Trener wkleja link Teams oraz termin; Compass obsługuje zapisy, materiały, przypomnienia i historię.
- Compass nie zakłada prawa modyfikowania tego spotkania ani pobierania jego raportów lub nagrania.
- Zmiany w zewnętrznym Teams trzeba potwierdzić w Compass. Stan edycji jasno oznacza zewnętrznego organizatora.
- Obecność potwierdza prowadzący; import raportu może być pomocniczy, ale wymaga podglądu i mapowania osób.
- Zwykła zmiana pola URL nie zamienia spotkania zewnętrznego w spotkanie zarządzane przez integrację.

### Kontrakt techniczny

Podstawą jest wydarzenie kalendarza z Teams (`isOnlineMeeting`, `onlineMeetingProvider=teamsForBusiness`), ponieważ wymagana jest obsługa zaproszeń, zmian i anulowań. Samo utworzenie `onlineMeeting` nie zastępuje wydarzenia w kalendarzu. [Microsoft — kalendarz i spotkania online](https://learn.microsoft.com/en-us/graph/outlook-calendar-online-meetings), [samodzielne onlineMeeting](https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings?view=graph-rest-1.0). Istniejący klient Graph pracuje app-only; kod klienta nie dowodzi, że tenant ma wszystkie wymagane zgody. Nie zakładamy też, że istniejąca skrzynka nadawcza `noreply` jest prawidłowym organizatorem Teams.

Wdrożenie poprzedza kontrola kont organizatorów, licencji, dozwolonego dostawcy online, efektywnych zgód Graph i zakresu dostępu aplikacji do skrzynek. Rozszerzenie zgód Microsoft 365 lub polityk dostępu wymaga osobnego, jawnego zatwierdzenia administratora organizacji.

Przewidywane obszary zgód: `Calendars.ReadWrite` do wydarzeń; odczyt lub aktualizacja spotkania wymaga odpowiednio `OnlineMeetings.Read.All` albo `OnlineMeetings.ReadWrite.All`; raporty obecności — `OnlineMeetingArtifact.Read.All`. To różne API i zakresy. Dla app-only online meetings/artifacts sprawdzić właściwą application access policy; ograniczenie dostępu do kalendarzy jest osobnym mechanizmem. Ostateczny minimalny zestaw ustalić po próbie technicznej.

Automatyczne tworzenie wydarzenia w kalendarzu nie wymaga automatyzacji nadawania roli prezentera. Można pozostawić tę czynność gospodarzowi, ograniczając zakres zgód. Raport obecności pobieramy dopiero po zakończeniu, z ponowieniami i zapisem identyfikatora raportu. [Microsoft — raporty obecności i wymagane uprawnienia](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-list?view=graph-rest-1.0).

Powiadomienia kalendarzowe wariantu A wynikają z wydarzenia Graph. Nie wysyłać drugiego, identycznego zaproszenia osobnym e-mailem. Wariant B zapewnia powiadomienie w Compass i plik ICS ze stałym identyfikatorem oraz numerem aktualizacji. Pobrany plik ICS nie jest subskrypcją: nie aktualizuje się sam w Outlooku. Po zmianie lub anulowaniu użytkownik otrzymuje informację o konieczności aktualizacji wpisu; odbiór sprawdza import zmienionego pliku w używanym kalendarzu. Automatyczna synchronizacja zewnętrznego kalendarza wymaga osobnej integracji i nie jest obiecywana w tym wariancie.

**Nagrywanie:** domyślnie wyłączone. Nagranie po zajęciach trafia do osobnej sekcji „Materiały po szkoleniu” danej edycji, przechodzi skanowanie i akceptację administratora. Dostęp mają potwierdzeni uczestnicy tej edycji; ich wersja programu i zasady ukończenia nie zmieniają się. Wymagane jest osobne powiązanie pliku z edycją — sam załącznik lekcji nie wystarcza. Lokalny WIP tego obszaru istnieje, lecz wymaga odbioru na rzeczywistym Storage. Włączenie nagrania do programu dla przyszłych uczestników wymaga nowej wersji kursu. Automatyczny import nagrań/transkrypcji pozostaje późniejszym etapem ze względu na odrębne zgody, retencję i prawa do plików. Dostęp do spotkania nie jest równoznaczny z dostępem do nagrania.

## 8. Upload i przechowywanie materiałów

Pierwsze wydanie powinno zawierać rzeczywisty upload, nie tylko pola na linki:

- PDF, PPTX i DOCX jako materiały do pobrania; PDF również do podglądu. Prezentacji nie trzeba automatycznie konwertować.
- MP4 w obsługiwanym przez przeglądarkę kodeku jako nagranie lekcji; w pierwszym wydaniu dopuszczamy sprawdzony format MP4 H.264/AAC, bez własnego systemu transkodowania.
- Zewnętrzne linki wideo tylko z dopuszczonych dostawców; brak dowolnego HTML/iframe i automatycznego pobierania dowolnych URL przez serwer.
- Proponowane limity startowe: dokument 50 MB, wideo 1 GB. Wdrożenie musi zweryfikować limity projektu/bucketu i ustalić limit przestrzeni na autora przed włączeniem — nie zakładamy, że obecny plan Supabase je obsługuje.

Nowy prywatny bucket dla materiałów Akademii, np. `academy-materials`, oraz rekordy plików z właścicielem, wersją kursu, nazwą, typem, rozmiarem, skrótem i stanem walidacji. Ścieżkę nadaje serwer; klient nie wskazuje dowolnego folderu/cudzego pliku.

Pliki większe i wideo wysyłamy bezpośrednio do Storage z autoryzacją i możliwością wznowienia, z pominięciem limitów żądań Next.js. Supabase rekomenduje TUS m.in. dla plików większych niż 6 MB. Plik jest udostępniany dopiero po finalizacji i walidacji; nowa wersja dostaje nową ścieżkę. [Dokumentacja uploadu Supabase](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).

Zasady bezpieczeństwa: allowlista typów, weryfikacja faktycznego formatu i rozmiaru, bez plików wykonywalnych i dokumentów z makrami; skanowanie plików przed udostępnieniem do pobrania. Wybrany kierunek techniczny to ClamAV w prywatnej sieci, z kontrolą aktualności sygnatur i kolejką ponowień. Przed uruchomieniem trzeba potwierdzić zasoby hosta, konfigurację limitów skanowania i schedulery oraz wykonać rzeczywiste testy czystego, zainfekowanego, zaszyfrowanego i granicznie dużego pliku. Awaria skanera, nieaktualne sygnatury lub przekroczenie limitu skanowania pozostawiają plik niedostępny, zamiast oznaczać go jako bezpieczny.

Odczyt wymaga dostępu do kursu/edycji i wersji; szkic dostępny wyłącznie autorom oraz moderatorowi. Krótkotrwały podpisany URL wydajemy dopiero po sprawdzeniu dostępu. Przy przyjętym TTL 300 sekund cofnięcie dostępu blokuje wydanie nowych linków od razu; już wydany link może działać do końca tych pięciu minut. Dla wideo planujemy odświeżenie URL w aktywnej sesji i sprawdzamy odtwarzanie/przewijanie po wygaśnięciu poprzedniego podpisu. RLS musi obejmować również bezpośrednie wywołanie Storage, a nie wyłącznie endpoint aplikacji. [Kontrola dostępu Storage](https://supabase.com/docs/guides/storage/security/access-control).

Istniejące pliki z `documents/courses/...` wymagają inwentaryzacji, kontroli dostępu i ponownej walidacji. Odczyt kompatybilności może czasowo zachować stare referencje; przeniesienie do nowego bucketu następuje dopiero po kopiowaniu i porównaniu plików. Bez usuwania starych plików przy pierwszym wdrożeniu. Proponowany limit autora to 10 GB i 10 równoczesnych niedokończonych uploadów. Sprzątanie osieroconych oraz odrzuconych plików wymaga okresu na wznowienie, sprawdzenia wszystkich referencji i audytu; musi zwalniać limit dopiero po potwierdzonym usunięciu obiektu. Bez tej funkcji odrzucone rezerwacje mogą stopniowo wyczerpać limit. Reguły retencji i usuwania wymagają jawnego ustalenia przed uruchomieniem automatycznego czyszczenia.

### Cykl życia plików i proponowana retencja

Poniższe okresy są propozycją produktową do zatwierdzenia przez właściciela danych, a nie obowiązującą polityką ani interpretacją przepisów.

| Rodzaj | Propozycja startowa | Warunek usunięcia / zachowania |
|---|---|---|
| Niedokończona rezerwacja/upload | 48 h od ostatniej aktywności | Brak aktywnego uploadu, pracy skanera i referencji; uwzględnić ważność podpisów oraz bufor na wznowienie |
| Odrzucony plik w kwarantannie | 30 dni na wyjaśnienie | Niedostępny uczestnikom; usunięcie po sprawdzeniu referencji i zamknięciu sprawy |
| Surowy raport obecności | 90 dni | Zachować zagregowany wynik i ślad podstawy zaliczenia według zatwierdzonej polityki |
| Nagranie konkretnej edycji | Proponowane 12 miesięcy | Data dostępności widoczna przed zapisem; przypomnienie przed końcem, bez usuwania pliku wymaganego w aktywnym programie |
| Materiały wersji, Q&A, ukończenia i audyt | Okres ustala właściciel danych przed uruchomieniem | Nie usuwać automatycznie referencji potrzebnych do aktywnej nauki lub odtworzenia dowodu ukończenia |

Sprzątanie wykonuje odrębne zadanie techniczne w ograniczonych partiach, najpierw w trybie raportowania. Rozdziela rezerwację bajtów, faktyczny obiekt i powiązania historyczne. Rezerwację bez obiektu można zwolnić po wygaśnięciu; zajętość obiektu zwalniamy dopiero po potwierdzonym usunięciu przez Storage. Powtórne uruchomienie nie może podwójnie zwolnić limitu. Błąd usunięcia zostawia stan „do ponowienia” i widoczny koszt, bez zrywania referencji.

Automatyczne usuwanie pozostaje wyłączone do zatwierdzenia polityki i jej zakresu. Wyłączenie konta konsultanta odbiera nowe dostępy, zachowując historyczne dowody zgodnie z polityką. Ewentualne wydanie historycznego potwierdzenia po odejściu obsługuje administrator po identyfikacji osoby; nie przywraca to dostępu do kursów.

## 9. Model danych i wpływ na istniejące funkcje

Poniższy model jest projektem logicznym, nie gotowym DDL. Nazwy dopasować do rzeczywistego schematu po odczycie migracji środowiska.

| Obiekt | Cel i najważniejsze reguły |
|---|---|
| `courses` | Stabilna tożsamość i slug kursu, pochodzenie company/consultant, bieżąca opublikowana wersja |
| `course_versions` | Program, forma, treści i reguły zaliczenia; wersja opublikowana niezmienna |
| Lekcje, quizy i odpowiedzi | Powiązane z wersją; klucz odpowiedzi niedostępny dla uczestnika |
| `academy_user_capabilities` | Nadanie/odebranie trenera oraz opcjonalnej moderacji |
| `course_staff` | Autorzy, redaktorzy i prowadzący z zakresem kursu/edycji |
| `course_runs` | Edycja kursu z przypisaną wersją, limitem miejsc i statusem zapisów |
| `course_sessions` | Poszczególne spotkania edycji, czas, gospodarz, tryb Teams, link i stan synchronizacji |
| `course_enrollments` | Zapis użytkownika na konkretną wersję i opcjonalnie edycję; stare rekordy zachowane |
| `session_attendance` | Obecność, źródło dowodu, czas, ręczna korekta i osoba zatwierdzająca |
| `course_materials` | Pliki i ich powiązania, stan uploadu/walidacji, widoczność |
| Powiązania M365 | Konto Compass ↔ tenant/object ID; zweryfikowane powiązanie, bez dopasowania po nazwie |
| `academy_integration_jobs` | Kolejka operacji Graph/powiadomień, stabilny klucz, próby, następne wykonanie, błąd |
| `course_completions` | Zatwierdzony dowód zaliczenia i snapshot certyfikatu, jedna operacja zakończenia |

Docelowe zależności: **kurs → wersja → zapis**, a dla live **wersja → edycja → sesje**, z obecnością przypisaną do zapisu i sesji. Stały slug kursu wskazuje aktualną wersję dla nowych osób; odsyłacz „Kontynuuj” otwiera wersję przypisaną uczestnikowi.

Istniejące ograniczenie unikalności zapisu na użytkownika i kurs wymaga przeglądu przed wprowadzeniem edycji. Nie usuwać go bez zastąpienia: jeden aktywny zapis samodzielny na dany kurs, przypięty do konkretnej wersji, oraz jeden zapis użytkownika na daną edycję. Dla listy rezerwowej, zatwierdzenia i ukończenia wymagane są transakcje oraz odporność na równoczesne żądania.

Do prześledzenia przy wersjonowaniu: listy kursów, szczegóły, player, quiz RPC, certyfikaty, ankiety, Q&A, prerequisites, learning paths, rekomendacje, liczniki/analytics, cron bezczynności, punkty autora i uczestnika. Zaliczenia historyczne zachować; nie naliczać ponownie nagród podczas backfillu. Q&A trzeba przypisać do wersji lub jawnie oznaczyć jako wspólne dla kursu, aby odpowiedzi nie traciły kontekstu.

**Kontekst funkcji dodatkowych — rekomendowane reguły:**

- Q&A o programie jest wspólne dla konkretnej wersji i widoczne osobom uprawnionym do tej wersji, także z różnych edycji. Ekran wyraźnie informuje, że pytanie nie jest prywatną wiadomością. Informacje o indywidualnych wynikach i obecności pozostają poza tym forum.
- Ocena gwiazdkowa dotyczy kursu: jedna edytowalna ocena użytkownika, powiązana z jego ukończeniem. Ankieta po zajęciach dotyczy konkretnego ukończonego zapisu/edycji, raz na zapis. Obie funkcje działają również przy kursie bez quizu.
- Ścieżka nauki zapisuje zestaw wymaganych kursów w chwili zapisu; późniejsza edycja ścieżki nie zmienia go po cichu. Opcjonalny kurs nie blokuje obowiązkowego. Niedostępny wymagany kurs ma widoczny stan i zadanie administratora.
- Postęp obejmuje cały przypisany program, także lekcje odblokowywane później. Jedna z trzech lekcji daje 33%, a nie 100%. Link z przypomnienia prowadzi do właściwego zapisu, wersji i edycji; anulowany lub nieaktywny zapis nie dostaje przypomnienia.

Migracja: odczyt aktualnego schematu → addytywne tabele/kolumny → utworzenie wersji v1 dla istniejących kursów → mapowanie lekcji/zapisów i plików → porównanie liczników i próbek → przełączenie aplikacji → dopiero osobny późniejszy cleanup. Nie resetujemy istniejących wyników, slugów ani certyfikatów.

Nie nadajemy uprawnienia trenera automatycznie wszystkim historycznym autorom. Nie dopisujemy fikcyjnej akceptacji administratora do starych publikacji: kursy bez pewnego dowodu zatwierdzenia trafiają do przeglądu przed udostępnieniem nowym uczestnikom. Odtworzenie historycznego snapshotu certyfikatu oznaczamy źródłem i datą migracji, zamiast przedstawiać dzisiejsze dane jako pewny dokument z przeszłości.

## 10. Ochrona danych i niezawodność

- Wspólny zestaw reguł domenowych egzekwowany przez akcje serwerowe i bazę. Ukrycie przycisku nie jest autoryzacją.
- Użytkownik nie zapisuje sam `passed`, `completed_at`, punktów, akceptacji, ownera, `course_type` lub `is_official`. Wprowadza odpowiedzi/żądanie operacji, a wynik oblicza kontrolowana transakcja.
- Zatwierdzenie kursu sprawdza aktualny stan i identyfikator wersji; spóźnione kliknięcie nie publikuje innego szkicu.
- Trener widzi osoby i dane potrzebne do prowadzenia własnego szkolenia; nie otrzymuje wglądu do HR lub wyników innych kursów. Lista uczestników nie jest publicznym katalogiem e-maili.
- Serwerowe klucze pozostają wyłącznie na serwerze. Job działający z uprawnieniami technicznymi weryfikuje zakres zapisanej operacji i jej bieżący stan.
- Audyt: nadanie/odebranie trenera, zgłoszenie/akceptacja/odrzucenie/wycofanie wersji, publikacja i zmiana sesji, obecność i korekta, wystawienie/unieważnienie ukończenia.
- Retencję raportów obecności i plików należy opisać przed startem. Wstępna propozycja: surowe raporty 90 dni, zagregowane ukończenia zgodnie z firmową polityką. To założenie produktowe do ustalenia, nie interpretacja prawna.

Zapis w bazie i wywołanie Graph nie tworzą wspólnej transakcji. Zapisujemy zatem operację do trwałej kolejki razem z decyzją użytkownika; worker wykonuje ją po commit. W repo istnieją wzorce kolejek powiadomień i heartbeatów cron — reużyć je bez budowania ogólnej platformy workflow.

Każda operacja ma klucz wynikający z sesji, rodzaju i rewizji. Przy tworzeniu wydarzenia używamy stabilnego `transactionId` oraz uzgadniania wyniku po timeout. Worker bierze blokadę/lease, a aktualizacje jednej sesji wykonuje po kolei. Nowsze anulowanie unieważnia starsze oczekujące tworzenie/przypomnienie; spóźniona odpowiedź nie przywraca anulowanego terminu.

Retry respektuje `Retry-After`, ma ograniczoną liczbę prób i stan wymagający interwencji. Widoczne są ostatni błąd, data próby i bezpieczny przycisk ponowienia. Nie deklarujemy „wysłano” przy samym dodaniu zadania do kolejki.

Zadania w tle: synchronizacja spotkań i zapisów, przypomnienia, pobieranie obecności po zakończeniu, finalizacja materiałów i porządkowanie niedokończonych uploadów. Każde ma limit partii, cron auth, heartbeat, kontrolę duplikatów i monitoring zaległości.

Propozycja przypomnień: potwierdzenie zapisu, 24 h i 1 h przed sesją, zmiana/anulowanie oraz informacja o gotowych materiałach. Kanały: aplikacja i właściwe zaproszenie kalendarzowe; e-mail tylko tam, gdzie nie dubluje kalendarza. Planowanie modułu nie oznacza zgody na wysyłanie jakichkolwiek wiadomości teraz.

### Odpowiedzialność operacyjna i cele pilota

| Obszar | Właściciel funkcji | Proponowany czas reakcji |
|---|---|---|
| Akceptacja i poprawki programu | Administrator Akademii + niezależny zastępca | Decyzja lub komentarz do 2 dni roboczych |
| Gotowość spotkania i zastępstwo | Prowadzący + wskazany gospodarz M365 | Sprawdzenie najpóźniej dzień roboczy przed sesją |
| Awaria spotkania, skanera albo kolejki | Operator techniczny + administrator Akademii | Alert po wyczerpaniu prób; zadanie z właścicielem, bez pozornego sukcesu w UI |
| Retencja, dostęp po odejściu, unieważnienia | Właściciel Akademii i właściciel danych | Według uzgodnionej polityki przed uruchomieniem |

To proponowane odpowiedzialności; nazwiska, godziny wsparcia i terminy wymagają ustalenia przed pilotem. Nie obiecujemy całodobowego SLA bez zapewnionej obsady.

Warunki jakości: zero ujawnienia cudzych materiałów/wyników w scenariuszach negatywnych, zero podwójnych miejsc/nagród/spotkań przy ponowieniach, poprawny zapis postępu po przerwaniu sesji, wszystkie trzy formy szkolenia na desktop/mobile i z klawiatury. Cel wydajności dla pilota: p95 odczytu katalogu i szczegółów do 2 s przy 20 równoległych sesjach na uzgodnionym środowisku testowym, z pomiarem osobno od transferu wideo. Docelowy profil skali i budżet zasobów ustalamy w etapie 0; taki pomiar nie dowodzi wydajności dla większej organizacji.

Przed startem potwierdzić backup oraz procedurę odtworzenia bazy i plików; sprawdzenie samej kopii bazy nie wystarcza do odtworzenia materiałów. Alerty obejmują brak heartbeatów, wiek kolejki, wyczerpane próby, świeżość sygnatur, wykorzystanie przestrzeni i brak raportu obecności. Każdy stan błędu pokazuje, kto może go rozwiązać.

## 11. Etapy realizacji i podział pracy

| Etap | Zakres | Warunek odbioru |
|---|---|---|
| 0. Weryfikacja bazowa | Faktyczny schemat/polityki/granty, dane LMS, limity Storage, konta i zgody M365, scenariusz trenera zewnętrznego | Potwierdzone zależności; lista wymaganych zgód i kosztów; rozstrzygnięty sposób organizacji pilota |
| 1. Dostęp i wiarygodność | Grant trenera, kontrola statusów/wyników, wersjonowanie, kompatybilna migracja | Uczestnik nie tworzy/publikuje kursu i nie podrabia zaliczenia; stare treści/postępy zachowane |
| 2. Kurs i materiały | Panel autora, upload, akceptacja wersji, player, quiz i certyfikat | Trener dodaje materiały → admin akceptuje → uczestnik kończy kurs |
| 3. Szkolenia na żywo | Edycje, sesje, zapisy/limity, kalendarz, własny link Teams, ręczna obecność | Pełny przebieg z zewnętrznym trenerem, zmiana i anulowanie terminu |
| 4. Automatyzacja Teams | Spotkania w naszym tenant, kolejka Graph, synchronizacja zaproszeń, raporty obecności | Wewnętrzny gospodarz + zewnętrzny prezenter; poprawny zapis, retry i obecność |
| 5. Pilot i uruchomienie | Regresja, dostępność/mobile, obserwowalność, szkolenie admina/trenerów, kontrolowane odsłonięcie Akademii | Udokumentowane scenariusze produkcyjne i brak blockerów dostępu/zaliczeń |

Pierwsze użyteczne wydanie obejmuje etapy 0–3 oraz pilot i odbiór z etapu 5. Obsługuje pełny proces z linkiem Teams i audytowaną ręczną obecnością. Etap 4 dodaje automatyzację i ma własny odbiór integracyjny; można go dostarczyć równolegle, jeśli zgody są dostępne, ale ich brak nie blokuje uruchomienia podstawowego panelu. Wariant ręcznego linku pozostaje trwałym wsparciem zewnętrznych organizatorów. Interfejs zawsze informuje, które operacje są automatyczne.

**Podział na równoległe strumienie implementacyjne:**

1. Agent A: model danych, RLS, granty, wersjonowanie i transakcje zaliczeń.
2. Agent B: panel trenera, upload i moderacja; po uzgodnieniu kontraktów z A.
3. Agent C: edycje, Teams, kalendarz, kolejka i obecność; według kontraktów A.
4. Agent główny: integracja, widoki uczestnika, niezależny przegląd, testy i dostarczenie.

Każdy strumień ma własne pliki i kontrakty, aby nie edytować równolegle tych samych akcji/migracji. Fundament uprawnień i wersji wyprzedza implementację zależnych UI. Dostarczać małe, pionowe PR-y, które nie odsłaniają nieukończonego modułu.

**Orientacyjna wielkość pełnego zakresu od stanu bazowego, łącznie z automatyzacją Teams:** 20–35 osobodni pracy wraz z integracją i testami, około 3–5 tygodni przy 2–3 równoległych strumieniach i dostępnych kontach testowych. Pierwsze wydanie bez automatyzacji może zostać odebrane wcześniej po swoich bramkach. To estymata planistyczna, nie termin zobowiązania ani szacunek pozostałej pracy w lokalnym WIP. Po etapie 0 i przeglądzie istniejących zmian należy oszacować pozostały zakres ponownie. Zgody M365, niezgodności schematu lub nowa infrastruktura skanowania mogą przesunąć termin.

## 12. Scenariusze odbioru

| ID | Scenariusz | Oczekiwany wynik |
|---|---|---|
| A01 | Uczestnik otwiera panel autora lub wywołuje jego API | Odmowa; brak zapisu danych |
| A02 | Trener tworzy szkic i przesyła PDF/PPTX/MP4 | Upload z postępem; pliki dostępne tylko we właściwym zakresie |
| A03 | Admin odrzuca, trener poprawia i zgłasza ponownie | Komentarz i pełna historia; publikacja dopiero po akceptacji |
| A04 | Trener próbuje zmienić opublikowaną treść lub status przez API | Powstaje nowy szkic albo odmowa; opublikowana wersja bez zmian |
| A05 | Dwie osoby zapisują się na ostatnie miejsce | Jedno miejsce zajęte, druga osoba na rezerwie |
| A06 | Zewnętrzny trener prowadzi firmowe spotkanie Teams | Poprawne wejście, rola prezentera i udostępnianie ekranu |
| A07 | Trener korzysta z własnego spotkania Teams | Działa zapis, link i ręczna obecność; brak fikcyjnej synchronizacji |
| A08 | Graph przyjął tworzenie, ale odpowiedź zaginęła | Retry nie tworzy drugiego spotkania ani zaproszenia |
| A09 | Zmiana/anulowanie terminu przy zaległych jobach | Wariant firmowy: aktualizacja Graph i UI, bez starych przypomnień. Wariant zewnętrzny: powiadomienie i poprawiony ICS z jawną informacją o ręcznej aktualizacji |
| A10 | Powrót do spotkania i wejście z dwóch urządzeń | Obecność bez podwójnego liczenia czasu |
| A11 | Raport spóźniony lub osoba ma niejednoznaczną tożsamość | Stan do weryfikacji; brak fałszywej nieobecności/zaliczenia |
| A12 | Użytkownik próbuje wpisać wynik quizu/ukończenie bezpośrednio | Baza odmawia; certyfikat i nagrody nie powstają |
| A13 | Powtórzone zakończenie kursu / równoległy quiz | Jedno ukończenie i jedna właściwa nagroda |
| A14 | Pobranie materiału z cudzego szkicu albo odgadnięta ścieżka | Odmowa również przez bezpośrednie Storage/API |
| A15 | Przerwane przesyłanie i wygaśnięty URL odtwarzania | Wznowienie uploadu, odświeżenie dostępu, brak utraty postępu |
| A16 | Migracja istniejącego kursu i jego uczestników | Zachowane treści, slugi, postępy, historia certyfikatów |
| A17 | Odebranie trenera oraz istniejące sesje | Blokada edycji autora; sesje widoczne administratorowi do przejęcia |
| A18 | Telefon, klawiatura, zmiana czasu Europe/Warsaw | Poprawne terminy, dostępne akcje i czytelny układ |
| A19 | Podpisany TUS wysyła inny rozmiar/MIME; grant lub kurs zostaje wycofany przed finalizacją | Rzeczywisty Storage odmawia finalizacji; błędny obiekt nie jest dostępny i nie pozostaje niekontrolowanym kosztem |
| A20 | Skaner jest wyłączony, ma stare sygnatury lub pomija plik przekraczający limit | Brak statusu „bezpieczny”; widoczny błąd, możliwość kontrolowanego ponowienia |
| A21 | Drip, anulowanie zapisu i próba odczytu cudzej wersji | Pełne treści i pliki dostępne tylko według bieżących uprawnień; wyjątek wcześniej wydanego URL ma TTL maks. 300 s |
| A22 | Q&A, ankieta i ukończenie ścieżki po publikacji nowej wersji | Zachowany właściwy kontekst kursu i zapisu; brak podwójnych nagród |
| A23 | Współprowadzący otrzymuje i traci przypisanie | Dostęp wyłącznie do przydzielonego zakresu; brak prawa publikacji programu i samodzielnego zaliczania własnego udziału |
| A24 | Nagranie dodane po szkoleniu i zatwierdzone | Zapisana grupa widzi materiały swojej edycji bez migracji programu; osoba z innej edycji nie ma dostępu |
| A25 | Po publikacji V2 uczestnik kontynuuje V1; ukończył 1 z 3 lekcji z blokadą czasową | Program i quiz pozostają z V1; postęp 33%, bez dostępu do zablokowanych treści |
| A26 | Autor jest administratorem lub usunięto mu historyczne przypisanie redaktora | Nie zatwierdzi własnej wersji; działa niezależny moderator |
| A27 | Wymagana sesja została anulowana po zapisach | Nie powstaje automatyczne ukończenie; widoczny termin zastępczy lub stan oczekiwania |
| A28 | Anulowanie zapisu tuż przed wykonaniem przypomnienia | Zadanie nie wysyła przypomnienia; link do innego zapisu nie jest podstawiany |
| A29 | Kurs bez quizu oraz ponowny udział w innej edycji | Ocena i ankieta dostępne po ukończeniu; osobne potwierdzenie udziału, bez drugiej nagrody za kurs |
| A30 | Dziesięć ponowień zakończenia lub równoległa korekta obecności | Jedna operacja ukończenia/nagrody; unieważnienie certyfikatu jawne i audytowane |
| A31 | Sprzątanie starego uploadu przy istniejącej referencji lub błędzie Storage | Materiał aktywnej/historycznej wersji zachowany; limit zwolniony dokładnie raz dopiero po potwierdzeniu |
| A32 | Dwie edycje tej samej wersji oraz redaktor bez roli prowadzącego | Q&A wspólne zgodnie z opisem; postępy i obecność ograniczone do uprawnionej grupy; redaktor bez list uczestników |
| A33 | Wyłączenie konta, błąd skanera, brak heartbeatów i odtwarzanie backupu | Cofnięte nowe dostępy; plik nieudostępniony bez skanu; alert z właścicielem; odtworzone rekordy i pliki zgodne |
| A34 | Telefon 390 px, klawiatura, stan pusty, błąd formularza i utrata sieci | Bez uciętych akcji; czytelny fokus; polski komunikat wskazuje przyczynę; brak utraty danych i podwójnego wysłania |

Lokalnie: skupione testy reguł uprawnień/zaliczeń, parsowania obecności i kolejki, lint zmienionych modułów i typecheck. Bez lokalnego Dockera. RLS i Storage muszą mieć testy negatywne na izolowanym środowisku z normalnymi tokenami uczestnika/trenera, nie tylko testy na `service_role`.

Hosted CI: obecny workflow to `.github/workflows/build-check.yml` (secret scan, lint, typecheck, Vitest, build). `ci.yml` wspomniany w instrukcjach nie występuje w analizowanym SHA. Testy przeglądarkowe/migracji uruchamiać w właściwym CI lub izolowanym środowisku; samo CI z placeholderami nie sprawdza prawdziwej integracji Teams.

## 13. Dostarczenie i uruchomienie

1. Izolowana gałąź/worktree, przegląd dokładnego diffu, commit i PR; bez włączania cudzego WIP.
2. Addytywne migracje sprawdzone w środowisku testowym, dowód zgodności backfillu, brak destrukcyjnych zmian.
3. Zielone wymagane CI → squash merge → istniejący workflow `deploy.yml` i Coolify. Zachować przekazywanie `GIT_SHA`.
4. Sprawdzić zakończenie deploymentu, `/api/health` z User-Agent `dynaminds-smoke-test/1.0`, poprawny status i wdrożony SHA. Jeśli wdrożenie zawiera nowszy commit, potwierdzić jego pochodzenie i obecność zmiany; nie traktować samego HTTP 200 jako odbioru.
5. Zweryfikować migracje i faktyczne polityki oraz uruchomienie zadań w tle.
6. Produkcyjny pilot na wskazanych kontach testowych: administrator, trener wewnętrzny, trener z zewnętrznym Teams i uczestnik. Zaproszenia wysyłane wyłącznie do uzgodnionych uczestników pilota.
7. Realne przejście w profilu Chrome: upload → akceptacja → zapis → Teams → obecność → ukończenie i certyfikat. Dowody: wynik interakcji i screenshoty.
8. Odsłonić Akademię dla wybranej grupy, następnie wszystkich objętych zakresem. Samo usunięcie `learning` z listy „wkrótce” następuje po odbiorze; `league` pozostaje niezależną decyzją.

Rollback aplikacji powinien korzystać z kompatybilnych, addytywnych migracji. Awaria automatyzacji Teams może przełączyć wybrane edycje w jawny tryb ręczny, zachowując identyfikatory i ochronę przed drugim spotkaniem. Ukrycie menu nie zastępuje serwerowej blokady nowych zapisów. Destrukcyjny rollback bazy, usuwanie spotkań/danych lub wyłączenie publicznej usługi wymaga osobnej decyzji.

Metryki pilota: udane/nieudane uploady, czas i zaległości akceptacji, błąd i wiek jobów Graph, dopasowanie obecności, porzucone zapisy, ukończenia i oceny. Proponowany pilot: 2–3 trenerów, 10–20 uczestników oraz po jednym kursie samodzielnym, live i mieszanym; zewnętrzny prowadzący w dwóch wariantach organizacji spotkania. Raport administratora pokazuje liczby zapisów/ukończeń, frekwencję, wyniki zaliczeń i wykorzystanie materiałów w jego zakresie. Dane osób są dostępne tylko uprawnionym; agregaty nie dają prowadzącemu dostępu do innych grup.

## 14. Koszty, otwarte zależności i dalszy rozwój

Nie ma podstaw do podania wiarygodnej kwoty bez liczby uczestników, godzin wideo i obecnych planów usług. Kalkulacja przed etapem 2 obejmuje: przyrost GB materiałów, miesięczny transfer wideo, skanowanie plików, limity projektu Supabase i licencje organizatorów Teams. Przykład wyłącznie obliczeniowy: 20 nagrań po 0,5 GB to 10 GB składowania; 100 pełnych odtworzeń nagrania 0,5 GB daje około 50 GB transferu przed uwzględnieniem cache i ponownych pobrań.

| Zależność do potwierdzenia | Założenie pozwalające planować |
|---|---|
| Kto moderuje i nadaje trenerów | Obecni administratorzy Compass |
| Kto jest gospodarzem zewnętrznych prowadzących | Wskazany wewnętrzny organizator z Teams i kalendarzem |
| Zgody/polityki Microsoft 365 | Odczyt i próba techniczna przed automatyzacją; własny link pozostaje obsługiwany |
| Rozmiary materiałów i liczba użytkowników | Pilot 10–20 osób; limity uploadu zatwierdzić po sprawdzeniu planu Storage |
| Retencja i publikacja nagrań | Nagrywanie domyślnie OFF, dostęp tylko dla właściwych uczestników |
| Kursy obowiązkowe i dostęp HR | Poza pierwszym zakresem; obecne role globalne pozostają bez zmian |

Po pierwszym wydaniu: przypisywanie obowiązkowych szkoleń grupom i terminów ukończenia, zadania oceniane przez trenera, automatyczny import nagrań, większa biblioteka wideo z transkodowaniem, SCORM/xAPI, zewnętrzna sprzedaż i rozliczenia. AI może później pomagać autorowi przygotować szkic lub quiz; nie jest zależnością podstawowego procesu.


### Macierz gotowości na 22.09.2026

Status „lokalny WIP” oznacza obecność roboczej implementacji. Nie jest równoznaczny z gotowością produkcyjną. Aktualne wyniki sprawdzamy w toku realizacji; lokalne testy nie zastępują hosted CI ani odbioru produkcyjnego.

| Obszar | Aktualny stan | Co pozostaje do odbioru |
|---|---|---|
| Role, wersje, zapisy, ukończenia | Lokalny WIP i skupione testy | Wspólny przegląd, pełny CI, replay migracji, rzeczywiste polityki i testy obejścia |
| Redaktorzy, współprowadzący, przegląd starych publikacji | Lokalny WIP; agent zgłosił 56 testów SQL i 6 nowych testów actions/UI | Test uprawnień pomiędzy grupami i niezależnego recenzenta w pełnym środowisku |
| Katalog, kalendarz miesięczny, podgląd programu | Lokalny WIP; podgląd komponentów desktop/mobile | Rzeczywiste dane, sesje użytkowników i pełne ścieżki w przeglądarce |
| Postęp, przypomnienia, ścieżki, ocena/ankieta | Lokalny WIP; translator naprawiony i sprawdzony testem regresji | Hosted CI i rzeczywiste przejście uczestnika |
| Materiały kursu i edycji, moderacja plików | Lokalny WIP i testy reguł | Prawdziwy TUS/Storage/RLS, skaner, limit graniczny, aktualność sygnatur i wznowienie |
| Czyszczenie uploadów i retencja | Zdefiniowany kierunek, brak kompletnego odbioru | Zatwierdzona polityka, zadanie, audyt, odzyskiwanie limitu i testy błędów usuwania |
| Teams zewnętrzny i zarządzany | Lokalny WIP; brak pilota Microsoft | Konta, licencje, zgody/polityki, kalendarz, prezentacja, obecność i brak duplikatów |
| Unieważnienie certyfikatu i wyjątki ukończenia | Lokalny WIP: audytowane unieważnienie, brak pobrania PDF po unieważnieniu, korekta powiązanych nagród | Hosted PostgreSQL i produkcyjny test historii oraz statusu certyfikatu |
| Operacje i infrastruktura | Przygotowane robocze workflow i instrukcje | Odczyt konfiguracji, zasoby skanera, schedulery, backup/restore i alerty |
| Dostarczenie | Brak commita, pushu i wdrożenia modułu | PR, zielone CI, migracje, merge, poprawny SHA i produkcyjny odbiór użytkowy |

Zewnętrzny link Teams jest trwałym wariantem produktu. Nie potwierdza odbioru automatyzacji spotkań firmowych. Pełny zakres wymaga osobnego dowodu dla każdego wariantu.

**Otwarta luka odbioru — własna frekwencja uczestnika:** obecny widok edycji pokazuje uczestnikowi stan ukończenia, ale szczegółowy panel obecności jest dostępny tylko prowadzącym. Należy dostarczyć odczyt własnej obecności dla każdej wymaganej sesji: stan do weryfikacji/potwierdzona/niewystarczająca, potwierdzony czas i próg z przypisanej wersji, z zachowaniem historii zastępstw. Kryterium odbioru: przy dwóch wymaganych sesjach uczestnik jednoznacznie widzi, która blokuje ukończenie; nie może odczytać danych innego zapisu ani ręcznie zmieniać wyniku. To osobny follow-up; poprawka obowiązkowego czasu ręcznej decyzji i komunikatu o zewnętrznym anulowaniu nie zawiera nowego API frekwencji.

### Decyzje przed pilotem

Właściciel Akademii wskazuje moderatora i zastępcę, grupę pilota oraz dostęp ról innych niż konsultanci. Administrator M365 potwierdza organizatorów, uprawnienia i zasady gości/lobby. Właściciel danych zatwierdza retencję, dostęp do nagrań i obsługę historycznych potwierdzeń. Operator techniczny potwierdza zasoby, limity i zadania w tle. Brak tych ustaleń nie blokuje przygotowania planu ani niezależnych prac technicznych; blokuje tylko zależne uruchomienie funkcji.

## 15. Dowody i źródła

Punkty orientacyjne w repo przy SHA `867b2b6b76f760d4612af704ee03f2c197967de2` (ścieżki względem repo):

- `COMPASS/lib/types/learning.ts:7` — statusy; `:11` — pochodzenie company/consultant; `:52` — lekcje; `:158` — enrollment/progress.
- `COMPASS/lib/types/permissions.ts:54` — `learning` oraz `league` jako coming soon; `COMPASS/middleware.ts:132` — blokada platformowych widoków dla ról HR.
- `COMPASS/app/(protected)/learning/page.tsx:52` — ogólnodostępne CTA tworzenia; `COMPASS/lib/actions/courses.ts:68` — createCourse.
- `COMPASS/components/learning/CourseEditWizard.tsx:29`, `COMPASS/lib/actions/courses.ts:124` i `:473` — edycja opublikowanej treści; `:666` — wymiana quizu.
- `COMPASS/components/learning/LessonPlayer.tsx:114` i `COMPASS/app/api/akademia/attachment/route.ts:13` — rozbieżność adresu załącznika i obecny odczyt pliku.
- `COMPASS/lib/actions/course-learning.ts:273` i `:308` — quiz przez RPC; `:245` — zapis dostępu do lekcji.
- `COMPASS/app/(protected)/learning/[slug]/wyniki/page.tsx:23` — wynik z parametrów URL; `COMPASS/app/api/akademia/certificate/route.ts:27` — dane certyfikatu z aktualnego kursu.
- `COMPASS/supabase/migrations/20260504500001_phase15_rls_helpers_rewrite.sql:119` oraz `:157` — polityki enrollment/attempts/courses; `20260504000005_phase1_courses_dual_source.sql:64` — naliczanie nagród; `20260429_lms_akademia.sql:614` i `:780` — bonus publikacji i scoring; `20260512000001_phase18_security_hardening.sql:72` — zakres cofnięcia EXECUTE. Wskazania migracji opisują repo, wymagają porównania z efektywnymi politykami produkcji.
- `COMPASS/lib/graph/client.ts:1` — istniejący wspólny klient app-only; `COMPASS/lib/calendar/graph-events.ts` — wzorce wydarzeń kalendarza.
- `COMPASS/lib/consultant-success/delivery.ts:196` — istniejący wzorzec idempotencji powiadomień; `COMPASS/lib/audit/cron-heartbeat.ts:60` — heartbeat zadań.
- `.github/workflows/build-check.yml`, `.github/workflows/deploy.yml` i `COMPASS/package.json` — faktyczne ścieżki weryfikacji i dostarczenia.

Źródła zewnętrzne: podczas tej aktualizacji ponownie odczytano oficjalne dokumentacje Microsoft dotyczące kalendarza, tworzenia wydarzeń, współorganizatorów i raportów obecności oraz Supabase dotyczące TUS i kontroli Storage. Ograniczenia platform są faktami z dokumentacji; progi ukończenia, role produktu, limity, retencja i czasy reakcji są rekomendacjami tego planu.

- [Supabase — resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).
- [Supabase — Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
- [Microsoft Graph — kalendarz i spotkania online](https://learn.microsoft.com/en-us/graph/outlook-calendar-online-meetings).
- [Microsoft Graph — create event](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0).
- [Microsoft Graph — create onlineMeeting](https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings?view=graph-rest-1.0).
- [Microsoft Graph — attendance reports](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-list?view=graph-rest-1.0).
- [Microsoft — role współorganizatorów](https://support.microsoft.com/en-us/teams/meetings/add-co-organizers-to-a-meeting-in-microsoft-teams).

Granice dowodów: opis stanu bazowego repo dotyczy wskazanego SHA; nie opisuje wszystkich późniejszych lokalnych zmian. Poprzedni odczyt środowiska wykazał jeden kurs, jedną lekcję oraz brak zapisów i prób quizu; tych liczników nie odświeżano przy aktualizacji planu. Nie przeprowadzono pełnego hosted CI, wdrożenia ani uwierzytelnionego odbioru produkcyjnego. Nie zmieniano zgód M365 i nie utworzono żadnego spotkania ani wiadomości. Nowe funkcje opisują zakres docelowy; macierz §14 pokazuje granice obecnego przygotowania.

# Akademia: czeka na właściciela

Rzeczy, których sesje budujące nie domkną bez człowieka: próby na produkcji, scenariusze przez SSO, zastosowanie migracji. Każdy tor dopisuje swoje pozycje pod własnym zadaniem.

## B0.12 Kontrakt migracji

- Ustalić stałą porę okna dziennego na stosowanie migracji i wpisać ją w `docs/academy/migracje-do-zastosowania.md`, punkt 1 rytmu.

## B0.2 Bramka wyjścia i kolejka wstrzymanych wiadomości

- Zastosowanie migracji powyżej.
- Wpisanie w vault `ACADEMY_MAIL_TEST_RECIPIENTS` (własne skrzynki właściciela), gdy mają ruszyć wysyłki testowe. Do tego czasu lista jest pusta i wysyłka testowa odmawia.

## B0.3 Przegląd kanałów wyjścia

- Scenariusz G03 (ręczny, po zastosowaniu migracji z B0.2): cron `course-inactivity` na nieaktywnym zapisie kursu próbnego daje 0 wysłanych, wiersz `held` i parę start/done w heartbeacie.
- Sprawdzenie, czy trasa `course-inactivity` ma harmonogram w Coolify. Z repo tego nie widać, a audyt nie znalazł o nim zapisu.

## B0.4 Rejestr przełączników i blokada trybu open

- Zastosowanie migracji powyżej i wykonanie smoke testu na produkcji w transakcji z ROLLBACK (G06).
- Do czasu zastosowania migracji tryb open blokuje tylko panel i akcja. Baza nadal go przyjmuje przy bezpośrednim wywołaniu `academy_set_rollout` przez admina.

## B0.5 Panel Gotowość do startu

- G04 ręcznie: panel przez SSO jako administrator, potem odmowa dla konta TCM i konta spoza redakcji.
- Blokadę trybu open panel potwierdza dopiero wynikiem G06, bo aplikacja nie odczytuje ograniczeń bazy.

## B0.6 Kurs-atrapa, data startu raportów, porządek w szkicach

- Konta consultant, odczyt zbiorczy z produkcji 2026-11-09: 2 konta, oba kiedykolwiek się logowały, 0 logowań w ostatnich 90 dniach, 1 ma hasło, 1 ma tożsamość Azure, 0 zablokowanych. Czy logowanie dziś działa, można potwierdzić tylko samym logowaniem, więc wymaga człowieka. Wskaż, kto z tych dwóch kont korzysta; do tego czasu nie wchodzą do prób.
- Kurs-atrapa do E2E: gdy TCM założy szkic i przejdzie on recenzję, oznacz go SQL-em w oknie migracji: `UPDATE public.courses SET is_rehearsal=true WHERE id='<uuid>';` (w kodzie nie ma do tego przycisku).
- Data startu raportów, na bramce startu: `UPDATE public.academy_rollout_settings SET reports_start_at='<data>' WHERE singleton;` Do tej chwili raporty mają etykietę „próba”.

## B0.7 Harness E2E bez uprzywilejowanych haseł

Sesje budujące nie zmieniają vault Coolify ani sekretów GH, więc zrobisz to Ty:

1. Wygeneruj sekret: `openssl rand -hex 32`. Nie wklejaj go do czatu.
2. Coolify → Resources → compass → Environment Variables: dodaj `ACADEMY_READINESS_SECRET` z tą wartością. Zapisz i zrób redeploy w oknie dziennym.
3. GitHub → repo `B2B-net-S-A/COMPASS` → Settings → Secrets and variables → Actions: dodaj sekret o tej samej nazwie i wartości.
4. Sprawdź: Actions → „Academy acceptance” → Run workflow (bez opcji dokumentów). Zielony bieg zapisuje stan scenariuszy, a ostatni test sprawdza 0 wiadomości poza listą skrzynek właściciela.

Bieg z laptopa, po tych krokach (w katalogu `COMPASS/`):

```bash
ACADEMY_E2E_BASE_URL=https://compass.dynaminds.pl ACADEMY_READINESS_SECRET=<z-vault> \
  npx playwright test -c playwright.academy.config.ts
```

Scenariusze kończące się dokumentem idą tylko z `ACADEMY_E2E_INCLUDE_DOCUMENT=true`, bo każdy bieg zostawia nieusuwalne ukończenie. Automat zaloguje się dopiero kontami próbnymi z B1. Stały kurs-atrapa ustawia pozycja z sekcja B0.6 w `docs/academy/czeka-na-wlasciciela.md`, a jego `quiz_attempt_limit` ustaw przy szkicu, zanim wersja pójdzie do recenzji.

## B0.8 Sygnał dla recenzenta i autora

- G07 ręcznie po zastosowaniu migracji: TCM zgłasza kurs próbny, właściciel widzi sygnał w dzwonku i licznik kolejki, TCM wycofuje i zgłasza ponownie, właściciel publikuje.

## B0.9 Odczyty właściciela i zabezpieczenie nagrań

### Krok 1. Przed pierwszą migracją Akademii: odczyt kopii zapasowych

1. Zaloguj się do Supabase i otwórz projekt `shduiynzemftkqqefscd`.
2. Wejdź w Database → Backups.
3. Zapisz: czy PITR jest włączony (zakładka Point in Time) i jaki ma horyzont w dniach.
4. Zapisz: czy są kopie dzienne (Scheduled backups), datę najstarszej i najnowszej.
5. Jeśli PITR jest wyłączony, napisz to wprost. Migracje z notką „nieodwracalne, cofamy PITR” bez niego nie mają planu cofnięcia, więc najpierw zdecyduj: włączyć PITR albo przed oknem zrobić ręczną kopię.

### Krok 2. Globalny limit plików Storage

1. W tym samym projekcie wejdź w Storage → Settings.
2. Zapisz wartość „Upload file size limit”. Próba B0.11 wymaga pliku MP4 około 1 GB, więc limit poniżej tej wartości blokuje próbę.
3. Porównaj z `docs/academy/storage-gate.md`.

### Krok 3. Wpis wyniku w panelu Gotowość

Po zastosowaniu migracji `20261109130300_academy_readiness.sql` i wdrożeniu panelu:

1. Otwórz `/admin/learning/gotowosc`, zaloguj się przez SSO.
2. W sekcji „Przed otwarciem” znajdź pozycję „Odczyt PITR, kopii dziennych i limitu Storage”, kliknij „Zmień stan”.
3. Ustaw „Gotowe” i w polu dowodu wpisz: PITR (tak/nie, horyzont), kopie dzienne (zakres dat), limit plików.

### Krok 4. Zasada na czas prób (bez narzędzia, do przestrzegania)

- Nagrania próbne powstają tylko za zgodą testerów.
- Po pomiarze są usuwane.
- Bez głosów osób spoza redakcji.

### Krok 5. Nagrania szkoleń z 07.10 i 27.10

Nie potwierdzono, czy te nagrania istnieją: sesje budujące nie mają dostępu do OneDrive organizatora. Dla nagrania z 07.10 pierwszy możliwy termin wygaśnięcia to około 06.12, kolejne to 05.01 i 04.02.

1. Poproś organizatora o sprawdzenie OneDrive (folder Recordings) pod kątem nagrań z 07.10 i 27.10.
2. Jeśli istnieją, skopiuj je na SharePoint z retencją co najmniej do 04.12 (najpóźniej do tego dnia wykonaj kopię).
3. Jeśli nie istnieją, zapisz to w dowodzie pozycji z kroku 3, żeby sprawa była zamknięta.
4. Nie wgrywaj tych plików do COMPASS. To tylko zabezpieczenie, a głosy uczestników nie mogą trafić do prób.

## B0.10 Porządki blokujące próby

- Zastosowanie migracji powyżej.
- Przed wymuszeniem pełnej CSP sprawdzić w raportach Report-Only, czy `media-src` i `frame-src` nie zgłaszają naruszeń na lekcji z wideo.

## B0.11 Próba generalna 1: kurs na prawdziwej treści, plik i spotkanie z gościem

### Warunki wstępne (sprawdź przed startem)

- Rollout `closed` albo `pilot` na kontach redakcji, tryb open zablokowany.
- W panelu Gotowość wszystkie przełączniki „Wył.”.
- Stoper gotowy; lista błędów prowadzona na bieżąco (czas i liczba operacji organizatora).
- Role: autor = konto TCM. Recenzent = właściciel. Uczestnik = osoba z redakcji spoza autorów i recenzentów tego kursu. Bez pomocy osoby, która to budowała.

### Etap A. Kurs (G07, G08)

1. Konto TCM zakłada nowy szkic `self_paced`: Edytor Akademii → nowe szkolenie. Stary szkic Cybersecurity (live, 0 lekcji, w kolejce od 05.10) zostaje nietknięty.
2. Treść: lekcje i 4-10 pytań dostarcza organizator do 13.11. Jeśli ich nie będzie, próba idzie na krótkim materiale redakcji i B0 się nie przesuwa.
3. Właściciel niczego w tym szkicu nie edytuje, bo trafiłby do współtwórców i stracił niezależność recenzenta.
4. TCM klika „Prześlij do akceptacji”. Właściciel sprawdza dzwonek i licznik przy „Akceptacja szkoleń”.
5. TCM klika „Wycofaj zgłoszenie”, poprawia, zgłasza ponownie. Właściciel widzi oba sygnały.
6. Właściciel publikuje. TCM dostaje sygnał w dzwonku. Zapisz G07 ze zrzutem.
7. Uczestnik zapisuje się, przechodzi lekcje i test, pobiera poświadczenie PDF. Zapisz G08 ze zrzutem.

### Etap B. Plik wideo (G09)

1. Redakcja albo właściciel nagrywa MP4 około 1 GB o parametrach pliku Teams. Bez głosów innych osób.
2. TCM wgrywa plik do szkicu przez formularz materiałów.
3. Zapisz czas skanu ClamAV i parsera oraz zużycie pamięci na serwerze CAX21 (osoba techniczna, `docker stats`).
4. Odtwórz na telefonie (prawdziwy telefon, nie emulator). Zapisz G09 ze zrzutem.

### Etap C. Spotkanie Teams z gościem (G10), w pierwszym tygodniu

1. Właściciel zakłada 15-minutowe spotkanie Teams i zaprasza własną prywatną skrzynkę jako gościa. Żadnych innych osób z zewnątrz.
2. Gość dołącza z prywatnego adresu.
3. Po spotkaniu pobierz raport frekwencji Teams.
4. Odczytaj, czy raport podaje adres e-mail gościa. Zapisz odpowiedź tak/nie w polu „Uwagi” scenariusza G10, razem ze zrzutem. Tego odczytu potrzebuje projekt B3.6.

### Zakończenie

Rozpisz listę błędów z próby. Blokujące naprawia się przed zamknięciem B0, poprawka z próby wygrywa z kolejnym epikiem.

## B1.1 Dostęp biura i pilot dla każdej roli

- Zastosowanie migracji. Do tego czasu role biurowe nie wchodzą do Akademii, bo `rollout_allows_user` ich nie przepuszcza. Kod jest na to przygotowany.
- Ekran konta biurowego z listy pilota przez SSO (scenariusze G11-G18), po migracji. Sesja budująca nie loguje się do produkcji.

## B1.2 Model konta nauki i konta próbne

- Zastosowanie migracji.
- Konto próbne zakłada właściciel SQL-em, bo klucz serwisowy nie nada `source='proba'`:
  `INSERT INTO public.academy_learner_accounts(email, full_name, source) VALUES ('<skrzynka z ACADEMY_MAIL_TEST_RECIPIENTS>', '<imię>', 'proba');`
- Przed pierwszym takim kontem: B1.5 na produkcji i wynik B1.10 (sekcja B1.10 w `docs/academy/czeka-na-wlasciciela.md`).

## B1.3 Przepustka za przełącznikiem

- `ACADEMY_PASS_SECRET` w vaulcie Coolify, co najmniej 32 bajty, inny niż `CRON_SECRET`. Bez niego przepustka odpowiada 404 także dla kont próbnych. Sekret wpisuje właściciel, nie trafia do repo ani do czatu.
- `ACADEMY_PASS_ENABLED` zostaje wyłączony do bramki startu. Przy wyłączonym działają tylko konta próbne ze skrzynek z `ACADEMY_MAIL_TEST_RECIPIENTS`.
- Zanim wróci publiczna rejestracja: `Confirm email` włączone w panelu Supabase. Adres z listy kont nauki i tak dostaje znacznik `academy_only` z bazy, ale potwierdzenie dowodzi posiadania skrzynki.
- Pełne wejście na skrzynkach właściciela: sekcja B1.9 w `docs/academy/czeka-na-wlasciciela.md`.
- Konto próbne musi być na liście pilota w `academy_set_rollout`, inaczej Akademia pokaże „niedostępna”.

## B1.4 Izolacja konta nauki w aplikacji

Nic w tym zadaniu. Sprawdzenie na żywych kontach opisują sekcja B1.9 i sekcja B1.10.

Wymóg dla B1.3: przepustka zapisuje znacznik jako wartość logiczną `true`. Napis `"true"` nie włączy izolacji, bo `isAcademyOnlyUser` porównuje ściśle.

## B1.5 Odcięcie od kartoteki i RODO

- Zastosowanie migracji. Bez niej konto nauki miałoby status `active` i trafiałoby na listy ludzi, dlatego nie wolno założyć pierwszego konta przed tą migracją.
- Zatarcie obejmuje konto nauki po `user_id` oraz kopie na liście edycji po `user_id` i `contractor_id`. Wiersz konta bez przypisanego logowania i wiersz listy edycji bez powiązania trzeba znaleźć ręcznie po adresie, bo ten kod nie zgaduje tożsamości.

## B1.6 Automat tożsamości na sucho

- Zadanie w Coolify dla `/api/cron/academy-learners-sync`, raz dziennie, z nazwą kontenera. Dodać pojedynczo, bez `action=cron-enable`, bo ta akcja włącza wszystkie zadania.
- `ACADEMY_LEARNER_SYNC_ENABLED` zostaje wyłączony. Adres w `nexus_contract_snapshot` to adres kandydata z ATS o niepotwierdzonej aktualności, nie adres z umowy.
- Warunek włączenia: dopisanie adresu z umowy do eksportu NEXUSA (`backend/app/api/integrations_compass.py`), osobny PR w repo NEXUS, testowany na danych syntetycznych i wdrożony po wpisie do rejestru czynności. Tego PR-a nie ma.
- Decyzja przy włączeniu: co robić po `disappeared_at`. Dziś automat tylko oznacza konto i liczy wygaszenia, dostępu nie odcina.

## B1.7 Ponowne wejście

- `NEXT_PUBLIC_APP_URL` musi wskazywać adres produkcji, bo z niego powstaje link w wiadomości.
- Decyzja przed bramką startu: po włączeniu `ACADEMY_PASS_ENABLED` wiadomość do zwykłego konta zostaje w kolejce `held` i wygasa po 15 minutach, bo bramka B0.2 wymaga zatwierdzenia paczki przez człowieka. Do działania dla uczestników link ponownego wejścia potrzebuje osobnej reguły zatwierdzania dla tego rodzaju wiadomości.
- Limity są w pamięci procesu i zerują się przy restarcie. Przy więcej niż jednym kontenerze trzeba je przenieść do bazy.

## B1.8 Ekran klauzuli i regulaminu jako miejsce na treść

- Opinia prawnika o tekście w `COMPASS/lib/academy/learner-info.ts`. Ostateczny tekst jest warunkiem bramki startu. Po zmianie treści: nowy `CURRENT_LEARNER_INFO_VERSION` i `LEARNER_INFO_IS_DRAFT = false`.
- Sprawdzić, czy okres przechowywania i podstawa prawna są właściwe. To treść robocza z makiety M02, nie ustalenie prawne.
- `/terms` to dziś regulamin aplikacji. Osobny regulamin Akademii, jeśli będzie potrzebny, wymaga treści od prawnika.

## B1.9 Sprawdzenie etapu na skrzynkach właściciela

1. Konto na prywatnym Gmailu i konto na Onecie, oba z listy `ACADEMY_MAIL_TEST_RECIPIENTS`, z `source='proba'` w `academy_learner_accounts` (nadanie wyłącznie SQL-em).
2. Pełne wejście przez przepustkę: klauzula, założenie konta, Akademia. Na telefonie, nie w emulatorze.
3. Ponowne wejście przez formularz adresu i jednorazowy link 15 minut.
4. Próby spoza Akademii na koncie nauki:
   - wejście na `/home`, `/internal`, `/profile`, `/documents` ma wrócić na `/learning`;
   - `POST` akcji spoza Akademii z dozwolonej strony ma dać odmowę „Ta funkcja jest niedostępna na koncie Akademii.”;
   - `GET /api/admin/email-preview` i `GET /api/admin/snapshot` mają odpowiedzieć odmową.
5. Konto biurowe z listy pilota (B1.1): wejście przez SSO, link Akademia w menu, landing Akademii po przeniesieniu modułów HR.
6. Tester z redakcji przechodzi punkty 2 i 3 bez pomocy budującego.

Warunek zaliczenia: 0 wiadomości poza listą skrzynek właściciela, rollout `closed` albo `pilot`. Od tego etapu automat E2E loguje się kontami próbnymi.

## B1.10 Izolacja konta nauki w warstwie danych

Test JWT konta `academy_only` po pełnym katalogu, technika: `BEGIN`, `SET LOCAL request.jwt.claims`, `SET LOCAL ROLE authenticated`, zapytanie, `ROLLBACK`.

1. Zakres: tabele i widoki z `information_schema`, funkcje wykonywalne przez `authenticated` z `pg_proc`, w tym `SECURITY DEFINER` spoza Akademii, oraz wszystkie `storage.buckets`.
2. Wynik: zatwierdzona lista dozwolonych obiektów w `supabase/tests`. Test pada na każdej nowej pozycji spoza listy.
3. Obiekty spoza listy dostają politykę `RESTRICTIVE` lub odebranie `EXECUTE` dla `academy_only`, jako osobne pliki migracji.
4. Sprawdzić funkcje liczące uprawnienia po stronie bazy, np. `academy_can_manage_course` i `academy_can_preview_version`. Dziś konto z grantem `academy_user_capabilities.can_train` albo rolą w `profiles` jest tam trenerem, niezależnie od `academy_only`.
5. Zewnętrzny test penetracyjny ma to potwierdzać, a nie znaleźć jako pierwszy.

Kolejność: po B1.2 i po B1.4, przed pierwszym kontem próbnym z B1.9.

## B2.1 Pula pytań w modelu kursu

- [ ] **B2.12 Próba generalna 2 (test na prawdziwej treści).** TCM buduje pulę około 30 pytań do Cybersecurity lub DORA, właściciel recenzuje, konta próbne i osoby z redakcji spoza autorów zdają losowane zestawy na telefonie, jedno pytanie zostaje unieważnione. Tester spoza budowy opisuje, co było niejasne. Wymaga ludzi i prawdziwej treści, więc zostaje do wykonania po zastosowaniu migracji toru B2.

## B2.4, B2.5, B2.8 Ekrany uczestnika

- [ ] Scenariusz G21 na prawdziwym telefonie: autozapis po utracie sieci, czytelny blok kodu, licznik czasu z serwera. Lokalnie sprawdzone na szerokości telefonu bez backendu.

## B2.6, B2.7, B2.9, B2.10 Ekrany redakcji i dokumenty

- [ ] Scenariusze ręczne przez SSO: G19 (pula 30 pytań, próg, losowanie) i G24 (test poza kursem: publikacja, katalog, zdanie, poświadczenie).
- [ ] Obejrzenie wygenerowanego PDF zaświadczenia udziału i certyfikatu z dopiskiem o braku związku z certyfikacją producenta.

## B2.11 Ekran szkiców pytań z AI

- [ ] Scenariusz G28 po decyzji o włączeniu `ACADEMY_AI_DRAFTS_ENABLED` i przekazaniu treści do modelu.

## B2.11 Szkice pytań z AI

- Decyzja o włączeniu `ACADEMY_AI_DRAFTS_ENABLED` i przekazaniu treści do modelu (scenariusz G28).

## B3.3 Zaproszenia i przypomnienia

- Osobisty link w treści: `personalLink` przy wysyłce właściwej dojdzie z B1.3. Wysyłka testowa używa linku do strony edycji.
- G31: wysyłka testowa na skrzynki właściciela u 5 dostawców wymaga `ACADEMY_MAIL_TEST_RECIPIENTS` w vault.
- Zatwierdzanie paczek pozostaje nieaktywne do decyzji o `ACADEMY_MAIL_ENABLED`.

## B3.4 Nadawca per wiadomość

- Warunek bramki startu: skrzynka Akademii w Exchange i wpis w RBAC for Applications, a potem `ACADEMY_MAIL_FROM` i `ACADEMY_MAIL_SENDER_ENABLED=true` w vault. Do tego czasu wiadomości idą z `MAIL_FROM`.

## B3.5 Powiązanie konta z listą i późna aktywacja

- G33 na produkcji: konto próbne założone po imporcie frekwencji, przez wejście z przepustki.

## B3.6 Import frekwencji odporny na wyjątki

- Odczyt z próby B0.11: czy raport zwykłego spotkania Teams podaje adres gościa. Jeśli nie, domyślnym torem jest spotkanie z rejestracją w Teams; aplikacja już to podpowiada, gdy żaden wiersz nie ma adresu.
- G32: wczytanie prawdziwego raportu spotkania z gościem, przez SSO.

## B3.8 Ekran zamknięcia edycji

- Krok „Wiadomości po szkoleniu”: podgląd i zatwierdzenie paczki są nieaktywne do czasu B3.3 i decyzji o przełączniku wysyłki.
- G34: pomiar liczby operacji organizatora na pliku około 100 wierszy (B3.14).

## B3.11 Tor Teams z konta organizatora

- Decyzja o włączeniu toru: `ACADEMY_TEAMS_ENABLED` zostaje wyłączone, a żadne uprawnienie Graph nie zostało nadane. Spis ról: `/admin/learning/integrations`.
- Część na żywo G40 po decyzji właściciela. Gdy panel Gotowość (B0.5) wejdzie na main, spis można tam przenieść.

## B3.12 Adresaci edycji

- G30: przeklikanie przez SSO na produkcji.
- Link osobisty w zaproszeniu powstanie dopiero z B1.3; do tego czasu wiersze held czekają w kolejce.

## B3.13 Sprawdzenie ścieżki prowadzącego i pakietu

- Jeden pełny przebieg przez SSO, bo `academy_handovers` ma 0 wierszy i ten kod nigdy nie zadziałał: prowadzący z `can_train` wgrywa pakiet, TCM uzupełnia, niezależna osoba przyjmuje lub zwraca.
- W tym samym przebiegu odmowa: moduł bez podpisanych praw nie przechodzi. Dowód do G39.
- Poprawki z tego przebiegu mieszczą się w rezerwie etapu.

## B3.14 Próba generalna 3: edycja na sucho

- Prawdziwe 15-minutowe spotkanie Teams z gościem na prywatnym adresie właściciela, nagrywane za zgodą testerów i usuwane po pomiarze.
- Organizator przechodzi cały cykl, a redakcja i konta próbne są uczestnikami. Dowód do G32 i G36.
- Pomiar liczby operacji organizatora na pliku około 100 syntetycznych wierszy z wyjątkami, cel poniżej 30. Dowód do G34.
- Ekran zamknięcia edycji pokazuje licznik operacji z dziennika audytu, ale nie zbiorczego pomijania wyjątków. Jeśli pomiar przekroczy cel, to pierwsza poprawka do rezerwy.

## B4.3 Postęp co do sekundy i wznawianie

- Po zastosowaniu migracji dopisać `academy_video_progress` do źródeł eksportu RODO w `COMPASS/lib/gdpr/subject-data.ts`. Tabela zawiera dane o oglądaniu per osoba, a dopisanie przed migracją wywróciłoby eksport.
- Scenariusz G41 (wznowienie na innym urządzeniu, 90% zalicza moduł, zerwanie sieci): ręcznie, przez SSO, ze zrzutem.

## B4.4 Rozdziały i napisy

- Scenariusz G42 (rozdziały w edytorze, przeskok kliknięciem, napisy VTT): ręcznie, przez SSO, ze zrzutem.

## B4.5 Długie pliki i limit autora

- Podniesienie limitu 1 GiB na plik: najpierw odczyt limitu globalnego Storage w panelu Supabase oraz pomiar skanu ClamAV na pliku powyżej 1 GiB. Do tego czasu limit zostaje, a długie nagrania dzieli normalizator (`--part-minutes`).
- Scenariusz G43 (kilka części jako jedna sesja, postęp po całości): ręcznie, przez SSO, ze zrzutem. Scenariusz G44 przechodzi automatem w `scripts/test-academy-author-storage-limit-db.mjs`.
- Zmiana limitu autora: `UPDATE public.academy_storage_settings SET author_limit_bytes = <bajty>;` wykonuje administrator bazy.

## B4.6 Nagranie edycji z terminem dostępności

- Domyślny czas dostępności nagrania i decyzja o usuwaniu po terminie. Dziś termin ustawia organizator przy materiale, a plik znika fizycznie po 30 dniach od terminu tylko przy `ACADEMY_MATERIAL_CLEANUP_ENABLED=true`, które na produkcji jest wyłączone.
- Scenariusz G45 przechodzi automatem w `scripts/test-academy-run-material-availability-db.mjs`.

## B4.7 Biblioteka IT (M10)

- Treść biblioteki i tematy kursów (B4.10): wsad próbny dwóch kursów z prawdziwej treści, na przykład Cybersecurity i DORA, moduły 5-30 minut plus materiały. To treść organizatora.
- Scenariusz G47 (wyszukiwarka, temat, format, konto biura i konto nauki widzą to samo): ręcznie, przez SSO, ze zrzutem, po B4.10.

## B4.8 Kurs dla nieobecnych jednym działaniem (M09)

- Scenariusz G46: ręcznie, przez SSO, ze zrzutem, po dodaniu modułów od prowadzącego.
- Raport programu: `academy_programme_completions()` liczy osobę raz, ale nie jest jeszcze podpięta do ekranu raportów.

## B4.9 Import nagrania z Teams za przełącznikiem

- Decyzja o uprawnieniu `OnlineMeetingRecording.Read.All` i polityce dostępu aplikacji w Exchange (RAOP). Bez niej `ACADEMY_GRAPH_RECORDINGS_ENABLED` zostaje wyłączone, a część na żywo scenariusza G48 czeka.
- Po decyzji: migracja dopisująca rodzaj zadania `import_recording` do `academy_integration_jobs` i zapis plików przez `RecordingImportStore` (skan, kwarantanna, materiał edycji). Tego nie budujemy przed decyzją, bo wymaga prawdziwej odpowiedzi Graph do zweryfikowania formatu.
- B4.10 Wsad próbny biblioteki: treść organizatora (Cybersecurity, DORA) z `is_rehearsal=false`.
- B4.11 Próba generalna 4: tester ogląda moduły na telefonie i komputerze, przerywa, wraca, zdaje test; drugi tester szuka materiału w bibliotece bez wskazówek; pomiar egress w panelu Supabase.
- Prawdziwy plik przez normalizator, skan i odtworzenie na telefonie: wymaga pliku bez głosów osób spoza redakcji.

## B5.1 Ważność i recertyfikacja

- Decyzja z planu (12.02.2027): domyślny okres ważności. Rekomendacja: 12 miesięcy dla DORA i cyberbezpieczeństwa, bez terminu dla pozostałych. Ustawia się w `/admin/learning/certificates`, dla każdego programu osobno. Certyfikaty wystawione wcześniej nie zmieniają daty.
- Harmonogram `cron-academy-certificate-expiry.yml` startuje po merge'u i tworzy wyłącznie wiersze `held`. Sprawdzenie: para `ACADEMY_CERTIFICATE_EXPIRY_RUN` w `audit_logs`.
- G50: pełny przebieg po zastosowaniu migracji.

## B5.2 Weryfikacja dokumentu

- `ACADEMY_PUBLIC_VERIFY_ENABLED` zostaje wyłączone do bramki startu. Włączenie tylko w vault.
- G49: test na produkcji na dokumencie konta próbnego z adresem z listy skrzynek właściciela.

## B5.3 Raport edycji (M11)

- G52: ręczny odbiór raportu na prawdziwej edycji, przez SSO, z danymi oznaczonymi jako próba.

## B5.4 Raport menedżerski i raport kompetencji (M12)

- Decyzja z planu (12.02.2027): zakres raportu kompetencji i grupowanie po kliencie. Filtr „Klient” jest wyłączony do opinii prawnika.
- Ocena ryzyka przekwalifikowania B2B z listy bramki startu: raport kompetencji obejmuje konsultantów, widzi go wyłącznie administrator. Raport menedżerski obejmuje tylko biuro.
- G51: przebieg z prawdziwym kontem menedżera po zastosowaniu migracji.

## B5.5 Kokpit organizatora (V13)

- G53: przegląd pełnej osi jednej edycji po zastosowaniu migracji z B0, B2 i B3.

## B5.6 Powtórki (V15)

- `ACADEMY_RETRIEVAL_ENABLED` zostaje wyłączone. Włączenie tylko w vault; do bramki startu działa wyłącznie na kontach objętych rolloutem.
- Podstawa wysyłki powtórek na prywatne skrzynki jest na liście bramki startu (prawnik).
- G54: przebieg po zastosowaniu migracji, na atrapie Graph.

## B5.7 Porządki przed otwarciem

Zrobione w kodzie: dzienny harmonogram `audit-log-retention` w `.github/workflows/cron-audit-log-retention.yml`. Reszta wymaga zmiany na serwerze albo w vault, więc jest tutaj.

- **Retencja surowych raportów obecności.** `ACADEMY_ATTENDANCE_RETENTION_DAYS` nie jest ustawione (`retentionConfigured:false`), więc `academy-sync` niczego nie usuwa i panel pokazuje ostrzeżenie. Wartość (30–3650 dni) to decyzja właściciela i IOD, zmieniana wyłącznie w vault. Pozycja jest na liście bramki startu.
- **Retencja nagrań edycji.** Zależy od B4.6 (termin `available_until`) i od decyzji „Kto widzi nagranie edycji i jak długo” (rekomendacja: najdłużej 90 dni). Do czasu B4.6 nie ma czego konfigurować.
- **Rzadsze tykanie workerów.** Timery `compass-academy-materials.timer` i `compass-academy-sync.timer` są jednostkami systemd na serwerze i tykają co minutę, co daje około 9,8 tys. przebiegów tygodniowo i dwa wpisy `*_RUN` na przebieg. Definicji jednostek nie ma w repo, a produkcja jest dla sesji budujących tylko do odczytu.
  - Pary start/done zostają, bo na nich stoi diagnoza z CLAUDE.md.
  - Zmiana interwału wymaga jednocześnie: progów w `lib/academy/operations-health.ts` (ostrzeżenie po 5 min, alarm po 15 min) i oczekiwanej częstotliwości w `ops/academy/coolify-readiness.mjs`. Przy interwale 5 min obecny próg ostrzeżenia migałby przy każdym przebiegu.
  - Rekomendacja: nie zmieniać przed otwarciem. Audyt z listopada 2026 ocenił `audit_logs` (116 MB) jako niezapchane, od maja 2027 tabelę przycina retencja, a minutowy interwał skraca czekanie na skan pliku w próbach.
- **Sprawdzenie harmonogramu po merge'u.** W `audit_logs` powinna pojawić się para `AUDIT_LOG_RETENTION_RUN` po pierwszym biegu o 03:41 UTC, albo po ręcznym `workflow_dispatch`. Workflow wymaga `vars.APP_URL` i `secrets.CRON_SECRET`, tych samych co `cron-timesheet-reminder.yml`.

## B5.8 Ćwiczenie odtworzenia bazy i plików

Zadanie jest procesem i nie da się go wykonać z sesji budującej, bo wymaga kopii produkcji, a sesje mają dostęp tylko do odczytu.

- Odtworzyć bazę i pliki do odizolowanego środowiska według `docs/academy/restore-drill.md` i narzędzi w `ops/academy/restore`. Bez pisania nowych narzędzi.
- Zapisać RPO i RTO w panelu Gotowość (G55).
- Na tej kopii wykonać skrypt z B5.9 (sekcja B5.9 w `docs/academy/czeka-na-wlasciciela.md`) i potwierdzić, że treść właściwa jest nienaruszona.
- Warunek wstępny: odczyty PITR i kopii dziennych z B0.9.

## B5.9 Skrypt usuwania danych prób

- G55: wykonanie skryptu na odtworzonej kopii z ćwiczenia B5.8, z zapisem liczby usuniętych kont i wygaszonych wiadomości.
- Decyzja na bramce startu o wykonaniu na produkcji.

## B5.10 Przegląd bezpieczeństwa całości

Przegląd idzie po całym zakresie, więc ma sens dopiero, gdy reszta torów jest na `main`. Na razie nie jest.

- Po scaleniu B0–B5: agent security-reviewer po całym zakresie, ponowny test katalogu z B1.10 po nowych tabelach i RPC, test czytający źródło guardów.
- Przygotowanie zakresu dla zewnętrznego testu penetracyjnego z listy bramki startu. Zlecenie testu należy do właściciela.

## B5.11 Próba generalna końcowa

Próba rusza po wszystkich pozostałych zadaniach B0–B5 i po zastosowaniu ich migracji. Wymaga testerów, którzy nie budowali, oraz logowania przez SSO, więc sesja budująca jej nie wykona.

- Cały cykl docelowy na sucho, na prawdziwej treści, bez pomocy budującego (G56). Wiadomości oglądane w kolejce, nic nie wychodzi.
- Pełny bieg wszystkich scenariuszy G01–G57 (`e2e/academy-acceptance`, panel Gotowość).
- Kontrola końcowa (G57): wszystkie przełączniki wyłączone, rollout `closed` lub `pilot`, tryb `open` odrzucany przez bazę, 0 wiadomości poza listą skrzynek właściciela, 0 nowych uprawnień Graph.

## B5.12 Pakiet startowy

Zadanie nie wystartowało: dokumenty mają opisywać stan końcowy, a na `main` nie ma jeszcze przełączników (B0.4), kolejki (B0.2) ani panelu Gotowość (B0.5).

Do przygotowania po B0.4, B0.2, B0.5 i B5.8, bez podejmowania decyzji za właściciela:

- kolejność włączania przełączników,
- plan wycofania jednym krokiem,
- instrukcje dla organizatora,
- lista warunków bramki startu w `academy_launch_conditions`.

Decyzja o otwarciu należy do właściciela.

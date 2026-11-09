# Akademia COMPASS: plan budowy (listopad 2026 – marzec 2027)

Strona z audytem i makietami: https://claude.ai/artifact/MBMpkD62zST4ge7rUmqszt (dostęp właściciela).

## Decyzje właściciela, 2026-11-09

- Najpierw cały gotowy system, potem używanie, testy i zapraszanie.
- Nic nie wychodzi na zewnątrz: zero maili, linków i zaproszeń do ludzi. Funkcje wysyłki stoją za wyłączonymi przełącznikami, produkcja zostaje w rollout `closed` albo `pilot` na kontach redakcji i próbnych.
- Certyfikat = obecność + zdany test. Sama obecność daje zaświadczenie udziału.
- Budowa rusza bez dodatkowej akceptacji kolejnych zadań. Otwarcie platformy to osobna, przyszła decyzja właściciela.
- Migracje wyłącznie jako pliki; aplikuje właściciel. Nowych uprawnień Graph nie nadajemy bez jego decyzji.

## Teza
Budujemy gotowy system, który niczego nie wysyła. Akademia ma być kompletna: kursy, testy także poza kursem, szkolenia na żywo w Teams z rejestracją i zaproszeniami, nagrania z postępem i rozdziałami, materiały, biblioteka IT, certyfikaty, raporty, dostęp konsultantów i biura. Produkcja zostaje w rollout closed lub pilot na kontach redakcji i testowych. Otwarcie to osobna, przyszła decyzja właściciela.

Kolejność wyznaczają zależności, a nie kalendarz szkoleń. Najpierw tory: bramka wyjścia, przełączniki, blokada otwarcia i mierzalna gotowość (B0), bo każdy merge jedzie na produkcję i bez tego następny etap mógłby coś wysłać. Potem dwa niezależne bloki w jednym oknie: dostęp (B1) i testy (B2). Na nich stoją szkolenia na żywo (B3) oraz wideo i biblioteka (B4), znów w jednym oknie. Na końcu warstwa, która potrzebuje danych ze wszystkich poprzednich: certyfikaty, raporty, kokpit, powtórki i końcowa próba generalna (B5).

Trzy zasady techniczne prowadzą przez cały plan.
1) Wszystko, co mogłoby wyjść, przechodzi przez jedną bramkę. Wiadomość powstaje jako wiersz w kolejce ze statusem wstrzymana. Zmiana przełącznika nigdy nie opróżnia kolejki, wiersz po terminie zdarzenia wygasa, a przyszła wysyłka wymaga jawnego zatwierdzenia paczki przez człowieka. Gdy zapis do kolejki się nie uda, wiadomość nie wychodzi.
2) Przełączniki żyją w vault i są domyślnie wyłączone, a w aplikacji można je tylko odczytać. Tryb open jest zablokowany w bazie i zniknął z panelu, a lista pilota ma limit. Zdjęcie blokady to osobna migracja aplikowana przez właściciela na bramce startu, więc jedno kliknięcie niczego nie wypuści.
3) Rozszerzamy istniejący model, bez drugiego systemu obok. Test poza kursem to kurs bez lekcji, a pula pytań to rozszerzenie course_quiz_*. Przy jednej wersji próbnej ta migracja kosztuje najmniej teraz.

Certyfikat to obecność plus zdany test, a sama obecność daje zaświadczenie udziału, które jest osobnym dokumentem poza historią ukończeń. W kursie samodzielnym rolę obecności pełni ukończenie modułów.

Skala wyceny: S 0,5 dnia, M 1 dzień, L 2 dni, XL 3 dni pracy osoby technicznej z agentami. Razem 72,5 dnia i 14,5 dnia rezerwy na poprawki z prób, czyli 87 dni roboczych i koniec 16.03.2027 przy założeniu, że Akademia ma pierwszeństwo przed NEXUSEM. Bez rezerwy wyszłoby 24.02.2027, ale wtedy plan nie ma miejsca na to, po co robimy próby. Równoległość skraca czekanie, a nie pracę osoby technicznej, dlatego w jednym oknie sumują się dni obu etapów.

## Główna miara
Odsetek scenariuszy akceptacyjnych gotowości (G01-G57) przechodzących w trybie zamkniętym, z wynikiem, SHA wdrożenia i dowodem. Dziś 0 z 57, bo żaden nie został wykonany. Cel: 100% do 16.03.2027, poza scenariuszami świadomie oznaczonymi jako czekające na decyzję właściciela (G28, G38 oraz części na żywo G40 i G48).

Rodzaje scenariuszy: 26 automatycznych i 31 ręcznych ze zrzutem. Scenariusze ręczne wykonują ludzie przez SSO, bo konto admina ani TCM nie loguje się hasłem i nie trafia do sekretów. Automat startuje w B1, od kont próbnych. Scenariusze z atrapą Graph (G01, G02, G40, G48) biegną z kodem tego samego SHA poza produkcją, bo na produkcji przełącznika wysyłki nie wolno ruszać. Pozostałe biegną na produkcji.

Warunek liczony razem z nim: 0 wiadomości Akademii na adres spoza listy skrzynek właściciela, 0 nowych uprawnień Graph bez decyzji właściciela i rollout niezmiennie closed lub pilot, z trybem open zablokowanym w bazie. Odczytuje go osoba techniczna przy każdym biegu i raz w tygodniu z kolejki oraz logu wysyłki, a licznik widzi właściciel w panelu Gotowość. Jedno naruszenie cofa wynik etapu do zera, wymaga wyłączenia kanału i wpisu z przyczyną w panelu.

Reguła ważności wyniku: w readiness-scenarios.ts każdy scenariusz ma listę ścieżek plików. Wynik automatyczny traci ważność przy zmianie którejś z nich po jego SHA. Wynik ręczny traci ważność przy zmianie wskazanych plików albo po 30 dniach. Dzięki temu wynik nie zestarzeje się po cichu, a kilka merge'ów dziennie nie wymusza powtarzania wszystkiego.

## Ryzyko budowy bez użytkowników
Ryzyko jest konkretne: audyt pokazał, że właśnie tak powstało 125 RPC bez ani jednego uczestnika. Budowa bez użytkowników nagradza kompletność, a nie użyteczność, więc plan ma sześć mechanizmów, żaden nie wymaga wyjścia na zewnątrz.

1. Pięć prób generalnych na prawdziwej treści, po jednej na końcu B0, B2, B3 i B4 oraz końcowa w B5. Materiał to rzeczywiste szkolenia firmy (Cybersecurity, DORA), a nie lorem ipsum.
2. Testerzy to ludzie, którzy nie budowali: redakcja (organizator i pozostali TCM, zawsze osoby spoza autorów i recenzentów danego kursu), od B1 konto biurowe i konta próbne. Dwa konta consultant wchodzą do prób dopiero, gdy właściciel wskaże do nich człowieka, bo dziś nikt z nich nie korzysta. Skrzynki prywatne wyłącznie właściciela (Gmail, WP, Onet, O2, Interia).
3. Scenariusz zalicza tester bez pomocy budującego. Liczymy czas i liczbę operacji organizatora; audyt szacuje dziś około 450 na edycję, w większości koszt na osobę, dlatego mierzymy na pliku około 100 wierszy, a nie na garstce testerów.
4. Żadna funkcja bez scenariusza. Epik bez scenariusza akceptacyjnego nie wchodzi do etapu.
5. Rezerwa 20% każdego etapu na poprawki z prób jest wliczona w daty. Poprawka z próby wygrywa z kolejnym epikiem.
6. Prawdziwe obiekty zewnętrzne tam, gdzie się da: 15-minutowe spotkanie Teams z gościem na prywatnym adresie właściciela już w pierwszym tygodniu, plik MP4 od pierwszego etapu (bez głosów osób spoza redakcji), telefon zamiast emulatora.

Czego próby nie pokażą: czy konsultanci będą chcieli z tego korzystać, doręczalności przy setkach adresów, błędów adresów z NEXUSA i zachowania przy obciążeniu. To trafia na listę bramki startu, a pierwsze otwarcie powinno być małym pilotem.

## Model danych
Zasada: rozszerzamy istniejący model Akademii, bez drugiego systemu obok. Migracje wyłącznie jako pliki z samosprawdzeniem i skryptem cofnięcia albo notką o PITR, aplikuje właściciel w oknie dziennym, nigdy supabase db push. Razem 32 pliki plus te z B0.1.

B0: academy_outbox (kind, recipient, subject, html, run_id, batch_id, status held|approved|sent_test|sent|expired|failed, expires_at, dedupe_key unique, created_at), bez tokenów w wierszu; RLS odczyt dla redakcji, zapis wyłącznie service role. Ustawienia rollout z CHECK bez trybu open i RAISE w academy_set_rollout, lista pilota do 20. academy_readiness_results (scenario_id, kind automat|ręczny, sha, status, evidence_path, run_at, actor, valid_until). academy_launch_conditions (item, owner, status, evidence, decided_at). Prywatny bucket academy-readiness-evidence. courses.is_rehearsal tylko dla kursu-atrapy. Data startu raportów w ustawieniach.

B1: academy_learner_accounts (email unique, full_name, source, source_ref, user_id, info_accepted_at, first_login_at, access_until, disappeared_at, ended_at); source='proba' nadawane wyłącznie SQL-em, dla adresów z listy skrzynek właściciela w vault, i wyłącza konto z raportów. profiles.academy_only dopisane do pinu kolumn. Automat tożsamości czyta nexus_contract_snapshot i zapisuje same liczby, po stronie NEXUSA dochodzi adres z umowy po rejestrze czynności. contractors nie jest używane.

B2: course_quiz_questions.topic_tag i voided_at, course_quiz_options.explanation, konfiguracja puli w course_versions.completion_rules (draw_count, time_limit, próg), course_quiz_attempt_items (zamrożony zestaw i kolejność podejścia), course_quiz_attempts.kind (final|pre), deadline. academy_question_drafts za przełącznikiem. courses.delivery_mode rozszerzone o assessment: test poza kursem to kurs bez lekcji, z tą samą recenzją, zapisem i dokumentem. academy_participation_documents (enrollment_id, user_id, course_id, run_id, version_id, issued_at, snapshot): zaświadczenie udziału poza course_completions, bez nagrody. Certyfikat zostaje jedynym wierszem w course_completions.

B3: academy_private.bind_learner_to_run łączy konto z academy_webinar_roster, potwierdza zapis i przenosi frekwencję do session_attendance. academy_webinar_import_batches z sekcją wyjątków, lista adresów wykluczonych na edycji. academy_run_audience (run_id, filtr, liczba, chosen_by, chosen_at).

B4: academy_video_progress (user_id, asset_id, position_seconds, watched_ranges, updated_at). academy_video_chapters. Materiał edycji z available_until, egzekwowanym w RLS. Limit materiałów autora konfigurowany w bazie, z wyjątkiem dla redakcji. academy_programmes oraz courses.programme_id i courses.topic: program łączy szkolenie na żywo i kurs z modułów, raport liczy go raz.

B5: valid_until w snapshot certyfikatu, numer cyklu zapisu samodzielnego zamiast dzisiejszego unikalnego indeksu, public_code i share_enabled. academy_retrieval_schedule. Skrypt usuwania danych prób jako jednorazowa migracja, gotowa i nieuruchomiona.

Dwa rodzaje wideo. Moduł prowadzącego: lekcja kursu, trwały, po podpisaniu praw, w bibliotece. Nagranie edycji: materiał z run_id, dostęp tylko dla potwierdzonych, z terminem, nigdy lekcją i nigdy wejściem dla AI.

Dwie listy, których nie wolno mylić. Lista kont nauki to tabela academy_learner_accounts. Lista skrzynek właściciela to ACADEMY_MAIL_TEST_RECIPIENTS w vault, jedyni odbiorcy poczty do bramki startu.

Bez zmian: course_runs, course_sessions, course_run_registrations, session_attendance, course_enrollments, course_completions, academy_webinar_roster.

## B0: Etap B0: nic nie wychodzi, gotowość jest mierzalna

09.11.2026 - 27.11.2026 · 11,5 dnia pracy + 2,5 dnia rezerwy, razem 14 dni roboczych

**Cel:** Żaden kolejny merge nie może niczego wysłać ani otworzyć Akademii, a gotowość mierzy się scenariuszami.

**Wynik:** Działa bramka wyjścia, blokada trybu open, panel Gotowość i szkielet E2E. Redakcja raz przeszła kurs próbny od szkicu do poświadczenia, plik wideo przeszedł skan i parser, a wiadomo już, czy raport Teams podaje adres gościa.

**Równolegle:** B0.1 idzie w osobnej sesji. B0.9 przed pierwszą migracją. Równolegle dwie grupy sesji: bramka i przełączniki (B0.2-B0.4, B0.12) oraz panel i E2E (B0.5-B0.7). Każdy punkt to osobny PR. B0.2, B0.3 i B0.8 muszą być na produkcji przed pierwszą publikacją kursu w B0.11.

### B0.1 Zadanie bezpieczeństwa z Etapu 0 (w toku) [M, proces]

Właściciel wyłącza rejestrację w panelu, osobna sesja robi migracje: kontrola zakładania kont, profile według roli, przegląd. Tu bez projektowania od nowa. Wynik przeglądu idzie do IOD z notatką o ocenie, dla dokumentacji z art. 33 ust. 5 RODO, do 13.11. B1 potrzebuje od tej pracy jednego: kontrola zakładania kont ma znać listę kont nauki, więc interfejs uzgadniamy z tamtą sesją.

Kotwice: `osobna sesja; COMPASS/supabase/migrations (pliki, aplikuje właściciel); supabase/tests`

### B0.2 Bramka wyjścia i kolejka wstrzymanych wiadomości [L, migracja]

Jedyna droga poczty Akademii. Przy ACADEMY_MAIL_ENABLED różnym od true wiadomość trafia do kolejki jako held i nie dotyka Graph; na adresy z listy skrzynek właściciela (ACADEMY_MAIL_TEST_RECIPIENTS) można wysłać testowo. Twarde reguły: zmiana przełącznika nigdy nie opróżnia kolejki; wiersz held przechodzi w expired po terminie zdarzenia; wysyłka wymaga jawnego zatwierdzenia paczki przez człowieka, a przełącznik jest tylko warunkiem koniecznym; błąd zapisu do kolejki albo brak tabeli oznacza brak wysyłki i zdarzenie w Sentry. Klucz deduplikacji, podgląd treści, retencja held od pierwszego dnia. Wiersz held nie zawiera tokenu, osobisty link powstaje w chwili wysyłki. RLS: odczyt dla redakcji, zapis wyłącznie service role. Przy błędzie wysyłki z bramki logujemy tylko domenę adresata. Test czytający źródło pilnuje, że nic w obszarze Akademii nie woła sendEmail poza bramką.

Kotwice: `lib/academy/outbound.ts (nowe); academy_outbox (nowa tabela); lib/email/sender.ts:157 (sendEmail); lib/email.ts:876`

### B0.3 Przegląd wszystkich kanałów wyjścia [S, kod]

Cron course-inactivity przez bramkę przed pierwszą publikacją, bo wyśle mail każdemu aktywnemu zapisowi na opublikowanym kursie. Spisanie i test pozostałych kanałów: wydarzenia Graph z uczestnikami, web push, webhook Teams, maile Supabase Auth. Bez nowych uprawnień Graph.

Kotwice: `app/api/cron/course-inactivity/route.ts; lib/academy/teams.ts:232 (createTeamsCalendarEvent); lib/academy/db-worker.ts:41 (ACADEMY_TEAMS_ENABLED); lib/push/dispatch.ts`

### B0.4 Rejestr przełączników i blokada trybu open [M, migracja]

Jeden moduł czytający env runtime, jak HR_MOVED_TO_NEXUS: ACADEMY_MAIL_ENABLED, ACADEMY_PASS_ENABLED, ACADEMY_LEARNER_SYNC_ENABLED, ACADEMY_TEAMS_ENABLED (istnieje), ACADEMY_GRAPH_RECORDINGS_ENABLED, ACADEMY_AI_DRAFTS_ENABLED, ACADEMY_PUBLIC_VERIFY_ENABLED, ACADEMY_RETRIEVAL_ENABLED, ACADEMY_MATERIAL_CLEANUP_ENABLED (istnieje). Tylko wartość true włącza. Zmiana wyłącznie w vault Coolify, w aplikacji sam odczyt. Migracja dokłada CHECK na ustawieniach i RAISE w academy_set_rollout: tryb open odrzucany także adminowi, lista pilota najwyżej 20 kont. Opcja open znika z panelu i ze schematu akcji. Zdjęcie blokady to osobna migracja aplikowana przez właściciela na bramce startu.

Kotwice: `lib/academy/switches.ts (nowe); wzorzec lib/feature-flags.ts i lib/hr/moved-to-nexus.ts; docker-compose.yml:42,50; components/academy/AcademyRolloutPanel.tsx:24,40; lib/actions/academy-access.ts:88-92; 20260922141952_academy_rollout_gate.sql:5,39`

### B0.5 Panel Gotowość do startu (V16) [M, migracja]

Trasa tylko dla admina: lista scenariuszy z rodzajem (automat albo ręczny), wynikiem, SHA, datą, ważnością i dowodem; stan przełączników i blokady open; licznik wstrzymanych, wygasłych i wysłanych testowo; warunki bramki startu z właścicielem warunku i dowodem. Wyniki ręczne wpisuje człowiek zalogowany przez SSO, ze zrzutem w prywatnym buckecie. Definicje scenariuszy i mapa scenariusz-ścieżki plików w kodzie, wyniki i warunki w bazie.

Kotwice: `app/(protected)/admin/learning/gotowosc/page.tsx (nowe); lib/academy/readiness-scenarios.ts (nowe); academy_readiness_results, academy_launch_conditions (nowe); bucket academy-readiness-evidence (nowy, prywatny); components/academy/AcademyAdminNav.tsx; lib/academy/operations-health-server.ts`

### B0.6 Kurs-atrapa, data startu raportów, porządek w szkicach [M, migracja]

Dwa różne przypadki. Kurs-atrapa do E2E ma courses.is_rehearsal=true, jest na zawsze wykluczony filtrem i nie jest kasowany. Kurs z prawdziwą treścią ma is_rehearsal=false, a jego widoczność trzyma rollout, więc po otwarciu zostaje. Raporty do startu pokazują dane z etykietą „próba”, a po starcie liczą od zapisanej daty, bez kasowania niezmiennych wierszy. Usuwanie niepublikowanych szkiców bez zapisów i przywracanie z archiwum, bo próby będą je mnożyć. Odczyt, czy na 2 konta consultant da się zalogować, i wskazanie przez właściciela, kto z nich korzysta.

Kotwice: `courses.is_rehearsal (nowa kolumna); academy_set_rollout; lib/actions/academy-discovery.ts; lib/actions/courses-admin.ts; guard_version_snapshot (20260922141922:644)`

### B0.7 Harness E2E bez uprzywilejowanych haseł [L, kod]

Osobny config Playwright z testDir tylko na e2e/academy-acceptance, a główny config dostaje testIgnore na ten katalog, bo inaczej objąłby go zestaw e2e i odwrotnie. Uruchamiany ręcznie z laptopa albo przez workflow_dispatch, nigdy z crona. UA z dynaminds-smoke-test. W B0 kroki admina i TCM wykonują ludzie przez SSO; automat loguje się wyłącznie kontami próbnymi z B1, bez konta admina z hasłem. Stały kurs-atrapa z własnym limitem podejść (quiz_attempt_limit). Scenariusze kończące się dokumentem idą przy zmianie ich ścieżek, nie w każdym biegu, bo każdy bieg zostawia nieusuwalne ukończenia. Wynik zapisuje osobna trasa z własnym sekretem Bearer, tylko scenario_id, SHA i status, nigdy service role w GH. Zrzuty wyłącznie z danymi prób, w prywatnym buckecie, nie w GH Artifacts. Każdy bieg kończy się asercją: 0 wiadomości poza listą skrzynek właściciela.

Kotwice: `COMPASS/e2e/academy-acceptance/ (nowe); COMPASS/playwright.academy.config.ts (nowe); COMPASS/playwright.config.ts:24 (testDir); e2e/helpers/test-users.ts; app/login/actions.ts:98; lib/api/bearer-secret.ts; app/api/internal/academy-readiness/route.ts (nowe); .github/workflows/academy-acceptance.yml (nowe, inny niż inwentaryzacja academy-readiness.yml)`

### B0.8 Sygnał dla recenzenta i autora [S, migracja]

Powiadomienie w dzwonku przy zgłoszeniu do recenzji i przy decyzji, licznik kolejki w nawigacji, wycofanie zgłoszenia przez autora. Tylko in-app, więc bez wyjścia na zewnątrz. Organizator jest autorem, właściciel niezależnym recenzentem.

Kotwice: `academy_submit_for_review; academy_review_course; academy_private.notify; components/academy/AcademyAdminNav.tsx; token submission_id bez zmian`

### B0.9 Odczyty właściciela i zabezpieczenie nagrań [S, proces]

Przed pierwszą migracją: PITR i kopie dzienne, ich horyzont, globalny limit plików Storage, wynik w panelu Gotowość. Tymczasowa zasada dla prób: nagrania próbne tylko za zgodą testerów, usuwane po pomiarze, bez głosów osób spoza redakcji. Osobno: jeśli nagrania szkoleń z 07.10 i 27.10 istnieją (niepotwierdzone), skopiować je na SharePoint z retencją do 04.12, bo dla 07.10 pierwszy możliwy termin wygaśnięcia to około 06.12, a kolejne to 05.01 i 04.02. Nie wymaga kodu i nie wprowadza plików do COMPASS.

Kotwice: `Dashboard Supabase: Database Backups, Storage Settings; docs/academy/restore-drill.md; docs/academy/storage-gate.md; OneDrive organizatora, SharePoint`

### B0.10 Porządki blokujące próby [S, migracja]

Wyłączenie 6 reguł kursowych grywalizacji, usunięcie wywołania streaka i toastu punktów, usunięcie UI ścieżki legacy i LinkedInShareButton, ukrycie rekomendacji, ścieżek nauki i dripu lekcji, media-src i frame-src w CSP przed wymuszeniem polityki.

Kotwice: `loyalty_rules; academy_mark_lesson_complete; components/learning/LessonPlayer.tsx:77; lib/actions/courses-admin.ts:85-113; components/learning/LinkedInShareButton.tsx; components/learning/CourseAuthorForm.tsx; next.config.mjs:19-31`

### B0.11 Próba generalna 1: kurs na prawdziwej treści, plik i spotkanie z gościem [M, proces]

Nowy szkic self_paced zakłada konto TCM. Właściciel niczego w nim nie edytuje, bo trafiłby do version_contributors i stracił niezależność, a stary szkic Cybersecurity (live, 0 lekcji, w kolejce od 05.10) zostaje nietknięty. Lekcje i 4-10 pytań dostarcza organizator do 13.11; jeśli ich nie będzie, próba idzie na krótkim materiale redakcji i B0 się nie przesuwa. Uczestnikiem jest osoba z redakcji spoza autorów i recenzentów. MP4 około 1 GB z parametrami pliku Teams, nagrany przez redakcję lub właściciela, bez głosów innych osób; przechodzi ClamAV i parser, z pomiarem czasu i pamięci na CAX21 oraz odtworzeniem na telefonie. W pierwszym tygodniu 15-minutowe spotkanie Teams z gościem na prywatnym adresie właściciela: odczyt, czy raport podaje adres gościa, zapisany przed projektowaniem B3.6. Stoper i lista błędów.

Kotwice: `components/learning/CourseAuthorForm.tsx:66,186; components/academy/MaterialUploader.tsx:63-65; lib/academy/mp4-validation.ts; ACADEMY_MATERIAL_SCAN_RUN; raport frekwencji Teams`

### B0.12 Kontrakt migracji i braku obiektu [S, proces]

Jeden rytm: okno dzienne właściciela o stałej porze, pliki aplikowane po kolei, każdy z samosprawdzeniem. Każda migracja ma skrypt cofnięcia albo notkę „nieodwracalne, cofamy PITR”. Kod idzie przed SQL, więc nowe akcje obsługują 42P01 i 42703 komunikatem „czeka na migrację”, a kanały wyjścia przy braku obiektu nie wysyłają niczego.

Kotwice: `COMPASS/supabase/migrations; lib/actions/action-result.ts; lib/actions/nexus-identity.ts (wzorzec 42703/42P01); lib/academy/outbound.ts`

**Warunki zakończenia:**

- G01-G10 przechodzą, ze zrzutem albo wynikiem i SHA.
- Zero wiadomości poza listą skrzynek właściciela; tryb open odrzucany przez bazę także adminowi.
- Zadanie bezpieczeństwa z B0.1 zamknięte albo znany jego termin i potwierdzony interfejs dla B1; wynik przeglądu przekazany IOD.
- Zapisany odczyt, czy raport Teams podaje adres gościa.
- Lista błędów z próby 1 rozpisana, blokujące naprawione.

## B1: Etap B1: dostęp biura i konto nauki konsultanta

30.11.2026 - 15.01.2027 · 12 dni pracy + 2,4 dnia rezerwy; wspólne okno z B2, razem 31 dni roboczych

**Cel:** Każda osoba, dla której Akademia jest przeznaczona, ma działającą drogę wejścia, ale żadna droga nie jest aktywna poza kontami testowymi.

**Wynik:** Pracownik biura wchodzi przez SSO z listy pilota, konto na prywatnej skrzynce właściciela przechodzi przez przepustkę i widzi tylko Akademię. Automat E2E ma konta, którymi może się logować. Automat tożsamości działa na sucho i podaje same liczby.

**Równolegle:** W jednym oknie z B2, bo B2 pracuje na kontach redakcji i nie potrzebuje kont nauki. W B1 niezależne są: role biura (B1.1), przepustka (B1.3) i izolacja (B1.4). B1.2 i B1.5 muszą poprzedzić pierwsze konto próbne, a B1.10 idzie po B1.4. Warunek startu przepustki: B0.1. Okno pomija 24-25.12, 01.01 i 06.01.

### B1.1 Dostęp biura i pilot dla każdej roli [M, migracja]

Role internal, manager i finanse w SQL oraz w aplikacji, razem około 9 miejsc i test nawigacji. Pilot przyjmuje UUID dowolnej roli, bo dziś tylko consultant, z limitem 20 kont z B0.4. Landing Akademii zamiast archiwum HR działa dopiero, gdy rollout wpuszcza daną osobę, więc przy closed nic się nikomu nie zmienia.

Kotwice: `academy_private.rollout_allows_user; trainer_eligible; refresh_invites_after_rollout_change; academy_set_rollout; lib/academy/server.ts:31; middleware.ts:139; components/layout/Sidebar.tsx:403; app/(protected)/layout.tsx:84; app/api/akademia/attachment/route.ts; app/api/akademia/certificate/route.ts; lib/hr/moved-to-nexus.ts:157-171`

### B1.2 Model konta nauki i konta próbne [M, migracja]

Tabela kont nauki bez zapisu klienta, profiles.academy_only dopisane do pinu kolumn, ustawiane przy tworzeniu konta. Pola: źródło, zgoda na klauzulę, pierwsze logowanie, access_until. Konto próbne (source='proba') istnieje tylko, gdy adres jest na liście skrzynek właściciela w vault; sprawdzane przy tworzeniu i przy każdym wejściu, a nadanie source='proba' wyłącznie SQL-em. Lista kont nauki (tabela) i lista skrzynek właściciela (vault) to dwie różne rzeczy. Spójne z kontrolą zakładania kont z B0.1.

Kotwice: `academy_learner_accounts (nowa albo z B0.1); profiles.academy_only; pin_profile_privilege_columns; handle_new_user; ACADEMY_MAIL_TEST_RECIPIENTS`

### B1.3 Przepustka za przełącznikiem [L, kod]

Token z terminem ważności i HMAC, bez adresu w URL. GET pokazuje klauzulę i niczego nie zapisuje, bo skanery poczty otwierają linki; POST zakłada konto przez Admin API, a verifyOtp wykonuje przeglądarka. Przy ACADEMY_PASS_ENABLED wyłączonym działa tylko dla kont próbnych z adresem na liście skrzynek właściciela, reszta dostaje 404. /auth/callback bez zmian. Przegląd security-reviewer przed merge.

Kotwice: `lib/academy/learner-pass.ts (nowe); wzorzec lib/consultant-success/pulse-token.ts; app/wejdz/[token]/page.tsx (nowe); app/api/akademia/wejscie/[token]/route.ts (nowe); middleware.ts:42`

### B1.4 Izolacja konta nauki w aplikacji [XL, kod]

Biała lista stron, menu tylko Akademia, ominięcie onboardingu z CV. Domyślna odmowa we wspólnym loadAuthContext, jawna odmowa w plikach z własnym getUser i klientem service role, bo akcję można wywołać POST-em z dozwolonej strony. Zakres: 70 plików lib/actions, w tym 24 z własnym getUser i 27 z klientem service role, oraz 39 tras /api. Test czytający źródło klasyfikuje każdy plik.

Kotwice: `lib/auth/internal-guard.ts; lib/actions/**; middleware.ts:145-148; components/layout/Sidebar.tsx; components/layout/MobileMenu.tsx; lib/api/with-auth.ts; app/api/**`

### B1.5 Odcięcie od kartoteki i RODO [M, migracja]

Filtr academy_only w eksporcie rosteru, activeRoster i excludeExited oraz przegląd konsumentów list ludzi. Eksport i zatarcie danych obejmują konta nauki i kopie na prywatnej liście edycji.

Kotwice: `nexus_roster_export; lib/hr/employment-window.ts; lib/actions/news.ts:186; lib/gdpr/subject-data.ts; academy_webinar_roster`

### B1.6 Automat tożsamości na sucho [M, kod]

Dzienny cron porównuje aktywne umowy z istniejącej migawki NEXUS z listą kont nauki i liczy nowe, wygasłe i konflikty adresów. Raport zawiera wyłącznie liczby, bez adresów, także w heartbeacie i audycie. Przy ACADEMY_LEARNER_SYNC_ENABLED wyłączonym 0 wierszy. Bezpiecznik jak w rosterze: ponad 5 wygaszeń czeka na człowieka. Dopisanie adresu z umowy do eksportu NEXUSA to osobny PR w tamtym repo, przygotowany i testowany na danych syntetycznych, wdrożony po rejestrze czynności. Harmonogram jawnie: zadanie Coolify z nazwą kontenera, bez action=cron-enable, które włącza wszystkie zadania. Bez dopasowań po nazwisku.

Kotwice: `app/api/cron/academy-learners-sync/route.ts (nowe); lib/audit/cron-heartbeat.ts; nexus_contract_snapshot; lib/hr/nexus-roster.ts; NEXUS backend/app/api/integrations_compass.py`

### B1.7 Ponowne wejście [M, kod]

Formularz adresu, limity per IP i adres, jednorazowy link 15 minut wyłącznie do kont z listy kont nauki. Przy ACADEMY_PASS_ENABLED wyłączonym adres spoza listy skrzynek właściciela dostaje 404, bez wiersza i bez wiadomości. Po włączeniu ta sama odpowiedź niezależnie od wyniku. Idzie przez bramkę B0.2.

Kotwice: `app/wejdz/page.tsx (nowe); app/api/akademia/wejscie/request/route.ts (nowe); lib/academy/outbound.ts; middleware.ts:42`

### B1.8 Ekran klauzuli i regulaminu jako miejsce na treść [S, tresc]

Mechanizm zgody i wersjonowania tekstu z info_accepted_at. Treść robocza do czasu opinii prawnika, ostateczny tekst jest warunkiem bramki startu.

Kotwice: `app/wejdz/[token]/page.tsx; app/privacy-policy; app/terms/page.tsx; academy_learner_accounts.info_accepted_at`

### B1.9 Sprawdzenie etapu na skrzynkach właściciela [S, proces]

Punkt startu: wynik testu izolacji B1.10. Konta na Gmail i Onet: pełne wejście, telefon, ponowne wejście, próba akcji spoza Akademii, konto biurowe z pilota. Tester z redakcji przechodzi bez pomocy. Od tego epiku automat E2E używa kont próbnych.

Kotwice: `e2e/academy-acceptance; academy_set_rollout; supabase/tests`

### B1.10 Izolacja konta nauki w warstwie danych [M, proces]

Test JWT konta academy_only po pełnym katalogu: tabele, widoki, funkcje wykonywalne przez authenticated, w tym SECURITY DEFINER spoza Akademii, oraz wszystkie buckety. Wynik to zatwierdzona lista dozwolonych, a test pada na każdej nowej pozycji spoza listy. Zewnętrzny test penetracyjny ma to potwierdzać, a nie znaleźć jako pierwszy.

Kotwice: `supabase/tests (nowy test katalogu); information_schema; pg_proc; storage.buckets; technika BEGIN + request.jwt.claims + SET LOCAL ROLE authenticated + ROLLBACK`

**Warunki zakończenia:**

- G11-G18 przechodzą, ze zrzutem albo wynikiem i SHA.
- Przegląd security-reviewer przepustki i izolacji bez otwartych ustaleń blokujących, test czytający źródło akcji i test katalogu zielone.
- Przy wyłączonej przepustce token i adres spoza listy skrzynek właściciela dają 404, automat tożsamości zapisał 0 wierszy i żadnego adresu.
- Zero wiadomości poza listą skrzynek właściciela.

## B2: Etap B2: testy, które weryfikują wiedzę, także poza kursem

30.11.2026 - 15.01.2027 · 14 dni pracy + 2,8 dnia rezerwy; wspólne okno z B1, razem 31 dni roboczych

**Cel:** Test jest prawdziwym narzędziem weryfikacji wiedzy: pula, losowanie, limit czasu, wyjaśnienia, unieważnianie, działanie poza kursem.

**Wynik:** Redakcja buduje pulę na prawdziwej treści, a uczestnicy zdają losowane zestawy na telefonie. Reguła dokumentu jest egzekwowana w bazie, razem ze ścieżką od zaświadczenia do certyfikatu.

**Równolegle:** W jednym oknie z B1. Kolejność wewnątrz: B2.1, B2.2 i B2.3 (schemat) przed interfejsami. Potem równolegle: B2.4-B2.5 (uczestnik), B2.6 (edytor), B2.7-B2.9 (typy testu i dokumenty), B2.11 (AI). Migracje idą przez okno dzienne z B0.12.

### B2.1 Pula pytań w modelu kursu [M, migracja]

Tag tematu, wyjaśnienie przy opcji, konfiguracja wersji: liczba losowanych, próg, limit czasu, limit podejść. Zdjęcie sztywnych 4-10 pytań i dokładnie 4 opcji. Rozszerzenie course_quiz_*, bo czyta je 13 funkcji i eksport RODO. W chwili tej migracji istnieje jedna wersja próbna z B0.11, więc to najtańszy moment; opublikowana wersja zostaje przy dotychczasowych ustawieniach, nowe pola są opcjonalne. Usunięcie martwych RPC.

Kotwice: `course_quiz_questions; course_quiz_options.explanation (nowa); course_versions.completion_rules; check quiz_requires_four_to_ten_questions (20260922141922:569); components/learning/QuizEditor.tsx (QUIZ_OPTIONS_PER_QUESTION); get_quiz_for_attempt, submit_quiz_attempt`

### B2.2 Podejście jako sesja po stronie bazy [L, migracja]

Start podejścia losuje i zamraża zestaw oraz kolejność, zapisuje termin. Odświeżenie zwraca ten sam zestaw, odpowiedź po czasie jest odrzucana w bazie. Ocenianie zostaje wyłącznie w bazie, klucz nie opuszcza SQL.

Kotwice: `academy_start_quiz_attempt (nowe); course_quiz_attempt_items (nowa); academy_get_quiz; academy_submit_quiz; academy_private.submit_quiz_scoring; lib/academy/quiz-attempt-policy.ts`

### B2.3 Unieważnienie pytania [M, migracja]

voided_at ustawiane RPC z audytem, wyjątek w guard_content_write tylko dla tej kolumny, przeliczenie zapisanych prób i domknięcie ukończeń.

Kotwice: `course_quiz_questions.voided_at (nowa); guard_content_write; academy_question_immutable; academy_private.finalize_enrollment`

### B2.4 Formularz testu na telefonie [M, kod]

Licznik czasu z bazy, autozapis, pasek postępu, blok kodu w scenariuszu przez markdown. Jedna przewijana strona zostaje przy zestawach do 10 pytań, większe dzielone na strony.

Kotwice: `components/learning/QuizForm.tsx:151; app/(protected)/learning/[slug]/quiz/page.tsx; components/learning/MarkdownView.tsx`

### B2.5 Wynik z wyjaśnieniami [S, kod]

Po wysłaniu uczestnik widzi tematy do powtórki i wyjaśnienia. Odsłonięcie jest bezpieczne, bo pula jest większa od zestawu; edytor wymaga pul co najmniej dwukrotnie większych, gdy włączono wyjaśnienia.

Kotwice: `app/(protected)/learning/[slug]/wyniki/page.tsx; course_quiz_options.explanation; course_quiz_attempts.answers`

### B2.6 Bank pytań i edytor testu (V18) [L, kod]

Lista puli z filtrami po tagu, rozkład trudności i tematów, próg, losowanie, podgląd przykładowego zestawu, import z CSV, unieważnianie po publikacji. Styl AcademyShell zamiast starego formularza.

Kotwice: `app/(protected)/learning/tworze/[id]/pytania/page.tsx; components/learning/QuizEditor.tsx; components/academy/AcademyShell.tsx; lib/actions/courses-admin.ts`

### B2.7 Test poza kursem [M, migracja]

delivery_mode='assessment': kurs bez lekcji, przechodzi tę samą recenzję, zapis, katalog i dokument. Bez drugiego modelu, więc działa wersjonowanie, RLS i eksport RODO.

Kotwice: `courses.delivery_mode (CHECK w 20260922141922:20); academy_create_course; academy_submit_for_review; academy_private.finalize_enrollment; components/academy/catalog/catalog-filters.ts`

### B2.8 Pre-test [M, migracja]

Podejście rodzaju pre z tej samej puli, bez wpływu na zaliczenie i limit podejść. Wynik per temat dla uczestnika, przyrost w raporcie edycji z B5.3.

Kotwice: `course_quiz_attempts (kind, nowa kolumna); academy_start_quiz_attempt; lib/academy/edition-summary.ts`

### B2.9 Model dokumentów: certyfikat i zaświadczenie udziału [L, migracja]

Nowe kursy live mają domyślnie quiz_required=true. Certyfikat zostaje jedynym ukończeniem w course_completions i jedyną nagrodą, wystawianym po obecności i zdanym teście, w kursie samodzielnym po modułach i teście. Zaświadczenie udziału to osobny rekord poza course_completions, powstający, gdy obecność jest spełniona, a testu brak, bo przy enrollment_id UNIQUE i niezmiennej historii wiersz ukończenia zablokowałby późniejszy certyfikat. Późniejsze zdanie testu daje certyfikat, a zaświadczenie zostaje w historii. Osobny szablon PDF, bo dziś tekst certyfikatu jest na sztywno; raporty liczą oba dokumenty osobno. Test edycji otwiera się po wymaganych sesjach. Dopisek o braku związku z certyfikacją producenta, nazwisko przypięte.

Kotwice: `academy_create_course (linia v_rules, quiz_required); components/learning/CourseAuthorForm.tsx:66; academy_private.finalize_enrollment (20260922141946:166); guard_completion_history (20260922141946:103); academy_participation_documents (nowa); academy_attendance_satisfied; lib/pdf/certificate.ts:84,98-99; pin_profile_privilege_columns`

### B2.10 Klucz i analiza pytań [M, migracja]

Klucz opublikowanej wersji widzą tylko autor i recenzent, a wyniki osób z dostępem do klucza nie liczą się do raportów. Odsetek poprawnych i rozkład dystraktorów per pytanie, bez korelacji i IRT.

Kotwice: `RLS course_quiz_options; academy_can_manage_course; lib/academy/edition-summary.ts; components/academy/EditionSummary.tsx`

### B2.11 Szkice pytań z AI (V14), za przełącznikiem [M, migracja]

Wejście: slajdy i materiał prowadzącego bez głosów uczestników. Rubryka scenariuszowa, drugi przebieg krytyki, fragment źródłowy przy pytaniu, zapis zatwierdzającego. Do puli trafia tylko to, co zatwierdził człowiek. ACADEMY_AI_DRAFTS_ENABLED wyłączone do decyzji o przekazaniu treści.

Kotwice: `lib/academy/question-draft.ts (nowe); lib/ai/llm.ts:64 (limit 4096 tokenów do zmiany); academy_question_drafts (nowa)`

### B2.12 Próba generalna 2: test na prawdziwej treści [S, tresc]

TCM buduje pulę około 30 pytań do Cybersecurity lub DORA, właściciel recenzuje, konta próbne i osoby z redakcji spoza autorów zdają losowane zestawy na telefonie, jedno pytanie zostaje unieważnione. Tester spoza budowy opisuje, co było niejasne.

Kotwice: `e2e/academy-acceptance; app/(protected)/learning/tworze/[id]/pytania/page.tsx`

**Warunki zakończenia:**

- G19-G28 przechodzą, ze zrzutem albo wynikiem i SHA (G28 przy włączonym ACADEMY_AI_DRAFTS_ENABLED, tylko po decyzji właściciela; bez niej oznaczony jako czekający na decyzję).
- Test SQL: odpowiedź API przed wysłaniem nie zawiera klucza, odpowiedź po czasie odrzucona, postgres:17 lokalnie zielony dla każdej migracji.
- Sekwencja obecny bez testu, zaświadczenie, zdanie, certyfikat przechodzi, a zaświadczenie zostaje w historii.
- Próba 2 przeszła, co najmniej 80% scenariuszy testerzy zrobili bez pomocy.
- Zero wiadomości poza listą skrzynek właściciela.

## B3: Etap B3: szkolenie na żywo w Teams, od zapisu po dokument

18.01.2027 - 24.02.2027 · 12,5 dnia pracy + 2,5 dnia rezerwy; wspólne okno z B4, razem 28 dni roboczych

**Cel:** Cały cykl edycji działa w COMPASS, od publikacji przez wybór adresatów, zapis, zaproszenia i frekwencję, po dokument, z wiadomościami wstrzymanymi w kolejce.

**Wynik:** Organizator prowadzi edycję bez Worda i bez ręcznego czyszczenia plików. Prawdziwe spotkanie Teams z gościem przeszło przez import, a plik około 100 wierszy z wyjątkami pokazał realny koszt operacji.

**Równolegle:** W jednym oknie z B4. Zależy od B1 (konta) i B2 (reguła dokumentu). Niezależne: karta i zapis (B3.1-B3.2), adresaci i zaproszenia (B3.3-B3.4, B3.12), zamknięcie edycji (B3.5-B3.8). Pakiet prowadzącego (B3.13) i próba 3 (B3.14) na końcu.

### B3.1 Karta szkolenia po przebudowie (V17) [M, kod]

Hero z okładką, prawa kolumna z zapisem i najbliższą edycją, program z postępem, warunki ukończenia. Przejście ze starego stylu na AcademyShell. Ten sam ekran dla kursu, testu i edycji.

Kotwice: `app/(protected)/learning/[slug]/page.tsx; components/academy/catalog/CourseCover.tsx; components/academy/AcademyShell.tsx; components/learning/CourseDetailActions.tsx; components/academy/AcademyPrerequisites.tsx`

### B3.2 Zapis w COMPASS [S, kod]

Zapis z limitem i listą rezerwową, link Teams i plik kalendarza po zapisie. Naprawa przycisku widocznego, gdy SQL już odmawia.

Kotwice: `academy_register_run; components/academy/sessions/AcademyRunDetail.tsx:52; lib/academy/calendar.ts; lib/actions/academy-sessions.ts:205`

### B3.3 Zaproszenia i przypomnienia [M, kod]

Szablony T-21, T-7, T-1, T-1 h z osobistym linkiem i kalendarzem, link rezygnacji, harmonogram w istniejącym workerze, deduplikacja. Przy domyślnych przełącznikach kompletna kolejka held z podglądem i terminem wygaśnięcia; wysyłka testowa wyłącznie na skrzynki właściciela. Zatwierdzenie paczki jest w interfejsie, ale bez przełącznika z vault nieaktywne.

Kotwice: `lib/academy/outbound.ts; academy_outbox; lib/email.ts (szablony); app/api/cron/academy-sync; lib/academy/calendar.ts`

### B3.4 Nadawca per wiadomość [S, kod]

Dziś MAIL_FROM ma pierwszeństwo przed msg.from, więc inna skrzynka nadawcza wymaga zmiany kodu. Adres Akademii z osobnej zmiennej, nieużywany do czasu warunku bramki startu. Bez zmian w uprawnieniach.

Kotwice: `lib/email/sender.ts:100 (fromHeader); ACADEMY_MAIL_FROM (nowe)`

### B3.5 Powiązanie konta z listą i późna aktywacja [M, migracja]

Przy pierwszym wejściu konto łączy się z wierszem prywatnej listy, zapis zostaje potwierdzony, a zaimportowana już frekwencja przenosi się do session_attendance i odpala finalize_enrollment.

Kotwice: `academy_private.bind_learner_to_run (nowe); academy_commit_webinar_import (20261006080417); academy_webinar_attendance; session_attendance; academy_private.edition_survey_eligible`

### B3.6 Import frekwencji odporny na wyjątki [M, migracja]

Wiersze bez adresu i osoby spoza listy idą do sekcji wyjątków zamiast przerywać plik, co wymaga zmiany parsera i RAISE w jednej transakcji importu. Prowadzący i organizator wykluczeni listą adresów na edycji. Ręczne rozstrzygnięcie wyjątku przez człowieka z audytem, automat nie dopasowuje po nazwisku. Wariant na podstawie odczytu z B0.11: gdy raport zwykłego spotkania nie podaje adresu gościa, domyślnym torem staje się spotkanie z rejestracją w Teams, którego raport adresy ma, a zapis w COMPASS zostaje źródłem listy.

Kotwice: `lib/academy/webinar-import.ts:131; academy_commit_webinar_import (20261006080417:399); components/academy/sessions/AcademyWebinarImportPanel.tsx; academy_webinar_import_batches`

### B3.7 Lista uczestników organizatora (M05) [M, kod]

Zapisani, lista rezerwowa, osoby bez konta, zgodność z migawką NEXUS, wykluczenie z zaproszeń, stan kolejki wiadomości. Eksport CSV do Worda schowany.

Kotwice: `components/academy/sessions/AcademyLearnerProgress.tsx; components/academy/sessions/AcademyWebinarImportPanel.tsx; lib/actions/academy-webinar-import.ts:47 (exportAcademyWebinarMailingList); nexus_contract_snapshot`

### B3.8 Ekran zamknięcia edycji (M06) [M, kod]

Pięć kroków z odnośnikami do paneli: lista, czas spotkania, frekwencja z wyjątkami, materiały, wiadomości po szkoleniu z podglądem i zatwierdzeniem paczki nieaktywnym bez przełącznika. Dzwonek o ankiecie i dokumencie, licznik operacji.

Kotwice: `app/(protected)/learning/tworze/[id]/edycje/page.tsx; academy_confirm_session_window; components/academy/RunMaterials.tsx; components/academy/EditionSurvey.tsx; academy_private.notify`

### B3.9 Kolejna edycja jednym formularzem [S, kod]

Z opublikowanego programu nowa edycja: tytuł, termin, limit, prowadzący, sposób spotkania. Bez rozdzielania edycji od wersji programu, bo to przekracza zakres.

Kotwice: `lib/actions/academy-sessions.ts:110 (createAcademyRun); academy_create_run; components/academy/sessions/AcademySessionForm.tsx`

### B3.10 Recenzja także przez TCM, po decyzji [L, migracja]

Rozszerzenie niezależnej akceptacji na TCM w kursie, edycji, materiale i pakiecie, razem z kolejką i layoutem panelu, bo inaczej TCM nie otworzy kolejki. Token submission_id zostaje. Wcześniejsza węższa zmiana dostępu TCM objęła 43 pliki, stąd wycena L. Bez tego system ma jednego aktywnego recenzenta.

Kotwice: `academy_can_review_version; academy_can_review_run; academy_review_course; academy_review_legacy_course; academy_publish_run; academy_review_run_material; academy_review_handover; guard_run_review; app/(protected)/admin/learning/layout.tsx; lib/academy/server.ts`

### B3.11 Tor Teams z konta organizatora za przełącznikiem [S, decyzja]

Kod spotkań zarządzanych i odczytu frekwencji już jest, ACADEMY_TEAMS_ENABLED zostaje wyłączone. Testy na atrapie Graph, spis wymaganych uprawnień w panelu Gotowość. Domyślny tor to spotkanie z linkiem. Wymaga decyzji właściciela.

Kotwice: `lib/academy/db-worker.ts:41; lib/academy/teams.ts:232,335; lib/academy/integration-worker.ts:28; docs/academy/graph-readiness.md; components/academy/sessions/AcademyIntegrationsPanel.tsx`

### B3.12 Adresaci edycji [M, migracja]

Organizator wybiera adresatów z migawki NEXUS i list biura: filtry dostępne bez nowych danych, podgląd liczby, wykluczenia, zapis kto i kiedy wybrał. Przy wyłączonej wysyłce zapisuje wyłącznie wiersze held.

Kotwice: `academy_run_audience (nowa); nexus_contract_snapshot; components/academy/sessions/AcademyLearnerProgress.tsx; lib/academy/outbound.ts; lib/hr/employment-window.ts (activeRoster)`

### B3.13 Sprawdzenie ścieżki prowadzącego i pakietu [S, proces]

academy_handovers ma 0 wierszy, więc ten kod nigdy nie zadziałał. Prowadzący z can_train wgrywa pakiet, TCM uzupełnia, niezależna osoba przyjmuje lub zwraca, moduł bez podpisanych praw nie przechodzi. Poprawki z tego przebiegu mieszczą się w rezerwie.

Kotwice: `academy_handovers; academy_review_handover; 20261005102329_academy_audio_handover.sql; academy_private.trainer_eligible`

### B3.14 Próba generalna 3: edycja na sucho [M, proces]

Prawdziwe 15-minutowe spotkanie Teams z gościem na prywatnym adresie właściciela, nagrywane za zgodą testerów i usuwane po pomiarze. Organizator przechodzi cały cykl, redakcja i konta próbne są uczestnikami. Koszt operacji mierzymy na pliku około 100 syntetycznych wierszy z wyjątkami, bo próba na garstce osób go nie pokaże.

Kotwice: `components/academy/sessions/AcademyWebinarImportPanel.tsx; e2e/academy-acceptance; raport frekwencji Teams`

**Warunki zakończenia:**

- G29-G40 przechodzą, ze zrzutem albo wynikiem i SHA; G38 i część na żywo G40 oznaczone, jeśli decyzja właściciela nie zapadła.
- Kolejka zawiera komplet wiadomości cyklu ze statusem held, wysyłka testowa doszła tylko na skrzynki właściciela.
- Liczba operacji organizatora na pliku około 100 wierszy zapisana, cel poniżej 30.
- Ścieżka prowadzącego przeszła raz w całości, także z odmową.
- Zero wiadomości poza listą skrzynek właściciela.

## B4: Etap B4: więcej wideo, nagrania, materiały, biblioteka IT

18.01.2027 - 24.02.2027 · 10,5 dnia pracy + 2,1 dnia rezerwy; wspólne okno z B3, razem 28 dni roboczych

**Cel:** Wideo jest pełnoprawną formą nauki, a treść żyje poza terminem szkolenia.

**Wynik:** Uczestnik wraca do nagrania od tej sekundy, na której skończył, korzysta z rozdziałów i biblioteki, a nieobecny ma kurs z tą samą pulą pytań.

**Równolegle:** W jednym oknie z B3. Niezależne od siebie: odtwarzacz i postęp (B4.2-B4.3), rozdziały (B4.4), biblioteka (B4.7). B4.8 potrzebuje puli z B2, edycji z B3 i academy_programmes z B4.7, więc idzie na końcu. Transkodowanie wyłącznie na laptopie, nigdy na CAX21.

### B4.1 Normalizator i reguła kopii [S, kod]

ffmpeg do H.264 8-bit i AAC-LC, faststart, jawnie duży przeplot, lokalny Mp4StreamValidator przed uploadem, instrukcja jednej komendy. Oryginał i wersja znormalizowana na SharePoint.

Kotwice: `scripts/academy-normalize-video.sh (nowe); lib/academy/mp4-validation.ts:130,261; docs/academy/mp4-validation.md`

### B4.2 Odtwarzacz odporny na długie nagrania [S, kod]

Zerowanie licznika ponowień po udanym wznowieniu, odświeżanie podpisanego URL po błędzie, prędkość odtwarzania. Dziś drugi błąd sieci kończy seans.

Kotwice: `components/academy/AcademyVideo.tsx:33,59,115-121`

### B4.3 Postęp co do sekundy i wznawianie [M, migracja]

Zapis pozycji i obejrzanych zakresów co kilkanaście sekund, wznowienie na innym urządzeniu, moduł zalicza się automatycznie po obejrzeniu ustawionej części, domyślnie 90%. Przycisk ręczny znika.

Kotwice: `academy_video_progress (nowa); academy_mark_lesson_complete; course_enrollments.completed_lessons; components/learning/LessonPlayer.tsx; components/academy/AcademyVideo.tsx`

### B4.4 Rozdziały i napisy [M, migracja]

Edytor rozdziałów przy materiale, spis obok odtwarzacza, przeskok kliknięciem. Napisy VTT zostają w dzisiejszej postaci.

Kotwice: `academy_video_chapters (nowa); lib/academy/lesson-captions.ts; components/learning/LessonsEditor.tsx; components/academy/RunMaterials.tsx`

### B4.5 Długie pliki i limit autora [M, migracja]

Kilka części jednej sesji, bo Teams dzieli nagranie po 1,5 GB. Podniesienie limitu 1 GiB tylko po odczycie limitu globalnego i pomiarze skanu. Wczesny odczyt ftyp i moov w przeglądarce, żeby nie odrzucać gigabajta po uploadzie. Limit 10 GB na autora, wpisany dziś na sztywno w czterech miejscach RPC, staje się wartością konfigurowaną w bazie, z wyjątkiem dla redakcji, i dostaje komunikat, który da się wykonać. Inaczej kilka edycji i biblioteka zatrzymają upload.

Kotwice: `storage.buckets academy-materials; components/academy/MaterialUploader.tsx:63-65; lib/academy/resumable-upload.ts; docs/academy/clamav-operations.md; 20260922141927_academy_materials.sql:97; 20260922141941_academy_run_materials.sql:75; 20261005102329_academy_audio_handover.sql:30,63`

### B4.6 Nagranie edycji z terminem dostępności [M, migracja]

Materiał edycji z datą końca dostępności, widoczny dla potwierdzonych zapisów. Termin egzekwuje RLS, a fizyczne usunięcie pliku stoi za ACADEMY_MATERIAL_CLEANUP_ENABLED. Nie wchodzi do biblioteki, bo zawiera głosy uczestników. Parametry według decyzji właściciela.

Kotwice: `academy_material_catalog; academy_can_read_asset; academy_is_run_registered; academy_review_run_material; lib/academy/material-cleanup.ts:16-18; components/academy/RunMaterials.tsx:101`

### B4.7 Biblioteka IT (M10) [M, migracja]

Katalog: wyszukiwarka, temat, format (wideo, na żywo, materiały, test), najbliższe szkolenia. Materiał do pobrania to kurs z jedną lekcją, bez nowego modelu. academy_programmes łączy szkolenie na żywo z jego kursem z modułów.

Kotwice: `components/academy/CourseCatalog.tsx:55-96; components/academy/catalog/catalog-filters.ts; lib/actions/academy-discovery.ts:52; academy_programmes, courses.programme_id, courses.topic (nowe)`

### B4.8 Kurs dla nieobecnych jednym działaniem (M09) [M, migracja]

Z edycji powstaje szkic self_paced z tą samą pulą pytań i listą nieobecnych, moduły od prowadzącego jako lekcje. Niezależna akceptacja zostaje, raport liczy program raz przez academy_programmes z B4.7.

Kotwice: `academy_create_twin_course (nowe); lib/actions/courses-admin.ts; academy_webinar_attendance; components/learning/LessonPlayer.tsx; academy_programmes`

### B4.9 Import nagrania z Teams za przełącznikiem [L, decyzja]

Nowy rodzaj zadania workera, obsługa kilku części, transkrypt osobno. Wymaga OnlineMeetingRecording.Read.All i polityki dostępu, czyli decyzji właściciela. Do tego czasu ACADEMY_GRAPH_RECORDINGS_ENABLED wyłączone, testy na atrapie Graph, a w gotowości scenariusz oznaczony jako czekający na decyzję.

Kotwice: `lib/academy/integration-worker.ts:28; lib/graph/client.ts; .github/workflows/academy-graph-readiness.yml; docs/academy/graph-readiness.md`

### B4.10 Wsad próbny biblioteki [M, tresc]

Dwa kursy z prawdziwej treści, na przykład Cybersecurity i DORA, moduły 5-30 minut plus materiały, z is_rehearsal=false, więc po otwarciu zostają w katalogu. Pełna biblioteka to treść organizatora, warunek bramki startu.

Kotwice: `course_lessons; academy_material_catalog; docs/academy/storage-gate.md`

### B4.11 Próba generalna 4: nieobecny i biblioteka [S, proces]

Tester ogląda moduły na telefonie i komputerze, przerywa, wraca, zdaje test. Drugi tester szuka materiału w bibliotece bez wskazówek. Pomiar egress w panelu Supabase.

Kotwice: `e2e/academy-acceptance; Dashboard Supabase Usage`

**Warunki zakończenia:**

- G41-G48 przechodzą, ze zrzutem albo wynikiem i SHA; G48 w części na żywo oznaczony jako czekający na decyzję o uprawnieniu.
- Prawdziwy plik przeszedł normalizator, skan i odtworzenie na telefonie, a długie nagranie przetrwało zerwanie sieci.
- Nagranie edycji jest niedostępne po terminie i nie występuje w bibliotece.
- Zero wiadomości poza listą skrzynek właściciela.

## B5: Etap B5: certyfikaty, raporty, kokpit, powtórki i gotowość końcowa

25.02.2027 - 16.03.2027 · 12 dni pracy + 2 dni rezerwy, razem 14 dni roboczych

**Cel:** System jest kompletny i sprawdzony w całości, a właściciel ma listę tego, co musi być załatwione przed otwarciem.

**Wynik:** Wszystkie scenariusze przechodzą, przełączniki są wyłączone, blokada trybu open działa, a decyzja o starcie jest osobnym krokiem właściciela.

**Równolegle:** Niezależne: dokumenty (B5.1-B5.2), raporty (B5.3-B5.4), powtórki (B5.6), skrypt danych prób (B5.9). Kokpit (B5.5) po scaleniu B3. Skrypt testowany w ćwiczeniu odtworzenia (B5.8). Próba końcowa (B5.11) dopiero po wszystkich pozostałych.

### B5.1 Ważność i recertyfikacja [M, migracja]

Termin ważności w programie, snapshot certyfikatu z datą, numer cyklu zapisu samodzielnego, który otwiera drugie ukończenie mimo dzisiejszego indeksu unikalnego. Przypomnienie przed wygaśnięciem przez bramkę.

Kotwice: `academy_enrollment_self_paced (20260922141922:96); course_completions.certificate_snapshot; academy_private.finalize_enrollment; lib/pdf/certificate.ts; lib/actions/academy-certificates.ts`

### B5.2 Weryfikacja dokumentu za przełącznikiem [M, migracja]

Strona /v/[code] włączana przez właściciela dokumentu, bez wyniku, noindex, limit żądań, pokazuje unieważnienie i wygaśnięcie. Przy ACADEMY_PUBLIC_VERIFY_ENABLED wyłączonym 404, wyjątek tylko dla dokumentów kont próbnych z adresem na liście skrzynek właściciela.

Kotwice: `app/v/[code]/page.tsx (nowe); middleware.ts:42; lib/pdf/certificate.ts:114; components/academy/AcademyCertificatesPanel.tsx`

### B5.3 Raport edycji (M11) [M, kod]

Frekwencja, ankieta, wynik pierwszego podejścia, przyrost z pre-testu, certyfikaty i zaświadczenia osobno, tabela pytań z unieważnianiem, eksport CSV z audytem. Dane sprzed daty startu oznaczone jako próba.

Kotwice: `lib/academy/edition-summary-report.ts; components/academy/EditionSummary.tsx; components/academy/EditionSummaryDownload.tsx; lib/actions/audit.ts`

### B5.4 Raport menedżerski i raport kompetencji (M12) [M, migracja]

Menedżer widzi wyłącznie swój zespół biura, po manager_id, wymuszone w RPC. Konsultantów B2B w tym widoku nie ma. Raport kompetencji dla właściciela: osoba, program liczony raz, droga, data, ważność, bez oblanych prób i procentów, eksport z audytem. Grupowanie po kliencie tylko po decyzji.

Kotwice: `profiles.manager_id; academy_programmes; course_completions; app/(protected)/admin/learning/analytics/page.tsx; lib/actions/courses-analytics.ts; lib/actions/audit.ts`

### B5.5 Kokpit organizatora (V13) [L, kod]

Jedna oś edycji od T-21 do T+30: stan każdego kroku, stan kolejki wiadomości, zapisy, sprawy wymagające reakcji. Złożony z danych istniejących paneli, bez nowego modelu. Doręczalność tylko jeśli powstanie odczyt odbić.

Kotwice: `app/(protected)/learning/tworze/[id]/edycje/page.tsx; components/academy/sessions/AcademyRunList.tsx; academy_outbox; lib/academy/edition-summary.ts; lib/academy/operations-health.ts`

### B5.6 Powtórki (V15), za przełącznikiem [M, migracja]

Stały harmonogram D+14, D+45, D+90, po 3 pytania z puli, odpowiedź z wyjaśnieniem, wynik widzi tylko uczestnik. Dzwonek działa w pilocie, mail idzie przez bramkę.

Kotwice: `academy_retrieval_schedule (nowa); app/api/cron/academy-retrieval/route.ts (nowe); lib/audit/cron-heartbeat.ts; lib/academy/outbound.ts`

### B5.7 Porządki przed otwarciem [S, konfiguracja]

Harmonogram audit-log-retention, retencja nagrań, rzadsze tykanie workerów lub osobny wiersz stanu, pary start/done zostają.

Kotwice: `app/api/cron/audit-log-retention/route.ts; lib/audit/cron-heartbeat.ts; academy_operations_health`

### B5.8 Ćwiczenie odtworzenia bazy i plików [M, proces]

Pierwsze prawdziwe odtworzenie do odizolowanego środowiska, ustalone RPO i RTO. To odtworzone środowisko jest miejscem testu skryptu z B5.9. Bez narzędzi do pisania od nowa.

Kotwice: `ops/academy/restore; docs/academy/restore-drill.md`

### B5.9 Skrypt usuwania danych prób [M, migracja]

Jednorazowa migracja aplikowana przez właściciela, gotowa i nieuruchomiona. Musi obejść triggery niezmienności wersji i historii ukończeń, dlatego działa wyłącznie na wskazanej liście: kont source='proba', kursów-atrap i wierszy kolejki, które przechodzą w expired. Treść z is_rehearsal=false zostaje. Test na środowisku z B5.8.

Kotwice: `guard_version_snapshot (20260922141922:644); guard_completion_history (20260922141946:103); courses.is_rehearsal; academy_learner_accounts.source; academy_outbox`

### B5.10 Przegląd bezpieczeństwa całości [M, proces]

Agent security-reviewer po całym zakresie, ponowny test katalogu z B1.10 po nowych tabelach i RPC, test czytający źródło guardów. Przygotowanie zakresu dla zewnętrznego testu penetracyjnego z listy bramki.

Kotwice: `supabase/tests; lib/auth/internal-guard.ts; app/wejdz; app/v`

### B5.11 Próba generalna końcowa [M, proces]

Cały cykl docelowy na sucho na prawdziwej treści, wiadomości obejrzane w kolejce, testerzy bez pomocy, potem pełny bieg wszystkich scenariuszy i kontrola, że wszystkie przełączniki są wyłączone, a blokada open działa.

Kotwice: `e2e/academy-acceptance; app/(protected)/admin/learning/gotowosc/page.tsx; academy_outbox`

### B5.12 Pakiet startowy [S, tresc]

Kolejność włączania przełączników, migracja zdejmująca blokadę open (gotowa, nieaplikowana), plan wycofania, instrukcje dla organizatora, lista warunków bramki w panelu. To materiał do decyzji właściciela, bez jej podejmowania.

Kotwice: `docs/academy/ (runbook startu); app/(protected)/admin/learning/gotowosc/page.tsx; academy_launch_conditions`

**Warunki zakończenia:**

- G49-G57 przechodzą, a łącznie 57 z 57 na ważnym wyniku, poza scenariuszami świadomie oznaczonymi jako czekające na decyzję właściciela.
- Próba końcowa: tester, który nie budował, przeszedł cały cykl bez pomocy.
- Ćwiczenie odtworzenia wykonane, RPO i RTO zapisane, skrypt danych prób przetestowany na odtworzonym środowisku.
- Wszystkie przełączniki wyłączone, rollout closed lub pilot, tryb open zablokowany, 0 wiadomości poza listą skrzynek właściciela w całym okresie budowy, potwierdzone odczytem kolejki i logu.
- Lista bramki startu w panelu Gotowość z właścicielem każdego warunku.

## Scenariusze gotowości

| Id | Scenariusz | Etap |
|---|---|---|
| G01 | Automat, atrapa Graph: wywołanie każdego szablonu poczty Akademii przy domyślnych przełącznikach tworzy wiersz held, sendMail nie jest wołany, test czytający źródło zielony. | B0 |
| G02 | Automat, atrapa Graph: włączenie ACADEMY_MAIL_ENABLED przy N wierszach held wysyła 0; wysyłka wymaga zatwierdzonej paczki; wiersz po terminie zdarzenia ma status expired; błąd zapisu do kolejki oznacza brak wysyłki. | B0 |
| G03 | Ręczny: cron course-inactivity na nieaktywnym zapisie kursu próbnego: 0 wysłanych, wiersz held, para start/done w heartbeacie. | B0 |
| G04 | Ręczny: panel Gotowość pokazuje przełączniki wyłączone, blokadę open i wyniki z SHA; konto TCM i konto spoza redakcji dostają odmowę. | B0 |
| G05 | Ręczny: konto spoza redakcji i spoza pilota przy closed nie wejdzie na /learning i nie ma linku w menu. | B0 |
| G06 | Automat, SQL: academy_set_rollout odrzuca tryb open także adminowi i listę pilota ponad 20 kont; lokalnie na postgres:17, a na produkcji w transakcji z ROLLBACK wykonanej przez właściciela. Panel nie ma opcji open. | B0 |
| G07 | Ręczny: kurs próbny: TCM autor, właściciel recenzent bez edycji, sygnał w dzwonku w obie strony, wycofanie zgłoszenia, ponowne zgłoszenie, publikacja. | B0 |
| G08 | Ręczny: osoba z redakcji spoza autorów i recenzentów przechodzi kurs próbny od zapisu do poświadczenia w PDF. | B0 |
| G09 | Ręczny: MP4 około 1 GB bez głosów osób spoza redakcji przechodzi skan i parser, odtwarza się na telefonie, czas i pamięć zapisane. | B0 |
| G10 | Ręczny: 15-minutowe spotkanie Teams z gościem na prywatnym adresie właściciela: raport pobrany, odczyt, czy zawiera adres gościa, zapisany w panelu. | B0 |
| G11 | Ręczny: konto biurowe z listy pilota wchodzi przez SSO, ląduje w Akademii zamiast w archiwum i kończy kurs próbny. | B1 |
| G12 | Automat: przy wyłączonej przepustce token konta spoza prób daje 404 i nie zapisuje niczego. | B1 |
| G13 | Ręczny, telefon: przepustka konta próbnego na skrzynce właściciela: GET bez efektów, POST zakłada konto, sesja na telefonie, menu tylko Akademia, bez onboardingu z CV. | B1 |
| G14 | Automat: adresu spoza listy skrzynek właściciela nie da się użyć dla konta próbnego; aplikacja nie nadaje source='proba'; usunięcie adresu z listy odcina wejście przy następnej próbie. | B1 |
| G15 | Automat: konto nauki wywołuje akcję i trasę spoza Akademii i dostaje odmowę, test źródła klasyfikuje każdy plik, a test JWT po tabelach, widokach, funkcjach wykonywalnych i bucketach zgadza się z listą dozwolonych. | B1 |
| G16 | Automat: konto nauki nie występuje w eksporcie rosteru, listach ludzi ani mailingach, a eksport RODO je obejmuje. | B1 |
| G17 | Automat: ponowne wejście: skrzynka właściciela dostaje link 15 minut, a adres spoza tej listy przy wyłączonym przełączniku dostaje 404, 0 wiadomości i 0 wierszy. | B1 |
| G18 | Automat: automat tożsamości na sucho: raport nowych, wygasłych i konfliktów zawiera same liczby, 0 adresów w logu i audycie, 0 nowych wierszy i kont. | B1 |
| G19 | Ręczny: TCM buduje pulę 30 pytań z tagami, ustawia próg i losowanie 10, recenzent publikuje. | B2 |
| G20 | Automat: dwa konta dostają różne zestawy, odświeżenie zachowuje zestaw, odpowiedź po limicie czasu odrzucona w bazie. | B2 |
| G21 | Ręczny, telefon: autozapis po utracie sieci, czytelny blok kodu, licznik czasu z serwera. | B2 |
| G22 | Automat, SQL: unieważnienie pytania przelicza próby, domyka ukończenie i zostawia wpis audytu. | B2 |
| G23 | Automat: wynik pokazuje wyjaśnienia i tematy do powtórki; odpowiedź API przed wysłaniem nie zawiera klucza. | B2 |
| G24 | Ręczny: test poza kursem: publikacja, wpis w katalogu, zdanie, poświadczenie. | B2 |
| G25 | Automat: pre-test nie wpływa na zaliczenie ani limit podejść, a uczestnik widzi wynik per temat. | B2 |
| G26 | Automat, SQL i PDF: test edycji zamknięty przed końcem sesji; obecny bez testu dostaje zaświadczenie udziału, potem zdaje i dostaje certyfikat, a zaświadczenie zostaje w historii i nie daje nagrody. | B2 |
| G27 | Automat, SQL: klucz opublikowanej wersji widzą tylko autor i recenzent, wyniki osób z dostępem do klucza nie liczą się do raportów, analiza pytań podaje odsetek poprawnych i rozkład dystraktorów. | B2 |
| G28 | Ręczny, po decyzji właściciela: szkic AI z materiału redakcji trafia do puli tylko po zatwierdzeniu przez człowieka, z zapisem kto zatwierdził. | B2 |
| G29 | Automat: karta szkolenia: zapis, limit, lista rezerwowa, awans, rezygnacja, plik kalendarza; przycisk znika, gdy baza odmawia. | B3 |
| G30 | Ręczny: organizator wybiera adresatów edycji filtrami, widzi ich liczbę, wyklucza osobę, a system zapisuje kto i kiedy wybrał i tworzy wyłącznie wiersze held. | B3 |
| G31 | Ręczny: zaproszenia i przypomnienia T-21, T-7, T-1, T-1 h powstają jako held z podglądem; wysyłka testowa dociera wyłącznie na skrzynki właściciela u 5 dostawców. | B3 |
| G32 | Ręczny: prawdziwe 15-minutowe spotkanie Teams z gościem na prywatnym adresie właściciela: raport wczytany, wyjątki widoczne, organizator i prowadzący pominięci. | B3 |
| G33 | Automat: późna aktywacja: konto próbne założone po imporcie frekwencji dostaje obecność i materiały. | B3 |
| G34 | Ręczny: zamknięcie edycji na pliku około 100 syntetycznych wierszy z wyjątkami, liczba operacji organizatora zapisana i poniżej 30. | B3 |
| G35 | Ręczny: materiał edycji: upload, skan, akceptacja, dzwonek, widoczny tylko dla zapisanych tej edycji. | B3 |
| G36 | Ręczny: po zamknięciu działa ankieta edycji, raport frekwencji i dzwonek o dokumencie. | B3 |
| G37 | Ręczny: kolejna edycja z opublikowanego programu jednym formularzem, poprzednia edycja bez zmian. | B3 |
| G38 | Ręczny, po decyzji właściciela: TCM niebędący autorem otwiera kolejkę i zatwierdza kurs, edycję, materiał i pakiet; autor nie zatwierdzi własnej pozycji. | B3 |
| G39 | Ręczny: prowadzący z can_train wgrywa pakiet, TCM uzupełnia, niezależna osoba przyjmuje lub zwraca, a moduł bez podpisanych praw nie przechodzi. | B3 |
| G40 | Automat, atrapa Graph: tor Teams z konta organizatora: przy wyłączonym przełączniku zadanie nie powstaje, na atrapie przechodzi cały przebieg, wymagane uprawnienia spisane w panelu; część na żywo po decyzji właściciela. | B3 |
| G41 | Ręczny: wznowienie nagrania od sekundy na innym urządzeniu, 90% zalicza moduł, zerwanie sieci nie kończy seansu. | B4 |
| G42 | Ręczny: rozdziały: dodanie w edytorze, przeskok kliknięciem, napisy VTT działają. | B4 |
| G43 | Ręczny: nagranie z kilku części działa jako jedna sesja, a postęp liczy się po całości. | B4 |
| G44 | Automat: upload ponad limit autora daje odmowę z komunikatem, który da się wykonać, a zmiana limitu w bazie odblokowuje upload. | B4 |
| G45 | Automat: nagranie edycji widoczne tylko dla zapisanych, po terminie niedostępne i poza biblioteką. | B4 |
| G46 | Ręczny: kurs dla nieobecnych powstaje z edycji jednym działaniem, z tą samą pulą, a raport liczy program raz. | B4 |
| G47 | Ręczny: biblioteka: wyszukiwarka, temat i format, materiały do pobrania, konto biura i konto nauki widzą tę samą treść. | B4 |
| G48 | Automat, atrapa Graph: import nagrania z Teams: przy wyłączonym przełączniku zadanie nie powstaje, na atrapie przechodzi także kilka części; część na żywo po decyzji o uprawnieniu. | B4 |
| G49 | Automat: weryfikacja dokumentu: wyłączona daje 404, w trybie testowym bez wyniku, widać unieważnienie i wygaśnięcie. | B5 |
| G50 | Automat, SQL: przypomnienie przed wygaśnięciem powstaje jako held; po terminie ważności kurs samodzielny zaliczony drugi raz, stary dokument zostaje w historii. | B5 |
| G51 | Automat: menedżer widzi tylko swój zespół biura, bez konsultantów, obcy RPC odmawia; eksport raportu kompetencji zostawia wpis audytu. | B5 |
| G52 | Ręczny: raport edycji: zdawalność, przyrost z pre-testu, certyfikaty i zaświadczenia osobno, analiza pytań, dane sprzed daty startu oznaczone jako próba. | B5 |
| G53 | Ręczny: kokpit pokazuje pełną oś jednej edycji, stan kolejki i sprawy do reakcji. | B5 |
| G54 | Automat: powtórka D+14 w dzwonku, mail jako held, wynik widzi tylko uczestnik. | B5 |
| G55 | Ręczny: odtworzenie bazy i plików do odizolowanego środowiska, RPO i RTO zapisane, skrypt danych prób wykonany na tej kopii bez naruszenia treści właściwej. | B5 |
| G56 | Ręczny: tester, który nie budował, przechodzi cały cykl docelowy bez pomocy. | B5 |
| G57 | Automat i odczyt: bieg całości przy domyślnych przełącznikach: 0 wiadomości poza listą, 0 nowych uprawnień Graph, rollout closed lub pilot, tryb open odrzucany przez bazę. | B5 |

## Bramka startu

- **Zadanie bezpieczeństwa z Etapu 0: potwierdzenie zamknięcia i przekazania wyniku IOD (samo przekazanie należy do B0.1)** (właściciel). Otwarcie obejmuje osoby spoza firmy na produkcji z danymi kadrowymi.
- **57 scenariuszy z ważnym wynikiem** (właściciel). To jedyny dowód, że system działa, a nie że powstał.
- **RODO: rejestr czynności, test równowagi, ocena potrzeby DPIA, retencja wyników i frekwencji** (IOD). Nowa kategoria danych na prywatnych adresach konsultantów.
- **Klauzula art. 13/14 i regulamin Akademii dla kont nauki** (prawnik, IOD). Obecny regulamin wymaga adresu firmowego, a tekst na ekranie wejścia jest roboczy.
- **Podstawa wysyłki do osób, które nie zapisały się na konkretne szkolenie** (prawnik). Zaproszenia i powtórki trafiają też na prywatne skrzynki.
- **Nagrywanie, transkrypcja i retencja nagrań** (prawnik, IOD). Głosy i wizerunek uczestników.
- **Ocena ryzyka przekwalifikowania B2B przy raportach i obowiązkowych szkoleniach** (prawnik). Od tego zależy, czy raport może objąć konsultantów.
- **Doręczalność: SPF, DKIM, DMARC, wartość MAIL_FROM, wysyłka testowa u 5 dostawców i pomiar, czy no-reply z Teams trafia do spamu** (właściciel). Bez tego zaproszenia wpadną do spamu albo nie dojdą.
- **Skrzynka nadawcza Akademii: licencja, RAOP, smoke na jednej skrzynce** (właściciel). Tenant wymaga jawnego przypisania roli w Exchange dla każdej nowej operacji.
- **Zewnętrzny test penetracyjny z kontem nauki i bez konta** (właściciel). Kod sprawdza jedna osoba i jej agenci, a otwarcie dotyczy około 500 osób.
- **Treść startowa: kursy z prawdziwą zawartością, nie pusty katalog** (organizator). Pierwsze wejście do pustej biblioteki kosztuje drugie.
- **Prawa autorskie: przeniesienie praw od prowadzących, brak slajdów producentów, znaki Pega i SAFe** (organizator, prawnik). Bez podpisu moduł nie może być publikowany.
- **Adres konsultantów ustalony i obecny w eksporcie NEXUSA** (właściciel). Adres z ATS może być nieaktualny, a na nim opiera się konto nauki.
- **Zastępstwo recenzenta** (właściciel). Dziś jeden człowiek zatrzymuje każdą publikację.
- **Uprawnienia Graph, jeśli frekwencja i nagrania mają wpływać automatycznie** (właściciel). Tor jest zbudowany, ale nigdy nie działał na żywo.
- **Test obciążeniowy wejścia z linku, około 40 kliknięć na minutę** (osoba techniczna). Limit weryfikacji po IP może zadziałać przy wysyłce do większej grupy.
- **Usunięcie danych prób skryptem przetestowanym w ćwiczeniu odtworzenia, wygaszenie całej kolejki held, kolejność włączania przełączników, plan wycofania** (osoba techniczna). Pierwsze otwarcie musi dać się cofnąć jednym krokiem i nie może wysłać niczego z okresu prób.
- **Migracja zdejmująca blokadę trybu open, aplikowana przez właściciela jako ostatni krok** (właściciel). Otwarcie ma być świadomą operacją na bazie, a nie jednym kliknięciem w panelu.

## Co wyciąć, zamrozić, ukryć

- **wytnij**: Logika „dowód użycia przed budową”, bramki 26.11, 23.12 i 30.06, fale kontaktu. Cel to gotowy system. Otwarcie jest jedną, osobną decyzją.
- **wytnij**: Ścieżki awaryjne SharePoint i Microsoft Forms. Istniały na wypadek, gdyby konta nie ruszyły przed konkretnym szkoleniem.
- **wytnij**: CSV z linkami do korespondencji w Wordzie. Zastępuje go kolejka wiadomości, która nie tworzy pliku z poświadczeniami logowania.
- **ukryj**: Eksport listy do korespondencji (academy_export_webinar_mailing_list). Czyta puste contractors.email; zostaje w kodzie bez przycisku, do decyzji po otwarciu.
- **ukryj**: League, punkty, nagrody autorów, streak, toast punktów. Wyłączyć 6 reguł i wywołanie; nie jest potrzebne do weryfikacji wiedzy.
- **zostaw**: Kolumny streaka w profiles. Migracja na produkcji bez zysku.
- **ukryj**: Rekomendacje i ścieżki nauki. learning_paths=0 i brak edytora. Ukrycie w B0.10; biblioteka z tematami pokrywa potrzebę, wracają przy większym katalogu.
- **ukryj**: Drip lekcji. Schowany w edytorze w B0.10, schemat zostaje.
- **zamroz**: Cztery paginatory w Moich szkoleniach. Działają, przy tej skali bez przebudowy.
- **wytnij**: LinkedInShareButton. 0 importów. Udostępnianie to link weryfikacji z B5.
- **wytnij**: Ścieżka legacy: UI i akcje. Warunek martwy, tylko warstwa aplikacji.
- **zostaw**: Legacy w SQL: 16 funkcji i 2 polityki. Przepisywanie na produkcji bez stagingu nic nie daje.
- **zostaw**: Token submission_id. Chroni przed wyścigiem decyzji, zwłaszcza przy większej liczbie recenzentów.
- **zostaw**: Niezależna akceptacja w SQL. Działa i pozostaje. Rozszerzenie na TCM to decyzja, a nie jej wycięcie.
- **zamroz**: Pakiet przekazania z rejestrem praw. Bez rozbudowy, ale z jednym przebiegiem sprawdzającym w B3.13, bo nigdy nie zadziałał.
- **zostaw**: Spotkania zarządzane i panel organizatorów Teams. Kod istnieje za ACADEMY_TEAMS_ENABLED; bez nowych prac poza spisaniem wymagań.
- **zostaw**: Import CSV listy i frekwencji. Domyślny tor bez nowych uprawnień Graph.
- **zamroz**: Ręczna weryfikacja adresu academy_verify_webinar_contractual_email. Tylko przypadki sporne, główna droga to automat z migawki.
- **zostaw**: contractors jako podstawa dostępu do Akademii. Moduł zostaje dla People Ops, Akademia go nie używa.
- **zostaw**: Tryb pilot i lista UUID w rollout. Jedyny bezpieczny sposób pracy na produkcji bez stagingu, od B0.4 z limitem 20 kont.
- **zamroz**: ClamAV, parser MP4, aparat gotowości infrastruktury. Działają, bez rozbudowy poza długimi plikami.
- **zostaw**: Dwie trasy raportu analitycznego. Dla TCM druga jest jedynym dostępem.
- **zamroz**: Trzy instrumenty opinii. Ankieta edycji jest główna, scalenie gwiazdek i NPS dopiero po przepięciu avg_rating.
- **wytnij**: Nieużywane RPC get_quiz_for_attempt i submit_quiz_attempt. Martwe, schodzą przy migracji B2.1.
- **zostaw**: Nagrody i mnożnik autora w finalize_enrollment. Pojedyncza transakcja jest celowa.
- **wytnij**: Nagranie z głosami uczestników jako pozycja biblioteki lub wejście dla AI. Biblioteka to moduły prowadzących; nagranie jest materiałem jednej edycji.
- **wytnij**: Osobny model Assessment obok course_quiz_*. Wszystko pokrywa rozszerzenie istniejących tabel i typ kursu assessment.
- **wytnij**: Certyfikat za samą obecność. Zastępuje go zaświadczenie udziału, osobny dokument poza historią ukończeń.
- **zamroz**: Wielokrotny wybór, odpowiedzi otwarte, zadania praktyczne z oceną człowieka. Jednokrotny wybór i scenariusz z kodem wystarczają do gotowego systemu; reszta zmienia punktację.
- **zamroz**: Punkty kontrolne w wideo, tutor AI, wyszukiwanie w treści, klipy. Postęp i rozdziały wracają do zakresu, te pozycje nie są potrzebne do gotowego systemu.
- **zamroz**: HLS, własne transkodowanie, zewnętrzny hosting wideo. Koszt realistycznie 0 USD; próg po otwarciu: skargi z telefonów, biblioteka ponad 20 h lub ponad 100 aktywnych widzów.
- **zamroz**: Portal NEXUS jako drzwi do Akademii. Wymaga uzgodnienia jednego adresu, konto nauki działa bez tego.
- **zamroz**: Edycja archiwalna wstecz (szkolenia sprzed systemu). Zbędna do gotowego systemu, wraca tylko, jeśli właściciel zechce wprowadzić historyczne szkolenia.
- **zamroz**: Przełączenie rollout na open. Zablokowane w bazie i usunięte z panelu w B0.4. Zdjęcie blokady należy do bramki startu.

## Czego nie budować

- SCORM, xAPI, cmi5, LRS, chyba że pojawi się płatna biblioteka albo wymóg klienta; wtedy gotowy runtime
- Portal klienta, fora, odznaki, sklep, multi-tenant, autorski edytor typu Articulate
- DRM i własny proctoring (kamera, wykrywanie zmiany karty); nie zatrzymają modelu językowego i kosztują zgody RODO
- Tworzenie webinarów przez Graph (tylko delegowane) i webhooki nagrań; do importu wystarczy zadanie workera
- IRT, korelacja punktowo-biseryjna przy tych liczebnościach, testy adaptacyjne, FSRS i SM-2, certainty-based marking
- Ocenianie ludzi przez AI, w tym odpowiedzi otwartych bez człowieka
- Grupa kontrolna bez powtórek i obietnica skuteczności przy tej skali
- Strona z tokenem bez konta jako druga tożsamość; przepustka zawsze prowadzi do prawdziwego konta
- Równoległy bank pytań i kohorty obok course_quiz_*
- Losowa obrona, po której link u klienta pokazuje „nieważny”, i publikowanie wyników obron
- „Certyfikat zgodności z DORA” i teza, że art. 30 ust. 2 lit. i tworzy popyt na certyfikat dostawcy
- Obowiązkowe przypisania i raport do przełożonego o konsultantach B2B bez oceny prawnej lub wymogu umowy z klientem; raport menedżerski dotyczy wyłącznie zespołów biura
- Wyniki oblane i pojedyncze odpowiedzi w sprzedaży, NEXUSIE lub ATLASIE; agregaty per klient bez minimalnej liczności
- Transkrypty z głosami uczestników w embeddingach, u asystenta lub w bazie wiedzy
- Przedłużanie ważności certyfikatu krótką falą 3-5 pytań z linku
- Włączanie wysyłki przyciskiem w aplikacji; przełączniki zmienia się tylko w vault. Zatwierdzenie paczki w aplikacji to inny krok: bez włączonego przełącznika jest nieaktywne i niczego nie wysyła
- Transkodowanie na hoście CAX21

## Co zostaje bez zmian

- Ocenianie wyłącznie po stronie bazy, brak is_correct w academy_get_quiz, RLS opcji tylko dla edytorów
- Wersjonowanie i niezmienność opublikowanych wersji, z dodanym unieważnieniem pytania
- Idempotentne ukończenia i snapshot certyfikatu
- Zapis z listą rezerwową i ekran „Co pozostaje do ukończenia”
- Bramka domeny w /auth/callback jako ochrona SSO, bez zmian
- Edycja, sesje external_link, import listy i frekwencji
- Prywatna lista edycji dla osób bez konta (academy_webinar_roster)
- RunMaterials i widoczność materiału tylko dla potwierdzonych zapisów
- Ankieta edycji i raport edition-summary-report
- MaterialUploader, skaner ClamAV i workery
- Mp4StreamValidator jako bramka dla każdego pliku
- Eksport kalendarza lib/academy/calendar.ts
- Kontrakt runAction i ExpectedError, selectInChunks i requireRows w nowych akcjach
- Klient lib/graph/client.ts, bez własnego Client.init()
- Migracje jako pliki z samosprawdzeniem, aplikuje właściciel, nigdy supabase db push
- Tryb pilot w rollout jako jedyny sposób pracy na produkcji bez stagingu

## Decyzje otwarte (do odpowiedzi obowiązuje rekomendacja)

- 13.11.2026: **Ile czasu właściciel rezerwuje na Akademię i co ma pierwszeństwo: data czy zakres?** Rekomendacja: Pierwszeństwo przed rozwojem NEXUSA, NEXUS tylko awarie i drobne zmiany; pełny zakres, koniec 16.03.2027 z rezerwą (24.02.2027 bez rezerwy)
- 13.11.2026: **Kto korzysta z dwóch kont consultant w próbach?** Rekomendacja: Właściciel wskazuje po jednej osobie do każdego konta, o ile da się na nie zalogować
- 18.12.2026: **Kto poza właścicielem może zatwierdzać kursy, edycje i materiały?** Rekomendacja: TCM jako niezależny recenzent, z zachowaniem zasady czterech oczu (B3.10)
- 04.12.2026: **Jaki adres jest kluczem konta nauki konsultanta?** Rekomendacja: contracts.candidate_email dopisany do eksportu NEXUSA, wdrożony po rejestrze czynności
- 04.12.2026: **Jak długo konsultant ma dostęp po końcu umowy?** Rekomendacja: 60 dni jak w portalu NEXUS, dokument zostaje
- 18.12.2026: **Czy treści prowadzących mogą być przekazywane do Claude'a na szkice pytań?** Rekomendacja: Tak, tylko materiały bez głosów uczestników, za zgodą prowadzącego zapisaną przy materiale
- 15.01.2027: **Kto widzi nagranie edycji i jak długo?** Rekomendacja: Tylko potwierdzeni zapisani tej edycji, najdłużej 90 dni; archiwum z datą usunięcia po 12 miesiącach; nigdy w bibliotece
- 15.01.2027: **Czy i kiedy nadać nowe uprawnienia Graph (nagrania, transkrypty, frekwencja)?** Rekomendacja: Budować za przełącznikiem, uprawnień nie nadawać przed bramką startu
- 12.02.2027: **Jaki domyślny okres ważności mają dokumenty?** Rekomendacja: 12 miesięcy dla tematów regulacyjnych (DORA, cyberbezpieczeństwo), bez terminu dla pozostałych; ustawiane per program
- 12.02.2027: **Jaki jest zakres raportu kompetencji i grupowania po kliencie?** Rekomendacja: Raport menedżerski tylko dla zespołów biura; raport kompetencji dla właściciela, grupowanie po kliencie włączane dopiero po opinii prawnika
- nie wcześniej niż po 16.03.2027, przegląd listy do 26.03.2027: **Czy, kiedy i dla kogo otwieramy Akademię?** Rekomendacja: Osobna decyzja po zamknięciu listy bramki startu; pierwszy krok to mały pilot, najpierw biuro przez SSO albo kilkanaście osób z jednego szkolenia

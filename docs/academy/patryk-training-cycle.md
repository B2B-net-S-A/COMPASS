# Cykl szkoleń Patryka — wymagania i odbiór

Źródło: wymagania cyklu szkoleniowego przekazane przez użytkownika 05.10.2026.
Bieżąca dokumentacja publiczna pomija szczegóły personalne i finansowe
oraz identyfikatory rekordów. Szczegółowy pakiet odbioru jest zapisany
lokalnie poza repozytorium; ta zmiana nie przepisuje historii Git.
Stan początkowy przed implementacją: produkcja `da306f8318b93ceb7c7e857d9d1d37ee2d68f597`,
rollout `closed`, 0 kont pilota, 0 edycji, 0 terminów, 0 materiałów,
0 zapisów. Istniejący kurs testowy nie jest konfiguracją tego cyklu.

## Cel

Doprowadzić Akademię Compass do obsługi całego cyklu opisanego w mailu,
na obecnych licencjach i infrastrukturze, bez dodatkowych kosztów.
Pierwszeństwo ma Cybersecurity 07.10.2026 o 18:00 (Europe/Warsaw).
Zachować istniejący webinar Teams, 96 istniejących zapisów i korespondencję
Patryka. Ukończenie wymaga wdrożenia i rzeczywistego odbioru procesu,
nie tylko zielonego CI.

## Harmonogram do konfiguracji

| Szkolenie | Obsada | Termin | Stan według wymagań |
| --- | --- | --- | --- |
| Cybersecurity / bezpieczeństwo AI i LLM | Wskazana przez organizatora | Termin i webinar w prywatnym pakiecie | Gotowe; istniejące zapisy w Teams |
| DORA | Wskazana przez organizatora | Termin w prywatnym pakiecie; godzina do ustalenia | Gotowe |
| PEGA | Wskazana przez organizatora | Termin w prywatnym pakiecie; godzina do ustalenia | W przygotowaniu |
| SAFe | Wskazana przez organizatora | Termin w prywatnym pakiecie; godzina do ustalenia | W przygotowaniu; zakres wymaga dopasowania do doświadczonych konsultantów |

Każde szkolenie: około 3 godzin live i ćwiczenia. Nie przyjmować
niepotwierdzonej godziny zakończenia ani nieznanej polityki obecności jako
ostatecznej. Daty z tabeli maila mają pierwszeństwo przed ogólną sugestią
odstępów trzytygodniowych. PEGA i Cybersecurity mogą mieć kolejne edycje
kwartalne; proponowane tematy PEGA nie są jeszcze zatwierdzonym programem.

## Mapa wymagań

| Wymaganie | Dostępna podstawa | Warunek odbioru |
| --- | --- | --- |
| Uczestnik, prowadzący i niezależny administrator | Uprawnienie prowadzącego, wersje kursu i moderacja | Wskazane konta przechodzą cały proces; prowadzący nie publikuje własnych materiałów |
| Istniejący webinar i prowadzący zewnętrzny | Edycje, terminy, link zewnętrzny, kalendarz | Zachowany dokładny link webinaru; żadnego zastępczego zwykłego spotkania ani ponownego zapisu uczestników |
| 96 zapisów z Teams | Wdrożony import CSV/TSV z podglądem i zatwierdzeniem administratora | Dopasowanie po potwierdzonej tożsamości, jawne wyjątki, uczestnicy bez Compass na prywatnej liście, ponowienie bez duplikatów |
| Frekwencja | Wdrożony import raportu Teams; ręczne decyzje są zachowane | Import raportu istniejącego webinaru po zajęciach, podgląd i potwierdzenie, właściwa edycja i termin, zachowanie ręcznych decyzji |
| Prezentacja, materiały i ćwiczenia | Prywatne pliki PDF/PPTX/DOCX, skanowanie i moderacja | Komplet plików, wspólny layout zweryfikowany przez administratora, niezależna akceptacja |
| Niezależne nagrania modułowe | Lekcje MP4 z postępem; materiały edycji | Uporządkowana biblioteka modułów przygotowanych niezależnie od live, ustaleni odbiorcy i zasady dostępu |
| Osobny plik audio | Wdrożony upload MP3/M4A, walidacja, skanowanie i prywatny odtwarzacz | Upload, pełna walidacja, skanowanie, niezależna akceptacja i odsłuch z prywatnego Storage |
| Pliki montażowe i przekazanie praw | Wdrożony prywatny rejestr odnośników i daty podpisania | Prywatny rejestr źródeł na istniejącym wspólnym dysku, dokument praw, data i zakres; administrator potwierdza dowody |
| Odbiór pakietu po live | Wdrożona checklista pięciu kategorii, przyjęcie lub zwrot przez niezależnego administratora | Lista kompletności, przesłanie do odbioru, przyjęcie lub zwrot z powodem; żadnego fikcyjnego odbioru |
| Dedykowana ankieta każdej edycji | Wdrożona konfiguracja i odpowiedzi dla konkretnej edycji | Ocena szkolenia, prowadzącego, materiałów, trudności, przyszłe tematy, zainteresowanie prowadzeniem; dostęp po zweryfikowanej obecności |
| Zaproszenia i przypomnienia | Wdrożony eksport CSV do Worda z kontrolą umownych adresów | Eksport do Worda na umowne adresy B2B, kontrola odbiorców; panel nie wysyła dodatkowej korespondencji |
| Zasoby organizacyjne | Obecne pliki Patryka | Wskazana wspólna lokalizacja grafik, treści maili i prezentacji; zweryfikowany dostęp właściwych osób |
| Kolejne edycje | Model wielu edycji kursu | Nowa edycja zachowuje wcześniejsze zapisy, frekwencję, ankiety i zatwierdzoną wersję programu |

Teams pozostaje miejscem prowadzenia webinaru: Q&A, moderacja czatu,
prezentacje, udzielanie głosu, mikrofony/kamery, nagranie i ankiety podczas
spotkania. Te funkcje nie są deklaracją integracji lub sterowania z Compass.
Według maila obecna licencja wystarcza. Nie podnosić licencji i nie dodawać
nowych płatnych usług. Przypomnienie w aplikacji nie zastępuje korespondencji
seryjnej z imiennej skrzynki.

## Dane wymagane do rzeczywistego uruchomienia

1. Eksport 96 zapisów i dokładny link webinaru Cybersecurity.
2. Wskazane konta organizatora, prowadzących, niezależnego administratora
   i uczestnika odbioru; potwierdzony zakres ich dostępu.
3. Folder na istniejącym wspólnym dysku oraz rzeczywiste materiały
   i dokumenty przekazania praw, kiedy zostaną dostarczone.
4. Godziny DORA, PEGA i SAFe, zatwierdzone programy, polityka obecności
   i odbiorcy biblioteki nagrań.

Nie tworzyć kont ani nie nadawać uprawnień na podstawie samego imienia
i nazwiska. Nie publikować zmyślonych materiałów, programów ani frekwencji.

## Kryteria techniczne i biznesowe

- Import przechowuje podgląd i dowód źródła. Nie dopasowuje automatycznie
  po samym nazwisku. Wyjątki i powtórzenia są widoczne przed zapisem.
- Lista webinaru i zapisy Compass liczą tę samą osobę raz; uczestnicy bez
  konta rezerwują miejsce. Współbieżny zapis nie przekracza pojemności.
- Materiały oraz dane kontaktowe są prywatne. Źródła montażowe i dokument
  praw są dostępne wyłącznie uprawnionym osobom, nie wszystkim uczestnikom.
- Nowe dane obejmują eksport i obsługę żądania usunięcia danych w ramach
  istniejącego procesu; nie włączać automatycznego kasowania produkcji.
- Wymagane CI obejmuje nowe migracje, autoryzację i istotne przypadki
  importu. Lokalne sprawdzenia są natywne; bez lokalnego Docker.
- PR scalony po zielonym CI, jawne migracje, normalny deploy, zgodny SHA
  w `/api/health`, następnie prawdziwy proces w Chrome dla wskazanych ról.
- Materiały przekazywane po live nie są wymagane do wcześniejszego
  zaplanowania webinaru. Ich faktyczny odbiór pozostaje otwarty do dostawy.

## Kwoty w mailu

Podsumowania kolumn są niespójne z wartościami wierszy. Zdanie o zakresie
kosztu materiałów także wymaga wyjaśnienia, ponieważ tabela osobno wykazuje
live. Szczegółowe kwoty są zachowane w prywatnym pakiecie odbioru.
To ustalenia biznesowe do potwierdzenia, nie zatwierdzenie wydatku ani nowy
koszt panelu.
Aktualny goal nie obejmuje budowy osobnego modułu rozliczeń szkoleniowców.

## Postęp konfiguracji 05.10.2026

W rzeczywistym Chrome administratora zapisano cztery nieopublikowane szkice
firmowe (`live`, 180 minut orientacyjnie), z potwierdzonym odczytem bazy:

Cybersecurity, DORA, PEGA i SAFe. Identyfikatory rzeczywistych rekordów
są zapisane w prywatnym pakiecie odbioru.

Nazwy prowadzących i planowane daty zapisano w opisach. Nie przypisano
niepotwierdzonych kont, nie opublikowano programów ani edycji i nie wysłano
korespondencji. Domyślny poziom i próg obecności pozostają robocze;
opisy jawnie wymagają ich zatwierdzenia przed publikacją. To konfiguracja
szkiców, nie zakończony odbiór tych szkoleń.

Dodatkowa zależność importu od `contractors` została zweryfikowana wyłącznie
w katalogu produkcji: `id uuid NOT NULL PRIMARY KEY`, nullable `email text`,
nullable `profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL`.
Hosted fixture odtwarza tylko te kolumny po bazowym kontrakcie Akademii.
Nie kopiuje kartotek kontraktorów ani nie deklaruje odtworzenia całego HR.

## Wdrożenie i migracje — potwierdzone 05.10.2026

Implementacja została scalona w [PR #435](https://github.com/B2B-net-S-A/COMPASS/pull/435),
commit `e8b96aa850217cf58f83aceb14b734b07f0c1711`.
[CI main](https://github.com/B2B-net-S-A/COMPASS/actions/runs/37294503261),
[Storage i restore](https://github.com/B2B-net-S-A/COMPASS/actions/runs/37294503439),
[malware gate](https://github.com/B2B-net-S-A/COMPASS/actions/runs/37294503194)
oraz [deploy](https://github.com/B2B-net-S-A/COMPASS/actions/runs/37295332792)
zakończyły się sukcesem. Produkcyjne `/api/health` zwróciło `healthy`,
dokładny powyższy SHA i `deployedAt=2026-10-05T10:14:57Z`.

Po deployu i smoke teście zastosowano cztery jawne migracje. Poniższe wersje
pochodzą z rzeczywistego rejestru produkcji; nazwy plików wyrównano do niego
bez zmiany SQL i bez ponownego wykonania migracji. SHA-256 plików odpowiada
SHA-256 znormalizowanej treści `statements` w rejestrze (`btrim` usuwa jedynie
zewnętrzne białe znaki). Nie uruchamiano `db push` ani zbiorczej naprawy historii.

| Wersja | Nazwa | SHA-256 SQL |
| --- | --- | --- |
| `20261005102329` | `academy_audio_handover` | `54e3e51e1ec383b09956995c931e13544a1a51a8560e70ce27f1702bd32f059e` |
| `20261005102339` | `academy_webinar_import` | `21ef207bbfaab7a2dd42ac9c42fd644cdde0c57bc910afd810971f7fb718ef3f` |
| `20261005102340` | `academy_edition_surveys` | `32ed238e58aa60769b0b4cc9563fcacc314056c697a8630f7c09df85446a243f` |
| `20261005102341` | `academy_cycle_gdpr_export` | `d0fadd4a4f67c68f12aa421f99a876083854ca8c94af4c60781ee60ba0b9d78c` |

W produkcji istnieje siedem nowych tabel: prywatne deklaracje zainteresowania
prowadzeniem, ustawienia i odpowiedzi ankiet edycji, odbiory pakietów oraz
lista, podglądy importu i frekwencja webinaru. Każda ma włączone RLS;
anon nie ma SELECT, a authenticated nie ma bezpośredniego INSERT/UPDATE/DELETE.
Eksport prywatnego zainteresowania prowadzeniem jest dostępny wyłącznie
service role w istniejącym, uprawnionym procesie GDPR. Bucket materiałów
pozostaje prywatny. Guard `run_id IS NULL` dla załączników lekcji zachowany.

Hosted CI sprawdziło rzeczywiste wyścigi dwóch sesji PostgreSQL przy imporcie
i ostatnim wolnym miejscu (60 przypadków importu), 107 przypadków Auth/Storage
oraz odtworzenie 46 tabel z niepustymi świadkami wszystkich nowych tabel.
Po `pg_restore` zachowano 268 obiektów z uprawnieniami aplikacji, przed grantami
pomocniczymi. To dowód z izolowanych danych testowych, nie import rzeczywistych
uczestników ani odbiór całego cyklu na produkcji.

Security Advisor nadal pokazuje ostrzeżenia wymagające właściwej interpretacji:
dwie nowe tabele celowo mają RLS bez polityk klienta (service/RPC-only),
a 14 nowych wystąpień dotyczy funkcji SECURITY DEFINER z EXECUTE dla authenticated.
Te funkcje mają własne sprawdzenia ról i zakresu; testy obejmują odmowę
nieuprawnionych operacji. Nie deklarować braku ostrzeżeń ani traktować samego
advisora jako dowodu poprawności uprawnień.

## Rzeczywisty odbiór pozostaje otwarty

W Chrome administratora potwierdzono renderowanie checklisty pięciu kategorii,
pól źródeł montażowych i praw oraz podglądu uczestnika. Podgląd nie tworzy
zapisu, postępu ani certyfikatu. Tworzenie edycji jest prawidłowo niedostępne
przed zatwierdzeniem programu. Nie utworzono zastępczego webinaru ani fikcyjnej
lekcji. Cztery kursy pozostają szkicami, każdy z 0 lekcji, 0 edycji i 0 materiałów.
Lista importu, odbiory pakietów i ustawienia ankiet są puste; rollout `closed`,
0 kont pilota. Nie przyjęto pakietu, nie potwierdzono praw ani frekwencji.

Biblioteka modułów wymaga ustalenia odbiorców. Materiały edycji dostarczone po
live mogą trafić do wcześniejszych uczestników po akceptacji, lecz lista plików
nie daje osobnego postępu modułów. Lekcje i postęp są związane z zatwierdzoną
wersją: dodanie nowej wersji po live nie aktualizuje wcześniejszych zapisów.
Dostęp dla konsultantów bez udziału w live wymaga osobnego kursu do nauki
własnej i jawnych zasad dostępu. Nie publikować pustej biblioteki jako ukończonej.

Do końcowego odbioru potrzebne są rzeczywiste dane i konta wymienione powyżej,
proces prowadzący → niezależny administrator → uczestnik oraz dostawa pakietów
po szkoleniach. Rejestr dowodów praw nie zastępuje zawarcia umowy o ich przekazaniu.
Nie uruchomiono nowych płatnych usług ani zmiany licencji.

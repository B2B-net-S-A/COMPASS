# Raport edycji szkolenia

Obsługa Akademii (admin i TCM) widzi „Raport edycji” na istniejącej stronie
`/learning/edycje/[id]` i może pobrać plik TXT albo CSV. Raport korzysta z obecnych
RPC listy edycji, uczestników Compass, prywatnego rosteru webinaru i ankiety oraz
z tabel testu czytanych sesją użytkownika, więc o zakresie nadal decyduje RLS.
Nie wymaga nowej usługi, migracji ani uprawnienia.

Eksport CSV zawiera wyłącznie sumy i treść pytań, bez nazwisk i adresów. Powstaje
na serwerze i bez zapisanego wpisu `ACADEMY_EDITION_REPORT_EXPORTED` w dzienniku
audytu nie zostaje wydany.

Części zależne od późniejszych migracji mówią „czeka na migrację”, a nie „0”:
pre-test (`course_quiz_attempts.kind`), zaświadczenia udziału
(`academy_participation_documents`), unieważnianie pytań
(`course_quiz_questions.voided_at`; przycisk dochodzi z RPC zadania B2.3).
Dane bez daty startu raportów (`academy_rollout_settings.reports_start_at`, B0.6),
sprzed niej albo z kursu `is_rehearsal` mają etykietę „Próba”.

Wynik pierwszego podejścia to najwcześniejsza próba `final` danej osoby. Analiza
pytań liczy tylko te próby. Certyfikaty to nieunieważnione ukończenia potwierdzonych
zapisów. Obecna jest osoba z progiem spełnionym na każdym aktywnym wymaganym
spotkaniu; dopóki któregoś okna nie potwierdzono, liczba obecnych jest nieustalona.

Potwierdzony zapis Compass i powiązany wpis webinaru są jedną osobą.
Powiązanie wynika z identyfikatora konta, a nie podobieństwa nazwiska lub
adresu. Osoby bez konta zachowują identyfikator prywatnego rosteru.
Niespójność liczby zapisów albo rezerwy przerywa raportowanie i eksport;
błędu pobierania nie przedstawiamy jako zerowego wyniku.

Frekwencję pokazujemy osobno dla każdego aktywnego spotkania, po potwierdzeniu
zakończonego rzeczywistego okna zajęć. Kanoniczna frekwencja potwierdzonego
zapisu Compass ma pierwszeństwo przed importowaną kopią, także gdy oczekuje
na weryfikację. Raport rozdziela dodatni zarejestrowany czas, spełnienie progu,
wynik poniżej progu i brak danych. Nie sumuje obu kopii czasu. Niepotwierdzony
czas zajęć, brak raportu i brak wpisu nie są dowodem nieobecności.

Eksport obejmuje sześć obszarów ankiety edycji i opcjonalną średnią rekomendacji.
Deklaracje prowadzenia są liczone bez eksportu tożsamości lub preferencji
kontaktu. Wyniki oznaczamy jako odpowiedzi Compass: osoby bez konta nie mają
obecnie formularza ankiety w panelu. Frekwencja nie oznacza ukończenia programu.

Odbiór na produkcji wymaga rzeczywistej zatwierdzonej edycji oraz sprawdzonych
importów. Testy z danymi syntetycznymi nie zastępują tego odbioru.

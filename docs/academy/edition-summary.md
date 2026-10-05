# Podsumowanie edycji szkolenia

Administrator widzi „Podsumowanie tej edycji” na istniejącej stronie
`/learning/edycje/[id]` i może pobrać plik TXT. Raport korzysta z obecnych
RPC listy edycji, uczestników Compass, prywatnego rosteru webinaru i ankiety.
Nie wymaga nowej usługi, migracji ani uprawnienia.

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

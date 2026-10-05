# Import istniejącego webinaru Teams do Akademii

Import jest dostępny administratorowi w szczegółach edycji ze spotkaniem typu „Teams organizatora zewnętrznego”. Nie tworzy nowego webinaru ani kont użytkowników i nie wysyła zaproszeń lub emaili. Dotychczasowe zapisy i korespondencja organizatora pozostają źródłem organizacji wydarzenia.

## Zapisy

1. Organizator eksportuje rzeczywistą listę zapisów Teams (CSV/TSV, UTF-8 lub UTF-16 z BOM). Nie wpisuj fikcyjnych 96 nazw zamiast raportu.
2. Administrator wybiera „Zapisy na webinar” i plik. CSV wymaga kolumny Email/Adres e-mail oraz opcjonalnie Name/Imię i nazwisko lub First name/Last name/Imię/Nazwisko. Anulowane rejestracje są pomijane. Limit wynosi 500 osób i 2 MB.
3. Compass normalizuje email (trim/lowercase), pokazuje wszystkich uczestników i dopasowania. Nie dopasowuje po nazwisku. Zaufane podstawy to potwierdzony email Auth, email zweryfikowany przez administratora w tożsamości M365 lub jawne powiązanie profilu z emailem w ewidencji umów.
4. Współdzielone adresy wymagają wyboru konkretnego zweryfikowanego konta lub pozostawienia osoby na prywatnej liście webinaru. Osoba bez konta jest zachowana i nie musi ponownie rejestrować się w Compass. Żadne uprawnienia do pilota ani szkolenia nie są nadawane przez dopasowanie.
5. Administrator zatwierdza cały podgląd (ważny 30 minut). Jedna transakcja zapisuje całą listę lub nic. Zmiana tożsamości, czasu spotkania lub brak miejsc wymaga nowego podglądu. Identyczny plik z identycznymi decyzjami nie tworzy duplikatów; nowy zweryfikowany email umożliwia osobno zatwierdzone powiązanie istniejącego uczestnika.

Potwierdzone miejsca obejmują listę webinaru i zapisy Compass, przy czym powiązana osoba jest liczona raz. Zmniejszenie limitu poniżej zajętości jest zablokowane. Zwykłe zapisy Compass przechodzą na rezerwę, jeśli wszystkie miejsca są zajęte. Import nie omija wcześniejszej listy rezerwowej: najpierw trzeba zwiększyć limit i rozwiązać rezerwę. Import do szkicu rezerwuje miejsca; po niezależnym zatwierdzeniu publikacji eligible konta są zapisywane na przypiętą wersję programu. Konta poza pilotem lub niespełniające wymagań pozostają tylko na liście organizacyjnej.

Anulowanie miejsca w Compass zwalnia rezerwację i może promować osobę z rezerwy. Organizator osobno aktualizuje rejestrację zewnętrznego Teams i korespondencję. Osoba z certyfikatem wymaga istniejącej procedury unieważnienia administratora.

## Frekwencja

Administrator/prawidłowy prowadzący najpierw potwierdza rzeczywisty czas zakończonego spotkania w Compass. Następnie administrator wybiera to spotkanie i raport obecności. Kolejność lokalnych dat wybiera jawnie (dzień/miesiąc lub US miesiąc/dzień); strefa to Europe/Warsaw. ISO z offsetem jest jednoznaczne. Godzina powtarzająca się podczas zmiany czasu wymaga ISO z offsetem.

Preferowana jest sekcja „In-meeting activities”: Email, Join time, Leave time. Połączenia na wielu urządzeniach i ponowne dołączenia są sumowane jako unia przedziałów i ograniczane do faktycznego okna zajęć. Osoby bez emaila wymagają wyjaśnienia przez organizatora; nazwisko nie jest dowodem tożsamości.

Podsumowanie „Participants” jest także obsługiwane: Email, First join, Last leave, In-meeting duration. Compass używa rzeczywistego czasu trwania z raportu, np. 10m oznacza 600 sekund nawet przy pierwszym dołączeniu o 18:00 i ostatnim opuszczeniu o 21:00. Podsumowanie jest dopuszczalne tylko gdy cały przedział mieści się w potwierdzonym oknie. Gdy wykracza poza okno albo istnieje wiele różnych podsumowań jednej osoby, potrzebny jest szczegółowy raport połączeń. Sam zakres First join/Last leave nie dowodzi ciągłej obecności.

Podgląd pokazuje sekundy/minuty oraz rodzaj dowodu. Zatwierdzenie zachowuje ręczne decyzje, własną obecność administratora i istniejące ukończenia/certyfikaty. Dla kont Compass obowiązują dotychczasowe quizy, materiały, progi frekwencji i przypięta wersja programu. Prywatna lista osoby bez konta rejestruje frekwencję organizacyjną, bez nadawania certyfikatu. Brak wiersza w raporcie nie oznacza automatycznej nieobecności. Ponowne potwierdzenie czasu zajęć unieważnia wcześniejsze decyzje maszynowe; nowy podgląd i zatwierdzenie tego samego raportu odtwarza je dla aktualnego okna.

## Korespondencja seryjna

Eksport CSV z BOM, separatorem średnik i zabezpieczeniem formuł jest przeznaczony do Worda. Kolumny: Email, ImieNazwisko, Szkolenie, Edycja. Eksport obejmuje aktywnych uczestników listy webinaru i dodatkowe potwierdzone zapisy Compass, bez dublowania osób. Adres pochodzi z aktualnej powiązanej ewidencji umów albo jawnej weryfikacji administratora z uzasadnieniem. Nie używa jako zastępstwa adresu z Teams. Brakujący/stary adres jest pomijany z liczbą pominięć, a współdzielony adres blokuje eksport. Eksport i zmiany mają ślad audytowy; nie następuje wysyłka.

## Granica danych i weryfikacja

Tabele `academy_webinar_roster`, `academy_webinar_import_batches`, `academy_webinar_attendance` są objęte RLS; klient nie ma uprawnień zapisu. Dostęp do całej listy ma wyłącznie administrator Akademii. Service role ma jawny dostęp potrzebny do uprawnionych eksportów GDPR/restore. Przechowywane są znormalizowane wiersze i dowody importu oraz SHA-256 źródła, bez kopiowania całego pliku do repozytorium Eksporty GDPR muszą filtrować dane do osoby będącej przedmiotem żądania, także w wieloosobowych podglądach i batchach importu.

Gate `COMPASS/scripts/test-academy-webinar-import-db.mjs` sprawdza atomowość, import/replay 96 rekordów, dopasowania i konflikty, RLS, rezerwę/limity, publikację szkicu, raporty przedziałowe/podsumowania, ponowienie po korekcie okna, niezmienność ręcznych decyzji/certyfikatów i eksport adresów. Hosted PostgreSQL dodatkowo uruchamia dwie równoległe sesje dla powtórzonego importu i wyścigu o ostatnie miejsce. Testy parsera i komponentu obejmują rzeczywiste struktury CSV, polskie nagłówki i jawne zatwierdzenie podglądu.

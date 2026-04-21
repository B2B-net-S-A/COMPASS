# SPECYFIKACJA SYSTEMU LOGOWANIA — Aplikacja Compass

**B2B.net S.A. | Wersja 1.0 | Luty 2026**

Dokument poufny — wylacznie do uzytku wewnetrznego B2B.net S.A.

---

## 1. Wprowadzenie

Niniejszy dokument stanowi kompletna specyfikacje systemu uwierzytelniania i autoryzacji dla aplikacji Compass, wewnetrznego narzedzia B2B.net S.A. Specyfikacja obejmuje model rol, mechanizmy bezpieczenstwa, zarzadzanie cyklem zycia kont oraz wymagania audytowe.

Dokument jest przeznaczony dla zespolu deweloperskiego jako podstawa do wyceny i implementacji systemu.

---

## 2. Model rol i uprawnien

System Compass oparty jest na czterowarstwowym modelu uprawnien. Kazda rola posiada scisle zdefiniowany zakres dostepu i mozliwosci operacyjnych.

### 2.1. Podsumowanie rol

| Rola | Rejestracja | Kluczowe uprawnienia | MFA |
|------|-------------|---------------------|-----|
| Konsultant | Samodzielna | Dostep do wlasnego profilu | Nie |
| Team Lead | Nadawana przez Centrale | Podglad profili przypisanych konsultantow (tylko odczyt) | Nie |
| Centrala | Adres wpisany przez Administratora | Zarzadzanie kontami konsultantow, pelne uprawnienia operacyjne | Tak (e-mail) |
| Administrator | Lista w bazie danych | Uprawnienia Centrali + zarzadzanie lista Centrali | Tak (e-mail) |

### 2.2. Konsultant

**Opis:** Podstawowa rola w systemie. Konsultant rejestruje sie samodzielnie i posiada dostep wylacznie do wlasnego profilu.

**Rejestracja:**
- Dostepna wylacznie dla adresow e-mail z domeny @b2bnetwork.pl
- Wymagane dane: imie, nazwisko, adres e-mail, haslo
- Obowiazkowa akceptacja klauzuli RODO przy rejestracji
- Walidacja domeny e-mail po stronie serwera (nie tylko front-end)

**Uprawnienia:**
- Podglad i edycja wlasnego profilu
- Brak dostepu do profili innych uzytkownikow
- Brak dostepu do panelu administracyjnego

### 2.3. Team Lead

**Opis:** Rola przygotowana architektonicznie, wdrozenie w przyszlosci. Rozszerza uprawnienia Konsultanta o podglad profili przypisanych podopiecznych.

**Przypisywanie:**
- Centrala przypisuje Konsultantow do Team Leada
- Team Lead nie moze samodzielnie dodawac/usuwac podopiecznych

**Uprawnienia:**
- Wszystkie uprawnienia Konsultanta
- Podglad profili przypisanych konsultantow (tylko odczyt)
- Brak mozliwosci edycji lub zmiany danych podopiecznych

**Status wdrozenia:**
- **Faza 1 (obecna):** Rola zdefiniowana w strukturze bazy danych, interfejs nieaktywny.
- **Faza 2 (przyszla):** Aktywacja interfejsu, pelna funkcjonalnosc.

### 2.4. Centrala (dawna rola Admin)

**Opis:** Rola operacyjna z pelnym dostepem do zarzadzania kontami konsultantow i danymi systemu. Zastepuje dotychczasowa role Admin.

**Nadawanie uprawnien:**
- Administrator wpisuje adresy e-mail uprawnionych osob w module Ustawienia
- Osoba logujaca sie z adresem obecnym na liscie automatycznie otrzymuje uprawnienia Centrali
- Wylacznie adresy z domeny @b2bnetwork.pl

**Uprawnienia:**
- Pelny dostep do profili wszystkich konsultantow
- Blokowanie i odblokowywanie kont konsultantow
- Usuwanie kont konsultantow (np. po odejsciu z firmy)
- Przypisywanie konsultantow do Team Leadow
- Podglad logow audytowych
- MFA obowiazkowe (kod e-mail)

### 2.5. Administrator

**Opis:** Najwyzszy poziom uprawnien w systemie. Posiada wszystkie uprawnienia Centrali oraz wylaczne prawo do zarzadzania lista osob z uprawnieniami Centrali.

**Lista Administratorow:**

Lista przechowywana w bazie danych. Adresy e-mail Administratorow:

| Adres e-mail | Uprawnienia specjalne |
|---|---|
| zbigniew.twardowski@b2bnetwork.pl | Master Admin — jedyny moze zmieniac liste Administratorow |
| igor.twardowski@b2bnetwork.pl | Drugi Master Admin — moze zmieniac liste Administratorow |
| artur.twardowski@b2bnetwork.pl | Administrator standardowy |
| marta.kozarzewska@b2bnetwork.pl | Administrator standardowy |

**Uprawnienia dodatkowe (wzgledem Centrali):**
- Dodawanie i usuwanie osob z listy Centrali (wszyscy Administratorzy)
- Modyfikacja listy Administratorow (wylacznie Master Admini: zbigniew.twardowski@b2bnetwork.pl oraz igor.twardowski@b2bnetwork.pl)

---

## 3. Mechanizmy bezpieczenstwa

### 3.1. Polityka hasel

| Parametr | Wartosc |
|---|---|
| Minimalna dlugosc | 10 znakow |
| Wymagana wielka litera | Tak (min. 1) |
| Wymagana cyfra | Tak (min. 1) |
| Dotyczy rol | Wszystkie |

### 3.2. Uwierzytelnianie wieloskladnikowe (MFA)

MFA jest obowiazkowe dla rol Centrala i Administrator. Metoda: kod weryfikacyjny wysylany na adres e-mail przypisany do konta.

| Rola | MFA wymagane | Metoda |
|---|---|---|
| Konsultant | Nie | — |
| Team Lead | Nie | — |
| Centrala | **Tak** | Kod e-mail |
| Administrator | **Tak** | Kod e-mail |

### 3.3. Ochrona przed atakami brute-force

- Maksymalnie 5 prob logowania w ciagu 15 minut na adres e-mail
- Po 3 nieudanych probach: wyswietlenie CAPTCHA
- Po 5 nieudanych probach: tymczasowa blokada konta na 15 minut
- Kazda nieudana proba logowania rejestrowana w logu audytowym

### 3.4. Zarzadzanie sesjami

- Automatyczne wylogowanie po 30 minutach nieaktywnosci
- Sesja odnawiana przy kazdej aktywnosci uzytkownika
- Bezpieczne przechowywanie tokenu sesji (httpOnly, secure, SameSite)

### 3.5. Odzyskiwanie hasla

Mechanizm resetu hasla dostepny dla wszystkich rol:

1. Uzytkownik klika "Nie pamietam hasla" na ekranie logowania
2. System weryfikuje, czy adres e-mail istnieje w bazie
3. Wyslanie linku resetujacego na zarejestrowany adres e-mail
4. Link wazny przez 15 minut, jednorazowy
5. Uzytkownik ustawia nowe haslo (zgodne z polityka hasel)
6. System potwierdza zmiane i loguje zdarzenie w audit trail

---

## 4. Zarzadzanie cyklem zycia kont

### 4.1. Tworzenie kont

| Rola | Sposob tworzenia | Kto tworzy |
|---|---|---|
| Konsultant | Samodzielna rejestracja z domeny @b2bnetwork.pl | Sam uzytkownik |
| Team Lead | Awans istniejacego Konsultanta przez Centrale | Centrala |
| Centrala | Wpisanie adresu e-mail przez Administratora | Administrator (w Ustawieniach) |
| Administrator | Wpis w bazie danych | Master Admin |

### 4.2. Blokowanie i usuwanie kont

- Centrala moze blokowac, odblokowywac i usuwac konta Konsultantow
- Blokada konta uniemozliwia logowanie, ale nie usuwa danych z systemu
- Usuwanie konta jest operacja trwala (po odejsciu konsultanta z B2B.net)
- Kazda operacja blokowania/usuwania jest rejestrowana w logu audytowym z informacja: kto, kiedy, na czyim koncie

### 4.3. Hierarchia zarzadzania

Schemat zarzadzania kontami:

- Master Admin (zbigniew.twardowski / igor.twardowski) → zarzadza lista Administratorow
- Administrator → zarzadza lista Centrali
- Centrala → zarzadza kontami Konsultantow i Team Leadow
- Team Lead → brak uprawnien zarzadczych (tylko podglad)
- Konsultant → brak uprawnien zarzadczych

---

## 5. Audit trail i logowanie zdarzen

### 5.1. Logowanie dostepu (wszystkie role)

Dla kazdego logowania system rejestruje:

- Adres e-mail uzytkownika
- Data i godzina logowania
- Adres IP
- Status (udane / nieudane)
- Przyczyna niepowodzenia (bledne haslo, zablokowane konto, itp.)

### 5.2. Logowanie akcji (Centrala i Administrator)

Dla kazdej operacji administracyjnej system rejestruje:

- Kto wykonal akcje (adres e-mail operatora)
- Jaka akcje wykonano (typ operacji)
- Kiedy (data i godzina)
- Na czyim koncie (adres e-mail docelowy)
- Szczegoly zmiany (np. zmiana roli, blokada konta)

### 5.3. Typy operacji do logowania

| Operacja | Wykonawca | Logowane dane |
|---|---|---|
| Logowanie | Wszyscy | IP, czas, status |
| Reset hasla | Wszyscy | Adres, czas, IP |
| Blokada konta | Centrala | Operator, cel, czas |
| Usuniecie konta | Centrala | Operator, cel, czas |
| Dodanie do Centrali | Administrator | Operator, nowy adres, czas |
| Usuniecie z Centrali | Administrator | Operator, adres, czas |
| Zmiana listy Adminow | Master Admin | Operator, zmiana, czas |
| Przypisanie do Team Leada | Centrala | Operator, konsultant, TL, czas |

---

## 6. Przeplyw procesu logowania

### 6.1. Rejestracja Konsultanta

1. Uzytkownik otwiera formularz rejestracji
2. Wpisuje adres e-mail — system waliduje domene @b2bnetwork.pl
3. Wpisuje imie i nazwisko
4. Ustawia haslo (min. 10 znakow, wielka litera, cyfra)
5. Akceptuje klauzule RODO (checkbox obowiazkowy)
6. System tworzy konto z rola Konsultant
7. Uzytkownik moze sie zalogowac

### 6.2. Logowanie Konsultanta / Team Leada

1. Uzytkownik wpisuje adres e-mail i haslo
2. System weryfikuje dane logowania
3. Po poprawnej weryfikacji — przekierowanie do profilu
4. Po nieudanej probie — komunikat bledu, licznik prob +1

### 6.3. Logowanie Centrali / Administratora

1. Uzytkownik wpisuje adres e-mail i haslo
2. System weryfikuje dane logowania
3. Po poprawnej weryfikacji — system wysyla kod MFA na adres e-mail
4. Uzytkownik wpisuje kod MFA
5. Po poprawnej weryfikacji kodu — przekierowanie do panelu

---

## 7. Procedury awaryjne

### 7.1. Niedostepnosc Master Admina

W systemie zdefiniowani sa dwaj Master Admini:

- zbigniew.twardowski@b2bnetwork.pl (Master Admin 1)
- igor.twardowski@b2bnetwork.pl (Master Admin 2)

W przypadku niedostepnosci jednego z nich, drugi Master Admin przejmuje pelna kontrole nad zarzadzaniem lista Administratorow.

### 7.2. Kompromitacja konta Administratora

W przypadku podejrzenia kompromitacji konta Administratora:

1. Natychmiastowa zmiana hasla przez wlasciciela konta
2. Master Admin moze usunac skompromitowane konto z listy Administratorow
3. Przeglad logow audytowych w celu identyfikacji nieautoryzowanych akcji

### 7.3. Awaria systemu MFA

W przypadku awarii systemu wysylki kodow MFA, osoby z rolami Centrala i Administrator nie beda mogly sie zalogowac. Procedura awaryjna: bezposredni kontakt z zespolem DevOps w celu tymczasowego wylaczenia MFA z jednoczesnym logowaniem tego zdarzenia.

---

## 8. Wymagania techniczne (podsumowanie)

| Komponent | Wymaganie |
|---|---|
| Baza danych | Tabele: users, roles, admin_list, centrala_list, team_lead_assignments, audit_log, login_log |
| Walidacja domeny | Server-side: tylko @b2bnetwork.pl dla rejestracji i wszystkich rol |
| Hashowanie hasel | bcrypt lub Argon2 (NIE MD5, NIE SHA) |
| Sesje | Timeout 30 min nieaktywnosci, tokeny httpOnly/secure/SameSite |
| MFA | Kod e-mail, waznosc 5 min, jednorazowy |
| Rate limiting | 5 prob / 15 min per adres, CAPTCHA po 3 probach |
| Reset hasla | Link jednorazowy, waznosc 15 min |
| Audit trail | Logowanie logowan i akcji admin., retencja min. 12 miesiecy |
| RODO | Checkbox akceptacji przy rejestracji, przechowywanie zgody |

---

## 9. Historia dokumentu

| Wersja | Data | Autor | Opis zmian |
|---|---|---|---|
| 1.0 | 17.02.2026 | Zbigniew Twardowski | Wersja poczatkowa specyfikacji |

---

**Zatwierdzil:** ............................................

**Data:** ............................................

# Profil użytkownika — Centrala + Admin

Profil użytkownika z poziomami dostępu **Centrala** i **Admin** to operacyjne centrum dowodzenia systemu Compass. Każda sekcja prowadzi do konkretnej akcji — profil nie jest wizytówką, lecz cockpitem.

## 1. Nagłówek profilu

**Dane podstawowe:**

- Imię i nazwisko
- Rola w organizacji (np. Account Manager, Delivery Manager, COO)
- Poziomy dostępu — widoczne jako badge'e: `Centrala` `Admin`
- Avatar / inicjały
- Email, telefon (kontakt wewnętrzny)
- Data dołączenia do systemu
- Ostatnie logowanie

## 2. Moi Konsultanci (portfolio view)

Najważniejsza sekcja operacyjna — serce pracy Centrali. Lista przypisanych Konsultantów z kluczowymi KPI:

| Pole | Opis |
|------|------|
| Imię i nazwisko | z linkiem do profilu Konsultanta |
| Aktualny projekt | nazwa klienta + data startu |
| Tier | Bronze / Silver / Gold / Platinum — wizualnie kolorowy badge |
| Punkty | aktualna liczba + ile do następnego tier'a |
| AI Quality Score | jeśli zintegrowane z Compass |
| Status | aktywny / na benchu / w procesie / offboarded |
| Rola Compass | Ambasador / Weryfikator / Wsparcie sprzedaży / brak |
| Ostatnia aktywność punktowa | np. "+100 pkt — pełny miesiąc, 3 dni temu" |
| Alerty | flagi: kończy się umowa, niska ankieta, gap >14 dni |

**Filtry i widoki:**

- Po tier'ach, po projektach, po statusie, po rolach Compass
- Widok: lista / karty / mapa projektowa
- Sortowanie: po punktach, po dacie końca umowy, po alertach

## 3. Dashboard operacyjny (widok Centrali)

**Statystyki zbiorcze portfolio:**

- Liczba Konsultantów: aktywnych / na benchu / w procesie
- Rozkład tier'ów (mini-wykres: ile Bronze, Silver, Gold, Platinum)
- Średni AI Quality Score portfolio
- Retention rate — % przedłużeń umów w portfolio
- Liczba aktywnych ról Compass (ilu Ambasadorów, Weryfikatorów, Wsparcie sprzedaży)
- Pipeline — ilu w procesie rekrutacyjnym / w gap'ie

**Trendy (ostatnie 3/6/12 miesięcy):**

- Dynamika punktów — ile punktów wygenerowało portfolio
- Awanse tier'owe — kto awansował, kiedy
- Referrale — ile poleceń z portfolio

## 4. Panel administracyjny (widok Admina)

Sekcja widoczna wyłącznie dla poziomu Admin.

**Zarządzanie punktami:**

- Przycisk: „Przyznaj punkty ręcznie" (z wyborem Konsultanta, liczby pkt, uzasadnienia)
- Historia ręcznych przyznań (audit log)
- Oczekujące na zatwierdzenie (jeśli workflow wymaga double-approval)

**Konfiguracja systemu:**

- Wartości punktowe per zdarzenie (edycja)
- Włączanie/wyłączanie typów nagród
- Zarządzanie tier'ami (progi punktowe)
- Ustawienia wygasania punktów (on/off)

**Zarządzanie rolami Compass:**

- Przypisywanie / odbieranie ról (Ambasador, Weryfikator, Wsparcie sprzedaży)
- Lista aktywnych ról z datami przypisania
- Statusy premiowe — kto ma naliczoną premię, kto oczekuje

**Audit log:**

- Pełna historia akcji admina (kto, co, kiedy, dla kogo)
- Filtrowanie po typie akcji, dacie, Konsultancie

## 5. Powiadomienia i alerty

**Centrum powiadomień z priorytetyzacją:**

- Kończy się umowa Konsultanta (za 30/14/7 dni)
- Konsultant blisko progu awansu na wyższy tier (>80%)
- Nowy referral do weryfikacji
- Negatywna ankieta kwartalna (rating <3.5)
- Gap >14 dni — ryzyko utraty bonusu za płynne przejście
- Nowa certyfikacja do potwierdzenia
- Rola Compass — premia do naliczenia (Ambasador wdrożył kogoś, Weryfikator zakończył ocenę)

**Ustawienia powiadomień:**

- Kanał: in-app / email / push
- Częstotliwość: real-time / daily digest / weekly summary

## 6. Raporty i eksport

**Generowanie raportów:**

- Raport portfolio (moi Konsultanci — PDF/Excel)
- Raport punktowy (historia punktów per Konsultant)
- Raport tier'owy (rozkład i dynamika)
- Raport ról Compass (aktywność, premie, skuteczność)
- Raport retencji (przedłużenia vs odejścia)

**Eksport danych:**

- CSV / Excel — do dalszej analizy
- PDF — do prezentacji dla Zarządu / RN

## 7. Ustawienia profilu

- Zmiana hasła / 2FA
- Preferencje powiadomień
- Język interfejsu
- Delegowanie uprawnień (zastępstwo na czas urlopu)
- Integracje (kalendarz, email, systemy HR)

## Macierz widoczności sekcji wg poziomu dostępu

| Sekcja | Centrala | Admin | Oba |
|--------|:--------:|:-----:|:---:|
| Nagłówek profilu | | | x |
| Moi Konsultanci | x | | |
| Dashboard operacyjny | x | | |
| Panel administracyjny | | x | |
| Powiadomienia | | | x |
| Raporty i eksport | | | x |
| Ustawienia profilu | | | x |

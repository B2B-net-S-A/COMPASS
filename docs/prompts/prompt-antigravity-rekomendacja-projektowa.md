# PROMPT DLA ANTIGRAVITY: Moduł "Rekomendacja na Projekt" (Compass)

## ROLA I KONTEKST

Jesteś senior full-stack developerem budującym nowy moduł w istniejącym systemie **Compass** — wewnętrznej platformie B2B.net S.A. do zarządzania projektami i konsultantami IT. System działa jako aplikacja webowa. Zalogowany użytkownik to konsultant z aktywnym kontem w Compass.

---

## CEL BIZNESOWY

Zbuduj moduł **"Rekomendacja na Projekt"**, który pozwala zalogowanemu konsultantowi:
1. Wybrać aktywny projekt z listy projektów w Compass.
2. Zarekomendować na ten projekt **inną osobę** (kolega, znajomy, kontakt z rynku) — wraz z uploadem CV i danymi kontaktowymi.
3. Alternatywnie — **zarekomendować siebie** na ten projekt, deklarując oczekiwaną stawkę i dostępność.

Moduł ma wspierać **program poleceń (referral program)** — każda rekomendacja jest trackowana i przypisana do konsultanta, który ją złożył.

---

## ARCHITEKTURA FLOW

```
[Lista Projektów] → [Wybór Projektu] → [Typ Rekomendacji: Inna Osoba / Ja]
                                              │                        │
                                              ▼                        ▼
                                     [Formularz A]            [Formularz B]
                                     Dane osoby +             Self-referral +
                                     CV upload +              Stawka + Dostępność
                                     Kontekst rekomendacji
                                              │                        │
                                              ▼                        ▼
                                        [Podsumowanie + Walidacja]
                                              │
                                              ▼
                                        [Zapis + Powiadomienia]
```

---

## KROK 1: WYBÓR PROJEKTU

### Widok listy projektów
Konsultant widzi listę aktywnych projektów z następującymi kolumnami/filtrami:

| Pole              | Typ         | Uwagi                                         |
|--------------------|-------------|-----------------------------------------------|
| Nazwa projektu     | string      | Klikalne — otwiera kartę projektu             |
| Klient             | string      | Nazwa klienta (może być zanonimizowana)       |
| Technologie        | tagi/chipy  | Stack technologiczny wymagany na projekcie    |
| Lokalizacja        | string      | Miasto / Remote / Hybrid                      |
| Tryb pracy         | enum        | On-site / Remote / Hybrid                     |
| Stawka widełkowa   | range (PLN) | Widełki jeśli udostępnione, inaczej "Do uzg." |
| Status             | enum        | Aktywny / Pilny / Wkrótce                     |

### Akcja
- Przy każdym projekcie przycisk **"Rekomenduj"** (ikona + tekst).
- Kliknięcie otwiera modal/dedykowaną podstronę z krokiem 2.

---

## KROK 2: WYBÓR TYPU REKOMENDACJI

Po wybraniu projektu konsultant widzi **kartę projektu** (summary: nazwa, klient, wymagania, stawka) oraz dwa przyciski wyboru:

```
┌─────────────────────────────┐  ┌─────────────────────────────┐
│  👤 Rekomenduję inną osobę  │  │  🙋 Rekomenduję siebie      │
│                             │  │                             │
│  Poleć kolegę, znajomego    │  │  Zgłoś swoją kandydaturę    │
│  lub kontakt z rynku        │  │  na ten projekt             │
└─────────────────────────────┘  └─────────────────────────────┘
```

Wybór kieruje do odpowiedniego formularza (Ścieżka A lub B).

---

## ŚCIEŻKA A: REKOMENDACJA INNEJ OSOBY

### Sekcja 1: Dane rekomendowanej osoby

| Pole                | Typ          | Wymagane | Walidacja                                      |
|---------------------|--------------|----------|-------------------------------------------------|
| Imię i nazwisko     | text input   | ✅ TAK   | Min. 2 wyrazy, min. 2 znaki każdy              |
| Adres e-mail        | email input  | ✅ TAK   | Poprawny format email (RFC 5322)                |
| Numer telefonu      | tel input    | ✅ TAK   | Format międzynarodowy, np. +48 XXX XXX XXX     |
| Profil LinkedIn     | url input    | ❌ NIE   | Musi zawierać `linkedin.com/in/`                |
| CV / Resume         | file upload  | ✅ TAK   | Formaty: PDF, DOCX, DOC. Max: 10 MB            |

**Upload CV:**
- Drag & drop zone + przycisk "Wybierz plik"
- Po uploadzie: podgląd nazwy pliku, rozmiaru, ikona typu + przycisk "Usuń/Zmień"
- Walidacja rozmiaru i formatu client-side przed wysłaniem

### Sekcja 2: Kontekst rekomendacji

| Pole                                      | Typ        | Wymagane | Opcje / Walidacja                                                                 |
|-------------------------------------------|------------|----------|-----------------------------------------------------------------------------------|
| Skąd znasz tę osobę?                      | dropdown   | ✅ TAK   | Kolega z pracy / Znajomy z branży / Kontakt z poprzedniego projektu / Kontakt z LinkedIn / Inne |
| Uzasadnienie rekomendacji                 | textarea   | ❌ NIE   | Max 500 znaków. Placeholder: "Np. Pracowaliśmy razem 2 lata, świetny Java Dev z doświadczeniem w mikroserwisach" |
| Czy osoba wyraziła wstępne zainteresowanie? | radio    | ✅ TAK   | Tak / Nie / Nie pytałem jeszcze                                                    |
| Oczekiwana stawka tej osoby               | number     | ❌ NIE   | PLN/h netto, > 0. Placeholder: "Jeśli znasz oczekiwania finansowe"                |

### Sekcja 3: Zgoda RODO (OBOWIĄZKOWA)

```
☐ Oświadczam, że rekomendowana osoba wyraziła zgodę na przetwarzanie
  jej danych osobowych w procesie rekrutacyjnym prowadzonym przez
  B2B.net S.A. zgodnie z Rozporządzeniem RODO (UE) 2016/679.
```

- Checkbox **wymagany** — formularz nie może być wysłany bez zaznaczenia.
- Link do pełnej klauzuli informacyjnej RODO (otwierany w nowym oknie).

---

## ŚCIEŻKA B: REKOMENDACJA WŁASNA (SELF-REFERRAL)

### Formularz self-referral

| Pole                                    | Typ          | Wymagane | Walidacja / Opcje                                            |
|-----------------------------------------|--------------|----------|--------------------------------------------------------------|
| Potwierdzenie kandydatury               | checkbox     | ✅ TAK   | "Chcę zgłosić swoją kandydaturę na ten projekt"              |
| Oczekiwana stawka                       | number range | ✅ TAK   | Dwa pola: "Od" i "Do" (PLN/h netto), wartość > 0            |
| Dostępność od                           | date picker  | ✅ TAK   | Min. data = dziś                                             |
| Wymiar zaangażowania                    | dropdown     | ✅ TAK   | Pełny etat / Pół etatu / 3-4 dni/tyg. / Do uzgodnienia      |
| Czy Twoje CV w Compass jest aktualne?   | radio        | ✅ TAK   | Tak / Nie                                                    |
| Upload nowego CV                        | file upload  | warunkowo| Wymagane jeśli odpowiedź wyżej = "Nie". PDF/DOCX/DOC, 10 MB |
| Dodatkowy komentarz                     | textarea     | ❌ NIE   | Max 500 znaków. Placeholder: "Np. Mam doświadczenie w tej technologii z projektu Y" |

**Dane konsultanta** (imię, nazwisko, email, telefon, LinkedIn, aktualne CV) — **pobierane automatycznie** z profilu w Compass. Wyświetlane jako read-only summary na formularzu.

---

## REGUŁY BIZNESOWE I WALIDACJA

### Walidacja formularza
1. Wszystkie pola oznaczone jako wymagane muszą być wypełnione przed wysłaniem.
2. Przycisk "Wyślij rekomendację" jest **nieaktywny (disabled)** dopóki walidacja nie przejdzie.
3. Walidacja inline — błędy wyświetlane pod polem w momencie opuszczenia pola (on blur).

### Reguły deduplikacji
- **Duplikat osoby na projekt:** System sprawdza po adresie email, czy ta sama osoba nie została już zarekomendowana na ten sam projekt.
  - Jeśli duplikat → komunikat: *"Ta osoba została już zarekomendowana na ten projekt przez [imię konsultanta] w dniu [data]. Czy mimo to chcesz złożyć swoją rekomendację?"*
  - Konsultant może kontynuować (duplikat jest dozwolony, ale flagowany).

### Limity
- **Self-referral:** Konsultant może mieć max **5 aktywnych zgłoszeń własnych** jednocześnie (status: Nowa lub W trakcie weryfikacji).
  - Po przekroczeniu → komunikat: *"Osiągnąłeś limit aktywnych zgłoszeń (5). Poczekaj na rozpatrzenie istniejących lub wycofaj jedno z nich."*

### Zgoda RODO (Ścieżka A)
- Bez zaznaczenia checkboxa RODO formularz **nie może być wysłany**.
- Treść checkboxa nie może być edytowalna przez użytkownika.

---

## EKRAN PODSUMOWANIA (przed wysłaniem)

Przed finalnym wysłaniem konsultant widzi ekran podsumowania:

```
📋 PODSUMOWANIE REKOMENDACJI

Projekt:        [Nazwa projektu] — [Klient]
Typ:            Rekomendacja innej osoby / Rekomendacja własna

--- Dane osoby ---
Imię i nazwisko: [wartość]
Email:           [wartość]
Telefon:         [wartość]
LinkedIn:        [wartość lub "Nie podano"]
CV:              [nazwa_pliku.pdf] (rozmiar)

--- Kontekst ---
Relacja:         [wartość dropdown]
Uzasadnienie:    [tekst lub "Nie podano"]
Zainteresowanie: [Tak/Nie/Nie pytałem]
Stawka:          [wartość lub "Nie podano"]

[← Wróć i edytuj]                    [Wyślij rekomendację →]
```

---

## AKCJE PO WYSŁANIU

### 1. Zapis do bazy danych
- Rekomendacja zapisywana ze statusem **"Nowa"**.
- Timestamp złożenia.
- ID konsultanta rekomendującego (foreign key do tabeli users).
- ID projektu (foreign key do tabeli projects).
- Plik CV zapisany w storage (S3 / blob storage) z referencją w rekordzie.

### 2. Powiadomienia

| Odbiorca                  | Kanał          | Treść                                                                 |
|---------------------------|----------------|-----------------------------------------------------------------------|
| PM / Rekruter projektu    | Email + In-app | "Nowa rekomendacja na projekt [nazwa] od [konsultant]"                |
| Konsultant rekomendujący  | Email + In-app | "Twoja rekomendacja na projekt [nazwa] została przyjęta do weryfikacji" |
| Rekomendowana osoba*      | Email           | "Zostałeś/aś zarekomendowany/a na projekt [nazwa] w B2B.net"         |

*Tylko w Ścieżce A, gdy konsultant zaznaczył "Osoba wyraziła zainteresowanie = Tak".

### 3. Tracking referralowy
System zapisuje pełną historię: kto → kogo → na jaki projekt → kiedy → jaki status — na potrzeby naliczania **referral bonus**.

---

## STATUSY REKOMENDACJI

Widoczne dla konsultanta w sekcji **"Moje Rekomendacje"** w profilu:

| Status                 | Opis                                          | Kolor   |
|------------------------|-----------------------------------------------|---------|
| 🔵 Nowa               | Złożona, czeka na review PM/Rekrutera         | Blue    |
| 🟡 W trakcie weryfikacji | PM/Rekruter przegląda kandydaturę           | Yellow  |
| 🟢 Zaakceptowana       | Osoba wchodzi do procesu rekrutacyjnego       | Green   |
| 🔴 Odrzucona           | Z uzasadnieniem widocznym dla konsultanta     | Red     |
| ⭐ Zatrudniona          | Sukces — osoba rozpoczęła projekt (referral!) | Gold    |
| ⚪ Wycofana             | Konsultant sam wycofał rekomendację           | Gray    |

Konsultant może **wycofać** rekomendację w statusie "Nowa" lub "W trakcie weryfikacji".

---

## MODEL DANYCH (schemat uproszczony)

```
Referral {
  id:                  UUID (PK)
  project_id:          UUID (FK → Projects)
  referrer_user_id:    UUID (FK → Users)  // konsultant składający rekomendację
  referral_type:       ENUM ['external_person', 'self_referral']
  status:              ENUM ['new', 'in_review', 'accepted', 'rejected', 'hired', 'withdrawn']

  // Ścieżka A — dane rekomendowanej osoby
  candidate_name:      VARCHAR(255) | NULL
  candidate_email:     VARCHAR(255) | NULL
  candidate_phone:     VARCHAR(50) | NULL
  candidate_linkedin:  VARCHAR(500) | NULL
  cv_file_url:         VARCHAR(1000) | NULL
  cv_file_name:        VARCHAR(255) | NULL
  relationship_type:   ENUM ['coworker', 'industry_contact', 'former_project', 'linkedin', 'other'] | NULL
  recommendation_note: TEXT(500) | NULL
  candidate_interested: ENUM ['yes', 'no', 'not_asked'] | NULL
  expected_rate:       DECIMAL(10,2) | NULL
  gdpr_consent:        BOOLEAN | NULL

  // Ścieżka B — self-referral
  desired_rate_min:    DECIMAL(10,2) | NULL
  desired_rate_max:    DECIMAL(10,2) | NULL
  available_from:      DATE | NULL
  engagement_type:     ENUM ['full_time', 'half_time', '3_4_days', 'to_be_discussed'] | NULL
  cv_is_current:       BOOLEAN | NULL
  self_referral_note:  TEXT(500) | NULL

  // Meta
  rejection_reason:    TEXT | NULL
  created_at:          TIMESTAMP
  updated_at:          TIMESTAMP
}
```

---

## WYMAGANIA UI/UX

1. **Layout:** Modal na pełny ekran (overlay) LUB dedykowana podstrona — nie mały popup.
2. **Progress bar:** Wizualny wskaźnik kroków: `Wybór projektu → Formularz → Podsumowanie → Gotowe`.
3. **CV upload:** Drag & drop zone z ikoną + fallback przycisk "Wybierz plik".
4. **Responsywność:** Pełna funkcjonalność na mobile (min. 375px szerokości).
5. **Loading states:** Spinner/skeleton przy ładowaniu listy projektów i wysyłaniu formularza.
6. **Success state:** Po wysłaniu — animacja sukcesu + podsumowanie + linki do "Moje Rekomendacje" i "Wróć do projektów".
7. **Error handling:** Toast notifications dla błędów serwera, inline errors dla walidacji pól.
8. **Accessibility:** Formularze zgodne z WCAG 2.1 AA (labele, aria-attributes, focus management, keyboard navigation).

---

## EDGE CASES DO OBSŁUŻENIA

1. **Konsultant próbuje zarekomendować siebie, ale ma nieaktualne CV i nie uploaduje nowego** → Blokada wysłania + komunikat.
2. **Projekt zostaje dezaktywowany w trakcie wypełniania formularza** → Graceful error: "Ten projekt nie jest już aktywny. Twoje dane zostały zapisane jako draft."
3. **Upload CV przekracza 10 MB** → Client-side walidacja przed wysłaniem na serwer.
4. **Konsultant traci sesję w trakcie wypełniania** → Auto-save draftu co 30 sekund do localStorage/sessionStorage.
5. **Duplikat emaila rekomendowanej osoby w systemie** → Soft warning, nie blokada.
6. **Konsultant wchodzi z urządzenia mobilnego** → Pełna funkcjonalność, camera upload CV jako opcja.

---

## TECHNICZNE WYTYCZNE

- Formularz powinien być **multi-step wizard** (nie jeden długi scroll).
- Walidacja: **client-side** (natychmiastowa, inline) + **server-side** (przed zapisem).
- Upload CV: użyj **presigned URL** do storage (nie przesyłaj przez backend).
- Powiadomienia: kolejka wiadomości (np. event-driven) — nie blokuj wysłania formularza na email delivery.
- API: RESTful endpoints:
  - `GET /api/projects?status=active` — lista projektów
  - `POST /api/referrals` — złożenie rekomendacji
  - `GET /api/referrals/my` — lista moich rekomendacji
  - `PATCH /api/referrals/{id}/withdraw` — wycofanie rekomendacji
  - `GET /api/referrals/{id}` — szczegóły rekomendacji

---

## DEFINICJA UKOŃCZENIA (Definition of Done)

- [ ] Konsultant może wybrać projekt z listy i otworzyć formularz rekomendacji
- [ ] Ścieżka A (rekomendacja innej osoby) działa z pełną walidacją i uploadem CV
- [ ] Ścieżka B (self-referral) działa z pobieraniem danych z profilu i deklaracją stawki
- [ ] Checkbox RODO jest wymagany w Ścieżce A
- [ ] Ekran podsumowania wyświetla poprawne dane przed wysłaniem
- [ ] Powiadomienia email + in-app wysyłane po złożeniu
- [ ] Sekcja "Moje Rekomendacje" wyświetla listę ze statusami
- [ ] Konsultant może wycofać rekomendację w statusie Nowa/W trakcie
- [ ] Limit 5 aktywnych self-referrali jest egzekwowany
- [ ] Deduplikacja po emailu działa z soft-warningiem
- [ ] Responsywność mobile
- [ ] Testy jednostkowe i integracyjne dla kluczowych ścieżek

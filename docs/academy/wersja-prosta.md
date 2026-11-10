# Akademia COMPASS: wersja prosta

Decyzje właściciela z 2026-11-10 i plan uproszczenia ekranów. Makiety „dziś” obok „prościej” i ścieżka od A do Z: https://claude.ai/artifact/U5g9mq6ZQagYx2zz5qa4VY (dostęp właściciela).

## Po co

Cel: ludzie łatwo przeglądają nagrania i materiały z webinarów i szkoleń. Budowa B0–B5 dała 37 tras, 6 zakładek, stronę edycji z 14 panelami i 4 akceptacje drugiej osoby na jedno szkolenie. Nagrania webinarów nie ma w katalogu ani na stronie kursu. Jest wyłącznie w sekcji „Materiały po szkoleniu” na stronie edycji, tylko dla potwierdzonych zapisanych i do ustawionej daty.

## Decyzje właściciela, 2026-11-10

1. **Nagranie webinaru widzą wszyscy z dostępem do Akademii, bez terminu.** Warunek: nagranie bez głosów uczestników, czyli na webinarze mikrofony uczestników są wyłączone, a pytania idą na czacie i trener czyta je na głos. Zastępuje rekomendację „tylko zapisani, najwyżej 90 dni” z decyzji otwartej na 15.01.2027.
2. **Jedna akceptacja drugiej osoby na szkolenie:** przed wejściem nagrania do biblioteki („Obejrzyj i zatwierdź”). Zapowiedź szkolenia publikuje organizator sam. Pakiet przekazania praw zamienia się w jedno pole zgody trenera przy publikacji. Zasada czterech oczu (autor nie zatwierdza swojego) zostaje przy tej jednej akceptacji.
3. **Test i certyfikat są opcjonalne.** Trener włącza test jednym przełącznikiem. Certyfikat nadal wymaga zdanego testu; bez testu obejrzenie albo obecność daje zaświadczenie udziału.
4. Błąd przekierowania kursu dla nieobecnych naprawić od razu (PR #525). Powiadomienie nieobecnych przechodzi do wersji prostej, bo tam nagranie samo zastępuje kurs dla nieobecnych.

Decyzje z 2026-11-09 obowiązują dalej: nic nie wychodzi na zewnątrz do bramki startu, migracje aplikuje właściciel, bez nowych uprawnień Graph.

## Ekrany docelowe

| Ekran | Kto | Zastępuje |
|---|---|---|
| **Biblioteka** (`/learning`): pole „Szukaj w nagraniach i materiałach”, tematy jako chipy, „Kontynuuj oglądanie”, pasek najbliższego szkolenia na żywo z „Zapisz się”, kafle nagrań z czasem trwania | wszyscy | Katalog szkoleń, Kalendarz, Ścieżki, Rekomendowane |
| **Moje** (`/learning/moje`): moje zapisy, kontynuowane nagrania, certyfikaty i zaświadczenia | wszyscy | Moje szkolenia |
| **Strona szkolenia** (`/learning/[slug]`): przed live data, „Zapisz się”, „Dodaj do kalendarza”; po live odtwarzacz na górze, rozdziały, materiały, pytania pod nagraniem, opcjonalnie „Sprawdź się” | wszyscy | strona kursu, strona edycji dla uczestnika, lekcja, kurs dla nieobecnych |
| **Prowadzę** (`/learning/tworze/[id]`): 3 kroki: opis i termin; nagranie i slajdy (przeciągnij MP4 i PDF); test opcjonalnie; „Wyślij do publikacji”; liczba wyświetleń i pytania | trener | edytor z 5 zakładkami, `/edycje`, `/test`, `/szkice-ai`, `/pytania`, panel pakietu |
| **Organizuję**: lista szkoleń ze stanem (Zapisy otwarte, Czeka na nagranie, Do akceptacji, W bibliotece), kolejka „Do zrobienia”, formularz „Nowe szkolenie na żywo” (tytuł, trener, data, kogo zaprosić; Teams tworzy się sam) | organizator, admin, TCM | strona edycji z 14 panelami, kokpit, zamknięcie, `/admin/learning` jako kolejka |

Zakładki konsultanta: 6 → 2 (Biblioteka, Moje). Prowadzę i Organizuję widzą tylko uprawnieni. Etykiety w menu: „Akademia” wszędzie (dziś „Learning Center” i „Moderacja kursów”).

## Co zostaje, co łączymy, co chowamy

- **Zostaje bez zmian:** odtwarzacz z postępem, wznawianiem i rozdziałami (B4.3, B4.4), bramka wysyłki i przełączniki (B0.2–B0.4), pula pytań, certyfikat i zaświadczenie (B2, B5.1), konto nauki i wejście z linku (B1), RODO, skan plików.
- **Łączymy:** kurs, edycja i kurs dla nieobecnych w jedno szkolenie z nagraniem; nagranie z webinaru jest materiałem szkolenia widocznym w bibliotece, a nie materiałem edycji z terminem.
- **Chowamy pod „Więcej” i zostawiamy wyłączone:** test wstępny, powtórki, ankieta per edycja, lista rezerwowa i limit miejsc, raport kompetencji, ścieżki. Strony admina (gotowość, integracje, certyfikaty) zostają dla admina.

## Plan prac (wycena wstępna, około 6 dni)

1. Reguła dostępu do nagrań: materiał edycji zatwierdzony do biblioteki widzi każdy z dostępem do Akademii, bez terminu. Migracja RLS (`academy_can_read_asset`, `academy_material_catalog`), plik z blokiem `DO $$`, aplikuje właściciel. Do tego czasu kod działa po staremu.
2. Biblioteka i strona szkolenia z odtwarzaczem na górze; nagranie edycji pokazuje się na stronie szkolenia i w bibliotece.
3. Prowadzę w 3 krokach na istniejących akcjach (materiały edycji, rozdziały, pula pytań).
4. Organizuję: lista ze stanem i kolejka „Do zrobienia”; publikacja zapowiedzi bez drugiej osoby; jedna akceptacja nagrania.
5. Zapis jednym kliknięciem z maila (osobisty link z B1.3, za `ACADEMY_PASS_ENABLED`) i powiadomienie „Nagranie gotowe” dla zapisanych, także nieobecnych, z linkiem prosto do odtwarzacza.
6. Nawigacja z dwiema zakładkami i jedną etykietą „Akademia”; ukrycie pozycji z listy „Chowamy”.

Później, osobno: wyszukiwanie w transkrypcie i propozycja rozdziałów z transkryptu. Trener może wgrać plik transkryptu z Teams ręcznie; pobieranie z Teams wymaga uprawnienia Graph (decyzja otwarta z 15.01.2027).

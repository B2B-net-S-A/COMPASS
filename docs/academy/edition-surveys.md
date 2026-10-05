# Ankiety po edycji szkolenia

Każda edycja live ma osobną ankietę na `/learning/edycje/[runId]`. Uczestnik może ją wysłać po potwierdzeniu obecności dla wszystkich wymaganych spotkań. Późniejsze nagrania, lekcje lub quiz nie blokują ankiety. Zapisy oczekujące i anulowane nie uprawniają do odpowiedzi.

Pytania obejmują ocenę szkolenia i prowadzącego (1–5), ocenę materiałów (1–5 lub „jeszcze nie otrzymałem / nie oceniam”), poziom trudności, przyszłe tematy, zainteresowanie prowadzeniem własnego szkolenia, opcjonalny proponowany temat i preferencję kontaktu. Rekomendacja 0–10 jest opcjonalna.

Administrator lub przypisany prowadzący może dostosować wprowadzenie i etykiety pytań na stronie edycji. Odpowiedź zachowuje snapshot treści pytań z chwili wysłania. Po wysłaniu odpowiedź jest niezmienna, a ponowny request zwraca ten sam identyfikator. Unikalność dotyczy użytkownika i edycji, więc kolejna edycja i nowa wersja kursu nie mieszają odpowiedzi.

Prowadzący widzi tylko zbiorcze wyniki swojej edycji oraz propozycje przyszłych tematów, bez nazwisk przypisanych do ocen. Deklaracje prowadzenia, proponowane tematy własnego szkolenia i preferencje kontaktu są w prywatnej tabeli i prezentowane tylko administratorowi. Deklaracja nie nadaje uprawnień i nie wywołuje automatycznej wysyłki wiadomości.

Dotychczasowe ankiety kursów pozostają zachowane. Raport prowadzącego pokazuje je oddzielnie jako wcześniejsze odpowiedzi na poziomie kursu; nie przypisujemy ich wstecznie do edycji. Kurs samodzielny zachowuje dotychczasowy formularz po zaufanym ukończeniu. Nowe odpowiedzi uczestników edycji live kierujemy do ankiety edycji.

Weryfikacja host-native: `node scripts/test-academy-edition-surveys-db.mjs` oraz `npm run test:unit -- components/academy/__tests__/edition-survey.test.tsx`. Gate SQL jest również częścią `npm run test:academy-db`, dzięki czemu hosted CI uruchamia go na PostgreSQL.

# Akademia: migracje do zastosowania

Kolejka plików SQL Akademii. Sesje budujące tylko dopisują tu pliki, a stosuje je właściciel. Bo każdy merge jedzie na produkcję bez stagingu, a `supabase db push` próbowałby zaaplikować od nowa prawie cały katalog (rejestr i pliki są rozjechane, patrz `CLAUDE.md`).

## Rytm

1. Okno dzienne właściciela o stałej porze. Poza oknem nikt nie stosuje SQL, więc wiadomo, kiedy baza mogła się zmienić.
2. Pliki idą po kolei, od najniższego numeru w tabeli. Następny dopiero po udanym poprzednim.
3. Wyłącznie przez MCP `apply_migration` z wersją równą prefiksowi pliku. Nigdy `supabase db push`.
4. Migracja kończy się blokiem `DO $$` z `RAISE EXCEPTION`. Gdy samosprawdzenie padnie, transakcja się cofa, a kolejka staje do wyjaśnienia przyczyny.
5. Po zastosowaniu zmień „Stan” na datę i dopisz wersję z rejestru.

## Kod idzie przed SQL

Kod trafia na produkcję wcześniej niż jego migracja, więc:

- Nowa akcja obsługuje brak obiektu komunikatem „czeka na migrację” (`lib/academy/migration-contract.ts`). Liczą się kody `42P01`, `42703`, `42883` oraz `PGRST202`, `PGRST204`, `PGRST205`, bo PostgREST zgłasza brak tabeli, kolumny albo funkcji własnym kodem, zanim zapytanie dojdzie do Postgresa.
- Kanał wyjścia przy braku obiektu nie wysyła niczego. Brak kolejki oznacza brak wiadomości i zdarzenie w Sentry.
- Reszta aplikacji działa bez zmian niezależnie od tego, czy plik już zastosowano.

## Cofanie

Każdy wiersz ma w kolumnie „Cofnięcie” jedno z dwóch:

- ścieżkę skryptu: `supabase/rollbacks/<ta sama nazwa pliku>` (katalog względem `COMPASS/`, poza `supabase/migrations`, żeby skrypt nigdy nie wyglądał na migrację),
- albo dosłowną notkę: `nieodwracalne, cofamy PITR`.

Test `lib/academy/__tests__/migration-contract.test.ts` pilnuje, że każdy wiersz ma plik, końcowe samosprawdzenie, cofnięcie i właściwą kolejność.

## Kolejka

| Lp. | Plik | PR | Cofnięcie | Stan |
|---|---|---|---|---|
| 1 | `20261109021500_academy_outbox.sql` | #463 | `supabase/rollbacks/20261109021500_academy_outbox.sql` | czeka |
| 2 | `20261109023000_academy_rollout_open_lock.sql` | #465 | `supabase/rollbacks/20261109023000_academy_rollout_open_lock.sql` | czeka |
| 3 | `20261109103000_academy_webinar_import_exceptions.sql` | #473 | `supabase/rollbacks/20261109103000_academy_webinar_import_exceptions.sql` | czeka |
| 4 | `20261109113000_academy_edition_closed_notify.sql` | #499 | `supabase/rollbacks/20261109113000_academy_edition_closed_notify.sql` | czeka |
| 5 | `20261109120000_auth_signup_gate_profiles_rls.sql` | #454 | nieodwracalne, cofamy PITR | czeka |
| 6 | `20261109121000_academy_run_audience.sql` | #500 | `supabase/rollbacks/20261109121000_academy_run_audience.sql` | czeka |
| 7 | `20261109130000_academy_review_signal.sql` | #457 | `supabase/rollbacks/20261109130000_academy_review_signal.sql` | czeka |
| 8 | `20261109130100_academy_gamification_off.sql` | #470 | `supabase/rollbacks/20261109130100_academy_gamification_off.sql` | czeka |
| 9 | `20261109130200_academy_rehearsal_reports_drafts.sql` | #477 | `supabase/rollbacks/20261109130200_academy_rehearsal_reports_drafts.sql` | czeka |
| 10 | `20261109130300_academy_readiness.sql` | #491 | `supabase/rollbacks/20261109130300_academy_readiness.sql` | czeka |
| 11 | `20261109200100_academy_quiz_pool.sql` | #459 | nieodwracalne, cofamy PITR | czeka |
| 12 | `20261109200200_academy_quiz_attempt_session.sql` | #483 | nieodwracalne, cofamy PITR | czeka |
| 13 | `20261109200300_academy_question_void.sql` | #483 | nieodwracalne, cofamy PITR | czeka |
| 14 | `20261109200400_academy_assessment_mode.sql` | #483 | nieodwracalne, cofamy PITR | czeka |
| 15 | `20261109200500_academy_pre_test_summary.sql` | #483 | nieodwracalne, cofamy PITR | czeka |
| 16 | `20261109200600_academy_participation_documents.sql` | #483 | nieodwracalne, cofamy PITR | czeka |
| 17 | `20261109200700_academy_question_analysis.sql` | #483 | nieodwracalne, cofamy PITR | czeka |
| 18 | `20261109200800_academy_question_drafts.sql` | #483 | nieodwracalne, cofamy PITR | czeka |
| 19 | `20261109210000_academy_b1_1_office_roles.sql` | #460 | `supabase/rollbacks/20261109210000_academy_b1_1_office_roles.sql` | czeka |
| 20 | `20261109213000_academy_video_progress.sql` | #492 | `supabase/rollbacks/20261109213000_academy_video_progress.sql` | czeka |
| 21 | `20261109213100_academy_video_chapters.sql` | #493 | `supabase/rollbacks/20261109213100_academy_video_chapters.sql` | czeka |
| 22 | `20261109213200_academy_author_storage_limit.sql` | #494 | nieodwracalne, cofamy PITR | czeka |
| 23 | `20261109213300_academy_run_material_availability.sql` | #480 | nieodwracalne, cofamy PITR | czeka |
| 24 | `20261109213400_academy_library.sql` | #472 | nieodwracalne, cofamy PITR | czeka |
| 25 | `20261109233000_academy_b5_9_usun_dane_prob.sql` | #467 | nieodwracalne, cofamy PITR | czeka |
| 26 | `20261110090000_academy_b1_2_learner_accounts.sql` | #486 | `supabase/rollbacks/20261110090000_academy_b1_2_learner_accounts.sql` | czeka |
| 27 | `20261110090500_academy_b1_5_learner_separation.sql` | #488 | `supabase/rollbacks/20261110090500_academy_b1_5_learner_separation.sql` | czeka |
| 28 | `20261110100000_academy_bind_learner_to_run.sql` | #501 | `supabase/rollbacks/20261110100000_academy_bind_learner_to_run.sql` | czeka |
| 29 | `20261110103000_academy_b5_3_run_key_holders.sql` | #503 | `supabase/rollbacks/20261110103000_academy_b5_3_run_key_holders.sql` | czeka |
| 30 | `20261110113000_academy_b5_1_certificate_validity.sql` | #504 | nieodwracalne, cofamy PITR | czeka |
| 31 | `20261110123000_academy_b5_2_document_verify.sql` | #505 | `supabase/rollbacks/20261110123000_academy_b5_2_document_verify.sql` | czeka |
| 32 | `20261110130000_academy_twin_course.sql` | #502 | nieodwracalne, cofamy PITR | czeka |
| 33 | `20261110133000_academy_b5_4_reports.sql` | #506 | `supabase/rollbacks/20261110133000_academy_b5_4_reports.sql` | czeka |
| 34 | `20261110143000_academy_b5_6_retrieval.sql` | #507 | `supabase/rollbacks/20261110143000_academy_b5_6_retrieval.sql` | czeka |
| 35 | `20261110150000_academy_b3_10_tcm_review.sql` | #512 | `supabase/rollbacks/20261110150000_academy_b3_10_tcm_review.sql` | czeka |
| 36 | `20261110160000_academy_question_drafts_key.sql` | #514 | `supabase/rollbacks/20261110160000_academy_question_drafts_key.sql` | czeka |
| 37 | `20261110160100_academy_certificates_expiring_rollout.sql` | #514 | `supabase/rollbacks/20261110160100_academy_certificates_expiring_rollout.sql` | czeka |
| 38 | `20261110160200_academy_adopt_learner_user.sql` | #515 | `supabase/rollbacks/20261110160200_academy_adopt_learner_user.sql` | czeka |
| 39 | `20261110160300_academy_b1_10_launch_condition.sql` | #516 | `supabase/rollbacks/20261110160300_academy_b1_10_launch_condition.sql` | czeka |
| 40 | `20261110164500_academy_programme_completions_report.sql` | #523 | `supabase/rollbacks/20261110164500_academy_programme_completions_report.sql` | czeka |
| 41 | `20261110170000_academy_b4_3_mark_complete_guard.sql` | #521 | `supabase/rollbacks/20261110170000_academy_b4_3_mark_complete_guard.sql` | czeka |
| 42 | `20261110180000_academy_prosta_nagranie_w_bibliotece.sql` | #PR1 | `supabase/rollbacks/20261110180000_academy_prosta_nagranie_w_bibliotece.sql` | czeka |

## Warunki stosowania

Kolejność z tabeli jest wiążąca, a poniższe warunki ją uzupełniają.

### B0.2 Bramka wyjścia i kolejka wstrzymanych wiadomości

- `20261109021500_academy_outbox.sql`
  - Warunek: kod z tego PR-a jest na produkcji. Kod działa też bez migracji: bramka wtedy niczego nie wysyła, a `academy-sync` traktuje brak tabeli jako stan oczekiwany.
  - Musi być zastosowana przed pierwszą publikacją kursu (B0.11), bo bez kolejki cron `course-inactivity` zgłasza błąd zamiast wstrzymać przypomnienie.
  - Cofnięcie: `supabase/rollbacks/20261109021500_academy_outbox.sql`.
  - Po zastosowaniu: `supabase/tests/academy_outbox_smoke.sql` (cały plik kończy się ROLLBACK).

### B0.4 Rejestr przełączników i blokada trybu open

- `20261109023000_academy_rollout_open_lock.sql`
  - Warunek: kod z tego PR-a jest na produkcji i rollout to `closed` albo `pilot` z najwyżej 20 kontami (odczyt 2026-11-09: `closed`, 0 kont). W przeciwnym razie migracja przerywa się z komunikatem.
  - Kolejność: przed `20261109210000_academy_b1_1_office_roles.sql` (B1.1), bo ta migracja łata w `academy_set_rollout` warunek roli, a ta podmienia całą funkcję.
  - Cofnięcie: `supabase/rollbacks/20261109023000_academy_rollout_open_lock.sql`. Skutek jest taki sam jak zdjęcie blokady, więc tylko na bramce startu. Po zastosowaniu B1.1 najpierw trzeba cofnąć B1.1, bo skrypt przywraca całą funkcję.
  - Po zastosowaniu: `supabase/tests/academy_rollout_lock_smoke.sql` (cały plik kończy się ROLLBACK), to część scenariusza G06.

### B0.5 Panel Gotowość do startu

- `20261109130300_academy_readiness.sql`. Cofnięcie: `supabase/rollbacks/20261109130300_academy_readiness.sql`.
  Warunek: dowolny moment po merge'u; panel bez niej pokazuje „czeka na migrację” i definicje scenariuszy, ale wyników nie zapisze.
  Sprawdzone lokalnie: postgres:17, `supabase/tests/academy_readiness_smoke.sql`, cofnięcie.

### B0.6 Kurs-atrapa, data startu raportów, porządek w szkicach

- `20261109130200_academy_rehearsal_reports_drafts.sql`. Cofnięcie: `supabase/rollbacks/20261109130200_academy_rehearsal_reports_drafts.sql`.
  Warunek: dowolny moment po merge'u; do tego czasu katalog działa bez filtra atrapy, raporty mają etykietę „próba”, a usuwanie szkicu i przywracanie odpowiadają „czeka na migrację”.
  Sprawdzone lokalnie: postgres:17, `supabase/tests/academy_drafts_smoke.sql`.

### B0.8 Sygnał dla recenzenta i autora

- `20261109130000_academy_review_signal.sql` (PR #457). Cofnięcie: `supabase/rollbacks/20261109130000_academy_review_signal.sql`.
  Warunek: dowolny moment po merge'u; kod bez niej działa, akcja wycofania odpowiada „czeka na migrację”. Musi być na produkcji przed pierwszą publikacją kursu w B0.11.
  Sprawdzone lokalnie: postgres:17, `supabase/tests/academy_review_signal_smoke.sql`.

### B0.10 Porządki blokujące próby

- `20261109130100_academy_gamification_off.sql`. Cofnięcie: `supabase/rollbacks/20261109130100_academy_gamification_off.sql`.
  Warunek: przed pierwszą publikacją kursu w B0.11, inaczej publikacja i ukończenia naliczają punkty. Kod działa bez migracji.
  Sprawdzone lokalnie: postgres:17 (samosprawdzenie migracji i skrypt cofnięcia).

### B1.1 Dostęp biura i pilot dla każdej roli

- Plik: `COMPASS/supabase/migrations/20261109210000_academy_b1_1_office_roles.sql`
- Warunek: po B0.4 (blokada trybu open, limit 20 kont pilota). Migracja łata w `academy_set_rollout` tylko warunek roli, więc zachowuje zmiany B0.4. Gdyby B0.4 podmienił całą funkcję po B1.1, cofnąłby tę zmianę.
- Cofnięcie: `COMPASS/supabase/rollbacks/20261109210000_academy_b1_1_office_roles.sql`
- Sprawdzenie lokalne: `supabase/tests/academy_b1_1_office_roles_stub.sql`, migracja, `academy_b1_1_office_roles_smoke.sql`. Na produkcji blok `DO $$` na końcu pliku.

### B1.2 Model konta nauki i konta próbne

- Plik: `COMPASS/supabase/migrations/20261110090000_academy_b1_2_learner_accounts.sql`
- Warunek: po `20261109120000_auth_signup_gate_profiles_rls.sql` (tabela) i po `20261109210000_academy_b1_1_office_roles.sql` (`rollout_allows_user`).
- Cofnięcie: `COMPASS/supabase/rollbacks/20261110090000_academy_b1_2_learner_accounts.sql`, tylko gdy nie ma kont nauki w użyciu.
- Sprawdzenie lokalne: stub B1.1, migracja B1.1, `supabase/tests/academy_b1_2_learner_accounts_stub.sql`, ta migracja, `academy_b1_2_learner_accounts_smoke.sql`.

### B1.5 Odcięcie od kartoteki i RODO

- Plik: `COMPASS/supabase/migrations/20261110090500_academy_b1_5_learner_separation.sql`
- Warunek: po `20261110090000_academy_b1_2_learner_accounts.sql`, przed pierwszym kontem nauki.
- Cofnięcie: `COMPASS/supabase/rollbacks/20261110090500_academy_b1_5_learner_separation.sql`
- Sprawdzenie lokalne: stuby i migracje B1.1, B1.2, ta migracja, `supabase/tests/academy_b1_5_learner_separation_smoke.sql`.

### B2.1 Pula pytań w modelu kursu

- `20261109200100_academy_quiz_pool.sql`, PR #459. Warunek: brak; kod działa także przed zastosowaniem. Cofnięcie: nieodwracalne, cofamy PITR.

### B2.2 Podejście jako sesja po stronie bazy

- `20261109200200_academy_quiz_attempt_session.sql`. Warunek: po `20261109200100_academy_quiz_pool.sql` i dopiero gdy na produkcji działa kod formularza z B2.4, bo plik usuwa `academy_get_quiz` i `academy_submit_quiz`. Cofnięcie: nieodwracalne, cofamy PITR.

### B2.3 Unieważnienie pytania

- `20261109200300_academy_question_void.sql`. Warunek: po `20261109200200_academy_quiz_attempt_session.sql`. Cofnięcie: nieodwracalne, cofamy PITR.

### B2.7 Test poza kursem

- `20261109200400_academy_assessment_mode.sql`. Warunek: po `20261109200300_academy_question_void.sql`. Cofnięcie: nieodwracalne, cofamy PITR.

### B2.8 Pre-test

- `20261109200500_academy_pre_test_summary.sql`. Warunek: po `20261109200400_academy_assessment_mode.sql`. Cofnięcie: nieodwracalne, cofamy PITR.

### B2.9 Model dokumentów

- `20261109200600_academy_participation_documents.sql`. Warunek: po `20261109200500_academy_pre_test_summary.sql`. Cofnięcie: nieodwracalne, cofamy PITR.

### B2.10 Klucz i analiza pytań

- `20261109200700_academy_question_analysis.sql`. Warunek: po `20261109200600_academy_participation_documents.sql`. Cofnięcie: nieodwracalne, cofamy PITR.

### B2.11 Szkice pytań z AI

- `20261109200800_academy_question_drafts.sql`. Warunek: po `20261109200700_academy_question_analysis.sql`. Cofnięcie: nieodwracalne, cofamy PITR.

### B3.5 Powiązanie konta z listą i późna aktywacja

- `COMPASS/supabase/migrations/20261110100000_academy_bind_learner_to_run.sql`. Cofnięcie: `supabase/rollbacks/20261110100000_academy_bind_learner_to_run.sql`. Warunek: na produkcji są `20261005102339_academy_webinar_import` i `20261110090000_academy_b1_2_learner_accounts`. Bez niej wejście działa jak dotąd, a powiązanie powstaje przy pierwszym wejściu po migracji.

### B3.6 Import frekwencji odporny na wyjątki

- `COMPASS/supabase/migrations/20261109103000_academy_webinar_import_exceptions.sql`. Warunek: na produkcji są już `20261005102339_academy_webinar_import` i `20261006080417_academy_tcm_full_editor`. Cofnięcie: `supabase/rollbacks/20261109103000_academy_webinar_import_exceptions.sql`. Bez tej migracji import działa jak dotąd (pierwszy zły wiersz odrzuca cały plik), a panel wyjątków mówi, że czeka na migrację.

### B3.8 Ekran zamknięcia edycji

- `COMPASS/supabase/migrations/20261109113000_academy_edition_closed_notify.sql`. Cofnięcie: `supabase/rollbacks/20261109113000_academy_edition_closed_notify.sql`. Warunek: na produkcji jest `20261006080417_academy_tcm_full_editor`. Bez tej migracji ekran działa, a przycisk dzwonka mówi, że czeka na migrację.

### B3.12 Adresaci edycji

- `COMPASS/supabase/migrations/20261109121000_academy_run_audience.sql`. Cofnięcie: `supabase/rollbacks/20261109121000_academy_run_audience.sql`. Warunek: na produkcji są `20261006080417_academy_tcm_full_editor` i `20261109021500_academy_outbox`. Bez niej panel mówi, że czeka na migrację.

### B3.14 Próba generalna 3: edycja na sucho

Przed próbą muszą być zastosowane migracje z sekcja B3.6 w `docs/academy/czeka-na-wlasciciela.md`, sekcja B3.8 i sekcja B3.12.

### B4.3 Postęp co do sekundy i wznawianie

| Plik | Warunek | Cofnięcie |
|---|---|---|
| `COMPASS/supabase/migrations/20261109213000_academy_video_progress.sql` | brak zależności od innych plików B4 | `COMPASS/supabase/rollbacks/20261109213000_academy_video_progress.sql` |

Do czasu zastosowania lekcja z nagraniem działa jak dziś, z przyciskiem ręcznym.

Test bazy `COMPASS/scripts/test-academy-video-progress-db.mjs` jest poza łańcuchem `test:academy-db`; dopisze go koordynator po opróżnieniu kolejki.

### B4.4 Rozdziały i napisy

| Plik | Warunek | Cofnięcie |
|---|---|---|
| `COMPASS/supabase/migrations/20261109213100_academy_video_chapters.sql` | brak zależności od innych plików B4 | `COMPASS/supabase/rollbacks/20261109213100_academy_video_chapters.sql` |

Do czasu zastosowania odtwarzacz działa bez spisu rozdziałów, a edytor mówi, że czeka na migrację.

Test bazy `COMPASS/scripts/test-academy-video-chapters-db.mjs` jest poza łańcuchem `test:academy-db`; dopisze go koordynator po opróżnieniu kolejki.

### B4.5 Długie pliki i limit autora

| Plik | Warunek | Cofnięcie |
|---|---|---|
| `COMPASS/supabase/migrations/20261109213200_academy_author_storage_limit.sql` | po wszystkich migracjach funkcji rezerwujących materiał, także tych z 20261005102329; przerywa się, gdy treść funkcji na produkcji różni się od wzorca | nieodwracalne, cofamy PITR |

Do czasu zastosowania obowiązuje dzisiejszy limit 10 GB i dzisiejszy komunikat.

Test bazy `COMPASS/scripts/test-academy-author-storage-limit-db.mjs` jest poza łańcuchem `test:academy-db`; dopisze go koordynator po opróżnieniu kolejki.

### B4.6 Nagranie edycji z terminem dostępności

| Plik | Warunek | Cofnięcie |
|---|---|---|
| `COMPASS/supabase/migrations/20261109213300_academy_run_material_availability.sql` | po `20261006080417_academy_tcm_full_editor` (przebudowuje widok `academy_material_catalog`) | nieodwracalne, cofamy PITR |

Do czasu zastosowania materiały edycji działają bez terminu, a zapis terminu mówi, że czeka na migrację.

### B4.7 Biblioteka IT (M10)

| Plik | Warunek | Cofnięcie |
|---|---|---|
| `COMPASS/supabase/migrations/20261109213400_academy_library.sql` | brak zależności od innych plików B4 | nieodwracalne, cofamy PITR |

Do czasu zastosowania katalog wygląda jak dziś: bez przycisków formatu biblioteki, bez tematu i bez liczby modułów na karcie.

Test bazy `COMPASS/scripts/test-academy-library-db.mjs` jest poza łańcuchem `test:academy-db`, bo ta jedna linia `package.json` powodowała konflikty między torami. Uruchomienie: `ACADEMY_TEST_DATABASE_URL=<baza academy_test> node scripts/test-academy-library-db.mjs` z katalogu `COMPASS/`. Do łańcucha dopisać razem z testami B4.6, gdy kolejka scalania się opróżni.

### B4.8 Kurs dla nieobecnych jednym działaniem (M09)

| Plik | Warunek | Cofnięcie |
|---|---|---|
| `COMPASS/supabase/migrations/20261110130000_academy_twin_course.sql` | po `20261109200100_academy_quiz_pool` i `20261109213400_academy_library` | opis w nagłówku pliku; dane listy nieobecnych cofamy PITR |

Do czasu zastosowania przycisk na ekranie zamknięcia edycji mówi, że czeka na migrację. Test bazy `COMPASS/scripts/test-academy-twin-course-db.mjs` jest poza łańcuchem `test:academy-db`.

### B5.1 Ważność i recertyfikacja

- `COMPASS/supabase/migrations/20261110113000_academy_b5_1_certificate_validity.sql`
  - Warunek: po `20261109200600_academy_participation_documents.sql` i `20261109213400_academy_library.sql`.
  - Cofnięcie: nieodwracalne, cofamy PITR.
  - Bez tego pliku certyfikaty są bezterminowe, a panel ważności mówi „czeka na migrację”.

### B5.2 Weryfikacja dokumentu

- `COMPASS/supabase/migrations/20261110123000_academy_b5_2_document_verify.sql`
  - Warunek: po `20261109200600_academy_participation_documents.sql` i `20261110090000_academy_b1_2_learner_accounts.sql`.
  - Cofnięcie: `supabase/rollbacks/20261110123000_academy_b5_2_document_verify.sql`.

### B5.3 Raport edycji (M11)

- `COMPASS/supabase/migrations/20261110103000_academy_b5_3_run_key_holders.sql`
  - Warunek: po `20261109200500_academy_pre_test_summary.sql` i `20261109200700_academy_question_analysis.sql`.
  - Cofnięcie: `supabase/rollbacks/20261110103000_academy_b5_3_run_key_holders.sql`.
  - Bez tego pliku raport działa, ale nie wyklucza osób z dostępem do klucza.

### B5.4 Raport menedżerski i raport kompetencji (M12)

- `COMPASS/supabase/migrations/20261110133000_academy_b5_4_reports.sql`
  - Warunek: po `20261109213400_academy_library.sql` i `20261110090000_academy_b1_2_learner_accounts.sql`.
  - Cofnięcie: `supabase/rollbacks/20261110133000_academy_b5_4_reports.sql`.
  - Bez tego pliku oba ekrany mówią „czeka na migrację”.

### B5.6 Powtórki (V15)

- `COMPASS/supabase/migrations/20261110143000_academy_b5_6_retrieval.sql`
  - Warunek: po `20261109200100_academy_quiz_pool.sql` i `20261109200300_academy_question_void.sql`.
  - Cofnięcie: `supabase/rollbacks/20261110143000_academy_b5_6_retrieval.sql`.

### B3.10 Recenzja także przez TCM

- `COMPASS/supabase/migrations/20261110150000_academy_b3_10_tcm_review.sql`
  - Warunek: po `20261109130000_academy_review_signal.sql` (B0.8) i po `20261006080417_academy_tcm_full_editor.sql`. Bez B0.8 migracja przerywa się komunikatem `b3_10_wymaga_B0_8` i niczego nie zmienia.
  - Łata w miejscu wyłącznie warunki wejścia funkcji (`pg_get_functiondef` + `replace`), więc zachowuje późniejsze zmiany ich ciał. Brak wzorca przerywa całą transakcję.
  - Cofnięcie: `supabase/rollbacks/20261110150000_academy_b3_10_tcm_review.sql`. Decyzje podjęte w międzyczasie przez TCM zostają w historii.

### Przegląd bezpieczeństwa: klucz w szkicach i przypomnienia o certyfikatach

- `COMPASS/supabase/migrations/20261110160000_academy_question_drafts_key.sql`
  - Warunek: po `20261109200800_academy_question_drafts.sql`.
  - Cofnięcie: `supabase/rollbacks/20261110160000_academy_question_drafts_key.sql`.
- `COMPASS/supabase/migrations/20261110160100_academy_certificates_expiring_rollout.sql`
  - Warunek: po `20261110090000_academy_b1_2_learner_accounts.sql` i `20261110113000_academy_b5_1_certificate_validity.sql`.
  - Cofnięcie: `supabase/rollbacks/20261110160100_academy_certificates_expiring_rollout.sql`.

### Przegląd bezpieczeństwa: przejęcie konta z listy kont nauki

- `COMPASS/supabase/migrations/20261110160200_academy_adopt_learner_user.sql`
  - Warunek: po `20261110090000_academy_b1_2_learner_accounts.sql`.
  - Cofnięcie: `supabase/rollbacks/20261110160200_academy_adopt_learner_user.sql`.
  - Bez tego pliku adres zajęty przez rejestrację kończy wejście komunikatem o kontakcie z organizatorem, jak dotąd.

### B1.10 Izolacja konta nauki w warstwie danych

- `COMPASS/supabase/migrations/20261110160300_academy_b1_10_launch_condition.sql`
  - Warunek: po `20261109130300_academy_readiness.sql`.
  - Cofnięcie: `supabase/rollbacks/20261110160300_academy_b1_10_launch_condition.sql`.

### B4.8 Raport programu bez kont próbnych

- `COMPASS/supabase/migrations/20261110164500_academy_programme_completions_report.sql`
  - Warunek: po `20261110130000_academy_twin_course.sql` i `20261110133000_academy_b5_4_reports.sql` (korzysta z `academy_private.report_excludes`).
  - Podmienia tylko ciało `academy_programme_completions()`: pomija konta próbne i kurs-atrapę jak raport kompetencji. Dostęp i kształt wyniku bez zmian.
  - Cofnięcie: `supabase/rollbacks/20261110164500_academy_programme_completions_report.sql`.

### B4.3 Ręczne zaliczenie modułu z nagraniem

- `COMPASS/supabase/migrations/20261110170000_academy_b4_3_mark_complete_guard.sql`
  - Warunek: po `20261109213000_academy_video_progress.sql`. Bez niej przerywa się komunikatem `b4_3_guard_wymaga_B4_3`.
  - Łata w miejscu `academy_mark_lesson_complete` (`pg_get_functiondef` + `replace`): poniżej progu obejrzenia odmowa `video_watch_required`. Brak wzorca przerywa transakcję.
  - Cofnięcie: `supabase/rollbacks/20261110170000_academy_b4_3_mark_complete_guard.sql`.

### B5.9 Skrypt usuwania danych prób

- `COMPASS/supabase/migrations/20261109233000_academy_b5_9_usun_dane_prob.sql`
  - Warunek: wyłącznie na bramce startu, po teście na odtworzonym środowisku z B5.8. **Nie w rytmie dziennym.** Stosowany bez potwierdzenia niczego nie robi (kończy się przed pierwszą zmianą).
  - Żeby zadziałał, dopisz na początku SQL-a podanego do `apply_migration`, w tej samej transakcji: `SELECT set_config('academy.usun_dane_prob', 'TAK-USUN-DANE-PROB', true);`
  - Cofnięcie: nieodwracalne, cofamy PITR.
  - Wpis do rejestru: `20261109233000_academy_b5_9_usun_dane_prob.sql`, cofnięcie „nieodwracalne, cofamy PITR”, stan „bramka startu”.

### Wersja prosta, krok 1: nagranie edycji w bibliotece

- `COMPASS/supabase/migrations/20261110180000_academy_prosta_nagranie_w_bibliotece.sql`
  - Warunek: po `20261109213300_academy_run_material_availability.sql`. Bez niej przerywa się komunikatem `prosta_1_wymaga_B4_6`.
  - Decyzja właściciela z 2026-11-10: zatwierdzony materiał edycji (`ready` + `published`) czyta każdy z dostępem do Akademii, gdy kurs i edycja są opublikowane. Termin `available_until` przestaje działać, także przy sprzątaniu. Zapisani czytają jak dotąd.
  - Ta sama funkcja pilnuje podpisanego URL ze Storage, rozdziałów i `academy_material_catalog`, więc wszystkie trzy poszerzają się razem.
  - Cofnięcie: `supabase/rollbacks/20261110180000_academy_prosta_nagranie_w_bibliotece.sql`.

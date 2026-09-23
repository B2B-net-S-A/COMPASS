# Academy database contract

Foundation migration: `20260922082902_academy_versioned_foundation.sql`.

## Access and versioning

- Normal authenticated Compass profiles with role `consultant` or `admin`, not `is_external` and not `employment_status=exited`, may learn. Admin may manage all courses; consultants additionally need an active trainer grant to create/manage their own courses. No new global role.
- `academy_user_capabilities`: `user_id`, `can_train`, grant/revocation actor and timestamps. Only `academy_set_trainer` writes grants.
- `courses`: stable ID, slug, author and **published metadata mirror**. For a never-published course the mirror may hold draft metadata. Editing a published course updates `course_versions.metadata`, never the publicly readable mirror. Author forms overlay the current draft metadata.
- `course_versions`: UUID `id`, `course_id`, `version_number`, `status` (`draft`, `pending_review`, `published`, `rejected`), `metadata` JSON, `completion_rules` JSON, review and legacy metadata.
- `courses.published_version_id` identifies the current catalogue edition; `draft_version_id` identifies the author workspace. Pending and published versions are immutable. New draft cloning creates new lesson/question/option IDs.
- `course_lessons.version_id`, `course_quiz_questions.version_id`, `course_enrollments.version_id` pin content. Filter reads by version, not just course. Questions/options still require author/admin access; students use quiz RPC without correct answers.
- Enrollments add nullable `run_id`. Partial uniqueness: `(user_id,course_id) WHERE run_id IS NULL`; `(user_id,run_id) WHERE run_id IS NOT NULL`. The next migration owns runs and adds the FK.
- Course IDs/slugs, existing lesson IDs, enrollments, completions and certificate hashes survive backfill. Legacy rules preserve the original 70% quiz threshold. New rules default to 80%.
- Quiz retries are pinned to the version. Versions created after `20260923121456_academy_quiz_attempt_window.sql` allow 3 submissions per learner per rolling 24 hours, counted across every enrollment/run of that version. Earlier versions retain unlimited retries, including already published and completed programs. The policy cannot be changed after version creation; the database rejects a fourth submission without recording an attempt. A submission becomes available when the oldest counted attempt passes the 24-hour boundary.

## JSON shapes

`metadata`: `title`, `description`, `category`, `tags`, `level`, `duration_minutes`, `cover_image_url`, `delivery_mode` (`self_paced|live|blended`), `course_type` (`consultant|company`), `is_official`, `prerequisite_course_ids`.

`completion_rules`: `quiz_required:boolean`, `quiz_pass_percent:integer`, `require_all_lessons:boolean`, `attendance_percent:integer`. Attendance is required for live/blended. The next migration implements `academy_attendance_satisfied(p_enrollment_id uuid)`; the foundation fails closed for attendance-based completion.

`p_questions`: array of `{question_text, options:[{option_text,is_correct}]}`. Four options and exactly one correct answer per question; 4–10 questions when quiz is required.

`p_answers`: array of `{question_id,selected_option_id}`; exactly one answer per question in the enrollment's pinned version, no duplicate IDs.

## Public RPCs (authenticated)

| Function | Return |
|---|---|
| `academy_set_trainer(p_user_id uuid,p_enabled boolean)` | void |
| `academy_create_course(p_input jsonb)` | `{course_id,version_id,slug}` |
| `academy_begin_draft(p_course_id uuid)` | version UUID |
| `academy_update_course(p_course_id uuid,p_patch jsonb)` | version UUID |
| `academy_replace_quiz(p_course_id uuid,p_questions jsonb)` | void |
| `academy_reorder_lessons(p_course_id uuid,p_lesson_ids uuid[])` | void |
| `academy_submit_for_review(p_course_id uuid)` | version UUID |
| `academy_review_course(p_version_id uuid,p_approve boolean,p_reason text default null)` | `{course_id,version_id,published,first_publish_bonus}` |
| `academy_archive_course(p_course_id uuid)` | void; admin only |
| `academy_enroll(p_course_id uuid,p_version_id uuid default null)` | enrollment UUID; self-paced only, current published version only |
| `academy_get_syllabus(p_version_id uuid)` | lesson metadata only: id, course/version ID, order, title, estimated minutes and unlock delay |
| `academy_quiz_question_count(p_version_id uuid)` | integer; no question text or answers |
| `academy_mark_lesson_complete(p_enrollment_id uuid,p_lesson_id uuid)` | `{completed,already_completed,completion,streak}` |
| `academy_record_lesson_access(p_enrollment_id uuid,p_lesson_id uuid)` | void |
| `academy_get_quiz(p_enrollment_id uuid)` | rows `{question_id,question_order,question_text,options}` |
| `academy_submit_quiz(p_enrollment_id uuid,p_answers jsonb)` | `{score_percent,passed,attempt_id,already_awarded,award_status,completion}` |
| `academy_complete_course(p_enrollment_id uuid)` | `{completed,completion_id?,already_completed?,reason?}` |

Read-only helpers: `academy_can_access()`, `academy_is_trainer()`, `academy_can_manage_course(p_course_id)`, `academy_can_read_version(p_version_id)`, `academy_can_read_material(p_version_id)`, `academy_can_edit_version(p_version_id)`. Material reads require a matching enrollment or course ownership/admin access; catalogue access alone returns only the syllabus.

Direct draft CRUD remains available on lessons/questions/options, protected by RLS and immutable-version triggers. Set `version_id` explicitly on lesson/question insert. Direct course/version/enrollment/attempt/completion mutations are revoked. Child-row course/version identities cannot be changed. `courses.status` remains `published` while a new version is in review; moderation must query `course_versions.status`, not `courses.status` alone.

Legacy `get_quiz_for_attempt(course_id)` and `submit_quiz_attempt(course_id,answers)` wrap the user's self-paced enrollment only. Run pages must use enrollment-specific RPCs. Legacy award RPCs are no longer callable by clients.

## Completion, certificates, audit

`course_completions`: immutable completion ID, enrollment, user, course, version, completed timestamp and `certificate_snapshot` (`course_title`, `version_number`, `participant_name`, `author_name`, `completed_at`, `certificate_hash`). PDF uses this snapshot, never live course/profile labels. Snapshot is created in the same transaction as completion.

Completion locks enrollment and checks required lessons, quiz and attendance. `academy_reward_claims` provides one completion reward per user/course across versions/runs and one first-publication reward per author. Existing points are backfilled as consumed claims without changing financial history. Internal award calls have no client EXECUTE grant.

Trusted session/attendance SQL may call `academy_private.finalize_enrollment(p_enrollment_id uuid)` after its own caller and attendance authorization. This function is not a public Data API endpoint. The public completion RPC always requires the enrollment's actual owner; it never accepts a caller-supplied user ID. Service jobs should use a dedicated, service-only public wrapper rather than weaken the owner check.

`academy_audit_events`: admin-readable, append-only through controlled operations. Trainer grant/revocation, draft creation, review, publication, archive and completion are recorded.

## Integration requirements

- A run registration RPC must pin its approved run version, preserve user/course identity and prerequisites, and enforce capacity atomically.
- Its attendance helper must verify attendance belongs to that enrollment and run; click-through is not attendance.
- All learning actions, certificate routes, analytics and nested reads must filter `version_id`/`enrollment_id` as appropriate.
- Cloned attachment JSON retains existing storage paths. The material migration must associate shared blobs with the new version; an enrollment in a new version must not require access to the old version.
- Ratings require a trusted completion. Their aggregate trigger is a constrained definer because clients cannot directly update course counters.
- No migration grants trainer capability automatically. Legacy published content is preserved with `legacy=true`; no reviewer history is invented.
- This migration changes no production state until applied through the approved delivery path.

## Bezpieczny postęp, dyskusje i ścieżki

- `academy_enrollment_has_access(p_enrollment_id uuid)` jest wspólnym warunkiem dostępu do zapisanej wersji: własny zapis self-paced albo ukończona historia; migracja live rozszerza go o potwierdzony zapis do opublikowanej edycji. Anulowany, nieukończony zapis live nie daje materiałów, quizu ani dalszego postępu.
- `academy_can_read_lesson(p_lesson_id uuid)` dopuszcza autora/administratora albo własny dostępny zapis do tej wersji z odblokowaną lekcją. Drip: `unlock_after_days` liczy się od ukończenia poprzedniej lekcji; pierwsza lekcja i zerowe opóźnienie są dostępne od razu, ukończony zapis zachowuje dostęp. RLS pełnej lekcji i Storage używają tego samego warunku. `academy_get_syllabus` nadal pokazuje bezpieczne metadane zablokowanych lekcji.
- `academy_mark_lesson_complete` zwraca także `streak: {current, milestone_reached} | null`. Postęp dnia jest liczony według UTC, po nowym prawidłowym ukończeniu lekcji, z blokadą wiersza `academy_learning_streaks`. Tego samego dnia i przy ponowieniu ukończenia nie ma nowej nagrody. Co siedem kolejnych dni obowiązuje aktywna reguła `learning_streak_milestone` (domyślnie 25 XP). Kurs własnego autorstwa nie przyznaje tego XP. Kolumny profilu są jedynie lustrem; nie stanowią dowodu do przyznawania nagród.
- `course_questions.version_id` jest obowiązkowe; `enrollment_id` może być puste wyłącznie dla zachowanej historii. `academy_ask_question(p_enrollment_id uuid, p_question_text text, p_lesson_id uuid DEFAULT NULL)` zwraca ID i przypina pytanie do własnego zapisu/wersji. Opcjonalna lekcja musi należeć do tej wersji i być odblokowana.
- `academy_answer_question(p_question_id uuid, p_answer_text text)` zwraca ID; widoczność dyskusji wymaga dostępu do zapisanej wersji/lekcji lub aktywnych uprawnień autora/admina. Flaga odpowiedzi autora jest wyliczana po stronie DB. `academy_resolve_question(p_question_id uuid, p_resolved boolean)` pozwala rozwiązać pytanie pytającemu albo prowadzącemu/adminowi. Ponowienie tego samego pytania w zapisie lub tej samej odpowiedzi użytkownika zwraca istniejące ID, również bez drugiego XP. Reguły 5 XP za pytanie i 15 XP za odpowiedź autora pozostają aktywne według `loyalty_rules`.
- `academy_submit_survey(p_enrollment_id uuid, p_nps_score integer, p_best_part text DEFAULT NULL, p_improvement_suggestion text DEFAULT NULL)` wymaga własnego zaufanego `course_completions`; NPS to **0–10**, teksty maksymalnie 1000 znaków. Zachowuje jedną ankietę użytkownika na kurs i idempotentnie zwraca istniejące ID. Odczyt: własna ankieta albo aktywny autor/admin.
- `academy_enroll_path(p_path_id uuid)` zwraca ID i tworzy snapshot `learning_path_enrollments.required_course_ids uuid[]`. Ścieżka musi być opublikowana i mieć wymagane kursy. Nie tworzy automatycznie zapisów na edycje live. `academy_complete_path(p_path_id uuid)` zwraca `{completed, now_completed}` i sprawdza `course_completions` dla całego snapshotu. Późniejsza edycja programu ścieżki nie zmienia wymagań rozpoczętej ścieżki. Bezpośrednie zapisy/aktualizacje ukończeń, ankiet i Q&A przez klienta są odebrane.

Historyczne opublikowane kursy tworzą claim pierwszej publikacji nawet przy brakującym starym wpisie XP. Edycja/ponowna akceptacja nie dopisuje wstecz premii. Zachowujemy stare ukończenia, certyfikaty oraz zapisy ścieżek; nie przeliczamy historycznych nagród.

## Trwały gate SQL

`COMPASS/scripts/test-academy-db.mjs`, `test-academy-materials-db.mjs` i `test-academy-live-db.mjs` używają wspólnego `scripts/lib/academy-db-fixture.mjs`. Fixture pobiera rzeczywiste definicje tabel Akademii z historycznych migracji i zastępuje jedynie infrastrukturę Supabase Auth/Storage oraz niepowiązane kolumny profilu minimalnym schematem. Testy pokrywają pozytywne i negatywne uprawnienia; nie są pełnym odtworzeniem całej historii produkcyjnej bazy.

Domyślnie wykonują się na host-native PGlite. `ACADEMY_TEST_DATABASE_URL=postgresql://…/academy_test` uruchamia je na PostgreSQL: fixture tworzy odrębną losową bazę `academy_fixture_<uuid>` i usuwa po testach tylko tę bazę. Użytkownik CI musi mieć `CREATEDB` i uprawnienia tworzenia ról. Niezależne sesje do testów wyścigów są dostępne wyłącznie w wariancie PostgreSQL. PGlite nie stanowi dowodu poprawności równoległych transakcji. Kontener PostgreSQL może działać w hosted CI; lokalny Docker pozostaje zabroniony.

Kontrakt Storage wymaga osobnego testu na rzeczywistym środowisku Supabase przed udostępnieniem uploadów: podpisany TUS korzysta z `/upload/resumable/sign`, probe uprawnienia ma `version='1'` i jest wycofywany, a finalny zapis pochodzi z konta serwisowego i zawiera rozmiar/MIME odczytane z backendu. Trigger końcowego obiektu sprawdza zgodność z rezerwacją, niezależnie od RLS. To zachowanie zweryfikowano w [oficjalnym źródle Storage (SHA 3752175)](https://github.com/supabase/storage/blob/3752175869984bfda3d279d4821e63df8594f0ae/src/storage/uploader.ts); wersja faktycznie uruchomiona w projekcie pozostaje elementem gate. Odrzucona finalizacja korzysta z kolejki usuwania obiektu dostawcy — test SQL nie potwierdza wykonania tej kolejki.

Cofnięcie dostępu blokuje wydawanie nowych adresów pobierania. Już wydany signed URL może działać do końca krótkiego TTL (300 sekund).


### Przypisania i ponowna akceptacja historycznych publikacji

Migracja `20260922093544_academy_staff_and_legacy_review.sql` rozdziela `course_staff.role=editor` (program, quiz, upload) i `facilitator` (edycje i obecność). `course_run_staff` daje prowadzenie tylko wskazanej edycji. Właściciel i administrator nadają/odbierają przypisania; wymagane jest aktywne konto Compass i aktualny grant trenera. Cofnięcie grantu lub zatrudnienia natychmiast wyłącza dostęp. Uprawnienia HR nie zmieniają się.

- `academy_can_edit_course_as(p_course_id,p_user_id)` i `academy_can_lead_run_as(p_run_id,p_user_id)` są helperami service-only; finalizacja Storage sprawdza faktycznego `uploaded_by`, a nie tożsamość worker.
- `academy_can_manage_course` oznacza redakcję; `academy_can_lead_course` / `academy_can_manage_run` oznaczają prowadzenie. `academy_can_preview_version` daje prowadzącemu pełen program wyłącznie zatwierdzonej wersji jego kursu/edycji. Editor nie otrzymuje automatycznie list uczestników.
- `academy_set_course_staff(course,user,role,enabled)`, `academy_set_run_staff(run,user,enabled)` oraz prywatne roster DTO `academy_get_staff(course,run?)` są ograniczone do właściciela/admina. `academy_teaching_courses()` zwraca przypisane kursy i flagi `can_edit`, `can_lead`, `can_manage_assigned_runs`.
- `academy_catalog_instructors()` zwraca publiczne `{id,name,courseIds}` bez emaili/rosteru: autor widocznej publikacji oraz aktywni prowadzący kursu/opublikowanych edycji. Filtr `instructor_id` używa tych courseIds, `author_id` zachowuje semantykę autora.
- Snapshot worker zawiera distinct autora, aktywnych prowadzących i potwierdzonych uczestników (tylko zweryfikowane adresy). Zmiana przypisania odnawia przyszłe zaproszenia. DB egzekwuje `capacity + distinct(author, facilitators) <= 500` dla zarządzanych spotkań Teams przy przypisaniu, zmianie limitu i przygotowaniu/publikacji terminu.
- Akceptacji kursu/edycji dokonuje niezależny admin: trwałe private contributor records wykluczają własnego autora/redaktora/planistę, nawet po odebraniu mu przypisania. Uczestnik nigdy nie może sam potwierdzić swojej obecności.
- Historyczne opublikowane kursy mają `legacy_review_required=true`; nowe zapisy i katalog czekają na akceptację, istniejące zapisy i certyfikaty są zachowane. `academy_review_legacy_course(p_course_id,p_approve,p_reason,p_version_id)` wymaga wskazania dokładnej oglądanej publikacji i zapisuje osobny audyt bez ponownej nagrody. Nowa zaakceptowana wersja również zwalnia blokadę.
- Wymagania wstępne: maks. 50 unikalnych ID widocznych zatwierdzonych kursów; zakaz self/cycle, wspólny transaction advisory lock dla walidacji grafu. Snapshot przypiętej wersji pozostaje wiążący; zaliczenie wymogu pochodzi z `course_completions`, nie z edytowalnej deklaracji UI.

Gate `test-academy-staff-db.mjs` sprawdza role, revoke, legacy access/history, niezależną moderację, prerequisite cycle, listę zaproszeń i limity. Hosted PostgreSQL wykonuje dodatkowo realny wyścig nadania prowadzącego ze zwiększeniem pojemności; PGlite nie udaje testu równoległości. `academy-staff.test.ts` sprawdza server-action payloads i katalog/pinned draft choice.

Podgląd prowadzącego: `/learning/edycje/[id]/program` wybiera dokładnie `run.versionId` po `run.canManage`. Parametr `getCourseDetail.previewVersionId` wymaga `academy_can_preview_version` i zgodności wersji z kursem; nie zwraca stanu własnego enrollment. W podglądzie prowadzącego nie pobieramy kluczy quizu. `/learning/tworze/[id]/pytania` wybiera stare wersje wyłącznie z `academy_teaching_versions(course)`; Q&A używa ich ID i istniejącej RLS `academy_can_read_discussion`. Prowadzący może odpowiedzieć bez własnego zapisu, ale nie tworzy pytań za cudzy enrollment. Cofnięcie przypisania odbiera podgląd i odpowiadanie.

## Audytowane unieważnienie ukończenia

Migracja `20260922102847_academy_completion_revocations.sql` dodaje `course_completions.revoked_at/revoked_by/revoked_reason` oraz niezmienną decyzję `academy_completion_revocations`. RPC `academy_revoke_completion(p_completion_id uuid,p_reason text)` wymaga aktywnego administratora, uzasadnienia 10–2000 znaków oraz innego uczestnika niż administrator. Powtórzenie zwraca pierwszą decyzję bez ponownego audytu, powiadomienia lub zmiany salda. Snapshot certyfikatu, historia lekcji, wyników i `enrollment.completed_at` pozostają historyczne. Decyzja nie jest cofana poprzez ponowne sprawdzenie warunków ukończenia.

Nowe, aktywne ukończenia rozstrzygają prerequisites i ukończenie ścieżki (`revoked_at IS NULL`); istniejące zapisy i wcześniejsze ukończenia ścieżek pozostają zachowane. `academy_private.user_may_register`, finalizacja, unieważnienie i zaliczenie ścieżki współdzielą blokadę kwalifikacji użytkownika. Kursy live blokują edycję przed zapisem (`run → enrollment`).

`academy_completion_rewards` przechowuje dokładne powiązania nowych ukończeń z nagrodą uczestnika i autora. Cofnięcie ostatniego ważnego ukończenia użytkownika/kursu oznacza te transakcje istniejącym statusem `reversed`. Inne ważne ukończenie zachowuje nagrody. Claims pozostają na zawsze: ponowny zapis/ukończenie nie nalicza nagrody ponownie. Historyczne nagrody bez wiarygodnego przypisania nie są zgadywane: decyzja wskazuje `manual_reward_review_required=true`. Saldo i progi loyalty pozostają wyliczane przez dotychczasowy trigger, z blokadą profilu przed sumowaniem; spadek progu nie emituje awansu.

API certyfikatu zwraca HTTP 410 po unieważnieniu. Nowe PDF zawierają odsyłacz do uwierzytelnionego, osobistego statusu `/learning/certyfikaty/[completionId]`; wcześniejszych pobranych PDF nie można technicznie wycofać z urządzenia. Uczestnik otrzymuje powiadomienie w Compass. Panel `/admin/learning/certificates` przechowuje powód i wynik rozliczenia punktów. CourseDetail i CourseEnrollmentWithProgress mają `completion_revoked_at` i `completion_revoked_reason`, odrębne od historycznej daty ukończenia.

## Etapowe udostępnienie Akademii

Migracja `20260922102848_academy_rollout_gate.sql`: jedyne źródło polityki to `academy_rollout_settings` (domyślnie `closed`). `academy_rollout_access()` zwraca `{mode,allowed,isPilot}` bez ujawniania listy pilotowej. `academy_set_rollout(p_mode text,p_user_ids uuid[])` jest audytowanym RPC administratora; pilot dopuszcza wyłącznie wskazane aktywne konta Compass konsultantów/administratorów. Administrator zachowuje dostęp do przygotowania. `academy_can_access`, kwalifikacja trenerów i kolejka zapisów sprawdzają tę samą politykę również przy bezpośrednim dostępie przez PostgREST i przy finalizacji materiału przez worker w imieniu autora. Zmiana rollout nie nadaje uprawnień HR ani grantu trenera.

## Tożsamość zgłoszenia do moderacji

`course_versions.submission_id` identyfikuje konkretne zgłoszenie. Przy każdym przejściu do `pending_review` baza generuje nowy UUID, również po odrzuceniu i poprawkach w tej samej wersji. Migracja `20260922105234_academy_review_submission_token.sql` nadaje tokeny już oczekującym wersjom.

Podgląd administratora przenosi `submission_id` przez `CourseDetail`, `AdminReviewActions` i server action bez ponownego pobierania aktualnego tokenu. RPC `academy_review_course(p_version_id,p_approve,p_reason,p_submission_id)` porównuje przesłany token pod blokadą kursu i wersji przed zmianą statusu lub nagrodą. Stary formularz otrzymuje `review_submission_changed`; brak tokenu blokuje decyzję. Stary podpis z trzema argumentami, w tym wariant dwóch argumentów z wartością domyślną, nie jest wykonywalny przez `authenticated` ani `service_role`. Zostaje wewnętrznym rdzeniem operacji. Poprawny retry zaakceptowanego zgłoszenia nie powtarza nagrody ani audytu decyzji. Niezmienna historyczna publikacja korzysta nadal z osobnego RPC legacy.

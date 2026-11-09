import { ZodError } from 'zod'
import { MIGRATION_PENDING_PL, isMissingDatabaseObject } from './migration-contract'
import { quizAttemptWindowMessage } from './quiz-attempt-policy'

const fallback = 'Nie udało się wykonać operacji. Odśwież stronę i spróbuj ponownie.'
const messages: Record<string, string> = {
    academy_access_required: 'Nie masz dostępu do Akademii.',
    run_material_required: 'Termin dostępności dotyczy tylko materiałów edycji.',
    run_manager_required: 'Termin dostępności ustawia organizator tej edycji.',
    academy_open_locked: 'Tryb otwarty jest zablokowany do bramki startu. Wybierz tryb zamknięty albo pilot.',
    pilot_limit_exceeded: 'Pilot może objąć najwyżej 20 kont.',
    admin_required: 'Ta operacja wymaga uprawnień administratora.',
    trainer_required: 'Ta operacja wymaga aktywnego uprawnienia trenera.',
    trainer_course_required: 'Nie masz uprawnień do edycji tego szkolenia.',
    active_trainer_required: 'Wybierz osobę z aktywnym uprawnieniem trenera.',
    eligible_consultant_required: 'Wybierz aktywnego konsultanta posiadającego konto Compass.',
    course_owner_or_admin_required: 'Przypisaniami zarządza autor szkolenia lub administrator.',
    independent_reviewer_required: 'Szkolenie musi zatwierdzić administrator, który nie współtworzył tej wersji.',
    course_archived: 'Szkolenie jest zarchiwizowane. Nie można go teraz zmieniać.',
    archive_prerequisite_in_use: 'Nie można zarchiwizować tego szkolenia: wymaga go inne opublikowane szkolenie. Najpierw zatwierdź nową wersję zależnego kursu bez tego wymagania.',
    course_not_found: 'Szkolenie nie istnieje lub nie masz do niego dostępu.',
    invalid_video_chapters: 'Sprawdź czasy i tytuły rozdziałów.',
    duplicate_video_chapter: 'Dwa rozdziały mają ten sam czas. Zmień jeden z nich.',
    chapters_require_video: 'Rozdziały można dodać tylko do nagrania wideo.',
    prerequisites_not_completed: 'Najpierw ukończ wymagane szkolenia wstępne.',
    run_not_finished: 'Kurs dla nieobecnych można utworzyć po zakończeniu wszystkich spotkań edycji.',
    invalid_prerequisite: 'Wybierz dostępne szkolenia wstępne; kurs nie może wymagać samego siebie.',
    published_visible_prerequisites_required: 'Przed publikacją zatwierdź i udostępnij wszystkie szkolenia wstępne.',
    prerequisite_cycle: 'Wymagania wstępne tworzą zamknięty cykl. Usuń wzajemną zależność kursów.',
    invalid_staff_assignment: 'Sprawdź osobę i zakres przypisania do szkolenia.',
    editable_draft_required: 'Najpierw utwórz wersję roboczą szkolenia.',
    version_not_editable: 'Ta wersja nie jest już edytowalna. Odśwież stronę lub utwórz nowy szkic.',
    version_in_review: 'Wersja oczekuje na decyzję administratora i jest zablokowana do edycji.',
    immutable_course_version: 'Opublikowanej wersji nie można zmieniać. Utwórz nowy szkic.',
    pending_review_required: 'Ta wersja nie oczekuje już na akceptację. Odśwież kolejkę.',
    rejection_reason_required: 'Podaj uzasadnienie decyzji, co najmniej 5 znaków.',
    review_decision_required: 'Wybierz decyzję dotyczącą publikacji.',
    review_snapshot_immutable: 'Materiały zmieniły stan. Otwórz ponownie wersję do sprawdzenia.',
    unpublished_draft_required: 'Usunąć można tylko szkic bez publikacji, który nie czeka na akceptację.',
    draft_has_activity: 'Ten szkic ma już zapisy, edycje lub pakiet przekazania. Zamiast usuwać, zarchiwizuj szkolenie.',
    draft_has_materials: 'Najpierw usuń materiały tego szkicu w edytorze, a potem spróbuj ponownie.',
    rehearsal_course_protected: 'Kursu-atrapy używanego w testach nie można usunąć.',
    course_not_archived: 'To szkolenie nie jest w archiwum. Odśwież listę.',
    review_submission_changed: 'Zgłoszenie zostało zmienione. Otwórz ponownie pełny podgląd przed podjęciem decyzji.',
    at_least_one_lesson_required: 'Dodaj co najmniej jedną lekcję.',
    lesson_content_required: 'Uzupełnij treść lekcji, nagranie lub zweryfikowany materiał.',
    self_paced_requires_completion_evidence: 'Wybierz wymagane lekcje lub quiz jako warunek ukończenia.',
    quiz_requires_four_to_ten_questions: 'Quiz musi zawierać od 4 do 10 pytań.',
    quiz_requires_questions: 'Dodaj co najmniej jedno zatwierdzone pytanie do puli.',
    quiz_pool_smaller_than_draw: 'Pula ma mniej zatwierdzonych pytań, niż ma być losowanych w teście.',
    quiz_explanations_need_larger_pool: 'Włączone wyjaśnienia wymagają ustawionego losowania i puli co najmniej dwukrotnie większej od zestawu.',
    invalid_quiz_question: 'Każde pytanie musi mieć treść, od 2 do 6 odpowiedzi i dokładnie jedną poprawną.',
    invalid_quiz_questions: 'Pula może mieć najwyżej 300 pytań.',
    invalid_quiz_option: 'Uzupełnij treść odpowiedzi; odpowiedź i wyjaśnienie mogą mieć do 2000 znaków.',
    invalid_quiz_configuration: 'Sprawdź ustawienia testu: liczbę losowanych pytań, limit czasu i test wstępny.',
    invalid_quiz_attempt_policy: 'Limit prób to od 1 do 10 w oknie od 1 do 168 godzin.',
    immutable_quiz_attempt_policy: 'Limitu prób opublikowanej wersji nie można zmienić. Utwórz nowy szkic.',
    own_quiz_attempt_required: 'Ta próba nie należy do Twojego konta.',
    quiz_attempt_closed: 'Ta próba jest już zakończona. Odśwież stronę.',
    quiz_attempt_deadline_passed: 'Czas na tę próbę minął. Liczą się odpowiedzi zapisane przed końcem czasu.',
    quiz_attempt_not_finished: 'Wynik będzie dostępny po zakończeniu próby.',
    quiz_already_passed: 'Test jest już zaliczony.',
    quiz_opens_after_sessions: 'Test otworzy się po zakończeniu wymaganych sesji szkolenia.',
    quiz_pool_empty: 'Ten test nie ma jeszcze pytań.',
    answer_not_in_attempt: 'Odpowiedź nie należy do tej próby. Odśwież stronę.',
    pre_test_not_enabled: 'To szkolenie nie ma testu wstępnego.',
    pre_test_closed: 'Test wstępny jest dostępny tylko przed pierwszym podejściem do testu końcowego.',
    pre_test_already_taken: 'Test wstępny został już rozwiązany.',
    void_reason_required: 'Podaj powód unieważnienia, co najmniej 5 znaków.',
    void_requires_published_version: 'Unieważnić można pytanie opublikowanej wersji. W szkicu po prostu je popraw.',
    void_would_empty_pool: 'Nie można unieważnić ostatniego pytania w puli.',
    assessment_requires_quiz: 'Test poza kursem musi mieć wymagany test.',
    assessment_has_no_lessons: 'Test poza kursem nie ma lekcji. Usuń je albo zmień format szkolenia.',
    quiz_key_access_required: 'Analizę i klucz widzą tylko autor i recenzent tej wersji.',
    invalid_question_drafts: 'Szkic musi mieć treść, od 2 do 6 odpowiedzi i dokładnie jedną poprawną.',
    question_draft_already_decided: 'Ten szkic ma już decyzję. Odśwież listę.',
    one_answer_per_question_required: 'Odpowiedz dokładnie raz na każde pytanie.',
    invalid_quiz_answers: 'Odpowiedzi nie pasują do tego quizu. Odśwież stronę.',
    answer_not_in_enrollment_version: 'Odpowiedź nie należy do Twojej wersji quizu.',
    quiz_attempt_window_exhausted: quizAttemptWindowMessage,
    not_enrolled: 'Najpierw zapisz się na szkolenie.',
    enrollment_not_found: 'Nie znaleziono Twojego zapisu na szkolenie.',
    own_enrollment_required: 'Nie masz dostępu do tego zapisu.',
    own_path_enrollment_required: 'Najpierw zapisz się na tę ścieżkę nauki.',
    own_trusted_completion_required: 'Ta czynność będzie dostępna po ukończeniu szkolenia.',
    select_course_run: 'Wybierz edycję szkolenia z kalendarza.',
    lesson_not_unlocked: 'Ta lekcja nie została jeszcze odblokowana.',
    lesson_not_accessible: 'Lekcja jest niedostępna dla tego zapisu.',
    lesson_not_in_enrollment: 'Lekcja nie należy do Twojej wersji programu.',
    version_access_denied: 'Nie masz dostępu do tej wersji szkolenia.',
    discussion_not_accessible: 'Ta dyskusja nie jest dostępna dla Twojego konta.',
    question_owner_or_trainer_required: 'Tę czynność wykonuje autor pytania lub prowadzący.',
    published_version_required: 'Szkolenie wymaga zatwierdzonej wersji programu.',
    published_version_missing: 'Szkolenie nie ma jeszcze opublikowanego programu.',
    published_enrollment_version_required: 'Wersja przypisana do zapisu jest niedostępna.',
    published_path_required: 'Ta ścieżka nauki nie jest obecnie dostępna.',
    path_requires_courses: 'Ścieżka musi zawierać co najmniej jedno szkolenie.',
    official_metadata_admin_only: 'Tylko administrator oznacza szkolenie jako firmowe lub oficjalne.',
    official_course_must_be_company: 'Oficjalne szkolenie musi być szkoleniem firmowym.',
    material_authorization_changed: 'Uprawnienia lub stan szkolenia zmieniły się podczas przesyłania.',
    material_not_waiting_for_retry: 'Ten plik nie wymaga ponowienia albo jest już sprawdzany.',
    stored_material_mismatch: 'Przesłany plik nie odpowiada zatwierdzonemu rozmiarowi lub formatowi.',
    material_reservation_required: 'Rozpocznij przesyłanie ponownie z formularza szkolenia.',
    immutable_stored_material: 'Nie można nadpisać przesłanego pliku. Dodaj nowy materiał.',
}

export function academyDatabaseError(error: { message: string; code?: string }): string {
    if (messages[error.message]) return messages[error.message]
    if (isMissingDatabaseObject(error)) return MIGRATION_PENDING_PL
    // Only explicit, bounded domain exceptions may reach the interface verbatim.
    // PostgreSQL details, constraints, table names and transport errors stay server-side.
    if (['P0001', '42501'].includes(error.code ?? '') && error.message.length <= 500 && /[ąćęłńóśźż]/iu.test(error.message)) return error.message
    if (error.code === '42501') return 'Nie masz uprawnień do tej operacji.'
    if (error.code === '23505') return 'Taki wpis już istnieje. Odśwież listę.'
    if (error.code === '23503') return 'Powiązane dane zmieniły się. Odśwież stronę.'
    if (error.message.startsWith('invalid_')) return 'Sprawdź dane formularza i spróbuj ponownie.'
    return fallback
}

export function academyActionError(error: unknown): string {
    if (error instanceof ZodError) return 'Sprawdź wymagane pola i poprawność danych formularza.'
    if (!(error instanceof Error)) return fallback
    if (messages[error.message]) return messages[error.message]
    if (Object.values(messages).includes(error.message)) return error.message
    if (error.message.length <= 500 && /[ąćęłńóśźż]/iu.test(error.message)) return error.message
    return fallback
}

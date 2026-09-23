import { ZodError } from 'zod'

const fallback = 'Nie udało się wykonać operacji. Odśwież stronę i spróbuj ponownie.'
const messages: Record<string, string> = {
    academy_access_required: 'Nie masz dostępu do Akademii.',
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
    prerequisites_not_completed: 'Najpierw ukończ wymagane szkolenia wstępne.',
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
    review_submission_changed: 'Zgłoszenie zostało zmienione. Otwórz ponownie pełny podgląd przed podjęciem decyzji.',
    at_least_one_lesson_required: 'Dodaj co najmniej jedną lekcję.',
    lesson_content_required: 'Uzupełnij treść lekcji, nagranie lub zweryfikowany materiał.',
    self_paced_requires_completion_evidence: 'Wybierz wymagane lekcje lub quiz jako warunek ukończenia.',
    quiz_requires_four_to_ten_questions: 'Quiz musi zawierać od 4 do 10 pytań.',
    one_answer_per_question_required: 'Odpowiedz dokładnie raz na każde pytanie.',
    invalid_quiz_answers: 'Odpowiedzi nie pasują do tego quizu. Odśwież stronę.',
    answer_not_in_enrollment_version: 'Odpowiedź nie należy do Twojej wersji quizu.',
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

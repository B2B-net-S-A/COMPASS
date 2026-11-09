/** Czysta logika formularza testu: bez klucza, bez dostępu do bazy. */

export const QUIZ_PAGE_SIZE = 10

export function formatRemaining(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds))
    const minutes = Math.floor(safe / 60)
    return `${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

/** Do 10 pytań jedna przewijana strona, większe zestawy dzielone na strony. */
export function quizPageCount(questionCount: number): number {
    return questionCount <= QUIZ_PAGE_SIZE ? 1 : Math.ceil(questionCount / QUIZ_PAGE_SIZE)
}

export function quizPageItems<T>(items: readonly T[], page: number): readonly T[] {
    if (items.length <= QUIZ_PAGE_SIZE) return items
    const start = (Math.max(1, page) - 1) * QUIZ_PAGE_SIZE
    return items.slice(start, start + QUIZ_PAGE_SIZE)
}

export function answeredPercent(answered: number, total: number): number {
    return total <= 0 ? 0 : Math.min(100, Math.round((answered / total) * 100))
}

/** Odpowiedzi zapamiętane na urządzeniu mają pierwszeństwo, ale tylko dla pytań i opcji z tego zestawu. */
export function mergeSavedAnswers(
    questions: readonly { question_id: string; selected_option_id: string | null; options: readonly { id: string }[] }[],
    local: Record<string, string>,
): Record<string, string> {
    const merged: Record<string, string> = {}
    for (const question of questions) {
        if (question.selected_option_id) merged[question.question_id] = question.selected_option_id
        const stored = local[question.question_id]
        if (stored && question.options.some(option => option.id === stored)) merged[question.question_id] = stored
    }
    return merged
}

export function parseStoredAnswers(raw: string | null): Record<string, string> {
    if (!raw) return {}
    try {
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
        return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    } catch {
        return {}
    }
}

const BLOCKER_MESSAGES: Record<string, string> = {
    quiz_already_passed: 'Test jest już zaliczony.',
    quiz_opens_after_sessions: 'Test otworzy się po zakończeniu wymaganych sesji szkolenia.',
    quiz_attempt_window_exhausted: 'Wykorzystano limit prób w tym oknie czasu.',
    published_enrollment_version_required: 'Wersja przypisana do zapisu jest niedostępna.',
    pre_test_not_enabled: 'To szkolenie nie ma testu wstępnego.',
    pre_test_closed: 'Test wstępny jest dostępny tylko przed pierwszym podejściem do testu końcowego.',
    pre_test_already_taken: 'Test wstępny został już rozwiązany.',
}

export function quizBlockerMessage(code: string | null): string | null {
    if (!code) return null
    return BLOCKER_MESSAGES[code] ?? 'Test nie jest teraz dostępny.'
}

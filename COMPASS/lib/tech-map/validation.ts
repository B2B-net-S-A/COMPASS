// Phase 46 — matryca kompletności karty rozmowy (czysta, bez I/O).
// ŚWIADOMIE app-layer zamiast triggera DB: jedno testowalne źródło reguł;
// akcja finalizeCard woła validateCardForFinalize i odrzuca zapis przy błędach.

import type { CardInput } from '@/lib/types/tech-map'

/**
 * Walidacja bazowa — obowiązuje TAKŻE dla draftu (bez tych pól karta nie ma
 * sensu jako wiersz w DB).
 */
export function validateCardBase(input: CardInput): string[] {
    const errors: string[] = []
    if (!input.contractorId) errors.push('Wybierz konsultanta.')
    if (!input.clientId) errors.push('Wybierz klienta.')
    if (!input.interviewDate) errors.push('Podaj datę rozmowy.')
    return errors
}

/**
 * Matryca kompletności przy finalizacji:
 * - status wymagany zawsze;
 * - `odmowa` / `brak_czasu` → pozostałe pola nieobowiązkowe;
 * - `ok` / `niechetny` → koniec projektu (para miesiąc+rok XOR „nie wie")
 *   oraz odpowiedź na „Czy szukają ludzi?";
 * - `hiring=true` → ≥1 rola + źródło;
 * - satysfakcja ≤3 (jeśli wypełniona) → komentarz wymagany niezależnie od statusu;
 * - data rozmowy nie może być w przyszłości (sfinalizowany wywiad już się odbył).
 *
 * `todayISO` (YYYY-MM-DD, kalendarz warszawski) wstrzykiwany dla testowalności.
 */
export function validateCardForFinalize(input: CardInput, todayISO: string): string[] {
    const errors = validateCardBase(input)

    if (input.interviewDate && input.interviewDate > todayISO) {
        errors.push('Data rozmowy nie może być w przyszłości.')
    }

    if (!input.status) {
        errors.push('Wybierz „Status rozmowy".')
        return errors
    }

    // Komentarz przy niskiej satysfakcji — invariant pola, niezależny od statusu
    // (odpala się tylko, gdy satysfakcję w ogóle wypełniono).
    if (
        input.satisfaction !== null &&
        input.satisfaction <= 3 &&
        !(input.satisfactionComment ?? '').trim()
    ) {
        errors.push('Przy satysfakcji ≤3 komentarz jest wymagany.')
    }

    if (input.status === 'odmowa' || input.status === 'brak_czasu') {
        return errors
    }

    // ok / niechetny — pełne wymagania bloku A
    const hasEndPair = input.projectEndMonth !== null && input.projectEndYear !== null
    if (hasEndPair && input.projectEndUnknown) {
        errors.push('Zaznaczono „Nie wie" i jednocześnie podano koniec projektu — wybierz jedno.')
    }
    if (!hasEndPair && !input.projectEndUnknown) {
        errors.push('Uzupełnij „Koniec projektu" (miesiąc + rok) albo zaznacz „Nie wie".')
    }

    if (input.hiring === null) {
        errors.push('Odpowiedz na pytanie „Czy szukają ludzi?".')
    } else if (input.hiring === true) {
        if (input.hiringRoles.filter((r) => r.trim().length > 0).length === 0) {
            errors.push('Przy „szukają ludzi" podaj przynajmniej jedną rolę.')
        }
        if (!input.hiringSource) {
            errors.push('Wybierz źródło informacji (Widział / Słyszał / Plotka).')
        }
    }

    return errors
}

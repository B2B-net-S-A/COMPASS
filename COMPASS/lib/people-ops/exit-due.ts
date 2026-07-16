// People Ops — należne exity pracowników per miesiąc (audyt 2026-07-16, P1.6).
//
// Kontrakt: dla każdego procesu exit datą intencji jest
// `COALESCE(profiles.termination_date, exit_interviews.scheduled_for)`.
// Wcześniej KPI liczyło dwie niezależne liczby (termination_date z profiles
// i scheduled_for z exit_interviews) i UI pokazywało scheduled tylko jako
// notkę obok zera — fallback nie działał per-rekord.
//
// Implementacja per-rekord:
//   1. profil z termination_date w oknie  → liczony zawsze (intencja),
//   2. wywiad ≠ cancelled z scheduled_for w oknie liczony TYLKO gdy jego
//      użytkownik nie ma termination_date (albo wywiad jest zanonimizowany,
//      user_id NULL) — czyli dokładnie gałąź COALESCE-fallback,
//   3. deduplikacja: użytkownik liczony raz w (2) niezależnie od liczby
//      wywiadów; zbiory (1) i (2) są rozłączne z konstrukcji (2. wyklucza
//      posiadaczy termination_date).

export interface ExitInterviewLite {
    id: string
    user_id: string | null
    scheduled_for: string | null
    status: string
}

export interface EmployeeExitDue {
    /** Łączna liczba należnych exitów w oknie (COALESCE termination/scheduled). */
    due: number
    /** Ile z `due` pochodzi z fallbacku scheduled_for (brak termination_date). */
    dueFallbackScheduled: number
}

export function countEmployeeExitDue(opts: {
    /** COUNT profili z termination_date w oknie (policzone w SQL). */
    terminationInWindow: number
    /** Wywiady z scheduled_for w oknie [start, end) — status dowolny, filtr tutaj. */
    interviews: ExitInterviewLite[]
    /** user_id → termination_date (null gdy brak) dla userów z `interviews`. */
    terminationDateByUser: Map<string, string | null>
}): EmployeeExitDue {
    const { terminationInWindow, interviews, terminationDateByUser } = opts

    const fallbackUsers = new Set<string>()
    let fallbackAnonymous = 0

    for (const interview of interviews) {
        if (interview.status === 'cancelled') continue
        if (!interview.scheduled_for) continue
        if (interview.user_id === null) {
            // Zanonimizowany wywiad: brak profilu → scheduled_for jest jedyną datą.
            fallbackAnonymous += 1
            continue
        }
        const termination = terminationDateByUser.get(interview.user_id) ?? null
        if (termination !== null) continue // COALESCE wybiera termination_date — liczony w (1)
        fallbackUsers.add(interview.user_id)
    }

    const dueFallbackScheduled = fallbackUsers.size + fallbackAnonymous
    return {
        due: terminationInWindow + dueFallbackScheduled,
        dueFallbackScheduled,
    }
}

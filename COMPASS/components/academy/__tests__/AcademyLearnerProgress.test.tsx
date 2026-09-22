import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { AcademyLearnerProgress } from '../sessions/AcademyLearnerProgress'
import type { AcademyLearnerRunProgress, AcademySessionDTO } from '@/lib/types/academy-sessions'

afterEach(cleanup)

const session: AcademySessionDTO = {
    id: 'workshop', runId: 'run', title: 'Warsztat praktyczny', startsAt: '2026-09-21T10:00:00Z',
    endsAt: '2026-09-21T11:00:00Z', timeZone: 'UTC', mode: 'external_link', required: true,
    status: 'scheduled', joinUrl: null, syncStatus: 'ready', organizerId: null,
    actualStartsAt: '2026-09-21T10:00:00Z', actualEndsAt: '2026-09-21T11:00:00Z', attendanceWindowConfirmed: true,
}
const progress: AcademyLearnerRunProgress = {
    completionState: 'pending', missingLessons: [{ id: 'old-lesson', title: 'Wymagana lekcja wersji 1' }],
    quizRequired: true, quizPassed: false, quizPassPercent: 75, attendanceSatisfied: false, readyToComplete: false,
    attendance: [{ sessionId: session.id, status: 'insufficient', attendedSeconds: 2879,
        thresholdPercent: 80, requiredSeconds: 2880, requiredForCompletion: true, requirementMet: false }],
}
const props = { sessions: [session], courseSlug: 'szkolenie', enrollmentId: 'own-enrollment' }

describe('Own learner completion requirements', () => {
    it('names all missing conditions, keeps lesson/quiz links pinned and never rounds attendance up to a passing threshold', () => {
        render(<AcademyLearnerProgress {...props} progress={progress} />)
        expect(screen.getByRole('link', { name: 'Wymagana lekcja wersji 1' })).toHaveAttribute('href', '/learning/szkolenie/lekcja/old-lesson?enrollment=own-enrollment')
        expect(screen.getByRole('link', { name: 'Zdaj quiz końcowy' })).toHaveAttribute('href', '/learning/szkolenie/quiz?enrollment=own-enrollment')
        expect(screen.getByText(/wymagany wynik: 75%/)).toBeInTheDocument()
        expect(screen.getByText(/Potwierdzony czas: 47 min 59 s/)).toHaveTextContent('Niewystarczająca obecność')
        expect(screen.getByText(/Wymóg obecności niespełniony/)).toHaveTextContent('Próg: 80%, co najmniej 48 min.')
        expect(screen.getByText(/Potwierdzony czas obecności jest niewystarczający/)).toHaveTextContent('Warsztat praktyczny')
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('distinguishes missing evidence from zero attendance and keeps a cancelled obligation outstanding', () => {
        render(<AcademyLearnerProgress {...props} sessions={[{ ...session, status: 'cancelled', attendanceWindowConfirmed: false }]} progress={{
            ...progress, missingLessons: [], quizRequired: false,
            attendance: [{ ...progress.attendance[0], status: 'unconfirmed', attendedSeconds: null, requiredSeconds: null }],
        }} />)
        expect(screen.getByText(/Czas obecności niepotwierdzony/)).toHaveTextContent('Brak potwierdzenia')
        expect(screen.queryByText(/Potwierdzony czas: 0 min/)).not.toBeInTheDocument()
        expect(screen.getByText(/Oczekujemy na spotkanie zastępcze/)).toHaveTextContent('odwołanie nie zalicza obecności')
        expect(screen.getByText(/czas wymagany będzie znany po potwierdzeniu czasu zajęć/)).toBeInTheDocument()
    })

    it('counts only the active replacement and preserves the historical attendance without giving credit for it', () => {
        render(<AcademyLearnerProgress {...props} sessions={[
            { ...session, status: 'cancelled', replacementSessionId: 'replacement' },
            { ...session, id: 'replacement', title: 'Warsztat zastępczy', replacesSessionId: session.id },
        ]} progress={{ ...progress, missingLessons: [], quizRequired: false, attendance: [
            { ...progress.attendance[0], status: 'present', attendedSeconds: 3600, requiredForCompletion: false },
            { ...progress.attendance[0], sessionId: 'replacement', status: 'needs_review', attendedSeconds: 600 },
        ] }} />)
        expect(screen.getByText(/Spotkanie zastąpione — liczy się obecność/)).toBeInTheDocument()
        const lists = screen.getAllByRole('list')
        expect(within(lists[0]).getAllByRole('listitem')).toHaveLength(1)
        expect(within(lists[0]).getByRole('link', { name: 'Warsztat zastępczy' })).toHaveAttribute('href', '#session-replacement')
        expect(within(lists[0]).queryByRole('link', { name: session.title })).not.toBeInTheDocument()
        expect(screen.getByText(/Twoja obecność wymaga weryfikacji/)).toBeInTheDocument()
    })

    it.each([
        ['pending', /Wszystkie wymagania są spełnione/],
        ['completed', /potwierdzenie ukończenia jest zapisane/],
        ['revoked', /Spełnienie widocznych warunków nie przywróci certyfikatu/],
    ] as const)('reports %s without performing a completion or presenting missing tasks as an override', (completionState, message) => {
        render(<AcademyLearnerProgress {...props} progress={{ ...progress, completionState, readyToComplete: true, missingLessons: [], quizPassed: true, attendanceSatisfied: true, attendance: [{ ...progress.attendance[0], status: 'present', attendedSeconds: 2880, requirementMet: true }] }} />)
        expect(screen.getByText(message)).toBeInTheDocument()
        expect(screen.queryByText('Co pozostaje do ukończenia')).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /certyfikat/i })).not.toBeInTheDocument()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
})

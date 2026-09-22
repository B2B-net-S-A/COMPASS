import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AcademyAttendancePanel } from '../sessions/AcademyAttendancePanel'
import type { AcademyRunParticipantDTO, AcademySessionDTO } from '@/lib/types/academy-sessions'

vi.mock('@/lib/actions/academy-sessions', () => ({ recordAcademyAttendance: vi.fn() }))
afterEach(cleanup)

const session = { id: 'session', title: 'Warsztat', status: 'scheduled', attendanceWindowConfirmed: true } as AcademySessionDTO
const base: AcademyRunParticipantDTO = {
    registrationId: 'registration', userId: 'student', enrollmentId: 'enrollment', fullName: 'Anna Kowalska', email: 'anna@example.test',
    status: 'confirmed', completedAt: null, completionState: 'pending', completionRevokedAt: null, attendance: [],
    progress: { versionNumber: 1, totalLessons: 3, completedLessons: 1, lessonPercent: 33, requireAllLessons: true, quizRequired: true, quizPassPercent: 75, quizPassed: false, quizBestScorePercent: 50, quizAttemptCount: 2 },
}
const panel = (participants: AcademyRunParticipantDTO[]) => <AcademyAttendancePanel participants={participants} sessions={[session]} userId="trainer" />

describe('Scoped learning progress in the attendance roster', () => {
    it('shows the pinned program, full lesson denominator and aggregate quiz result independently of attendance', () => {
        render(panel([base]))
        const row = within(screen.getByRole('article', { name: 'Uczestnik: Anna Kowalska' }))
        expect(row.getByText('Wersja programu 1')).toBeInTheDocument()
        expect(row.getByText('Lekcje: 1/3 (33%) · wymagane do ukończenia')).toBeInTheDocument()
        expect(row.getByRole('progressbar', { name: 'Postęp lekcji: Anna Kowalska' })).toHaveAttribute('value', '33')
        expect(row.getByText('Quiz wymagany · próg 75% · niezaliczony')).toBeInTheDocument()
        expect(row.getByText('Najlepszy wynik quizu: 50% · liczba prób: 2')).toBeInTheDocument()
        expect(row.getByText('Obecność niepotwierdzona')).toBeInTheDocument()
        expect(row.queryByText('Edycja ukończona')).not.toBeInTheDocument()
        expect(row.getByRole('button', { name: 'Potwierdź / skoryguj' })).toBeEnabled()
    })
    it('does not treat the historical completion timestamp as a valid revoked certificate', () => {
        render(panel([{ ...base, completedAt: '2026-09-01T10:00:00Z', completionState: 'revoked', completionRevokedAt: '2026-09-22T10:00:00Z' }]))
        expect(screen.getByText('Ukończenie i certyfikat unieważnione')).toBeInTheDocument()
        expect(screen.queryByText('Edycja ukończona')).not.toBeInTheDocument()
        expect(screen.getByText(/Historia postępu pozostaje zachowana/)).toBeInTheDocument()
        expect(screen.getByRole('progressbar')).toHaveAttribute('value', '33')
        expect(screen.getByRole('button', { name: 'Potwierdź / skoryguj' })).toBeDisabled()
    })
    it('shows valid completion and prevents a correction that would contradict an issued certificate', () => {
        render(panel([{ ...base, completedAt: '2026-09-01T10:00:00Z', completionState: 'completed' }]))
        expect(screen.getByText('Edycja ukończona')).toBeInTheDocument()
        expect(screen.queryByText(/certyfikat unieważnione/)).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Potwierdź / skoryguj' })).toBeDisabled()
    })
    it('keeps a waitlisted person without an enrollment distinct from someone with zero progress', () => {
        render(panel([{ ...base, status: 'waitlisted', enrollmentId: null, progress: null }]))
        expect(screen.getByText('Postęp będzie dostępny po potwierdzeniu miejsca.')).toBeInTheDocument()
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
        expect(screen.queryByText(/Najlepszy wynik quizu/)).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Potwierdź / skoryguj' })).not.toBeInTheDocument()
    })
    it('does not invent full progress or failed quiz for a live-only program', () => {
        render(panel([{ ...base, progress: { ...base.progress!, totalLessons: 0, completedLessons: 0, lessonPercent: 0, requireAllLessons: false, quizRequired: false, quizPassed: false, quizAttemptCount: 0, quizBestScorePercent: null } }]))
        expect(screen.getByText('Program bez lekcji.')).toBeInTheDocument()
        expect(screen.getByText('Quiz niewymagany')).toBeInTheDocument()
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
        expect(screen.queryByText(/100%|niezaliczony|Najlepszy wynik quizu/)).not.toBeInTheDocument()
    })
    it('renders quiz pass independently from certificate status and separates participants accessibly', () => {
        render(panel([base, { ...base, registrationId: 'second', userId: 'other', enrollmentId: 'other-enrollment', fullName: 'Jan Nowak', progress: { ...base.progress!, completedLessons: 2, lessonPercent: 67, quizPassed: true, quizBestScorePercent: 75 } }]))
        const anna = within(screen.getByRole('article', { name: 'Uczestnik: Anna Kowalska' }))
        const jan = within(screen.getByRole('article', { name: 'Uczestnik: Jan Nowak' }))
        expect(anna.getByRole('progressbar', { name: 'Postęp lekcji: Anna Kowalska' })).toHaveAttribute('value', '33')
        expect(jan.getByRole('progressbar', { name: 'Postęp lekcji: Jan Nowak' })).toHaveAttribute('value', '67')
        expect(jan.getByText('Quiz wymagany · próg 75% · zaliczony')).toBeInTheDocument()
        expect(jan.queryByText('Edycja ukończona')).not.toBeInTheDocument()
    })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AcademyRunDetail } from '../sessions/AcademyRunDetail'
import type { AcademyRunDTO, AcademySessionDTO } from '@/lib/types/academy-sessions'

const mocks = vi.hoisted(() => ({ recover: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/actions/academy-sessions', () => ({ reconcileAcademyAttendance: mocks.recover }))
vi.mock('@/lib/actions/course-learning', () => ({ completeAcademyCourse: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [vi.fn(), () => null] }))
vi.mock('../sessions/AcademyAttendancePanel', () => ({ AcademyAttendancePanel: () => null }))
vi.mock('../sessions/AcademySessionForm', () => ({ AcademySessionForm: () => null, AcademyActualWindowForm: () => null }))
const session: AcademySessionDTO = { id: 'session', runId: 'run', title: 'Warsztat', startsAt: '2030-01-01T12:00:00Z', endsAt: '2030-01-01T14:00:00Z', timeZone: 'UTC', mode: 'managed_teams', required: true, status: 'scheduled', joinUrl: 'https://teams.microsoft.com/meet/123', syncStatus: 'ready', organizerId: 'organizer', actualStartsAt: '2030-01-01T12:00:00Z', actualEndsAt: '2030-01-01T13:00:00Z', attendanceWindowConfirmed: true }
const run: AcademyRunDTO = { id: 'run', courseId: 'course', versionId: 'version', versionNumber: 1, courseTitle: 'Kurs', courseSlug: 'kurs', title: 'Edycja', capacity: 3, status: 'published', confirmedCount: 1, waitlistCount: 0, canManage: true, canPublish: false, myRegistration: null, sessions: [session] }
const props = { run, isAdmin: true, participants: [], organizers: [], managedTeamsAvailable: true, userId: 'admin', now: '2030-01-01T13:05:00Z' }
beforeEach(() => { vi.clearAllMocks(); mocks.recover.mockResolvedValue({ success: true, data: undefined }) })
afterEach(cleanup)

describe('Attendance recovery controls', () => {
    it('uses the actual end and administrator role even when the administrator cannot approve their own run', async () => {
        render(<AcademyRunDetail {...props} />)
        expect(screen.getByText(/Ręczne decyzje i istniejące ukończenia oraz certyfikaty pozostają bez zmian/)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Ponów import obecności' }))
        await waitFor(() => expect(mocks.recover).toHaveBeenCalledWith(session.id))
        expect(await screen.findByRole('status')).toHaveTextContent('Zlecono ponowny import obecności')
    })
    it('does not expose administrator recovery to a trainer even if canPublish is true', () => {
        render(<AcademyRunDetail {...props} isAdmin={false} run={{ ...run, canPublish: true }} />)
        expect(screen.queryByRole('button', { name: 'Ponów import obecności' })).not.toBeInTheDocument()
    })
    it.each([
        { mode: 'external_link' as const }, { status: 'cancelled' as const },
        { attendanceWindowConfirmed: false }, { actualEndsAt: '2030-01-01T14:00:00Z' },
    ])('hides recovery for an ineligible session %j', patch => {
        render(<AcademyRunDetail {...props} run={{ ...run, sessions: [{ ...session, ...patch }] }} />)
        expect(screen.queryByRole('button', { name: 'Ponów import obecności' })).not.toBeInTheDocument()
    })
    it('explains disabled Graph integration without scheduling a request', () => {
        render(<AcademyRunDetail {...props} managedTeamsAvailable={false} />)
        expect(screen.getByRole('button', { name: 'Ponów import obecności' })).toBeDisabled()
        expect(screen.getByText(/Ponowienie wymaga włączonej integracji/)).toBeInTheDocument()
        expect(mocks.recover).not.toHaveBeenCalled()
    })
    it('keeps the control pending until the server responds and renders a retryable failure', async () => {
        let reject!: (error: Error) => void
        mocks.recover.mockReturnValue(new Promise((_, fail) => { reject = fail }))
        render(<AcademyRunDetail {...props} />)
        fireEvent.click(screen.getByRole('button', { name: 'Ponów import obecności' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Ponów import obecności' })).toBeDisabled())
        reject(new Error('connection lost'))
        expect(await screen.findByRole('alert')).toHaveTextContent('Operacja nie powiodła się. Spróbuj ponownie.')
        expect(screen.getByRole('button', { name: 'Ponów import obecności' })).toBeEnabled()
        expect(mocks.refresh).not.toHaveBeenCalled()
    })
})

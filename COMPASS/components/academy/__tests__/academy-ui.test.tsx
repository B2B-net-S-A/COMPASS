import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAcademyAction } from '../useAcademyAction'
import { localDateTime, zonedDateTimeToIso } from '../sessions/session-format'
import { AcademySessionForm } from '../sessions/AcademySessionForm'
import { AcademyAttendancePanel } from '../sessions/AcademyAttendancePanel'
import { CourseAuthorForm } from '@/components/learning/CourseAuthorForm'
import { CourseEditWizard } from '@/components/learning/CourseEditWizard'
import { saveAcademySession, recordAcademyAttendance } from '@/lib/actions/academy-sessions'
import { beginCourseDraft, createCourse, submitForReview } from '@/lib/actions/courses'
import type { CourseDetail } from '@/lib/types/learning'
import type { AcademySessionDTO, AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'

vi.mock('@/lib/actions/academy-sessions', () => ({ saveAcademySession: vi.fn(), confirmAcademySessionWindow: vi.fn(), recordAcademyAttendance: vi.fn() }))
vi.mock('@/lib/actions/courses', () => ({ beginCourseDraft: vi.fn(), createCourse: vi.fn(), updateCourse: vi.fn(), submitForReview: vi.fn() }))
vi.mock('@/components/learning/LessonsEditor', () => ({ LessonsEditor: () => <div>Edytor lekcji</div> }))
vi.mock('@/components/learning/QuizEditor', () => ({ QuizEditor: () => <div>Edytor pytań</div> }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [() => Promise.resolve(true), () => null] }))

afterEach(cleanup)

describe('Academy meeting times', () => {
    it('converts the same Warsaw wall time with the correct seasonal offset', () => {
        expect(zonedDateTimeToIso('2026-07-14T10:00', 'Europe/Warsaw')).toBe('2026-07-14T08:00:00.000Z')
        expect(zonedDateTimeToIso('2026-12-14T10:00', 'Europe/Warsaw')).toBe('2026-12-14T09:00:00.000Z')
        expect(localDateTime('2026-07-14T08:00:00Z', 'Europe/Warsaw')).toBe('2026-07-14T10:00')
    })
    it('rejects nonexistent and ambiguous DST times instead of silently moving the meeting', () => {
        expect(() => zonedDateTimeToIso('2026-03-29T02:30', 'Europe/Warsaw')).toThrow('nie istnieje')
        expect(() => zonedDateTimeToIso('2026-10-25T02:30', 'Europe/Warsaw')).toThrow('dwukrotnie')
        expect(zonedDateTimeToIso('2026-10-25T01:30', 'UTC')).toBe('2026-10-25T01:30:00.000Z')
        expect(() => zonedDateTimeToIso('2026-02-31T10:00', 'UTC')).toThrow()
    })
})

it('keeps a form pending while the action awaits and prevents duplicate submissions', async () => {
    let resolve!: () => void
    const action = vi.fn(() => new Promise<void>((done) => { resolve = done }))
    const { result } = renderHook(() => useAcademyAction())
    let pending!: Promise<void>
    act(() => { pending = result.current[1](action) })
    expect(result.current[0]).toBe(true)
    act(() => { void result.current[1](action) })
    expect(action).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(); await pending })
    expect(result.current[0]).toBe(false)
})

it('saves an external meeting in the selected zone and retains fields on an action failure', async () => {
    vi.mocked(saveAcademySession).mockResolvedValue({ success: false, error: 'Termin koliduje z innym spotkaniem.' })
    const saved = vi.fn()
    render(<AcademySessionForm runId="run" organizers={[]} managedTeamsAvailable={false} onSaved={saved} onCancel={vi.fn()} />)
    expect(screen.getByRole('option', { name: /Utwórz spotkanie w firmowym Teams/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Nazwa spotkania'), { target: { value: 'Warsztat Teams' } })
    fireEvent.change(screen.getByLabelText('Początek'), { target: { value: '2026-12-14T10:00' } })
    fireEvent.change(screen.getByLabelText('Koniec'), { target: { value: '2026-12-14T11:00' } })
    fireEvent.change(screen.getByLabelText('Link do spotkania Teams'), { target: { value: 'https://teams.microsoft.com/l/meetup-join/test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj spotkanie' }))
    await screen.findByRole('alert')
    expect(saveAcademySession).toHaveBeenCalledWith(expect.objectContaining({ startsAt: '2026-12-14T09:00:00.000Z', endsAt: '2026-12-14T10:00:00.000Z', mode: 'external_link', organizerId: null, required: true }))
    expect(saved).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nazwa spotkania')).toHaveValue('Warsztat Teams')
    expect(screen.getByRole('button', { name: 'Dodaj spotkanie' })).toBeEnabled()
})

it('allows live training without a quiz after its inactive threshold was cleared', async () => {
    vi.mocked(createCourse).mockResolvedValue({ success: true, data: { courseId: 'course', slug: 'test' } })
    render(<CourseAuthorForm />)
    fireEvent.change(screen.getByLabelText(/Tytuł szkolenia/), { target: { value: 'Warsztaty testowe' } })
    fireEvent.change(screen.getByLabelText('Kategoria'), { target: { value: 'Backend' } })
    fireEvent.change(screen.getByLabelText('Próg zaliczenia quizu (%)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('radio', { name: /Na żywo w Teams/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz szkic szkolenia' }))
    await waitFor(() => expect(createCourse).toHaveBeenCalledWith(expect.objectContaining({ delivery_mode: 'live', completion_rules: { quiz_required: false, quiz_pass_percent: 80, require_all_lessons: false, attendance_percent: 80 } })))
})

const course = { id: 'course', title: 'Warsztaty', category: 'Backend', status: 'draft', slug: 'warsztaty', delivery_mode: 'live', version_number: 1, completion_rules: { quiz_required: false, quiz_pass_percent: 80, require_all_lessons: false, attendance_percent: 80 } } as CourseDetail

it('submits a live program without lessons or quiz for administrator approval', async () => {
    vi.mocked(submitForReview).mockResolvedValue({ success: true, data: undefined })
    render(<CourseEditWizard course={course} initialLessons={[]} initialQuiz={[]} />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Akceptacja' }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('button', { name: 'Prześlij do akceptacji' }))
    await waitFor(() => expect(submitForReview).toHaveBeenCalledWith('course'))
})

it('locks published content and requires creating a new draft', async () => {
    vi.mocked(beginCourseDraft).mockResolvedValue({ success: true, data: 'new-version' })
    render(<CourseEditWizard course={{ ...course, status: 'published', published_version_id: 'published' }} initialLessons={[]} initialQuiz={[]} />)
    expect(screen.queryByLabelText(/Tytuł szkolenia/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz nową wersję' }))
    await waitFor(() => expect(beginCourseDraft).toHaveBeenCalledWith('course'))
})

it('requires a confirmed actual window and another reviewer before manual attendance', () => {
    const session = { id: 'session', title: 'Warsztat', status: 'scheduled', attendanceWindowConfirmed: false } as AcademySessionDTO
    const participant = { registrationId: 'reg', userId: 'learner', enrollmentId: 'enroll', email: 'learner@example.test', fullName: 'Uczestnik', status: 'confirmed', completedAt: null, attendance: [] } as AcademyRunParticipantDTO
    const { rerender } = render(<AcademyAttendancePanel participants={[participant]} sessions={[session]} userId="trainer" />)
    expect(screen.getByRole('button', { name: 'Potwierdź / skoryguj' })).toBeDisabled()
    rerender(<AcademyAttendancePanel participants={[participant]} sessions={[{ ...session, attendanceWindowConfirmed: true }]} userId="learner" />)
    expect(screen.queryByRole('button', { name: 'Potwierdź / skoryguj' })).not.toBeInTheDocument()
    rerender(<AcademyAttendancePanel participants={[participant]} sessions={[{ ...session, attendanceWindowConfirmed: true }]} userId="trainer" readOnly />)
    expect(screen.getByRole('button', { name: 'Potwierdź / skoryguj' })).toBeDisabled()
})

it('keeps unknown attendance unreviewed and submits only the explicitly confirmed duration', async () => {
    vi.mocked(recordAcademyAttendance).mockClear().mockResolvedValue({ success: true, data: { completed: true } })
    const session = { id: 'session', title: 'Warsztat', status: 'scheduled', attendanceWindowConfirmed: true } as AcademySessionDTO
    const participant = { registrationId: 'reg', userId: 'learner', enrollmentId: 'enroll', email: 'learner@example.test', fullName: 'Uczestnik', status: 'confirmed', completedAt: null, attendance: [] } as AcademyRunParticipantDTO
    render(<AcademyAttendancePanel participants={[participant]} sessions={[session]} userId="trainer" />)
    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź / skoryguj' }))
    const minutes = screen.getByLabelText('Potwierdzony czas obecności w minutach')
    expect(minutes).toBeRequired()
    expect(minutes).toHaveValue(null)
    fireEvent.change(screen.getByLabelText('Uzasadnienie decyzji'), { target: { value: 'Zweryfikowano obecność podczas warsztatu.' } })
    // Submit directly to exercise the guard even if browser form validation is bypassed.
    fireEvent.submit(minutes.closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Jeśli go nie znasz, pozostaw obecność do weryfikacji')
    expect(recordAcademyAttendance).not.toHaveBeenCalled()
    fireEvent.change(minutes, { target: { value: '48' } })
    fireEvent.submit(minutes.closest('form')!)
    await waitFor(() => expect(recordAcademyAttendance).toHaveBeenCalledWith({
        sessionId: 'session', enrollmentId: 'enroll', status: 'present', attendedSeconds: 2880,
        note: 'Zweryfikowano obecność podczas warsztatu.',
    }))
})

it('shows the existing manual decision evidence to the authorized facilitator', () => {
    const session = { id: 'session', title: 'Warsztat', status: 'scheduled', attendanceWindowConfirmed: true } as AcademySessionDTO
    const participant = { registrationId: 'reg', userId: 'learner', enrollmentId: 'enroll', email: 'learner@example.test', fullName: 'Uczestnik', status: 'confirmed', completedAt: null,
        attendance: [{ sessionId: 'session', status: 'present', attendedSeconds: 2880, source: 'manual', note: 'Lista uczestników oraz potwierdzone 48 minut zajęć.' }] } as AcademyRunParticipantDTO
    render(<AcademyAttendancePanel participants={[participant]} sessions={[session]} userId="trainer" />)
    expect(screen.getByText('Uzasadnienie decyzji: Lista uczestników oraz potwierdzone 48 minut zajęć.')).toBeInTheDocument()
    expect(screen.getByText(/48 min · ręcznie/)).toBeInTheDocument()
})

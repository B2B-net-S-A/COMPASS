import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CourseCard } from '../CourseCard'
import { CourseEditionCard } from '../CourseEditionCard'
import type { CourseDetail, CourseLesson } from '@/lib/types/learning'
import type { AcademyRunDTO } from '@/lib/types/academy-sessions'

const mocks = vi.hoisted(() => ({ register: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }))
vi.mock('@/lib/actions/academy-sessions', () => ({ registerAcademyRun: mocks.register }))
vi.mock('@/lib/actions/course-learning', () => ({ enrollInCourse: vi.fn(), completeAcademyCourse: vi.fn() }))
vi.mock('@/components/academy/CourseCompletion', () => ({ CourseCompletion: () => null }))
vi.mock('@/components/academy/EditionSurvey', () => ({ EditionSurvey: () => <p>ankieta edycji</p> }))
vi.mock('@/components/academy/CourseFeedback', () => ({ CourseFeedback: () => null }))
afterEach(cleanup)

const lesson = (id: string, title: string) => ({ id, title, estimated_minutes: 30, attachments: [], content_available: true }) as unknown as CourseLesson
const baseCourse = { id: 'c1', slug: 'pega', title: 'PEGA: podstawy', description: 'Opis szkolenia.', category: 'Platforma PEGA', tags: ['PEGA'], level: 'beginner', duration_minutes: 180, cover_image_url: null, author_name: 'Ewa Lis', ratings_count: 0, avg_rating: 0, lessons: [lesson('l1', 'Moduł pierwszy'), lesson('l2', 'Moduł drugi')], quiz_questions_count: 10, is_enrolled: false, delivery_mode: 'live', version_number: 2, completion_rules: { quiz_required: true, quiz_pass_percent: 70, require_all_lessons: false, attendance_percent: 80 } } as unknown as CourseDetail
const run = (patch: Partial<AcademyRunDTO> = {}) => ({ id: 'r1', courseId: 'c1', title: 'Grupa styczniowa', capacity: 60, confirmedCount: 41, waitlistCount: 0, status: 'published', myRegistration: null, sessions: [{ id: 's1', status: 'scheduled', title: 'Spotkanie', startsAt: '2027-01-19T09:00:00Z', endsAt: '2027-01-19T12:00:00Z', timeZone: 'Europe/Warsaw' }], ...patch }) as unknown as AcademyRunDTO
const open = { items: [], allCompleted: true }
const now = '2027-01-10T12:00:00Z'

describe('CourseCard', () => {
    it('offers the nearest edition of a live course and no separate enrolment box', () => {
        render(<CourseCard course={baseCourse} prerequisites={open} nearestRun={run()} now={now} />)
        const edition = screen.getByRole('region', { name: 'Najbliższa edycja' })
        expect(edition).toHaveTextContent('STY')
        expect(edition).toHaveTextContent('Wtorek, 10:00–13:00')
        expect(edition).toHaveTextContent('41 zapisanych z 60, wolne miejsca: 19')
        expect(within(edition).getByRole('button', { name: 'Zapisz się' })).toBeEnabled()
        expect(screen.queryByRole('link', { name: 'Wybierz termin' })).not.toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1, name: 'PEGA: podstawy' })).toBeInTheDocument()
    })
    it('does not show a sign-up to a learner with an unmet prerequisite in a self-paced course', () => {
        render(<CourseCard course={{ ...baseCourse, delivery_mode: 'self_paced' }} prerequisites={{ items: [{ id: 'p', title: 'Wstęp', slug: 'wstep', completed: false, available: true }], allCompleted: false }} nearestRun={null} now={now} />)
        expect(screen.queryByRole('button', { name: /Zapisz się i rozpocznij/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'Najbliższa edycja' })).not.toBeInTheDocument()
        expect(screen.getByText('Przed zapisem ukończ poniższe szkolenia.')).toBeInTheDocument()
    })
    it('enrols self-paced learners directly from the aside', () => {
        render(<CourseCard course={{ ...baseCourse, delivery_mode: 'self_paced' }} prerequisites={open} nearestRun={null} now={now} />)
        expect(screen.getByRole('button', { name: /Zapisz się i rozpocznij/ })).toBeInTheDocument()
    })
    it('keeps an enrolled learner in their own edition instead of offering the next one', () => {
        render(<CourseCard course={{ ...baseCourse, is_enrolled: true, enrollment_id: 'e1', run_id: 'r1', completed_lesson_ids: ['l1'] }} prerequisites={open} nearestRun={run({ myRegistration: { id: 'x', status: 'confirmed', enrollmentId: 'e1', completedAt: null } })} now={now} />)
        expect(screen.queryByRole('region', { name: 'Najbliższa edycja' })).not.toBeInTheDocument()
        expect(screen.getByRole('region', { name: 'Twoja edycja' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Spotkania i obecność' })).toHaveAttribute('href', '/learning/edycje/r1')
        expect(screen.getByText('1 z 2 ukończone')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Moduł drugi/ })).toHaveAttribute('href', '/learning/pega/lekcja/l2?enrollment=e1')
        expect(screen.getByText('ankieta edycji')).toBeInTheDocument()
    })
    it('shows lessons without links or progress before enrolment', () => {
        render(<CourseCard course={baseCourse} prerequisites={open} nearestRun={null} now={now} />)
        expect(screen.getByText('Moduł pierwszy')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Moduł pierwszy/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('progressbar', { name: 'Postęp programu' })).not.toBeInTheDocument()
    })
    it('explains a programme delivered only in meetings', () => {
        render(<CourseCard course={{ ...baseCourse, lessons: [] }} prerequisites={open} nearestRun={null} now={now} />)
        expect(screen.getByText('Program tego szkolenia jest realizowany podczas spotkań.')).toBeInTheDocument()
    })
    it('keeps the card usable when a secondary read fails', () => {
        render(<CourseCard course={baseCourse} prerequisitesError="błąd" nearestRun={null} nearestRunFailed now={now} />)
        expect(screen.getByRole('heading', { level: 1, name: 'PEGA: podstawy' })).toBeInTheDocument()
        expect(within(screen.getByRole('region', { name: 'Najbliższa edycja' })).getByRole('alert')).toHaveTextContent('Nie udało się wczytać terminów')
        expect(screen.getByText(/Nie udało się sprawdzić wymagań wstępnych/)).toBeInTheDocument()
    })
})

describe('CourseEditionCard', () => {
    const card = (value: AcademyRunDTO | null, prerequisitesMet = true) => <CourseEditionCard run={value} courseId="c1" prerequisitesMet={prerequisitesMet} now={now} />
    const session = { id: 's1', status: 'scheduled', startsAt: '2027-01-19T09:00:00Z', endsAt: '2027-01-19T12:00:00Z', timeZone: 'Europe/Warsaw', mode: 'external_link', joinUrl: 'https://teams.microsoft.com/meet/1' } as AcademyRunDTO['sessions'][number]
    it('says when no edition is open', () => {
        render(card(null))
        expect(screen.getByText(/Nie ma teraz otwartego terminu/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Otwórz kalendarz' })).toHaveAttribute('href', '/learning/kalendarz?course=c1')
    })
    it('switches to the waitlist when full and caps the bar at 100%', () => {
        const { container } = render(card(run({ capacity: 10, confirmedCount: 12, waitlistCount: 3 })))
        expect(screen.getByRole('button', { name: 'Dołącz do listy rezerwowej' })).toBeInTheDocument()
        expect(screen.getByText('Komplet miejsc, na liście rezerwowej: 3')).toBeInTheDocument()
        expect(container.querySelector('[role=progressbar] div')).toHaveStyle({ width: '100%' })
    })
    it('removes the sign-up button when the database would refuse it', () => {
        render(card(run({ sessions: [{ ...session, startsAt: '2027-01-09T09:00:00Z', endsAt: '2027-01-30T09:00:00Z' }] })))
        expect(screen.queryByRole('button', { name: /Zapisz się/ })).not.toBeInTheDocument()
        expect(screen.getByText('Zapisy na rozpoczętą edycję są zamknięte.')).toBeInTheDocument()
        expect(screen.getByText('Zapisy zamknięte')).toBeInTheDocument()
    })
    it('removes the sign-up button before prerequisites are met', () => {
        render(card(run(), false))
        expect(screen.queryByRole('button', { name: /Zapisz się/ })).not.toBeInTheDocument()
        expect(screen.getByText('Najpierw ukończ wymagane szkolenia wstępne.')).toBeInTheDocument()
    })
    it('registers in place and shows a refusal after reloading', async () => {
        mocks.register.mockResolvedValue({ success: false, error: 'Zapisy na rozpoczętą edycję są zamknięte.' })
        render(card(run()))
        fireEvent.click(screen.getByRole('button', { name: 'Zapisz się' }))
        await waitFor(() => expect(mocks.register).toHaveBeenCalledWith('r1'))
        expect(await screen.findByRole('alert')).toHaveTextContent('Zapisy na rozpoczętą')
        expect(mocks.refresh).toHaveBeenCalled()
    })
    it('gives a confirmed learner the Teams link and the calendar file', () => {
        render(card(run({ myRegistration: { id: 'x', status: 'confirmed', enrollmentId: 'e1', completedAt: null }, sessions: [session] })))
        expect(screen.getByRole('link', { name: 'Dołącz do Teams' })).toHaveAttribute('href', 'https://teams.microsoft.com/meet/1')
        expect(screen.getByRole('link', { name: 'Pobierz plik kalendarza' })).toHaveAttribute('href', '/api/academy/sessions/s1/calendar')
    })
    it('offers no calendar file for a managed meeting and says the link is coming', () => {
        render(card(run({ myRegistration: { id: 'x', status: 'confirmed', enrollmentId: 'e1', completedAt: null }, sessions: [{ ...session, mode: 'managed_teams', joinUrl: null }] })))
        expect(screen.queryByRole('link', { name: 'Pobierz plik kalendarza' })).not.toBeInTheDocument()
        expect(screen.getByText('Link do spotkania jest przygotowywany.')).toBeInTheDocument()
    })
    it('gives a waitlisted learner no link and no second sign-up', () => {
        render(card(run({ myRegistration: { id: 'x', status: 'waitlisted', enrollmentId: null, completedAt: null }, sessions: [session] })))
        expect(screen.getByText('Lista rezerwowa')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Dołącz do Teams' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Zapisz się/ })).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Szczegóły edycji i rezygnacja' })).toHaveAttribute('href', '/learning/edycje/r1')
    })
    it('ignores cancelled sessions when picking the displayed date', () => {
        render(card(run({ sessions: [{ id: 's0', status: 'cancelled', startsAt: '2027-01-05T09:00:00Z', endsAt: '2027-01-05T12:00:00Z', timeZone: 'Europe/Warsaw' }, { id: 's1', status: 'scheduled', startsAt: '2027-02-02T09:00:00Z', endsAt: '2027-02-02T12:00:00Z', timeZone: 'Europe/Warsaw' }] as AcademyRunDTO['sessions'] })))
        expect(screen.getByRole('region', { name: 'Najbliższa edycja' })).toHaveTextContent('LUT')
    })
})

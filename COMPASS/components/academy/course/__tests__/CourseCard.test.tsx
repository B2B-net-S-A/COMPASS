import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CourseCard } from '../CourseCard'
import { CourseEditionCard } from '../CourseEditionCard'
import type { CourseDetail, CourseLesson } from '@/lib/types/learning'
import type { AcademyRunDTO } from '@/lib/types/academy-sessions'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/actions/course-learning', () => ({ enrollInCourse: vi.fn(), completeAcademyCourse: vi.fn() }))
vi.mock('@/components/academy/CourseCompletion', () => ({ CourseCompletion: () => null }))
vi.mock('@/components/academy/EditionSurvey', () => ({ EditionSurvey: () => <p>ankieta edycji</p> }))
vi.mock('@/components/academy/CourseFeedback', () => ({ CourseFeedback: () => null }))
afterEach(cleanup)

const lesson = (id: string, title: string) => ({ id, title, estimated_minutes: 30, attachments: [], content_available: true }) as unknown as CourseLesson
const baseCourse = { id: 'c1', slug: 'pega', title: 'PEGA: podstawy', description: 'Opis szkolenia.', category: 'Platforma PEGA', tags: ['PEGA'], level: 'beginner', duration_minutes: 180, cover_image_url: null, author_name: 'Ewa Lis', ratings_count: 0, avg_rating: 0, lessons: [lesson('l1', 'Moduł pierwszy'), lesson('l2', 'Moduł drugi')], quiz_questions_count: 10, is_enrolled: false, delivery_mode: 'live', version_number: 2, completion_rules: { quiz_required: true, quiz_pass_percent: 70, require_all_lessons: false, attendance_percent: 80 } } as unknown as CourseDetail
const run = (patch: Partial<AcademyRunDTO> = {}) => ({ id: 'r1', courseId: 'c1', title: 'Grupa styczniowa', capacity: 60, confirmedCount: 41, waitlistCount: 0, status: 'published', myRegistration: null, sessions: [{ id: 's1', status: 'scheduled', title: 'Spotkanie', startsAt: '2027-01-19T09:00:00Z', endsAt: '2027-01-19T12:00:00Z', timeZone: 'Europe/Warsaw' }], ...patch }) as unknown as AcademyRunDTO
const open = { items: [], allCompleted: true }

describe('CourseCard', () => {
    it('offers the nearest edition of a live course and no separate enrolment box', () => {
        render(<CourseCard course={baseCourse} prerequisites={open} nearestRun={run()} />)
        const edition = screen.getByRole('region', { name: 'Najbliższa edycja' })
        expect(edition).toHaveTextContent('STY')
        expect(edition).toHaveTextContent('Wtorek, 10:00–13:00')
        expect(edition).toHaveTextContent('41 zapisanych z 60, wolne miejsca: 19')
        expect(within(edition).getByRole('link', { name: 'Zapisz się' })).toHaveAttribute('href', '/learning/edycje/r1')
        expect(screen.queryByRole('link', { name: 'Wybierz termin' })).not.toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1, name: 'PEGA: podstawy' })).toBeInTheDocument()
    })
    it('does not show a sign-up to a learner with an unmet prerequisite in a self-paced course', () => {
        render(<CourseCard course={{ ...baseCourse, delivery_mode: 'self_paced' }} prerequisites={{ items: [{ id: 'p', title: 'Wstęp', slug: 'wstep', completed: false, available: true }], allCompleted: false }} nearestRun={null} />)
        expect(screen.queryByRole('button', { name: /Zapisz się i rozpocznij/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'Najbliższa edycja' })).not.toBeInTheDocument()
        expect(screen.getByText('Przed zapisem ukończ poniższe szkolenia.')).toBeInTheDocument()
    })
    it('enrols self-paced learners directly from the aside', () => {
        render(<CourseCard course={{ ...baseCourse, delivery_mode: 'self_paced' }} prerequisites={open} nearestRun={null} />)
        expect(screen.getByRole('button', { name: /Zapisz się i rozpocznij/ })).toBeInTheDocument()
    })
    it('keeps an enrolled learner in their own edition instead of offering the next one', () => {
        render(<CourseCard course={{ ...baseCourse, is_enrolled: true, enrollment_id: 'e1', run_id: 'r9', completed_lesson_ids: ['l1'] }} prerequisites={open} nearestRun={null} />)
        expect(screen.queryByRole('region', { name: 'Najbliższa edycja' })).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Spotkania i obecność' })).toHaveAttribute('href', '/learning/edycje/r9')
        expect(screen.getByText('1 z 2 ukończone')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Moduł drugi/ })).toHaveAttribute('href', '/learning/pega/lekcja/l2?enrollment=e1')
        expect(screen.getByText('ankieta edycji')).toBeInTheDocument()
    })
    it('shows lessons without links or progress before enrolment', () => {
        render(<CourseCard course={baseCourse} prerequisites={open} nearestRun={null} />)
        expect(screen.getByText('Moduł pierwszy')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Moduł pierwszy/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('progressbar', { name: 'Postęp programu' })).not.toBeInTheDocument()
    })
    it('explains a programme delivered only in meetings', () => {
        render(<CourseCard course={{ ...baseCourse, lessons: [] }} prerequisites={open} nearestRun={null} />)
        expect(screen.getByText('Program tego szkolenia jest realizowany podczas spotkań.')).toBeInTheDocument()
    })
    it('keeps the card usable when a secondary read fails', () => {
        render(<CourseCard course={baseCourse} prerequisitesError="błąd" nearestRun={null} nearestRunFailed />)
        expect(screen.getByRole('heading', { level: 1, name: 'PEGA: podstawy' })).toBeInTheDocument()
        expect(within(screen.getByRole('region', { name: 'Najbliższa edycja' })).getByRole('alert')).toHaveTextContent('Nie udało się wczytać terminów')
        expect(screen.getByText(/Nie udało się sprawdzić wymagań wstępnych/)).toBeInTheDocument()
    })
})

describe('CourseEditionCard', () => {
    it('says when no edition is open', () => {
        render(<CourseEditionCard run={null} courseId="c1" />)
        expect(screen.getByText(/Nie ma teraz otwartego terminu/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Otwórz kalendarz' })).toHaveAttribute('href', '/learning/kalendarz?course=c1')
    })
    it('switches to the waitlist when full and caps the bar at 100%', () => {
        const { container } = render(<CourseEditionCard run={run({ capacity: 10, confirmedCount: 12, waitlistCount: 3 })} courseId="c1" />)
        expect(screen.getByRole('link', { name: 'Dołącz do listy rezerwowej' })).toBeInTheDocument()
        expect(screen.getByText('Komplet miejsc, na liście rezerwowej: 3')).toBeInTheDocument()
        expect(container.querySelector('[role=progressbar] div')).toHaveStyle({ width: '100%' })
    })
    it('shows the learner their registration instead of a sign-up', () => {
        render(<CourseEditionCard run={run({ myRegistration: { id: 'x', status: 'waitlisted', enrollmentId: null, completedAt: null } })} courseId="c1" />)
        expect(screen.getByText('Lista rezerwowa')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Otwórz edycję' })).toBeInTheDocument()
        expect(screen.queryByText(/Po zapisie dostaniesz/)).not.toBeInTheDocument()
    })
    it('ignores cancelled sessions when picking the displayed date', () => {
        render(<CourseEditionCard run={run({ sessions: [{ id: 's0', status: 'cancelled', startsAt: '2027-01-05T09:00:00Z', endsAt: '2027-01-05T12:00:00Z', timeZone: 'Europe/Warsaw' }, { id: 's1', status: 'scheduled', startsAt: '2027-02-02T09:00:00Z', endsAt: '2027-02-02T12:00:00Z', timeZone: 'Europe/Warsaw' }] as AcademyRunDTO['sessions'] })} courseId="c1" />)
        expect(screen.getByRole('region', { name: 'Najbliższa edycja' })).toHaveTextContent('LUT')
    })
})

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCatalogFilters, catalogHref } from '../catalog/catalog-filters'
import { getCatalogNextRuns } from '../catalog/catalog-runs'
import { calendarDay, calendarHref, calendarMonthDays, calendarSessions, shiftCalendarMonth } from '../sessions/calendar-model'
import { AcademyCalendar } from '../sessions/AcademyCalendar'
import { AcademyRunList } from '../sessions/AcademyRunList'
import { CourseLearnerPreview } from '../CourseLearnerPreview'
import { CoursePrerequisitesEditor } from '../CoursePrerequisitesEditor'
import { AcademyPrerequisites } from '../AcademyPrerequisites'
import { listAcademyPrerequisiteChoices } from '@/lib/actions/academy-discovery'
import type { AcademyRunDTO, AcademySessionDTO } from '@/lib/types/academy-sessions'
import type { CourseDetail, CourseLesson, CourseQuizQuestionAuthor } from '@/lib/types/learning'

vi.mock('@/lib/actions/academy-discovery', () => ({ listAcademyPrerequisiteChoices: vi.fn() }))
vi.mock('../AcademyVideo', () => ({ AcademyVideo: () => <div>Wideo prywatne</div> }))
afterEach(cleanup)

const session = (id: string, startsAt: string, patch: Partial<AcademySessionDTO> = {}): AcademySessionDTO => ({ id, title: `Warsztat ${id}`, startsAt, endsAt: new Date(Date.parse(startsAt) + 3600000).toISOString(), status: 'scheduled', timeZone: 'Europe/Warsaw', ...patch } as AcademySessionDTO)
const run = (id: string, sessions: AcademySessionDTO[], patch: Partial<AcademyRunDTO> = {}): AcademyRunDTO => ({ id, courseId: 'course', courseTitle: 'Praktyczny TypeScript', title: `Edycja ${id}`, status: 'published', capacity: 10, confirmedCount: 5, myRegistration: null, sessions, ...patch } as AcademyRunDTO)
const now = '2026-09-22T12:00:00Z'

describe('catalogue discovery', () => {
    it('roundtrips category and instructor across format and pagination links', () => {
        const filters = parseCatalogFilters({ q: '  dane  ', category: 'AI/ML', instructor: '00000000-0000-4000-8000-000000000001', format: 'live' })
        const href = catalogHref(filters, 3)
        const query = Object.fromEntries(new URL(href, 'https://compass.test').searchParams)
        expect(parseCatalogFilters(query)).toEqual(filters)
        expect(query.page).toBe('3')
        expect(parseCatalogFilters({ instructor: 'invalid', category: ['Cloud'], format: 'wrong' })).toMatchObject({ instructorId: undefined, category: undefined, deliveryMode: undefined })
    })
    it('chooses a future published edition and skips drafts, cancellations and editions already started', () => {
        const runs = [run('draft', [session('1', '2026-09-23T09:00:00Z')], { status: 'draft' }), run('started', [session('2', '2026-09-21T09:00:00Z'), session('3', '2026-09-25T09:00:00Z')]), run('later', [session('4', '2026-10-02T09:00:00Z')]), run('next', [session('5', '2026-09-24T09:00:00Z'), session('6', '2026-09-23T09:00:00Z', { status: 'cancelled' })], { confirmedCount: 10 })]
        expect(getCatalogNextRuns(runs, now).course).toMatchObject({ runId: 'next', full: true, startsAt: '2026-09-24T09:00:00Z' })
    })
})

describe('monthly calendar', () => {
    it('uses Warsaw day boundaries, Monday weeks, leap years and year rollover', () => {
        expect(calendarDay('2026-09-30T23:30:00Z')).toBe('2026-10-01')
        expect(shiftCalendarMonth('2026-12', 1)).toBe('2027-01')
        expect(shiftCalendarMonth('2026-01', -1)).toBe('2025-12')
        const days = calendarMonthDays('2028-02')
        expect(days).toContain('2028-02-29')
        expect(new Date(`${days[0]}T12:00:00Z`).getUTCDay()).toBe(1)
        expect(days.length % 7).toBe(0)
    })
    it('keeps only confirmed/waitlisted personal bookings and excludes cancelled meetings', () => {
        const runs = [run('mine', [session('1', '2026-09-23T09:00:00Z')], { myRegistration: { status: 'waitlisted' } as AcademyRunDTO['myRegistration'] }), run('other', [session('2', '2026-09-24T09:00:00Z')]), run('cancelled', [session('3', '2026-09-25T09:00:00Z', { status: 'cancelled' })])]
        expect(calendarSessions(runs, '2026-09', true).map((item) => item.session.id)).toEqual(['1'])
        expect(calendarSessions(runs, '2026-09', false)).toHaveLength(2)
    })
    it('navigates month, personal scope and pages with stable links', () => {
        render(<AcademyCalendar now={now} month="2026-09" mine={false} page={1} hasMore={true} runs={[run('test', [session('1', '2026-09-23T09:00:00Z')])]} />)
        expect(screen.getByRole('heading', { name: 'wrzesień 2026' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Następny miesiąc' })).toHaveAttribute('href', calendarHref('2026-10', false))
        expect(screen.getByRole('link', { name: 'Moje zapisy' })).toHaveAttribute('href', calendarHref('2026-09', true))
        expect(screen.getByRole('link', { name: 'Następna strona' })).toHaveAttribute('href', calendarHref('2026-09', false, undefined, 2))
        expect(screen.getByRole('link', { name: 'Dzisiaj' })).toHaveAttribute('href', calendarHref('2026-09', false))
    })
})

it('links an assigned trainer to older edition pages without dropping the selected course', () => {
    render(<AcademyRunList runs={[run('older', [])]} courseId="course" versionId={null} canCreate={false} page={3} hasMore={true} />)
    expect(screen.getByRole('link', { name: /Edycja older/ })).toHaveAttribute('href', '/learning/edycje/older')
    expect(screen.getByRole('link', { name: 'Poprzednie' })).toHaveAttribute('href', '/learning/tworze/course/edycje?page=2')
    expect(screen.getByRole('link', { name: 'Następne' })).toHaveAttribute('href', '/learning/tworze/course/edycje?page=4')
})

it('previews saved lesson markdown and checks a quiz locally', () => {
    const course = { title: 'Żółć i TypeScript', category: 'Backend', delivery_mode: 'self_paced', completion_rules: { quiz_required: true, quiz_pass_percent: 80, require_all_lessons: true } } as CourseDetail
    const lessons = [{ id: 'lesson', title: 'Lekcja przykładowa', content_md: '**Ważna treść**', attachments: [] }] as unknown as CourseLesson[]
    const quiz = [{ id: 'question', question_text: 'Wybierz odpowiedź', options: [{ id: 'a', option_text: 'Poprawna', is_correct: true }, { id: 'b', option_text: 'Inna', is_correct: false }] }] as CourseQuizQuestionAuthor[]
    render(<CourseLearnerPreview course={course} lessons={lessons} quiz={quiz} />)
    expect(screen.getByText('Ważna treść').tagName).toBe('STRONG')
    expect(screen.getByRole('button', { name: 'Sprawdź wynik w podglądzie' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'Poprawna' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sprawdź wynik w podglądzie' }))
    expect(screen.getByRole('status')).toHaveTextContent('100%')
    expect(screen.getByRole('status')).toHaveTextContent('Nie zapisano próby quizu')
})

it('adds and removes a prerequisite without losing an unavailable selected course', async () => {
    vi.mocked(listAcademyPrerequisiteChoices).mockResolvedValue({ success: true, data: [{ id: 'new', title: 'Podstawy', slug: 'podstawy' }] })
    const change = vi.fn()
    render(<CoursePrerequisitesEditor value={['old']} onChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: 'Wyszukaj' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Podstawy' }))
    expect(change).toHaveBeenCalledWith(['old', 'new'])
    fireEvent.click(screen.getByRole('button', { name: 'Usuń wymaganie: old' }))
    expect(change).toHaveBeenCalledWith([])
    await waitFor(() => expect(listAcademyPrerequisiteChoices).toHaveBeenCalledWith({ search: '', excludeCourseId: undefined }))
})

it('shows missing, completed and unavailable prerequisites clearly', () => {
    render(<AcademyPrerequisites status={{ allCompleted: false, items: [{ id: '1', title: 'Podstawy', slug: 'podstawy', completed: false, available: true }, { id: '2', title: 'Archiwum', slug: null, completed: false, available: false }, { id: '3', title: 'Wstęp', slug: null, completed: true, available: false }] }} />)
    expect(screen.getByRole('link', { name: 'Podstawy' })).toHaveAttribute('href', '/learning/podstawy')
    expect(screen.getByText('Przed zapisem ukończ poniższe szkolenia.')).toBeInTheDocument()
    expect(screen.getByText('Ukończone')).toBeInTheDocument()
    expect(screen.getByText(/Skontaktuj się z administratorem/)).toBeInTheDocument()
})

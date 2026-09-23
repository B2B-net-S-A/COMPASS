import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileMenu } from '@/components/layout/MobileMenu'
import { AcademyMyLearning } from '../AcademyMyLearning'
import { AcademyRolloutPanel } from '../AcademyRolloutPanel'
import { AcademyReport } from '../AcademyReport'
import { academyResumeHref } from '@/lib/academy/navigation'
import { listAcademyTrainers, setAcademyRollout } from '@/lib/actions/academy-access'
import type { CourseEnrollmentWithProgress, Course } from '@/lib/types/learning'
import type { AcademyMyRunOverview } from '@/lib/types/academy-sessions'

vi.mock('@/lib/i18n/context', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/actions/academy-access', () => ({ listAcademyTrainers: vi.fn(), setAcademyRollout: vi.fn() }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [() => Promise.resolve(true), () => null] }))
afterEach(cleanup)
const enrollment = { enrollment_id: 'enrollment', course: { id: 'course', slug: 'wersja', title: 'Zapisany program', delivery_mode: 'self_paced', version_number: 1 } as Course, enrolled_at: '2026-09-01T10:00:00Z', completed_lessons: [], total_lessons: 3, completed_at: null, points_awarded: false, progress_percent: 0, last_accessed_at: null, last_accessed_lesson_id: null } satisfies CourseEnrollmentWithProgress
const emptyOverview = { waiting: { items: [], total: 0, page: 1, pageSize: 25 }, upcoming: null } satisfies AcademyMyRunOverview
const waitlistedOverview = { waiting: { items: [{ runId: 'run', courseTitle: 'Spotkanie testowe', runTitle: 'Grupa wrześniowa' }], total: 1, page: 1, pageSize: 25 }, upcoming: null } satisfies AcademyMyRunOverview

describe('learner navigation and personal progress', () => {
    it('keeps self-paced links pinned and sends blended learners to their own run', () => {
        expect(academyResumeHref(enrollment)).toBe('/learning/wersja/lekcja/first?enrollment=enrollment')
        expect(academyResumeHref({ ...enrollment, run_id: 'my-run' })).toBe('/learning/edycje/my-run')
    })
    it('shows waitlist participation even before an enrollment exists', () => {
        render(<AcademyMyLearning enrollments={[]} overview={waitlistedOverview} />)
        expect(screen.getByRole('link', { name: 'Szczegóły i rezygnacja' })).toHaveAttribute('href', '/learning/edycje/run')
        expect(screen.queryByText('Wybierz pierwsze szkolenie')).not.toBeInTheDocument()
    })
    it('never presents zero lesson progress for a live-only course', () => {
        render(<AcademyMyLearning enrollments={[{ ...enrollment, total_lessons: 0, run_id: 'run', course: { ...enrollment.course, delivery_mode: 'live' } }]} overview={emptyOverview} />)
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
        expect(screen.getByText(/Oczekuje na potwierdzenie obecności/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Otwórz edycję' })).toHaveAttribute('href', '/learning/edycje/run')
    })
    it('preserves a revoked completion as history without an available certificate', () => {
        render(<AcademyMyLearning enrollments={[{ ...enrollment, completed_at: '2026-09-20T10:00:00Z', completion_revoked_at: '2026-09-22T10:00:00Z', completion_revoked_reason: 'Korekta obecności' }]} overview={emptyOverview} />)
        expect(screen.getByText('Historia unieważnionych ukończeń')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Certyfikat' })).not.toBeInTheDocument()
        expect(screen.getByText('Powód: Korekta obecności')).toBeInTheDocument()
    })
    it('shows exact totals and paginates each enrollment section independently', () => {
        render(<AcademyMyLearning enrollments={[enrollment]} pagination={{
            items: [enrollment], totals: { active: 1005, completed: 25, revoked: 0 },
            activePage: 42, completedPage: 2, revokedPage: 1, pageSize: 24,
        }} overview={emptyOverview} />)
        expect(screen.getByText('Do rozpoczęcia i w trakcie (1005)')).toBeInTheDocument()
        expect(screen.getByRole('navigation', { name: 'Strony aktywnych szkoleń' })).toHaveTextContent('Strona 42 z 42 · łącznie 1005')
        expect(screen.getByRole('navigation', { name: 'Strony aktywnych szkoleń' }).querySelector('a')).toHaveAttribute('href', '/learning/moje?activePage=41&completedPage=2&revokedPage=1&waitlistPage=1')
        expect(screen.getByRole('navigation', { name: 'Strony ukończonych szkoleń' })).toHaveTextContent('Strona 2 z 2 · łącznie 25')
        expect(screen.getByRole('navigation', { name: 'Strony ukończonych szkoleń' }).querySelector('a')).toHaveAttribute('href', '/learning/moje?activePage=42&completedPage=1&revokedPage=1&waitlistPage=1')
    })
    it('paginates a large waitlist and keeps the enrollment pages', () => {
        render(<AcademyMyLearning enrollments={[enrollment]} pagination={{
            items: [enrollment], totals: { active: 25, completed: 0, revoked: 0 },
            activePage: 2, completedPage: 1, revokedPage: 1, pageSize: 24,
        }} overview={{ waiting: { items: [{ runId: 'run', courseTitle: 'Szkolenie', runTitle: 'Edycja' }], total: 1001, page: 41, pageSize: 25 }, upcoming: { runId: 'run', sessionTitle: 'Spotkanie za rok', startsAt: '2030-09-15T10:00:00Z', timeZone: 'Europe/Warsaw' } }} />)
        expect(screen.getByText('Lista rezerwowa (1001)')).toBeInTheDocument()
        const nav = screen.getByRole('navigation', { name: 'Strony listy rezerwowej' })
        expect(nav).toHaveTextContent('Strona 41 z 41 · łącznie 1001')
        expect(nav.querySelector('a')).toHaveAttribute('href', '/learning/moje?activePage=2&completedPage=1&revokedPage=1&waitlistPage=40')
        expect(screen.getByRole('link', { name: 'Otwórz spotkanie' })).toHaveAttribute('href', '/learning/edycje/run')
    })
})

it('keeps pilot participants selected and exposes actionable errors without changing the mode', async () => {
    vi.mocked(listAcademyTrainers).mockResolvedValue({ success: true, data: [{ id: 'user', full_name: 'Anna Żak', email: 'anna@example.test', role: 'consultant', canTeach: false, grantedAt: null }] })
    vi.mocked(setAcademyRollout).mockResolvedValue({ success: false, error: 'Nie udało się zapisać polityki.' })
    render(<AcademyRolloutPanel initial={{ mode: 'closed', participants: [] }} />)
    fireEvent.change(screen.getByLabelText('Tryb dostępu'), { target: { value: 'pilot' } })
    fireEvent.change(screen.getByLabelText('Znajdź konto do pilota'), { target: { value: 'Anna' } })
    fireEvent.click(screen.getByRole('button', { name: 'Szukaj do pilota' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dodaj do pilota' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz dostępność' }))
    await waitFor(() => expect(setAcademyRollout).toHaveBeenCalledWith({ mode: 'pilot', userIds: ['user'] }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się zapisać polityki.')
    expect(screen.getByLabelText('Tryb dostępu')).toHaveValue('pilot')
    expect(screen.getByRole('button', { name: 'Usuń z pilota: Anna Żak' })).toBeEnabled()
})

it('shows a distinct empty report instead of an empty data table', () => {
    render(<AcademyReport metrics={[{ label: 'Zapisy', value: 0 }]} rows={[]} />)
    expect(screen.getByText('Brak szkoleń w tym raporcie')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
})


it.each([
    ['consultant', true, true], ['consultant', false, false], ['admin', true, true], ['manager', true, false], ['internal', true, false],
] as const)('mobile navigation for %s with rollout %s keeps Academy visibility %s', (role, academyEnabled, visible) => {
    render(<MobileMenu role={role} user={null} academyEnabled={academyEnabled} />)
    fireEvent.click(screen.getByTestId('mobile-nav-more'))
    if (visible) expect(screen.getByRole('link', { name: 'Akademia' })).toHaveAttribute('href', '/learning')
    else expect(screen.queryByRole('link', { name: 'Akademia' })).not.toBeInTheDocument()
})

it('requires a participant before saving pilot mode', () => {
    render(<AcademyRolloutPanel initial={{ mode: 'closed', participants: [] }} />)
    fireEvent.change(screen.getByLabelText('Tryb dostępu'), { target: { value: 'pilot' } })
    expect(screen.getByRole('button', { name: 'Zapisz dostępność' })).toBeDisabled()
    expect(screen.getByText('Wybierz co najmniej jedno konto przed zapisaniem pilota.')).toBeInTheDocument()
})


it('does not claim there are no registrations when the runs read failed', () => {
    render(<AcademyMyLearning enrollments={[]} overview={undefined} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się wczytać wszystkich zapisów')
    expect(screen.queryByText('Wybierz pierwsze szkolenie')).not.toBeInTheDocument()
})

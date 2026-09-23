import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AcademyReviewHistory } from '../AcademyReviewHistory'
import type { ActionResult } from '@/lib/types/learning'
import type { AcademyReviewHistoryItem, AcademyReviewHistoryPage } from '@/lib/types/academy-review-history'
const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/actions/academy-review-history', () => ({ getAcademyReviewHistory: mocks.get }))
const item: AcademyReviewHistoryItem = { id: 'first', action: 'COURSE_REJECTED', createdAt: '2026-09-22T12:00:00.123456Z', actorName: 'Moderator', versionNumber: 1, submissionId: null, reason: 'Popraw historyczny program <script>alert(1)</script>', approved: null }
const cursor = { createdAt: item.createdAt, id: item.id }
const success = (items: AcademyReviewHistoryItem[], nextCursor: AcademyReviewHistoryPage['nextCursor'] = null): ActionResult<AcademyReviewHistoryPage> => ({ success: true, data: { items, nextCursor } })
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(success([item])) })
afterEach(cleanup)

describe('Review history', () => {
    it('renders historical reasons as text and explicitly identifies absent submission evidence', async () => {
        const view = render(<AcademyReviewHistory courseId="course" />)
        expect(await screen.findByText('Odrzucono — wymagane poprawki')).toBeInTheDocument()
        expect(screen.getByText(item.reason!)).toBeInTheDocument()
        expect(view.container.querySelector('script')).toBeNull()
        expect(screen.getByText('Brak identyfikatora zgłoszenia w historycznym wpisie.')).toBeInTheDocument()
        expect(screen.getByText('Wersja 1')).toBeInTheDocument()
    })
    it('loads older pages with the exact cursor and preserves the visible first page', async () => {
        mocks.get.mockResolvedValueOnce(success([item], cursor)).mockResolvedValueOnce(success([{ ...item, id: 'older', action: 'COURSE_PUBLISHED', reason: null, submissionId: 'submission-from-audit' }]))
        render(<AcademyReviewHistory courseId="course" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Wczytaj starsze decyzje' }))
        expect(await screen.findByText('Zatwierdzono i opublikowano')).toBeInTheDocument()
        expect(screen.getByText(item.reason!)).toBeInTheDocument()
        expect(mocks.get).toHaveBeenLastCalledWith({ courseId: 'course', cursor })
        expect(screen.getByText('Zgłoszenie: submission-from-audit')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Wczytaj starsze decyzje' })).not.toBeInTheDocument()
    })
    it('keeps existing rows after a network error and permits retrying the same page', async () => {
        mocks.get.mockResolvedValueOnce(success([item], cursor)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(success([]))
        render(<AcademyReviewHistory courseId="course" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Wczytaj starsze decyzje' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się wczytać starszych decyzji')
        expect(screen.getByText(item.reason!)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Wczytaj starsze decyzje' }))
        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
        expect(mocks.get).toHaveBeenLastCalledWith({ courseId: 'course', cursor })
    })
    it('shows an authorization failure instead of an empty successful history', async () => {
        mocks.get.mockResolvedValue({ success: false, error: 'Brak uprawnień do historii.' })
        render(<AcademyReviewHistory courseId="course" />)
        expect(await screen.findByRole('alert')).toHaveTextContent('Brak uprawnień')
        expect(screen.queryByText('Brak zapisanych zgłoszeń i decyzji.')).not.toBeInTheDocument()
    })
    it('does not render an older request after navigating to another course', async () => {
        let resolveFirst!: (value: ActionResult<AcademyReviewHistoryPage>) => void
        mocks.get.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve })).mockResolvedValueOnce(success([]))
        const view = render(<AcademyReviewHistory courseId="first-course" />)
        view.rerender(<AcademyReviewHistory courseId="second-course" />)
        expect(await screen.findByText('Brak zapisanych zgłoszeń i decyzji.')).toBeInTheDocument()
        await act(async () => { resolveFirst(success([item])) })
        expect(screen.queryByText(item.reason!)).not.toBeInTheDocument()
    })
    it('refreshes after a new submission without keeping an obsolete cursor', async () => {
        mocks.get.mockResolvedValueOnce(success([item], cursor)).mockResolvedValueOnce(success([{ ...item, id: 'new', action: 'COURSE_REVIEW_SUBMITTED', reason: null, submissionId: 'new-token' }]))
        const view = render(<AcademyReviewHistory courseId="course" refreshKey="first" />)
        await screen.findByText(item.reason!)
        view.rerender(<AcademyReviewHistory courseId="course" refreshKey="second" />)
        expect(await screen.findByText('Przesłano do akceptacji')).toBeInTheDocument()
        expect(screen.queryByText(item.reason!)).not.toBeInTheDocument()
        expect(mocks.get).toHaveBeenLastCalledWith({ courseId: 'course' })
    })
})

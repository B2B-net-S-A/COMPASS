import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QuizForm } from '../QuizForm'
import { submitQuizAttempt } from '@/lib/actions/course-learning'
import { quizAttemptWindowMessage } from '@/lib/academy/quiz-attempt-policy'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [async () => true, () => null] }))
vi.mock('@/lib/actions/course-learning', () => ({ submitQuizAttempt: vi.fn() }))

const props = {
    courseId: 'course', courseSlug: 'quiz-course', enrollmentId: 'enrollment', passPercent: 80,
    questions: [{ question_id: 'question', question_order: 1, question_text: 'Pytanie?', options: [
        { id: 'option', option_text: 'Odpowiedź', order_index: 0 },
    ] }],
}

beforeEach(() => vi.mocked(submitQuizAttempt).mockResolvedValue({ success: false, error: quizAttemptWindowMessage }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shows the pinned limit and prevents a misleading immediate retry after exhaustion', async () => {
    render(<QuizForm {...props} attemptLimit={3} attemptWindowHours={24} />)
    expect(screen.getByText(/maksymalnie 3 próby w ruchomych 24 godzinach/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Odpowiedź/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij odpowiedzi' }))
    await waitFor(() => expect(submitQuizAttempt).toHaveBeenCalledWith('course', [{ question_id: 'question', selected_option_id: 'option' }], 'enrollment'))
    expect(await screen.findByRole('alert')).toHaveTextContent(quizAttemptWindowMessage)
    expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).not.toBeInTheDocument()
})

it('keeps the previous retry wording for an existing version with no pinned limit', () => {
    render(<QuizForm {...props} attemptLimit={null} attemptWindowHours={null} />)
    expect(screen.getByText(/Możesz ponowić próbę/)).toBeInTheDocument()
    expect(screen.queryByText(/maksymalnie 3 próby/)).not.toBeInTheDocument()
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QuizSessionForm } from '../QuizSessionForm'
import { finishQuizAttempt, saveQuizAnswer } from '@/lib/actions/course-learning'
import type { QuizAttemptSession } from '@/lib/types/learning'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [async () => true, () => null] }))
vi.mock('@/components/learning/MarkdownView', () => ({ MarkdownView: ({ content }: { content: string }) => <p>{content}</p> }))
vi.mock('@/lib/actions/course-learning', () => ({ saveQuizAnswer: vi.fn(), finishQuizAttempt: vi.fn() }))

const session = (overrides: Partial<QuizAttemptSession> = {}): QuizAttemptSession => ({
    attempt_id: 'attempt', kind: 'final', status: 'in_progress', has_time_limit: true, remaining_seconds: 600, pass_percent: 80,
    questions: [
        { question_id: 'q1', position: 1, question_text: 'Pierwsze?', selected_option_id: null, options: [{ id: 'a1', option_text: 'Tak' }, { id: 'a2', option_text: 'Nie' }] },
        { question_id: 'q2', position: 2, question_text: 'Drugie?', selected_option_id: null, options: [{ id: 'b1', option_text: 'Może' }, { id: 'b2', option_text: 'Nigdy' }] },
    ], ...overrides,
})
const renderForm = (value = session()) => render(<QuizSessionForm session={value} courseSlug="kurs" enrollmentId="enrollment" />)

beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(saveQuizAnswer).mockResolvedValue({ success: true, data: { saved: true, remaining_seconds: 500 } })
    vi.mocked(finishQuizAttempt).mockResolvedValue({ success: true, data: { attempt_id: 'attempt', score_percent: 100, passed: true, already_awarded: false, award_status: 'completed' } })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers() })

it('autozapisuje wybór i pokazuje postęp', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('radio', { name: /Tak/ }))
    await waitFor(() => expect(saveQuizAnswer).toHaveBeenCalledWith('attempt', 'q1', 'a1'))
    expect(screen.getByText('Odpowiedziano 1 z 2')).toBeInTheDocument()
    expect(await screen.findByText('Odpowiedzi zapisane')).toBeInTheDocument()
})

it('po utracie sieci trzyma odpowiedź na urządzeniu i ponawia, gdy sieć wróci', async () => {
    vi.mocked(saveQuizAnswer).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderForm()
    fireEvent.click(screen.getByRole('radio', { name: /Tak/ }))
    expect(await screen.findByText(/Brak sieci/)).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('academy-quiz-attempt') ?? '{}')).toEqual({ q1: 'a1' })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(saveQuizAnswer).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Odpowiedzi zapisane')).toBeInTheDocument()
})

it('odtwarza po odświeżeniu odpowiedź z urządzenia i dosyła ją na serwer', async () => {
    window.localStorage.setItem('academy-quiz-attempt', JSON.stringify({ q2: 'b2', obce: 'x' }))
    renderForm()
    await waitFor(() => expect(saveQuizAnswer).toHaveBeenCalledWith('attempt', 'q2', 'b2'))
    expect(screen.getByRole('radio', { name: /Nigdy/ })).toHaveAttribute('aria-checked', 'true')
})

it('nie wysyła niepełnego zestawu i wskazuje brakujące pytanie', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij odpowiedzi' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Brak odpowiedzi na pytanie 1.')
    expect(finishQuizAttempt).not.toHaveBeenCalled()
})

it('wysyła komplet, czyści urządzenie i przechodzi do wyniku', async () => {
    renderForm(session({ questions: session().questions.map(q => ({ ...q, selected_option_id: q.options[0].id })) }))
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij odpowiedzi' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/learning/kurs/wyniki?attempt=attempt&enrollment=enrollment'))
    expect(finishQuizAttempt).toHaveBeenCalledWith('attempt', [{ question_id: 'q1', selected_option_id: 'a1' }, { question_id: 'q2', selected_option_id: 'b1' }])
    expect(window.localStorage.getItem('academy-quiz-attempt')).toBeNull()
})

it('wysyła sam tuż przed końcem czasu', async () => {
    vi.useFakeTimers()
    renderForm(session({ remaining_seconds: 3 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(finishQuizAttempt).toHaveBeenCalledTimes(1)
})

it('bez limitu czasu nie pokazuje licznika ani nie wysyła sam', async () => {
    vi.useFakeTimers()
    renderForm(session({ has_time_limit: false, remaining_seconds: 1 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(finishQuizAttempt).not.toHaveBeenCalled()
})

it('dzieli większy zestaw na strony', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ question_id: `q${index}`, position: index + 1, question_text: `Treść ${index + 1}`, selected_option_id: null, options: [{ id: `o${index}`, option_text: `Odp ${index}` }, { id: `p${index}`, option_text: `Inna ${index}` }] }))
    renderForm(session({ questions: many }))
    expect(screen.queryByText('Treść 11')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Następna' }))
    expect(screen.getByText('Treść 11')).toBeInTheDocument()
})

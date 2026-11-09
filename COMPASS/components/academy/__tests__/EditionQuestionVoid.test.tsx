import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EditionQuestionVoid } from '../EditionQuestionVoid'
import { previewVoidQuestion, voidQuestion } from '@/lib/actions/academy-quiz-bank'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/lib/actions/academy-quiz-bank', () => ({ previewVoidQuestion: vi.fn(), voidQuestion: vi.fn() }))

const impact = { attempts: 29, gain_point: 20, cross_threshold: 2, lose_pass: 0, new_passes: 2, pool_after: 11 }
beforeEach(() => { vi.mocked(previewVoidQuestion).mockResolvedValue({ success: true, data: impact }) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

async function openDialog() {
    render(<EditionQuestionVoid courseId="c" questionId="q" questionNumber={4} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unieważnij' }))
    await screen.findByText('Unieważnić pytanie 4?')
}

it('shows the impact before anything changes and cannot be confirmed without a reason', async () => {
    await openDialog()
    expect(screen.getByText('29')).toBeInTheDocument()
    expect(voidQuestion).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Unieważnij pytanie' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } })
    expect(screen.getByRole('button', { name: 'Unieważnij pytanie' })).toBeDisabled()
})

it('voids with the reason and refreshes the report', async () => {
    vi.mocked(voidQuestion).mockResolvedValue({ success: true, data: { recalculated: 29, completions_closed: 2 } })
    await openDialog()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Dwie poprawne odpowiedzi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unieważnij pytanie' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(voidQuestion).toHaveBeenCalledWith('c', 'q', 'Dwie poprawne odpowiedzi')
})

it('keeps the dialog open with the database refusal and does not refresh', async () => {
    vi.mocked(voidQuestion).mockResolvedValue({ success: false, error: 'Nie można unieważnić ostatniego pytania w puli.' })
    await openDialog()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Dwie poprawne odpowiedzi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unieważnij pytanie' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ostatniego pytania')
    expect(refresh).not.toHaveBeenCalled()
})

it('reports a refused preview without opening the dialog', async () => {
    vi.mocked(previewVoidQuestion).mockResolvedValue({ success: false, error: 'Nie masz uprawnień do edycji tego szkolenia.' })
    render(<EditionQuestionVoid courseId="c" questionId="q" questionNumber={4} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unieważnij' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie masz uprawnień')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('survives a missing server action after a deployment', async () => {
    vi.mocked(previewVoidQuestion).mockResolvedValue(undefined as never)
    render(<EditionQuestionVoid courseId="c" questionId="q" questionNumber={4} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unieważnij' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Odśwież stronę')
})

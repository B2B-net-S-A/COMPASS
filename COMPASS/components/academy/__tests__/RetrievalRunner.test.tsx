import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RetrievalRunner } from '../RetrievalRunner'
import { answerRetrieval, type RetrievalSession } from '@/lib/actions/academy-retrieval'

vi.mock('@/lib/actions/academy-retrieval', () => ({ answerRetrieval: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const question = (id: string) => ({ id, text: `Treść ${id}`, answer: null, options: [{ id: `${id}a`, text: 'Pierwsza' }, { id: `${id}b`, text: 'Druga' }] })
const session = (overrides: Partial<RetrievalSession> = {}): RetrievalSession => ({ id: 's', offset_days: 14, completed: false, questions: [question('q1'), question('q2')], ...overrides })

it('reveals the key and explanation only after an answer', async () => {
    vi.mocked(answerRetrieval).mockResolvedValue({ success: true, data: { selected_option_id: 'q1a', correct_option_id: 'q1b', explanation: 'Dlatego', completed: false } })
    render(<RetrievalRunner session={session()} courseTitle="PEGA" />)
    expect(screen.queryByText('Poprawna odpowiedź')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Pierwsza/ }))
    expect(await screen.findByText('Dlatego')).toBeInTheDocument()
    expect(screen.getByText('Twoja odpowiedź')).toBeInTheDocument()
    expect(screen.getByText('Poprawna odpowiedź')).toBeInTheDocument()
    expect(answerRetrieval).toHaveBeenCalledWith('s', 'q1', 'q1a')
})

it('cannot change an answer once revealed and moves to the next question', async () => {
    vi.mocked(answerRetrieval).mockResolvedValue({ success: true, data: { selected_option_id: 'q1a', correct_option_id: 'q1a', explanation: null, completed: false } })
    render(<RetrievalRunner session={session()} courseTitle="PEGA" />)
    fireEvent.click(screen.getByRole('button', { name: /Pierwsza/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Następne pytanie' }))
    expect(screen.getByText('Treść q2')).toBeInTheDocument()
    expect(screen.getByText('Pytanie 2 z 2')).toBeInTheDocument()
})

it('resumes at the first unanswered question', () => {
    const answered = { ...question('q1'), answer: { selected_option_id: 'q1a', correct_option_id: 'q1a', explanation: null } }
    render(<RetrievalRunner session={session({ questions: [answered, question('q2')] })} courseTitle="PEGA" />)
    expect(screen.getByText('Treść q2')).toBeInTheDocument()
})

it('shows a database refusal and stays on the question', async () => {
    vi.mocked(answerRetrieval).mockResolvedValue({ success: false, error: 'Odpowiedź nie pasuje do tej powtórki. Odśwież stronę.' })
    render(<RetrievalRunner session={session()} courseTitle="PEGA" />)
    fireEvent.click(screen.getByRole('button', { name: /Pierwsza/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Odśwież stronę')
    expect(screen.queryByText('Poprawna odpowiedź')).not.toBeInTheDocument()
})

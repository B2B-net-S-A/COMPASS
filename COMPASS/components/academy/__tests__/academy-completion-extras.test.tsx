import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CourseFeedback } from '../CourseFeedback'
import { LearningPathCompletion } from '../LearningPathCompletion'
import { checkLearningPathCompletion } from '@/lib/actions/learning-paths'
vi.mock('@/lib/actions/learning-paths', () => ({ checkLearningPathCompletion: vi.fn() }))
vi.mock('@/components/learning/RatingWidget', () => ({ RatingWidget: ({ courseId }: { courseId: string }) => <div>Ocena: {courseId}</div> }))
vi.mock('@/components/learning/CourseSurveyForm', () => ({ CourseSurveyForm: ({ enrollmentId }: { enrollmentId: string }) => <div>Ankieta zapisu: {enrollmentId}</div> }))
afterEach(cleanup)
it('opens feedback for a completed enrollment without requiring a quiz attempt', () => {
    const { rerender } = render(<CourseFeedback courseId="course" enrollmentId="run-enrollment" />)
    expect(screen.queryByLabelText('Ocena ukończonego szkolenia')).not.toBeInTheDocument()
    rerender(<CourseFeedback courseId="course" enrollmentId="run-enrollment" completedAt="2026-09-22" />)
    expect(screen.getByText('Ankieta zapisu: run-enrollment')).toBeInTheDocument()
})
it('keeps path completion pending until the trusted server verdict arrives', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof checkLearningPathCompletion>>) => void
    vi.mocked(checkLearningPathCompletion).mockReturnValue(new Promise(done => { resolve = done }))
    render(<LearningPathCompletion pathId="path" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sprawdź ukończenie ścieżki' }))
    expect(screen.getByRole('button', { name: 'Sprawdzanie…' })).toBeDisabled()
    resolve({ success: true, data: { completed: true, now_completed: true } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ścieżka została ukończona'))
    expect(checkLearningPathCompletion).toHaveBeenCalledWith('path')
})

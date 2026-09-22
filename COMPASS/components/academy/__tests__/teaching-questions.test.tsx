import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CourseQA } from '@/components/learning/CourseQA'
import { answerQuestion, askQuestion, listAnswersForQuestion, listCourseQuestions } from '@/lib/actions/course-qa'
vi.mock('@/lib/actions/course-qa', () => ({ answerQuestion: vi.fn(), askQuestion: vi.fn(), listAnswersForQuestion: vi.fn(), listCourseQuestions: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/lib/toast-success', () => ({ toastSuccess: vi.fn() }))
afterEach(cleanup)
it('allows an instructor to answer the selected version without showing self-enrollment or an ask form', async () => {
    vi.mocked(listCourseQuestions).mockResolvedValue({ success: true, data: [{ id: 'question', course_id: 'course', lesson_id: null, user_id: 'learner', question_text: 'Pytanie uczestnika starej wersji', is_resolved: false, answers_count: 0, created_at: new Date().toISOString(), user_full_name: 'Uczestnik', user_avatar_url: null }] })
    vi.mocked(listAnswersForQuestion).mockResolvedValue({ success: true, data: [] })
    vi.mocked(answerQuestion).mockResolvedValue({ success: true, data: { id: 'answer' } })
    render(<CourseQA courseId="course" previewVersionId="old-version" />)
    expect(await screen.findByText('Pytanie uczestnika starej wersji')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zadaj pytanie' })).not.toBeInTheDocument()
    expect(listCourseQuestions).toHaveBeenCalledWith('course', undefined, undefined, 'old-version')
    fireEvent.click(screen.getByRole('button', { name: 'Odpowiedz' }))
    fireEvent.change(await screen.findByPlaceholderText('Twoja odpowiedź…'), { target: { value: 'Odpowiedź prowadzącego bez własnego zapisu' } })
    const buttons = screen.getAllByRole('button', { name: 'Odpowiedz' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith({ questionId: 'question', answerText: 'Odpowiedź prowadzącego bez własnego zapisu' }))
    expect(askQuestion).not.toHaveBeenCalled()
})

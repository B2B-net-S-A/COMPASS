import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AdminReviewActions } from '@/components/learning/AdminReviewActions'
import { approveCourse, rejectCourse } from '@/lib/actions/courses-admin'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [async () => true, () => null] }))
vi.mock('@/lib/actions/courses-admin', () => ({ approveCourse: vi.fn(), rejectCourse: vi.fn(), reviewLegacyCourse: vi.fn() }))
beforeEach(() => {
    vi.mocked(approveCourse).mockResolvedValue({ success: false, error: 'Zgłoszenie zmieniło się.' })
    vi.mocked(rejectCourse).mockResolvedValue({ success: false, error: 'Zgłoszenie zmieniło się.' })
})
afterEach(cleanup)
it('sends the rendered submission identity when confirming approval', async () => {
    render(<AdminReviewActions courseId="course" versionId="version" submissionId="rendered-token" title="Szkolenie" />)
    fireEvent.click(screen.getByRole('button', { name: 'Zatwierdź i opublikuj' }))
    await waitFor(() => expect(approveCourse).toHaveBeenCalledWith('course', 'version', 'rendered-token'))
    expect(await screen.findByText('Zgłoszenie zmieniło się.')).toBeInTheDocument()
})
it('uses the same rendered identity for a rejection decision', async () => {
    render(<AdminReviewActions courseId="course" versionId="version" submissionId="rendered-token" title="Szkolenie" />)
    fireEvent.click(screen.getByRole('button', { name: 'Odrzuć' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Popraw kryteria kursu.' } })
    fireEvent.click(screen.getByRole('button', { name: /Wyślij odrzucenie/ }))
    await waitFor(() => expect(rejectCourse).toHaveBeenCalledWith('course', 'Popraw kryteria kursu.', 'version', 'rendered-token'))
})

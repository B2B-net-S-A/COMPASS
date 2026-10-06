import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AcademyStaffPanel } from '../AcademyStaffPanel'
import { setAcademyStaff } from '@/lib/actions/academy-staff'
vi.mock('@/lib/actions/academy-staff', () => ({ setAcademyStaff: vi.fn() }))
afterEach(cleanup)
it.each([undefined, 'run'])('assigns an existing eligible trainer without changing global capabilities (run=%s)', async runId => {
    vi.mocked(setAcademyStaff).mockResolvedValue({ success: true, data: undefined })
    render(<AcademyStaffPanel courseId="foreign-course" runId={runId} state={{ members: [], candidates: [{ userId: 'eligible-trainer', fullName: 'Uprawniony trener', email: 'trainer@example.test' }] }} />)
    expect(screen.getByText(/nie nadaje roli ani globalnych uprawnień/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nadaj uprawnienie trenera' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Trener'), { target: { value: 'eligible-trainer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj przypisanie' }))
    await waitFor(() => expect(setAcademyStaff).toHaveBeenCalledWith({ courseId: 'foreign-course', runId, userId: 'eligible-trainer', role: 'facilitator', enabled: true }))
})

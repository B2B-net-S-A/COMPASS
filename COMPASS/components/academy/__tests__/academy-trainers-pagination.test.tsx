import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AcademyTrainersPanel } from '../sessions/AcademyTrainersPanel'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [vi.fn(), () => null] }))
vi.mock('@/lib/actions/academy-access', () => ({ setAcademyTrainer: vi.fn() }))
afterEach(cleanup)

const trainer = { id: 'trainer', full_name: 'Prowadzący', email: 'trainer@example.test', role: 'consultant', canTeach: true, grantedAt: '2026-09-22T08:00:00Z' }

it('shows a truthful range and keeps the search term in page links', () => {
    render(<AcademyTrainersPanel trainers={[trainer]} search="Nowak Żak" page={2} pageSize={25} total={75} />)
    expect(screen.getByText('Wyświetlono 26–50 z 75 kont.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Poprzednia strona' })).toHaveAttribute('href', '/admin/learning/trainers?q=Nowak+%C5%BBak&page=1')
    expect(screen.getByRole('link', { name: 'Następna strona' })).toHaveAttribute('href', '/admin/learning/trainers?q=Nowak+%C5%BBak&page=3')
})

it('explains an out-of-range page and lets the admin return', () => {
    render(<AcademyTrainersPanel trainers={[]} search="" page={4} pageSize={25} total={75} />)
    expect(screen.getByText('Brak kont na tej stronie')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Poprzednia strona' })).toHaveAttribute('href', '/admin/learning/trainers?page=3')
    expect(screen.getByRole('button', { name: 'Następna strona' })).toBeDisabled()
})

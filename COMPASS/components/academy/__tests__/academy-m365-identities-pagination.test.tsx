import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AcademyIdentitiesPanel } from '../sessions/AcademyIdentitiesPanel'
import type { AcademyM365IdentityDTO } from '@/lib/types/academy-sessions'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/academy-sessions', () => ({
    listAcademyOrganizerCandidates: vi.fn(), removeAcademyM365Identity: vi.fn(), saveAcademyM365Identity: vi.fn(),
}))
afterEach(cleanup)

const identity: AcademyM365IdentityDTO = {
    id: '11111111-1111-1111-1111-111111111111', userId: '22222222-2222-2222-2222-222222222222',
    fullName: 'Anna Nowak', email: 'anna@example.test', tenantId: '33333333-3333-3333-3333-333333333333',
    objectId: '44444444-4444-4444-4444-444444444444', verifiedEmail: 'anna@teams.example.test',
    verifiedAt: '2030-01-01T10:00:00Z', invitationTarget: true,
}

it('shows the total and keeps the Teams identity filter when changing pages', () => {
    render(<AcademyIdentitiesPanel identitiesPage={{ items: [identity], total: 101, page: 5, pageSize: 25 }} initialCandidates={[]} search="anna@teams.example.test" />)
    const nav = screen.getByRole('navigation', { name: 'Strony powiązań kont Teams' })
    expect(nav).toHaveTextContent('101 powiązań')
    expect(nav).toHaveTextContent('Strona 5 z 5')
    expect(within(nav).getByRole('link', { name: 'Poprzednia strona' })).toHaveAttribute('href', '/admin/learning/integrations?identity=anna%40teams.example.test&identityPage=4')
    expect(within(nav).getByRole('button', { name: 'Następna strona' })).toBeDisabled()
    expect(screen.getByText('Wybrany adres zaproszeń')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Znajdź powiązanie' })).toHaveValue('anna@teams.example.test')
})

it('offers page two and distinguishes an empty page from no matching identities', () => {
    const { rerender } = render(<AcademyIdentitiesPanel identitiesPage={{ items: Array.from({ length: 25 }, (_, index) => ({ ...identity, id: String(index) })), total: 101, page: 1, pageSize: 25 }} initialCandidates={[]} search="" />)
    expect(screen.getByRole('link', { name: 'Następna strona' })).toHaveAttribute('href', '/admin/learning/integrations?identityPage=2')
    rerender(<AcademyIdentitiesPanel identitiesPage={{ items: [], total: 101, page: 6, pageSize: 25 }} initialCandidates={[]} search="" />)
    expect(screen.getByText('Na tej stronie nie ma powiązań. Wróć na poprzednią stronę.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Poprzednia strona' })).toHaveAttribute('href', '/admin/learning/integrations?identityPage=5')
})

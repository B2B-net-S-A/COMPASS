import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AcademyShell } from '../AcademyShell'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileMenu } from '@/components/layout/MobileMenu'
vi.mock('@/lib/i18n/context', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/contexts/ThemeContext', () => ({ useTheme: () => ({ brandName: 'Compass' }) }))
vi.mock('@/components/common/Logo', () => ({ Logo: () => null }))
afterEach(cleanup)
describe('Global Academy editor navigation', () => {
    it('offers the editor while leaving administrator moderation hidden for TCM', () => {
        render(<AcademyShell activeTab="teaching" title="Zarządzanie" access={{ isAdmin: false, canTeach: true, canManageAcademy: true, rolloutMode: 'closed' }}>Zawartość</AcademyShell>)
        expect(screen.getByRole('link', { name: 'Edytor Akademii' })).toHaveAttribute('href', '/learning/tworze')
        expect(screen.queryByRole('link', { name: 'Administracja' })).not.toBeInTheDocument()
        expect(screen.getByRole('status')).toHaveTextContent('Talent Community Managerowie')
    })
    it('provides a mobile editor entry with rollout closed and keeps the HR landing', () => {
        render(<MobileMenu role="talent_community" user={null} academyEnabled={false} />)
        expect(screen.getByRole('link', { name: 'mobile_home' })).toHaveAttribute('href', '/internal')
        fireEvent.click(screen.getByTestId('mobile-nav-more'))
        expect(screen.getByRole('link', { name: 'Edytor Akademii' })).toHaveAttribute('href', '/learning/tworze')
        expect(screen.queryByRole('link', { name: 'nav_admin_learning' })).not.toBeInTheDocument()
    })
    it('exposes the desktop editor with rollout closed without adding admin controls', () => {
        render(<Sidebar role="talent_community" user={null} academyEnabled={false} />)
        expect(screen.getByRole('link', { name: 'Edytor Akademii' })).toHaveAttribute('href', '/learning/tworze')
        expect(screen.queryByRole('link', { name: 'nav_admin_learning' })).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'nav_home' })).not.toBeInTheDocument()
    })
    it.each(['internal', 'finanse', 'manager'] as const)('does not extend Academy to %s', role => {
        render(<MobileMenu role={role} user={null} academyEnabled />)
        fireEvent.click(screen.getByTestId('mobile-nav-more'))
        expect(screen.queryByRole('link', { name: 'Edytor Akademii' })).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Akademia' })).not.toBeInTheDocument()
    })
})

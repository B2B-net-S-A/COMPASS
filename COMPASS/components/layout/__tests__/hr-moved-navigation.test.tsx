import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileMenu } from '@/components/layout/MobileMenu'
import { MovedToNexusBanner } from '@/components/internal/MovedToNexusBanner'

// „Ludzie w NEXUSIE”: nawigacja i baner po przeniesieniu modułów.

vi.mock('@/lib/i18n/context', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/contexts/ThemeContext', () => ({ useTheme: () => ({ brandName: 'Compass' }) }))
vi.mock('@/components/common/Logo', () => ({ Logo: () => null }))

afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
})

const NEXUS = 'https://nexus.example.test'

describe('Sidebar po przeniesieniu modułów', () => {
    it('oznacza przeniesione pozycje „archiwum”, gasi ich liczniki i dodaje link do NEXUSA', () => {
        render(
            <Sidebar
                role="manager"
                user={null}
                badges={{ activeLeaves: 3 }}
                hrMovedModules={['leave', 'time', 'payroll']}
                nexusUrl={NEXUS}
            />,
        )
        expect(screen.getByRole('link', { name: 'NEXUS' })).toHaveAttribute('href', NEXUS)
        const hub = screen.getByTestId('nav-internal')
        expect(hub).toHaveTextContent('archiwum')
        expect(within(hub).queryByText('3')).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Wnioski urlopowe zespołu/ })).toHaveTextContent('archiwum')
        expect(screen.getByRole('link', { name: /Timesheety zespołu/ })).toHaveTextContent('archiwum')
    })

    it('oznacza hub dopiero, gdy wszystkie jego moduły są w NEXUSIE', () => {
        render(<Sidebar role="internal" user={null} hrMovedModules={['leave']} nexusUrl={NEXUS} />)
        expect(screen.getByTestId('nav-internal')).not.toHaveTextContent('archiwum')
        expect(screen.getByRole('link', { name: /Payroll/ })).not.toHaveTextContent('archiwum')
    })

    it('wygląda jak dotąd, gdy nic nie jest przeniesione', () => {
        render(<Sidebar role="manager" user={null} badges={{ activeLeaves: 3 }} nexusUrl={NEXUS} />)
        expect(screen.queryByText('archiwum')).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'NEXUS' })).not.toBeInTheDocument()
        expect(within(screen.getByTestId('nav-internal')).getByText('3')).toBeInTheDocument()
    })
})

describe('MobileMenu po przeniesieniu modułów', () => {
    it('bierze landing z serwera i pokazuje link do NEXUSA w sekcji HR', () => {
        render(
            <MobileMenu role="talent_community" user={null} landingHref="/learning" hrMovedModules={['care']} nexusUrl={NEXUS} />,
        )
        expect(screen.getByRole('link', { name: 'mobile_home' })).toHaveAttribute('href', '/learning')
        fireEvent.click(screen.getByTestId('mobile-nav-more'))
        expect(screen.getByRole('link', { name: 'NEXUS' })).toHaveAttribute('href', NEXUS)
    })
})

describe('MovedToNexusBanner', () => {
    it('mówi, gdzie moduł działa teraz, i linkuje do jego ekranu w NEXUSIE', () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'leave')
        vi.stubEnv('NEXUS_APP_URL', NEXUS)
        render(<MovedToNexusBanner module="leave" />)
        expect(screen.getByRole('status')).toHaveTextContent('Ten moduł działa teraz w NEXUSIE')
        expect(screen.getByRole('link', { name: /Otwórz w NEXUSIE/ })).toHaveAttribute('href', `${NEXUS}/my-time`)
    })

    it('bez adresu NEXUSA pokazuje informację bez linku', () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'cases')
        vi.stubEnv('NEXUS_APP_URL', '')
        render(<MovedToNexusBanner module="cases" />)
        expect(screen.getByRole('status')).toBeInTheDocument()
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('nie renderuje niczego dla modułu, który został w Compassie', () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'leave')
        const { container } = render(<MovedToNexusBanner module="time" />)
        expect(container).toBeEmptyDOMElement()
    })
})

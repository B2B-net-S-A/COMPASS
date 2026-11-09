import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AcademyReadinessPanel } from '../AcademyReadinessPanel'
import { buildScenarioStates, type ReadinessOverview } from '@/lib/academy/readiness'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/actions/academy-readiness', () => ({ getReadinessEvidenceUrl: vi.fn(), recordReadinessResult: vi.fn(), updateLaunchCondition: vi.fn() }))

const base: ReadinessOverview = {
    migrationPending: false, rolloutMode: 'closed', currentSha: 'abc1234',
    scenarios: buildScenarioStates([], new Date()),
    conditions: [{ item: 'Zastępstwo recenzenta', owner: 'właściciel', status: 'in_progress', evidence: null, decided_at: null }],
    switches: [{ name: 'ACADEMY_MAIL_ENABLED', label: 'Wysyłka poczty', enabled: false }],
    outbox: { held: 4, expired: 1, sentTest: 2 },
}

describe('panel Gotowość do startu', () => {
    it('nie daje żadnego przycisku otwarcia Akademii ani przełącznika do kliknięcia', () => {
        render(<AcademyReadinessPanel data={base} />)
        expect(screen.getByText('Otwarcie jest niedostępne.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Otwórz Akademię/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    })
    it('pokazuje 57 scenariuszy, tryb, liczniki i właściciela warunku', () => {
        render(<AcademyReadinessPanel data={base} />)
        expect(screen.getByText('Scenariusze: 0 z 57 przechodzi')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: /Zamknięty/ })).toBeInTheDocument()
        expect(screen.getByText('Wstrzymane').previousSibling).toHaveTextContent('4')
        expect(screen.getByText('Właściciel: właściciel')).toBeInTheDocument()
    })
    it('nie oferuje ręcznego wpisu przy scenariuszu automatu', () => {
        render(<AcademyReadinessPanel data={base} />)
        const automat = screen.getByText(/^G01$/, { exact: false, selector: 'span' }).closest('tr') as HTMLElement
        expect(within(automat).queryByText('Wpisz wynik')).not.toBeInTheDocument()
        const manual = screen.getByText('G04').closest('tr') as HTMLElement
        expect(within(manual).getByText('Wpisz wynik')).toBeInTheDocument()
    })
    it('przed migracją mówi, na co czeka, a brak kolejki nie jest błędem', () => {
        render(<AcademyReadinessPanel data={{ ...base, migrationPending: true, conditions: [], outbox: null }} />)
        expect(screen.getByRole('status')).toHaveTextContent('czeka na migrację')
        expect(screen.getByText(/po zastosowaniu migracji kolejki/)).toBeInTheDocument()
    })
})

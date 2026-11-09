import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AcademyRunPeoplePanel } from '../sessions/AcademyRunPeoplePanel'
import type { RunPerson } from '@/lib/academy/run-people'

afterEach(cleanup)
const person = (name: string, patch: Partial<RunPerson> = {}): RunPerson => ({ key: name, fullName: name, email: `${name.toLowerCase()}@example.test`, source: 'compass', status: 'confirmed', hasAccount: true, inNexus: true, ...patch })
const data = (people: RunPerson[], patch = {}) => ({ people, snapshotAt: '2026-11-08T03:10:00Z', snapshotAvailable: true, ...patch })

describe('AcademyRunPeoplePanel', () => {
    it('shows totals, the snapshot date and that sending is off', () => {
        render(<AcademyRunPeoplePanel data={data([person('Anna'), person('Jan', { inNexus: false, hasAccount: false, source: 'teams' })])} />)
        expect(screen.getByText('Na liście').parentElement).toHaveTextContent('2')
        expect(screen.getByText(/migawki NEXUS z /)).toBeInTheDocument()
        expect(screen.getByText(/Wysyłka wyłączona/)).toBeInTheDocument()
    })
    it('filters by snapshot, waitlist and account', () => {
        render(<AcademyRunPeoplePanel data={data([person('Anna'), person('Jan', { inNexus: false }), person('Ola', { status: 'waitlisted' }), person('Piotr', { hasAccount: false })])} />)
        fireEvent.click(screen.getByRole('tab', { name: 'Brak w migawce 1' }))
        expect(screen.getByText('Jan')).toBeInTheDocument(); expect(screen.queryByText('Anna')).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('tab', { name: 'Lista rezerwowa 1' }))
        expect(screen.getByText('Ola')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('tab', { name: 'Bez konta 1' }))
        expect(screen.getByText('Piotr')).toBeInTheDocument()
    })
    it('searches by name and address without case sensitivity', () => {
        render(<AcademyRunPeoplePanel data={data([person('Żaneta'), person('Jan')])} />)
        fireEvent.change(screen.getByLabelText('Szukaj uczestnika'), { target: { value: 'żAN' } })
        expect(screen.getByText('Żaneta')).toBeInTheDocument(); expect(screen.queryByText('Jan')).not.toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Szukaj uczestnika'), { target: { value: 'jan@example' } })
        expect(screen.getByText('Jan')).toBeInTheDocument()
    })
    it('shows the first page of a long list and expands on demand', () => {
        render(<AcademyRunPeoplePanel data={data(Array.from({ length: 58 }, (_, i) => person(`Osoba${String(i).padStart(2, '0')}`)))} />)
        expect(screen.getByText('Pokazano 12 z 58')).toBeInTheDocument()
        expect(screen.getAllByRole('row')).toHaveLength(13)
        fireEvent.click(screen.getByRole('button', { name: 'Pokaż kolejne' }))
        expect(screen.getAllByRole('row')).toHaveLength(59)
    })
    it('marks an unreadable snapshot as not checked instead of missing', () => {
        render(<AcademyRunPeoplePanel data={data([person('Anna', { inNexus: null })], { snapshotAvailable: false, snapshotAt: null })} />)
        expect(screen.getByText('Nie sprawdzono')).toBeInTheDocument()
        expect(screen.queryByText('Brak w migawce', { selector: 'td' })).not.toBeInTheDocument()
        expect(screen.getByText(/Migawka NEXUS jest teraz niedostępna/)).toBeInTheDocument()
    })
    it('separates an empty edition from an empty filter', () => {
        const { rerender } = render(<AcademyRunPeoplePanel data={data([])} />)
        expect(screen.getByText('Na tej edycji nikt się jeszcze nie zapisał.')).toBeInTheDocument()
        rerender(<AcademyRunPeoplePanel data={data([person('Anna')])} />)
        fireEvent.click(screen.getByRole('tab', { name: 'Lista rezerwowa 0' }))
        expect(screen.getByText('Nikt nie pasuje do tego filtra.')).toBeInTheDocument()
    })
    it('reports a failed list instead of rendering an empty one', () => {
        render(<AcademyRunPeoplePanel error="Nie udało się wczytać listy." />)
        expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się wczytać listy.')
    })
})

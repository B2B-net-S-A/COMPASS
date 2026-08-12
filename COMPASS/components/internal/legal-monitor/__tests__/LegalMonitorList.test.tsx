import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { LegalMonitorItemRow } from '@/lib/types/legal-monitor'

vi.mock('@/lib/actions/legal-monitor', () => ({
    reviewLegalMonitorItem: vi.fn(),
    reviewLegalMonitorItems: vi.fn(),
    setLegalMonitorFollowUp: vi.fn(),
    exportLegalMonitorCsv: vi.fn(),
}))

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/toast-success', () => ({ toastSuccess: vi.fn() }))

import { LegalMonitorList } from '../LegalMonitorList'

const TODAY = '2026-08-12'

function buildItem(overrides: Partial<LegalMonitorItemRow> = {}): LegalMonitorItemRow {
    return {
        id: 'item-1',
        source: 'NSA_WSA',
        source_label: 'WSA w Łodzi',
        topic: 'pip_b2b',
        severity: 'green',
        published_at: '2026-08-04',
        reference: 'I SA/Łd 598/25',
        title: 'Wpis testowy',
        url: null,
        summary: 'Podsumowanie wpisu.',
        why_it_matters: 'Znaczenie dla firmy.',
        status: 'new',
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
        created_at: '2026-08-12T05:30:00Z',
        due_date: null,
        assigned_to: null,
        alerted_at: null,
        reviewed_by_name: null,
        assigned_to_name: null,
        ...overrides,
    }
}

function renderList(items: LegalMonitorItemRow[]) {
    return render(
        <LegalMonitorList items={items} canReview assignees={[]} todayISO={TODAY} />,
    )
}

describe('LegalMonitorList — grupowanie po dniu otrzymania', () => {
    it('pokazuje nagłówki dni od najnowszego, z „Dzisiaj” na górze', () => {
        renderList([
            buildItem({ id: 'a', title: 'Przedwczorajszy', created_at: '2026-08-10T05:30:00Z' }),
            buildItem({ id: 'b', title: 'Dzisiejszy', created_at: '2026-08-12T05:30:00Z' }),
            buildItem({ id: 'c', title: 'Wczorajszy', created_at: '2026-08-11T05:30:00Z' }),
        ])

        const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
        expect(headings).toEqual(['Dzisiaj', 'Wczoraj', 'Przedwczoraj'])
    })

    it('wkłada wpis do grupy dnia, w którym trafił do skrzynki (nie daty dokumentu)', () => {
        renderList([
            buildItem({
                id: 'a',
                title: 'Stary dokument, świeżo dopisany',
                published_at: '2024-11-19',
                created_at: '2026-08-12T05:30:00Z',
            }),
            buildItem({
                id: 'b',
                title: 'Z wczoraj',
                published_at: '2026-08-07',
                created_at: '2026-08-11T05:30:00Z',
            }),
        ])

        const dzisiaj = screen.getByRole('heading', { name: 'Dzisiaj' }).closest('section')!
        const wczoraj = screen.getByRole('heading', { name: 'Wczoraj' }).closest('section')!

        expect(within(dzisiaj).getByText('Stary dokument, świeżo dopisany')).toBeInTheDocument()
        expect(within(wczoraj).getByText('Z wczoraj')).toBeInTheDocument()
        // Data dokumentu zostaje w wierszu, ale podpisana — żeby nie czytało się
        // jak sprzeczność z nagłówkiem grupy.
        expect(within(dzisiaj).getByText(/dokument 19 lis 2024/)).toBeInTheDocument()
    })

    it('liczy wpisy w nagłówku dnia z odmianą liczebnika', () => {
        renderList([
            buildItem({ id: 'a', created_at: '2026-08-12T05:30:00Z' }),
            buildItem({ id: 'b', created_at: '2026-08-12T06:30:00Z' }),
            buildItem({ id: 'c', created_at: '2026-08-11T05:30:00Z' }),
        ])

        const dzisiaj = screen.getByRole('heading', { name: 'Dzisiaj' }).closest('section')!
        const wczoraj = screen.getByRole('heading', { name: 'Wczoraj' }).closest('section')!
        expect(within(dzisiaj).getByText(/2 wpisy/)).toBeInTheDocument()
        expect(within(wczoraj).getByText(/1 wpis/)).toBeInTheDocument()
    })

    it('w obrębie dnia trzyma czerwone na górze', () => {
        renderList([
            buildItem({ id: 'a', title: 'Kontekst', severity: 'green' }),
            buildItem({ id: 'b', title: 'Może wymagać decyzji', severity: 'red' }),
        ])

        const dzisiaj = screen.getByRole('heading', { name: 'Dzisiaj' }).closest('section')!
        const titles = within(dzisiaj)
            .getAllByRole('listitem')
            .map((li) => li.querySelector('.font-medium')?.textContent)
        expect(titles).toEqual(['Może wymagać decyzji', 'Kontekst'])
    })

    it('starsze dni podpisuje pełną datą z dniem tygodnia', () => {
        renderList([buildItem({ id: 'a', created_at: '2026-08-03T05:30:00Z' })])
        expect(
            screen.getByRole('heading', { name: 'Poniedziałek, 3 sierpnia 2026' }),
        ).toBeInTheDocument()
    })
})

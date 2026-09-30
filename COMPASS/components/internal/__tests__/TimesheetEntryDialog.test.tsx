import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/actions/internal-timesheet-templates', () => ({
    listMyTemplates: vi.fn(async () => []),
}))

import { TimesheetEntryDialog } from '../TimesheetEntryDialog'

// Zgłoszenie 2026-09-30: po zatwierdzeniu połowy dnia urlopu dialog blokował cały dzień
// („W tym dniu jest urlop / L4") i nie dało się zalogować pozostałych 4h.

function renderDialog(props: { blocked?: string[]; half?: string[] }) {
    return render(
        <TimesheetEntryDialog
            open
            onOpenChange={() => {}}
            minDate="2026-09-23"
            maxDate="2026-09-30"
            saving={false}
            blockedLeaveDates={props.blocked}
            halfLeaveDates={props.half}
            onSubmit={() => {}}
        />,
    )
}

afterEach(() => vi.clearAllMocks())

describe('TimesheetEntryDialog — urlop w wybranym dniu', () => {
    it('połowa dnia urlopu nie blokuje zapisu i obniża limit do 4h', () => {
        renderDialog({ half: ['2026-09-23'] })

        expect(screen.queryByText(/nie można logować godzin/)).toBeNull()
        expect(screen.getByText(/pół dnia urlopu — możesz zalogować maks\. 4h/)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Zapisz' })).not.toHaveProperty('disabled', true)
        expect(screen.getByLabelText(/Godziny/).getAttribute('max')).toBe('4')
    })

    it('pełny dzień urlopu nadal blokuje zapis', () => {
        renderDialog({ blocked: ['2026-09-23'] })

        expect(screen.getByText(/nie można logować godzin/)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Zapisz' })).toHaveProperty('disabled', true)
    })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CareRosterItem } from '@/lib/types/contractor'

const { mockAssignCareOwner, mockToastError, mockToastSuccess } = vi.hoisted(() => ({
    mockAssignCareOwner: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
}))

vi.mock('@/lib/actions/contractors', () => ({
    assignCareOwner: mockAssignCareOwner,
}))

vi.mock('@/lib/toast', () => ({
    toast: { error: mockToastError, success: vi.fn() },
}))

vi.mock('@/lib/toast-success', () => ({
    toastSuccess: mockToastSuccess,
}))

import { OpiekaPanel } from '../OpiekaPanel'

const TCM = [
    { id: 'tcm-1', fullName: 'Anna Kowalska' },
    { id: 'tcm-2', fullName: 'Piotr Nowak' },
]

function item(over: Partial<CareRosterItem> & { contractorId: string; fullName: string }): CareRosterItem {
    return {
        situation: 'u_klienta',
        clientName: 'Nordea',
        position: 'Java Developer',
        sinceDate: '2026-01-10',
        benchStatus: null,
        ownerTcmId: null,
        ownerTcmName: null,
        ...over,
    }
}

const ROSTER: CareRosterItem[] = [
    item({ contractorId: 'c1', fullName: 'Adam Bez Opiekuna' }),
    item({ contractorId: 'c2', fullName: 'Beata Moja', ownerTcmId: 'tcm-1', ownerTcmName: 'Anna Kowalska' }),
    item({ contractorId: 'c3', fullName: 'Cezary Cudzy', ownerTcmId: 'tcm-2', ownerTcmName: 'Piotr Nowak', clientName: 'Alior' }),
    item({ contractorId: 'c4', fullName: 'Dorota Bench', situation: 'bench', benchStatus: 'w_rekrutacji', clientName: 'BNP Paribas', sinceDate: '2026-03-01' }),
]

/** Zalogowany jako Anna Kowalska (tcm-1) — dla filtru „moi konsultanci". */
const renderPanel = (roster: CareRosterItem[] = ROSTER) =>
    render(<OpiekaPanel roster={roster} tcmOptions={TCM} currentUserId="tcm-1" />)

const rowNames = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1].textContent)

beforeEach(() => {
    mockAssignCareOwner.mockReset().mockResolvedValue({ success: true, data: { updated: 1 } })
    mockToastError.mockReset()
    mockToastSuccess.mockReset()
})

afterEach(cleanup)

describe('OpiekaPanel — lista i liczniki', () => {
    it('pokazuje wszystkich i liczy osoby bez opiekuna', () => {
        renderPanel()
        expect(rowNames()).toEqual(['Adam Bez Opiekuna', 'Beata Moja', 'Cezary Cudzy', 'Dorota Bench'])
        expect(screen.getByText('bez opiekuna: 2')).toBeInTheDocument()
    })

    it('pokazuje obciążenie każdego opiekuna, także zerowe', () => {
        renderPanel([ROSTER[0], ROSTER[1]])
        expect(screen.getByText('Anna Kowalska: 1')).toBeInTheDocument()
        // Opiekun bez przypisań musi być widoczny — inaczej nie wiadomo, komu można dołożyć.
        expect(screen.getByText('Piotr Nowak: 0')).toBeInTheDocument()
    })

    it('wiersz pokazuje aktualnie przypisanego opiekuna', () => {
        renderPanel()
        // Wartość selecta ustawia React po hydracji — w statycznym HTML jej nie widać,
        // więc bez tej asercji „każdy wiersz mówi bez opiekuna" przeszłoby niezauważone.
        expect((screen.getByLabelText('Opiekun dla Beata Moja') as HTMLSelectElement).value).toBe('tcm-1')
        expect((screen.getByLabelText('Opiekun dla Cezary Cudzy') as HTMLSelectElement).value).toBe('tcm-2')
        expect((screen.getByLabelText('Opiekun dla Adam Bez Opiekuna') as HTMLSelectElement).value).toBe('')
    })

    it('odróżnia bench od pracy u klienta', () => {
        renderPanel()
        const benchRow = screen.getByRole('row', { name: /Dorota Bench/ })
        expect(within(benchRow).getByText(/bench · w rekrutacji/)).toBeInTheDocument()
    })
})

describe('OpiekaPanel — filtry', () => {
    it('„Bez opiekuna" zostawia tylko nieprzypisanych', async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.selectOptions(screen.getByLabelText('Opiekun'), '__none__')
        expect(rowNames()).toEqual(['Adam Bez Opiekuna', 'Dorota Bench'])
    })

    it('„Moi konsultanci" pokazuje tylko przypisanych zalogowanemu', async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.selectOptions(screen.getByLabelText('Opiekun'), '__mine__')
        expect(rowNames()).toEqual(['Beata Moja'])
    })

    it('filtruje po sytuacji i po kliencie', async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.selectOptions(screen.getByLabelText('Sytuacja'), 'bench')
        expect(rowNames()).toEqual(['Dorota Bench'])

        await user.selectOptions(screen.getByLabelText('Sytuacja'), '')
        await user.selectOptions(screen.getByLabelText('Klient'), 'Alior')
        expect(rowNames()).toEqual(['Cezary Cudzy'])
    })

    it('szuka po nazwisku i po kliencie', async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.type(screen.getByPlaceholderText(/Szukaj/), 'beata')
        expect(rowNames()).toEqual(['Beata Moja'])
    })
})

describe('OpiekaPanel — masowe przypisanie', () => {
    it('zaznacza wszystkich widocznych i przypisuje opiekuna tylko im', async () => {
        const user = userEvent.setup()
        mockAssignCareOwner.mockResolvedValue({ success: true, data: { updated: 2 } })
        renderPanel()

        // Zawężenie do nieprzypisanych, potem „zaznacz wszystkich widocznych".
        await user.selectOptions(screen.getByLabelText('Opiekun'), '__none__')
        await user.click(screen.getByLabelText('Zaznacz wszystkich widocznych'))
        expect(screen.getByText('Zaznaczono: 2')).toBeInTheDocument()
        // Stan checkboxa też ustawia React po hydracji — sprawdzamy go wprost,
        // żeby „licznik mówi 2, a kratki puste" nie przeszło niezauważone.
        expect(screen.getByLabelText('Zaznacz Adam Bez Opiekuna')).toBeChecked()
        expect(screen.getByLabelText('Zaznacz Dorota Bench')).toBeChecked()

        await user.selectOptions(screen.getByLabelText('Opiekun do przypisania'), 'tcm-2')
        await user.click(screen.getByRole('button', { name: /Przypisz zaznaczonym/ }))

        expect(mockAssignCareOwner).toHaveBeenCalledWith({ contractorIds: ['c1', 'c4'], ownerTcmId: 'tcm-2' })
        expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('Piotr Nowak'))
    })

    it('po przypisaniu wiersze mają nowego opiekuna, a zaznaczenie znika', async () => {
        const user = userEvent.setup()
        renderPanel([ROSTER[0]])

        await user.click(screen.getByLabelText('Zaznacz Adam Bez Opiekuna'))
        await user.selectOptions(screen.getByLabelText('Opiekun do przypisania'), 'tcm-1')
        await user.click(screen.getByRole('button', { name: /Przypisz zaznaczonym/ }))

        expect(screen.queryByText(/Zaznaczono:/)).not.toBeInTheDocument()
        expect(screen.getByText('każdy ma opiekuna')).toBeInTheDocument()
        expect((screen.getByLabelText('Opiekun dla Adam Bez Opiekuna') as HTMLSelectElement).value).toBe('tcm-1')
    })

    it('„Zdejmij opiekuna" wysyła null', async () => {
        const user = userEvent.setup()
        renderPanel([ROSTER[1]])

        await user.click(screen.getByLabelText('Zaznacz Beata Moja'))
        await user.click(screen.getByRole('button', { name: /Zdejmij opiekuna/ }))

        expect(mockAssignCareOwner).toHaveBeenCalledWith({ contractorIds: ['c2'], ownerTcmId: null })
    })

    it('przycisk przypisania jest nieaktywny, dopóki nie wskazano opiekuna', async () => {
        const user = userEvent.setup()
        renderPanel([ROSTER[0]])
        await user.click(screen.getByLabelText('Zaznacz Adam Bez Opiekuna'))
        expect(screen.getByRole('button', { name: /Przypisz zaznaczonym/ })).toBeDisabled()
    })
})

describe('OpiekaPanel — przypisanie pojedyncze i błędy', () => {
    it('zmiana opiekuna w wierszu wysyła jedno id', async () => {
        const user = userEvent.setup()
        renderPanel([ROSTER[0]])
        await user.selectOptions(screen.getByLabelText('Opiekun dla Adam Bez Opiekuna'), 'tcm-2')
        expect(mockAssignCareOwner).toHaveBeenCalledWith({ contractorIds: ['c1'], ownerTcmId: 'tcm-2' })
    })

    it('odrzucenie przez akcję pokazuje jej komunikat i nie zmienia wiersza', async () => {
        const user = userEvent.setup()
        mockAssignCareOwner.mockResolvedValue({ success: false, error: 'Wskazana osoba nie jest opiekunem Talent Community.' })
        renderPanel([ROSTER[0]])

        await user.selectOptions(screen.getByLabelText('Opiekun dla Adam Bez Opiekuna'), 'tcm-2')

        expect(mockToastError).toHaveBeenCalledWith('Wskazana osoba nie jest opiekunem Talent Community.')
        expect(screen.getByText('bez opiekuna: 1')).toBeInTheDocument()
    })

    it('brak odpowiedzi (deploy skew) nie wywraca panelu', async () => {
        const user = userEvent.setup()
        mockAssignCareOwner.mockResolvedValue(undefined)
        renderPanel([ROSTER[0]])

        await user.selectOptions(screen.getByLabelText('Opiekun dla Adam Bez Opiekuna'), 'tcm-1')

        expect(mockToastError).toHaveBeenCalledWith('Nie udało się przypisać opiekuna.')
        expect(screen.getByText('bez opiekuna: 1')).toBeInTheDocument()
    })
})

describe('OpiekaPanel — pusta lista', () => {
    it('rozróżnia „nikogo nie ma" od „filtry nic nie zwracają"', async () => {
        const user = userEvent.setup()
        const { unmount } = renderPanel([])
        expect(screen.getByText(/Nikt nie pracuje dziś u klienta/)).toBeInTheDocument()
        unmount()

        renderPanel()
        await user.type(screen.getByPlaceholderText(/Szukaj/), 'zzzz')
        expect(screen.getByText(/Żaden konsultant nie pasuje do filtrów/)).toBeInTheDocument()
    })
})

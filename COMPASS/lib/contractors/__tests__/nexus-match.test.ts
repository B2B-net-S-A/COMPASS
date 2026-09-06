import { describe, expect, it } from 'vitest'
import {
    decideMatches,
    nameKey,
    summarize,
    type CompassContractor,
    type NexusContractor,
} from '../nexus-match'

function nexusRow(
    id: number,
    name: string,
    lastname: string,
    email: string | null,
): NexusContractor {
    return {
        nexus_contract_id: id,
        candidate: { id: id * 10, name, lastname, email },
        client_name: 'Klient',
        job_title: 'Rola',
        status: 'active',
        start_date: '2026-01-01',
        end_date: null,
        lacks_current_order: false,
    }
}

function compassRow(
    id: string,
    full_name: string,
    email: string | null = null,
    nexus_contract_id: number | null = null,
): CompassContractor {
    return { id, full_name, email, nexus_contract_id }
}

describe('decideMatches', () => {
    it('linkuje automatem tylko przy jednoznacznym e-mailu', () => {
        const [d] = decideMatches(
            [compassRow('c1', 'Jan Kowalski', 'jan@example.com')],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        expect(d.status).toBe('linked')
        expect(d.nexusContractId).toBe(11)
    })

    it('NIE wybiera, gdy ten sam e-mail jest na dwóch kontraktach', () => {
        // Wybór jednego z nich byłby zgadywaniem, którego nikt by nie zauważył.
        const [d] = decideMatches(
            [compassRow('c1', 'Jan Kowalski', 'jan@example.com')],
            [
                nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com'),
                nexusRow(12, 'Jan', 'Kowalski', 'jan@example.com'),
            ],
        )
        expect(d.status).toBe('ambiguous')
        expect(d.nexusContractId).toBeNull()
        expect(d.suggestions).toEqual([11, 12])
    })

    it('NIGDY nie linkuje po samym nazwisku — nawet przy jednym trafieniu', () => {
        // To jest najważniejsza reguła tego pliku. Compass podjął tę decyzję
        // już raz (20260714183425: „Name matching is intentionally forbidden"),
        // a tu problem jest większy: 689 nazwisk kontra ~49 tys. kandydatów.
        const [d] = decideMatches(
            [compassRow('c1', 'Jan Kowalski')],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        expect(d.status).toBe('pending')
        expect(d.nexusContractId).toBeNull()
        expect(d.suggestions).toEqual([11])
    })

    it('dwóch imienników po nazwisku to ambiguous, nie zgadywanka', () => {
        const [d] = decideMatches(
            [compassRow('c1', 'Jan Kowalski')],
            [
                nexusRow(11, 'Jan', 'Kowalski', 'jan1@example.com'),
                nexusRow(12, 'Jan', 'Kowalski', 'jan2@example.com'),
            ],
        )
        expect(d.status).toBe('ambiguous')
        expect(d.nexusContractId).toBeNull()
    })

    it('brak odpowiednika daje not_found, nie puste pending', () => {
        // Kontraktor sprzed wdrożenia NEXUSA ma inny następny krok niż taki,
        // dla którego jest podpowiedź — dlatego to osobny status.
        const [d] = decideMatches(
            [compassRow('c1', 'Anna Nowak')],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        expect(d.status).toBe('not_found')
        expect(d.suggestions).toEqual([])
    })

    it('nie rusza wiersza, który człowiek już powiązał', () => {
        // Ponowne rozstrzyganie mogłoby cofnąć decyzję podjętą w kolejce.
        const [d] = decideMatches(
            [compassRow('c1', 'Jan Kowalski', null, 99)],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        expect(d.status).toBe('linked')
        expect(d.nexusContractId).toBe(99)
    })

    it('e-mail wygrywa z nazwiskiem i nie zważa na wielkość liter', () => {
        const [d] = decideMatches(
            [compassRow('c1', 'ktoś zupełnie inny', '  JAN@Example.COM ')],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        expect(d.status).toBe('linked')
        expect(d.nexusContractId).toBe(11)
    })
})

describe('nameKey', () => {
    it('zwija wewnętrzne spacje, bo TS i SQL liczą klucz inaczej', () => {
        // Postgres `trim()` NIE zwija wewnętrznych spacji, `normalizePersonName`
        // w TS — zwija. Tutaj nazwisko służy tylko do podpowiedzi, więc rozjazd
        // nic nie psuje, ale klucz musi być stabilny.
        expect(nameKey('  Jan   Kowalski ')).toBe('jan kowalski')
    })
})

describe('summarize', () => {
    it('liczy każdy status, także zerowy', () => {
        const counts = summarize([
            { contractorId: 'a', nexusContractId: 1, status: 'linked', suggestions: [] },
            { contractorId: 'b', nexusContractId: null, status: 'pending', suggestions: [2] },
        ])
        expect(counts).toEqual({ linked: 1, pending: 1, ambiguous: 0, not_found: 0 })
    })
})

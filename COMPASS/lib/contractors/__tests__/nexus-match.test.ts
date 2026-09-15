import { describe, expect, it } from 'vitest'
import {
    currentContract,
    decideMatches,
    nameKey,
    namesMatch,
    suggestionsFor,
    summarize,
    type CompassContractor,
    type MatchDecision,
    type NexusContractor,
} from '../nexus-match'

function nexusRow(
    id: number,
    name: string,
    lastname: string,
    email: string | null,
    overrides: Partial<NexusContractor> & { candidateId?: number } = {},
): NexusContractor {
    const { candidateId, ...rest } = overrides
    return {
        nexus_contract_id: id,
        candidate: { id: candidateId ?? id * 10, name, lastname, email },
        client_name: 'Klient',
        job_title: 'Rola',
        status: 'active',
        start_date: '2026-01-01',
        end_date: null,
        lacks_current_order: false,
        ...rest,
    }
}

function compassRow(
    id: string,
    full_name: string,
    email: string | null = null,
    nexus_contract_id: number | null = null,
    nexus_match_status: string | null = null,
    nexus_candidate_id: number | null = null,
): CompassContractor {
    return { id, full_name, email, nexus_contract_id, nexus_match_status, nexus_candidate_id }
}

/** Zapis werdyktu tak, jak robi to cron — do symulacji kolejnych biegów. */
function applyDecision(row: CompassContractor, d: MatchDecision): CompassContractor {
    if (d.status === 'dismissed') return row
    return {
        ...row,
        nexus_match_status: d.status,
        nexus_contract_id: d.nexusContractId,
        nexus_candidate_id: d.nexusCandidateId,
    }
}

describe('decideMatches', () => {
    it('linkuje automatem tylko przy jednoznacznym e-mailu i zapisuje osobę', () => {
        const [d] = decideMatches(
            [compassRow('c1', 'Jan Kowalski', 'jan@example.com')],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        expect(d.status).toBe('linked')
        expect(d.nexusContractId).toBe(11)
        expect(d.nexusCandidateId).toBe(110)
    })

    it('dwie umowy jednej osoby to NIE jest ambiguous — kotwicą jest osoba', () => {
        // Dawniej ten sam e-mail na dwóch kontraktach dawał ambiguous, choć to
        // jedna osoba. Bieżący kontrakt = trwający z najpóźniejszym startem.
        const [d] = decideMatches(
            [compassRow('c1', 'Jan Kowalski', 'jan@example.com')],
            [
                nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com', { candidateId: 7, start_date: '2025-01-01' }),
                nexusRow(12, 'Jan', 'Kowalski', 'jan@example.com', { candidateId: 7, start_date: '2026-03-01' }),
            ],
        )
        expect(d.status).toBe('linked')
        expect(d.nexusCandidateId).toBe(7)
        expect(d.nexusContractId).toBe(12)
    })

    it('NIE wybiera, gdy ten sam e-mail mają dwie różne osoby w NEXUSIE', () => {
        const [d] = decideMatches(
            [compassRow('c1', 'Jan Kowalski', 'jan@example.com')],
            [
                nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com'),
                nexusRow(12, 'Jan', 'Kowalski', 'jan@example.com'),
            ],
        )
        expect(d.status).toBe('ambiguous')
        expect(d.reason).toBe('multiple_nexus_people')
        expect(d.nexusContractId).toBeNull()
        expect(d.suggestions).toEqual([11, 12])
    })

    it('duplikat e-maila po stronie COMPASSA daje ambiguous obu kontraktorom', () => {
        // Audyt INT-07: dwóch kontraktorów z tym samym adresem dostawało ten sam
        // kontrakt; pierwszy wygrywał kolejnością danych, drugi padał na UNIQUE.
        const decisions = decideMatches(
            [
                compassRow('c1', 'Jan Kowalski', 'jan@example.com'),
                compassRow('c2', 'Jan Kowalski-Nowak', ' JAN@example.com'),
            ],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        for (const d of decisions) {
            expect(d.status).toBe('ambiguous')
            expect(d.reason).toBe('duplicate_compass_email')
            expect(d.nexusCandidateId).toBeNull()
        }
    })

    it('osoba już powiązana z innym kontraktorem nie jest linkowana drugi raz', () => {
        const decisions = decideMatches(
            [
                compassRow('c1', 'Jan Kowalski', null, null, 'linked', 110),
                compassRow('c2', 'Ktoś Inny', 'jan@example.com'),
            ],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        expect(decisions[0].status).toBe('linked')
        expect(decisions[1].status).toBe('ambiguous')
        expect(decisions[1].reason).toBe('nexus_person_already_linked')
    })

    it('NIGDY nie linkuje po samym nazwisku — nawet przy jednym trafieniu', () => {
        // Compass podjął tę decyzję już raz (20260714183425: „Name matching is
        // intentionally forbidden").
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

    it('brak odpowiednika daje auto_not_found — stan automatu, nie decyzję', () => {
        const [d] = decideMatches(
            [compassRow('c1', 'Anna Nowak')],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        expect(d.status).toBe('auto_not_found')
        expect(d.suggestions).toEqual([])
    })

    it('INT-02: dwa kolejne biegi — osoba pojawia się w NEXUSIE i automat ją znajduje', () => {
        // Reprodukcja z audytu: pierwszy bieg bez odpowiednika, drugi z
        // jednoznacznym odpowiednikiem. Dawniej drugi bieg zostawiał not_found.
        let rows = [compassRow('c1', 'Anna Nowak', 'anna@example.com')]
        const [first] = decideMatches(rows, [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')])
        expect(first.status).toBe('auto_not_found')
        rows = [applyDecision(rows[0], first)]

        const [second] = decideMatches(rows, [
            nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com'),
            nexusRow(21, 'Anna', 'Nowak', 'anna@example.com'),
        ])
        expect(second.status).toBe('linked')
        expect(second.nexusContractId).toBe(21)
    })

    it('INT-02: auto_not_found bez e-maila wraca do kolejki jako pending, gdy pojawi się podpowiedź', () => {
        const rows = [compassRow('c1', 'Anna Nowak', null, null, 'auto_not_found')]
        const [d] = decideMatches(rows, [nexusRow(21, 'Anna', 'Nowak', 'anna@example.com')])
        expect(d.status).toBe('pending')
        expect(d.suggestions).toEqual([21])
    })

    it('nie cofa ręcznego odrzucenia (dismissed) przy kolejnym przebiegu', () => {
        // Regresja z review #366 — decyzja człowieka jest chroniona.
        const [d] = decideMatches(
            [compassRow('c1', 'Jan Kowalski', 'jan@example.com', null, 'dismissed')],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        expect(d.status).toBe('dismissed')
        expect(d.nexusContractId).toBeNull()
        expect(d.suggestions).toEqual([])
    })

    it('powiązany po osobie: odświeża bieżący kontrakt, a bez żywego kontraktu zostawia osobę', () => {
        const row = compassRow('c1', 'Jan Kowalski', null, 11, 'linked', 7)
        const [moved] = decideMatches(
            [row],
            [
                nexusRow(11, 'Jan', 'Kowalski', null, { candidateId: 7, start_date: '2025-01-01' }),
                nexusRow(15, 'Jan', 'Kowalski', null, { candidateId: 7, start_date: '2026-05-01' }),
            ],
        )
        expect(moved).toMatchObject({ status: 'linked', nexusCandidateId: 7, nexusContractId: 15 })

        const [gone] = decideMatches([row], [nexusRow(99, 'Ktoś', 'Inny', null)])
        expect(gone).toMatchObject({ status: 'linked', nexusCandidateId: 7, nexusContractId: null })
    })

    it('stare powiązanie po kontrakcie dostaje kotwicę osoby', () => {
        const [d] = decideMatches(
            [compassRow('c1', 'Jan Kowalski', null, 11, 'linked')],
            [nexusRow(11, 'Jan', 'Kowalski', null, { candidateId: 7 })],
        )
        expect(d).toMatchObject({ status: 'linked', nexusCandidateId: 7, nexusContractId: 11 })
    })

    it('nie rusza powiązania, którego kontrakt zniknął z eksportu, a osoba jest nieznana', () => {
        const [d] = decideMatches(
            [compassRow('c1', 'Jan Kowalski', null, 99, 'linked')],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        expect(d.status).toBe('linked')
        expect(d.nexusContractId).toBe(99)
        expect(d.nexusCandidateId).toBeNull()
    })

    it('dwóch kontraktorów trzymających tę samą osobę: nic nie przepina, zgłasza powód', () => {
        const decisions = decideMatches(
            [
                compassRow('c1', 'Jan Kowalski', null, 11, 'linked'),
                compassRow('c2', 'Jan Kowalski 2', null, 12, 'linked'),
            ],
            [
                nexusRow(11, 'Jan', 'Kowalski', null, { candidateId: 7 }),
                nexusRow(12, 'Jan', 'Kowalski', null, { candidateId: 7 }),
            ],
        )
        expect(decisions.map((d) => [d.nexusContractId, d.nexusCandidateId, d.reason])).toEqual([
            [11, null, 'nexus_person_linked_twice'],
            [12, null, 'nexus_person_linked_twice'],
        ])
    })

    it('e-mail wygrywa z nazwiskiem i nie zważa na wielkość liter', () => {
        const [d] = decideMatches(
            [compassRow('c1', 'ktoś zupełnie inny', '  JAN@Example.COM ')],
            [nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com')],
        )
        expect(d.status).toBe('linked')
        expect(d.nexusContractId).toBe(11)
    })

    it('wynik nie zależy od kolejności eksportu', () => {
        const rows = [
            nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com', { candidateId: 7, start_date: '2025-01-01' }),
            nexusRow(12, 'Jan', 'Kowalski', 'jan@example.com', { candidateId: 7, start_date: '2026-03-01' }),
        ]
        const compass = [compassRow('c1', 'Jan Kowalski', 'jan@example.com')]
        expect(decideMatches(compass, rows)).toEqual(decideMatches(compass, [...rows].reverse()))
    })
})

describe('currentContract', () => {
    it('trwający wygrywa ze szkicem o późniejszym starcie', () => {
        const pick = currentContract([
            nexusRow(1, 'A', 'B', null, { status: 'draft', start_date: '2027-01-01' }),
            nexusRow(2, 'A', 'B', null, { status: 'active', start_date: '2025-01-01' }),
        ])
        expect(pick?.nexus_contract_id).toBe(2)
    })
})

describe('suggestionsFor', () => {
    const snapshot = [
        nexusRow(11, 'Jan', 'Kowalski', 'jan@example.com', { candidateId: 7, client_name: 'Bank', start_date: '2025-01-01' }),
        nexusRow(12, 'Jan', 'Kowalski', 'jan@example.com', { candidateId: 7, client_name: 'Bank', start_date: '2026-02-01' }),
        nexusRow(13, 'Anna', 'Nowak', 'anna@example.com', { candidateId: 8 }),
    ]

    it('grupuje po osobie i pokazuje bieżący kontrakt z liczbą kontraktów', () => {
        const out = suggestionsFor({ full_name: 'Jan Kowalski', email: null }, snapshot)
        expect(out).toHaveLength(1)
        expect(out[0]).toMatchObject({
            nexusCandidateId: 7,
            nexusContractId: 12,
            fullName: 'Jan Kowalski',
            clientName: 'Bank',
            contractCount: 2,
            matchedBy: 'name',
        })
    })

    it('uznaje odwróconą kolejność „Nazwisko Imię" i dopasowanie po e-mailu', () => {
        expect(suggestionsFor({ full_name: 'Kowalski Jan', email: null }, snapshot)).toHaveLength(1)
        const byEmail = suggestionsFor({ full_name: 'Zupełnie Inny', email: 'ANNA@example.com' }, snapshot)
        expect(byEmail.map((s) => [s.nexusCandidateId, s.matchedBy])).toEqual([[8, 'email']])
    })

    it('nic nie podpowiada, gdy brak trafień', () => {
        expect(suggestionsFor({ full_name: 'Nikt Taki', email: null }, snapshot)).toEqual([])
    })
})

describe('namesMatch', () => {
    it('toleruje spacje, wielkość liter i kolejność słów, ale nie inne nazwisko', () => {
        const row = nexusRow(1, 'Jan', 'Kowalski', null)
        expect(namesMatch('  jan   KOWALSKI', row)).toBe(true)
        expect(namesMatch('Kowalski Jan', row)).toBe(true)
        expect(namesMatch('Jan Nowak', row)).toBe(false)
    })
})

describe('nameKey', () => {
    it('zwija wewnętrzne spacje, bo TS i SQL liczą klucz inaczej', () => {
        expect(nameKey('  Jan   Kowalski ')).toBe('jan kowalski')
    })
})

describe('summarize', () => {
    it('liczy każdy status, także zerowy', () => {
        const counts = summarize([
            { contractorId: 'a', nexusContractId: 1, nexusCandidateId: 10, status: 'linked', suggestions: [], reason: null },
            { contractorId: 'b', nexusContractId: null, nexusCandidateId: null, status: 'pending', suggestions: [2], reason: null },
        ])
        expect(counts).toEqual({ linked: 1, pending: 1, ambiguous: 0, auto_not_found: 0, dismissed: 0 })
    })
})

import { describe, expect, it } from 'vitest'
import { computeDueDate, getSlaStatus } from '../sla'

describe('computeDueDate', () => {
    it('P1 (2 working days) — Wed 2026-05-06 → Fri 2026-05-08', () => {
        const due = computeDueDate('P1', new Date('2026-05-06T10:00:00Z'))
        expect(due.toISOString().slice(0, 10)).toBe('2026-05-08')
    })

    it('P2 (5 working days) — Wed 2026-05-06 → Wed 2026-05-13', () => {
        const due = computeDueDate('P2', new Date('2026-05-06T10:00:00Z'))
        expect(due.toISOString().slice(0, 10)).toBe('2026-05-13')
    })

    it('P3 (10 working days) — Wed 2026-05-06 → Wed 2026-05-20', () => {
        const due = computeDueDate('P3', new Date('2026-05-06T10:00:00Z'))
        expect(due.toISOString().slice(0, 10)).toBe('2026-05-20')
    })
})

describe('getSlaStatus', () => {
    const now = new Date('2026-05-06T12:00:00Z')

    it('returns "red" when due_date is in the past', () => {
        expect(getSlaStatus(new Date('2026-05-05T12:00:00Z'), now)).toBe('red')
    })

    it('returns "yellow" when due_date is within 24h', () => {
        expect(getSlaStatus(new Date('2026-05-07T11:00:00Z'), now)).toBe('yellow')
    })

    it('returns "green" when due_date is more than 24h ahead', () => {
        expect(getSlaStatus(new Date('2026-05-08T13:00:00Z'), now)).toBe('green')
    })

    it('accepts ISO string input', () => {
        expect(getSlaStatus('2026-05-08T13:00:00Z', now)).toBe('green')
    })
})

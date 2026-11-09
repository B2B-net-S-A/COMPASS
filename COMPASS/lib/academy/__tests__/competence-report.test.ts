import { describe, expect, it } from 'vitest'
import { competenceCsv, daysToExpiry, filterCompetenceRows, summarizeCompetence, type CompetenceRow } from '../competence-report'

const now = Date.parse('2027-12-14T12:00:00Z')
const iso = (days: number) => new Date(now + days * 86_400_000).toISOString()
const row = (user: string, programme: string, extra: Partial<CompetenceRow> = {}): CompetenceRow => ({
    user_id: user, full_name: user, programme_key: programme, programme_title: `Program ${programme}`, version_number: 1, route: 'live', completed_at: iso(-100), valid_until: null, ...extra,
})

describe('daysToExpiry', () => {
    it('reports only documents inside the 60-day window', () => {
        expect(daysToExpiry(iso(43), now)).toBe(43)
        expect(daysToExpiry(iso(60), now)).toBe(60)
        expect(daysToExpiry(iso(61), now)).toBeNull()
    })
    it('does not count an unlimited, already expired or malformed date', () => {
        expect(daysToExpiry(null, now)).toBeNull()
        expect(daysToExpiry(iso(-1), now)).toBeNull()
        expect(daysToExpiry('wkrótce', now)).toBeNull()
    })
})

describe('summarizeCompetence', () => {
    it('counts people once and programmes once per person', () => {
        const summary = summarizeCompetence([row('a', 'p1'), row('a', 'p2', { route: 'modules' }), row('b', 'p1', { route: 'assessment', valid_until: iso(10) })], 5, now)
        expect(summary).toMatchObject({ active: 5, withCertificate: 2, inProgress: 3, programmes: 3, live: 1, modules: 2, expiring: 1 })
        expect(summary.lastExpiring).toBe(iso(10))
    })
    it('never reports a negative number of people in progress', () => {
        expect(summarizeCompetence([row('a', 'p1')], 0, now).inProgress).toBe(0)
    })
})

describe('filterCompetenceRows', () => {
    const rows = [row('a', 'p1', { valid_until: iso(10) }), row('b', 'p2', { valid_until: iso(200) }), row('c', 'p1')]
    it('filters by programme and by expiry together', () => {
        expect(filterCompetenceRows(rows, { programmeKey: 'p1' }, now)).toHaveLength(2)
        expect(filterCompetenceRows(rows, { expiringOnly: true }, now).map(r => r.user_id)).toEqual(['a'])
        expect(filterCompetenceRows(rows, { programmeKey: 'p2', expiringOnly: true }, now)).toEqual([])
    })
    it('leaves everything when no filter is set', () => {
        expect(filterCompetenceRows(rows, {}, now)).toHaveLength(3)
    })
})

describe('competenceCsv', () => {
    it('neutralizes formulas and keeps the agreed columns without scores', () => {
        const csv = competenceCsv([row('=cmd', 'p1', { programme_title: '@SUM(A1)', full_name: '=cmd', version_number: 3, route: 'modules', completed_at: '2027-01-26T10:00:00Z', valid_until: '2028-01-26T10:00:00Z' })])
        expect(csv.startsWith('﻿"Osoba";"Program";"Wersja";"Droga";"Data";"Ważne do"\r\n')).toBe(true)
        expect(csv).toContain(`"'=cmd";"'@SUM(A1)";"v3";"Moduły";"26.01.2027";"26.01.2028"`)
        expect(csv).not.toMatch(/%|wynik/i)
    })
    it('writes an unlimited document in words', () => {
        expect(competenceCsv([row('a', 'p1')])).toContain('"bez terminu"')
    })
})

import { describe, expect, it } from 'vitest'
import { computeTimesheetHash } from '../timesheet-hash'

describe('computeTimesheetHash', () => {
    it('produces stable hash regardless of entry order', () => {
        const a = computeTimesheetHash([
            { work_date: '2026-05-04', hours: 8, project: 'X', description: 'work A' },
            { work_date: '2026-05-05', hours: 4, project: 'Y', description: 'work B' },
        ])
        const b = computeTimesheetHash([
            { work_date: '2026-05-05', hours: 4, project: 'Y', description: 'work B' },
            { work_date: '2026-05-04', hours: 8, project: 'X', description: 'work A' },
        ])
        expect(a).toBe(b)
    })

    it('changes when an entry is modified', () => {
        const a = computeTimesheetHash([
            { work_date: '2026-05-04', hours: 8, project: 'X', description: 'work A' },
        ])
        const b = computeTimesheetHash([
            { work_date: '2026-05-04', hours: 7, project: 'X', description: 'work A' },
        ])
        expect(a).not.toBe(b)
    })

    it('treats null project consistently', () => {
        const a = computeTimesheetHash([
            { work_date: '2026-05-04', hours: 8, project: null, description: 'work A' },
        ])
        const b = computeTimesheetHash([
            { work_date: '2026-05-04', hours: 8, project: null, description: 'work A' },
        ])
        expect(a).toBe(b)
    })

    it('returns 64-char hex SHA-256', () => {
        const a = computeTimesheetHash([
            { work_date: '2026-05-04', hours: 8, project: 'X', description: 'd' },
        ])
        expect(a).toMatch(/^[0-9a-f]{64}$/)
    })
})

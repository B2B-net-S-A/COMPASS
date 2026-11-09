import { describe, expect, it, vi } from 'vitest'
import { isCountedAfterStart, readReportsStartAt } from '../rehearsal'

describe('data startu raportów', () => {
    it('bez daty startu liczy wszystko', () => {
        expect(isCountedAfterStart('2026-01-01T00:00:00Z', null)).toBe(true)
    })
    it('pomija dane sprzed startu i wiersze bez daty', () => {
        expect(isCountedAfterStart('2026-11-30T23:59:59Z', '2026-12-01T00:00:00Z')).toBe(false)
        expect(isCountedAfterStart('2026-12-01T00:00:00Z', '2026-12-01T00:00:00Z')).toBe(true)
        expect(isCountedAfterStart(null, '2026-12-01T00:00:00Z')).toBe(false)
    })
    it('brak funkcji w bazie (kod przed migracją) to tryb próby, nie awaria', async () => {
        const client = { rpc: vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'x' } })) }
        expect(await readReportsStartAt(client as never)).toBeNull()
    })
})

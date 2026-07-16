import { describe, expect, it } from 'vitest'
import { countEmployeeExitDue, type ExitInterviewLite } from '../exit-due'

const interview = (over: Partial<ExitInterviewLite>): ExitInterviewLite => ({
    id: 'i1',
    user_id: 'u1',
    scheduled_for: '2026-07-10',
    status: 'scheduled',
    ...over,
})

describe('countEmployeeExitDue (COALESCE termination_date → scheduled_for)', () => {
    it('user z termination_date NIE jest liczony drugi raz z scheduled_for', () => {
        const res = countEmployeeExitDue({
            terminationInWindow: 1,
            interviews: [interview({ user_id: 'u1' })],
            terminationDateByUser: new Map([['u1', '2026-07-20']]),
        })
        expect(res).toEqual({ due: 1, dueFallbackScheduled: 0 })
    })

    it('user bez termination_date wchodzi przez fallback scheduled_for', () => {
        const res = countEmployeeExitDue({
            terminationInWindow: 0,
            interviews: [interview({ user_id: 'u2' })],
            terminationDateByUser: new Map([['u2', null]]),
        })
        expect(res).toEqual({ due: 1, dueFallbackScheduled: 1 })
    })

    it('wywiad cancelled jest wykluczony', () => {
        const res = countEmployeeExitDue({
            terminationInWindow: 0,
            interviews: [interview({ status: 'cancelled' })],
            terminationDateByUser: new Map([['u1', null]]),
        })
        expect(res).toEqual({ due: 0, dueFallbackScheduled: 0 })
    })

    it('dwa wywiady tego samego usera liczą się raz (dedupe)', () => {
        const res = countEmployeeExitDue({
            terminationInWindow: 0,
            interviews: [
                interview({ id: 'a', user_id: 'u3' }),
                interview({ id: 'b', user_id: 'u3', scheduled_for: '2026-07-12' }),
            ],
            terminationDateByUser: new Map([['u3', null]]),
        })
        expect(res).toEqual({ due: 1, dueFallbackScheduled: 1 })
    })

    it('zanonimizowane wywiady (user_id NULL) liczą się po jednym na wywiad', () => {
        const res = countEmployeeExitDue({
            terminationInWindow: 2,
            interviews: [
                interview({ id: 'a', user_id: null }),
                interview({ id: 'b', user_id: null }),
            ],
            terminationDateByUser: new Map(),
        })
        expect(res).toEqual({ due: 4, dueFallbackScheduled: 2 })
    })

    it('wywiad bez scheduled_for nie wchodzi do fallbacku', () => {
        const res = countEmployeeExitDue({
            terminationInWindow: 0,
            interviews: [interview({ scheduled_for: null })],
            terminationDateByUser: new Map([['u1', null]]),
        })
        expect(res).toEqual({ due: 0, dueFallbackScheduled: 0 })
    })
})

import { describe, expect, it } from 'vitest'
import { runRegistrationOffer } from '../registration'
import type { AcademyRunDTO } from '@/lib/types/academy-sessions'

const now = '2027-01-10T12:00:00Z'
const session = (startsAt: string, status: 'scheduled' | 'cancelled' = 'scheduled') => ({ startsAt, endsAt: startsAt, status }) as AcademyRunDTO['sessions'][number]
const run = (patch: Partial<AcademyRunDTO> = {}) => ({ status: 'published', capacity: 10, confirmedCount: 3, waitlistCount: 0, myRegistration: null, sessions: [session('2027-01-20T09:00:00Z')], ...patch }) as AcademyRunDTO

describe('runRegistrationOffer mirrors academy_register_run', () => {
    it('offers a seat while places are free', () => {
        expect(runRegistrationOffer(run(), now, true)).toEqual({ open: true, waitlist: false, reason: null })
    })
    it('offers the waitlist at capacity, also when the roster overfills it', () => {
        expect(runRegistrationOffer(run({ confirmedCount: 10 }), now, true)).toEqual({ open: true, waitlist: true, reason: null })
        expect(runRegistrationOffer(run({ confirmedCount: 12 }), now, true).waitlist).toBe(true)
    })
    it('closes once any scheduled session has started, even if a later one is ahead', () => {
        const started = run({ sessions: [session('2027-01-10T11:59:59Z'), session('2027-02-01T09:00:00Z')] })
        expect(runRegistrationOffer(started, now, true)).toEqual({ open: false, waitlist: false, reason: 'Zapisy na rozpoczętą edycję są zamknięte.' })
    })
    it('treats a session starting exactly now as started', () => {
        expect(runRegistrationOffer(run({ sessions: [session(now)] }), now, true).open).toBe(false)
    })
    it('ignores a cancelled session that already started', () => {
        const replaced = run({ sessions: [session('2027-01-05T09:00:00Z', 'cancelled'), session('2027-01-20T09:00:00Z')] })
        expect(runRegistrationOffer(replaced, now, true).open).toBe(true)
    })
    it('closes without any scheduled session', () => {
        expect(runRegistrationOffer(run({ sessions: [] }), now, true).open).toBe(false)
        expect(runRegistrationOffer(run({ sessions: [session('2027-01-20T09:00:00Z', 'cancelled')] }), now, true).open).toBe(false)
    })
    it('closes for draft and cancelled runs', () => {
        expect(runRegistrationOffer(run({ status: 'draft' }), now, true).open).toBe(false)
        expect(runRegistrationOffer(run({ status: 'cancelled' }), now, true).open).toBe(false)
    })
    it('closes when prerequisites are not met', () => {
        expect(runRegistrationOffer(run(), now, false)).toEqual({ open: false, waitlist: false, reason: 'Najpierw ukończ wymagane szkolenia wstępne.' })
    })
    it('closes when the waitlist reached its database limit', () => {
        expect(runRegistrationOffer(run({ confirmedCount: 10, waitlistCount: 1000 }), now, true)).toEqual({ open: false, waitlist: false, reason: 'Lista rezerwowa jest pełna.' })
        expect(runRegistrationOffer(run({ confirmedCount: 10, waitlistCount: 999 }), now, true).open).toBe(true)
    })
})

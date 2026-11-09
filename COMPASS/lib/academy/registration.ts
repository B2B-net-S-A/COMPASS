import type { AcademyRunDTO } from '@/lib/types/academy-sessions'

/** Mirrors the refusals of academy_register_run, so the interface never offers a sign-up the database rejects. */
const WAITLIST_LIMIT = 1000

export interface RunRegistrationOffer {
    open: boolean
    waitlist: boolean
    reason: string | null
}

function closed(reason: string): RunRegistrationOffer {
    return { open: false, waitlist: false, reason }
}

export function runRegistrationOffer(run: Pick<AcademyRunDTO, 'status' | 'capacity' | 'confirmedCount' | 'waitlistCount' | 'sessions'>, now: string, prerequisitesMet: boolean): RunRegistrationOffer {
    if (run.status !== 'published') return closed('Edycja nie jest dostępna do zapisów.')
    const scheduled = run.sessions.filter(session => session.status === 'scheduled')
    if (scheduled.length === 0 || scheduled.some(session => Date.parse(session.startsAt) <= Date.parse(now))) return closed('Zapisy na rozpoczętą edycję są zamknięte.')
    if (!prerequisitesMet) return closed('Najpierw ukończ wymagane szkolenia wstępne.')
    if (run.waitlistCount >= WAITLIST_LIMIT) return closed('Lista rezerwowa jest pełna.')
    return { open: true, waitlist: run.confirmedCount >= run.capacity, reason: null }
}

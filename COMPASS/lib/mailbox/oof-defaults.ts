// Domyślne treści OOF dla urlopu — wersja dla kontekstu bez sesji (cron).
//
// Odpowiednik prywatnego `buildOofDefaultsFor` z lib/actions/internal-leave.ts
// (ta sama logika: data powrotu z uwzględnieniem świąt, zastępca → manager →
// biuro jako kontakt pilny). Wydzielone osobno, bo `oof-reconcile` ustawia OOF
// odroczony przy akceptacji (INT-02, `skipReason: 'compass_active'`), a moduł
// 'use server' nie może eksportować helpera przyjmującego klienta service-role.
// TODO(audyt 2026-09-22): internal-leave.ts może przejść na ten moduł, gdy
// równoległe zmiany w tym pliku zostaną scalone.

import { addDays, format, parseISO } from 'date-fns'
import { nextWorkingDayAfter, type PublicHolidayDate } from '@/lib/hr/working-days'
import { buildDefaultOofMessages } from '@/lib/mailbox/oof-template'
import { logger } from '@/lib/logger'

type Person = { full_name: string | null; email: string | null; employment_status?: string | null }

/**
 * Treści auto-reply dla urlopu. Soft-fail na każdym kroku: nieudany odczyt
 * degraduje treść (powrót liczony bez świąt, kontakt = biuro), nigdy nie rzuca.
 */
export async function buildOofDefaultsForLeave(args: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    admin: any
    userId: string
    employeeName: string
    endDate: string
    substituteId: string | null
}): Promise<{ internal: string; external: string }> {
    const { admin } = args

    let holidays: PublicHolidayDate[] = []
    try {
        // 40 dni pokrywa każdy możliwy ciąg dni wolnych po endDate.
        const horizon = format(addDays(parseISO(args.endDate), 40), 'yyyy-MM-dd')
        const { data } = await admin
            .from('public_holidays')
            .select('date, name_pl')
            .gte('date', args.endDate)
            .lte('date', horizon)
        holidays = (data ?? []) as PublicHolidayDate[]
    } catch (e) {
        logger.warn({ event: 'oof.defaults.holidays_failed', error: e instanceof Error ? e.message : String(e) })
    }

    let substituteName: string | null = null
    let substituteEmail: string | null = null
    if (args.substituteId) {
        try {
            const { data: sub } = await admin
                .from('profiles')
                .select('full_name, email')
                .eq('id', args.substituteId)
                .maybeSingle()
            const person = sub as Person | null
            if (person?.email) {
                substituteName = person.full_name ?? person.email
                substituteEmail = person.email
            }
        } catch (e) {
            logger.warn({ event: 'oof.defaults.substitute_failed', error: e instanceof Error ? e.message : String(e) })
        }
    }

    let managerName: string | null = null
    let managerEmail: string | null = null
    if (!substituteEmail) {
        try {
            const { data: prof } = await admin
                .from('profiles')
                .select('manager_id')
                .eq('id', args.userId)
                .maybeSingle()
            const managerId = (prof as { manager_id: string | null } | null)?.manager_id
            if (managerId) {
                const { data: mgr } = await admin
                    .from('profiles')
                    .select('full_name, email, employment_status')
                    .eq('id', managerId)
                    .maybeSingle()
                const person = mgr as Person | null
                // Zarchiwizowany manager to ślepy kontakt (Phase 43).
                if (person?.email && person.employment_status !== 'exited') {
                    managerName = person.full_name ?? person.email
                    managerEmail = person.email
                }
            }
        } catch (e) {
            logger.warn({ event: 'oof.defaults.manager_failed', error: e instanceof Error ? e.message : String(e) })
        }
    }

    return buildDefaultOofMessages({
        employeeName: args.employeeName,
        endDate: args.endDate,
        returnDate: nextWorkingDayAfter(args.endDate, holidays),
        substituteName,
        substituteEmail,
        managerName,
        managerEmail,
    })
}

import { describe, expect, it } from 'vitest'
import { lowPulseDeliveryDedupeKey, milestoneDeliveryDedupeKey } from '../scheduling'

/**
 * Audyt 2026-09-22, INT-19. Dispatcher anuluje dostawę, gdy owner/assignee
 * zmienił się przed wysyłką. Planner deduplikuje po (dedupe_key, channel)
 * z `ignoreDuplicates: true` — gdy klucz nie niósł odbiorcy, nowa dostawa
 * do osoby B kolidowała z anulowaną dostawą do A i przepadała po cichu.
 */
describe('klucze deduplikacji dostaw Consultant Success', () => {
    const base = {
        kind: 'task',
        entityId: 'task-1',
        milestone: 'due',
        dueDate: '2026-09-30',
    }

    it('zmiana odbiorcy daje inny klucz — nowa osoba dostaje własną dostawę', () => {
        const forA = milestoneDeliveryDedupeKey({ ...base, recipientId: 'user-a' })
        const forB = milestoneDeliveryDedupeKey({ ...base, recipientId: 'user-b' })
        expect(forA).not.toBe(forB)
        expect(forB).toContain('user-b')
    })

    it('ten sam odbiorca i termin = ten sam klucz (powtórne biegi są idempotentne)', () => {
        expect(milestoneDeliveryDedupeKey({ ...base, recipientId: 'user-a' })).toBe(
            milestoneDeliveryDedupeKey({ ...base, recipientId: 'user-a' }),
        )
        expect(milestoneDeliveryDedupeKey({ ...base, recipientId: 'user-a' })).toBe(
            'task:task-1:due:2026-09-30:user-a',
        )
    })

    it('alert o niskim pulse też niesie odbiorcę', () => {
        expect(lowPulseDeliveryDedupeKey('req-1', 'user-a')).toBe('survey:req-1:low:user-a')
        expect(lowPulseDeliveryDedupeKey('req-1', 'user-a')).not.toBe(
            lowPulseDeliveryDedupeKey('req-1', 'user-b'),
        )
    })
})

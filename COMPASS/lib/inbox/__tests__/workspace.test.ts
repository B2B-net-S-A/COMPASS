import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, filterInboxTickets, isOverdue, matchesView, needsFollowUp, getInboxArea } from '../workspace'
import { inboxEditSchema, inboxDate } from '../validation'
import { ticket } from './fixtures'
const now = new Date('2026-09-14T10:00:00Z')
const ids = (items: ReturnType<typeof ticket>[]) => items.map((item) => item.id)
describe('inbox workspace rules', () => {
    it('shows active work and recently resolved work; archives all completed work', () => {
        const items = [ticket(), ticket({ id: 'old', status: 'resolved', resolved_at: '2026-08-30T10:00:00Z' }), ticket({ id: 'recent', status: 'resolved', resolved_at: '2026-09-13T10:00:00Z' }), ticket({ id: 'closed', status: 'closed' })]
        expect(ids(filterInboxTickets(items, DEFAULT_FILTERS, 'user', now))).toEqual([items[0].id, 'recent'])
        expect(ids(filterInboxTickets(items, { ...DEFAULT_FILTERS, view: 'archive' }, 'user', now))).toEqual(['closed', 'old', 'recent'])
        expect(matchesView(ticket({ status: 'resolved', resolved_at: '2026-08-31T10:00:00Z' }), 'active', now)).toBe(true)
    })
    it('classifies Marketing independently of case type, with a legacy fallback', () => {
        const graphic = ticket({ meta: { ...ticket().meta, work_area: 'marketing' } })
        expect(filterInboxTickets([graphic, ticket()], { ...DEFAULT_FILTERS, area: 'marketing' }, 'user', now)).toEqual([graphic])
        expect(getInboxArea(ticket({ category_slug: 'inbox_marketing', meta: { ...ticket().meta, work_area: undefined } }))).toBe('marketing')
    })
    it('never marks completed work overdue; planned dates last until midnight in Warsaw', () => {
        expect(isOverdue(ticket({ status: 'resolved' }), now)).toBe(false)
        expect(isOverdue(ticket({ status: 'closed' }), now)).toBe(false)
        const planned = ticket({ meta: { ...ticket().meta, work_area: 'marketing', planned_due_date: '2026-09-14' } })
        expect(isOverdue(planned, new Date('2026-09-14T21:59:59Z'))).toBe(false)
        expect(isOverdue(planned, new Date('2026-09-14T22:00:00Z'))).toBe(true)
        expect(isOverdue(ticket({ meta: { ...ticket().meta, work_area: 'marketing' } }), now)).toBe(false)
        expect(isOverdue(ticket(), now)).toBe(true)
    })
    it('combines filters and searches Polish names without diacritics', () => {
        const filters = { ...DEFAULT_FILTERS, query: 'zaneta', assignee: 'user', category: ticket().category_id, priority: 'P3', client: 'Nordea' }
        expect(filterInboxTickets([ticket()], filters, 'user', now)).toHaveLength(1)
        expect(filterInboxTickets([ticket()], { ...filters, quick: 'unassigned' }, 'user', now)).toHaveLength(0)
        expect(filterInboxTickets([ticket(), ticket({ id: 'other', assignee_id: 'other' })], { ...DEFAULT_FILTERS, quick: 'mine' }, 'user', now)).toHaveLength(1)
        expect(filterInboxTickets([ticket()], { ...DEFAULT_FILTERS, query: 'lukasz' }, 'user', now)).toHaveLength(1)
        expect(filterInboxTickets([ticket()], { ...filters, priority: 'P1' }, 'user', now)).toHaveLength(0)
    })
    it('surfaces follow-ups due today but excludes finished cases', () => {
        const followUp = ticket({ meta: { ...ticket().meta, follow_up_date: '2026-09-14' } })
        expect(needsFollowUp(followUp, now)).toBe(true)
        expect(needsFollowUp({ ...followUp, status: 'closed' }, now)).toBe(false)
        expect(filterInboxTickets([ticket(), followUp], { ...DEFAULT_FILTERS, quick: 'follow_up' }, 'user', now)).toHaveLength(1)
    })
    it('sorts by deadline, priority and activity with undated work last', () => {
        const urgent = ticket({ id: 'urgent', meta: { ...ticket().meta, priority_level: 'P1', planned_due_date: '2026-09-20' } })
        const undated = ticket({ id: 'undated', updated_at: '2026-09-14T00:00:00Z', meta: { ...ticket().meta, work_area: 'marketing' } })
        const items = [undated, urgent, ticket()]
        expect(ids(filterInboxTickets(items, DEFAULT_FILTERS, 'user', now))).toEqual([ticket().id, 'urgent', 'undated'])
        expect(ids(filterInboxTickets(items, { ...DEFAULT_FILTERS, sort: 'priority' }, 'user', now))[0]).toBe('urgent')
        expect(ids(filterInboxTickets(items, { ...DEFAULT_FILTERS, sort: 'updated' }, 'user', now))[0]).toBe('undated')
        expect(ids(filterInboxTickets(items, { ...DEFAULT_FILTERS, sort: 'inactive' }, 'user', now)).at(-1)).toBe('undated')
    })
})
describe('workspace validation', () => {
    const edit = { subject: 'Kampania', body_md: 'Opis kampanii marketingowej', category_id: ticket().category_id, assignee_id: null, work_area: 'marketing', priority_level: 'P3', planned_due_date: null, follow_up_date: null, waiting_for: null, checklist: [], materials: [] }
    it('accepts optional dates and rejects impossible or out-of-range dates', () => {
        expect(inboxDate.safeParse(null).success).toBe(true)
        expect(inboxDate.safeParse('2026-02-30').success).toBe(false)
        expect(inboxDate.safeParse('2024-02-29').success).toBe(true)
        expect(inboxDate.safeParse('2200-01-01').success).toBe(false)
    })
    it('rejects script links and limits checklist size', () => {
        expect(inboxEditSchema.safeParse(edit).success).toBe(true)
        expect(inboxEditSchema.safeParse({ ...edit, materials: [{ id: ticket().id, label: 'Grafika', url: 'javascript:alert(1)' }] }).success).toBe(false)
        expect(inboxEditSchema.safeParse({ ...edit, checklist: Array.from({ length: 51 }, () => ({ id: ticket().id, text: 'Zadanie', done: false })) }).success).toBe(false)
    })
})

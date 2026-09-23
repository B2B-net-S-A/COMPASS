import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const state = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>>, rosters: {} as Record<string, unknown>, rosterError: null as string | null,
    reads: [] as Array<{ table: string; select: string; filters: string[]; from: number; to: number }> }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/internal-guard', () => ({ requireAdminAction: async () => ({ userId: 'admin' }) }))
vi.mock('@/lib/actions/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/actions/action-result', () => ({ runAction: async (_name: string, body: () => Promise<unknown>) => ({ success: true, data: await body() }), ExpectedError: class ExpectedError extends Error {} }))

vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: () => ({ rpc: async (_name: string, args: { p_session_ids: string[] }) => ({
    data: args.p_session_ids.map(session_id => ({ session_id, participants: state.rosters[session_id] ?? [] })),
    error: state.rosterError ? { message: state.rosterError } : null,
}), from: (table: string) => {
    let rows = state.tables[table] ?? []
    let selected = '*'
    const filters: string[] = []
    const builder = {
        select(columns: string) { selected = columns; return builder },
        eq(column: string, value: string) {
            filters.push(`eq:${column}`)
            rows = rows.filter(row => column === 'course_enrollments.user_id'
                ? (row.course_enrollments as { user_id?: string } | undefined)?.user_id === value : row[column] === value)
            return builder
        },
        contains(column: string, value: Record<string, unknown>) {
            filters.push(`contains:${column}`)
            rows = rows.filter(row => Object.entries(value).every(([key, expected]) => (row[column] as Record<string, unknown> | undefined)?.[key] === expected))
            return builder
        },
        in(column: string, values: readonly string[]) { filters.push(`in:${column}`); rows = rows.filter(row => values.includes(String(row[column]))); return builder },
        order(column: string) {
            if (rows.length && !Object.hasOwn(rows[0], column)) throw new Error(`missing_order_column:${table}.${column}`)
            filters.push(`order:${column}`)
            rows = [...rows].sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')))
            return builder
        },
        limit(count: number) { return Promise.resolve({ data: rows.slice(0, count), error: null }) },
        range(from: number, to: number) {
            state.reads.push({ table, select: selected, filters: [...filters], from, to })
            return Promise.resolve({ data: rows.slice(from, to + 1).map(row => {
                if (selected === '*') return row
                const projected: Record<string, unknown> = {}
                for (const column of selected.split(',')) {
                    const name = column.replace('!inner(user_id)', '')
                    if (name in row) projected[name] = row[name]
                }
                return projected
            }), error: null })
        },
    }
    return builder
} }) }))

import { exportPersonalData } from '../gdpr'

beforeEach(() => {
    state.reads = []
    state.tables = { profiles: [{ id: USER, full_name: 'Osoba testowa' }] }
    state.rosters = {}
    state.rosterError = null
})

describe('Academy GDPR export', () => {
    it('includes only the learner attendance and their own Teams intervals', async () => {
        state.tables.course_completions = [{ id: 'completion', enrollment_id: 'own-enrollment', user_id: USER,
            course_id: 'course', version_id: 'version', completed_at: '2026-09-23T10:00:00Z', revoked_at: null, legacy: false,
            revoked_by: OTHER, revoked_reason: 'Other employee name',
            certificate_snapshot: { course_title: 'Training', participant_name: 'Learner', version_number: 1,
                completed_at: '2026-09-23T10:00:00Z', certificate_hash: 'hash', author_name: 'Other trainer', extra: 'other@example.com' } }]
        state.tables.academy_m365_identities = [
            { id: 'identity', user_id: USER, tenant_id: 'tenant', object_id: 'object', verified_email: 'user@example.com', verified_by: OTHER },
        ]
        state.tables.session_attendance = [
            { session_id: 'session', enrollment_id: 'own-enrollment', course_enrollments: { user_id: USER }, status: 'present', note: 'Przyszedł z Anną z innego działu' },
            { session_id: 'session', enrollment_id: 'other-enrollment', course_enrollments: { user_id: OTHER }, status: 'present' },
        ]
        state.tables.academy_attendance_reports = [{ session_id: 'session', report_id: 'report', imported_at: 'now', evidence: {
            records: [
                { identity: { tenantId: 'tenant', id: 'object' }, emailAddress: 'user@example.com', intervals: [{ start: '2026-09-23T10:00:00Z', end: '2026-09-23T11:00:00Z' }] },
                { identity: { tenantId: 'tenant', id: 'other' }, intervals: [{ start: 'c', end: 'd' }], emailAddress: 'other@example.com' },
            ],
        } }]
        state.rosters.session = [{ profileId: USER, identities: [{ tenantId: 'tenant', objectId: 'object' }], verifiedEmails: ['user@example.com'] },
            { profileId: OTHER, identities: [{ tenantId: 'tenant', objectId: 'other' }], verifiedEmails: ['other@example.com'] }]
        state.tables.academy_audit_events = [
            { id: 'own-event', action: 'ACADEMY_IDENTITY_VERIFIED', details: { user_id: USER, private: 'other@example.com' } },
            { id: 'other-event', action: 'COURSE_STAFF_CHANGED', details: { user_id: OTHER } },
        ]
        const result = await exportPersonalData({ subjectType: 'employee', subjectId: USER })
        expect(result.success).toBe(true)
        if (!result.success) return
        const section = (table: string) => result.data.sections.find(item => item.table === table)
        expect(section('session_attendance')?.rows).toEqual([{ session_id: 'session', enrollment_id: 'own-enrollment', status: 'present' }])
        expect(section('academy_attendance_reports')?.rows).toEqual([{ session_id: 'session', report_id: 'report', imported_at: 'now', intervals: [{ start: '2026-09-23T10:00:00Z', end: '2026-09-23T11:00:00Z' }] }])
        expect(section('academy_audit_events')?.rows).toEqual([{ id: 'own-event', action: 'ACADEMY_IDENTITY_VERIFIED', details: { user_id: USER } }])
        expect(JSON.stringify(result.data)).not.toContain('other@example.com')
        expect(JSON.stringify(result.data)).not.toContain('Anną')
        expect(result.data.unavailable.some(item => item.table === 'session_attendance' && item.reason.includes('Notatki'))).toBe(true)
        expect(JSON.stringify(section('course_completions'))).not.toContain('Other employee name')
        expect(JSON.stringify(section('course_completions'))).not.toContain('Other trainer')
        expect(section('course_completions')?.rows[0].certificate_snapshot).toMatchObject({ course_title: 'Training', certificate_hash: 'hash' })
        expect(state.reads.find(read => read.table === 'course_completions')?.select).not.toContain('revoked_by')
        expect(state.reads.find(read => read.table === 'course_completions')?.select).not.toContain('revoked_reason')
        expect(JSON.stringify(result.data)).not.toContain('other-enrollment')
        expect(JSON.stringify(section('academy_m365_identities'))).not.toContain('verified_by')
        expect(state.reads.find(read => read.table === 'session_attendance')?.filters).toContain('eq:course_enrollments.user_id')
    })

    it('reads beyond one API page without silently losing rows', async () => {
        state.tables.academy_notification_receipts = Array.from({ length: 701 }, (_, index) => ({ user_id: USER, dedupe_key: `receipt-${index}` }))
        const result = await exportPersonalData({ subjectType: 'employee', subjectId: USER })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.sections.find(section => section.table === 'academy_notification_receipts')).toMatchObject({ rowCount: 701, truncated: false })
        expect(state.reads.filter(read => read.table === 'academy_notification_receipts').map(read => read.from)).toEqual([0, 500])
    })

    it('reports truncation at 5000 instead of claiming a complete export', async () => {
        state.tables.academy_notification_receipts = Array.from({ length: 5002 }, (_, index) => ({ user_id: USER, dedupe_key: `receipt-${String(index).padStart(5, '0')}` }))
        const result = await exportPersonalData({ subjectType: 'employee', subjectId: USER })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.sections.find(section => section.table === 'academy_notification_receipts')).toMatchObject({ rowCount: 5000, truncated: true })
    })

    it('finds own raw report records even before an attendance decision exists', async () => {
        state.tables.academy_m365_identities = [{ id: 'identity', user_id: USER, tenant_id: 'tenant', object_id: 'object' }]
        state.tables.course_run_registrations = [{ id: 'registration', user_id: USER, run_id: 'run' }]
        state.tables.course_sessions = [{ id: 'session', run_id: 'run' }, { id: 'other-session', run_id: 'other-run' }]
        state.tables.academy_attendance_reports = [{ session_id: 'session', report_id: 'report', evidence: {
            records: [{ identity: { tenantId: 'tenant', id: 'object' }, intervals: [] }],
        } }]
        state.rosters.session = [{ profileId: USER, identities: [{ tenantId: 'tenant', objectId: 'object' }], verifiedEmails: [] }]
        const result = await exportPersonalData({ subjectType: 'employee', subjectId: USER })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.sections.find(section => section.table === 'academy_attendance_reports')?.rows).toEqual([
            { session_id: 'session', report_id: 'report', imported_at: undefined, intervals: [] },
        ])
        expect(state.reads.find(read => read.table === 'course_sessions')?.filters).toContain('in:run_id')
    })

    it('never exports a Teams interval when verified identity and email point to different learners', async () => {
        state.tables.course_run_registrations = [{ id: 'registration', user_id: USER, run_id: 'run' }]
        state.tables.course_sessions = [{ id: 'session', run_id: 'run' }]
        state.rosters.session = [{ profileId: USER, identities: [{ tenantId: 'tenant', objectId: 'subject' }], verifiedEmails: ['subject@example.com'] },
            { profileId: OTHER, identities: [{ tenantId: 'tenant', objectId: 'other' }], verifiedEmails: ['other@example.com'] }]
        state.tables.academy_attendance_reports = [{ session_id: 'session', report_id: 'report', evidence: { records: [
            { identity: { tenantId: 'tenant', id: 'subject' }, emailAddress: 'other@example.com',
                intervals: [{ start: '2026-09-23T10:00:00Z', end: '2026-09-23T11:00:00Z' }] },
        ] } }]
        const result = await exportPersonalData({ subjectType: 'employee', subjectId: USER })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.sections.find(section => section.table === 'academy_attendance_reports')?.rows).toEqual([])
        expect(result.data.unavailable.some(item => item.table === 'academy_attendance_reports' && item.reason.includes('niejednoznaczna'))).toBe(true)
        expect(JSON.stringify(result.data)).not.toContain('other@example.com')
    })

    it('marks Teams reports unavailable if the private roster lookup fails', async () => {
        state.tables.course_run_registrations = [{ id: 'registration', user_id: USER, run_id: 'run' }]
        state.tables.course_sessions = [{ id: 'session', run_id: 'run' }]
        state.rosterError = 'permission denied'
        const result = await exportPersonalData({ subjectType: 'employee', subjectId: USER })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.sections.some(section => section.table === 'academy_attendance_reports')).toBe(false)
        expect(result.data.unavailable.some(item => item.table === 'academy_attendance_reports')).toBe(true)
    })

    it('does not claim raw reports are complete for a facilitator without learner registration', async () => {
        state.tables.course_staff = [{ course_id: 'course', user_id: USER, role: 'facilitator', granted_at: 'now', revoked_at: null }]
        state.tables.academy_m365_identities = [{ id: 'identity', user_id: USER, tenant_id: 'tenant', object_id: 'object' }]
        const result = await exportPersonalData({ subjectType: 'employee', subjectId: USER })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.sections.some(section => section.table === 'academy_attendance_reports')).toBe(false)
        expect(result.data.unavailable.some(item => item.table === 'academy_attendance_reports' && item.reason.includes('trener'))).toBe(true)
    })

    it('does not claim raw reports are complete for a course author without learner registration', async () => {
        state.tables.courses = [{ id: 'course', author_id: USER }]
        const result = await exportPersonalData({ subjectType: 'employee', subjectId: USER })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.sections.some(section => section.table === 'academy_attendance_reports')).toBe(false)
        expect(result.data.unavailable.some(item => item.table === 'academy_attendance_reports')).toBe(true)
    })

    it('keeps contractor exports working for sources without an id primary key', async () => {
        state.tables.contractors = [{ id: USER, full_name: 'Kontraktor testowy' }]
        state.tables.contractor_success_settings = [{ contractor_id: USER, status: 'active' }]
        state.tables.support_inbox_meta = [{ ticket_id: 'ticket', contractor_id: USER }]
        const result = await exportPersonalData({ subjectType: 'contractor', subjectId: USER })
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.sections.find(section => section.table === 'contractor_success_settings')?.rowCount).toBe(1)
        expect(result.data.sections.find(section => section.table === 'support_inbox_meta')?.rowCount).toBe(1)
        expect(state.reads.find(read => read.table === 'contractor_success_settings')?.filters).toContain('order:contractor_id')
        expect(state.reads.find(read => read.table === 'support_inbox_meta')?.filters).toContain('order:ticket_id')
        expect(state.reads.some(read => read.table === 'academy_attendance_reports')).toBe(false)
    })
})

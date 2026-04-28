import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

function setupClient(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('getRecentNotifications', () => {
    it('returns auth error when not signed in', async () => {
        setupClient({ user: null })
        const { getRecentNotifications } = await import('../notifications')
        const result = await getRecentNotifications()
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/zalogowany/)
    })

    it('returns only notifications belonging to the current user (RLS-like)', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: [
                    { id: 'n1', user_id: 'u1', is_read: false, type: 'info', created_at: '2026-04-01T00:00:00Z' },
                    { id: 'n2', user_id: 'u2', is_read: false, type: 'info', created_at: '2026-04-02T00:00:00Z' },
                    { id: 'n3', user_id: 'u1', is_read: true, type: 'system', created_at: '2026-04-03T00:00:00Z' },
                ],
            },
        })
        const { getRecentNotifications } = await import('../notifications')
        const result = await getRecentNotifications(10) as { success: true; notifications: Array<{ id: string; user_id: string }> }
        expect(result.notifications.every(n => n.user_id === 'u1')).toBe(true)
        expect(result.notifications.map(n => n.id).sort()).toEqual(['n1', 'n3'])
    })

    it('respects unreadOnly=true filter', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: [
                    { id: 'n1', user_id: 'u1', is_read: false, type: 'info', created_at: '2026-04-01' },
                    { id: 'n2', user_id: 'u1', is_read: true, type: 'info', created_at: '2026-04-02' },
                ],
            },
        })
        const { getRecentNotifications } = await import('../notifications')
        const result = await getRecentNotifications(10, true) as { success: true; notifications: Array<{ id: string }> }
        expect(result.notifications.map(n => n.id)).toEqual(['n1'])
    })

    it('respects limit parameter', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: Array.from({ length: 30 }, (_, i) => ({
                    id: `n${i}`, user_id: 'u1', is_read: false, type: 'info',
                    created_at: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
                })),
            },
        })
        const { getRecentNotifications } = await import('../notifications')
        const result = await getRecentNotifications(5) as { success: true; notifications: unknown[] }
        expect(result.notifications).toHaveLength(5)
    })
})

describe('markNotificationAsRead', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { markNotificationAsRead } = await import('../notifications')
        expect((await markNotificationAsRead('n1')).success).toBe(false)
    })

    it('updates is_read=true and sets read_at on owned notification', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: [{ id: 'n1', user_id: 'u1', is_read: false, type: 'info', created_at: '2026-04-01' }],
            },
        })
        const { markNotificationAsRead } = await import('../notifications')
        const result = await markNotificationAsRead('n1')
        expect(result.success).toBe(true)
        expect(currentClient._tables.notifications[0].is_read).toBe(true)
        expect(currentClient._tables.notifications[0].read_at).toBeTruthy()
    })

    it('does not affect other users notifications (RLS-like)', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: [
                    { id: 'n1', user_id: 'u2', is_read: false, type: 'info', created_at: '2026-04-01' },
                ],
            },
        })
        const { markNotificationAsRead } = await import('../notifications')
        await markNotificationAsRead('n1')
        expect(currentClient._tables.notifications[0].is_read).toBe(false)
    })
})

describe('markAllNotificationsAsRead', () => {
    it('marks all unread for current user, leaves others untouched', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: [
                    { id: 'n1', user_id: 'u1', is_read: false, type: 'info', created_at: '2026-04-01' },
                    { id: 'n2', user_id: 'u1', is_read: false, type: 'info', created_at: '2026-04-02' },
                    { id: 'n3', user_id: 'u2', is_read: false, type: 'info', created_at: '2026-04-03' },
                ],
            },
        })
        const { markAllNotificationsAsRead } = await import('../notifications')
        const result = await markAllNotificationsAsRead()
        expect(result.success).toBe(true)
        const tbl = currentClient._tables.notifications
        expect(tbl.find(n => n.id === 'n1')!.is_read).toBe(true)
        expect(tbl.find(n => n.id === 'n2')!.is_read).toBe(true)
        expect(tbl.find(n => n.id === 'n3')!.is_read).toBe(false)
    })
})

describe('deleteNotification', () => {
    it('deletes the row when owned by current user', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: [
                    { id: 'n1', user_id: 'u1', type: 'info', is_read: false, created_at: '2026-04-01' },
                ],
            },
        })
        const { deleteNotification } = await import('../notifications')
        const result = await deleteNotification('n1')
        expect(result.success).toBe(true)
        expect(currentClient._tables.notifications).toEqual([])
    })

    it('does not delete other-user notifications', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: [{ id: 'n1', user_id: 'u2', type: 'info', is_read: false, created_at: '2026-04-01' }],
            },
        })
        const { deleteNotification } = await import('../notifications')
        await deleteNotification('n1')
        expect(currentClient._tables.notifications).toHaveLength(1)
    })
})

describe('createNotification (admin/self only)', () => {
    it('rejects non-admin trying to notify someone else', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { createNotification } = await import('../notifications')
        const result = await createNotification({
            userId: 'u-other',
            type: 'info',
            titlePl: 't',
            titleEn: 't',
        })
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/uprawnie/i)
    })

    it('allows a user to notify themselves regardless of role', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
            rpcs: {
                create_notification: () => 'new-notif-id',
            },
        })
        const { createNotification } = await import('../notifications')
        const result = await createNotification({
            userId: 'u1',
            type: 'info',
            titlePl: 't',
            titleEn: 't',
        })
        expect(result.success).toBe(true)
        expect(result.notificationId).toBe('new-notif-id')
    })

    it('allows admin to notify anyone', async () => {
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: { profiles: [{ id: 'u-admin', role: 'admin' }] },
            rpcs: { create_notification: () => 'nid' },
        })
        const { createNotification } = await import('../notifications')
        const result = await createNotification({
            userId: 'u-target',
            type: 'info',
            titlePl: 't',
            titleEn: 't',
        })
        expect(result.success).toBe(true)
    })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => currentClient,
}))

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('getOrCreateDirectConversation — RBAC for consultants', () => {
    it('returns auth error when not signed in', async () => {
        setup({ user: null })
        const { getOrCreateDirectConversation } = await import('../communicator')
        const result = await getOrCreateDirectConversation('u-target')
        expect(result.id).toBeNull()
        expect(result.error).toMatch(/autoryzacj/)
    })

    it('rejects consultant→consultant direct messaging (internal policy)', async () => {
        setup({
            user: { id: 'u1', email: 'c1@x.com' },
            tables: {
                profiles: [
                    { id: 'u1', role: 'consultant' },
                    { id: 'u2', role: 'consultant' },
                ],
            },
        })
        const { getOrCreateDirectConversation } = await import('../communicator')
        const result = await getOrCreateDirectConversation('u2')
        expect(result.id).toBeNull()
        expect(result.error).toMatch(/Konsultanci nie mogą pisać do siebie/i)
    })

    it('returns null when target profile is missing', async () => {
        setup({
            user: { id: 'u1', email: 'c1@x.com' },
            tables: {
                profiles: [{ id: 'u1', role: 'consultant' }],
            },
        })
        const { getOrCreateDirectConversation } = await import('../communicator')
        const result = await getOrCreateDirectConversation('u-missing')
        expect(result.id).toBeNull()
        expect(result.error).toMatch(/Nie znaleziono profilu/)
    })

    it('creates new conversation via RPC when no existing direct chat', async () => {
        const rpcSpy = vi.fn(async () => 'new-conv-id')
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                profiles: [
                    { id: 'u1', role: 'consultant' },
                    { id: 'u-admin', role: 'admin' },
                ],
                conversation_participants: [],
            },
            rpcs: { create_direct_conversation: rpcSpy },
        })
        const { getOrCreateDirectConversation } = await import('../communicator')
        const result = await getOrCreateDirectConversation('u-admin')
        expect(result.id).toBe('new-conv-id')
        expect(result.error).toBeNull()
        expect(rpcSpy).toHaveBeenCalledOnce()
    })
})

describe('sendMessage', () => {
    it('returns auth error when not authenticated', async () => {
        setup({ user: null })
        const { sendMessage } = await import('../communicator')
        const result = await sendMessage('conv1', 'hello')
        expect(result.error).toMatch(/autoryzacj/)
    })

    it('inserts a message + updates conversation last_message_at', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                messages: [],
                conversations: [{ id: 'conv1', last_message_at: '2026-01-01T00:00:00Z' }],
                conversation_participants: [{ conversation_id: 'conv1', user_id: 'u1' }],
            },
        })
        const { sendMessage } = await import('../communicator')
        const result = await sendMessage('conv1', 'hello world')
        expect(result.error).toBeNull()
        const msg = currentClient._tables.messages[0]
        expect(msg.content).toBe('hello world')
        expect(msg.sender_id).toBe('u1')
        expect(msg.conversation_id).toBe('conv1')
        expect(msg.type).toBe('text')
        const conv = currentClient._tables.conversations[0]
        expect(conv.last_message_at).not.toBe('2026-01-01T00:00:00Z')
    })

    it('stores only validated private attachment metadata', async () => {
        const upload = vi.fn(async () => ({ data: { path: 'stored' }, error: null }))
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                messages: [],
                conversations: [{ id: 'conv1' }],
                conversation_participants: [{ conversation_id: 'conv1', user_id: 'u1' }],
            },
            storage: { 'chat-attachments': { upload } },
        })
        const { sendMessageWithAttachment } = await import('../communicator')
        const formData = new FormData()
        formData.set('file', new File([
            new Uint8Array([
                0x89, 0x50, 0x4e, 0x47,
                0x0d, 0x0a, 0x1a, 0x0a,
                0x00, 0x00, 0x00, 0x00,
            ]),
        ], 'screen.png', { type: 'image/png' }))
        const result = await sendMessageWithAttachment('conv1', 'check this out', formData)
        expect(result.error).toBeNull()
        expect(upload).toHaveBeenCalledOnce()
        const msg = currentClient._tables.messages[0]
        expect(msg.type).toBe('image')
        expect(msg.attachment_url).toBeNull()
        expect(msg.attachment_path).toMatch(/^conv1\/u1\/[0-9a-f-]{36}\.png$/)
        expect(msg.attachment_mime).toBe('image/png')
    })

    it('rejects content that is disguised with an allowed MIME', async () => {
        const upload = vi.fn(async () => ({ data: { path: 'stored' }, error: null }))
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                messages: [],
                conversations: [{ id: 'conv1' }],
                conversation_participants: [{ conversation_id: 'conv1', user_id: 'u1' }],
            },
            storage: { 'chat-attachments': { upload } },
        })
        const { sendMessageWithAttachment } = await import('../communicator')
        const formData = new FormData()
        formData.set('file', new File(
            ['<svg onload="alert(1)"></svg>'],
            'screen.png',
            { type: 'image/png' },
        ))

        const result = await sendMessageWithAttachment('conv1', '', formData)

        expect(result.error).toMatch(/zawartość pliku/i)
        expect(upload).not.toHaveBeenCalled()
        expect(currentClient._tables.messages).toHaveLength(0)
    })

    it('rejects an attachment from a non-participant before upload', async () => {
        const upload = vi.fn(async () => ({ data: { path: 'stored' }, error: null }))
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                messages: [],
                conversations: [{ id: 'conv1' }],
                conversation_participants: [{ conversation_id: 'conv1', user_id: 'u2' }],
            },
            storage: { 'chat-attachments': { upload } },
        })
        const { sendMessageWithAttachment } = await import('../communicator')
        const formData = new FormData()
        formData.set('file', new File(['secret'], 'note.txt', { type: 'text/plain' }))
        const result = await sendMessageWithAttachment('conv1', '', formData)
        expect(result.error).toMatch(/Brak dostępu/)
        expect(upload).not.toHaveBeenCalled()
        expect(currentClient._tables.messages).toHaveLength(0)
    })

    it('denies a sender who is not a conversation participant', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                messages: [],
                conversations: [{ id: 'conv1' }],
                conversation_participants: [{ conversation_id: 'conv1', user_id: 'u2' }],
            },
        })
        const { sendMessage } = await import('../communicator')
        const result = await sendMessage('conv1', 'should not pass')
        expect(result.error).toMatch(/Brak dostępu/)
        expect(currentClient._tables.messages).toHaveLength(0)
    })
})

describe('createBroadcastGroup — admin only', () => {
    it('rejects non-admin', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { createBroadcastGroup } = await import('../communicator')
        const result = await createBroadcastGroup('Announce', ['u-target'])
        expect(result.id).toBeNull()
        expect(result.error).toMatch(/admins can create broadcast/i)
    })

    it('admin creates broadcast via RPC', async () => {
        const rpcSpy = vi.fn(async () => 'broadcast-conv-id')
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: { profiles: [{ id: 'u-admin', role: 'admin' }] },
            rpcs: { create_broadcast_conversation: rpcSpy },
        })
        const { createBroadcastGroup } = await import('../communicator')
        const result = await createBroadcastGroup('All hands', ['u1', 'u2'])
        expect(result.id).toBe('broadcast-conv-id')
        expect(result.error).toBeNull()
    })
})

describe('searchUsersToMessage', () => {
    it('returns [] when not authenticated', async () => {
        setup({ user: null })
        const { searchUsersToMessage } = await import('../communicator')
        const result = await searchUsersToMessage('Jan')
        expect(result.data).toEqual([])
        expect(result.error).toMatch(/autoryzacj/)
    })

    it('returns [] when caller has no profile', async () => {
        setup({
            user: { id: 'u-orphan', email: 'orphan@x.com' },
            tables: { profiles: [] },
        })
        const { searchUsersToMessage } = await import('../communicator')
        const result = await searchUsersToMessage('Jan')
        expect(result.data).toEqual([])
    })
})

describe('markAsRead', () => {
    it('updates last_read_at for current user/conv pair', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                conversation_participants: [
                    { user_id: 'u1', conversation_id: 'conv1', last_read_at: '2026-01-01T00:00:00Z' },
                    { user_id: 'u2', conversation_id: 'conv1', last_read_at: '2026-01-01T00:00:00Z' },
                ],
            },
        })
        const { markAsRead } = await import('../communicator')
        await markAsRead('conv1')
        const myRow = currentClient._tables.conversation_participants.find((p: any) => p.user_id === 'u1')
        const otherRow = currentClient._tables.conversation_participants.find((p: any) => p.user_id === 'u2')
        // My row updated
        expect(myRow?.last_read_at).not.toBe('2026-01-01T00:00:00Z')
        // Other user's row unchanged
        expect(otherRow?.last_read_at).toBe('2026-01-01T00:00:00Z')
    })
})

describe('sendBroadcastToAll — admin only', () => {
    it('rejects non-admin', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { sendBroadcastToAll } = await import('../communicator')
        const result = await sendBroadcastToAll('Title', 'content', false)
        expect(result.error).toMatch(/Tylko administrator/)
        expect(result.recipientCount).toBe(0)
    })

    it.each(['admin'])('allows %s role', async (role) => {
        const rpcSpy = vi.fn(async () => 'broadcast-conv-id')
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [
                    { id: 'u-admin', role, full_name: 'Admin' },
                    { id: 'u1', email: 'u1@x.com', role: 'consultant' },
                    { id: 'u2', email: 'u2@x.com', role: 'consultant' },
                ],
                messages: [],
            },
            rpcs: { create_broadcast_conversation: rpcSpy },
        })
        const { sendBroadcastToAll } = await import('../communicator')
        const result = await sendBroadcastToAll('Title', 'Hello everyone', false)
        expect(result.error).toBeNull()
        expect(result.recipientCount).toBe(2) // u1 + u2 (admin excluded as sender)
    })
})

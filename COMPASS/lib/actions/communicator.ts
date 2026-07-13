'use server'

import { logCompat } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import {
    CHAT_ATTACHMENT_EXTENSIONS,
    CHAT_ATTACHMENT_MAX_BYTES,
    safeAttachmentName,
    type ChatAttachmentMime,
} from '@/lib/chat/attachments'

// Types
export type ConversationType = 'direct' | 'broadcast'
export type ParticipantRole = 'owner' | 'member' | 'admin'

export interface Conversation {
    id: string
    type: ConversationType
    name?: string
    owner_id?: string
    last_message_at: string
    participants?: {
        user_id: string
        role: ParticipantRole
        full_name?: string
        avatar_url?: string
    }[]
    last_message?: {
        content: string
        created_at: string
        sender_id: string
        is_read: boolean
    }
}

/**
 * Pobiera listę konwersacji dla zalogowanego użytkownika
 */
export async function getConversations(): Promise<{ data: Conversation[], error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { data: [], error: 'Brak autoryzacji' }

    // 1. Get conversations where user is a participant
    const { data: conversations, error } = await supabase
        .from('conversation_participants')
        .select(`
            conversation:conversations (
                id,
                type,
                name,
                owner_id,
                last_message_at
            ),
            last_read_at
        `)
        .eq('user_id', user.id)
        .order('last_read_at', { ascending: false })

    if (error) {
        logCompat.error('Error fetching conversations:', error)
        return { data: [], error: 'Nie udało się pobrać rozmów' }
    }

    // 2. Hydrate with participants (for Direct) and last message
    const populatedConversations: Conversation[] = []

    for (const item of conversations as any) {
        const conv = item.conversation

        // Fetch last message
        const { data: lastMsg } = await supabase
            .from('messages')
            .select('content, created_at, sender_id')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        // Fetch other participant (for direct) or owner (for broadcast)
        const { data: participants } = await supabase
            .from('conversation_participants')
            .select('user_id, role')
            .eq('conversation_id', conv.id)

        const otherIds = (participants ?? [])
            .filter((p) => p.user_id !== user.id)
            .map((p) => p.user_id)
        const { data: directory } = otherIds.length > 0
            ? await supabase
                .from('profile_directory')
                .select('id, full_name, avatar_url')
                .in('id', otherIds)
            : { data: [] }
        const directoryById = new Map((directory ?? []).map((entry) => [entry.id, entry]))

        // Filter out self for direct chats
        const otherParticipants = participants?.filter((p) => p.user_id !== user.id).map((p) => ({
            user_id: p.user_id,
            role: p.role as ParticipantRole,
            full_name: directoryById.get(p.user_id)?.full_name ?? undefined,
            avatar_url: directoryById.get(p.user_id)?.avatar_url ?? undefined,
        })) || []

        populatedConversations.push({
            id: conv.id,
            type: conv.type,
            name: conv.name,
            owner_id: conv.owner_id,
            last_message_at: conv.last_message_at,
            participants: otherParticipants,
            last_message: lastMsg && lastMsg.content && lastMsg.created_at ? {
                content: lastMsg.content,
                created_at: lastMsg.created_at,
                sender_id: lastMsg.sender_id,
                is_read: new Date(lastMsg.created_at) <= new Date(item.last_read_at)
            } : undefined
        })
    }

    populatedConversations.sort((a, b) =>
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    )

    return { data: populatedConversations, error: null }
}

/**
 * Tworzy nową lub zwraca istniejącą konwersację 1:1
 */
export async function getOrCreateDirectConversation(targetUserId: string): Promise<{ id: string | null, error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { id: null, error: 'Brak autoryzacji' }

    const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const admin = createServiceClient()
    const { data: targetProfile } = await admin.from('profiles').select('role').eq('id', targetUserId).single()

    if (!myProfile || !targetProfile) return { id: null, error: 'Nie znaleziono profilu' }

    if (myProfile.role === 'consultant' && targetProfile.role === 'consultant') {
        return { id: null, error: 'Polityka wewnętrzna: Konsultanci nie mogą pisać do siebie bezpośrednio.' }
    }

    // Attempt to find existing
    const { data: myConvs } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id)

    if (myConvs) {
        for (const c of myConvs) {
            const { data: verifyTarget } = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('conversation_id', c.conversation_id)
                .eq('user_id', targetUserId)
                .single()

            if (verifyTarget) {
                const { data: convType } = await supabase
                    .from('conversations')
                    .select('type')
                    .eq('id', c.conversation_id)
                    .single()

                if (convType?.type === 'direct') {
                    return { id: c.conversation_id, error: null }
                }
            }
        }
    }

    // Create new via RPC (SECURITY DEFINER bypasses the INSERT...RETURNING + SELECT policy conflict).
    // create_direct_conversation (migration 20260223_fix_communicator_rls_v2) is absent from the
    // regenerated types — cast preserves behavior until the types are regenerated against prod.
    const { data: newConvId, error: createError } = await (supabase as any)
        .rpc('create_direct_conversation', {
            p_user_id: user.id,
            p_target_user_id: targetUserId,
        })

    if (createError) return { id: null, error: createError.message }

    revalidatePath('/messages')
    return { id: newConvId, error: null }
}

/**
 * Pobiera wiadomości z danej konwersacji
 */
export async function getMessages(conversationId: string): Promise<{ data: any[], error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Brak autoryzacji' }

    const { data: membership } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()
    if (!membership) return { data: [], error: 'Brak dostępu do rozmowy' }

    const { data: messages, error } = await supabase
        .from('messages')
        .select(`
            id,
            content,
            created_at,
            sender_id,
            type,
            attachment_url,
            attachment_path,
            attachment_name,
            attachment_mime,
            attachment_size
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }) // Older first

    if (error) {
        logCompat.error('Error fetching messages:', error)
        return { data: [], error: error.message }
    }

    const senderIds = Array.from(new Set((messages ?? []).map((message) => message.sender_id)))
    const { data: directory } = senderIds.length > 0
        ? await supabase
            .from('profile_directory')
            .select('id, full_name, avatar_url')
            .in('id', senderIds)
        : { data: [] }
    const directoryById = new Map((directory ?? []).map((entry) => [entry.id, entry]))
    const admin = createServiceClient()
    const securedMessages = await Promise.all((messages ?? []).map(async (message: any) => {
        const sender = directoryById.get(message.sender_id) ?? null
        if (!message.attachment_path) {
            // Unknown legacy URLs are deliberately withheld and queued for
            // operator review by the expand migration.
            return { ...message, sender, attachment_url: null }
        }

        const { data: signed } = await admin.storage
            .from('chat-attachments')
            .createSignedUrl(message.attachment_path, 60)
        return { ...message, sender, attachment_url: signed?.signedUrl ?? null }
    }))

    return { data: securedMessages, error: null }
}

export async function sendMessageWithAttachment(
    conversationId: string,
    content: string,
    formData: FormData,
): Promise<{ error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Brak autoryzacji' }

    const { data: membership } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()
    if (!membership) return { error: 'Brak dostępu do rozmowy' }

    const file = formData.get('file')
    if (!(file instanceof File)) return { error: 'Nie wybrano pliku.' }
    if (file.size < 1 || file.size > CHAT_ATTACHMENT_MAX_BYTES) {
        return { error: 'Plik jest pusty albo przekracza limit 10 MB.' }
    }

    const mime = file.type as ChatAttachmentMime
    const extension = CHAT_ATTACHMENT_EXTENSIONS[mime]
    if (!extension) return { error: 'Dozwolone są JPG, PNG, WEBP, PDF i TXT.' }

    let name: string
    try {
        name = safeAttachmentName(file.name)
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Nieprawidłowa nazwa pliku.' }
    }
    const path = `${conversationId}/${user.id}/${randomUUID()}.${extension}`
    const admin = createServiceClient()
    const { error: uploadError } = await admin.storage
        .from('chat-attachments')
        .upload(path, file, {
            contentType: mime,
            upsert: false,
            cacheControl: '60',
        })
    if (uploadError) {
        logCompat.error('Chat attachment upload failed:', { conversationId, userId: user.id, code: uploadError.name })
        return { error: 'Nie udało się przesłać załącznika.' }
    }

    const type = mime.startsWith('image/') ? 'image' : 'file'
    const messageContent = content.trim() || name
    const { error: messageError } = await supabase
        .from('messages')
        .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content: messageContent,
            type,
            attachment_url: null,
            attachment_path: path,
            attachment_name: name,
            attachment_mime: mime,
            attachment_size: file.size,
        })

    if (messageError) {
        const { error: cleanupError } = await admin.storage
            .from('chat-attachments')
            .remove([path])
        if (cleanupError) {
            logCompat.error('Orphan chat attachment cleanup failed:', {
                conversationId,
                userId: user.id,
                path,
                code: cleanupError.name,
            })
        }
        logCompat.error('Send attachment message error:', messageError)
        return { error: 'Nie udało się wysłać załącznika.' }
    }

    await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId)

    revalidatePath('/messages')
    return { error: null }
}

/**
 * Wysyła wiadomość
 */
export async function sendMessage(
    conversationId: string,
    content: string,
): Promise<{ error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Brak autoryzacji' }

    const { data: membership } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()
    if (!membership) return { error: 'Brak dostępu do rozmowy' }

    const { error } = await supabase
        .from('messages')
        .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content,
            type: 'text',
            attachment_url: null,
            attachment_path: null,
            attachment_name: null,
            attachment_mime: null,
            attachment_size: null,
        })

    if (error) {
        logCompat.error('Send message error:', error)
        return { error: 'Nie udało się wysłać wiadomości: ' + error.message }
    }

    await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId)

    revalidatePath('/messages')
    return { error: null }
}

/**
 * Oznacza konwersację jako przeczytaną
 */
export async function markAsRead(conversationId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .match({ conversation_id: conversationId, user_id: user.id })

    revalidatePath('/messages')
}

/**
 * Zwraca wszystkich użytkowników dostępnych do wysłania wiadomości.
 * Używane przy otwarciu trybu "Nowa wiadomość" (przed wpisaniem czegokolwiek).
 */
export async function getAllUsersToMessage(): Promise<{ data: any[], error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Brak autoryzacji' }

    const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!myProfile) return { data: [], error: 'Nie znaleziono profilu' }

    const queryBuilder = supabase
        .from('profile_directory')
        .select('id, full_name, avatar_url, job_title, department')
        .neq('id', user.id)
        .not('full_name', 'is', null)
        .order('full_name')
        .limit(50)

    const { data, error } = await queryBuilder

    if (error) {
        logCompat.error('Get all users error:', error)
        return { data: [], error: error.message }
    }

    let visibleDirectory = data || []
    if (myProfile.role === 'consultant' && visibleDirectory.length > 0) {
        // Role is used only as an authorization filter on the server. It is
        // deliberately not returned by the safe directory response.
        const admin = createServiceClient()
        const { data: consultantProfiles } = await admin
            .from('profiles')
            .select('id')
            .in('id', visibleDirectory.map((entry) => entry.id))
            .eq('role', 'consultant')
        const blockedIds = new Set((consultantProfiles ?? []).map((entry) => entry.id))
        visibleDirectory = visibleDirectory.filter((entry) => !blockedIds.has(entry.id))
    }

    return { data: visibleDirectory, error: null }
}

/**
 * Wyszukuje użytkowników do nowej wiadomości (filtrowanie po nazwie)
 */
export async function searchUsersToMessage(query: string): Promise<{ data: any[], error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Brak autoryzacji' }

    const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!myProfile) return { data: [], error: 'Nie znaleziono profilu' }

    const safeQuery = query
        .trim()
        .normalize('NFKC')
        .replace(/[^A-Za-z0-9\u00C0-\u024F\s-]/g, '')
        .slice(0, 100)
    if (safeQuery.length < 2) return { data: [], error: null }

    const queryBuilder = supabase
        .from('profile_directory')
        .select('id, full_name, avatar_url, job_title, department')
        .or(`full_name.ilike.%${safeQuery}%,job_title.ilike.%${safeQuery}%,department.ilike.%${safeQuery}%`)
        .neq('id', user.id)
        .order('full_name')
        .limit(20)

    const { data, error } = await queryBuilder

    if (error) {
        logCompat.error('Search users error:', error)
        return { data: [], error: error.message }
    }

    let visibleDirectory = data || []
    if (myProfile.role === 'consultant' && visibleDirectory.length > 0) {
        const admin = createServiceClient()
        const { data: consultantProfiles } = await admin
            .from('profiles')
            .select('id')
            .in('id', visibleDirectory.map((entry) => entry.id))
            .eq('role', 'consultant')
        const blockedIds = new Set((consultantProfiles ?? []).map((entry) => entry.id))
        visibleDirectory = visibleDirectory.filter((entry) => !blockedIds.has(entry.id))
    }

    return { data: visibleDirectory, error: null }
}

/**
 * Creates or updates a broadcast group (Admin only)
 */
export async function createBroadcastGroup(name: string, participantIds: string[]): Promise<{ id: string | null, error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { id: null, error: 'Brak autoryzacji' }

    const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (myProfile?.role !== 'admin') {
        return { id: null, error: 'Only admins can create broadcast groups' }
    }

    // create_broadcast_conversation RPC is absent from the regenerated types; cast preserves behavior.
    const { data: convId, error: convError } = await (supabase as any)
        .rpc('create_broadcast_conversation', {
            p_owner_id: user.id,
            p_name: name,
            p_participant_ids: participantIds,
        })

    if (convError) return { id: null, error: convError.message }

    revalidatePath('/messages')
    return { id: convId, error: null }
}

/**
 * Admin: Wysyła ogłoszenie (broadcast) do wszystkich użytkowników + opcjonalnie email
 */
export async function sendBroadcastToAll(
    title: string,
    content: string,
    sendEmail: boolean = false
): Promise<{ error: string | null, recipientCount: number }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Brak autoryzacji', recipientCount: 0 }

    // Only admin can send broadcasts
    const { data: myProfile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
    if (!myProfile || !['admin'].includes(myProfile.role ?? '')) {
        return { error: 'Tylko administrator może wysyłać ogłoszenia', recipientCount: 0 }
    }

    // Get all users (except sender)
    const admin = createServiceClient()
    const { data: allUsers, error: usersError } = await admin
        .from('profiles')
        .select('id, email')
        .neq('id', user.id)

    if (usersError || !allUsers) {
        return { error: 'Nie udało się pobrać listy użytkowników', recipientCount: 0 }
    }

    // Create broadcast conversation via RPC
    const participantIds = allUsers.map(u => u.id)
    const { data: convId, error: convError } = await (supabase as any)
        .rpc('create_broadcast_conversation', {
            p_owner_id: user.id,
            p_name: title,
            p_participant_ids: participantIds,
        })

    if (convError || !convId) {
        return { error: 'Nie udało się utworzyć ogłoszenia: ' + (convError?.message || ''), recipientCount: 0 }
    }

    // Send the message
    const { error: msgError } = await supabase
        .from('messages')
        .insert({
            conversation_id: convId,
            sender_id: user.id,
            content,
            type: 'text'
        })

    if (msgError) {
        return { error: 'Nie udało się wysłać wiadomości: ' + msgError.message, recipientCount: 0 }
    }

    // Send emails if requested (non-blocking)
    if (sendEmail) {
        try {
            const { sendBroadcastEmail } = await import('@/lib/email')
            const emailPromises = allUsers
                .filter(u => u.email)
                .map(u => sendBroadcastEmail(
                    u.email!,
                    myProfile.full_name || 'Administrator',
                    title,
                    content
                ))
            // Fire and forget — don't block the response
            Promise.allSettled(emailPromises).then(results => {
                const failed = results.filter(r => r.status === 'rejected').length
                if (failed > 0) logCompat.error(`${failed} emails failed to send`)
            })
        } catch (emailErr) {
            logCompat.error('Email sending setup failed:', emailErr)
            // Don't fail the whole operation if email fails
        }
    }

    revalidatePath('/messages')
    return { error: null, recipientCount: allUsers.length }
}

/**
 * Counts unread messages from the consultant's assigned guardians
 * (recruiter / delivery_lead from consultant_assignments). Powers the
 * Support Center sidebar badge for consultants.
 *
 * Returns 0 for non-consultants and on any error — badge is non-critical.
 */
export async function getUnreadGuardianMessages(): Promise<number> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    // consultant_assignments is absent from the regenerated types; cast preserves behavior.
    const { data: assignments } = await (supabase as any)
        .from('consultant_assignments')
        .select('assigned_to')
        .eq('consultant_id', user.id)

    const guardianIds = (assignments ?? []).map((a: { assigned_to: string }) => a.assigned_to)
    if (guardianIds.length === 0) return 0

    // My direct conversations
    const { data: myConvs } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id)

    if (!myConvs || myConvs.length === 0) return 0

    let total = 0
    for (const c of myConvs) {
        // Is this a direct conversation with a guardian?
        const { data: target } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', c.conversation_id)
            .neq('user_id', user.id)
            .maybeSingle()

        if (!target || !guardianIds.includes(target.user_id)) continue

        const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', c.conversation_id)
            .eq('sender_id', target.user_id)
            .gt('created_at', c.last_read_at ?? '1970-01-01')

        total += count ?? 0
    }

    return total
}

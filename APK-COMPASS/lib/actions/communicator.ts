
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
        console.error('Error fetching conversations:', error)
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
            .select(`
                user_id,
                role,
                profile:profiles (
                    full_name,
                    avatar_url
                )
            `)
            .eq('conversation_id', conv.id)

        // Filter out self for direct chats
        const otherParticipants = participants?.filter((p: any) => p.user_id !== user.id).map((p: any) => ({
            user_id: p.user_id,
            role: p.role,
            full_name: p.profile?.full_name,
            avatar_url: p.profile?.avatar_url
        })) || []

        populatedConversations.push({
            id: conv.id,
            type: conv.type,
            name: conv.name,
            owner_id: conv.owner_id,
            last_message_at: conv.last_message_at,
            participants: otherParticipants,
            last_message: lastMsg ? {
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
    const { data: targetProfile } = await supabase.from('profiles').select('role').eq('id', targetUserId).single()

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

    // Create new via RPC (SECURITY DEFINER bypasses the INSERT...RETURNING + SELECT policy conflict)
    const { data: newConvId, error: createError } = await supabase
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

    const { data: messages, error } = await supabase
        .from('messages')
        .select(`
            id,
            content,
            created_at,
            sender_id,
            type,
            attachment_url,
            sender:profiles (
                full_name,
                avatar_url
            )
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }) // Older first

    if (error) {
        console.error('Error fetching messages:', error)
        return { data: [], error: error.message }
    }

    return { data: messages, error: null }
}

/**
 * Wysyła wiadomość
 */
export async function sendMessage(
    conversationId: string,
    content: string,
    type: 'text' | 'image' | 'file' = 'text',
    attachmentUrl?: string
): Promise<{ error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Brak autoryzacji' }

    const { error } = await supabase
        .from('messages')
        .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content,
            type,
            attachment_url: attachmentUrl
        })

    if (error) {
        console.error('Send message error:', error)
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

    let queryBuilder = supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, role')
        .neq('id', user.id)
        .not('full_name', 'is', null)
        .order('full_name')
        .limit(50)

    if (myProfile.role === 'consultant') {
        queryBuilder = queryBuilder.neq('role', 'consultant')
    }

    const { data, error } = await queryBuilder

    if (error) {
        console.error('Get all users error:', error)
        return { data: [], error: error.message }
    }

    return { data: data || [], error: null }
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

    let queryBuilder = supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, role')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .neq('id', user.id)
        .order('full_name')
        .limit(20)

    if (myProfile.role === 'consultant') {
        queryBuilder = queryBuilder.neq('role', 'consultant')
    }

    const { data, error } = await queryBuilder

    if (error) {
        console.error('Search users error:', error)
        return { data: [], error: error.message }
    }

    return { data: data || [], error: null }
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

    const { data: convId, error: convError } = await supabase
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
    if (!myProfile || !['admin', 'administrator', 'centrala'].includes(myProfile.role)) {
        return { error: 'Tylko administrator może wysyłać ogłoszenia', recipientCount: 0 }
    }

    // Get all users (except sender)
    const { data: allUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id, email')
        .neq('id', user.id)

    if (usersError || !allUsers) {
        return { error: 'Nie udało się pobrać listy użytkowników', recipientCount: 0 }
    }

    // Create broadcast conversation via RPC
    const participantIds = allUsers.map(u => u.id)
    const { data: convId, error: convError } = await supabase
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
                if (failed > 0) console.error(`${failed} emails failed to send`)
            })
        } catch (emailErr) {
            console.error('Email sending setup failed:', emailErr)
            // Don't fail the whole operation if email fails
        }
    }

    revalidatePath('/messages')
    return { error: null, recipientCount: allUsers.length }
}

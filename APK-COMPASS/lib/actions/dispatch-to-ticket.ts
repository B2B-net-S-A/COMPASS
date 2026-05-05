'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// Phase 9: Dispatch a chat conversation to a support ticket
// ============================================================
//
// Used by /messages "Zamień na ticket" button. Pulls the last N messages
// from the conversation, formats them as a Markdown quote block, picks a
// category based on the other participant's centrala_role, and packages
// everything into a base64-encoded `prefill` query param consumed by
// /support/tickets/new.

const MESSAGES_LIMIT = 5
const MESSAGE_TRUNCATE = 200

export interface DispatchArgs {
    conversationId: string
    messagesCount?: number
}

export interface DispatchPrefill {
    subject: string
    body_md: string
    category_slug: string
    assignee_id: string | null
}

export interface DispatchResult {
    success: boolean
    redirectUrl?: string
    error?: string
}

/**
 * Maps a centrala_role (recruiter / delivery_lead / finance) to the
 * support_categories slug that best matches the topic the guardian handles.
 */
function pickCategorySlug(centralaRole: string | null): string {
    switch (centralaRole) {
        case 'recruiter':
            return 'hr'
        case 'delivery_lead':
            return 'it'
        case 'finance':
            return 'finance'
        default:
            return 'other'
    }
}

export async function dispatchConversationToTicket(args: DispatchArgs): Promise<DispatchResult> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Brak autoryzacji' }

    const limit = args.messagesCount ?? MESSAGES_LIMIT

    // 1. Fetch last N messages from the conversation
    const { data: messages, error: msgErr } = await supabase
        .from('messages')
        .select('content, created_at, sender_id')
        .eq('conversation_id', args.conversationId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (msgErr || !messages || messages.length === 0) {
        return { success: false, error: 'Brak wiadomości w rozmowie do przeniesienia' }
    }

    // 2. Find the other participant (assignee for the new ticket)
    const { data: participants } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', args.conversationId)

    const otherUserId = (participants ?? []).find((p: { user_id: string }) => p.user_id !== user.id)?.user_id ?? null

    let assigneeName = 'opiekunem'
    let centralaRole: string | null = null

    if (otherUserId) {
        const { data: otherProfile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', otherUserId)
            .single()
        if (otherProfile) assigneeName = otherProfile.full_name || otherProfile.email || 'opiekunem'

        const { data: access } = await supabase
            .from('centrala_access_list')
            .select('centrala_role')
            .eq('email', (otherProfile as { email?: string } | null)?.email ?? '')
            .maybeSingle()
        centralaRole = (access as { centrala_role?: string } | null)?.centrala_role ?? null
    }

    // 3. Format body_md (newest first → flip back to chronological for readability)
    const ordered = [...messages].reverse()
    const quoted = ordered
        .map((m) => {
            const content = (m.content as string).trim().slice(0, MESSAGE_TRUNCATE)
            const who = m.sender_id === user.id ? 'Ja' : assigneeName
            return `> **${who}:** ${content.replace(/\n/g, '\n> ')}`
        })
        .join('\n>\n')

    const body_md = `**Z czatu z ${assigneeName}:**\n\n${quoted}\n\n---\n_Opisz tu dodatkowy kontekst lub doprecyzowanie._`
    const firstSubject = (ordered[0]?.content as string)?.split('\n')[0]?.slice(0, 80) ?? 'Sprawa z czatu'

    const prefill: DispatchPrefill = {
        subject: firstSubject,
        body_md,
        category_slug: pickCategorySlug(centralaRole),
        assignee_id: otherUserId,
    }

    // 4. Encode for the URL (Buffer is fine — this is a server action)
    const token = Buffer.from(JSON.stringify(prefill), 'utf-8').toString('base64url')

    return {
        success: true,
        redirectUrl: `/support/tickets/new?prefill=${token}`,
    }
}

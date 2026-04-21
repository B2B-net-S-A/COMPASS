'use server'

import { createClient } from '@/lib/supabase/server'

interface DigestItem {
    type: string
    title: string
    body: string
    created_at: string
    action_url?: string
}

export async function generateDailyDigest(userId: string): Promise<{
    success: boolean
    digest?: DigestItem[]
    error?: string
}> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Nie jesteś zalogowany' }

        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const { data: notifications, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .eq('is_read', false)
            .gte('created_at', yesterday)
            .order('created_at', { ascending: false })

        if (error) return { success: false, error: 'Nie udało się pobrać powiadomień' }

        const digest: DigestItem[] = (notifications || []).map((n: any) => ({
            type: n.type || 'system',
            title: n.title_pl || n.title || 'Powiadomienie',
            body: n.body_pl || n.body || '',
            created_at: n.created_at,
            action_url: n.action_url,
        }))

        return { success: true, digest }
    } catch {
        return { success: false, error: 'Nie udało się wygenerować podsumowania' }
    }
}

export async function getDigestHtml(userId: string): Promise<string> {
    const result = await generateDailyDigest(userId)
    if (!result.success || !result.digest?.length) {
        return ''
    }

    const items = result.digest
        .map(
            (item) => `
        <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0;">
                <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">${escapeHtml(item.title)}</div>
                <div style="color: #666; font-size: 14px;">${escapeHtml(item.body)}</div>
                <div style="color: #999; font-size: 12px; margin-top: 4px;">${new Date(item.created_at).toLocaleString('pl-PL')}</div>
            </td>
        </tr>
    `
        )
        .join('')

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:10000'
    const dateStr = new Date().toLocaleDateString('pl-PL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })

    return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 24px; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; font-size: 20px; margin: 0;">Compass &mdash; Podsumowanie dnia</h1>
                <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 8px 0 0 0;">${dateStr}</p>
            </div>
            <div style="background: white; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
                <table style="width: 100%; border-collapse: collapse;">
                    ${items}
                </table>
                <div style="padding: 16px; text-align: center;">
                    <a href="${siteUrl}/notifications"
                       style="display: inline-block; padding: 10px 24px; background: #7c3aed; color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">
                        Zobacz wszystkie powiadomienia
                    </a>
                </div>
            </div>
        </div>
    `
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

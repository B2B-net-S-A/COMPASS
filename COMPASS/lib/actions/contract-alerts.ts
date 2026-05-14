'use server'

import { createClient } from '@/lib/supabase/server'

export async function checkAndNotifyExpiringContracts() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Nie jesteś zalogowany' }

    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const today = new Date().toISOString().split('T')[0]

    const { data: expiringContracts } = await supabase
        .from('contracts')
        .select('id, consultant_id, client_name, project_name, end_date')
        .in('status', ['active', 'ending_soon'])
        .gte('end_date', today)
        .lte('end_date', sevenDaysFromNow)

    if (!expiringContracts || expiringContracts.length === 0) {
        return { success: true, notified: 0 }
    }

    let notified = 0
    for (const contract of expiringContracts) {
        const daysRemaining = Math.ceil(
            (new Date(contract.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )

        const { count } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', contract.consultant_id)
            .eq('type', 'contract_ending')
            .gte('created_at', today)

        if ((count || 0) > 0) continue

        const endDateFormatted = new Date(contract.end_date).toLocaleDateString('pl-PL')

        await supabase.from('notifications').insert({
            user_id: contract.consultant_id,
            type: 'contract_ending',
            title_pl: 'Kontrakt dobiega końca',
            title_en: 'Contract ending soon',
            body_pl: `Twój kontrakt z ${contract.client_name} (${contract.project_name}) kończy się za ${daysRemaining} dni (${endDateFormatted}).`,
            body_en: `Your contract with ${contract.client_name} (${contract.project_name}) ends in ${daysRemaining} days (${endDateFormatted}).`,
            priority: daysRemaining <= 3 ? 'high' : 'normal',
            action_url: '/documents',
        })
        notified++
    }

    return { success: true, notified }
}

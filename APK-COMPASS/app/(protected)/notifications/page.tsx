import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getRecentNotifications } from '@/lib/actions/notifications'
import { NotificationsPageClient } from '@/components/notifications/NotificationsPageClient'

export default async function NotificationsPage() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const result = await getRecentNotifications(50, false) // All recent, read + unread

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-8 max-w-4xl mx-auto">
            <NotificationsPageClient
                notifications={result.success && result.notifications ? result.notifications : []}
            />
        </div>
    )
}

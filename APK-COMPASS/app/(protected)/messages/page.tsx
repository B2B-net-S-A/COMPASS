import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MessagesPageClient } from '@/components/messages/MessagesPageClient'

export default async function MessagesPage() {
    const supabase = createClient()

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        redirect('/login')
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, email, role')
        .eq('id', user.id)
        .single()

    const role = (profile?.role as 'consultant' | 'admin' | 'centrala' | 'administrator') || 'consultant'
    const isAdmin = role === 'admin' || role === 'centrala' || role === 'administrator'

    return (
        <div className="h-[calc(100vh-5rem)]">
            <MessagesPageClient
                currentUser={{
                    id: profile?.id || user.id,
                    full_name: profile?.full_name || '',
                    avatar_url: profile?.avatar_url || '',
                    email: profile?.email || user.email || '',
                }}
                isAdmin={isAdmin}
            />
        </div>
    )
}

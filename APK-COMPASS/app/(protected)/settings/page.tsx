import { createClient } from '@/lib/supabase/server'
import { LeaderboardOptOut } from './LeaderboardOptOut'

export const dynamic = 'force-dynamic'

export default async function UserSettingsPage() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let optOut = false
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('leaderboard_opt_out')
            .eq('id', user.id)
            .single()
        optOut = (profile as { leaderboard_opt_out?: boolean } | null)?.leaderboard_opt_out ?? false
    }

    return (
        <div className="space-y-6 max-w-2xl p-6">
            <div>
                <h1 className="text-3xl font-bold text-primary">Ustawienia</h1>
                <p className="text-muted-foreground mt-1">Personalizuj wygląd i zachowanie aplikacji.</p>
            </div>
            <LeaderboardOptOut initialOptOut={optOut} />
        </div>
    )
}

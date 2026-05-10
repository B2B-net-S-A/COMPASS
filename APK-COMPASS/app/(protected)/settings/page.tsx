import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell, Clock } from 'lucide-react'
import { LeaderboardOptOut } from './LeaderboardOptOut'
import { PushSubscribeToggle } from '@/components/notifications/PushSubscribeToggle'
import { ClockSummaryEmailToggle } from './ClockSummaryEmailToggle'

export const dynamic = 'force-dynamic'

export default async function UserSettingsPage() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let optOut = false
    let clockSummaryEmail = true
    let isInternalOrAdmin = false
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('leaderboard_opt_out, clock_daily_summary_email, role')
            .eq('id', user.id)
            .single()
        const p = profile as
            | {
                  leaderboard_opt_out?: boolean
                  clock_daily_summary_email?: boolean
                  role?: string
              }
            | null
        optOut = p?.leaderboard_opt_out ?? false
        clockSummaryEmail = p?.clock_daily_summary_email ?? true
        isInternalOrAdmin = p?.role === 'internal' || p?.role === 'admin'
    }

    return (
        <div className="space-y-6 max-w-2xl p-6">
            <div>
                <h1 className="text-3xl font-bold text-primary">Ustawienia</h1>
                <p className="text-muted-foreground mt-1">Personalizuj wygląd i zachowanie aplikacji.</p>
            </div>

            {/* H3.3: Push notifications opt-in */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Bell className="w-4 h-4" />
                        Powiadomienia push
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Otrzymuj powiadomienia o zatwierdzeniu/odrzuceniu wniosków, timesheetów i nowych
                        wiadomościach — nawet gdy aplikacja jest zamknięta.
                    </p>
                    <PushSubscribeToggle />
                </CardContent>
            </Card>

            {/* Phase 17b R11: daily clock summary email opt-out (only for internal/admin) */}
            {isInternalOrAdmin && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Smart Work Clock
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ClockSummaryEmailToggle initialEnabled={clockSummaryEmail} />
                    </CardContent>
                </Card>
            )}

            <LeaderboardOptOut initialOptOut={optOut} />
        </div>
    )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
    Trophy,
    GraduationCap,
    Newspaper,
    LifeBuoy,
    Lightbulb,
    ArrowRight,
    Sparkles,
    Inbox,
    ShieldCheck,
    PlayCircle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { TierBadge } from '@/components/league/TierBadge'
import { ProgressRing } from '@/components/league/ProgressRing'
import { LearningStreakWidget } from '@/components/learning/LearningStreakWidget'
import { TicketStatusBadge } from '@/components/support/TicketStatusBadge'
import { getLoyaltyOverview } from '@/lib/actions/loyalty'
import { getMyEnrollments } from '@/lib/actions/course-learning'
import { listNewsForUser } from '@/lib/actions/news'
import { listTickets } from '@/lib/actions/support-tickets'
import { listMyPitches, listAllPitchesAdmin } from '@/lib/actions/incubator'
import type { TierName } from '@/lib/league-config'
import { PITCH_STATUS_LABEL } from '@/lib/types/incubator'
import { isFeatureComingSoon } from '@/lib/types/permissions'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, learning_streak_current, learning_streak_longest, learning_streak_last_date')
        .eq('id', user.id)
        .single<{
            full_name: string | null
            role: string | null
            learning_streak_current: number | null
            learning_streak_longest: number | null
            learning_streak_last_date: string | null
        }>()

    // Konsultant biurowy (role='internal') nie widzi /home — HR Hub jest jego landingiem.
    // Middleware już to robi na edge, ale dublujemy server-side jako defense-in-depth
    // gdyby middleware został zmodyfikowany lub pominięty.
    if (profile?.role === 'internal') {
        redirect('/internal')
    }
    // Phase 19a: Finanse user landing → invoice review panel, never /home.
    if (profile?.role === 'finanse') {
        redirect('/internal/admin?tab=invoices')
    }

    const isAdmin = (profile?.role as string) === 'admin'
    const learningHidden = isFeatureComingSoon('learning')
    const leagueHidden = isFeatureComingSoon('league')

    const [overviewRes, enrollRes, newsRes, ticketsRes, pitchesRes, adminTicketsRes, adminPitchesRes] = await Promise.all([
        getLoyaltyOverview(),
        getMyEnrollments(),
        listNewsForUser(),
        listTickets({ scope: 'mine', limit: 10 }),
        listMyPitches(),
        isAdmin ? listTickets({ scope: 'all', status: 'open', limit: 5 }) : Promise.resolve({ success: false as const, error: 'skip' }),
        isAdmin ? listAllPitchesAdmin('submitted') : Promise.resolve({ success: false as const, error: 'skip' }),
    ])

    const greetingName = (profile?.full_name as string)?.split(' ')[0] || 'Konsultancie'
    const overview = overviewRes.success ? overviewRes.data : null

    const allEnrollments = enrollRes.success ? enrollRes.data : []
    // A1.1: aktywne kursy sortowane po ostatniej wizycie (najświeższe pierwsze),
    // fallback na datę zapisu. To zasila widget "Wróć do nauki".
    const inProgress = allEnrollments
        .filter((e) => !e.completed_at)
        .sort((a, b) => {
            const aTime = a.last_accessed_at ?? a.enrolled_at
            const bTime = b.last_accessed_at ?? b.enrolled_at
            return bTime.localeCompare(aTime)
        })
        .slice(0, 3)
    // Najświeższy kurs (z wizytą w ostatnich 7 dniach) → wyróżniony hero widget.
    const recentlyActive = inProgress.find((e) => {
        if (!e.last_accessed_at) return false
        const ageMs = Date.now() - new Date(e.last_accessed_at).getTime()
        return ageMs < 7 * 24 * 60 * 60 * 1000
    })

    const recentNews = (newsRes.success ? newsRes.data : []).slice(0, 3)
    const unreadNewsCount = (newsRes.success ? newsRes.data : []).filter((n) => !n.is_read).length

    const myTickets = ticketsRes.success ? ticketsRes.data.items : []
    const openTickets = myTickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed').slice(0, 3)

    const myPitches = pitchesRes.success ? pitchesRes.data : []
    const activePitches = myPitches.filter((p) => p.status !== 'rejected' && p.status !== 'accepted').slice(0, 3)

    const adminOpenTickets = adminTicketsRes.success ? adminTicketsRes.data.items : []
    const adminPendingPitches = adminPitchesRes.success ? adminPitchesRes.data : []

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
            <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/20">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                        {overview && !leagueHidden && (
                            <ProgressRing
                                value={overview.progress_pct}
                                tier={overview.tier as TierName}
                                size={120}
                                strokeWidth={10}
                                centerLabel={
                                    <span className="text-2xl tabular-nums">{overview.confirmed_points.toLocaleString('pl-PL')}</span>
                                }
                                centerSubLabel="pkt"
                            />
                        )}
                        <div className="flex-1 space-y-2">
                            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                                Cześć, <span className="text-primary">{greetingName}</span>
                            </h1>
                            {overview && !leagueHidden && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <TierBadge tier={overview.tier} />
                                    {overview.next_tier && (
                                        <span className="text-sm text-muted-foreground">
                                            do <strong className="text-foreground uppercase tracking-wider">{overview.next_tier}</strong>:
                                            {' '}
                                            <span className="font-mono tabular-nums">{overview.points_to_next.toLocaleString('pl-PL')}</span> pkt
                                        </span>
                                    )}
                                    {overview.pending_points > 0 && (
                                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10 inline-flex items-center gap-1">
                                            <Sparkles className="w-2.5 h-2.5" />
                                            +{overview.pending_points} pkt w trakcie
                                        </Badge>
                                    )}
                                </div>
                            )}
                            {(!leagueHidden || !learningHidden) && (
                                <div className="flex gap-2 pt-1">
                                    {!leagueHidden && (
                                        <Link href="/league">
                                            <Button size="sm" variant="outline" className="gap-1">
                                                <Trophy className="w-4 h-4" /> League
                                            </Button>
                                        </Link>
                                    )}
                                    {!learningHidden && (
                                        <Link href="/learning">
                                            <Button size="sm" variant="outline" className="gap-1">
                                                <GraduationCap className="w-4 h-4" /> Akademia
                                            </Button>
                                        </Link>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {!learningHidden && (recentlyActive || (profile?.learning_streak_longest ?? 0) > 0) && (
                <div className="grid gap-4 md:grid-cols-3">
                    {recentlyActive && (
                        <Link
                            href={`/learning/${recentlyActive.course.slug}/lekcja/${recentlyActive.last_accessed_lesson_id ?? 'first'}`}
                            className="block md:col-span-2"
                        >
                            <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30 hover:border-primary/50 transition-colors h-full">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                        <PlayCircle className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs uppercase tracking-wide text-primary font-medium mb-0.5">Wróć do nauki</p>
                                        <p className="text-sm font-semibold truncate">{recentlyActive.course.title}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="h-1 flex-1 rounded-full bg-white/5 overflow-hidden max-w-[200px]">
                                                <div className="h-full bg-primary" style={{ width: `${recentlyActive.progress_percent}%` }} />
                                            </div>
                                            <span className="text-[10px] text-muted-foreground tabular-nums">{recentlyActive.progress_percent}%</span>
                                        </div>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                                </CardContent>
                            </Card>
                        </Link>
                    )}
                    {(profile?.learning_streak_longest ?? 0) > 0 && (
                        <div className={recentlyActive ? '' : 'md:col-span-3'}>
                            <LearningStreakWidget
                                current={profile?.learning_streak_current ?? 0}
                                longest={profile?.learning_streak_longest ?? 0}
                                lastDate={profile?.learning_streak_last_date ?? null}
                            />
                        </div>
                    )}
                </div>
            )}

            {isAdmin && (adminOpenTickets.length > 0 || adminPendingPitches.length > 0) && (
                <div className="grid gap-4 md:grid-cols-2">
                    {adminOpenTickets.length > 0 && (
                        <Card className="bg-amber-500/5 border-amber-500/20">
                            <CardHeader className="flex flex-row items-center justify-between pb-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Inbox className="w-4 h-4 text-amber-400" />
                                    Otwarte tickety ({adminOpenTickets.length})
                                </CardTitle>
                                <Link href="/admin/support">
                                    <Button variant="link" size="sm" className="gap-1 px-0 text-xs">
                                        Kolejka <ArrowRight className="w-3 h-3" />
                                    </Button>
                                </Link>
                            </CardHeader>
                            <CardContent className="space-y-1.5 pt-0">
                                {adminOpenTickets.slice(0, 3).map((t) => (
                                    <Link key={t.id} href={`/support/tickets/${t.id}`} className="block">
                                        <div className="flex items-center gap-2 p-2 rounded hover:bg-amber-500/10 transition-colors">
                                            <TicketStatusBadge status={t.status} />
                                            <span className="text-xs truncate flex-1">{t.subject}</span>
                                        </div>
                                    </Link>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                    {adminPendingPitches.length > 0 && (
                        <Card className="bg-purple-500/5 border-purple-500/20">
                            <CardHeader className="flex flex-row items-center justify-between pb-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                                    Pitche do oceny ({adminPendingPitches.length})
                                </CardTitle>
                                <Link href="/admin/incubator">
                                    <Button variant="link" size="sm" className="gap-1 px-0 text-xs">
                                        Kolejka <ArrowRight className="w-3 h-3" />
                                    </Button>
                                </Link>
                            </CardHeader>
                            <CardContent className="space-y-1.5 pt-0">
                                {adminPendingPitches.slice(0, 3).map((p) => (
                                    <Link key={p.id} href={`/admin/incubator/${p.id}`} className="block">
                                        <div className="flex items-center gap-2 p-2 rounded hover:bg-purple-500/10 transition-colors">
                                            <Badge variant="outline" className="text-[10px]">{PITCH_STATUS_LABEL[p.status]}</Badge>
                                            <span className="text-xs truncate flex-1">{p.title}</span>
                                        </div>
                                    </Link>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                {!learningHidden && (
                    <Card className="bg-white/5 border-white/10">
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <GraduationCap className="w-5 h-5 text-primary" />
                                W trakcie nauki
                            </CardTitle>
                            <Link href="/learning/moje">
                                <Button variant="link" size="sm" className="gap-1 px-0">
                                    Wszystkie <ArrowRight className="w-3 h-3" />
                                </Button>
                            </Link>
                        </CardHeader>
                        <CardContent className="space-y-2 pt-0">
                            {inProgress.length === 0 ? (
                                <div className="p-3 text-sm text-muted-foreground text-center border border-dashed border-white/10 rounded">
                                    Brak aktywnych szkoleń.{' '}
                                    <Link href="/learning" className="text-primary hover:underline">Przeglądaj katalog</Link>
                                </div>
                            ) : (
                                inProgress.map((e) => (
                                    <Link
                                        key={e.enrollment_id}
                                        href={`/learning/${e.course.slug}/lekcja/${e.last_accessed_lesson_id ?? 'first'}`}
                                        className="block p-3 rounded-md bg-card hover:bg-white/5 border border-white/5 hover:border-primary/30 transition-colors"
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <p className="text-sm font-medium truncate flex-1">{e.course.title}</p>
                                            <span className="text-[10px] text-muted-foreground tabular-nums">{e.progress_percent}%</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                            <div className="h-full bg-primary" style={{ width: `${e.progress_percent}%` }} />
                                        </div>
                                        {e.last_accessed_at && (
                                            <p className="text-[10px] text-muted-foreground mt-1.5">
                                                Ostatnio: {formatDistanceToNow(new Date(e.last_accessed_at), { addSuffix: true, locale: pl })}
                                            </p>
                                        )}
                                    </Link>
                                ))
                            )}
                        </CardContent>
                    </Card>
                )}

                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Newspaper className="w-5 h-5 text-primary" />
                            Aktualności
                            {unreadNewsCount > 0 && (
                                <Badge className="text-[10px] bg-primary text-primary-foreground">
                                    {unreadNewsCount} nowe
                                </Badge>
                            )}
                        </CardTitle>
                        <Link href="/news">
                            <Button variant="link" size="sm" className="gap-1 px-0">
                                Wszystkie <ArrowRight className="w-3 h-3" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                        {recentNews.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground text-center border border-dashed border-white/10 rounded">
                                Brak nowych ogłoszeń.
                            </div>
                        ) : (
                            recentNews.map((n) => (
                                <Link
                                    key={n.id}
                                    href={`/news/${n.slug}`}
                                    className="block p-3 rounded-md bg-card hover:bg-white/5 border border-white/5 hover:border-primary/30 transition-colors"
                                >
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <p className="text-sm font-medium truncate flex-1">{n.title}</p>
                                        {!n.is_read && (
                                            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary bg-primary/10 shrink-0">
                                                Nowy
                                            </Badge>
                                        )}
                                    </div>
                                    {n.excerpt && (
                                        <p className="text-xs text-muted-foreground line-clamp-1">{n.excerpt}</p>
                                    )}
                                </Link>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <LifeBuoy className="w-5 h-5 text-primary" />
                            Moje tickety
                        </CardTitle>
                        <Link href="/support/tickets">
                            <Button variant="link" size="sm" className="gap-1 px-0">
                                Wszystkie <ArrowRight className="w-3 h-3" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                        {openTickets.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground text-center border border-dashed border-white/10 rounded">
                                Brak otwartych ticketów.{' '}
                                <Link href="/support/tickets/new" className="text-primary hover:underline">Zgłoś problem</Link>
                            </div>
                        ) : (
                            openTickets.map((t) => (
                                <Link
                                    key={t.id}
                                    href={`/support/tickets/${t.id}`}
                                    className="block p-3 rounded-md bg-card hover:bg-white/5 border border-white/5 hover:border-primary/30 transition-colors"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <TicketStatusBadge status={t.status} />
                                        <p className="text-sm font-medium truncate flex-1">{t.subject}</p>
                                    </div>
                                </Link>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Lightbulb className="w-5 h-5 text-primary" />
                            Inkubator
                        </CardTitle>
                        <Link href="/incubator">
                            <Button variant="link" size="sm" className="gap-1 px-0">
                                Otwórz <ArrowRight className="w-3 h-3" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                        {activePitches.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground text-center border border-dashed border-white/10 rounded">
                                Brak pitchów.{' '}
                                <Link href="/incubator/submit-idea" className="text-primary hover:underline">Zgłoś pomysł</Link>
                                {' '}lub{' '}
                                <Link href="/incubator/projects" className="text-primary hover:underline">dołącz do projektu</Link>
                            </div>
                        ) : (
                            activePitches.map((p) => (
                                <div
                                    key={p.id}
                                    className="block p-3 rounded-md bg-card border border-white/5"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="outline" className="text-[10px]">{PITCH_STATUS_LABEL[p.status]}</Badge>
                                        <p className="text-sm font-medium truncate flex-1">{p.title}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

import Link from 'next/link'
import { Trophy, ArrowRight, Sparkles, History as HistoryIcon, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TierBadge } from '@/components/league/TierBadge'
import { ProgressRing } from '@/components/league/ProgressRing'
import { PointsHistoryRow, type PointsHistoryEntry } from '@/components/league/PointsHistoryRow'
import { getLoyaltyOverview, getLoyaltyHistoryV2 } from '@/lib/actions/loyalty'
import type { TierName } from '@/lib/league-config'

export const dynamic = 'force-dynamic'

export default async function LeaguePage() {
    const overviewRes = await getLoyaltyOverview()
    const historyRes = await getLoyaltyHistoryV2({ limit: 5 })

    if (!overviewRes.success) {
        return (
            <div className="p-6 md:p-8 max-w-4xl mx-auto">
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-6 text-sm text-red-400">
                        Nie udało się załadować danych League: {overviewRes.error}
                    </CardContent>
                </Card>
            </div>
        )
    }

    const overview = overviewRes.data
    const history = historyRes.success ? historyRes.data.items : []
    const recentEntries: PointsHistoryEntry[] = history.map((h) => ({
        id: h.id,
        points: h.points,
        description: h.description,
        sourceType: h.sourceType,
        status: h.status,
        createdAt: h.createdAt,
    }))

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <Trophy className="w-8 h-8 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">Dynaminds League</h1>
                    </div>
                    <p className="text-muted-foreground mt-1 max-w-xl">
                        7 poziomów. Zbieraj punkty za rozwój, kursy, polecenia. Odblokuj kolejny tier.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/league/leaderboard">
                        <Button variant="outline" size="sm" className="gap-2">
                            <Users className="w-4 h-4" /> Ranking
                        </Button>
                    </Link>
                    <Link href="/league/history">
                        <Button variant="outline" size="sm" className="gap-2">
                            <HistoryIcon className="w-4 h-4" /> Historia
                        </Button>
                    </Link>
                </div>
            </div>

            <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/20">
                <CardContent className="p-6 md:p-8">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <ProgressRing
                            value={overview.progress_pct}
                            tier={overview.tier as TierName}
                            size={180}
                            strokeWidth={14}
                            centerLabel={
                                <span className="text-3xl tabular-nums">{overview.confirmed_points.toLocaleString('pl-PL')}</span>
                            }
                            centerSubLabel="potwierdzone pkt"
                        />

                        <div className="flex-1 space-y-4 text-center md:text-left">
                            <div className="flex flex-col md:flex-row md:items-center gap-2">
                                <TierBadge tier={overview.tier} size="lg" />
                                {overview.next_tier && (
                                    <span className="text-xs text-muted-foreground">
                                        → następny: <strong className="text-foreground uppercase tracking-wider">{overview.next_tier}</strong>
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 max-w-md">
                                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Do następnego poziomu</p>
                                    <p className="text-xl font-bold tabular-nums mt-0.5">
                                        {overview.next_tier
                                            ? `${overview.points_to_next.toLocaleString('pl-PL')} pkt`
                                            : 'Max'}
                                    </p>
                                </div>
                                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                                    <p className="text-[10px] uppercase tracking-wider text-amber-400 inline-flex items-center gap-1">
                                        <Sparkles className="w-2.5 h-2.5" /> W trakcie (pending)
                                    </p>
                                    <p className="text-xl font-bold tabular-nums mt-0.5 text-amber-400">
                                        {overview.pending_points.toLocaleString('pl-PL')} pkt
                                    </p>
                                </div>
                            </div>

                            {overview.member_since && (
                                <p className="text-xs text-muted-foreground">
                                    Członek League od: {new Date(overview.member_since).toLocaleDateString('pl-PL')}
                                </p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <HistoryIcon className="w-4 h-4" /> Ostatnie transakcje
                    </CardTitle>
                    <Link href="/league/history">
                        <Button variant="link" size="sm" className="gap-1 px-0">
                            Zobacz pełną historię <ArrowRight className="w-3 h-3" />
                        </Button>
                    </Link>
                </CardHeader>
                <CardContent className="p-0">
                    {recentEntries.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                            Brak transakcji. Ukończ kurs, otrzymaj rekomendację — zaczniesz zarabiać punkty.
                        </div>
                    ) : (
                        recentEntries.map((tx) => <PointsHistoryRow key={tx.id} tx={tx} />)
                    )}
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-3">
                <Link href="/league/leaderboard">
                    <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors cursor-pointer h-full">
                        <CardContent className="p-5 flex items-center gap-3">
                            <Users className="w-8 h-8 text-primary shrink-0" />
                            <div>
                                <p className="font-semibold">Globalny ranking</p>
                                <p className="text-xs text-muted-foreground">Zobacz top 50 konsultantów</p>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/learning">
                    <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors cursor-pointer h-full">
                        <CardContent className="p-5 flex items-center gap-3">
                            <Badge variant="outline" className="text-xl px-2 py-1 font-mono">+30</Badge>
                            <div>
                                <p className="font-semibold">Ukończ kolejny kurs</p>
                                <p className="text-xs text-muted-foreground">Akademia — kursy firmowe i konsultanckie</p>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    )
}

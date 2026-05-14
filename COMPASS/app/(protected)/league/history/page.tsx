import Link from 'next/link'
import { History as HistoryIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PointsHistoryRow, type PointsHistoryEntry } from '@/components/league/PointsHistoryRow'
import { getLoyaltyHistoryV2, type LoyaltyTxStatus } from '@/lib/actions/loyalty'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams: { status?: string; offset?: string }
}

export default async function HistoryPage({ searchParams }: PageProps) {
    const validStatuses: LoyaltyTxStatus[] = ['pending', 'confirmed', 'reversed']
    const status = validStatuses.includes(searchParams.status as LoyaltyTxStatus) ? (searchParams.status as LoyaltyTxStatus) : undefined
    const offset = Math.max(0, parseInt(searchParams.offset ?? '0', 10) || 0)
    const limit = 25

    const result = await getLoyaltyHistoryV2({ status, offset, limit })
    const items: PointsHistoryEntry[] = result.success
        ? result.data.items.map((h) => ({
            id: h.id,
            points: h.points,
            description: h.description,
            sourceType: h.sourceType,
            status: h.status,
            createdAt: h.createdAt,
        }))
        : []
    const total = result.success ? result.data.total : 0
    const hasMore = result.success ? offset + limit < total : false

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/league" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← B2Bnetwork League
                </Link>
                <div className="flex items-center gap-3">
                    <HistoryIcon className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Historia transakcji</h1>
                </div>
                <p className="text-muted-foreground mt-1">
                    Pełna lista zdobytych, oczekujących i cofniętych punktów.
                </p>
            </div>

            {/* Status filter chips */}
            <div className="flex flex-wrap gap-2 pb-2 border-b border-white/5">
                <Link href="/league/history">
                    <Badge
                        className={`cursor-pointer text-xs h-7 px-3 transition-colors ${
                            !status ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground border border-white/10 hover:border-primary/40'
                        }`}
                    >
                        Wszystkie
                    </Badge>
                </Link>
                <Link href="/league/history?status=confirmed">
                    <Badge
                        className={`cursor-pointer text-xs h-7 px-3 transition-colors ${
                            status === 'confirmed' ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground border border-white/10 hover:border-primary/40'
                        }`}
                    >
                        Zatwierdzone
                    </Badge>
                </Link>
                <Link href="/league/history?status=pending">
                    <Badge
                        className={`cursor-pointer text-xs h-7 px-3 transition-colors ${
                            status === 'pending' ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground border border-white/10 hover:border-primary/40'
                        }`}
                    >
                        Oczekujące
                    </Badge>
                </Link>
                <Link href="/league/history?status=reversed">
                    <Badge
                        className={`cursor-pointer text-xs h-7 px-3 transition-colors ${
                            status === 'reversed' ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground border border-white/10 hover:border-primary/40'
                        }`}
                    >
                        Cofnięte
                    </Badge>
                </Link>
            </div>

            {!result.success && (
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{result.error}</CardContent>
                </Card>
            )}

            {result.success && (
                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                            {total} {total === 1 ? 'transakcja' : 'transakcji'}
                            {status && ` · filtr: ${status}`}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {items.length === 0 ? (
                            <div className="p-6 text-center text-sm text-muted-foreground">Brak transakcji w tym filtrze.</div>
                        ) : (
                            items.map((tx) => <PointsHistoryRow key={tx.id} tx={tx} />)
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Pagination */}
            {result.success && total > limit && (
                <div className="flex justify-between gap-2">
                    {offset > 0 ? (
                        <Link href={`/league/history${status ? `?status=${status}&` : '?'}offset=${Math.max(0, offset - limit)}`}>
                            <Badge className="cursor-pointer h-8 px-3 bg-white/5 border border-white/10 hover:border-primary/40">← Poprzednia</Badge>
                        </Link>
                    ) : <div />}
                    {hasMore && (
                        <Link href={`/league/history${status ? `?status=${status}&` : '?'}offset=${offset + limit}`}>
                            <Badge className="cursor-pointer h-8 px-3 bg-white/5 border border-white/10 hover:border-primary/40">Następna →</Badge>
                        </Link>
                    )}
                </div>
            )}
        </div>
    )
}

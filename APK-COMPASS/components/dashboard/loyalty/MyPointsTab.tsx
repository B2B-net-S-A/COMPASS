'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Trophy, Star, Target, Calendar } from 'lucide-react'
import { getLoyaltyBreakdown } from '@/lib/actions/loyalty'
import type { LoyaltyBreakdownResult } from '@/lib/actions/loyalty'
import { LoyaltyBreakdownChart } from './LoyaltyBreakdownChart'
import { LoyaltyTimeline } from './LoyaltyTimeline'
import { LoyaltyTransactionList } from './LoyaltyTransactionList'
import { LoyaltyCategoryBreakdown } from './LoyaltyCategoryBreakdown'

const TIER_COLORS: Record<string, string> = {
    bronze: 'text-[#CD7F32]',
    silver: 'text-[#C0C0C0]',
    gold: 'text-amber-500',
    platinum: 'text-[#E5B4F3]',
}

interface Props {
    targetUserId?: string
    showUnearned?: boolean
}

export function MyPointsTab({ targetUserId, showUnearned = true }: Props) {
    const [data, setData] = useState<LoyaltyBreakdownResult | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadData()
    }, [targetUserId])

    const loadData = async () => {
        setLoading(true)
        try {
            const result = await getLoyaltyBreakdown(targetUserId, 0, 20)
            setData(result)
        } catch (e) {
            console.error('Error loading breakdown:', e)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!data?.success || !data.summary) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Nie udało się załadować danych. {data?.error}
                </CardContent>
            </Card>
        )
    }

    const { summary, byCategory, timeline, recentTransactions, transactionsPagination } = data
    const tierColor = TIER_COLORS[summary.currentTier] || 'text-amber-500'

    const memberMonths = summary.memberSince
        ? Math.max(1, Math.round((Date.now() - new Date(summary.memberSince).getTime()) / (1000 * 60 * 60 * 24 * 30)))
        : null

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Punkty</CardTitle>
                        <Star className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.totalPoints.toLocaleString('pl-PL')}</div>
                        <p className="text-xs text-muted-foreground">Łączna suma punktów</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tier</CardTitle>
                        <Trophy className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${tierColor}`}>{summary.currentTier.toUpperCase()}</div>
                        <p className="text-xs text-muted-foreground">Aktualny poziom</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Do {summary.nextTier?.toUpperCase() || '—'}</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {summary.nextTier ? `${summary.pointsToNext.toLocaleString('pl-PL')} pkt` : '—'}
                        </div>
                        <div className="h-2 w-full bg-secondary mt-2 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${summary.progressPercent}%` }} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Członek od</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {memberMonths ? `${memberMonths} msc` : '—'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {summary.memberSince
                                ? new Date(summary.memberSince).toLocaleDateString('pl-PL', { month: 'short', year: 'numeric' })
                                : ''}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Breakdown Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Rozbicie punktów wg kategorii</CardTitle>
                    <CardDescription>Skąd pochodzą Twoje punkty</CardDescription>
                </CardHeader>
                <CardContent>
                    <LoyaltyBreakdownChart categories={byCategory || []} totalPoints={summary.totalPoints} />
                </CardContent>
            </Card>

            {/* Category Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Szczegóły kategorii</CardTitle>
                    <CardDescription>Kliknij kategorię aby zobaczyć rozwinięcie{showUnearned ? ' — wyszarzone pozycje to te, które jeszcze możesz zdobyć' : ''}</CardDescription>
                </CardHeader>
                <CardContent>
                    <LoyaltyCategoryBreakdown categories={byCategory || []} showUnearned={showUnearned} />
                </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
                <CardHeader>
                    <CardTitle>Punkty w czasie</CardTitle>
                    <CardDescription>Ostatnie 12 miesięcy</CardDescription>
                </CardHeader>
                <CardContent>
                    <LoyaltyTimeline timeline={timeline || []} />
                </CardContent>
            </Card>

            {/* Transaction History */}
            <Card>
                <CardHeader>
                    <CardTitle>Historia transakcji</CardTitle>
                    <CardDescription>Pełna lista naliczonych punktów</CardDescription>
                </CardHeader>
                <CardContent>
                    <LoyaltyTransactionList
                        initialTransactions={recentTransactions || []}
                        initialPagination={transactionsPagination || { totalCount: 0, hasMore: false, offset: 0, limit: 20 }}
                        targetUserId={targetUserId}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, TrendingUp, Clock } from 'lucide-react'
import { getLoyaltyBreakdown } from '@/lib/actions/loyalty'

interface Transaction {
    id: string
    points: number
    sourceType: string
    label: string
    description: string
    createdAt: string
}

interface Pagination {
    totalCount: number
    hasMore: boolean
    offset: number
    limit: number
}

interface Props {
    initialTransactions: Transaction[]
    initialPagination: Pagination
    targetUserId?: string
}

export function LoyaltyTransactionList({ initialTransactions, initialPagination, targetUserId }: Props) {
    const [transactions, setTransactions] = useState(initialTransactions)
    const [pagination, setPagination] = useState(initialPagination)
    const [loading, setLoading] = useState(false)

    const loadMore = async () => {
        setLoading(true)
        try {
            const nextOffset = pagination.offset + pagination.limit
            const result = await getLoyaltyBreakdown(targetUserId, nextOffset, pagination.limit)
            if (result.success && result.recentTransactions) {
                setTransactions(prev => [...prev, ...result.recentTransactions!])
                setPagination(result.transactionsPagination!)
            }
        } catch (e) {
            console.error('Error loading more transactions:', e)
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (iso: string) => {
        return new Date(iso).toLocaleDateString('pl-PL', {
            day: 'numeric', month: 'short', year: 'numeric',
        })
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                    {pagination.totalCount > 0
                        ? `${transactions.length} z ${pagination.totalCount} transakcji`
                        : 'Brak transakcji'}
                </p>
            </div>

            {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
                        tx.points > 0 ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
                    }`}>
                        <TrendingUp className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                    </div>
                    <Badge variant={tx.points > 0 ? 'default' : 'destructive'} className="font-mono text-xs shrink-0">
                        {tx.points > 0 ? '+' : ''}{tx.points}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 w-24 justify-end">
                        <Clock className="h-3 w-3" />
                        {formatDate(tx.createdAt)}
                    </div>
                </div>
            ))}

            {pagination.hasMore && (
                <div className="pt-3 text-center">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMore}
                        disabled={loading}
                        className="gap-1"
                    >
                        <ChevronDown className="h-4 w-4" />
                        {loading ? 'Ładowanie...' : 'Załaduj więcej'}
                    </Button>
                </div>
            )}

            {transactions.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                    Brak transakcji do wyświetlenia
                </div>
            )}
        </div>
    )
}

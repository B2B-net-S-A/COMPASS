import Link from 'next/link'
import { Trophy, Users, Lock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LeaderboardRow } from '@/components/league/LeaderboardRow'
import { getLeaderboard } from '@/lib/actions/loyalty'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
    const result = await getLeaderboard(50)

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/league" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Dynaminds League
                </Link>
                <div className="flex items-center gap-3">
                    <Users className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Globalny ranking</h1>
                </div>
                <p className="text-muted-foreground mt-1">
                    Top 50 konsultantów według zatwierdzonych punktów. Anonimowi to ci, którzy ukryli profil w ustawieniach.
                </p>
            </div>

            {!result.success && (
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{result.error}</CardContent>
                </Card>
            )}

            {result.success && (
                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-amber-400" /> Wszech czasów
                        </CardTitle>
                        <Link href="/settings">
                            <Button variant="link" size="sm" className="gap-1 px-0 text-xs">
                                <Lock className="w-3 h-3" /> Ukryj mnie
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent className="p-0">
                        {result.data.length === 0 ? (
                            <div className="p-6 text-center text-sm text-muted-foreground">
                                Ranking jest pusty. Bądź pierwszą osobą która zarobi punkty.
                            </div>
                        ) : (
                            result.data.map((entry) => <LeaderboardRow key={entry.user_id} entry={entry} />)
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

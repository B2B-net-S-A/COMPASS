import Link from 'next/link'
import { Lightbulb, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PitchTimeline } from '@/components/incubator/PitchTimeline'
import { listMyPitches } from '@/lib/actions/incubator'
import { PITCH_STATUS_LABEL } from '@/lib/types/incubator'

export const dynamic = 'force-dynamic'

export default async function MyPitchesPage() {
    const result = await listMyPitches()
    const items = result.success ? result.data : []

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/incubator" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Inkubator
                </Link>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <div className="flex items-center gap-3">
                            <Lightbulb className="w-7 h-7 text-primary" />
                            <h1 className="text-3xl font-bold tracking-tight">Moje pitche</h1>
                        </div>
                        <p className="text-muted-foreground mt-1">Twoje zgłoszenia i ich status.</p>
                    </div>
                    <Link href="/incubator/submit-idea">
                        <Button className="gap-2">
                            <Plus className="w-4 h-4" /> Nowy pitch
                        </Button>
                    </Link>
                </div>
            </div>

            {!result.success && (
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{result.error}</CardContent>
                </Card>
            )}

            {result.success && items.length === 0 && (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-12 text-center space-y-3">
                        <Lightbulb className="w-16 h-16 text-muted-foreground mx-auto" />
                        <p className="text-muted-foreground">Brak pitchów. Zgłoś swój pierwszy pomysł.</p>
                        <Link href="/incubator/submit-idea">
                            <Button className="gap-2">
                                <Plus className="w-4 h-4" /> Zgłoś pomysł
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}

            {items.length > 0 && (
                <div className="space-y-3">
                    {items.map((p) => (
                        <Card key={p.id} className="bg-white/5 border-white/10">
                            <CardContent className="p-5 space-y-3">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-lg">{p.title}</h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Złożone: {new Date(p.created_at).toLocaleString('pl-PL')}
                                            {p.investment_ask_pln && ` · Inwestycja: ${p.investment_ask_pln.toLocaleString('pl-PL')} PLN`}
                                            {p.equity_ask && ` · ${p.equity_ask}`}
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                        {PITCH_STATUS_LABEL[p.status]}
                                    </Badge>
                                </div>

                                <PitchTimeline status={p.status} />

                                {p.review_notes_md && (
                                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm">
                                        <p className="text-[10px] uppercase tracking-wider text-amber-400 mb-1">Notatka recenzenta:</p>
                                        <p className="whitespace-pre-wrap text-muted-foreground">{p.review_notes_md}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

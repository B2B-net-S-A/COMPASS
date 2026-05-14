import Link from 'next/link'
import { Sparkles, Briefcase } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listAllPitchesAdmin } from '@/lib/actions/incubator'
import { PITCH_STATUS_LABEL } from '@/lib/types/incubator'
import type { PitchStatus } from '@/lib/types/incubator'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams: { status?: string }
}

export default async function AdminIncubatorPage({ searchParams }: PageProps) {
    const validStatuses: PitchStatus[] = ['draft', 'submitted', 'under_review', 'in_negotiation', 'accepted', 'rejected']
    const status = validStatuses.includes(searchParams.status as PitchStatus) ? (searchParams.status as PitchStatus) : undefined

    const result = await listAllPitchesAdmin(status)

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <Link href="/incubator" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                        ← Inkubator
                    </Link>
                    <div className="flex items-center gap-3">
                        <Sparkles className="w-7 h-7 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">Pitche / Projekty</h1>
                    </div>
                    <p className="text-muted-foreground mt-1">Kolejka zgłoszeń + manager projektów wewnętrznych.</p>
                </div>
                <Link href="/admin/incubator/projects">
                    <Button variant="outline" className="gap-2">
                        <Briefcase className="w-4 h-4" /> Manager projektów
                    </Button>
                </Link>
            </div>

            <div className="flex flex-wrap gap-2 pb-2 border-b border-white/5">
                {[
                    { value: undefined, label: 'Wszystkie' },
                    ...validStatuses.map((s) => ({ value: s, label: PITCH_STATUS_LABEL[s] })),
                ].map((opt) => (
                    <Link key={opt.label} href={opt.value ? `/admin/incubator?status=${opt.value}` : '/admin/incubator'}>
                        <Badge
                            className={`cursor-pointer text-xs h-7 px-3 transition-colors ${
                                status === opt.value ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground border border-white/10 hover:border-primary/40'
                            }`}
                        >
                            {opt.label}
                        </Badge>
                    </Link>
                ))}
            </div>

            {!result.success && (
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{result.error}</CardContent>
                </Card>
            )}

            {result.success && result.data.length === 0 && (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-12 text-center text-muted-foreground">Brak pitchów w tym filtrze.</CardContent>
                </Card>
            )}

            {result.success && result.data.length > 0 && (
                <div className="space-y-2">
                    {result.data.map((p) => (
                        <Link key={p.id} href={`/admin/incubator/${p.id}`} className="block group">
                            <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <Badge variant="outline" className="text-[10px]">{PITCH_STATUS_LABEL[p.status]}</Badge>
                                                {p.investment_ask_pln && (
                                                    <Badge variant="outline" className="text-[10px]">
                                                        {p.investment_ask_pln.toLocaleString('pl-PL')} PLN
                                                    </Badge>
                                                )}
                                            </div>
                                            <h3 className="font-semibold group-hover:text-primary truncate">{p.title}</h3>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Od: <strong>{p.submitter_name ?? '?'}</strong>
                                                {' · '}
                                                {new Date(p.created_at).toLocaleString('pl-PL')}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

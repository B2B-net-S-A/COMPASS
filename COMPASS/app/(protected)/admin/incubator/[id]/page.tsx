import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PitchTimeline } from '@/components/incubator/PitchTimeline'
import { PitchReviewActions } from '@/components/incubator/PitchReviewActions'
import { getPitchById } from '@/lib/actions/incubator'
import { PITCH_STATUS_LABEL } from '@/lib/types/incubator'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function PitchDetailAdminPage(props: PageProps) {
    const params = await props.params;
    const result = await getPitchById(params.id)
    if (!result.success) notFound()
    const p = result.data

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/admin/incubator" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Pitche / Projekty
                </Link>
                <div className="flex items-center gap-3">
                    <Sparkles className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">{p.title}</h1>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="outline" className="text-[10px]">{PITCH_STATUS_LABEL[p.status]}</Badge>
                    {p.investment_ask_pln && (
                        <Badge variant="outline" className="text-[10px]">
                            Inwestycja: {p.investment_ask_pln.toLocaleString('pl-PL')} PLN
                        </Badge>
                    )}
                    {p.equity_ask && <Badge variant="outline" className="text-[10px]">{p.equity_ask}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                    Submitter: <strong>{p.submitter_name ?? '?'}</strong>
                    {' · '}
                    Złożony: {new Date(p.created_at).toLocaleString('pl-PL')}
                    {' · '}
                    NDA zaakceptowane: {new Date(p.nda_accepted_at).toLocaleString('pl-PL')}
                </p>
            </div>

            <PitchTimeline status={p.status} />

            <Card className="bg-card border-border">
                <CardContent className="p-6">
                    <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
                        {p.description_md}
                    </div>
                </CardContent>
            </Card>

            {p.attachment_urls && p.attachment_urls.length > 0 && (
                <Card className="bg-card border-border">
                    <CardContent className="p-5">
                        <h3 className="font-semibold mb-2">Załączniki</h3>
                        <ul className="space-y-1">
                            {p.attachment_urls.map((url, i) => (
                                <li key={i}>
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                                        {url}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            <PitchReviewActions pitchId={p.id} currentStatus={p.status} initialNotes={p.review_notes_md ?? ''} />
        </div>
    )
}

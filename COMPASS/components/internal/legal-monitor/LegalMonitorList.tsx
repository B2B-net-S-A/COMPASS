'use client'

// Phase 48 — skrzynka monitoringu prawnego: filtry + lista + panel szczegółu z przeglądem.
//
// Domyślny widok to skrzynka (`new`), bo moduł ma jedno zadanie: przejrzeć to, co
// dopisał pipeline. Wpisy są już posortowane po stronie serwera (pilność → data),
// więc tutaj tylko filtrujemy — bez ponownego sortowania, żeby kolejność
// czerwonych na górze nie rozjechała się między widokami.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Check, CircleAlert, ExternalLink, Loader2, Scale, Search, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { logCompat } from '@/lib/logger'
import { reviewLegalMonitorItem } from '@/lib/actions/legal-monitor'
import {
    LEGAL_MONITOR_SOURCES,
    LEGAL_MONITOR_TOPICS,
    LEGAL_SEVERITY_META,
    LEGAL_SOURCE_LABELS_PL,
    LEGAL_SOURCE_SHORT_PL,
    LEGAL_STATUS_META,
    LEGAL_TOPIC_LABELS_PL,
    REVIEW_NOTE_MAX,
    type LegalMonitorItemRow,
    type LegalMonitorReviewStatus,
    type LegalMonitorSeverity,
    type LegalMonitorSource,
    type LegalMonitorStatus,
    type LegalMonitorTopic,
} from '@/lib/types/legal-monitor'

type StatusFilter = 'all' | LegalMonitorStatus
type SeverityFilter = 'all' | LegalMonitorSeverity
type TopicFilter = 'all' | LegalMonitorTopic
type SourceFilter = 'all' | LegalMonitorSource

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
    { value: 'new', label: 'Do przeglądu' },
    { value: 'action_required', label: 'Do reakcji' },
    { value: 'reviewed', label: 'Przejrzane' },
    { value: 'dismissed', label: 'Odrzucone' },
    { value: 'all', label: 'Wszystkie' },
]

const REVIEW_ACTIONS: ReadonlyArray<{
    status: LegalMonitorReviewStatus
    label: string
    variant: 'default' | 'destructive' | 'outline'
}> = [
    { status: 'reviewed', label: 'Przejrzane', variant: 'default' },
    { status: 'action_required', label: 'Do reakcji', variant: 'destructive' },
    { status: 'dismissed', label: 'Odrzuć', variant: 'outline' },
]

function fmtDate(iso: string): string {
    return format(parseISO(iso), 'd LLL yyyy', { locale: pl })
}

function fmtDateTime(iso: string): string {
    return format(parseISO(iso), "d LLL yyyy, HH:mm", { locale: pl })
}

export function LegalMonitorList({ items }: { items: LegalMonitorItemRow[] }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()

    const [status, setStatus] = useState<StatusFilter>('new')
    const [severity, setSeverity] = useState<SeverityFilter>('all')
    const [topic, setTopic] = useState<TopicFilter>('all')
    const [source, setSource] = useState<SourceFilter>('all')
    const [search, setSearch] = useState('')

    const [detail, setDetail] = useState<LegalMonitorItemRow | null>(null)
    const [note, setNote] = useState('')

    const statusCounts = useMemo(() => {
        const c: Record<StatusFilter, number> = {
            all: items.length,
            new: 0,
            reviewed: 0,
            action_required: 0,
            dismissed: 0,
        }
        for (const i of items) c[i.status] += 1
        return c
    }, [items])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return items.filter((i) => {
            if (status !== 'all' && i.status !== status) return false
            if (severity !== 'all' && i.severity !== severity) return false
            if (topic !== 'all' && i.topic !== topic) return false
            if (source !== 'all' && i.source !== source) return false
            if (!q) return true
            const hay =
                `${i.title} ${i.summary} ${i.why_it_matters} ${i.reference ?? ''} ${i.source_label}`.toLowerCase()
            return hay.includes(q)
        })
    }, [items, status, severity, topic, source, search])

    const openDetail = (item: LegalMonitorItemRow) => {
        setDetail(item)
        setNote(item.review_note ?? '')
    }

    const submitReview = (next: LegalMonitorReviewStatus) => {
        if (!detail) return
        const target = detail
        if (note.length > REVIEW_NOTE_MAX) {
            toast.error(`Notatka jest za długa (max ${REVIEW_NOTE_MAX} znaków).`)
            return
        }
        startTransition(async () => {
            try {
                await reviewLegalMonitorItem({ id: target.id, status: next, note })
                toastSuccess(`Oznaczono jako „${LEGAL_STATUS_META[next].label}”`)
                setDetail(null)
                router.refresh()
            } catch (e: unknown) {
                logCompat.error('[legal-monitor] review failed', e)
                toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać przeglądu.')
            }
        })
    }

    const resetFilters = () => {
        setSeverity('all')
        setTopic('all')
        setSource('all')
        setSearch('')
    }
    const extraFiltersOn = severity !== 'all' || topic !== 'all' || source !== 'all' || search !== ''

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <Scale className="h-4 w-4" />
                    Wpisy monitoringu
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                    Pozycje wybrane przez monitoring jako istotne dla modelu firmy. Kolejność:
                    najpierw te, które mogą wymagać decyzji, potem najświeższe.
                </p>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {STATUS_FILTERS.map((f) => (
                        <Button
                            key={f.value}
                            variant={status === f.value ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setStatus(f.value)}
                        >
                            {f.label}
                            <span className="ml-1.5 opacity-70">{statusCounts[f.value]}</span>
                        </Button>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={severity}
                        onValueChange={(v) => setSeverity(v as SeverityFilter)}
                    >
                        <SelectTrigger className="w-[190px]" aria-label="Filtr pilności">
                            <SelectValue placeholder="Pilność" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Każda pilność</SelectItem>
                            <SelectItem value="red">🔴 Może wymagać decyzji</SelectItem>
                            <SelectItem value="yellow">🟡 Do omówienia</SelectItem>
                            <SelectItem value="green">🟢 Kontekst</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={topic} onValueChange={(v) => setTopic(v as TopicFilter)}>
                        <SelectTrigger className="w-[210px]" aria-label="Filtr tematu">
                            <SelectValue placeholder="Temat" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Każdy temat</SelectItem>
                            {LEGAL_MONITOR_TOPICS.map((t) => (
                                <SelectItem key={t} value={t}>
                                    {LEGAL_TOPIC_LABELS_PL[t]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={source} onValueChange={(v) => setSource(v as SourceFilter)}>
                        <SelectTrigger className="w-[230px]" aria-label="Filtr źródła">
                            <SelectValue placeholder="Źródło" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Każde źródło</SelectItem>
                            {LEGAL_MONITOR_SOURCES.map((s) => (
                                <SelectItem key={s} value={s}>
                                    {LEGAL_SOURCE_LABELS_PL[s]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Szukaj w tytule, treści lub sygnaturze…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>

                    {extraFiltersOn && (
                        <Button variant="ghost" size="sm" onClick={resetFilters}>
                            <X className="h-4 w-4 mr-1" />
                            Wyczyść filtry
                        </Button>
                    )}
                </div>

                {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        {status === 'new' && !extraFiltersOn
                            ? 'Skrzynka pusta — wszystko przejrzane.'
                            : 'Brak wpisów dla wybranych filtrów.'}
                    </p>
                ) : (
                    <ul className="divide-y divide-border/40 rounded-md border border-border/40">
                        {filtered.map((item) => {
                            const sev = LEGAL_SEVERITY_META[item.severity]
                            const st = LEGAL_STATUS_META[item.status]
                            return (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => openDetail(item)}
                                        className="w-full text-left px-3 py-3 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <span aria-hidden className="mt-0.5 text-sm leading-none">
                                                {sev.dot}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-medium">
                                                        {item.title}
                                                    </span>
                                                    {item.status !== 'new' && (
                                                        <Badge
                                                            variant="outline"
                                                            className={st.className}
                                                        >
                                                            {st.label}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                    {item.summary}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
                                                    <span title={LEGAL_SOURCE_LABELS_PL[item.source]}>
                                                        {LEGAL_SOURCE_SHORT_PL[item.source]}
                                                        {item.source_label &&
                                                            ` · ${item.source_label}`}
                                                    </span>
                                                    <span>{LEGAL_TOPIC_LABELS_PL[item.topic]}</span>
                                                    {item.reference && (
                                                        <span className="font-mono">
                                                            {item.reference}
                                                        </span>
                                                    )}
                                                    {item.published_at && (
                                                        <span>{fmtDate(item.published_at)}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </CardContent>

            <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
                <DialogContent className="max-w-2xl">
                    {detail && (
                        <>
                            <DialogHeader>
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <Badge
                                        variant="outline"
                                        className={LEGAL_SEVERITY_META[detail.severity].className}
                                    >
                                        {LEGAL_SEVERITY_META[detail.severity].dot}{' '}
                                        {LEGAL_SEVERITY_META[detail.severity].label}
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className={LEGAL_STATUS_META[detail.status].className}
                                    >
                                        {LEGAL_STATUS_META[detail.status].label}
                                    </Badge>
                                </div>
                                <DialogTitle className="text-base leading-snug">
                                    {detail.title}
                                </DialogTitle>
                                <DialogDescription>
                                    {LEGAL_SOURCE_LABELS_PL[detail.source]}
                                    {detail.source_label && ` — ${detail.source_label}`}
                                    {detail.reference && ` · ${detail.reference}`}
                                    {detail.published_at && ` · ${fmtDate(detail.published_at)}`}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1">
                                <section>
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Co orzeczono / wydano
                                    </h3>
                                    <p className="text-sm mt-1 whitespace-pre-wrap">
                                        {detail.summary}
                                    </p>
                                </section>

                                <section className="rounded-md border border-border/60 bg-muted/40 p-3">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                                        <CircleAlert className="h-3.5 w-3.5" />
                                        Co to znaczy dla firmy
                                    </h3>
                                    <p className="text-sm mt-1 whitespace-pre-wrap">
                                        {detail.why_it_matters}
                                    </p>
                                </section>

                                {detail.url && (
                                    <a
                                        href={detail.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                        Otwórz źródło
                                    </a>
                                )}

                                {detail.reviewed_at && (
                                    <p className="text-xs text-muted-foreground">
                                        Ostatnio przejrzane {fmtDateTime(detail.reviewed_at)}
                                        {detail.reviewed_by_name && ` — ${detail.reviewed_by_name}`}
                                    </p>
                                )}

                                <div className="space-y-1.5">
                                    <Label htmlFor="legal-monitor-note">Notatka (opcjonalna)</Label>
                                    <Textarea
                                        id="legal-monitor-note"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        maxLength={REVIEW_NOTE_MAX}
                                        rows={3}
                                        placeholder="Np. ustalenia ze spotkania finansowo-prawnego albo co dalej robimy."
                                    />
                                </div>
                            </div>

                            <DialogFooter className="gap-2 sm:gap-2">
                                {REVIEW_ACTIONS.map((a) => (
                                    <Button
                                        key={a.status}
                                        variant={a.variant}
                                        disabled={pending}
                                        onClick={() => submitReview(a.status)}
                                    >
                                        {pending ? (
                                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                        ) : (
                                            <Check className="h-4 w-4 mr-1.5" />
                                        )}
                                        {a.label}
                                    </Button>
                                ))}
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    )
}

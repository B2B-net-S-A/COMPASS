'use client'

// Phase 48/50/51 — skrzynka monitoringu prawnego: filtry + lista + panel szczegółu.
//
// Domyślny widok to skrzynka (`new`), bo moduł ma jedno zadanie: przejrzeć to, co
// dopisał pipeline.
//
// Phase 50: zaznaczanie hurtem (start modułu to backfill kilkunastu pozycji —
// klikanie ich po jednej sprawia, że nikt tego nie zrobi), termin reakcji
// z osobą odpowiedzialną, eksport CSV i tryb read-only dla posiadaczy grantu
// `can_view_legal_monitor` (zarząd widzi, ale nie przegląda).
//
// Phase 51: wpisy grupowane po dniu OTRZYMANIA (jak w skrzynce mailowej —
// „Dzisiaj”, „Wczoraj”, dalej pełne daty), bo codzienne pytanie brzmi „co
// przyszło nowego”, a płaska lista tego nie pokazywała. Czerwone są pierwsze
// w swoim dniu, nie globalnie — po „wszystkie czerwone naraz” jest filtr
// pilności. Grupowanie i kolejność w grupie liczy `lib/legal-monitor/grouping.ts`.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
    CalendarClock,
    Check,
    CircleAlert,
    Download,
    ExternalLink,
    Loader2,
    Pin,
    PinOff,
    Scale,
    Search,
    UserCheck,
    X,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { logCompat } from '@/lib/logger'
import {
    exportLegalMonitorCsv,
    reviewLegalMonitorItem,
    reviewLegalMonitorItems,
    setLegalMonitorFollowUp,
    setLegalMonitorPin,
} from '@/lib/actions/legal-monitor'
import { safeExternalUrl } from '@/lib/legal-monitor/safe-url'
import { groupItemsByReceivedDay, partitionPinned } from '@/lib/legal-monitor/grouping'
import {
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
    return format(parseISO(iso), 'd LLL yyyy, HH:mm', { locale: pl })
}

function itemCountPl(n: number): string {
    const last = n % 10
    const lastTwo = n % 100
    if (n === 1) return '1 wpis'
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} wpisy`
    return `${n} wpisów`
}

interface Props {
    items: LegalMonitorItemRow[]
    /** false dla posiadaczy grantu can_view_legal_monitor — widzą, ale nie przeglądają. */
    canReview: boolean
    /** Osoby, którym można przypisać reakcję (puste w trybie read-only). */
    assignees: Array<{ id: string; name: string }>
    /**
     * Dzisiejsza data (YYYY-MM-DD, czas warszawski) liczona na serwerze — inaczej
     * „Dzisiaj” wyliczone w przeglądarce rozjechałoby się z HTML-em z serwera
     * przy renderze tuż przed północą (hydration mismatch).
     */
    todayISO: string
}

export function LegalMonitorList({ items, canReview, assignees, todayISO }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()

    const [status, setStatus] = useState<StatusFilter>('new')
    const [severity, setSeverity] = useState<SeverityFilter>('all')
    const [topic, setTopic] = useState<TopicFilter>('all')
    const [source, setSource] = useState<SourceFilter>('all')
    const [search, setSearch] = useState('')

    const [detail, setDetail] = useState<LegalMonitorItemRow | null>(null)
    const [note, setNote] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [assignedTo, setAssignedTo] = useState('')
    const safeUrl = useMemo(() => safeExternalUrl(detail?.url), [detail])

    const [selected, setSelected] = useState<Set<string>>(new Set())

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

    // Filtry pokazują tylko to, co realnie występuje — pusta kategoria w rozwijanej
    // liście (np. temat bez ani jednego wpisu) wygląda jak zepsuty filtr.
    const presentTopics = useMemo(
        () => Array.from(new Set(items.map((i) => i.topic))).sort(),
        [items],
    )
    const presentSources = useMemo(
        () => Array.from(new Set(items.map((i) => i.source))).sort(),
        [items],
    )

    const { pinned, rest } = useMemo(() => {
        const q = search.trim().toLowerCase()
        // Filtry inne niż status. Sekcja przypiętych używa TYLKO ich — pinezka ma
        // znaczyć „zawsze pod ręką”, a nie „dopóki nie oznaczę jako przejrzane”,
        // więc przełączanie zakładek statusu nie może jej chować.
        const matchesFacets = (i: LegalMonitorItemRow) => {
            if (severity !== 'all' && i.severity !== severity) return false
            if (topic !== 'all' && i.topic !== topic) return false
            if (source !== 'all' && i.source !== source) return false
            if (!q) return true
            const hay =
                `${i.title} ${i.summary} ${i.why_it_matters} ${i.reference ?? ''} ${i.source_label}`.toLowerCase()
            return hay.includes(q)
        }
        const byFacets = items.filter(matchesFacets)
        const split = partitionPinned(byFacets)
        return {
            pinned: split.pinned,
            rest:
                status === 'all'
                    ? split.rest
                    : split.rest.filter((i) => i.status === status),
        }
    }, [items, status, severity, topic, source, search])

    const groups = useMemo(() => groupItemsByReceivedDay(rest, todayISO), [rest, todayISO])

    const visibleIds = useMemo(
        () => [...pinned, ...rest].map((i) => i.id),
        [pinned, rest],
    )
    const selectedVisible = visibleIds.filter((id) => selected.has(id))
    const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length

    const toggleAllVisible = () => {
        const next = new Set(selected)
        if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id))
        else visibleIds.forEach((id) => next.add(id))
        setSelected(next)
    }

    const toggleOne = (id: string) => {
        const next = new Set(selected)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelected(next)
    }

    const openDetail = (item: LegalMonitorItemRow) => {
        setDetail(item)
        setNote(item.review_note ?? '')
        setDueDate(item.due_date ?? '')
        setAssignedTo(item.assigned_to ?? '')
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
                // Termin ma sens tylko przy „do reakcji"; przy pozostałych statusach
                // czyścimy go, żeby cron nie przypominał o zamkniętej sprawie.
                const wantsFollowUp = next === 'action_required'
                const nextDue = wantsFollowUp ? dueDate.trim() || null : null
                const nextAssignee = wantsFollowUp ? assignedTo || null : null
                if (nextDue !== (target.due_date ?? null) || nextAssignee !== (target.assigned_to ?? null)) {
                    await setLegalMonitorFollowUp({
                        id: target.id,
                        dueDate: nextDue,
                        assignedTo: nextAssignee,
                    })
                }
                toastSuccess(`Oznaczono jako „${LEGAL_STATUS_META[next].label}”`)
                setDetail(null)
                setSelected((prev) => {
                    const n = new Set(prev)
                    n.delete(target.id)
                    return n
                })
                router.refresh()
            } catch (e: unknown) {
                logCompat.error('[legal-monitor] review failed', e)
                toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać przeglądu.')
            }
        })
    }

    const submitBulk = (next: LegalMonitorReviewStatus) => {
        const ids = selectedVisible
        if (ids.length === 0) return
        startTransition(async () => {
            try {
                const changed = await reviewLegalMonitorItems(ids, next)
                toastSuccess(`Oznaczono ${changed} wpisów jako „${LEGAL_STATUS_META[next].label}”`)
                setSelected(new Set())
                router.refresh()
            } catch (e: unknown) {
                logCompat.error('[legal-monitor] bulk review failed', e)
                toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać przeglądu.')
            }
        })
    }

    const setPin = (item: LegalMonitorItemRow, next: boolean) => {
        startTransition(async () => {
            try {
                await setLegalMonitorPin({ id: item.id, pinned: next })
                toastSuccess(next ? 'Przypięto na górę skrzynki' : 'Zdjęto pinezkę')
                // Panel szczegółu trzyma własną kopię wpisu, więc bez tego przycisk
                // w dialogu pokazywałby stary stan aż do zamknięcia. Autora zerujemy
                // razem ze stemplem (spójna kopia); przy przypięciu nazwisko dociąga
                // dopiero refresh — wolę puste niż cudze.
                setDetail((prev) =>
                    prev && prev.id === item.id
                        ? {
                              ...prev,
                              pinned_at: next ? new Date().toISOString() : null,
                              pinned_by: null,
                              pinned_by_name: null,
                          }
                        : prev,
                )
                router.refresh()
            } catch (e: unknown) {
                logCompat.error('[legal-monitor] pin toggle failed', e)
                toast.error(e instanceof Error ? e.message : 'Nie udało się zmienić pinezki.')
            }
        })
    }

    const downloadCsv = () => {
        startTransition(async () => {
            try {
                const csv = await exportLegalMonitorCsv(selectedVisible)
                // BOM dokłada już server action — drugi rozsypałby pierwszą komórkę.
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `monitoring-prawny-${new Date().toISOString().slice(0, 10)}.csv`
                a.click()
                URL.revokeObjectURL(url)
            } catch (e: unknown) {
                logCompat.error('[legal-monitor] csv export failed', e)
                toast.error(e instanceof Error ? e.message : 'Nie udało się wyeksportować CSV.')
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
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Scale className="h-4 w-4" />
                            Wpisy monitoringu
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            Pozycje wybrane przez monitoring jako istotne dla modelu firmy,
                            pogrupowane po dniu, w którym trafiły do skrzynki — najnowsze na
                            górze. W obrębie dnia pierwsze są te, które mogą wymagać decyzji.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={downloadCsv} disabled={pending}>
                        <Download className="h-4 w-4 mr-1.5" />
                        {selectedVisible.length > 0 ? `CSV (${selectedVisible.length})` : 'CSV'}
                    </Button>
                </div>
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
                    <Select value={severity} onValueChange={(v) => setSeverity(v as SeverityFilter)}>
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
                            {presentTopics.map((t) => (
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
                            {presentSources.map((s) => (
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

                {canReview && visibleIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-muted/30 px-3 py-2">
                        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                                checked={allVisibleSelected}
                                onCheckedChange={toggleAllVisible}
                                aria-label="Zaznacz wszystkie widoczne"
                            />
                            Zaznacz widoczne ({visibleIds.length})
                        </label>
                        {selectedVisible.length > 0 && (
                            <>
                                <span className="text-sm text-muted-foreground">
                                    zaznaczonych: {selectedVisible.length}
                                </span>
                                <div className="flex flex-wrap gap-1.5 ml-auto">
                                    {REVIEW_ACTIONS.map((a) => (
                                        <Button
                                            key={a.status}
                                            variant={a.variant}
                                            size="sm"
                                            disabled={pending}
                                            onClick={() => submitBulk(a.status)}
                                        >
                                            {a.label}
                                        </Button>
                                    ))}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSelected(new Set())}
                                    >
                                        Odznacz
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {visibleIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        {status === 'new' && !extraFiltersOn
                            ? 'Skrzynka pusta — wszystko przejrzane.'
                            : 'Brak wpisów dla wybranych filtrów.'}
                    </p>
                ) : (
                    <div className="space-y-4">
                        {pinned.length > 0 && (
                            <section>
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1 pb-1.5">
                                    <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
                                        <Pin className="h-3.5 w-3.5" />
                                        Przypięte
                                    </h3>
                                    <span className="text-xs text-muted-foreground">
                                        · {itemCountPl(pinned.length)}
                                    </span>
                                    {status !== 'all' && (
                                        <span className="text-xs text-muted-foreground">
                                            · niezależnie od filtra statusu
                                        </span>
                                    )}
                                </div>
                                <ul className="divide-y divide-border/40 rounded-md border border-primary/30 bg-primary/[0.03]">
                                    {pinned.map((item) => (
                                        <LegalMonitorRow
                                            key={item.id}
                                            item={item}
                                            canReview={canReview}
                                            checked={selected.has(item.id)}
                                            onToggle={() => toggleOne(item.id)}
                                            onOpen={() => openDetail(item)}
                                            onTogglePin={() => setPin(item, false)}
                                            /* Poza swoim dniem wpis traci kontekst „kiedy
                                               przyszedł" — w tej sekcji dokładamy go wprost. */
                                            showReceivedDate
                                        />
                                    ))}
                                </ul>
                            </section>
                        )}
                        {groups.map((group) => (
                            <section key={group.dayISO}>
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1 pb-1.5">
                                    <h3 className="text-sm font-semibold">{group.label}</h3>
                                    {group.exactLabel && (
                                        <span className="text-xs text-muted-foreground">
                                            {group.exactLabel}
                                        </span>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                        · {itemCountPl(group.items.length)}
                                    </span>
                                </div>
                                <ul className="divide-y divide-border/40 rounded-md border border-border/40">
                                    {group.items.map((item) => (
                                        <LegalMonitorRow
                                            key={item.id}
                                            item={item}
                                            canReview={canReview}
                                            checked={selected.has(item.id)}
                                            onToggle={() => toggleOne(item.id)}
                                            onOpen={() => openDetail(item)}
                                            onTogglePin={() => setPin(item, true)}
                                        />
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
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
                                    <p className="text-sm mt-1 whitespace-pre-wrap">{detail.summary}</p>
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

                                {/* URL pochodzi z pipeline'u (treść z zewnątrz) — renderujemy
                                    link dopiero po sprawdzeniu schematu, patrz safe-url.ts. */}
                                {safeUrl ? (
                                    <a
                                        href={safeUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                        Otwórz źródło
                                    </a>
                                ) : (
                                    detail.url && (
                                        // Mówimy wprost, że link był, ale go nie otworzymy —
                                        // ciche zniknięcie wyglądałoby jak wpis bez źródła.
                                        <p className="text-xs text-muted-foreground">
                                            Link do źródła ma nieprawidłowy adres i nie został
                                            udostępniony.
                                        </p>
                                    )
                                )}

                                {detail.reviewed_at && (
                                    <p className="text-xs text-muted-foreground">
                                        Ostatnio przejrzane {fmtDateTime(detail.reviewed_at)}
                                        {detail.reviewed_by_name && ` — ${detail.reviewed_by_name}`}
                                    </p>
                                )}

                                {detail.pinned_at && (
                                    <p className="text-xs text-primary inline-flex items-center gap-1.5">
                                        <Pin className="h-3.5 w-3.5" />
                                        Przypięte na górę skrzynki{' '}
                                        {fmtDateTime(detail.pinned_at)}
                                        {detail.pinned_by_name && ` — ${detail.pinned_by_name}`}
                                    </p>
                                )}

                                {canReview ? (
                                    <>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="legal-monitor-due">
                                                    Termin reakcji (opcjonalny)
                                                </Label>
                                                <Input
                                                    id="legal-monitor-due"
                                                    type="date"
                                                    value={dueDate}
                                                    onChange={(e) => setDueDate(e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="legal-monitor-assignee">
                                                    Kto reaguje
                                                </Label>
                                                <Select
                                                    value={assignedTo || 'none'}
                                                    onValueChange={(v) =>
                                                        setAssignedTo(v === 'none' ? '' : v)
                                                    }
                                                >
                                                    <SelectTrigger id="legal-monitor-assignee">
                                                        <SelectValue placeholder="Nikt konkretny" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">
                                                            Nikt konkretny
                                                        </SelectItem>
                                                        {assignees.map((a) => (
                                                            <SelectItem key={a.id} value={a.id}>
                                                                {a.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground -mt-2">
                                            Termin działa przy statusie „Do reakcji” — po nim
                                            przypomnienie idzie codziennie do wskazanej osoby.
                                        </p>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="legal-monitor-note">
                                                Notatka (opcjonalna)
                                            </Label>
                                            <Textarea
                                                id="legal-monitor-note"
                                                value={note}
                                                onChange={(e) => setNote(e.target.value)}
                                                maxLength={REVIEW_NOTE_MAX}
                                                rows={3}
                                                placeholder="Np. ustalenia ze spotkania finansowo-prawnego albo co dalej robimy."
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {detail.due_date && (
                                            <p className="text-xs text-muted-foreground">
                                                Termin reakcji: {fmtDate(detail.due_date)}
                                                {detail.assigned_to_name &&
                                                    ` — ${detail.assigned_to_name}`}
                                            </p>
                                        )}
                                        {detail.review_note && (
                                            <p className="text-sm italic text-muted-foreground">
                                                „{detail.review_note}”
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>

                            {canReview && (
                                <DialogFooter className="gap-2 sm:gap-2">
                                    {/* Naturalny moment na pinezkę to „przeczytałem
                                        i chcę to mieć pod ręką", czyli tutaj. */}
                                    <Button
                                        variant="outline"
                                        disabled={pending}
                                        onClick={() => setPin(detail, !detail.pinned_at)}
                                        className="sm:mr-auto"
                                    >
                                        {detail.pinned_at ? (
                                            <PinOff className="h-4 w-4 mr-1.5" />
                                        ) : (
                                            <Pin className="h-4 w-4 mr-1.5" />
                                        )}
                                        {detail.pinned_at ? 'Zdejmij pinezkę' : 'Przypnij'}
                                    </Button>
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
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    )
}

interface RowProps {
    item: LegalMonitorItemRow
    canReview: boolean
    checked: boolean
    onToggle: () => void
    onOpen: () => void
    onTogglePin: () => void
    /** Sekcja przypiętych stoi poza dniami, więc tam data otrzymania idzie w wiersz. */
    showReceivedDate?: boolean
}

function LegalMonitorRow({
    item,
    canReview,
    checked,
    onToggle,
    onOpen,
    onTogglePin,
    showReceivedDate = false,
}: RowProps) {
    const sev = LEGAL_SEVERITY_META[item.severity]
    const st = LEGAL_STATUS_META[item.status]
    const isPinned = Boolean(item.pinned_at)
    return (
        <li className="flex items-start gap-2 px-3 hover:bg-muted/50 transition-colors">
            {canReview && (
                <span className="pt-4">
                    <Checkbox
                        checked={checked}
                        onCheckedChange={onToggle}
                        aria-label={`Zaznacz: ${item.title}`}
                    />
                </span>
            )}
            <button
                type="button"
                onClick={onOpen}
                className="flex-1 min-w-0 text-left py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
                <div className="flex items-start gap-2.5">
                    <span aria-hidden className="mt-0.5 text-sm leading-none">
                        {sev.dot}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{item.title}</span>
                            {item.status !== 'new' && (
                                <Badge variant="outline" className={st.className}>
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
                                {item.source_label && ` · ${item.source_label}`}
                            </span>
                            <span>{LEGAL_TOPIC_LABELS_PL[item.topic]}</span>
                            {item.reference && <span className="font-mono">{item.reference}</span>}
                            {/* Nagłówek grupy mówi, kiedy wpis do nas trafił, więc data
                                w wierszu musi się jawnie przedstawić jako data dokumentu —
                                inaczej dwie różne daty wyglądają jak sprzeczność. */}
                            {item.published_at && (
                                <span title="Data dokumentu źródłowego">
                                    dokument {fmtDate(item.published_at)}
                                </span>
                            )}
                            {showReceivedDate && (
                                <span title="Kiedy wpis trafił do skrzynki">
                                    otrzymano {fmtDate(item.created_at)}
                                </span>
                            )}
                            {item.due_date && (
                                <span className="inline-flex items-center gap-1 text-warning">
                                    <CalendarClock className="h-3 w-3" />
                                    termin {fmtDate(item.due_date)}
                                </span>
                            )}
                            {item.assigned_to_name && (
                                <span className="inline-flex items-center gap-1">
                                    <UserCheck className="h-3 w-3" />
                                    {item.assigned_to_name}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </button>
            {/* Pinezka poza dużym przyciskiem wiersza — zagnieżdżony <button> jest
                niedozwolony w HTML i psuje klawiaturę. */}
            {canReview ? (
                <button
                    type="button"
                    onClick={onTogglePin}
                    title={isPinned ? 'Zdejmij pinezkę' : 'Przypnij na górę skrzynki'}
                    aria-label={
                        isPinned ? `Zdejmij pinezkę: ${item.title}` : `Przypnij: ${item.title}`
                    }
                    aria-pressed={isPinned}
                    className="mt-3 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[pinned=true]:text-primary"
                    data-pinned={isPinned}
                >
                    {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
            ) : (
                // Czytający bez prawa przeglądu nie przypina, ale musi rozumieć,
                // czemu wpis wisi na górze.
                isPinned && (
                    <span className="mt-3 shrink-0 p-1.5 text-primary" title="Przypięty">
                        <Pin className="h-4 w-4" />
                    </span>
                )
            )}
        </li>
    )
}

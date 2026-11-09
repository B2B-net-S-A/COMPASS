'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { getReadinessEvidenceUrl, recordReadinessResult, updateLaunchCondition } from '@/lib/actions/academy-readiness'
import { READINESS_STAGE_LABELS, type ReadinessStage } from '@/lib/academy/readiness-scenarios'
import { LAUNCH_STATUS_LABELS, READINESS_EFFECTIVE_LABELS, summarizeReadiness, type LaunchCondition, type ReadinessEffective, type ReadinessOverview, type ReadinessScenarioState } from '@/lib/academy/readiness'
import { useAcademyAction } from './useAcademyAction'

const STATUS_TONE: Record<ReadinessEffective, string> = {
    passed: 'bg-success/10 text-success', failed: 'bg-destructive/10 text-destructive', stale: 'bg-warning/10 text-warning', expired: 'bg-warning/10 text-warning', not_run: 'bg-muted text-muted-foreground',
}
const date = (value: string) => new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(value))
const MIME_EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' }
const inputClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'

function EvidenceLink({ path }: { path: string | null }) {
    const [pending, run] = useAcademyAction()
    const [failed, setFailed] = useState(false)
    if (!path) return <span className="text-sm text-muted-foreground">Brak</span>
    return <button type="button" disabled={pending} className="text-sm font-medium text-primary underline" onClick={() => run(async () => {
        const result = await getReadinessEvidenceUrl(path)
        if (result.success) window.open(result.data, '_blank', 'noopener')
        else setFailed(true)
    })}>{failed ? 'Błąd, ponów' : 'Zrzut'}</button>
}

function ManualResultForm({ scenario, currentSha }: { scenario: ReadinessScenarioState; currentSha: string }) {
    const router = useRouter()
    const [pending, run] = useAcademyAction()
    const [error, setError] = useState<string | null>(null)

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const file = data.get('evidence')
        setError(null)
        run(async () => {
            let evidencePath: string | null = null
            if (file instanceof File && file.size > 0) {
                const extension = MIME_EXTENSION[file.type]
                if (!extension) { setError('Dołącz plik PNG, JPG albo PDF.'); return }
                if (file.size > 10 * 1024 * 1024) { setError('Plik może mieć najwyżej 10 MB.'); return }
                evidencePath = `${scenario.id}/${crypto.randomUUID()}.${extension}`
                const { error: uploadError } = await createClient().storage.from('academy-readiness-evidence').upload(evidencePath, file, { contentType: file.type })
                if (uploadError) { setError('Nie udało się wgrać zrzutu. Sprawdź, czy migracja B0.5 jest zastosowana.'); return }
            }
            const result = await recordReadinessResult({ scenarioId: scenario.id, sha: String(data.get('sha')), status: data.get('status') === 'passed' ? 'passed' : 'failed', evidencePath, note: String(data.get('note') ?? '') || null })
            if (!result.success) { setError(result.error); return }
            router.refresh()
        })
    }

    return <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium text-primary">Wpisz wynik</summary>
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1"><span className="font-medium">Wynik</span><select name="status" className={inputClass} defaultValue="passed"><option value="passed">Przechodzi</option><option value="failed">Nie przechodzi</option></select></label>
            <label className="space-y-1"><span className="font-medium">SHA wdrożenia</span><input name="sha" required pattern="[0-9a-f]{7,40}" defaultValue={currentSha} className={inputClass} /></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">Zrzut (PNG, JPG, PDF; wymagany przy „Przechodzi”)</span><input name="evidence" type="file" accept="image/png,image/jpeg,application/pdf" className={inputClass} /></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">Uwagi</span><textarea name="note" rows={2} maxLength={2000} className={inputClass} /></label>
            {error && <p role="alert" className="text-destructive sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={pending}>{pending ? 'Zapisywanie…' : 'Zapisz wynik'}</Button></div>
        </form>
    </details>
}

function ConditionForm({ condition }: { condition: LaunchCondition }) {
    const router = useRouter()
    const [pending, run] = useAcademyAction()
    const [error, setError] = useState<string | null>(null)
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setError(null)
        run(async () => {
            const result = await updateLaunchCondition({ item: condition.item, status: String(data.get('status')), evidence: String(data.get('evidence') ?? '') || null })
            if (!result.success) { setError(result.error); return }
            router.refresh()
        })
    }
    return <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-primary">Zmień stan</summary>
        <form onSubmit={submit} className="mt-2 space-y-2">
            <select name="status" aria-label="Stan warunku" defaultValue={condition.status} className={inputClass}>{Object.entries(LAUNCH_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <textarea name="evidence" aria-label="Dowód" rows={2} maxLength={2000} defaultValue={condition.evidence ?? ''} className={inputClass} />
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <Button type="submit" size="sm" variant="outline" disabled={pending}>Zapisz</Button>
        </form>
    </details>
}

function ScenarioRow({ scenario, currentSha }: { scenario: ReadinessScenarioState; currentSha: string }) {
    return <tr className="align-top">
        <td className="py-3 pr-4"><p className="text-sm font-medium"><span className="tabular-nums text-muted-foreground">{scenario.id}</span> {scenario.title}</p><p className="mt-1 text-xs text-muted-foreground">{scenario.kind === 'automat' ? 'Automat' : 'Ręczny ze zrzutem'}{scenario.latest?.note ? ` · ${scenario.latest.note}` : ''}</p>{scenario.kind === 'ręczny' && <ManualResultForm scenario={scenario} currentSha={currentSha} />}</td>
        <td className="py-3 pr-4"><span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_TONE[scenario.effective])}>{READINESS_EFFECTIVE_LABELS[scenario.effective]}</span></td>
        <td className="whitespace-nowrap py-3 pr-4 text-sm text-muted-foreground">{scenario.latest ? <>{date(scenario.latest.run_at)}<br /><code className="text-xs">{scenario.latest.sha.slice(0, 7)}</code>{scenario.latest.valid_until && <><br /><span className="text-xs">do {date(scenario.latest.valid_until)}</span></>}</> : 'Nie było'}</td>
        <td className="py-3"><EvidenceLink path={scenario.latest?.evidence_path ?? null} /></td>
    </tr>
}

export function AcademyReadinessPanel({ data }: { data: ReadinessOverview }) {
    const summary = summarizeReadiness(data.scenarios)
    const stages = Object.keys(READINESS_STAGE_LABELS) as ReadinessStage[]
    const ready = data.conditions.filter(condition => condition.status === 'ready').length
    const enabled = data.switches.filter(item => item.enabled).length
    const openLock = data.scenarios.find(scenario => scenario.id === 'G06')?.effective === 'passed'
    const missing = (summary.total - summary.passed) + (data.conditions.length - ready)
    const percent = Math.round(summary.passed / summary.total * 100)
    const modeLabel = data.rolloutMode === 'pilot' ? 'Pilot: tylko konta z listy' : data.rolloutMode === 'open' ? 'Otwarta' : 'Zamknięty: nic nie wychodzi na zewnątrz'

    return <div className="space-y-6">
        {data.migrationPending && <p role="status" className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">Panel czeka na migrację bazy <code>20261109130300_academy_readiness.sql</code>. Do tego czasu wyników nie da się zapisać.</p>}
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-6">
                <div><p className="text-sm text-muted-foreground">Tryb</p><h2 className="text-xl font-semibold">{modeLabel}</h2></div>
                <div className="min-w-64 flex-1 space-y-2">
                    <p className="text-sm font-medium">Scenariusze: {summary.passed} z {summary.total} przechodzi</p>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${percent}% scenariuszy przechodzi`}><div className="h-full bg-success" style={{ width: `${percent}%` }} /></div>
                    <p className="text-sm text-muted-foreground">{summary.failed} nie przechodzi, {summary.notRun} nie uruchomiono, {summary.outdated} do powtórzenia</p>
                </div>
            </div>
            <p className="border-t border-border pt-4 text-sm"><span className="font-semibold">Otwarcie jest niedostępne.</span> Brakuje {missing} pozycji: scenariuszy z ważnym wynikiem i warunków z sekcji Przed otwarciem. Otwarcie to osobna migracja właściciela, nie przycisk w panelu.</p>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className="rounded-2xl border border-border bg-card p-5">
                <h2 className="mb-4 text-lg font-semibold">Scenariusze akceptacyjne</h2>
                <div className="overflow-x-auto"><table className="w-full border-collapse text-left">
                    <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 pr-4 font-medium">Scenariusz</th><th className="py-2 pr-4 font-medium">Status</th><th className="py-2 pr-4 font-medium">Ostatni przebieg</th><th className="py-2 font-medium">Zrzut</th></tr></thead>
                    {stages.map(stage => {
                        const rows = data.scenarios.filter(scenario => scenario.stage === stage)
                        return <tbody key={stage} className="divide-y divide-border border-b border-border">
                            <tr><td colSpan={4} className="bg-muted/40 px-2 py-2 text-sm font-semibold">{READINESS_STAGE_LABELS[stage]} <span className="font-normal text-muted-foreground">· {rows.filter(row => row.effective === 'passed').length} z {rows.length}</span></td></tr>
                            {rows.map(scenario => <ScenarioRow key={scenario.id} scenario={scenario} currentSha={data.currentSha} />)}
                        </tbody>
                    })}
                </table></div>
            </section>

            <div className="space-y-6">
                <section className="rounded-2xl border border-border bg-card p-5">
                    <h2 className="text-lg font-semibold">Przełączniki</h2>
                    <p className="mb-3 text-sm text-muted-foreground">{enabled} z {data.switches.length} włączonych. Zmiana tylko w vault Coolify.</p>
                    <ul className="divide-y divide-border">{data.switches.map(item => <li key={item.name} className="flex items-center justify-between gap-3 py-2"><span className="text-sm">{item.label}</span><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', item.enabled ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground')}>{item.enabled ? 'Wł.' : 'Wył.'}</span></li>)}</ul>
                    <p className="mt-3 border-t border-border pt-3 text-sm">Blokada trybu open: <span className="font-semibold">{openLock ? 'potwierdzona scenariuszem G06' : 'niepotwierdzona, czeka na G06'}</span></p>
                </section>
                <section className="rounded-2xl border border-border bg-card p-5">
                    <h2 className="mb-3 text-lg font-semibold">Kolejka wiadomości</h2>
                    {data.outbox ? <dl className="grid grid-cols-3 gap-3 text-center">{[['Wstrzymane', data.outbox.held], ['Wygasłe', data.outbox.expired], ['Testowo wysłane', data.outbox.sentTest]].map(([label, value]) => <div key={String(label)}><dd className="text-2xl font-semibold tabular-nums">{value}</dd><dt className="text-xs text-muted-foreground">{label}</dt></div>)}</dl> : <p className="text-sm text-muted-foreground">Licznik pojawi się po zastosowaniu migracji kolejki (B0.2).</p>}
                </section>
                <section className="rounded-2xl border border-border bg-card p-5">
                    <h2 className="text-lg font-semibold">Przed otwarciem</h2>
                    <p className="mb-3 text-sm text-muted-foreground">{ready} z {data.conditions.length} gotowych</p>
                    <ul className="divide-y divide-border">{data.conditions.map(condition => <li key={condition.item} className="space-y-1 py-3"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium">{condition.item}</span><span className="whitespace-nowrap text-xs text-muted-foreground">{LAUNCH_STATUS_LABELS[condition.status]}</span></div>{condition.evidence && <p className="text-xs text-muted-foreground">{condition.evidence}</p>}<p className="text-xs text-muted-foreground">Właściciel: {condition.owner}</p><ConditionForm condition={condition} /></li>)}</ul>
                </section>
            </div>
        </div>
    </div>
}

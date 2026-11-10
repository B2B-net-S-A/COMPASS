import type { ReactNode } from 'react'
import Link from 'next/link'
import { BellRing, CalendarClock, ClipboardList, Megaphone } from 'lucide-react'
import { STAGE_LABELS, firstStart, type BoardRun, type BoardStage, type TodoItem } from '@/lib/academy/organize-board'
import { cn } from '@/lib/utils'
import { RecordingReview } from './RecordingReview'

export interface OrganizerBoardProps {
    todo: TodoItem[]
    runs: Array<BoardRun & { stage: BoardStage }>
    form: ReactNode
    preview?: boolean
}

const STAGE_TONES: Record<BoardStage, string> = {
    draft: 'bg-muted text-muted-foreground',
    open: 'bg-primary/10 text-primary',
    waiting_recording: 'bg-warning/10 text-warning',
    to_approve: 'bg-destructive/10 text-destructive',
    in_library: 'bg-success/10 text-success',
    cancelled: 'bg-muted text-muted-foreground line-through',
}

function when(run: BoardRun): string {
    const start = firstStart(run)
    if (start === null) return 'Bez terminu'
    const session = run.sessions.find(item => Date.parse(item.startsAt) === start)
    return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' }).format(new Date(session?.startsAt ?? start))
}

function TodoRow({ item, preview }: { item: TodoItem; preview: boolean }) {
    if (item.kind === 'approve_recording' && item.material) {
        return <RecordingReview runId={item.runId} assetId={item.material.id} filename={item.material.filename} courseTitle={item.courseTitle} ownUpload={item.ownUpload === true} requestedAt={item.requestedAt ?? null} preview={preview} />
    }
    const Icon = item.kind === 'publish_announcement' ? Megaphone : BellRing
    const text = item.kind === 'publish_announcement' ? 'Zapowiedź czeka na publikację' : 'Szkolenie się odbyło, a nagrania nie ma. Przypomnij trenerowi.'
    return <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3"><Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="font-medium">{item.courseTitle}</p><p className="text-sm text-muted-foreground">{text}</p></div></div>
        <Link href={`/learning/edycje/${item.runId}`} className="shrink-0 text-sm font-medium text-primary hover:underline">Otwórz edycję</Link>
    </div>
}

/** „Organizuję”: kolejka „Do zrobienia”, formularz nowego szkolenia i lista szkoleń ze stanem. */
export function OrganizerBoard({ todo, runs, form, preview = false }: OrganizerBoardProps) {
    return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0 space-y-6">
            <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardList aria-hidden="true" className="size-5 text-primary" />Do zrobienia{todo.length > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{todo.length}</span>}</h2>
                {todo.length
                    ? <ul className="divide-y divide-border rounded-xl border border-border bg-card">{todo.map(item => <li key={`${item.kind}:${item.material?.id ?? item.runId}`} className="px-4 py-3.5">{<TodoRow item={item} preview={preview} />}</li>)}</ul>
                    : <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Nic nie czeka. Nowe nagrania pojawią się tu po wgraniu przez trenera.</p>}
            </section>

            <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock aria-hidden="true" className="size-5 text-primary" />Szkolenia</h2>
                {runs.length
                    ? <ul className="divide-y divide-border rounded-xl border border-border bg-card">{runs.map(run => <li key={run.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 grow"><Link href={`/learning/edycje/${run.id}`} className="font-medium hover:underline">{run.courseTitle}</Link><p className="text-sm text-muted-foreground">{when(run)} · zapisanych: {run.confirmedCount}</p></div>
                        <span className={cn('w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', STAGE_TONES[run.stage])}>{STAGE_LABELS[run.stage]}</span>
                    </li>)}</ul>
                    : <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Nie ma jeszcze szkoleń. Zacznij od formularza obok.</p>}
            </section>
        </div>
        <aside className="lg:sticky lg:top-5">{form}</aside>
    </div>
}

import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarDays, Check, ChevronLeft, ClipboardCheck, MessageSquare, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trainerSteps, type TrainerMaterialRow } from '@/lib/academy/teaching-steps'
import { cn } from '@/lib/utils'
import { PublishPanel } from './PublishPanel'
import { TrainerMaterials } from './TrainerMaterials'

export interface TrainerStepsProps {
    course: { id: string; slug: string; title: string; description: string | null; published: boolean }
    run: { id: string; title: string; sessions: Array<{ startsAt: string; timeZone: string }> } | null
    materials: TrainerMaterialRow[]
    counts: { quizQuestions: number; learnerQuestions: number }
    publication: { available: boolean; requestedAt: string | null; viewers: Record<string, number> }
    preview?: boolean
}

function Step({ number, title, done, children }: { number: number; title: string; done: boolean; children: ReactNode }) {
    return <section className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[40px_minmax(0,1fr)] sm:gap-4 sm:p-5">
        <span aria-hidden="true" className={cn('flex size-9 items-center justify-center rounded-full text-sm font-semibold', done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary')}>{done ? <Check className="size-4" /> : number}</span>
        <div className="min-w-0 space-y-3"><h2 className="text-lg font-semibold">{number}. {title}{done && <span className="sr-only"> (gotowe)</span>}</h2>{children}</div>
    </section>
}

function formatSession(startsAt: string, timeZone: string): string {
    return new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(startsAt))
}

/** „Prowadzę” w 3 krokach: opis i termin, nagranie i slajdy, test opcjonalnie; potem „Wyślij do publikacji”. */
export function TrainerSteps({ course, run, materials, counts, publication, preview = false }: TrainerStepsProps) {
    const steps = trainerSteps({ description: course.description, sessionCount: run?.sessions.length ?? 0, materials, quizQuestions: counts.quizQuestions })
    const base = `/learning/tworze/${course.id}`
    return <div className="mx-auto max-w-3xl space-y-5">
        <Link href="/learning/tworze" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ChevronLeft aria-hidden="true" className="size-4" />Prowadzę</Link>
        <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1>
            <p className="text-sm text-muted-foreground">Trzy kroki do nagrania w bibliotece. Akceptację robi organizator.</p>
        </header>

        <Step number={1} title="Opis i termin" done={steps.description && steps.date}>
            {course.description ? <p className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{course.description}</p> : <p className="text-sm text-muted-foreground">Dodaj krótki opis: czego uczestnik się dowie.</p>}
            {run?.sessions.length
                ? <ul className="space-y-1">{run.sessions.map(session => <li key={session.startsAt} className="flex items-center gap-2 text-sm"><CalendarDays aria-hidden="true" className="size-4 text-primary" /><span className="first-letter:uppercase">{formatSession(session.startsAt, session.timeZone)}</span></li>)}</ul>
                : <p className="text-sm text-muted-foreground">Termin ustala organizator przy zapowiedzi szkolenia.</p>}
            <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><Link href={`${base}/edit`}><Pencil aria-hidden="true" />Zmień opis</Link></Button>
                {run && <Button asChild variant="outline" size="sm"><Link href={`${base}/edycje`}><CalendarDays aria-hidden="true" />Zmień termin</Link></Button>}
            </div>
        </Step>

        <Step number={2} title="Nagranie i slajdy" done={steps.recording}>
            {run
                ? <TrainerMaterials courseId={course.id} runId={run.id} initial={materials} viewers={publication.viewers} preview={preview} />
                : <p className="text-sm text-muted-foreground">Nagranie wgrasz, gdy organizator zapowie termin szkolenia.</p>}
        </Step>

        <Step number={3} title="Test (opcjonalnie)" done={steps.test}>
            <p className="text-sm text-muted-foreground">{steps.test ? `Test ma ${counts.quizQuestions} ${counts.quizQuestions === 1 ? 'pytanie' : 'pytań'}. Zdany test daje certyfikat; bez testu obejrzenie albo obecność daje zaświadczenie udziału.` : 'Bez testu obejrzenie albo obecność daje zaświadczenie udziału. Test z certyfikatem włączasz, dodając pytania.'}</p>
            <Button asChild variant="outline" size="sm"><Link href={`${base}/test`}><ClipboardCheck aria-hidden="true" />{steps.test ? 'Edytuj pytania' : 'Włącz test'}</Link></Button>
        </Step>

        {run && <PublishPanel courseId={course.id} runId={run.id} canSend={steps.canSend} requestedAt={publication.requestedAt} available={publication.available} />}

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-sm">
            <span className="text-muted-foreground">W bibliotece: {steps.inLibrary} {steps.inLibrary === 1 ? 'plik' : 'plików'}</span>
            <Link href={`${base}/pytania`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><MessageSquare aria-hidden="true" className="size-4" />Pytania uczestników ({counts.learnerQuestions})</Link>
            {course.published && <Link href={`/learning/${encodeURIComponent(course.slug)}`} className="font-medium text-primary hover:underline">Zobacz stronę szkolenia</Link>}
            <Link href={`${base}/edit`} className="text-muted-foreground hover:text-primary">Więcej: pełny edytor</Link>
        </footer>
    </div>
}

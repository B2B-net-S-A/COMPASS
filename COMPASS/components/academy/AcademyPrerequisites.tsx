import Link from 'next/link'
import { CheckCircle2, LockKeyhole } from 'lucide-react'
import type { AcademyPrerequisiteStatus } from '@/lib/actions/academy-discovery'

export function AcademyPrerequisites({ status, error, enrolled = false }: { status?: AcademyPrerequisiteStatus; error?: string; enrolled?: boolean }) {
    if (error) return <div role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">Nie udało się sprawdzić wymagań wstępnych. Odśwież stronę, aby spróbować ponownie.</div>
    if (!status?.items.length) return null
    return <section className="space-y-3 rounded-xl border border-border bg-card p-5" aria-label="Wymagania wstępne">
        <h2 className="font-semibold">Wymagania wstępne</h2>
        <p className="text-sm text-muted-foreground">{enrolled ? 'Wymagania obowiązujące przy zapisie na tę wersję szkolenia.' : status.allCompleted ? 'Spełniasz wszystkie wymagania. Możesz zapisać się na szkolenie.' : 'Przed zapisem ukończ poniższe szkolenia.'}</p>
        <ul className="space-y-2">{status.items.map((item) => <li key={item.id} className="flex items-start gap-3 text-sm">{item.completed ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" /> : <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}<div>{item.slug ? <Link href={`/learning/${item.slug}`} className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.title}</Link> : <span className="font-medium">{item.title}</span>}<p className="text-xs text-muted-foreground">{item.completed ? 'Ukończone' : item.available ? 'Do ukończenia' : 'Szkolenie jest obecnie niedostępne. Skontaktuj się z administratorem.'}</p></div></li>)}</ul>
    </section>
}

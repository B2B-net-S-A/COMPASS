import Link from 'next/link'
import { LEARNER_INFO_IS_DRAFT, LEARNER_INFO_ROWS, LEARNER_INFO_TITLE } from '@/lib/academy/learner-info'

/** Skrócona klauzula na ekranie przepustki. Pełne dokumenty są pod linkami. */
export function LearnerInfoNotice() {
    return (
        <section aria-labelledby="learner-info-title" className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <h2 id="learner-info-title" className="text-sm font-semibold">{LEARNER_INFO_TITLE}</h2>
            {LEARNER_INFO_IS_DRAFT && <p className="text-xs text-muted-foreground">Treść robocza, przed opinią prawną.</p>}
            <dl className="space-y-1 text-sm">
                {LEARNER_INFO_ROWS.map(row => (
                    <div key={row.label} className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">{row.label}:</dt>
                        <dd className="text-muted-foreground">{row.value}</dd>
                    </div>
                ))}
            </dl>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link href="/privacy-policy" className="text-primary underline underline-offset-2">Pełna informacja o danych</Link>
                <Link href="/terms" className="text-primary underline underline-offset-2">Regulamin Akademii</Link>
            </div>
        </section>
    )
}

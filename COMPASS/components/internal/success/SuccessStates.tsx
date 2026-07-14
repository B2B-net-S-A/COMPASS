import Link from 'next/link'
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SuccessEmptyState({
    title,
    description,
    action,
}: {
    title: string
    description: string
    action?: { label: string; href: string }
}) {
    return (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/15 px-6 py-10 text-center">
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">{description}</p>
            {action ? (
                <Button asChild size="sm" className="mt-5">
                    <Link href={action.href}>{action.label}</Link>
                </Button>
            ) : null}
        </div>
    )
}

export function SuccessErrorState({
    title = 'Nie udało się wczytać danych',
    description = 'Odśwież stronę. Jeśli problem wróci, sprawdź połączenie z bazą danych.',
}: {
    title?: string
    description?: string
}) {
    return (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
            <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
                <div className="min-w-0">
                    <h2 className="font-semibold text-foreground">{title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                    <Button asChild variant="outline" size="sm" className="mt-4">
                        <Link href="/internal/people/success">
                            <RefreshCw className="h-4 w-4" aria-hidden />
                            Wróć do pulpitu
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}

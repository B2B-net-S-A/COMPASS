'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { listAcademyIntegrationIssuesPage, retryAcademyIntegration } from '@/lib/actions/academy-sessions'
import type { AcademyIntegrationIssuesPageDTO } from '@/lib/types/academy-sessions'
import { sessionDate, sessionTime } from './session-format'

const JOB_LABEL = { sync_meeting: 'Aktualizacja spotkania', cancel_meeting: 'Odwołanie spotkania', sync_attendance: 'Pobranie obecności' }
const JOB_STATUS = { pending: 'W kolejce', processing: 'W trakcie', retry: 'Oczekuje na ponowienie', done: 'Zakończono', failed: 'Wymaga interwencji', skipped: 'Pominięto' }
const INVITATION_ERROR: Record<string, string> = {
    invitation_address_ambiguous: 'Osoba ma kilka potwierdzonych adresów Teams. Administrator musi wybrać jeden adres zaproszeń w powiązaniach kont.',
    invitation_address_missing: 'Uczestnik lub prowadzący nie ma potwierdzonego adresu do zaproszeń Teams. Administrator powinien zweryfikować konto.',
    invitation_address_shared: 'Ten sam adres zaproszeń należy do kilku kont Compass. Administrator musi poprawić powiązania przed ponowieniem.',
}

export function AcademyIntegrationIssuesQueue({ initialPage }: { initialPage: AcademyIntegrationIssuesPageDTO }) {
    const router = useRouter()
    const [issues, setIssues] = useState(initialPage.items)
    const [nextCursor, setNextCursor] = useState(initialPage.nextCursor)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [busyJob, setBusyJob] = useState<string | null>(null)
    const [isRetrying, runRetry] = useAcademyAction()
    const [isLoadingMore, runLoadMore] = useAcademyAction()
    const version = useRef(0)

    // A retry/refresh starts a new view; discard responses from the old cursor.
    useEffect(() => {
        version.current += 1
        setIssues(initialPage.items)
        setNextCursor(initialPage.nextCursor)
        setError(null)
    }, [initialPage])

    function retry(jobId: string) {
        setError(null)
        setMessage(null)
        setBusyJob(jobId)
        runRetry(async () => {
            try {
                const result = await retryAcademyIntegration(jobId)
                if (!result.success) { setError(result.error); return }
                setMessage('Zlecono ponowienie operacji. Lista została odświeżona.')
                router.refresh()
            } catch { setError('Nie udało się ponowić operacji.') }
            finally { setBusyJob(null) }
        })
    }

    function loadMore() {
        if (!nextCursor || isLoadingMore) return
        const cursor = nextCursor
        const requestedVersion = version.current
        setError(null)
        runLoadMore(async () => {
            try {
                const result = await listAcademyIntegrationIssuesPage({ after: cursor })
                if (requestedVersion !== version.current) return
                if (!result.success) { setError(result.error); return }
                setIssues(previous => {
                    const known = new Set(previous.map(issue => issue.id))
                    return [...previous, ...result.data.items.filter(issue => !known.has(issue.id))]
                })
                setNextCursor(result.data.nextCursor)
            } catch {
                if (requestedVersion === version.current) setError('Nie udało się pobrać starszych operacji.')
            }
        })
    }

    return <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1"><h2 className="text-lg font-semibold">Stan synchronizacji</h2><p className="text-sm text-muted-foreground">Oczekujące i nieudane operacje spotkań oraz obecności. Pokazano {issues.length}{nextCursor ? ' i dostępne są starsze wpisy' : ' wszystkich widocznych wpisów'}.</p></div>
            <Button variant="outline" onClick={() => router.refresh()}><RefreshCw aria-hidden="true" />Odśwież</Button>
        </div>
        {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="rounded-xl border border-success/20 bg-success/5 p-4 text-sm text-success">{message}</p>}
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {issues.length === 0 ? <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><CheckCircle2 aria-hidden="true" className="size-5 text-success" />Brak operacji wymagających uwagi.</p> : issues.map(job => <div key={job.id} className="space-y-3 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="space-y-1">
                    <Link href={`/learning/edycje/${job.runId}`} className="font-medium text-primary underline-offset-4 hover:underline">{job.sessionTitle}</Link>
                    <p className="text-sm text-muted-foreground">{JOB_LABEL[job.kind]} · {JOB_STATUS[job.status]}</p>
                    <p className="text-xs text-muted-foreground">Próby: {job.attempts} · aktualizacja {sessionDate(job.updatedAt)} {sessionTime(job.updatedAt)}</p>
                    {(job.status === 'retry' || job.status === 'pending') && <p className="text-xs text-muted-foreground">Następna próba: {sessionDate(job.nextAttemptAt)} {sessionTime(job.nextAttemptAt)} (Europe/Warsaw)</p>}
                </div>{(job.status === 'failed' || job.status === 'retry') && <Button variant="outline" size="sm" disabled={isRetrying || isLoadingMore || busyJob !== null} onClick={() => retry(job.id)}>{busyJob === job.id ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}Ponów</Button>}</div>
                {job.lastError && <p className="break-words rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{INVITATION_ERROR[job.lastError] ?? job.lastError}</p>}
            </div>)}
        </div>
        {nextCursor && <div className="flex justify-center"><Button variant="outline" onClick={loadMore} disabled={isLoadingMore || isRetrying}>{isLoadingMore && <Loader2 aria-hidden="true" className="animate-spin" />}Pokaż starsze operacje</Button></div>}
    </section>
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, PlayCircle, XCircle } from 'lucide-react'
import { AcademyVideo } from '@/components/academy/AcademyVideo'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { reviewAcademyRunMaterial } from '@/lib/actions/academy-materials'

interface RecordingReviewProps {
    runId: string
    assetId: string
    filename: string
    courseTitle: string
    ownUpload: boolean
    requestedAt: string | null
    preview?: boolean
}

/** Jedyna akceptacja drugiej osoby: obejrzyj, potwierdź brak głosów uczestników, zatwierdź do biblioteki. */
export function RecordingReview({ runId, assetId, filename, courseTitle, ownUpload, requestedAt, preview = false }: RecordingReviewProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [noVoices, setNoVoices] = useState(false)
    const [rejecting, setRejecting] = useState(false)
    const [note, setNote] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState<'approve' | 'reject' | null>(null)
    const [pending, startTransition] = useAcademyAction()

    function decide(decision: 'approve' | 'reject') {
        setError(null)
        startTransition(async () => {
            try {
                const result = await reviewAcademyRunMaterial({ assetId, decision, note: decision === 'reject' ? note : undefined })
                if (!result?.success) return setError(result?.error ?? 'Nie udało się zapisać decyzji. Odśwież stronę.')
                setDone(decision)
                router.refresh()
            } catch {
                setError('Nie udało się zapisać decyzji. Sprawdź połączenie i spróbuj ponownie.')
            }
        })
    }

    if (done) return <p role="status" className="flex items-center gap-2 text-sm">{done === 'approve' ? <><CheckCircle2 aria-hidden="true" className="size-4 text-success" />Nagranie jest w bibliotece.</> : <><XCircle aria-hidden="true" className="size-4 text-muted-foreground" />Odesłane trenerowi z komentarzem.</>}</p>

    return <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="font-medium">{courseTitle}</p><p className="truncate text-sm text-muted-foreground">{filename}{requestedAt ? ' · trener wysłał do publikacji' : ''}</p></div>
            {!open && <Button size="sm" onClick={() => setOpen(true)} className="shrink-0"><PlayCircle aria-hidden="true" />Obejrzyj i zatwierdź</Button>}
        </div>
        {open && <div className="space-y-3 rounded-lg border border-border p-3">
            {preview ? <div className="flex aspect-video items-center justify-center rounded-lg bg-foreground/90 text-background"><PlayCircle aria-hidden="true" className="size-10 opacity-80" /></div>
                : <AcademyVideo runId={runId} video={{ asset_id: assetId, name: filename, storage_path: '', size_bytes: 0, mime_type: 'video/mp4' }} />}
            <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={noVoices} onChange={event => setNoVoices(event.target.checked)} disabled={pending || ownUpload} />
                <span>Obejrzałem nagranie: nie słychać uczestników, pytania czyta trener.</span>
            </label>
            {ownUpload && <p className="text-sm text-muted-foreground">To Twój plik. Zatwierdza go inna osoba.</p>}
            {rejecting && <div className="space-y-1.5"><label htmlFor={`reject-${assetId}`} className="text-sm font-medium">Co poprawić (wymagane)</label><Textarea id={`reject-${assetId}`} value={note} onChange={event => setNote(event.target.value)} minLength={5} maxLength={2000} disabled={pending} /></div>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
                {!rejecting && <Button size="sm" disabled={pending || ownUpload || !noVoices} onClick={() => decide('approve')}>{pending && <Loader2 aria-hidden="true" className="animate-spin" />}Zatwierdź do biblioteki</Button>}
                {rejecting
                    ? <><Button size="sm" variant="destructive" disabled={pending || note.trim().length < 5} onClick={() => decide('reject')}>Odeślij do poprawy</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(false)}>Wróć</Button></>
                    : <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting(true)}>Do poprawy</Button>}
            </div>
        </div>}
    </div>
}

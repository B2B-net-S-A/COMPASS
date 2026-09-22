'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Pause, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { prepareAcademyUpload, finishAcademyUpload, listAcademyLessonUploads, listAcademyRunMaterials, discardAcademyUpload } from '@/lib/actions/academy-materials'
import { uploadAcademyFile } from '@/lib/academy/resumable-upload'

const mimeTypes = {
    pdf: 'application/pdf',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    mp4: 'video/mp4',
    vtt: 'text/vtt',
} as const
const states: Record<string, string> = { uploading: 'Przesyłanie nieukończone — wybierz ponownie ten sam plik', quarantined: 'Oczekuje na weryfikację', scanning: 'Trwa weryfikacja', rejected: 'Plik odrzucony — prześlij poprawny materiał' }
type UploadRow = { id: string; filename: string; status: string; error?: string | null }

export function MaterialUploader({ courseId, lessonId, runId, disabled, onReady }: {
    courseId: string; lessonId?: string; runId?: string; disabled?: boolean; onReady: () => void
}) {
    const scopeId = runId ?? lessonId
    const epoch = useRef(0)
    const [uploads, setUploads] = useState<UploadRow[]>([])
    const [busy, setBusy] = useState(false)
    const [percent, setPercent] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const controller = useRef<AbortController | null>(null)
    const previous = useRef(new Map<string, string>())
    const onReadyRef = useRef(onReady)
    onReadyRef.current = onReady

    const refresh = useCallback(async () => {
        const requestEpoch = epoch.current
        try {
            const result = runId ? await listAcademyRunMaterials(runId) : await listAcademyLessonUploads(lessonId!)
            if (epoch.current !== requestEpoch) return
            if (!result.success) { setError(result.error); return }
            const newlyReady = result.data.some(item => previous.current.has(item.id) && previous.current.get(item.id) !== 'ready' && item.status === 'ready')
            previous.current = new Map(result.data.map(item => [item.id, item.status]))
            setUploads(result.data)
            if (newlyReady) onReadyRef.current()
        } catch {
            if (epoch.current === requestEpoch) setError('Nie udało się sprawdzić materiałów. Odśwież stronę.')
        }
    }, [lessonId, runId])
    useEffect(() => {
        const currentEpoch = ++epoch.current
        previous.current.clear()
        setUploads([])
        void refresh()
        const timer = window.setInterval(() => {
            if ([...previous.current.values()].some(status => ['uploading', 'quarantined', 'scanning'].includes(status))) void refresh()
        }, 5000)
        return () => { epoch.current = currentEpoch + 1; window.clearInterval(timer); controller.current?.abort() }
    }, [refresh])

    async function upload(file: File) {
        if (controller.current) return
        const extension = file.name.split('.').pop()?.toLowerCase() as keyof typeof mimeTypes
        const mimeType = mimeTypes[extension]
        if (!mimeType) { setError('Dozwolone pliki: PDF, PPTX, DOCX, MP4 oraz napisy VTT.'); return }
        const limit = mimeType === 'video/mp4' ? 1024 ** 3 : 50 * 1024 ** 2
        if (!file.size || file.size > limit) { setError('Dokument może mieć do 50 MB, a nagranie MP4 do 1 GB.'); return }
        const abort = new AbortController()
        controller.current = abort
        setBusy(true)
        setError(null)
        setPercent(0)
        try {
            const prepared = await prepareAcademyUpload({ courseId, lessonId, runId, filename: file.name, mimeType, sizeBytes: file.size, fileModifiedAt: file.lastModified })
            if (!prepared.success) throw new Error(prepared.error)
            const asset = prepared.data
            if (abort.signal.aborted) return
            previous.current.set(asset.assetId, asset.status)
            if (asset.status === 'uploading') {
                if (!asset.token) throw new Error('Nie udało się autoryzować przesyłania.')
                await uploadAcademyFile({ file, ...asset, token: asset.token, mimeType, signal: abort.signal, onProgress: setPercent })
                const finished = await finishAcademyUpload(asset.assetId)
                if (!finished.success) throw new Error(finished.error)
            }
            if (asset.status === 'ready') onReadyRef.current()
            await refresh()
        } catch (cause) {
            setError(abort.signal.aborted ? 'Przesyłanie wstrzymane. Wybierz ponownie ten sam plik, aby wznowić.' : cause instanceof Error ? cause.message : 'Przesyłanie przerwane. Spróbuj ponownie.')
        } finally { controller.current = null; setBusy(false) }
    }

    async function discard(id: string) {
        try {
            const result = await discardAcademyUpload(id)
            if (!result.success) setError(result.error)
            else await refresh()
        } catch { setError('Nie udało się anulować przesyłania. Spróbuj ponownie.') }
    }

    return <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium" htmlFor={`upload-${scopeId}`}><Upload className="h-4 w-4" />Dodaj materiał lub wznów przesyłanie</label>
        <input id={`upload-${scopeId}`} aria-describedby={`upload-help-${scopeId}`} type="file" accept=".pdf,.pptx,.docx,.mp4,.vtt" disabled={disabled || busy}
            className="block w-full text-sm file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-2 file:text-foreground"
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} />
        <p id={`upload-help-${scopeId}`} className="text-xs text-muted-foreground">PDF, PPTX i DOCX do 50 MB; MP4 do 1 GB: H.264 (8-bit, Baseline/Main/High), jedna ścieżka obrazu i najwyżej jedna dźwięku AAC-LC. Nagrania segmentowane nie są obsługiwane; napisy VTT dodaj osobno. {runId ? 'Po skanowaniu administrator zatwierdzi publikację dla tej grupy.' : 'Materiały pojawią się w lekcji po weryfikacji.'}</p>
        {busy && <div className="flex items-center gap-3"><progress className="h-2 w-full" max={100} value={percent} aria-label="Postęp przesyłania" /><span className="text-xs">{percent}%</span><Button type="button" size="sm" variant="outline" onClick={() => controller.current?.abort()}><Pause className="mr-1 h-3 w-3" />Wstrzymaj</Button></div>}
        {uploads.filter(item => item.status !== 'ready').map(item => <div key={item.id} className="flex items-start justify-between gap-2 text-xs">
            <div className="min-w-0"><p className="break-all font-medium">{item.filename}</p><p className="text-muted-foreground">{item.status === 'rejected' && item.error ? item.error : states[item.status] ?? item.status}</p></div>
            {item.status !== 'rejected' && <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} aria-label={`Anuluj przesyłanie ${item.filename}`} onClick={() => void discard(item.id)}><X className="h-4 w-4" /></Button>}
        </div>)}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
}

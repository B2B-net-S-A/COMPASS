import Link from 'next/link'
import { ClipboardCheck, FileText, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CourseQA } from '@/components/learning/CourseQA'
import { formatDuration, recordingHref, recordingLabel, type LibraryFile, type LibraryRecording } from '@/lib/academy/recording-library'
import { RecordingPlayer } from './RecordingPlayer'

export interface CourseRecordingSectionProps {
    courseId: string
    courseTitle: string
    recordings: LibraryRecording[]
    current: LibraryRecording
    files: LibraryFile[]
    /** Pytania zadaje osoba zapisana na szkolenie; reszta je czyta. */
    enrollmentId?: string | null
    /** Link do „Sprawdź się”, gdy trener włączył test i osoba ma do niego dostęp. */
    quizHref?: string | null
    /** Podgląd na zrzutach: bez odtwarzacza i pytań, które czytają dane w przeglądarce. */
    preview?: boolean
}

function fileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
    return `${Math.max(1, Math.round(bytes / 1024))} kB`
}

/** Po szkoleniu na żywo nagranie jest na górze strony: odtwarzacz, inne części, materiały, pytania. */
export function CourseRecordingSection({ courseId, courseTitle, recordings, current, files, enrollmentId, quizHref, preview = false }: CourseRecordingSectionProps) {
    const others = recordings.filter(item => item.assetId !== current.assetId)
    return <section aria-label="Nagranie szkolenia" className="space-y-5">
        <div className="space-y-3">
            {preview
                ? <div className="flex aspect-video items-center justify-center rounded-xl bg-foreground/90 text-background"><PlayCircle aria-hidden="true" className="size-14 opacity-80" /></div>
                : <RecordingPlayer runId={current.runId} assetId={current.assetId} filename={current.filename} captionAssetId={current.captionAssetId}
                    saved={current.positionSeconds !== null ? { position: current.positionSeconds, duration: current.durationSeconds } : undefined} />}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-0.5"><h2 className="text-2xl font-semibold tracking-tight">{courseTitle}</h2><p className="text-sm text-muted-foreground">{[recordingLabel(current.filename), formatDuration(current.durationSeconds)].filter(Boolean).join(' · ')}</p></div>
                {quizHref && <Button asChild variant="outline" className="shrink-0"><Link href={quizHref}><ClipboardCheck aria-hidden="true" />Sprawdź się</Link></Button>}
            </div>
        </div>

        {others.length > 0 && <div className="space-y-2">
            <h2 className="text-base font-semibold">Inne części</h2>
            <ul className="grid gap-2 sm:grid-cols-2">{others.map(item => <li key={item.assetId}><Link href={recordingHref(item)} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-primary/40"><PlayCircle aria-hidden="true" className="size-5 shrink-0 text-primary" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{recordingLabel(item.filename)}</span>{formatDuration(item.durationSeconds) && <span className="text-xs text-muted-foreground">{formatDuration(item.durationSeconds)}</span>}</span></Link></li>)}</ul>
        </div>}

        {files.length > 0 && <div className="space-y-2">
            <h2 className="text-base font-semibold">Materiały</h2>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">{files.map(file => <li key={file.assetId} className="flex items-center gap-3 px-4 py-2.5">
                <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 grow"><p className="truncate text-sm font-medium">{file.filename}</p><p className="text-xs text-muted-foreground">{fileSize(file.sizeBytes)}</p></div>
                <Button asChild variant="outline" size="sm"><a href={`/api/akademia/attachment?${new URLSearchParams({ runId: file.runId, assetId: file.assetId })}`} aria-label={`Pobierz ${file.filename}`}>Pobierz</a></Button>
            </li>)}</ul>
        </div>}

        <div className="space-y-2">
            <h2 className="text-base font-semibold">Pytania pod nagraniem</h2>
            {preview
                ? <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Pytania uczestników i odpowiedzi trenera.</p>
                : <CourseQA courseId={courseId} enrollmentId={enrollmentId ?? undefined} readOnly={!enrollmentId} />}
            {!enrollmentId && !preview && <p className="text-xs text-muted-foreground">Pytanie zadasz po zapisaniu się na szkolenie.</p>}
        </div>
    </section>
}

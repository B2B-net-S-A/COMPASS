import Link from 'next/link'
import { CalendarClock, FileText, Play, PlayCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CourseEditionSignup } from '@/components/academy/course/CourseEditionSignup'
import { formatDuration, recordingHref, recordingLabel, type LibraryLiveRun, type LibraryRecording } from '@/lib/academy/recording-library'
import type { CourseListItem } from '@/lib/types/learning'
import { cn } from '@/lib/utils'

export interface AcademyLibraryProps {
    search: string
    topic?: string
    topics: string[]
    recordings: LibraryRecording[]
    continueItems: LibraryRecording[]
    courses: CourseListItem[]
    nextLive: LibraryLiveRun | null
    error?: string
}

function libraryHref(search: string, topic?: string): string {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (topic) params.set('temat', topic)
    const query = params.toString()
    return query ? `/learning?${query}` : '/learning'
}

function formatLiveDate(startsAt: string, timeZone: string): string {
    return new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(startsAt))
}

function Progress({ recording }: { recording: LibraryRecording }) {
    if (recording.positionSeconds === null || !recording.durationSeconds) return null
    const percent = Math.min(100, Math.round(recording.positionSeconds / recording.durationSeconds * 100))
    return <div className="h-1 overflow-hidden rounded-full bg-primary/10" role="progressbar" aria-label="Obejrzane" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div className="h-full bg-primary" style={{ width: `${percent}%` }} /></div>
}

function RecordingTile({ recording, compact = false }: { recording: LibraryRecording; compact?: boolean }) {
    const duration = formatDuration(recording.durationSeconds)
    return <Link href={recordingHref(recording)} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className={cn('relative flex items-center justify-center bg-muted', compact ? 'aspect-[16/7]' : 'aspect-video')}>
            <PlayCircle aria-hidden="true" className="size-10 text-muted-foreground transition-colors group-hover:text-primary" />
            {duration && <span className="absolute bottom-2 right-2 rounded-md bg-foreground/80 px-1.5 py-0.5 text-xs font-medium text-background">{duration}</span>}
        </div>
        <div className="flex grow flex-col gap-1.5 p-3 sm:p-3.5">
            <p className="line-clamp-2 text-sm font-semibold leading-snug">{recording.courseTitle}</p>
            <p className="truncate text-xs text-muted-foreground">{[recording.topic, recordingLabel(recording.filename)].filter(Boolean).join(' · ')}</p>
            <div className="mt-auto pt-1"><Progress recording={recording} /></div>
        </div>
    </Link>
}

function CourseTile({ course }: { course: CourseListItem }) {
    const live = (course.delivery_mode ?? 'self_paced') !== 'self_paced'
    return <Link href={`/learning/${encodeURIComponent(course.slug)}`} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{live ? <CalendarClock aria-hidden="true" className="size-4" /> : <FileText aria-hidden="true" className="size-4" />}</span>
        <span className="min-w-0 space-y-0.5"><span className="line-clamp-2 block text-sm font-semibold leading-snug">{course.title}</span><span className="block text-xs text-muted-foreground">{live ? 'Szkolenie na żywo' : 'Szkolenie we własnym tempie'}{course.duration_minutes ? ` · ${formatDuration(course.duration_minutes * 60)}` : ''}</span></span>
    </Link>
}

/** Biblioteka: szukanie, tematy, „Kontynuuj oglądanie”, najbliższe szkolenie na żywo i kafle nagrań. */
export function AcademyLibrary({ search, topic, topics, recordings, continueItems, courses, nextLive, error }: AcademyLibraryProps) {
    const filtered = Boolean(search || topic)
    return <div className="space-y-8">
        <form action="/learning" method="get" role="search" className="flex flex-col gap-3 sm:flex-row">
            {topic && <input type="hidden" name="temat" value={topic} />}
            <label className="relative grow">
                <span className="sr-only">Szukaj w nagraniach i materiałach</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input name="q" type="search" defaultValue={search} placeholder="Szukaj w nagraniach i materiałach" maxLength={100}
                    className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            <Button type="submit" className="h-12 rounded-xl px-6">Szukaj</Button>
        </form>

        {topics.length > 0 && <nav aria-label="Tematy" className="-mt-4 flex flex-wrap gap-2">
            <Link href={libraryHref(search)} aria-current={!topic ? 'page' : undefined} className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors', !topic ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40')}>Wszystkie</Link>
            {topics.map(item => <Link key={item} href={libraryHref(search, item)} aria-current={topic === item ? 'page' : undefined} className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors', topic === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40')}>{item}</Link>)}
        </nav>}

        {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">{error}</p>}

        {!filtered && nextLive && <section aria-label="Najbliższe szkolenie na żywo" className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><CalendarClock aria-hidden="true" className="size-5" /></span>
                <div className="space-y-0.5"><p className="text-xs font-medium uppercase tracking-wide text-primary">Na żywo</p><Link href={`/learning/${encodeURIComponent(nextLive.courseSlug)}`} className="block font-semibold hover:underline">{nextLive.courseTitle}</Link><p className="text-sm text-muted-foreground first-letter:uppercase">{formatLiveDate(nextLive.startsAt, nextLive.timeZone)}</p></div>
            </div>
            <div className="sm:w-56">{nextLive.registered
                ? <p className="rounded-lg bg-background px-3 py-2 text-center text-sm font-medium">Jesteś zapisany</p>
                : <CourseEditionSignup runId={nextLive.runId} waitlist={nextLive.full} />}</div>
        </section>}

        {!filtered && continueItems.length > 0 && <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Play aria-hidden="true" className="size-4 text-primary" />Kontynuuj oglądanie</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{continueItems.map(item => <RecordingTile key={item.assetId} recording={item} compact />)}</div>
        </section>}

        <section className="space-y-3">
            <h2 className="text-lg font-semibold">{filtered ? `Nagrania (${recordings.length})` : 'Nagrania'}</h2>
            {recordings.length
                ? <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">{recordings.map(item => <RecordingTile key={item.assetId} recording={item} />)}</div>
                : <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{filtered ? 'Brak nagrań dla tych warunków. Zmień frazę albo temat.' : 'Nagrania pojawią się tu po zatwierdzeniu pierwszego webinaru.'}</p>}
        </section>

        {courses.length > 0 && <section className="space-y-3">
            <h2 className="text-lg font-semibold">Szkolenia i materiały</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{courses.map(course => <CourseTile key={course.id} course={course} />)}</div>
        </section>}
    </div>
}

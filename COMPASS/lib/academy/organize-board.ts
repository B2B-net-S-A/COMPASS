/** Wersja prosta, „Organizuję”: stan szkolenia i kolejka „Do zrobienia”. Czyste funkcje. */

export type BoardStage = 'draft' | 'open' | 'waiting_recording' | 'to_approve' | 'in_library' | 'cancelled'

export const STAGE_LABELS: Record<BoardStage, string> = {
    draft: 'Szkic zapowiedzi',
    open: 'Zapisy otwarte',
    waiting_recording: 'Czeka na nagranie',
    to_approve: 'Do akceptacji',
    in_library: 'W bibliotece',
    cancelled: 'Odwołane',
}

export interface BoardMaterial {
    id: string
    runId: string
    filename: string
    mimeType: string
    status: string
    reviewStatus: string
    uploadedBy: string | null
}

export interface BoardRun {
    id: string
    courseId: string
    courseSlug: string
    courseTitle: string
    title: string
    status: string
    confirmedCount: number
    sessions: Array<{ startsAt: string; endsAt: string; status: string }>
}

const VIDEO = 'video/mp4'
/** Po tylu dniach od końca spotkania brak nagrania to zadanie dla organizatora. */
export const RECORDING_REMINDER_DAYS = 2

function liveSessions(run: BoardRun) {
    return run.sessions.filter(session => session.status !== 'cancelled')
}

export function firstStart(run: BoardRun): number | null {
    const starts = liveSessions(run).map(session => Date.parse(session.startsAt)).filter(Number.isFinite)
    return starts.length ? Math.min(...starts) : null
}

function lastEnd(run: BoardRun): number | null {
    const ends = liveSessions(run).map(session => Date.parse(session.endsAt)).filter(Number.isFinite)
    return ends.length ? Math.max(...ends) : null
}

export function boardStage(run: BoardRun, materials: BoardMaterial[], now: number): BoardStage {
    if (run.status === 'cancelled') return 'cancelled'
    if (run.status !== 'published') return 'draft'
    const videos = materials.filter(item => item.runId === run.id && item.mimeType === VIDEO && item.status === 'ready')
    if (videos.some(item => item.reviewStatus === 'pending_review')) return 'to_approve'
    if (videos.some(item => item.reviewStatus === 'published')) return 'in_library'
    const start = firstStart(run)
    if (start === null || start > now) return 'open'
    return 'waiting_recording'
}

export type TodoKind = 'approve_recording' | 'publish_announcement' | 'remind_trainer'

export interface TodoItem {
    kind: TodoKind
    runId: string
    courseTitle: string
    /** Tylko dla akceptacji: nagranie do obejrzenia. */
    material?: BoardMaterial
    /** Autor pliku nie zatwierdza własnego nagrania (zasada czterech oczu). */
    ownUpload?: boolean
    requestedAt?: string | null
}

/** Najpierw nagrania do zatwierdzenia, potem zapowiedzi, na końcu przypomnienia o nagraniu. */
export function buildTodo(runs: BoardRun[], materials: BoardMaterial[], requests: Record<string, string>, userId: string, now: number): TodoItem[] {
    const approve: TodoItem[] = []
    const publish: TodoItem[] = []
    const remind: TodoItem[] = []
    for (const run of runs) {
        const stage = boardStage(run, materials, now)
        if (stage === 'to_approve') {
            for (const material of materials.filter(item => item.runId === run.id && item.mimeType === VIDEO && item.status === 'ready' && item.reviewStatus === 'pending_review')) {
                approve.push({ kind: 'approve_recording', runId: run.id, courseTitle: run.courseTitle, material, ownUpload: material.uploadedBy === userId, requestedAt: requests[run.id] ?? null })
            }
        } else if (stage === 'draft') {
            publish.push({ kind: 'publish_announcement', runId: run.id, courseTitle: run.courseTitle })
        } else if (stage === 'waiting_recording') {
            const end = lastEnd(run)
            if (end !== null && now - end >= RECORDING_REMINDER_DAYS * 86_400_000) remind.push({ kind: 'remind_trainer', runId: run.id, courseTitle: run.courseTitle })
        }
    }
    // Prośby trenera („Wyślij do publikacji”) idą przed plikami wgranymi bez prośby.
    approve.sort((a, b) => Number(Boolean(b.requestedAt)) - Number(Boolean(a.requestedAt)) || (a.requestedAt ?? '').localeCompare(b.requestedAt ?? ''))
    return [...approve, ...publish, ...remind]
}

/** Lista szkoleń: najbliższe i najświeższe na górze, odwołane na końcu. */
export function sortBoard(runs: BoardRun[], materials: BoardMaterial[], now: number): Array<BoardRun & { stage: BoardStage }> {
    const order: Record<BoardStage, number> = { to_approve: 0, draft: 1, open: 2, waiting_recording: 3, in_library: 4, cancelled: 5 }
    return runs.map(run => ({ ...run, stage: boardStage(run, materials, now) }))
        .sort((a, b) => order[a.stage] - order[b.stage] || (firstStart(b) ?? 0) - (firstStart(a) ?? 0))
}

/** Datetime-local w czasie warszawskim → ISO z przesunięciem, liczonym dla tej daty (zima/lato). */
export function warsawIso(local: string): string {
    const guess = new Date(`${local}:00Z`)
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', timeZoneName: 'shortOffset' }).formatToParts(guess)
    const offset = parts.find(part => part.type === 'timeZoneName')?.value.replace('GMT', '') || '+0'
    const [hours, minutes = '0'] = offset.replace('+', '').split(':')
    const sign = offset.startsWith('-') ? '-' : '+'
    return `${local}:00${sign}${String(Math.abs(Number(hours))).padStart(2, '0')}:${minutes.padStart(2, '0')}`
}


/** Wersja prosta, „Prowadzę”: stan plików i kroków trenera. Czyste funkcje. */

export interface TrainerMaterialRow {
    id: string
    filename: string
    mime_type: string
    status: string
    review_status: string
    review_note: string | null
    error?: string | null
}

export type TrainerMaterialKey = 'scanning' | 'waiting' | 'library' | 'rejected' | 'blocked' | 'withdrawn'

export function trainerMaterialState(item: TrainerMaterialRow): { key: TrainerMaterialKey; label: string; note: string | null } {
    if (item.status === 'rejected') return { key: 'blocked', label: 'Plik odrzucony przy skanie', note: item.error ?? null }
    if (item.status !== 'ready') return { key: 'scanning', label: 'Sprawdzanie pliku', note: null }
    if (item.review_status === 'published') return { key: 'library', label: 'W bibliotece', note: null }
    if (item.review_status === 'rejected') return { key: 'rejected', label: 'Do poprawy', note: item.review_note }
    if (item.review_status === 'withdrawn') return { key: 'withdrawn', label: 'Wycofany z biblioteki', note: item.review_note }
    return { key: 'waiting', label: 'Czeka na akceptację', note: null }
}

export interface TrainerSteps {
    description: boolean
    date: boolean
    recording: boolean
    test: boolean
    /** Jest plik gotowy i czekający na akceptację, więc „Wyślij do publikacji” ma co wysłać. */
    canSend: boolean
    inLibrary: number
}

export function trainerSteps(input: { description: string | null; sessionCount: number; materials: TrainerMaterialRow[]; quizQuestions: number }): TrainerSteps {
    const states = input.materials.map(trainerMaterialState)
    return {
        description: Boolean(input.description?.trim()),
        date: input.sessionCount > 0,
        recording: input.materials.some(item => item.mime_type === 'video/mp4' && item.status === 'ready' && ['pending_review', 'published'].includes(item.review_status)),
        test: input.quizQuestions > 0,
        canSend: states.some(state => state.key === 'waiting'),
        inLibrary: states.filter(state => state.key === 'library').length,
    }
}

export interface TrainerRunCandidate {
    id: string
    status: string
    sessions: Array<{ startsAt: string; status: string }>
}

/** Edycja, której dotyczy nagranie: ostatnia, która już się zaczęła; bez takiej najbliższa przyszła. */
export function pickTrainerRun<T extends TrainerRunCandidate>(runs: T[], now: number): T | null {
    const dated = runs.filter(run => run.status !== 'cancelled').flatMap(run => {
        const starts = run.sessions.filter(session => session.status !== 'cancelled').map(session => Date.parse(session.startsAt)).filter(Number.isFinite)
        return starts.length ? [{ run, first: Math.min(...starts) }] : []
    })
    const started = dated.filter(item => item.first <= now).sort((a, b) => b.first - a.first)[0]
    if (started) return started.run
    return dated.sort((a, b) => a.first - b.first)[0]?.run ?? runs.find(run => run.status !== 'cancelled') ?? null
}

// B4.9: import nagrań spotkania z Teams. Działa tylko po decyzji właściciela o uprawnieniu
// OnlineMeetingRecording.Read.All i polityce dostępu aplikacji, dlatego domyślnie jest wyłączony.
// Bez przełącznika zadanie w ogóle nie powstaje, więc nie ma też żadnego żądania do Graph.
import type { GraphLike } from '@/lib/graph/client'

export function academyGraphRecordingsEnabled(env: Record<string, string | undefined> = process.env): boolean {
    return env.ACADEMY_GRAPH_RECORDINGS_ENABLED === 'true'
}

export interface TeamsMeetingTarget {
    sessionId: string
    organizerId: string
    onlineMeetingId: string
}

export interface TeamsRecordingPart {
    id: string
    createdAt: string
    contentUrl: string
}

export interface RecordingImportStore {
    /** Idempotent per session and part, so a retried job does not duplicate files. */
    savePart(input: { sessionId: string; partId: string; partNumber: number; totalParts: number; contentUrl: string }): Promise<void>
    saveTranscript(input: { sessionId: string; transcriptId: string; contentUrl: string }): Promise<void>
}

export type RecordingImportResult =
    | { status: 'disabled' }
    | { status: 'no_recording' }
    | { status: 'imported'; parts: number; transcripts: number }

interface GraphCollection { value?: { id?: string; createdDateTime?: string; recordingContentUrl?: string; transcriptContentUrl?: string }[] }

async function fetchAll(graph: GraphLike, path: string): Promise<NonNullable<GraphCollection['value']>> {
    const response = await graph.api(path).get() as GraphCollection
    return response.value ?? []
}

/** Teams splits long recordings; parts are ordered by creation time to form one session. */
export async function listTeamsRecordingParts(graph: GraphLike, target: TeamsMeetingTarget): Promise<TeamsRecordingPart[]> {
    const items = await fetchAll(graph, `/users/${encodeURIComponent(target.organizerId)}/onlineMeetings/${encodeURIComponent(target.onlineMeetingId)}/recordings`)
    return items
        .filter((item): item is { id: string; createdDateTime: string; recordingContentUrl: string } => Boolean(item.id && item.createdDateTime && item.recordingContentUrl))
        .sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime))
        .map(item => ({ id: item.id, createdAt: item.createdDateTime, contentUrl: item.recordingContentUrl }))
}

export async function importTeamsRecording(input: {
    target: TeamsMeetingTarget
    graph: GraphLike
    store: RecordingImportStore
    env?: Record<string, string | undefined>
}): Promise<RecordingImportResult> {
    if (!academyGraphRecordingsEnabled(input.env)) return { status: 'disabled' }
    const parts = await listTeamsRecordingParts(input.graph, input.target)
    if (!parts.length) return { status: 'no_recording' }
    for (const [index, part] of parts.entries()) {
        await input.store.savePart({ sessionId: input.target.sessionId, partId: part.id, partNumber: index + 1, totalParts: parts.length, contentUrl: part.contentUrl })
    }
    // The transcript stays separate: it is never a lesson and never an input for AI.
    const transcripts = await fetchAll(input.graph, `/users/${encodeURIComponent(input.target.organizerId)}/onlineMeetings/${encodeURIComponent(input.target.onlineMeetingId)}/transcripts`)
    let saved = 0
    for (const transcript of transcripts) {
        if (!transcript.id || !transcript.transcriptContentUrl) continue
        await input.store.saveTranscript({ sessionId: input.target.sessionId, transcriptId: transcript.id, contentUrl: transcript.transcriptContentUrl })
        saved += 1
    }
    return { status: 'imported', parts: parts.length, transcripts: saved }
}

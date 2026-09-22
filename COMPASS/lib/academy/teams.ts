import 'server-only'

import { createHash } from 'node:crypto'
import { extractGraphErrorInfo, getGraphClient, type GraphLike } from '@/lib/graph/client'
import type { AttendanceReport, AttendanceRecord } from './attendance'

/** Persisted on the event so a lost POST response can be recovered after a crash. */
export const ACADEMY_SESSION_PROPERTY = 'String {5a2b92d8-5c63-4c49-b2cc-b848873f54d1} Name CompassAcademySession'
const BODY_START = '<!-- compass-academy:start -->'
const BODY_END = '<!-- compass-academy:end -->'
const MAX_PAGES = 100

export interface OrganizerIdentity { tenantId: string; userId: string }
export interface TeamsAttendee { email: string; name?: string }
export interface TeamsSessionInput {
    sessionId: string
    organizer: OrganizerIdentity
    subject: string
    startDateTime: string
    endDateTime: string
    timeZone?: string
    descriptionText?: string
    attendees: TeamsAttendee[]
}
export interface MeetingReference {
    eventId: string
    joinUrl: string
    transactionId: string
    organizerId: string
    webLink?: string
}
export type IntegrationErrorCode = 'invalid_input' | 'configuration' | 'forbidden' | 'not_found'
    | 'conflict' | 'throttled' | 'unavailable' | 'invalid_response' | 'meeting_not_ready'
    | 'attendance_pending' | 'unknown'

/** Safe, bounded messages only: Graph errors may contain participant data or join URLs. */
export class AcademyIntegrationError extends Error {
    constructor(
        public readonly code: IntegrationErrorCode,
        public readonly retryable: boolean,
        public readonly retryAfterMs?: number,
        public readonly statusCode?: number,
    ) {
        super(`academy_integration:${code}`)
        this.name = 'AcademyIntegrationError'
    }
}

export function classifyAcademyIntegrationError(error: unknown): AcademyIntegrationError {
    if (error instanceof AcademyIntegrationError) return error
    const { statusCode, retryAfterMs } = extractGraphErrorInfo(error)
    if (statusCode === 429) return new AcademyIntegrationError('throttled', true, retryAfterMs, statusCode)
    if (statusCode === 401) return new AcademyIntegrationError('configuration', false, undefined, statusCode)
    if (statusCode === 403) return new AcademyIntegrationError('forbidden', false, undefined, statusCode)
    if (statusCode === 404) return new AcademyIntegrationError('not_found', false, undefined, statusCode)
    if (statusCode === 409 || statusCode === 412) return new AcademyIntegrationError('conflict', true, retryAfterMs, statusCode)
    if (statusCode && statusCode >= 500) return new AcademyIntegrationError('unavailable', true, retryAfterMs, statusCode)
    if (statusCode && statusCode >= 400) return new AcademyIntegrationError('invalid_input', false, undefined, statusCode)
    const e = error as { name?: string; code?: string; message?: string } | null
    if (e?.name === 'GraphTimeoutError' || e?.name === 'AbortError'
        || ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ECONNREFUSED', 'ENOTFOUND'].includes(e?.code ?? '')
        || (e?.name === 'TypeError' && /fetch|network/i.test(e.message ?? ''))) {
        return new AcademyIntegrationError('unavailable', true)
    }
    if (e?.message?.includes('AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET')) {
        return new AcademyIntegrationError('configuration', false)
    }
    return new AcademyIntegrationError('unknown', false)
}

/** Do not fetch these URLs on the server. A valid link conveys no Graph access. */
export function validateTeamsJoinUrl(value: string): string {
    if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020\u007f\\]/.test(value)) {
        throw new AcademyIntegrationError('invalid_input', false)
    }
    let url: URL
    try { url = new URL(value) } catch { throw new AcademyIntegrationError('invalid_input', false) }
    const validPath = (url.hostname === 'teams.microsoft.com' && /^\/(?:l\/meetup-join\/[^/]+(?:\/.*)?|meet\/\d+\/?)$/.test(url.pathname))
        || (url.hostname === 'teams.live.com' && /^\/meet\/\d+\/?$/.test(url.pathname))
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !validPath) {
        throw new AcademyIntegrationError('invalid_input', false)
    }
    return url.toString()
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new AcademyIntegrationError('invalid_response', true)
    }
    return value as Record<string, unknown>
}
function string(value: unknown): string | undefined { return typeof value === 'string' && value ? value : undefined }
function identifier(value: string): string {
    if (!value || value.length > 1024 || /[\u0000-\u001f]/.test(value)) throw new AcademyIntegrationError('invalid_input', false)
    return encodeURIComponent(value)
}
function uuid(value: string): string {
    if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)) {
        throw new AcademyIntegrationError('invalid_input', false)
    }
    return value.toLowerCase()
}
function quote(value: string): string { return value.replace(/'/g, "''") }
function query(path: string, values: Record<string, string>): string { return `${path}?${new URLSearchParams(values)}` }
function eventsPath(organizerId: string): string { return `/users/${uuid(organizerId)}/events` }

export function teamsSessionTransactionId(input: Pick<TeamsSessionInput, 'sessionId' | 'organizer'>): string {
    return createHash('sha256').update(`compass:academy:${uuid(input.organizer.tenantId)}:${uuid(input.organizer.userId)}:${uuid(input.sessionId)}`).digest('hex')
}

async function clientOrDefault(client?: GraphLike, tenantId?: string): Promise<GraphLike> {
    if (!client && tenantId && process.env.AZURE_TENANT_ID?.toLowerCase() !== uuid(tenantId)) {
        throw new AcademyIntegrationError('configuration', false)
    }
    try { return client ?? await getGraphClient() } catch (error) { throw classifyAcademyIntegrationError(error) }
}
async function request<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation() } catch (error) { throw classifyAcademyIntegrationError(error) }
}

/** A nextLink must remain in the exact collection; never follow an untrusted host with an app token. */
async function collection(client: GraphLike, firstPath: string): Promise<Record<string, unknown>[]> {
    const expected = new URL(firstPath, 'https://graph.microsoft.com/v1.0/')
    const expectedPath = expected.pathname.startsWith('/v1.0/') ? expected.pathname : `/v1.0${expected.pathname}`
    const visited = new Set<string>()
    const rows: Record<string, unknown>[] = []
    let path: string | undefined = firstPath
    while (path) {
        if (visited.has(path) || visited.size >= MAX_PAGES) throw new AcademyIntegrationError('invalid_response', false)
        visited.add(path)
        const result = object(await request(() => client.api(path!).get()))
        if (!Array.isArray(result.value)) throw new AcademyIntegrationError('invalid_response', true)
        rows.push(...result.value.map(object))
        if (rows.length > 20_000) throw new AcademyIntegrationError('invalid_response', false)
        const next = string(result['@odata.nextLink'])
        if (!next) break
        let url: URL
        try { url = new URL(next) } catch { throw new AcademyIntegrationError('invalid_response', false) }
        if (url.origin !== 'https://graph.microsoft.com' || url.pathname !== expectedPath || url.username || url.password || url.hash) {
            throw new AcademyIntegrationError('invalid_response', false)
        }
        path = url.toString()
    }
    return rows
}

function validateSession(input: TeamsSessionInput): void {
    teamsSessionTransactionId(input)
    const start = Date.parse(input.startDateTime)
    const end = Date.parse(input.endDateTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start
        || !/(?:Z|[+-]\d{2}:\d{2})$/.test(input.startDateTime) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(input.endDateTime)
        || !input.subject.trim() || input.subject.length > 255 || (input.descriptionText?.length ?? 0) > 20_000
        || input.attendees.length > 500) throw new AcademyIntegrationError('invalid_input', false)
    if (input.timeZone) {
        try { new Intl.DateTimeFormat('en', { timeZone: input.timeZone }).format() } catch { throw new AcademyIntegrationError('invalid_input', false) }
    }
}

function attendeePayload(attendees: TeamsAttendee[]) {
    const seen = new Set<string>()
    return attendees.flatMap(({ email, name }) => {
        const address = email.trim().toLowerCase()
        if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) || address.length > 254 || (name?.length ?? 0) > 200) {
            throw new AcademyIntegrationError('invalid_input', false)
        }
        if (seen.has(address)) return []
        seen.add(address)
        return [{ emailAddress: { address, ...(name ? { name } : {}) }, type: 'required' }]
    })
}
function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
function description(text: string): string {
    return `${BODY_START}<div>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</div>${BODY_END}`
}
function eventPayload(input: TeamsSessionInput) {
    validateSession(input)
    return {
        subject: input.subject.trim(),
        // Explicit UTC removes ambiguous/nonexistent wall times; Compass retains its display zone.
        start: { dateTime: new Date(input.startDateTime).toISOString(), timeZone: 'UTC' },
        end: { dateTime: new Date(input.endDateTime).toISOString(), timeZone: 'UTC' },
        attendees: attendeePayload(input.attendees),
        hideAttendees: true,
        allowNewTimeProposals: false,
    }
}

async function reference(client: GraphLike, input: Pick<TeamsSessionInput, 'sessionId' | 'organizer'>, raw: Record<string, unknown>): Promise<MeetingReference> {
    const eventId = string(raw.id)
    if (!eventId) throw new AcademyIntegrationError('invalid_response', true)
    let event = raw
    if (!event.onlineMeeting) event = object(await request(() => client.api(`${eventsPath(input.organizer.userId)}/${identifier(eventId)}`).get()))
    if (event.isCancelled === true) throw new AcademyIntegrationError('conflict', false)
    const online = event.onlineMeeting && typeof event.onlineMeeting === 'object' ? event.onlineMeeting as Record<string, unknown> : {}
    const url = string(online.joinUrl)
    if (!url) throw new AcademyIntegrationError('meeting_not_ready', true, 30_000)
    let joinUrl: string
    try { joinUrl = validateTeamsJoinUrl(url) } catch { throw new AcademyIntegrationError('invalid_response', false) }
    return { eventId, joinUrl, transactionId: teamsSessionTransactionId(input), organizerId: uuid(input.organizer.userId), webLink: string(event.webLink) }
}

async function recoverEvent(input: Pick<TeamsSessionInput, 'sessionId' | 'organizer'>, client: GraphLike): Promise<Record<string, unknown> | null> {
    const marker = teamsSessionTransactionId(input)
    const matches = await collection(client, query(eventsPath(input.organizer.userId), {
        '$filter': `singleValueExtendedProperties/Any(ep: ep/id eq '${quote(ACADEMY_SESSION_PROPERTY)}' and ep/value eq '${marker}')`,
        '$top': '2',
    }))
    if (matches.length > 1) throw new AcademyIntegrationError('conflict', false)
    return matches[0] ?? null
}

/** Cancellation must recover an orphan event even before Teams generates its join link. */
export async function recoverTeamsCalendarEventId(input: Pick<TeamsSessionInput, 'sessionId' | 'organizer'>, graph?: GraphLike): Promise<{ eventId: string } | null> {
    const client = await clientOrDefault(graph, input.organizer.tenantId)
    const event = await recoverEvent(input, client)
    if (!event) return null
    const eventId = string(event.id)
    if (!eventId) throw new AcademyIntegrationError('invalid_response', true)
    return { eventId }
}

export async function recoverTeamsCalendarEvent(input: Pick<TeamsSessionInput, 'sessionId' | 'organizer'>, graph?: GraphLike): Promise<MeetingReference | null> {
    const client = await clientOrDefault(graph, input.organizer.tenantId)
    const event = await recoverEvent(input, client)
    return event ? reference(client, input, event) : null
}

export async function createTeamsCalendarEvent(input: TeamsSessionInput, graph?: GraphLike): Promise<MeetingReference> {
    const payload = eventPayload(input)
    const client = await clientOrDefault(graph, input.organizer.tenantId)
    const recovered = await recoverTeamsCalendarEvent(input, client)
    if (recovered) return updateTeamsCalendarEvent({ ...input, eventId: recovered.eventId }, client)
    try {
        const raw = object(await client.api(eventsPath(input.organizer.userId)).post({
            ...payload,
            body: { contentType: 'HTML', content: description(input.descriptionText ?? '') },
            isOnlineMeeting: true,
            onlineMeetingProvider: 'teamsForBusiness',
            transactionId: teamsSessionTransactionId(input),
            singleValueExtendedProperties: [{ id: ACADEMY_SESSION_PROPERTY, value: teamsSessionTransactionId(input) }],
        }))
        return await reference(client, input, raw)
    } catch (error) {
        const classified = classifyAcademyIntegrationError(error)
        if (classified.retryable && !classified.retryAfterMs) {
            const recoveredAfterFailure = await recoverTeamsCalendarEvent(input, client)
            if (recoveredAfterFailure) return updateTeamsCalendarEvent({ ...input, eventId: recoveredAfterFailure.eventId }, client)
        }
        throw classified
    }
}

export async function updateTeamsCalendarEvent(input: TeamsSessionInput & { eventId: string }, graph?: GraphLike): Promise<MeetingReference> {
    const payload = eventPayload(input)
    const client = await clientOrDefault(graph, input.organizer.tenantId)
    const path = `${eventsPath(input.organizer.userId)}/${identifier(input.eventId)}`
    const current = object(await request(() => client.api(query(path, {
        '$expand': `singleValueExtendedProperties($filter=id eq '${quote(ACADEMY_SESSION_PROPERTY)}')`,
    })).get()))
    assertEventOwnership(current, input)
    let body: { contentType: string; content: string } | undefined
    if (input.descriptionText !== undefined) {
        const currentBody = object(current.body)
        const previous = typeof currentBody.content === 'string' ? currentBody.content : ''
        const html = currentBody.contentType === 'text' ? escapeHtml(previous).replace(/\r?\n/g, '<br>') : previous
        const start = html.indexOf(BODY_START)
        const end = html.indexOf(BODY_END, start)
        const updated = start >= 0 && end >= start
            ? html.slice(0, start) + description(input.descriptionText) + html.slice(end + BODY_END.length)
            : description(input.descriptionText) + html
        body = { contentType: 'HTML', content: updated }
    }
    const patch: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
        if (key === 'attendees') {
            const addresses = (items: unknown): string[] => Array.isArray(items) ? items.map(item => {
                const address = item?.emailAddress?.address
                return typeof address === 'string' ? address.toLowerCase() : ''
            }).sort() : []
            if (JSON.stringify(addresses(current.attendees)) !== JSON.stringify(addresses(value))) patch.attendees = value
        } else if (key === 'start' || key === 'end') {
            const previous = current[key] as { dateTime?: string; timeZone?: string } | undefined
            const next = value as { dateTime: string; timeZone: string }
            const priorUtc = previous?.timeZone === 'UTC' && previous.dateTime
                ? Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(previous.dateTime) ? previous.dateTime : `${previous.dateTime}Z`) : NaN
            if (priorUtc !== Date.parse(next.dateTime)) patch[key] = value
        } else if (current[key] !== value) patch[key] = value
    }
    const previousBody = current.body as { contentType?: string; content?: string } | undefined
    if (body && (body.content !== previousBody?.content || previousBody?.contentType?.toLowerCase() !== 'html')) patch.body = body
    if (!Object.keys(patch).length) return reference(client, input, current)
    const raw = object(await request(() => client.api(path).patch(patch)))
    return reference(client, input, raw)
}

function assertEventOwnership(event: Record<string, unknown>, input: Pick<TeamsSessionInput, 'sessionId' | 'organizer'>): void {
    const props = Array.isArray(event.singleValueExtendedProperties) ? event.singleValueExtendedProperties : []
    if (!props.some(p => p && typeof p === 'object' && p.id === ACADEMY_SESSION_PROPERTY && p.value === teamsSessionTransactionId(input))) {
        throw new AcademyIntegrationError('conflict', false)
    }
}

export async function cancelTeamsCalendarEvent(input: Pick<TeamsSessionInput, 'sessionId' | 'organizer'> & { eventId: string; comment?: string }, graph?: GraphLike): Promise<void> {
    if ((input.comment?.length ?? 0) > 2000) throw new AcademyIntegrationError('invalid_input', false)
    const client = await clientOrDefault(graph, input.organizer.tenantId)
    const path = `${eventsPath(input.organizer.userId)}/${identifier(input.eventId)}`
    try {
        const current = object(await request(() => client.api(query(path, {
            '$expand': `singleValueExtendedProperties($filter=id eq '${quote(ACADEMY_SESSION_PROPERTY)}')`,
        })).get()))
        assertEventOwnership(current, input)
        if (current.isCancelled === true) return
        await request(() => client.api(`${path}/cancel`).post({ comment: input.comment ?? 'Szkolenie zostało odwołane.' }))
    } catch (error) {
        const classified = classifyAcademyIntegrationError(error)
        if (classified.code === 'not_found') return
        throw classified
    }
}

export async function findTeamsOnlineMeeting(input: { organizerId: string; joinUrl: string }, graph?: GraphLike): Promise<string> {
    const client = await clientOrDefault(graph)
    const meetings = await collection(client, query(`/users/${uuid(input.organizerId)}/onlineMeetings`, {
        '$filter': `JoinWebUrl eq '${quote(validateTeamsJoinUrl(input.joinUrl))}'`,
    }))
    if (!meetings.length) throw new AcademyIntegrationError('meeting_not_ready', true, 60_000)
    if (meetings.length !== 1 || !string(meetings[0].id)) throw new AcademyIntegrationError('invalid_response', false)
    return meetings[0].id as string
}

export async function fetchTeamsAttendance(input: { organizerId: string; onlineMeetingId: string }, graph?: GraphLike): Promise<AttendanceReport[]> {
    const client = await clientOrDefault(graph)
    const path = `/users/${uuid(input.organizerId)}/onlineMeetings/${identifier(input.onlineMeetingId)}/attendanceReports`
    const reports = await collection(client, path)
    const result: AttendanceReport[] = []
    for (const report of reports) {
        const id = string(report.id)
        const startDateTime = string(report.meetingStartDateTime)
        const endDateTime = string(report.meetingEndDateTime)
        if (!id || !startDateTime || !endDateTime) throw new AcademyIntegrationError('invalid_response', true)
        const rows = await collection(client, `${path}/${identifier(id)}/attendanceRecords`)
        const records: AttendanceRecord[] = rows.map(row => {
            const identity = row.identity && typeof row.identity === 'object' ? row.identity as Record<string, unknown> : {}
            if (!Array.isArray(row.attendanceIntervals)) throw new AcademyIntegrationError('invalid_response', true)
            return {
                id: string(row.id),
                emailAddress: string(row.emailAddress),
                identity: { id: string(identity.id), tenantId: string(identity.tenantId) },
                role: string(row.role),
                intervals: row.attendanceIntervals.map(interval => {
                    const value = object(interval)
                    return { start: string(value.joinDateTime) ?? '', end: string(value.leaveDateTime) ?? '' }
                }),
            }
        })
        result.push({ id, startDateTime, endDateTime, records })
    }
    return result
}

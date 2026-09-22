import { describe, expect, it } from 'vitest'
import type { GraphLike } from '@/lib/graph/client'
import {
    ACADEMY_SESSION_PROPERTY, AcademyIntegrationError, cancelTeamsCalendarEvent,
    classifyAcademyIntegrationError, createTeamsCalendarEvent, fetchTeamsAttendance,
    findTeamsOnlineMeeting, teamsSessionTransactionId, updateTeamsCalendarEvent, recoverTeamsCalendarEventId,
    validateTeamsJoinUrl, type TeamsSessionInput,
} from '../teams'

const organizer = { tenantId: '11111111-1111-1111-1111-111111111111', userId: '22222222-2222-2222-2222-222222222222' }
const input: TeamsSessionInput = {
    sessionId: '33333333-3333-3333-3333-333333333333', organizer, subject: 'Bezpieczne API',
    startDateTime: '2026-10-25T10:00:00+01:00', endDateTime: '2026-10-25T11:00:00+01:00',
    timeZone: 'Europe/Warsaw', attendees: [{ email: 'student@example.com' }],
}
const joinUrl = 'https://teams.microsoft.com/l/meetup-join/meeting-test/0?context=abc'
const event = () => ({
    id: 'event-one', onlineMeeting: { joinUrl }, subject: input.subject,
    start: { dateTime: '2026-10-25T09:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-10-25T10:00:00.0000000', timeZone: 'UTC' },
    attendees: [{ emailAddress: { address: 'student@example.com' } }],
    hideAttendees: true, allowNewTimeProposals: false,
    body: { contentType: 'HTML', content: '<p>Teams original meeting blob</p>' },
    singleValueExtendedProperties: [{ id: ACADEMY_SESSION_PROPERTY, value: teamsSessionTransactionId(input) }],
})

describe('Recovery before Teams provisions the join URL', () => {
    it('recovers an orphan event ID for cancellation without requiring onlineMeeting', async () => {
        const { client, calls } = graph([{ value: [{ id:'orphan-event',onlineMeeting:null }] }])
        expect(await recoverTeamsCalendarEventId(input,client)).toEqual({eventId:'orphan-event'})
        expect(calls).toHaveLength(1)
    })
    it('does not send a redundant body update because Graph lowercases contentType', async () => {
        const raw={...event(),body:{contentType:'html',content:'<!-- compass-academy:start --><div>Description</div><!-- compass-academy:end -->'}}
        const {client,calls}=graph([raw])
        await updateTeamsCalendarEvent({...input,eventId:raw.id,descriptionText:'Description'},client)
        expect(calls).toHaveLength(1)
    })
})

function graph(responses: Array<unknown | Error>) {
    const calls: Array<{ path: string; method: string; body?: unknown }> = []
    const consume = async (path: string, method: string, body?: unknown) => {
        calls.push({ path, method, body })
        if (!responses.length) throw new Error('unexpected_graph_call')
        const next = responses.shift()
        if (next instanceof Error) throw next
        return next
    }
    const client: GraphLike = {
        api(path) {
            return {
                get: () => consume(path, 'GET'), post: body => consume(path, 'POST', body),
                patch: body => consume(path, 'PATCH', body), delete: () => consume(path, 'DELETE'),
                select: () => ({ get: () => consume(path, 'GET') }),
                responseType: () => ({ get: () => consume(path, 'GET') }),
            }
        },
    }
    return { client, calls }
}

describe('Teams URLs', () => {
    it.each([joinUrl, 'https://teams.microsoft.com/meet/123456?p=secret', 'https://teams.live.com/meet/123456?p=secret'])('accepts a Teams meeting URL: %s', value => {
        expect(validateTeamsJoinUrl(value)).toBe(value)
    })
    it.each([
        'http://teams.microsoft.com/meet/123', 'https://teams.microsoft.com.evil.test/meet/123',
        'https://teams.microsoft.com@evil.test/meet/123', 'https://user@teams.microsoft.com/meet/123',
        'https://teams.microsoft.com:444/meet/123', 'https://teams.microsoft.com/meet/123evil',
        'https://teams.microsoft.com/anything', 'https://teams.microsoft.com/meet/123#token',
        'https://teams.microsoft.com\\@evil.test/meet/123', 'https://teams.microsoft.com/meet/123\n',
    ])('rejects a misleading or unsupported URL: %s', value => {
        expect(() => validateTeamsJoinUrl(value)).toThrow(AcademyIntegrationError)
    })
})

describe('calendar-backed Teams adapter', () => {
    it('creates once with a stable transaction ID, private attendee list, UTC and recovery marker', async () => {
        const stub = graph([{ value: [] }, event()])
        const result = await createTeamsCalendarEvent({ ...input, attendees: [...input.attendees, { email: 'STUDENT@example.com' }] }, stub.client)
        expect(result).toMatchObject({ eventId: 'event-one', joinUrl, organizerId: organizer.userId })
        expect(stub.calls[1].body).toMatchObject({
            transactionId: teamsSessionTransactionId(input), isOnlineMeeting: true,
            onlineMeetingProvider: 'teamsForBusiness', hideAttendees: true,
            start: { dateTime: '2026-10-25T09:00:00.000Z', timeZone: 'UTC' },
        })
        expect((stub.calls[1].body as { attendees: unknown[] }).attendees).toHaveLength(1)
        expect(teamsSessionTransactionId({ ...input, organizer: { ...organizer, tenantId: organizer.tenantId.toUpperCase() } })).toBe(result.transactionId)
    })

    it('recovers a POST that succeeded remotely before a network timeout without a second invite', async () => {
        const timeout = Object.assign(new Error('sensitive details'), { name: 'GraphTimeoutError' })
        const stub = graph([{ value: [] }, timeout, { value: [event()] }, event()])
        expect((await createTeamsCalendarEvent(input, stub.client)).eventId).toBe('event-one')
        expect(stub.calls.filter(call => call.method === 'POST')).toHaveLength(1)
        expect(stub.calls.filter(call => call.method === 'PATCH')).toHaveLength(0)
    })

    it('does not turn an unexplained 409 into success', async () => {
        const stub = graph([{ value: [] }, Object.assign(new Error('conflict'), { statusCode: 409 }), { value: [] }])
        await expect(createTeamsCalendarEvent(input, stub.client)).rejects.toMatchObject({ code: 'conflict', retryable: true })
    })

    it('updates the recovered event if the requested session changed after the first POST', async () => {
        const stub = graph([{ value: [event()] }, event(), { ...event(), subject: 'Nowy temat' }])
        await createTeamsCalendarEvent({ ...input, subject: 'Nowy temat' }, stub.client)
        expect(stub.calls.find(call => call.method === 'PATCH')?.body).toEqual({ subject: 'Nowy temat' })
        expect(stub.calls.some(call => call.method === 'POST')).toBe(false)
    })

    it('preserves the Teams meeting blob and escapes user text during description updates', async () => {
        const stub = graph([event(), event()])
        await updateTeamsCalendarEvent({ ...input, eventId: 'event-one', descriptionText: '<script>alert(1)</script>' }, stub.client)
        const body = (stub.calls[1].body as { body: { content: string } }).body.content
        expect(body).toContain('<p>Teams original meeting blob</p>')
        expect(body).toContain('&lt;script&gt;')
        expect(body).not.toContain('<script>')
    })

    it('sends attendee-only updates when only enrollment changed', async () => {
        const stub = graph([event(), event()])
        await updateTeamsCalendarEvent({ ...input, eventId: 'event-one', attendees: [] }, stub.client)
        expect(stub.calls[1].body).toEqual({ attendees: [] })
    })

    it('will not change or cancel an event belonging to another session', async () => {
        const foreign = { ...event(), singleValueExtendedProperties: [] }
        await expect(updateTeamsCalendarEvent({ ...input, eventId: 'event-one' }, graph([foreign]).client)).rejects.toMatchObject({ code: 'conflict', retryable: false })
        const cancel = graph([foreign])
        await expect(cancelTeamsCalendarEvent({ ...input, eventId: 'event-one' }, cancel.client)).rejects.toMatchObject({ code: 'conflict' })
        expect(cancel.calls.some(call => call.method === 'POST')).toBe(false)
    })

    it('cancels through organizer action and handles retry after the event is gone', async () => {
        const stub = graph([event(), undefined])
        await cancelTeamsCalendarEvent({ ...input, eventId: 'event-one' }, stub.client)
        expect(stub.calls[1].path).toContain('/events/event-one/cancel')
        expect(stub.calls[1].method).toBe('POST')
        await expect(cancelTeamsCalendarEvent({ ...input, eventId: 'event-one' }, graph([Object.assign(new Error(), { statusCode: 404 })]).client)).resolves.toBeUndefined()
    })

    it('does not accept an arbitrary continuation URL from Graph', async () => {
        const stub = graph([{ value: [], '@odata.nextLink': 'https://evil.test/steal' }])
        await expect(findTeamsOnlineMeeting({ organizerId: organizer.userId, joinUrl }, stub.client)).rejects.toMatchObject({ code: 'invalid_response', retryable: false })
        expect(stub.calls).toHaveLength(1)
    })

    it('follows bounded report pages and explicitly retrieves attendance records', async () => {
        const base = `/users/${organizer.userId}/onlineMeetings/meeting-one/attendanceReports`
        const report = { id: 'report-one', meetingStartDateTime: input.startDateTime, meetingEndDateTime: input.endDateTime }
        const stub = graph([
            { value: [report], '@odata.nextLink': `https://graph.microsoft.com/v1.0${base}?$skiptoken=next` },
            { value: [] },
            { value: [{ identity: { id: 'identity', tenantId: organizer.tenantId }, emailAddress: 'student@example.com', attendanceIntervals: [{ joinDateTime: input.startDateTime, leaveDateTime: input.endDateTime }] }] },
        ])
        const result = await fetchTeamsAttendance({ organizerId: organizer.userId, onlineMeetingId: 'meeting-one' }, stub.client)
        expect(result[0].records[0].intervals).toEqual([{ start: input.startDateTime, end: input.endDateTime }])
        expect(stub.calls[2].path).toBe(`${base}/report-one/attendanceRecords`)
    })

    it('fails before Graph for naive DST-sensitive times', async () => {
        const stub = graph([])
        await expect(createTeamsCalendarEvent({ ...input, startDateTime: '2026-10-25T02:30:00' }, stub.client)).rejects.toMatchObject({ code: 'invalid_input' })
        expect(stub.calls).toHaveLength(0)
    })

    it('classifies permission errors and preserves Retry-After without leaking messages', () => {
        const forbidden = classifyAcademyIntegrationError(Object.assign(new Error('secret URL'), { statusCode: 403 }))
        expect(forbidden).toMatchObject({ code: 'forbidden', retryable: false })
        expect(forbidden.message).not.toContain('secret')
        const throttled = classifyAcademyIntegrationError(Object.assign(new Error(), { statusCode: 429, headers: new Headers({ 'Retry-After': '180' }) }))
        expect(throttled).toMatchObject({ code: 'throttled', retryable: true, retryAfterMs: 180_000 })
    })
})

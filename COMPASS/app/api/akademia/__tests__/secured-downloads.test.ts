// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    client: vi.fn(), pdf: vi.fn(), filename: vi.fn(), log: vi.fn(), policies: [] as unknown[],
    userId: '10000000-0000-4000-8000-000000000001',
}))
vi.mock('@/lib/api/with-auth', () => ({
    withAuth: (handler: (request: NextRequest, context: { user: { id: string } }) => Promise<Response>, policy: unknown) => {
        mocks.policies.push(policy)
        return (request: NextRequest) => handler(request, { user: { id: mocks.userId } })
    },
}))
vi.mock('@/lib/academy/server', () => ({ academyClient: mocks.client }))
vi.mock('@/lib/pdf/certificate', () => ({ generateCertificatePdf: mocks.pdf, certificateFilename: mocks.filename }))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.log } }))

import { GET as attachment } from '../attachment/route'
import { GET as certificate } from '../certificate/route'

const lessonId = '20000000-0000-4000-8000-000000000001'
const runId = '20000000-0000-4000-8000-000000000002'
const assetId = '30000000-0000-4000-8000-000000000001'
const otherAsset = '30000000-0000-4000-8000-000000000002'
const courseId = '40000000-0000-4000-8000-000000000001'
const enrollmentId = '50000000-0000-4000-8000-000000000001'
const storagePath = `${courseId}/${assetId}/material.pdf`
const signedUrl = 'https://storage.example.test/private/material.pdf?token=short-lived-test'
type Result = { data: unknown; error: { message: string } | null }
type Read = { table: string; columns: string; filters: [string, string, unknown][] }
let queued: Record<string, Result[]>
let reads: Read[]
const mutation = vi.fn(() => { throw new Error('GET must never mutate Academy data') })
const sign = vi.fn()
const storageBucket = vi.fn()
const from = vi.fn()

function result(table: string, data: unknown, error: Result['error'] = null) {
    (queued[table] ??= []).push({ data, error })
}
function request(path: string, query: Record<string, string | undefined>) {
    const entries = Object.entries(query).filter((item): item is [string, string] => typeof item[1] === 'string')
    return new NextRequest(`https://compass.example.test/api/akademia/${path}?${new URLSearchParams(entries)}`)
}
function readyAsset(overrides: Record<string, unknown> = {}) {
    return { id: assetId, filename: 'material.pdf', storage_path: storagePath, status: 'ready', mime_type: 'application/pdf', size_bytes: 120, ...overrides }
}
function lessonReference(overrides: Record<string, unknown> = {}) {
    return { attachments: [{ asset_id: assetId, name: 'material.pdf', storage_path: storagePath, ...overrides }] }
}
function completion(overrides: Record<string, unknown> = {}) {
    return { id: assetId, revoked_at: null, certificate_snapshot: {
        course_title: 'Historyczny program v2', participant_name: 'Uczestniczka z dnia ukończenia', author_name: 'Autor historyczny',
        completed_at: '2026-09-10T12:30:00.000Z', certificate_hash: '0123456789abcdef'.repeat(4), version_number: 2,
        ...overrides,
    } }
}

beforeEach(() => {
    queued = {}; reads = []
    mutation.mockClear()
    sign.mockReset().mockResolvedValue({ data: { signedUrl }, error: null })
    storageBucket.mockReset().mockReturnValue({ createSignedUrl: sign })
    from.mockReset().mockImplementation((table: string) => {
        const read: Read = { table, columns: '', filters: [] }
        reads.push(read)
        const query = {
            select: (columns: string) => { read.columns = columns; return query },
            eq: (column: string, value: unknown) => { read.filters.push(['eq', column, value]); return query },
            is: (column: string, value: unknown) => { read.filters.push(['is', column, value]); return query },
            maybeSingle: async () => {
                const next = queued[table]?.shift()
                if (!next) throw new Error(`Unexpected database read: ${table}`)
                return next
            },
            insert: mutation, update: mutation, upsert: mutation, delete: mutation,
        }
        return query
    })
    mocks.client.mockReset().mockReturnValue({ from, rpc: mutation, storage: { from: storageBucket } })
    mocks.pdf.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]))
    mocks.filename.mockReset().mockReturnValue('Certyfikat_historyczny.pdf')
    mocks.log.mockClear()
})
afterEach(() => { expect(mutation).not.toHaveBeenCalled() })

describe('Academy authenticated download boundary', () => {
    it('keeps both routes behind the consultant/admin authentication policy', () => {
        expect(mocks.policies).toHaveLength(2)
        for (const policy of mocks.policies) expect(policy).toEqual({ role: ['consultant', 'admin'] })
    })

    it.each([
        {}, { lessonId: 'broken', assetId }, { runId: 'broken', assetId },
        { lessonId, runId, assetId }, { lessonId, assetId: 'broken' }, { lessonId }, { runId, path: storagePath },
    ])('rejects ambiguous or invalid identifiers before database access: %j', async query => {
        const response = await attachment(request('attachment', query))
        expect(response.status).toBe(400)
        expect(mocks.client).not.toHaveBeenCalled()
        expect(sign).not.toHaveBeenCalled()
    })

    it.each([null, { message: 'RLS denied: private database detail' }])('does not sign when the exact lesson is hidden by RLS or the read fails', async error => {
        result('course_lessons', null, error)
        expect((await attachment(request('attachment', { lessonId, assetId }))).status).toBe(404)
        expect(reads).toEqual([{ table: 'course_lessons', columns: 'attachments', filters: [['eq', 'id', lessonId]] }])
        expect(sign).not.toHaveBeenCalled()
    })

    it('does not use an otherwise valid asset unless this lesson references its exact ID', async () => {
        result('course_lessons', lessonReference({ asset_id: otherAsset }))
        expect((await attachment(request('attachment', { lessonId, assetId }))).status).toBe(404)
        expect(reads).toHaveLength(1)
        expect(sign).not.toHaveBeenCalled()
    })

    it.each(['hidden', 'quarantined', 'path-mismatch'])('requires the referenced asset to remain visible, ready and on the exact stored path (%s)', async state => {
        result('course_lessons', lessonReference())
        result('academy_material_catalog', state === 'hidden' ? null : readyAsset(state === 'quarantined' ? { status: 'quarantined' } : { storage_path: 'other/private.pdf' }))
        expect((await attachment(request('attachment', { lessonId, assetId }))).status).toBe(404)
        expect(reads[1].filters).toEqual([['eq', 'id', assetId]])
        expect(sign).not.toHaveBeenCalled()
    })

    it('signs only the resolved lesson reference and returns a private, short-lived JSON URL', async () => {
        result('course_lessons', lessonReference())
        result('academy_material_catalog', readyAsset())
        const response = await attachment(request('attachment', { lessonId, assetId, path: 'forged/path.pdf', format: 'json' }))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ url: signedUrl, expiresIn: 300 })
        expect(storageBucket).toHaveBeenCalledWith('academy-materials')
        expect(sign).toHaveBeenCalledExactlyOnceWith(storagePath, 300)
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    })

    it('binds an edition attachment to both asset and run, and keeps the RLS approval boundary', async () => {
        // RLS hides an unpublished review, a cancelled registration, or another run's material.
        result('academy_material_catalog', null)
        const response = await attachment(request('attachment', { runId, assetId }))
        expect(response.status).toBe(404)
        expect(reads[0].filters).toEqual([['eq', 'id', assetId], ['eq', 'run_id', runId]])
        expect(sign).not.toHaveBeenCalled()
    })

    it('allows an RLS-authorized staff preview and an approved participant download only after a ready scan', async () => {
        result('academy_material_catalog', readyAsset())
        result('academy_material_catalog', readyAsset())
        const response = await attachment(request('attachment', { runId, assetId }))
        expect(response.status).toBe(303)
        expect(response.headers.get('location')).toBe(signedUrl)
        expect(sign).toHaveBeenCalledExactlyOnceWith(storagePath, 300)
        expect(storageBucket).toHaveBeenCalledWith('academy-materials')
    })

    it('does not let staff preview an edition asset that is still scanning', async () => {
        result('academy_material_catalog', readyAsset({ status: 'scanning' }))
        expect((await attachment(request('attachment', { runId, assetId }))).status).toBe(404)
        expect(sign).not.toHaveBeenCalled()
    })

    it('requires an exact legacy reference and uses the legacy bucket only for that path', async () => {
        const legacyPath = 'courses/old-course/original.pdf'
        result('course_lessons', { attachments: [{ storage_path: legacyPath, name: 'original.pdf' }] })
        const response = await attachment(request('attachment', { lessonId, path: legacyPath }))
        expect(response.status).toBe(303)
        expect(storageBucket).toHaveBeenCalledWith('documents')
        expect(sign).toHaveBeenCalledExactlyOnceWith(legacyPath, 300)
    })

    it.each(['courses/other-course/private.pdf', 'employee/private.pdf'])('never signs an arbitrary legacy URL path: %s', async path => {
        result('course_lessons', { attachments: [{ storage_path: path.startsWith('employee') ? path : 'courses/original.pdf', name: 'original.pdf' }] })
        expect((await attachment(request('attachment', { lessonId, path }))).status).toBe(404)
        expect(sign).not.toHaveBeenCalled()
    })

    it('does not allow a modern asset reference to be requested through the legacy path branch', async () => {
        result('course_lessons', lessonReference())
        expect((await attachment(request('attachment', { lessonId, path: storagePath }))).status).toBe(404)
        expect(sign).not.toHaveBeenCalled()
    })

    it('returns no usable URL when Storage refuses signing after successful RLS reads', async () => {
        result('course_lessons', lessonReference()); result('academy_material_catalog', readyAsset())
        sign.mockResolvedValue({ data: null, error: { message: 'secret storage detail' } })
        const response = await attachment(request('attachment', { lessonId, assetId }))
        expect(response.status).toBe(503)
        expect(response.headers.has('location')).toBe(false)
        expect(await response.text()).not.toContain('secret storage detail')
    })
})

describe('Academy certificate evidence', () => {
    it('returns 410 and never regenerates an invalidated historical certificate', async () => {
        result('course_enrollments', { id: enrollmentId })
        result('course_completions', { ...completion(), revoked_at: '2026-09-22T12:00:00Z', revoked_reason: 'Błędny zapis obecności.' })
        const response = await certificate(request('certificate', { courseId, enrollmentId }))
        expect(response.status).toBe(410)
        expect(await response.text()).toContain('Błędny zapis obecności.')
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(mocks.pdf).not.toHaveBeenCalled()
    })
    it.each([{}, { courseId: 'broken' }, { courseId, enrollmentId: 'broken' }])('validates course and enrollment UUIDs before any query: %j', async query => {
        expect((await certificate(request('certificate', query))).status).toBe(400)
        expect(mocks.client).not.toHaveBeenCalled()
        expect(mocks.pdf).not.toHaveBeenCalled()
    })

    it('selects only the caller’s exact course enrollment and never substitutes another edition', async () => {
        result('course_enrollments', null)
        expect((await certificate(request('certificate', { courseId, enrollmentId }))).status).toBe(404)
        expect(reads[0].filters).toEqual([['eq', 'user_id', mocks.userId], ['eq', 'course_id', courseId], ['eq', 'id', enrollmentId]])
        expect(reads).toHaveLength(1)
        expect(mocks.pdf).not.toHaveBeenCalled()
    })

    it('uses only the self-paced enrollment when no edition enrollment is explicitly requested', async () => {
        result('course_enrollments', null)
        expect((await certificate(request('certificate', { courseId }))).status).toBe(404)
        expect(reads[0].filters).toContainEqual(['is', 'run_id', null])
        expect(mocks.pdf).not.toHaveBeenCalled()
    })

    it.each([null, { message: 'private completion permission error' }])('does not invent completion evidence or mutate an enrollment to issue a certificate', async error => {
        result('course_enrollments', { id: enrollmentId, completed_at: '2026-09-10T12:30:00Z' })
        result('course_completions', null, error)
        const response = await certificate(request('certificate', { courseId, enrollmentId }))
        expect(response.status).toBe(404)
        expect(reads[1].filters).toEqual([['eq', 'enrollment_id', enrollmentId], ['eq', 'course_id', courseId], ['eq', 'user_id', mocks.userId]])
        expect(mocks.pdf).not.toHaveBeenCalled()
    })

    it.each([
        null, {}, { course_title: '' }, { certificate_hash: 'short' }, { completed_at: 'not-a-date' }, { version_number: 0 },
    ])('fails closed for an invalid persisted snapshot: %j', async invalid => {
        result('course_enrollments', { id: enrollmentId })
        result('course_completions', invalid === null || Object.keys(invalid).length === 0 ? { certificate_snapshot: invalid } : completion(invalid))
        expect((await certificate(request('certificate', { courseId, enrollmentId }))).status).toBe(500)
        expect(mocks.pdf).not.toHaveBeenCalled()
        expect(mocks.log).toHaveBeenCalledExactlyOnceWith({ event: 'academy.certificate.invalid_snapshot', enrollmentId })
    })

    it('renders exclusively the historical completion snapshot and emits private PDF headers', async () => {
        result('course_enrollments', { id: enrollmentId })
        result('course_completions', completion())
        const response = await certificate(request('certificate', { courseId, enrollmentId }))
        expect(response.status).toBe(200)
        expect(mocks.pdf).toHaveBeenCalledExactlyOnceWith({
            fullName: 'Uczestniczka z dnia ukończenia', courseTitle: 'Historyczny program v2', courseAuthorName: 'Autor historyczny',
            completedAt: '2026-09-10T12:30:00.000Z', certificateHash: '0123456789abcdef'.repeat(4), versionNumber: 2,
            verificationUrl: `https://compass.example.test/learning/certyfikaty/${assetId}`,
        })
        expect(reads.map(read => read.table)).toEqual(['course_enrollments', 'course_completions'])
        expect(response.headers.get('content-type')).toBe('application/pdf')
        expect(response.headers.get('content-disposition')).toBe('attachment; filename="Certyfikat_historyczny.pdf"')
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(response.headers.get('x-content-type-options')).toBe('nosniff')
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]))
        expect(sign).not.toHaveBeenCalled()
    })
})

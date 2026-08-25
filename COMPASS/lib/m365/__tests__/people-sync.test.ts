import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockGetGraphClient = vi.fn()
const mockStorageUpload = vi.fn()
const mockStorageGetPublicUrl = vi.fn()
const mockProfilesUpdate = vi.fn()
const mockProfilesEq = vi.fn()
const mockProfilesSelectMaybeSingle = vi.fn()

vi.mock('@/lib/graph/client', () => ({
    getGraphClient: () => mockGetGraphClient(),
    extractGraphErrorInfo: (err: unknown) => {
        if (typeof err === 'object' && err !== null && 'statusCode' in err) {
            const sc = (err as { statusCode?: unknown }).statusCode
            return typeof sc === 'number' ? { statusCode: sc } : {}
        }
        return {}
    },
}))

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({
        storage: {
            from: () => ({
                upload: (...args: unknown[]) => mockStorageUpload(...args),
                getPublicUrl: (...args: unknown[]) => mockStorageGetPublicUrl(...args),
            }),
        },
        from: (table: string) => {
            if (table !== 'profiles') throw new Error(`Unexpected table: ${table}`)
            return {
                update: (...args: unknown[]) => {
                    mockProfilesUpdate(...args)
                    return { eq: (...eqArgs: unknown[]) => mockProfilesEq(...eqArgs) }
                },
                select: (_cols: string) => ({
                    eq: (_col: string, _val: string) => ({
                        maybeSingle: () => mockProfilesSelectMaybeSingle(),
                    }),
                }),
            }
        },
    }),
}))

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface GraphCall {
    path: string
    method: 'get'
    select?: string
    responseType?: string
}

/**
 * Build a Graph SDK stub that records every call and returns canned responses
 * keyed by URL fragment. Each response can be a value or an Error/object with
 * `statusCode` to simulate Graph error shapes.
 */
interface PhotoRoutes {
    user?: unknown
    manager?: unknown
    photoMeta?: unknown
    photoBinary?: unknown
}

function makeGraphStub(routes: PhotoRoutes) {
    const calls: GraphCall[] = []

    function resolve(path: string): unknown {
        if (path.endsWith('/photo/$value')) return routes.photoBinary
        if (path.endsWith('/photo')) return routes.photoMeta
        if (path.endsWith('/manager')) return routes.manager
        return routes.user
    }

    function makeRequest(path: string) {
        const record: GraphCall = { path, method: 'get' }
        const exec = async (kind: 'get') => {
            calls.push({ ...record, method: kind })
            const value = resolve(path)
            if (value === undefined) throw new Error(`Unmocked Graph path: ${path}`)
            const resolved = typeof value === 'function' ? (value as () => unknown)() : value
            if (resolved instanceof Error || (typeof resolved === 'object' && resolved !== null && 'statusCode' in resolved)) {
                throw resolved
            }
            return resolved
        }
        return {
            get: () => exec('get'),
            select: (props: string) => {
                record.select = props
                return { get: () => exec('get') }
            },
            responseType: (type: string) => {
                record.responseType = type
                return { get: () => exec('get') }
            },
            post: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
        }
    }

    const client = { api: (path: string) => makeRequest(path) }
    return { client, calls }
}

beforeEach(() => {
    process.env.AZURE_TENANT_ID = 'tenant'
    process.env.AZURE_CLIENT_ID = 'client'
    process.env.AZURE_CLIENT_SECRET = 'secret'
    mockGetGraphClient.mockReset()
    mockStorageUpload.mockReset().mockResolvedValue({ data: { path: 'm365/u.jpg' }, error: null })
    mockStorageGetPublicUrl.mockReset().mockReturnValue({
        data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/avatars/m365/u.jpg' },
    })
    mockProfilesUpdate.mockReset()
    mockProfilesEq.mockReset().mockResolvedValue({ error: null })
    // Default: no manual avatar source set → m365 sync is allowed to write.
    mockProfilesSelectMaybeSingle.mockReset().mockResolvedValue({ data: { avatar_source: null }, error: null })
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('syncProfileFromGraph — photo sync (PR4 v2)', () => {
    it('downloads photo, uploads to storage, returns avatar_url with cache-busted suffix', async () => {
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')
        const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).buffer // JPEG magic
        const { client } = makeGraphStub({
            user: { jobTitle: 'Dev', department: 'IT', mobilePhone: '+48 123', businessPhones: [] },
            manager: { mail: 'boss@b2bnetwork.pl' },
            photoMeta: { '@odata.mediaContentType': 'image/jpeg', width: 240, height: 240 },
            photoBinary: photoBytes,
        })
        mockGetGraphClient.mockResolvedValue(client)

        const result = await syncProfileFromGraph('user-1', 'alice@b2bnetwork.pl')

        expect(result.success).toBe(true)
        expect(result.fields?.avatar_url).toMatch(
            /^https:\/\/test\.supabase\.co\/storage\/v1\/object\/public\/avatars\/m365\/u\.jpg\?v=[0-9a-f]{12}$/,
        )
        expect(mockStorageUpload).toHaveBeenCalledWith(
            'm365/user-1.jpg',
            expect.any(Buffer),
            { contentType: 'image/jpeg', upsert: true },
        )
        // Profile UPDATE includes avatar_url AND avatar_source='m365' alongside the other fields.
        expect(mockProfilesUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                avatar_url: expect.stringContaining('?v='),
                avatar_source: 'm365',
                job_title: 'Dev',
                department: 'IT',
                manager_email: 'boss@b2bnetwork.pl',
            }),
        )
    })

    it('uses contentType from mediaContentType for PNG photos', async () => {
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')
        const photoBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer // PNG magic
        const { client } = makeGraphStub({
            user: { jobTitle: null, department: null, mobilePhone: null, businessPhones: null },
            manager: { statusCode: 404 },
            photoMeta: { '@odata.mediaContentType': 'image/png' },
            photoBinary: photoBytes,
        })
        mockGetGraphClient.mockResolvedValue(client)

        await syncProfileFromGraph('user-2', 'bob@b2bnetwork.pl')

        expect(mockStorageUpload).toHaveBeenCalledWith(
            'm365/user-2.jpg',
            expect.any(Buffer),
            { contentType: 'image/png', upsert: true },
        )
    })

    it('skips photo gracefully on 404 metadata (no photo uploaded in Azure)', async () => {
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')
        const { client } = makeGraphStub({
            user: { jobTitle: 'PM' },
            manager: { mail: 'boss@b2bnetwork.pl' },
            photoMeta: { statusCode: 404 },
        })
        mockGetGraphClient.mockResolvedValue(client)

        const result = await syncProfileFromGraph('user-3', 'noavatar@b2bnetwork.pl')

        expect(result.success).toBe(true)
        expect(result.fields?.avatar_url).toBeUndefined()
        expect(result.fields?.job_title).toBe('PM')
        expect(mockStorageUpload).not.toHaveBeenCalled()
        // Other fields still flushed to DB despite missing photo.
        expect(mockProfilesUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ job_title: 'PM' }),
        )
    })

    it('skips photo gracefully on 404 binary download', async () => {
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')
        const { client } = makeGraphStub({
            user: { jobTitle: 'CTO' },
            manager: { statusCode: 404 },
            photoMeta: { '@odata.mediaContentType': 'image/jpeg' },
            photoBinary: { statusCode: 404 },
        })
        mockGetGraphClient.mockResolvedValue(client)

        const result = await syncProfileFromGraph('user-4', 'cto@b2bnetwork.pl')

        expect(result.success).toBe(true)
        expect(result.fields?.avatar_url).toBeUndefined()
        expect(mockStorageUpload).not.toHaveBeenCalled()
    })

    it('continues sync when storage upload fails (avatar_url omitted, other fields persisted)', async () => {
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')
        mockStorageUpload.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
        const photoBytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer
        const { client } = makeGraphStub({
            user: { jobTitle: 'Dev', department: 'IT' },
            manager: { mail: 'boss@b2bnetwork.pl' },
            photoMeta: { '@odata.mediaContentType': 'image/jpeg' },
            photoBinary: photoBytes,
        })
        mockGetGraphClient.mockResolvedValue(client)

        const result = await syncProfileFromGraph('user-5', 'dev@b2bnetwork.pl')

        expect(result.success).toBe(true)
        expect(result.fields?.avatar_url).toBeUndefined()
        expect(result.fields?.job_title).toBe('Dev')
    })

    it('rejects photos over the 4MB defensive ceiling', async () => {
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')
        const oversized = new ArrayBuffer(5 * 1024 * 1024)
        const { client } = makeGraphStub({
            user: { jobTitle: 'Dev' },
            manager: { statusCode: 404 },
            photoMeta: { '@odata.mediaContentType': 'image/jpeg' },
            photoBinary: oversized,
        })
        mockGetGraphClient.mockResolvedValue(client)

        const result = await syncProfileFromGraph('user-6', 'big@b2bnetwork.pl')

        expect(result.success).toBe(true)
        expect(result.fields?.avatar_url).toBeUndefined()
        expect(mockStorageUpload).not.toHaveBeenCalled()
    })

    it('respects manual avatar_source — skips Graph photo calls and never writes avatar_url', async () => {
        mockProfilesSelectMaybeSingle.mockResolvedValue({ data: { avatar_source: 'manual' }, error: null })
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')

        // photoMeta/photoBinary are deliberately set to error responses to assert
        // that we never reach them when avatar_source='manual'.
        const photoMeta = vi.fn(() => ({ statusCode: 500 }))
        const photoBinary = vi.fn(() => ({ statusCode: 500 }))
        const { client } = makeGraphStub({
            user: { jobTitle: 'Dev', department: 'IT' },
            manager: { mail: 'boss@b2bnetwork.pl' },
            photoMeta,
            photoBinary,
        })
        mockGetGraphClient.mockResolvedValue(client)

        const result = await syncProfileFromGraph('user-manual', 'manual@b2bnetwork.pl')

        expect(result.success).toBe(true)
        expect(result.fields?.avatar_url).toBeUndefined()
        expect(result.fields?.avatar_source).toBeUndefined()
        expect(photoMeta).not.toHaveBeenCalled()
        expect(photoBinary).not.toHaveBeenCalled()
        expect(mockStorageUpload).not.toHaveBeenCalled()
        // Other fields still flushed normally — only photo is protected.
        expect(mockProfilesUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ job_title: 'Dev', manager_email: 'boss@b2bnetwork.pl' }),
        )
    })

    it('refreshes photo when existing avatar_source is m365 (sync-managed avatars stay in sync)', async () => {
        mockProfilesSelectMaybeSingle.mockResolvedValue({ data: { avatar_source: 'm365' }, error: null })
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')

        const photoBytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer
        const { client } = makeGraphStub({
            user: { jobTitle: 'Dev' },
            manager: { statusCode: 404 },
            photoMeta: { '@odata.mediaContentType': 'image/jpeg' },
            photoBinary: photoBytes,
        })
        mockGetGraphClient.mockResolvedValue(client)

        const result = await syncProfileFromGraph('user-m365', 'me@b2bnetwork.pl')

        expect(result.fields?.avatar_url).toMatch(/\?v=[0-9a-f]{12}$/)
        expect(result.fields?.avatar_source).toBe('m365')
        expect(mockStorageUpload).toHaveBeenCalledTimes(1)
    })

    it('continues sync when avatar_source lookup fails (treats as unknown → allows m365 write)', async () => {
        mockProfilesSelectMaybeSingle.mockResolvedValue({ data: null, error: { message: 'connection lost' } })
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')

        const photoBytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer
        const { client } = makeGraphStub({
            user: { jobTitle: 'Dev' },
            manager: { statusCode: 404 },
            photoMeta: { '@odata.mediaContentType': 'image/jpeg' },
            photoBinary: photoBytes,
        })
        mockGetGraphClient.mockResolvedValue(client)

        const result = await syncProfileFromGraph('user-x', 'x@b2bnetwork.pl')

        expect(result.success).toBe(true)
        expect(result.fields?.avatar_url).toBeDefined()
        expect(result.fields?.avatar_source).toBe('m365')
    })

    it('produces the same cache-bust suffix for identical photo bytes', async () => {
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer
        const stubA = makeGraphStub({
            user: { jobTitle: 'A' },
            manager: { statusCode: 404 },
            photoMeta: { '@odata.mediaContentType': 'image/jpeg' },
            photoBinary: bytes.slice(0),
        })
        const stubB = makeGraphStub({
            user: { jobTitle: 'A' },
            manager: { statusCode: 404 },
            photoMeta: { '@odata.mediaContentType': 'image/jpeg' },
            photoBinary: bytes.slice(0),
        })

        mockGetGraphClient.mockResolvedValueOnce(stubA.client)
        const a = await syncProfileFromGraph('u', 'a@b2bnetwork.pl')

        mockGetGraphClient.mockResolvedValueOnce(stubB.client)
        const b = await syncProfileFromGraph('u', 'a@b2bnetwork.pl')

        expect(a.fields?.avatar_url).toBeDefined()
        expect(a.fields?.avatar_url).toBe(b.fields?.avatar_url)
    })
})

describe('syncProfileFromGraph — existing PR4 behavior preserved', () => {
    it('skips when Azure env vars are missing (no Graph call)', async () => {
        delete process.env.AZURE_TENANT_ID
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')

        const result = await syncProfileFromGraph('user-x', 'x@b2bnetwork.pl')

        expect(result).toEqual({ success: true, skipped: true })
        expect(mockGetGraphClient).not.toHaveBeenCalled()
    })

    it('returns user_not_found_in_tenant on user 404 without touching photo or storage', async () => {
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')
        const { client } = makeGraphStub({
            user: { statusCode: 404 },
        })
        mockGetGraphClient.mockResolvedValue(client)

        const result = await syncProfileFromGraph('user-7', 'ghost@b2bnetwork.pl')

        expect(result).toEqual({ success: false, error: 'user_not_found_in_tenant' })
        expect(mockStorageUpload).not.toHaveBeenCalled()
    })

    it('stempluje m365_synced_at przy 404, żeby konto nie blokowało slotu crona', async () => {
        // Audyt 2026-08: bez stempla profil zostawał na zawsze w koszyku
        // „nigdy nie synchronizowany" i przy KAŻDYM tygodniowym przebiegu zjadał
        // jeden z MAX_PER_RUN slotów. Stempel = ponowimy za STALE_DAYS.
        const { syncProfileFromGraph } = await import('@/lib/m365/people-sync')
        const { client } = makeGraphStub({ user: { statusCode: 404 } })
        mockGetGraphClient.mockResolvedValue(client)

        await syncProfileFromGraph('user-7', 'ghost@b2bnetwork.pl')

        expect(mockProfilesUpdate).toHaveBeenCalledTimes(1)
        const payload = mockProfilesUpdate.mock.calls[0][0] as Record<string, unknown>
        expect(Object.keys(payload)).toEqual(['m365_synced_at'])
        expect(typeof payload.m365_synced_at).toBe('string')
        expect(mockProfilesEq).toHaveBeenCalledWith('id', 'user-7')
    })
})

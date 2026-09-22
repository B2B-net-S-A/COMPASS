import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadAcademyFile } from '../resumable-upload'

const endpoint = 'https://project.storage.supabase.co/storage/v1/upload/resumable/sign'
const uploadUrl = 'https://project.storage.supabase.co/storage/v1/upload/resumable/upload-1'
const assetId = '30000000-0000-4000-8000-000000000001'
const userId = '10000000-0000-4000-8000-000000000001'
const key = `academy-upload:${userId}:${assetId}`
const chunk = 6 * 1024 * 1024
const fetchMock = vi.fn<typeof fetch>()

function response(status: number, headers: Record<string, string> = {}) {
    return new Response(null, { status, headers })
}
function options(size = 20, controller = new AbortController()) {
    return {
        endpoint, file: new File([new Uint8Array(size)], 'recording.mp4', { type: 'video/mp4', lastModified: 1234 }),
        token: 'signed-upload-test-token', storagePath: 'course/asset/recording.mp4', assetId, userId,
        mimeType: 'video/mp4', signal: controller.signal, onProgress: vi.fn(),
    }
}
function headers(index: number) { return new Headers(fetchMock.mock.calls[index][1]?.headers) }

beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
    for (const [url, init] of fetchMock.mock.calls) {
        // A validated Location alone does not prevent the browser following a later redirect.
        expect(new URL(String(url)).origin).toBe(new URL(endpoint).origin)
        expect(init?.redirect).toBe('error')
        expect(new Headers(init?.headers).get('x-signature')).toBe('signed-upload-test-token')
    }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('Academy resumable upload transport', () => {
    it('streams fixed 6 MiB chunks with exact acknowledged offsets and scoped upload metadata', async () => {
        const input = options(2 * chunk + 3)
        fetchMock.mockResolvedValueOnce(response(201, { Location: './upload-1' }))
            .mockResolvedValueOnce(response(204, { 'Upload-Offset': String(chunk) }))
            .mockResolvedValueOnce(response(204, { 'Upload-Offset': String(2 * chunk) }))
            .mockResolvedValueOnce(response(204, { 'Upload-Offset': String(input.file.size) }))
        await uploadAcademyFile(input)
        expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'PATCH', 'PATCH', 'PATCH'])
        expect(fetchMock.mock.calls.slice(1).map(([url]) => url)).toEqual([uploadUrl, uploadUrl, uploadUrl])
        expect(fetchMock.mock.calls.slice(1).map(([, init]) => (init?.body as Blob).size)).toEqual([chunk, chunk, 3])
        expect([1, 2, 3].map(index => headers(index).get('Upload-Offset'))).toEqual(['0', String(chunk), String(2 * chunk)])
        expect(headers(0).get('Upload-Length')).toBe(String(input.file.size))
        const metadata = Object.fromEntries(headers(0).get('Upload-Metadata')!.split(',').map(part => {
            const [name, value] = part.split(' ')
            return [name, atob(value)]
        }))
        expect(metadata).toEqual({ bucketName: 'academy-materials', objectName: input.storagePath, contentType: 'video/mp4', cacheControl: '3600' })
        expect(headers(1).get('Content-Type')).toBe('application/offset+octet-stream')
        expect(input.onProgress).toHaveBeenLastCalledWith(100)
        expect(localStorage.getItem(key)).toBeNull()
    })

    it.each(['https://attacker.example/upload', '//attacker.example/upload'])('rejects foreign Location before sending the upload token or bytes there: %s', async location => {
        fetchMock.mockResolvedValue(response(201, { Location: location }))
        await expect(uploadAcademyFile(options())).rejects.toThrow('Nieprawidłowy adres')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(localStorage.getItem(key)).toBeNull()
    })

    it.each(['https://attacker.example/upload', '/not-an-absolute-url', 'https://project.storage.supabase.co.attacker.example/upload'])('discards untrusted cached URLs without contacting them: %s', async cached => {
        localStorage.setItem(key, cached)
        fetchMock.mockResolvedValueOnce(response(201, { Location: uploadUrl }))
            .mockResolvedValueOnce(response(204, { 'Upload-Offset': '20' }))
        await uploadAcademyFile(options())
        expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'PATCH'])
    })

    it('does not resume another user’s cached upload even when the asset ID is known', async () => {
        localStorage.setItem(`academy-upload:another-user:${assetId}`, uploadUrl)
        fetchMock.mockResolvedValueOnce(response(201, { Location: uploadUrl }))
            .mockResolvedValueOnce(response(204, { 'Upload-Offset': '20' }))
        await uploadAcademyFile(options())
        expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
        expect(localStorage.getItem(`academy-upload:another-user:${assetId}`)).toBe(uploadUrl)
    })

    it('resumes at the server-confirmed HEAD offset instead of retransmitting acknowledged bytes', async () => {
        localStorage.setItem(key, uploadUrl)
        fetchMock.mockResolvedValueOnce(response(200, { 'Upload-Offset': '7' }))
            .mockResolvedValueOnce(response(204, { 'Upload-Offset': '20' }))
        const input = options()
        await uploadAcademyFile(input)
        expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(['HEAD', 'PATCH'])
        expect(headers(1).get('Upload-Offset')).toBe('7')
        expect((fetchMock.mock.calls[1][1]?.body as Blob).size).toBe(13)
        expect(input.onProgress.mock.calls.map(call => call[0])).toEqual([35, 100])
    })

    it('lets the caller retry finalization when Storage already received the entire file', async () => {
        localStorage.setItem(key, uploadUrl)
        fetchMock.mockResolvedValueOnce(response(200, { 'Upload-Offset': '20' }))
        const input = options()
        await expect(uploadAcademyFile(input)).resolves.toBeUndefined()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0][1]?.method).toBe('HEAD')
        expect(input.onProgress).toHaveBeenCalledExactlyOnceWith(100)
        expect(localStorage.getItem(key)).toBeNull()
    })

    it.each([404, 410])('recreates only an expired or absent TUS upload after HEAD %s', async status => {
        localStorage.setItem(key, uploadUrl)
        fetchMock.mockResolvedValueOnce(response(status))
            .mockResolvedValueOnce(response(201, { Location: uploadUrl }))
            .mockResolvedValueOnce(response(204, { 'Upload-Offset': '20' }))
        await uploadAcademyFile(options())
        expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(['HEAD', 'POST', 'PATCH'])
    })

    it.each([401, 403, 429, 503])('preserves the upload and fails without creating another object after HEAD %s', async status => {
        localStorage.setItem(key, uploadUrl)
        fetchMock.mockResolvedValueOnce(response(status))
        await expect(uploadAcademyFile(options())).rejects.toThrow('Nie udało się wznowić')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(localStorage.getItem(key)).toBe(uploadUrl)
    })

    it.each([null, '', '-1', '21', 'NaN', '2.5', 'Infinity'])('rejects invalid HEAD progress before transmitting bytes: %s', async offset => {
        localStorage.setItem(key, uploadUrl)
        fetchMock.mockResolvedValueOnce(response(200, offset === null ? {} : { 'Upload-Offset': offset }))
        await expect(uploadAcademyFile(options())).rejects.toThrow()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(localStorage.getItem(key)).toBe(uploadUrl)
    })

    it.each([null, '0', '19', '21', 'not-a-number'])('keeps resumable state when PATCH does not acknowledge exactly the sent bytes: %s', async offset => {
        fetchMock.mockResolvedValueOnce(response(201, { Location: uploadUrl }))
            .mockResolvedValueOnce(response(204, offset === null ? {} : { 'Upload-Offset': offset }))
        await expect(uploadAcademyFile(options())).rejects.toThrow('Storage nie potwierdził')
        expect(localStorage.getItem(key)).toBe(uploadUrl)
    })

    it('keeps the session after abort and resumes from the acknowledged chunk with a new signal', async () => {
        const controller = new AbortController()
        const input = options(chunk + 20, controller)
        fetchMock.mockResolvedValueOnce(response(201, { Location: uploadUrl }))
            .mockResolvedValueOnce(response(204, { 'Upload-Offset': String(chunk) }))
            .mockImplementationOnce(async (_url, init) => {
                expect(init?.signal).toBe(controller.signal)
                controller.abort()
                throw new DOMException('User paused upload', 'AbortError')
            })
        await expect(uploadAcademyFile(input)).rejects.toMatchObject({ name: 'AbortError' })
        expect(localStorage.getItem(key)).toBe(uploadUrl)
        fetchMock.mockResolvedValueOnce(response(200, { 'Upload-Offset': String(chunk) }))
            .mockResolvedValueOnce(response(204, { 'Upload-Offset': String(chunk + 20) }))
        await uploadAcademyFile({ ...input, signal: new AbortController().signal })
        expect(fetchMock.mock.calls.slice(3).map(([, init]) => init?.method)).toEqual(['HEAD', 'PATCH'])
        expect((fetchMock.mock.calls[4][1]?.body as Blob).size).toBe(20)
        expect(localStorage.getItem(key)).toBeNull()
    })

    it('continues a fresh upload when the browser disables persistent storage', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
        fetchMock.mockResolvedValueOnce(response(201, { Location: uploadUrl }))
            .mockResolvedValueOnce(response(204, { 'Upload-Offset': '20' }))
        await expect(uploadAcademyFile(options())).resolves.toBeUndefined()
        expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'PATCH'])
    })
})

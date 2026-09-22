/** Minimal TUS transport: fixed 6 MB chunks, resumable across interrupted browser
 * sessions. Signed upload tokens are used only at the verified Storage origin. */
export async function uploadAcademyFile(options: {
    file: File; endpoint: string; token: string; storagePath: string; assetId: string; userId: string
    mimeType: string; signal: AbortSignal; onProgress: (percent: number) => void
}) {
    const { file, endpoint, token, signal } = options
    const origin = new URL(endpoint).origin
    const key = `academy-upload:${options.userId}:${options.assetId}`
    const headers = { 'Tus-Resumable': '1.0.0', 'x-signature': token }
    const remember = (url: string | null) => {
        try { if (url) localStorage.setItem(key, url); else localStorage.removeItem(key) } catch { /* Upload still works if persistent storage is unavailable. */ }
    }
    let uploadUrl: string | null = null
    try { uploadUrl = localStorage.getItem(key) } catch { /* Private browser policy may disable storage. */ }
    let offset = 0
    try {
        if (uploadUrl && new URL(uploadUrl).origin !== origin) { remember(null); uploadUrl = null }
    } catch { remember(null); uploadUrl = null }
    if (uploadUrl) {
        const response = await fetch(uploadUrl, { method: 'HEAD', headers, signal, redirect: 'error' })
        if (response.ok) {
            const observed = response.headers.get('Upload-Offset')
            if (observed === null || observed.trim() === '') throw new Error('Storage nie zwrócił postępu przesyłania.')
            offset = Number(observed)
        }
        else if (response.status === 404 || response.status === 410) uploadUrl = null
        else throw new Error('Nie udało się wznowić przesyłania. Spróbuj ponownie.')
    }
    if (!uploadUrl) {
        const encode = (value: string) => btoa(String.fromCharCode(...new TextEncoder().encode(value)))
        const response = await fetch(endpoint, {
            method: 'POST', signal, redirect: 'error',
            headers: { ...headers, 'Upload-Length': String(file.size), 'Upload-Metadata': `bucketName ${encode('academy-materials')},objectName ${encode(options.storagePath)},contentType ${encode(options.mimeType)},cacheControl ${encode('3600')}` },
        })
        if (!response.ok) throw new Error('Nie udało się rozpocząć przesyłania. Spróbuj ponownie.')
        const location = response.headers.get('Location')
        if (!location) throw new Error('Storage nie zwrócił adresu przesyłania.')
        const verified = new URL(location, endpoint)
        if (verified.origin !== origin) throw new Error('Nieprawidłowy adres przesyłania.')
        uploadUrl = verified.href
        remember(uploadUrl)
    }
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size) throw new Error('Nieprawidłowy postęp przesyłania.')
    options.onProgress(Math.round(offset / file.size * 100))
    while (offset < file.size) {
        const end = Math.min(offset + 6 * 1024 * 1024, file.size)
        const response = await fetch(uploadUrl, { method: 'PATCH', signal, redirect: 'error',
            headers: { ...headers, 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': String(offset) },
            body: file.slice(offset, end),
        })
        if (!response.ok) throw new Error('Przesyłanie przerwane. Wybierz plik ponownie, aby wznowić.')
        const received = Number(response.headers.get('Upload-Offset'))
        if (received !== end) throw new Error('Storage nie potwierdził całego fragmentu pliku. Wznów przesyłanie.')
        offset = received
        options.onProgress(Math.round(offset / file.size * 100))
    }
    remember(null)
}

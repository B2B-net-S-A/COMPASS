export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

export const CHAT_ATTACHMENT_EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
} as const

export type ChatAttachmentMime = keyof typeof CHAT_ATTACHMENT_EXTENSIONS

export type ChatAttachmentInput = {
    path: string
    name: string
    mime: ChatAttachmentMime
    size: number
}

const CHAT_ATTACHMENT_STORED_EXTENSIONS: Record<ChatAttachmentMime, readonly string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'application/pdf': ['pdf'],
    'text/plain': ['txt'],
}

export function safeAttachmentName(name: string): string {
    const base = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim() ?? ''
    if (!base) throw new Error('Nieprawidłowa nazwa pliku.')
    return base.slice(0, 255)
}

export function assertChatAttachment(
    attachment: ChatAttachmentInput,
    conversationId: string,
    userId: string,
): ChatAttachmentInput {
    const extension = CHAT_ATTACHMENT_EXTENSIONS[attachment.mime]
    if (!extension) throw new Error('Ten typ pliku nie jest dozwolony.')
    if (!Number.isInteger(attachment.size) || attachment.size < 1 || attachment.size > CHAT_ATTACHMENT_MAX_BYTES) {
        throw new Error('Plik jest pusty albo przekracza limit 10 MB.')
    }

    const name = safeAttachmentName(attachment.name)
    const escapedConversation = escapeRegex(conversationId)
    const escapedUser = escapeRegex(userId)
    const expectedPath = new RegExp(
        `^${escapedConversation}/${escapedUser}/[0-9a-f-]{36}\\.${extension}$`,
    )
    if (!expectedPath.test(attachment.path)) {
        throw new Error('Nieprawidłowa ścieżka załącznika.')
    }

    return { ...attachment, name }
}

/**
 * Defense in depth for legacy rows before issuing a signed URL. The database
 * constraint is authoritative for new rows, but this check also protects a
 * deployment where old or manually repaired data predates that constraint.
 */
export function isSafeStoredChatAttachmentPath(
    path: string,
    conversationId: string,
    userId: string,
    mime: string | null,
): mime is ChatAttachmentMime {
    if (!mime || !(mime in CHAT_ATTACHMENT_STORED_EXTENSIONS)) return false
    const extensions = CHAT_ATTACHMENT_STORED_EXTENSIONS[mime as ChatAttachmentMime]
        .map(escapeRegex)
        .join('|')
    const expectedPath = new RegExp(
        `^${escapeRegex(conversationId)}/${escapeRegex(userId)}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${extensions})$`,
    )
    return expectedPath.test(path)
}

/** Reject files whose browser-supplied MIME does not match their magic bytes. */
export function assertChatAttachmentSignature(
    bytes: Uint8Array,
    mime: ChatAttachmentMime,
): void {
    const matches = (() => {
        switch (mime) {
            case 'image/jpeg':
                return bytes.length >= 3
                    && bytes[0] === 0xff
                    && bytes[1] === 0xd8
                    && bytes[2] === 0xff
            case 'image/png':
                return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
            case 'image/webp':
                return startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
                    && bytes.length >= 12
                    && bytes[8] === 0x57
                    && bytes[9] === 0x45
                    && bytes[10] === 0x42
                    && bytes[11] === 0x50
            case 'application/pdf':
                return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
            case 'text/plain':
                if (bytes.includes(0)) return false
                try {
                    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
                    return true
                } catch {
                    return false
                }
        }
    })()

    if (!matches) throw new Error('Zawartość pliku nie zgadza się z deklarowanym typem.')
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
    return bytes.length >= signature.length
        && signature.every((value, index) => bytes[index] === value)
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

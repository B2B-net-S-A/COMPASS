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

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

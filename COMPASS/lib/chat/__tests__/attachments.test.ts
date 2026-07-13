import { describe, expect, it } from 'vitest'
import {
    assertChatAttachment,
    CHAT_ATTACHMENT_MAX_BYTES,
    safeAttachmentName,
} from '../attachments'

describe('chat attachment validation', () => {
    const valid = {
        path: 'conversation-1/user-1/6f9619ff-8b86-d011-b42d-00cf4fc964ff.pdf',
        name: 'document.pdf',
        mime: 'application/pdf' as const,
        size: 1024,
    }

    it('accepts a private path owned by the sender and conversation', () => {
        expect(assertChatAttachment(valid, 'conversation-1', 'user-1')).toEqual(valid)
    })

    it('rejects a path belonging to another user or conversation', () => {
        expect(() => assertChatAttachment(valid, 'conversation-2', 'user-1')).toThrow(/ścieżka/)
        expect(() => assertChatAttachment(valid, 'conversation-1', 'user-2')).toThrow(/ścieżka/)
    })

    it('rejects unsupported extensions and oversized files', () => {
        expect(() => assertChatAttachment({ ...valid, path: valid.path.replace('.pdf', '.svg') }, 'conversation-1', 'user-1')).toThrow(/ścieżka/)
        expect(() => assertChatAttachment({ ...valid, size: CHAT_ATTACHMENT_MAX_BYTES + 1 }, 'conversation-1', 'user-1')).toThrow(/10 MB/)
    })

    it('removes directory components and control characters from names', () => {
        expect(safeAttachmentName('../folder/\u0000report.pdf')).toBe('report.pdf')
    })
})

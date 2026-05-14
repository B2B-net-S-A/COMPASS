import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('mammoth', () => ({
    default: {
        extractRawText: vi.fn(async ({ buffer }: { buffer: Buffer }) => ({
            value: `mammoth-extracted:${buffer.length}`,
            messages: [],
        })),
    },
}))

vi.mock('pdf2json', () => {
    class MockPDFParser {
        private handlers: Record<string, (data?: unknown) => void> = {}
        constructor(_a?: unknown, _b?: unknown) {}
        on(event: string, handler: (data?: unknown) => void) { this.handlers[event] = handler }
        getRawTextContent() { return 'PDF EXTRACTED TEXT VERY LONG ENOUGH TO PASS LENGTH CHECK 0123456789 0123456789 0123456789 0123456789 ABCDE' }
        parseBuffer(_buf: Buffer) {
            queueMicrotask(() => this.handlers['pdfParser_dataReady']?.())
        }
    }
    return { default: MockPDFParser }
})

afterEach(() => {
    vi.clearAllMocks()
})

describe('parseBuffer', () => {
    it('parses a DOCX buffer using mammoth', async () => {
        const { parseBuffer } = await import('../parsers')
        const buf = Buffer.from('mock-docx-bytes')
        const text = await parseBuffer(buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'cv.docx')
        expect(text).toBe(`mammoth-extracted:${buf.length}`)
    })

    it('parses a PDF buffer using pdf2json', async () => {
        const { parseBuffer } = await import('../parsers')
        const text = await parseBuffer(Buffer.from('mock-pdf'), 'application/pdf', 'cv.pdf')
        expect(text).toContain('PDF EXTRACTED TEXT')
    })

    it('rejects legacy .doc files with a friendly Polish error', async () => {
        const { parseBuffer } = await import('../parsers')
        await expect(parseBuffer(Buffer.from(''), 'application/msword', 'old.doc')).rejects.toThrow(/Word 97-2003.*nie jest obsługiwany/)
    })

    it('rejects a .doc filename even with a different mime type', async () => {
        const { parseBuffer } = await import('../parsers')
        await expect(parseBuffer(Buffer.from(''), 'application/octet-stream', 'cv.doc')).rejects.toThrow(/Word 97-2003/)
    })

    it('rejects unknown mime types with a clear message', async () => {
        const { parseBuffer } = await import('../parsers')
        await expect(parseBuffer(Buffer.from(''), 'image/png', 'cv.png')).rejects.toThrow(/Nieobsługiwany format/)
    })

    it('rejects pdf parse error from underlying library', async () => {
        vi.resetModules()
        vi.doMock('pdf2json', () => {
            class MockBadPdf {
                private handlers: Record<string, (data?: unknown) => void> = {}
                constructor() {}
                on(event: string, handler: (data?: unknown) => void) { this.handlers[event] = handler }
                getRawTextContent() { return '' }
                parseBuffer(_buf: Buffer) {
                    queueMicrotask(() => this.handlers['pdfParser_dataError']?.({ parserError: 'bad pdf' }))
                }
            }
            return { default: MockBadPdf }
        })
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { parseBuffer } = await import('../parsers')
        await expect(parseBuffer(Buffer.from(''), 'application/pdf', 'x.pdf')).rejects.toThrow(/bad pdf/)
        err.mockRestore()
        vi.doUnmock('pdf2json')
    })
})

describe('parseFile', () => {
    it('reads a File object and dispatches by mime type', async () => {
        const { parseFile } = await import('../parsers')
        const fakeFile: any = {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            name: 'cv.docx',
            arrayBuffer: async () => new TextEncoder().encode('hello').buffer,
        }
        const result = await parseFile(fakeFile as File)
        expect(result).toMatch(/mammoth-extracted/)
    })
})

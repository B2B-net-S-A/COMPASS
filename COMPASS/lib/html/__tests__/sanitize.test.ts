import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '../sanitize'

describe('sanitizeHtml', () => {
    it('returns empty string for null/undefined/empty', () => {
        expect(sanitizeHtml(null)).toBe('')
        expect(sanitizeHtml(undefined)).toBe('')
        expect(sanitizeHtml('')).toBe('')
    })

    it('preserves safe formatting', () => {
        const input = '<h1>Title</h1><p>Paragraph with <strong>bold</strong> and <a href="https://example.com">link</a>.</p>'
        const out = sanitizeHtml(input)
        expect(out).toContain('<h1>')
        expect(out).toContain('<strong>')
        expect(out).toContain('<a href="https://example.com">')
        expect(out).toContain('Paragraph')
    })

    it('strips <script> tags', () => {
        const input = '<p>Hello</p><script>alert(1)</script>'
        const out = sanitizeHtml(input)
        expect(out).toContain('<p>Hello</p>')
        expect(out).not.toContain('<script>')
        expect(out).not.toContain('alert(1)')
    })

    it('strips inline event handlers', () => {
        const input = '<p onclick="alert(1)">Click me</p>'
        const out = sanitizeHtml(input)
        expect(out).toContain('<p>')
        expect(out).not.toContain('onclick')
        expect(out).not.toContain('alert(1)')
    })

    it('strips javascript: URLs from links', () => {
        const input = '<a href="javascript:alert(1)">Bad link</a>'
        const out = sanitizeHtml(input)
        expect(out).not.toContain('javascript:')
    })

    it('strips <iframe>', () => {
        const input = '<p>Before</p><iframe src="https://evil.com"></iframe><p>After</p>'
        const out = sanitizeHtml(input)
        expect(out).not.toContain('<iframe>')
        expect(out).not.toContain('evil.com')
        expect(out).toContain('Before')
        expect(out).toContain('After')
    })

    it('preserves lists and tables', () => {
        const input = '<ul><li>A</li><li>B</li></ul><table><tr><td>X</td></tr></table>'
        const out = sanitizeHtml(input)
        expect(out).toContain('<ul>')
        expect(out).toContain('<li>')
        expect(out).toContain('<table>')
        expect(out).toContain('<td>X</td>')
    })
})

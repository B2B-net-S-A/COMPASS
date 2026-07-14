import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn() }))
import { buildConsultantSuccessEmailHtml } from '../email'

describe('consultant-success email', () => {
    it('escapes all user-controlled text and URLs', () => {
        const html = buildConsultantSuccessEmailHtml({
            heading: '<script>alert(1)</script>',
            body: 'A & B',
            actionUrl: 'https://example.test/?a=1&b="2"',
            actionLabel: '<Otwórz>',
        })
        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;')
        expect(html).toContain('A &amp; B')
        expect(html).toContain('a=1&amp;b=&quot;2&quot;')
    })
})

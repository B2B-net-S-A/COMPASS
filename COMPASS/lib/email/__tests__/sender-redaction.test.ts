import * as Sentry from '@sentry/nextjs'
import { beforeEach, expect, it, vi } from 'vitest'
import { logCompat } from '@/lib/logger'
import { sendEmail } from '../sender'

const post = vi.fn()
vi.mock('@/lib/graph/client', () => ({
    getGraphClient: async () => ({ api: () => ({ post }) }),
    extractGraphErrorInfo: () => ({ statusCode: 400 }),
    isRetryableGraphStatus: () => false,
}))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() }, logCompat: { error: vi.fn() } }))

const message = { to: 'osoba@firma.test', subject: 'Temat z nazwiskiem', html: '<p>x</p>' }

beforeEach(() => {
    vi.clearAllMocks()
    post.mockRejectedValue(new Error('Recipient osoba@firma.test was rejected'))
})

it('w trybie bramki zostawia w logu i Sentry tylko domenę adresata', async () => {
    await sendEmail({ ...message, redactRecipientInLogs: true })
    const recorded = JSON.stringify([vi.mocked(logCompat.error).mock.calls, vi.mocked(Sentry.captureMessage).mock.calls])
    expect(recorded).toContain('firma.test')
    expect(recorded).not.toContain('osoba@')
    expect(recorded).not.toContain('Temat z nazwiskiem')
})

it('bez trybu bramki pozostałe szablony logują jak dotąd', async () => {
    await sendEmail(message)
    expect(logCompat.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ to: 'osoba@firma.test', subject: 'Temat z nazwiskiem' }))
})

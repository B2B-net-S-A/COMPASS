import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sendEmail } from '../sender'

const api = vi.fn()
const post = vi.fn()
vi.mock('@/lib/graph/client', () => ({
    getGraphClient: async () => ({ api: (path: string) => { api(path); return { post } } }),
    extractGraphErrorInfo: () => ({ statusCode: 400 }),
    isRetryableGraphStatus: () => false,
}))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() }, logCompat: { error: vi.fn() } }))

const message = { to: 'osoba@firma.test', subject: 'Temat', html: '<p>x</p>' }
const mailbox = (address: string) => `/users/${encodeURIComponent(address)}/sendMail`
const previous = process.env.MAIL_FROM

beforeEach(() => { vi.clearAllMocks(); post.mockResolvedValue({}); process.env.MAIL_FROM = 'Firma <firma@b2bnetwork.pl>' })
afterEach(() => { process.env.MAIL_FROM = previous })

it('keeps every existing template on MAIL_FROM even with a hardcoded from', async () => {
    await sendEmail({ ...message, from: 'COMPASS System <noreply@compass.b2bnetwork.pl>' })
    expect(api).toHaveBeenCalledWith(mailbox('firma@b2bnetwork.pl'))
})

it('lets only an explicit sender override win over MAIL_FROM', async () => {
    await sendEmail({ ...message, senderOverride: 'Akademia <akademia@b2bnetwork.pl>' })
    expect(api).toHaveBeenCalledWith(mailbox('akademia@b2bnetwork.pl'))
})

it('uses a bare address as the override', async () => {
    await sendEmail({ ...message, senderOverride: 'akademia@b2bnetwork.pl' })
    expect(api).toHaveBeenCalledWith(mailbox('akademia@b2bnetwork.pl'))
})

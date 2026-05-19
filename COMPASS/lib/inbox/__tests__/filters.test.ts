import { describe, expect, it } from 'vitest'
import type { GraphMessage } from '@/lib/mailbox/graph-mail-read'
import {
    classifyMessage,
    isAutoReply,
    isInternalNoise,
    isNonDeliveryReport,
} from '../filters'

function makeMessage(overrides: Partial<GraphMessage> = {}): GraphMessage {
    return {
        id: 'm1',
        internetMessageId: '<m1@b2bnetwork.pl>',
        conversationId: 'c1',
        subject: 'Test subject',
        bodyPreview: 'Hello there',
        body: { contentType: 'text', content: 'Hello there body' },
        from: { emailAddress: { name: 'Anna', address: 'anna@example.com' } },
        receivedDateTime: '2026-05-19T10:00:00Z',
        hasAttachments: false,
        isRead: false,
        internetMessageHeaders: null,
        ...overrides,
    }
}

describe('isNonDeliveryReport', () => {
    it('matches mailer-daemon sender', () => {
        const m = makeMessage({
            from: { emailAddress: { address: 'mailer-daemon@hosting.com' } },
        })
        expect(isNonDeliveryReport(m)).toBe(true)
    })

    it('matches postmaster sender', () => {
        const m = makeMessage({
            from: { emailAddress: { address: 'postmaster@b2bnetwork.pl' } },
        })
        expect(isNonDeliveryReport(m)).toBe(true)
    })

    it('matches Content-Class header for DSN', () => {
        const m = makeMessage({
            internetMessageHeaders: [{ name: 'Content-Class', value: 'urn:content-classes:dsnreport' }],
        })
        expect(isNonDeliveryReport(m)).toBe(true)
    })

    it('matches X-Failed-Recipients header', () => {
        const m = makeMessage({
            internetMessageHeaders: [{ name: 'X-Failed-Recipients', value: 'foo@bar.com' }],
        })
        expect(isNonDeliveryReport(m)).toBe(true)
    })

    it('does not match a normal sender', () => {
        expect(isNonDeliveryReport(makeMessage())).toBe(false)
    })
})

describe('isAutoReply', () => {
    it('matches Auto-Submitted: auto-replied', () => {
        const m = makeMessage({
            internetMessageHeaders: [{ name: 'Auto-Submitted', value: 'auto-replied' }],
        })
        expect(isAutoReply(m)).toBe(true)
    })

    it('matches Auto-Submitted: auto-generated', () => {
        const m = makeMessage({
            internetMessageHeaders: [{ name: 'Auto-Submitted', value: 'auto-generated' }],
        })
        expect(isAutoReply(m)).toBe(true)
    })

    it('ignores Auto-Submitted: no', () => {
        const m = makeMessage({
            internetMessageHeaders: [{ name: 'Auto-Submitted', value: 'no' }],
        })
        expect(isAutoReply(m)).toBe(false)
    })

    it('matches X-Auto-Response-Suppress header', () => {
        const m = makeMessage({
            internetMessageHeaders: [{ name: 'X-Auto-Response-Suppress', value: 'All' }],
        })
        expect(isAutoReply(m)).toBe(true)
    })

    it('matches Precedence: auto_reply', () => {
        const m = makeMessage({
            internetMessageHeaders: [{ name: 'Precedence', value: 'auto_reply' }],
        })
        expect(isAutoReply(m)).toBe(true)
    })

    it('matches Outlook X-MS-Exchange-Inbox-Rules-Loop header', () => {
        const m = makeMessage({
            internetMessageHeaders: [{ name: 'X-MS-Exchange-Inbox-Rules-Loop', value: 'admin@example.com' }],
        })
        expect(isAutoReply(m)).toBe(true)
    })

    it('does not match a normal message', () => {
        expect(isAutoReply(makeMessage())).toBe(false)
    })
})

describe('isInternalNoise', () => {
    it('matches sentry.io domain', () => {
        const m = makeMessage({
            from: { emailAddress: { address: 'noreply@sentry.io' } },
        })
        const res = isInternalNoise(m)
        expect(res.match).toBe(true)
        expect(res.label).toBe('sentry')
    })

    it('matches subdomain of github.com', () => {
        const m = makeMessage({
            from: { emailAddress: { address: 'notifications@noreply.github.com' } },
        })
        const res = isInternalNoise(m)
        expect(res.match).toBe(true)
        expect(res.label).toBe('github')
    })

    it('matches azure.com domain', () => {
        const m = makeMessage({
            from: { emailAddress: { address: 'admin@azure.com' } },
        })
        expect(isInternalNoise(m).match).toBe(true)
    })

    it('does not match a regular client', () => {
        expect(isInternalNoise(makeMessage()).match).toBe(false)
    })

    it('does not match b2bnetwork.pl internal employee', () => {
        const m = makeMessage({
            from: { emailAddress: { address: 'pracownik@b2bnetwork.pl' } },
        })
        expect(isInternalNoise(m).match).toBe(false)
    })
})

describe('classifyMessage (aggregate)', () => {
    it('keeps a normal client email', () => {
        const m = makeMessage()
        expect(classifyMessage(m).skip).toBe(false)
    })

    it('skips message with no sender address', () => {
        const m = makeMessage({ from: { emailAddress: { name: 'Stripped' } } })
        const res = classifyMessage(m)
        expect(res.skip).toBe(true)
        expect(res.reason).toBe('no_sender')
    })

    it('skips NDR before checking internal noise', () => {
        const m = makeMessage({
            from: { emailAddress: { address: 'mailer-daemon@sentry.io' } },
        })
        const res = classifyMessage(m)
        expect(res.skip).toBe(true)
        expect(res.reason).toBe('ndr_bounce')
    })

    it('skips Auto-Submitted before internal noise', () => {
        const m = makeMessage({
            from: { emailAddress: { address: 'someone@somewhere.com' } },
            internetMessageHeaders: [{ name: 'Auto-Submitted', value: 'auto-replied' }],
        })
        expect(classifyMessage(m).reason).toBe('auto_reply')
    })

    it('skips internal noise (github) for non-noreply sender', () => {
        const m = makeMessage({
            from: { emailAddress: { address: 'notifications@github.com' } },
        })
        const res = classifyMessage(m)
        expect(res.skip).toBe(true)
        expect(res.reason).toBe('internal_noise')
        expect(res.details).toBe('github')
    })

    it('NDR check wins over internal_noise when sender is both (noreply@github.com)', () => {
        // Acceptable behaviour — either skip reason satisfies "do not ingest".
        // Order: no_sender → ndr_bounce → auto_reply → internal_noise.
        const m = makeMessage({
            from: { emailAddress: { address: 'noreply@github.com' } },
        })
        const res = classifyMessage(m)
        expect(res.skip).toBe(true)
        expect(res.reason).toBe('ndr_bounce')
    })

    it('skips message with empty subject AND empty preview', () => {
        const m = makeMessage({ subject: '', bodyPreview: '' })
        expect(classifyMessage(m).reason).toBe('missing_subject_and_body')
    })

    it('keeps message with empty subject but non-empty preview', () => {
        const m = makeMessage({ subject: '', bodyPreview: 'has body' })
        expect(classifyMessage(m).skip).toBe(false)
    })

    it('keeps b2bnetwork.pl employee message (not filtered as internal)', () => {
        const m = makeMessage({
            from: { emailAddress: { address: 'pracownik@b2bnetwork.pl' } },
        })
        expect(classifyMessage(m).skip).toBe(false)
    })
})

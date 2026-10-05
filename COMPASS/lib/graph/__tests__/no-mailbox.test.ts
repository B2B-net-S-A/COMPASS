import { describe, expect, it } from 'vitest'
import { isNoExchangeMailboxError } from '../no-mailbox'

const MESSAGE = 'The mailbox is either inactive, soft-deleted, or is hosted on-premise.'

describe('isNoExchangeMailboxError', () => {
    it('recognises the Graph error code', () => {
        expect(
            isNoExchangeMailboxError({ statusCode: 404, code: 'MailboxNotEnabledForRESTAPI' }),
        ).toBe(true)
    })

    it('falls back to the message when the code is missing', () => {
        expect(isNoExchangeMailboxError({ statusCode: 404, message: MESSAGE })).toBe(true)
    })

    it('does not treat an unknown user as a missing mailbox — that is a wrong address', () => {
        expect(
            isNoExchangeMailboxError({
                statusCode: 404,
                code: 'ResourceNotFound',
                message: "User not found",
            }),
        ).toBe(false)
    })

    it('ignores other statuses and non-objects', () => {
        expect(
            isNoExchangeMailboxError({ statusCode: 403, code: 'MailboxNotEnabledForRESTAPI' }),
        ).toBe(false)
        expect(isNoExchangeMailboxError(null)).toBe(false)
        expect(isNoExchangeMailboxError('boom')).toBe(false)
    })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Reset module state between tests so process.stdout/stderr stubs are picked up.
async function loadLogger() {
    const mod = await import('../logger')
    return mod.logger
}

describe('logger', () => {
    let stdoutSpy: ReturnType<typeof vi.spyOn>
    let stderrSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
        stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function lastWriteOn(spy: ReturnType<typeof vi.spyOn>): string {
        const calls = spy.mock.calls
        if (calls.length === 0) return ''
        const last = calls[calls.length - 1][0]
        return typeof last === 'string' ? last : String(last)
    }

    function parseEmitted(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
        const line = lastWriteOn(spy).trimEnd()
        return JSON.parse(line) as Record<string, unknown>
    }

    it('emits info to stdout as single-line JSON', async () => {
        const logger = await loadLogger()
        logger.info({ event: 'user.signed_in', userId: 'u-1' })

        expect(stdoutSpy).toHaveBeenCalledTimes(1)
        const record = parseEmitted(stdoutSpy)
        expect(record.level).toBe('info')
        expect(record.event).toBe('user.signed_in')
        expect(record.userId).toBe('u-1')
        expect(typeof record.timestamp).toBe('string')
        // Must be a valid ISO string
        expect(new Date(record.timestamp as string).toString()).not.toBe('Invalid Date')
    })

    it('emits error to stderr (not stdout)', async () => {
        const logger = await loadLogger()
        logger.error({ event: 'auth.callback.failed', error: new Error('boom') })

        expect(stderrSpy).toHaveBeenCalledTimes(1)
        expect(stdoutSpy).not.toHaveBeenCalled()
        const record = parseEmitted(stderrSpy)
        expect(record.level).toBe('error')
        expect(record.event).toBe('auth.callback.failed')
    })

    it('emits warn to stderr', async () => {
        const logger = await loadLogger()
        logger.warn({ event: 'realtime.subscribe_failed' })

        expect(stderrSpy).toHaveBeenCalledTimes(1)
        const record = parseEmitted(stderrSpy)
        expect(record.level).toBe('warn')
    })

    it('serializes Error instances with name, message, stack, and code', async () => {
        const logger = await loadLogger()
        const err = new Error('oops')
        ;(err as Error & { code?: string }).code = 'E_TEST'
        logger.error({ event: 'test', error: err })

        const record = parseEmitted(stderrSpy)
        const serialized = record.error as Record<string, unknown>
        expect(serialized.message).toBe('oops')
        expect(serialized.name).toBe('Error')
        expect(serialized.code).toBe('E_TEST')
        expect(typeof serialized.stack).toBe('string')
    })

    it('passes through non-Error error values unchanged', async () => {
        const logger = await loadLogger()
        logger.error({ event: 'test', error: { foo: 'bar' } })

        const record = parseEmitted(stderrSpy)
        expect(record.error).toEqual({ foo: 'bar' })
    })

    it('preserves arbitrary context fields beyond event', async () => {
        const logger = await loadLogger()
        logger.info({ event: 'request.completed', durationMs: 123, requestId: 'req-9' })

        const record = parseEmitted(stdoutSpy)
        expect(record.durationMs).toBe(123)
        expect(record.requestId).toBe('req-9')
    })

    it('writes a newline-terminated record so logs split cleanly per line', async () => {
        const logger = await loadLogger()
        logger.info({ event: 'x' })
        const written = lastWriteOn(stdoutSpy)
        expect(written.endsWith('\n')).toBe(true)
    })
})

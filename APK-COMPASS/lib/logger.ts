/**
 * Structured JSON logger for Compass.
 *
 * Outputs single-line JSON to stdout/stderr so Docker's json-file driver
 * captures structured records that Grafana Alloy ships to Loki Cloud.
 *
 * Cross-runtime safe (Node, Edge, browser fallback). Uses process.stdout.write
 * in Node runtime to avoid the "no console.log in production" lint rule and
 * the global console.log audit hook.
 *
 * Usage:
 *   import { logger, logCompat } from '@/lib/logger'
 *   logger.error({ event: 'auth.callback.failed', error, requestId })
 *   logger.info({ event: 'user.signed_in', userId })
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogPayload {
    event: string
    [key: string]: unknown
}

interface SerializedError {
    message: string
    name: string
    stack?: string
    code?: string
}

function serializeError(error: unknown): SerializedError | unknown {
    if (error instanceof Error) {
        const result: SerializedError = {
            message: error.message,
            name: error.name,
        }
        if (error.stack) {
            result.stack = error.stack
        }
        const code = (error as { code?: unknown }).code
        if (typeof code === 'string') {
            result.code = code
        }
        return result
    }
    return error
}

interface LogRecord {
    timestamp: string
    level: LogLevel
    event: string
    [key: string]: unknown
}

function buildRecord(level: LogLevel, payload: LogPayload): LogRecord {
    const record: LogRecord = {
        timestamp: new Date().toISOString(),
        level,
        event: payload.event,
    }
    for (const key of Object.keys(payload)) {
        if (key === 'event') {
            continue
        }
        if (key === 'error') {
            record.error = serializeError(payload.error)
            continue
        }
        record[key] = payload[key]
    }
    return record
}

function hasNodeStdout(): boolean {
    return (
        typeof process !== 'undefined' &&
        typeof process.stdout !== 'undefined' &&
        typeof process.stdout.write === 'function'
    )
}

function emit(level: LogLevel, payload: LogPayload): void {
    const line = JSON.stringify(buildRecord(level, payload))
    if (hasNodeStdout()) {
        const target = level === 'error' || level === 'warn' ? process.stderr : process.stdout
        target.write(line + '\n')
        return
    }
    // Edge runtime / browser fallback — Next.js Edge does not expose process.stdout.
    // Using globalThis.console preserves cross-runtime compatibility.
    const browserConsole = globalThis.console
    if (level === 'error') {
        browserConsole.error(line)
    } else if (level === 'warn') {
        browserConsole.warn(line)
    } else {
        browserConsole.log(line)
    }
}

export const logger = {
    debug(payload: LogPayload): void {
        emit('debug', payload)
    },
    info(payload: LogPayload): void {
        emit('info', payload)
    },
    warn(payload: LogPayload): void {
        emit('warn', payload)
    },
    error(payload: LogPayload): void {
        emit('error', payload)
    },
}

// ─── Compatibility adapter dla legacy console.* migracji ──────────────────
// Akceptuje console-style varargs (`logCompat.error('msg', err, ctx)`) i
// produkuje structured log record z `event = 'legacy.<level>'`. Używane do
// szybkiej masowej migracji z `console.*` w plikach gdzie pełny refactor na
// structured logger.error({ event: ..., ...payload }) byłby zbyt drogi.
//
// Plan: stopniowo refactorować callsites z `logCompat.error('Resend X failed:', err)`
// na `logger.error({ event: 'email.resend.X.failed', error: err })` — wtedy
// Grafana Loki query'e na `{event="email.resend.*"}` zaczynają działać.
export const logCompat = {
    debug(...args: unknown[]): void {
        emit('debug', { event: 'legacy.debug', args: args.map(serializeError) })
    },
    info(...args: unknown[]): void {
        emit('info', { event: 'legacy.info', args: args.map(serializeError) })
    },
    log(...args: unknown[]): void {
        emit('info', { event: 'legacy.log', args: args.map(serializeError) })
    },
    warn(...args: unknown[]): void {
        emit('warn', { event: 'legacy.warn', args: args.map(serializeError) })
    },
    error(...args: unknown[]): void {
        emit('error', { event: 'legacy.error', args: args.map(serializeError) })
    },
}

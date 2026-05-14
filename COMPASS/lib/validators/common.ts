import { z } from 'zod'

// Common building blocks reused across validator schemas. Keep tight — every
// new field here ends up in dozens of action signatures.

export const uuidSchema = z.string().uuid('Nieprawidłowy identyfikator (oczekiwany UUID).')

export const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .email('Nieprawidłowy adres e-mail.')

export const b2bnetworkEmailSchema = emailSchema.refine(
    (e) => e.endsWith('@b2bnetwork.pl'),
    { message: 'Tylko adresy @b2bnetwork.pl są dozwolone.' },
)

// Helper: parse with friendly error. Throws on invalid input — callers catch
// and turn into action-result error tuples. We intentionally NOT use
// `.safeParse` here because most server actions already wrap in try/catch.
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
    const result = schema.safeParse(input)
    if (!result.success) {
        // First error wins — UX shows one message at a time.
        const first = result.error.issues[0]
        const path = first.path.length > 0 ? `${first.path.join('.')}: ` : ''
        throw new Error(`Walidacja: ${path}${first.message}`)
    }
    return result.data
}

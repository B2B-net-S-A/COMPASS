import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { academyActionError, academyDatabaseError } from '../errors'

describe('academy public error boundary', () => {
    it('explains requirements instead of returning database error codes', () => {
        expect(academyDatabaseError({ message: 'prerequisites_not_completed', code: 'P0001' })).toContain('szkolenia wstępne')
        expect(academyDatabaseError({ message: 'version_in_review', code: 'P0001' })).toContain('administrator')
        expect(academyDatabaseError({ message: 'archive_prerequisite_in_use', code: 'P0001' })).toContain('inne opublikowane szkolenie')
        expect(academyDatabaseError({ message: 'published_visible_prerequisites_required', code: 'P0001' })).toContain('szkolenia wstępne')
    })
    it('does not expose constraints, record contents or transport errors', () => {
        for (const code of ['23505', '23503', 'XX000', undefined]) {
            const result = academyDatabaseError({ code, message: 'private_table Łukasz token=private-value' })
            expect(result).not.toContain('private')
            expect(result).not.toContain('Łukasz')
        }
    })
    it('keeps the intentional Polish domain exception', () => {
        expect(academyDatabaseError({ message: 'Edycja jest odwołana.', code: 'P0001' })).toBe('Edycja jest odwołana.')
    })
    it('preserves mapped guidance through the database and action boundaries', () => {
        const message = academyDatabaseError({ message: 'published_version_required', code: 'P0001' })
        expect(academyActionError(new Error(message))).toBe('Szkolenie wymaga zatwierdzonej wersji programu.')
    })
    it('renders form validation without serializing the Zod payload', () => {
        const result = z.object({ userId: z.uuid() }).safeParse({ userId: 'private-input' })
        expect(result.success).toBe(false)
        expect(academyActionError(result.error)).toContain('formularza')
        expect(academyActionError(result.error)).not.toContain('private-input')
    })
    it('hides unexpected technical failures but preserves application guidance', () => {
        expect(academyActionError(new Error('fetch https://private.invalid?token=abc failed'))).not.toContain('token')
        expect(academyActionError(new Error('Szkolenie jest niedostępne.'))).toBe('Szkolenie jest niedostępne.')
    })
})

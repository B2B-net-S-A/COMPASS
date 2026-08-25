import { beforeEach, describe, expect, it, vi } from 'vitest'

const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))

import { ExpectedError, runAction, unwrap, UNEXPECTED_ERROR_PL } from '../action-result'

describe('runAction', () => {
    beforeEach(() => captureException.mockReset())

    it('zwraca dane, gdy ciało się powiedzie', async () => {
        const r = await runAction('test', async () => ({ id: 'x' }))
        expect(r).toEqual({ success: true, data: { id: 'x' } })
        expect(captureException).not.toHaveBeenCalled()
    })

    // Sedno naprawy: komunikat walidacyjny MUSI wrócić jako dane, bo rzucony
    // z 'use server' zostaje w produkcji zamaskowany przez Next.
    it('przepuszcza treść ExpectedError do użytkownika', async () => {
        const r = await runAction('test', async () => {
            throw new ExpectedError('Przekroczono limit urlopu: pozostało 2 dni.')
        })
        expect(r).toEqual({ success: false, error: 'Przekroczono limit urlopu: pozostało 2 dni.' })
    })

    // Drugie sedno: bez tego rozróżnienia Sentry utonie w walidacjach
    // i wypali limit 5k zdarzeń/mies. na darmowym planie.
    it('NIE raportuje ExpectedError do Sentry', async () => {
        await runAction('test', async () => {
            throw new ExpectedError('brak uprawnień')
        })
        expect(captureException).not.toHaveBeenCalled()
    })

    it('raportuje nieoczekiwany błąd do Sentry i zwraca komunikat ogólny', async () => {
        const boom = new Error('column "foo" does not exist')
        const r = await runAction('test', async () => {
            throw boom
        })
        expect(r).toEqual({ success: false, error: UNEXPECTED_ERROR_PL })
        expect(captureException).toHaveBeenCalledTimes(1)
        expect(captureException.mock.calls[0][0]).toBe(boom)
    })

    it('nie wypuszcza szczegółów bazy do użytkownika', async () => {
        const r = await runAction('test', async () => {
            throw new Error('duplicate key value violates unique constraint "profiles_pkey"')
        })
        expect(r.success).toBe(false)
        if (!r.success) {
            expect(r.error).not.toContain('profiles_pkey')
            expect(r.error).not.toContain('constraint')
        }
    })

    it('oznacza zdarzenie nazwą akcji — bez tego stos z prod jest bezużyteczny', async () => {
        await runAction('approveLeaveRequest', async () => {
            throw new Error('boom')
        })
        expect(captureException.mock.calls[0][1]).toMatchObject({
            tags: { action: 'approveLeaveRequest', layer: 'server-action' },
        })
    })
})

describe('unwrap', () => {
    it('zwraca dane przy sukcesie', () => {
        expect(unwrap({ success: true, data: 42 })).toBe(42)
    })

    it('rzuca ExpectedError przy porażce, żeby treść przetrwała', () => {
        expect(() => unwrap({ success: false, error: 'nie wolno' })).toThrow(ExpectedError)
        expect(() => unwrap({ success: false, error: 'nie wolno' })).toThrow('nie wolno')
    })
})

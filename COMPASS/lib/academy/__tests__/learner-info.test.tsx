import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LearnerInfoNotice } from '@/components/academy/LearnerInfoNotice'
import { CURRENT_LEARNER_INFO_VERSION, learnerInfoAccepted } from '../learner-info'

describe('learnerInfoAccepted', () => {
    it('uznaje przyjęcie aktualnej wersji', () => {
        expect(learnerInfoAccepted({ info_accepted_at: '2026-11-10T10:00:00Z', info_version: CURRENT_LEARNER_INFO_VERSION })).toBe(true)
    })

    it.each([
        { info_accepted_at: null, info_version: null },
        { info_accepted_at: null, info_version: CURRENT_LEARNER_INFO_VERSION },
        { info_accepted_at: '2026-11-10T10:00:00Z', info_version: null },
        { info_accepted_at: '2026-11-10T10:00:00Z', info_version: 'starsza' },
    ])('wymaga ponownego przyjęcia dla %j', account => {
        expect(learnerInfoAccepted(account)).toBe(false)
    })
})

describe('LearnerInfoNotice', () => {
    it('pokazuje klauzulę, oznaczenie roboczej treści i oba dokumenty', () => {
        render(<LearnerInfoNotice />)
        expect(screen.getByRole('heading', { name: 'Twoje dane w Akademii COMPASS' })).toBeInTheDocument()
        expect(screen.getByText('B2B Network S.A.')).toBeInTheDocument()
        expect(screen.getByText('Treść robocza, przed opinią prawną.')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Pełna informacja o danych' })).toHaveAttribute('href', '/privacy-policy')
        expect(screen.getByRole('link', { name: 'Regulamin Akademii' })).toHaveAttribute('href', '/terms')
    })
})

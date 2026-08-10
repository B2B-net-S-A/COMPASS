import { describe, expect, it } from 'vitest'

import { cardDisplayTitle, defaultCardTitle } from '@/lib/types/tech-map'

describe('cardDisplayTitle', () => {
    it('własny tytuł wygrywa z domyślnym', () => {
        expect(cardDisplayTitle('Przedłużenie kontraktu', 'Jan Wasilewski')).toBe('Przedłużenie kontraktu')
    })

    it('brak tytułu → tytuł domyślny z nazwiskiem konsultanta', () => {
        expect(cardDisplayTitle(null, 'Jan Wasilewski')).toBe('Rozmowa: Jan Wasilewski')
        expect(cardDisplayTitle(undefined, 'wasilewski')).toBe('Rozmowa: wasilewski')
    })

    it('pusty / whitespace tytuł nie robi pustego nagłówka', () => {
        expect(cardDisplayTitle('', 'Jan Wasilewski')).toBe('Rozmowa: Jan Wasilewski')
        expect(cardDisplayTitle('   ', 'Jan Wasilewski')).toBe('Rozmowa: Jan Wasilewski')
    })

    it('otacza własny tytuł trimem', () => {
        expect(cardDisplayTitle('  Q3 review  ', 'Jan Wasilewski')).toBe('Q3 review')
    })

    it('defaultCardTitle jest jedynym źródłem domyślnego tytułu', () => {
        expect(cardDisplayTitle(null, 'Anna Nowak')).toBe(defaultCardTitle('Anna Nowak'))
    })
})

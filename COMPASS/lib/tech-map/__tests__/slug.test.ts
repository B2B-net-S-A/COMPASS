import { describe, expect, it } from 'vitest'

import { generateTechSlug } from '@/lib/types/tech-map'

describe('generateTechSlug', () => {
    it('zwykłe nazwy → kebab-case', () => {
        expect(generateTechSlug('Apache Kafka')).toBe('apache-kafka')
        expect(generateTechSlug('  Power BI ')).toBe('power-bi')
    })

    it('C# i C++ nie kolidują z C', () => {
        expect(generateTechSlug('C')).toBe('c')
        expect(generateTechSlug('C#')).toBe('c-sharp')
        expect(generateTechSlug('C++')).toBe('c-plus-plus')
    })

    it('kropki i ukośniki stają się myślnikami', () => {
        expect(generateTechSlug('Node.js')).toBe('node-js')
        expect(generateTechSlug('PL/SQL')).toBe('pl-sql')
        expect(generateTechSlug('.NET')).toBe('net')
    })

    it('polskie znaki są transliterowane', () => {
        expect(generateTechSlug('Żółta Chmura')).toBe('zolta-chmura')
    })

    it('sekwencje znaków specjalnych nie zostawiają podwójnych myślników', () => {
        expect(generateTechSlug('A -- B // C')).toBe('a-b-c')
    })
})

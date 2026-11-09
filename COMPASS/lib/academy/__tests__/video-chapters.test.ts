// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { activeChapterIndex, formatChapterTime, parseChapterTime } from '../video-chapters'

describe('chapter time', () => {
    it('parses minutes and hours', () => {
        expect(parseChapterTime('0:05')).toBe(5)
        expect(parseChapterTime('12:30')).toBe(750)
        expect(parseChapterTime('1:02:03')).toBe(3723)
        expect(parseChapterTime(' 90:00 ')).toBe(5400)
    })
    it('rejects malformed values', () => {
        for (const value of ['', 'abc', '5', '1:5', '1:60', '1:60:00', '-1:00', '1:00:00:00']) expect(parseChapterTime(value)).toBeNull()
    })
    it('formats back to the same notation', () => {
        expect(formatChapterTime(5)).toBe('0:05')
        expect(formatChapterTime(750)).toBe('12:30')
        expect(formatChapterTime(3723)).toBe('1:02:03')
    })
})

describe('activeChapterIndex', () => {
    const chapters = [{ position_seconds: 0, title: 'A' }, { position_seconds: 60, title: 'B' }, { position_seconds: 120, title: 'C' }]
    it('picks the last chapter already started', () => {
        expect(activeChapterIndex(chapters, 0)).toBe(0)
        expect(activeChapterIndex(chapters, 59.9)).toBe(0)
        expect(activeChapterIndex(chapters, 60)).toBe(1)
        expect(activeChapterIndex(chapters, 9999)).toBe(2)
    })
    it('returns -1 before the first chapter and for an empty list', () => {
        expect(activeChapterIndex([{ position_seconds: 30, title: 'A' }], 5)).toBe(-1)
        expect(activeChapterIndex([], 5)).toBe(-1)
    })
})

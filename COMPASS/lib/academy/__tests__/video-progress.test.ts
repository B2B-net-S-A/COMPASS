// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mergeRanges, resumePosition, WatchTracker } from '../video-progress'

describe('mergeRanges', () => {
    it('merges overlaps, keeps gaps and drops empty ranges', () => {
        expect(mergeRanges([[20, 30], [0, 10], [5, 12], [40, 40]])).toEqual([[0, 12], [20, 30]])
    })
    it('joins touching ranges and does not mutate the input', () => {
        const input: [number, number][] = [[0, 5], [5, 9]]
        expect(mergeRanges(input)).toEqual([[0, 9]])
        expect(input).toEqual([[0, 5], [5, 9]])
    })
})

describe('resumePosition', () => {
    it('resumes mid-recording and restarts at the end or without data', () => {
        expect(resumePosition(120, 600)).toBe(120)
        expect(resumePosition(595, 600)).toBe(0)
        expect(resumePosition(0, 600)).toBe(0)
        expect(resumePosition(undefined, undefined)).toBe(0)
    })
})

describe('WatchTracker', () => {
    const play = (tracker: WatchTracker, from: number, to: number) => { for (let t = from; t <= to; t += 0.5) tracker.sample(t) }

    it('counts continuous playback as one range', () => {
        const tracker = new WatchTracker()
        play(tracker, 0, 10)
        expect(tracker.take()).toEqual([[0, 10]])
    })
    it('does not count a jump forward as watched', () => {
        const tracker = new WatchTracker()
        play(tracker, 0, 5)
        play(tracker, 100, 105)
        expect(tracker.take()).toEqual([[0, 5], [100, 105]])
    })
    it('splits on an explicit seek even when the jump is small', () => {
        const tracker = new WatchTracker()
        play(tracker, 0, 5)
        tracker.interrupt()
        play(tracker, 6, 8)
        expect(tracker.take()).toEqual([[0, 5], [6, 8]])
    })
    it('resends ranges after a failed save and not after a confirmed one', () => {
        const tracker = new WatchTracker()
        play(tracker, 0, 5)
        tracker.take()
        tracker.restore()
        expect(tracker.take()).toEqual([[0, 5]])
        tracker.confirm()
        expect(tracker.take()).toEqual([])
    })
    it('continues the running range across a save without a gap', () => {
        const tracker = new WatchTracker()
        play(tracker, 0, 5)
        expect(tracker.take()).toEqual([[0, 5]])
        tracker.confirm()
        play(tracker, 5.5, 8)
        expect(tracker.take()).toEqual([[5, 8]])
    })
})

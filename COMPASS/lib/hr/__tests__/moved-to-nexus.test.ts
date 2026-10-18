import { afterEach, describe, expect, it, vi } from 'vitest'

import { ExpectedError } from '@/lib/actions/expected-error'
import {
    HR_MODULES,
    assertEmploymentStatusWritable,
    assertHrModuleWritable,
    hrLandingPath,
    hrModuleRefusal,
    isExportOff,
    isMovedToNexus,
    movedModules,
    nexusAppUrl,
    nexusModuleUrl,
    parseHrModuleList,
} from '@/lib/hr/moved-to-nexus'

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('parseHrModuleList', () => {
    it('reads a comma list regardless of case and spacing', () => {
        expect(parseHrModuleList(' Leave, time ;payroll\nCARE ').modules).toEqual(['leave', 'time', 'payroll', 'care'])
    })

    it('treats an empty or missing value as nothing moved', () => {
        expect(parseHrModuleList('').modules).toEqual([])
        expect(parseHrModuleList(undefined).modules).toEqual([])
        expect(parseHrModuleList(' , ').modules).toEqual([])
    })

    it('reports unknown entries instead of silently accepting a typo', () => {
        const parsed = parseHrModuleList('leaves,time,leave,time')
        expect(parsed.modules).toEqual(['time', 'leave'])
        expect(parsed.unknown).toEqual(['leaves'])
    })
})

describe('HR_MOVED_TO_NEXUS switch', () => {
    it('changes nothing while the variable is empty', () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', '')
        for (const mod of HR_MODULES) {
            expect(isMovedToNexus(mod)).toBe(false)
            expect(() => assertHrModuleWritable(mod)).not.toThrow()
            expect(hrModuleRefusal(mod)).toBeNull()
        }
    })

    it('refuses writes only for listed modules, with a Polish ExpectedError', () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'leave,cases')
        expect(movedModules()).toEqual(new Set(['leave', 'cases']))
        expect(() => assertHrModuleWritable('time')).not.toThrow()

        let caught: unknown
        try {
            assertHrModuleWritable('leave')
        } catch (e) {
            caught = e
        }
        expect(caught).toBeInstanceOf(ExpectedError)
        expect((caught as Error).message).toContain('działa teraz w NEXUSIE')
        expect((caught as Error).message).toContain('Urlopy i nieobecności')
        expect(hrModuleRefusal('cases')).toContain('Skrzynka administracja@')
    })

    it('is read at call time, so a restart with a new value is enough', () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', '')
        expect(isMovedToNexus('payroll')).toBe(false)
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'payroll')
        expect(isMovedToNexus('payroll')).toBe(true)
    })

    it('keeps exports on until HR_EXPORTS_OFF lists the module', () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'leave,lifecycle')
        vi.stubEnv('HR_EXPORTS_OFF', '')
        expect(isExportOff('leave')).toBe(false)
        vi.stubEnv('HR_EXPORTS_OFF', 'leave')
        expect(isExportOff('leave')).toBe(true)
        expect(isExportOff('lifecycle')).toBe(false)
    })
})

describe('assertEmploymentStatusWritable', () => {
    it('lets Academy consultant accounts be (de)activated locally after the move', () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'lifecycle')
        expect(() => assertEmploymentStatusWritable('consultant')).not.toThrow()
    })

    it('refuses employees once NEXUS owns employment status', () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'lifecycle')
        expect(() => assertEmploymentStatusWritable('internal')).toThrow(ExpectedError)
        expect(() => assertEmploymentStatusWritable(null)).toThrow(ExpectedError)
    })

    it('allows everything before the move', () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', '')
        expect(() => assertEmploymentStatusWritable('manager')).not.toThrow()
    })
})

describe('NEXUS links', () => {
    it('builds module links from NEXUS_APP_URL origin', () => {
        vi.stubEnv('NEXUS_APP_URL', 'https://nexus.example.test/some/path')
        expect(nexusAppUrl()).toBe('https://nexus.example.test')
        expect(nexusModuleUrl('leave')).toBe('https://nexus.example.test/my-time')
        expect(nexusModuleUrl('cases')).toBe('https://nexus.example.test/people/cases')
    })

    it('drops the link instead of rendering something unsafe or broken', () => {
        vi.stubEnv('NEXUS_APP_URL', 'javascript:alert(1)')
        expect(nexusAppUrl()).toBeNull()
        vi.stubEnv('NEXUS_APP_URL', 'not a url')
        expect(nexusAppUrl()).toBeNull()
        vi.stubEnv('NEXUS_APP_URL', '')
        expect(nexusModuleUrl('time')).toBeNull()
    })
})

describe('hrLandingPath', () => {
    const all = new Set(HR_MODULES)

    it('keeps today’s landings when nothing moved', () => {
        const none = new Set<never>()
        expect(hrLandingPath('admin', none)).toBe('/home')
        expect(hrLandingPath('consultant', none)).toBe('/home')
        for (const role of ['internal', 'manager', 'finanse', 'talent_community']) {
            expect(hrLandingPath(role, none)).toBe('/internal')
        }
    })

    it('sends TCM to the Academy only when every HR module is in NEXUS', () => {
        expect(hrLandingPath('talent_community', all)).toBe('/learning')
        const almost = new Set(HR_MODULES.filter((m) => m !== 'cases'))
        expect(hrLandingPath('talent_community', almost)).toBe('/internal')
    })

    it('keeps roles without Academy access on the HR archive', () => {
        for (const role of ['internal', 'manager', 'finanse']) {
            expect(hrLandingPath(role, all)).toBe('/internal')
        }
    })
})

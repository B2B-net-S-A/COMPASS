import { describe, expect, it } from 'vitest'

import {
    anonymizedEmail,
    anonymizedLabel,
    contractorScrubSteps,
    CONTRACTOR_SOURCES,
    EMPLOYEE_SOURCES,
    employeeScrubSteps,
    manualFollowUpsFor,
    retainedFor,
    scrubStepsFor,
    sourcesFor,
} from '../subject-data'

const USER_ID = '11111111-2222-3333-4444-555555555555'

describe('źródła danych osoby', () => {
    it('nie zbiera kolumn sprawstwa — inaczej eksport wysypałby cudze dane', () => {
        // `created_by` / `reviewed_by` / `imported_by` / `approved_by` wskazują
        // pracownika działającego na CUDZYCH danych. Gdyby trafiły na listę,
        // realizacja art. 15 dla jednej osoby wydałaby jej rekordy kilkudziesięciu
        // innych — to najgroźniejszy sposób zepsucia tego modułu.
        const forbidden = /^(created_by|reviewed_by|imported_by|approved_by|decided_by|author_id|assignee_id|proposed_by)$/
        const offenders = [...EMPLOYEE_SOURCES, ...CONTRACTOR_SOURCES]
            .filter(s => forbidden.test(s.column))
            // Komentarze do zgłoszeń to WŁASNE wypowiedzi osoby, nie sprawstwo na cudzych danych.
            .filter(s => s.table !== 'support_ticket_comments')
        expect(offenders).toEqual([])
    })

    it('nie ma zduplikowanych par tabela+kolumna', () => {
        for (const list of [EMPLOYEE_SOURCES, CONTRACTOR_SOURCES]) {
            const keys = list.map(s => `${s.table}.${s.column}`)
            expect(new Set(keys).size).toBe(keys.length)
        }
    })

    it('sourcesFor rozróżnia pracownika i kontraktora', () => {
        expect(sourcesFor('employee')).toBe(EMPLOYEE_SOURCES)
        expect(sourcesFor('contractor')).toBe(CONTRACTOR_SOURCES)
    })
})

describe('etykiety zastępcze', () => {
    it('nie zawierają danych identyfikujących, ale rozróżniają rekordy', () => {
        const label = anonymizedLabel(USER_ID)
        expect(label).toContain('RODO')
        expect(label).toContain('11111111')
    })

    it('adres zastępczy używa zarezerwowanej domeny .invalid i jest unikalny', () => {
        const a = anonymizedEmail(USER_ID)
        const b = anonymizedEmail('99999999-2222-3333-4444-555555555555')
        expect(a.endsWith('@rodo.invalid')).toBe(true)
        // profiles.email ma UNIQUE — dwie zatarte osoby nie mogą dostać tej samej wartości.
        expect(a).not.toBe(b)
    })
})

describe('kroki zacierania — pracownik', () => {
    const steps = employeeScrubSteps(USER_ID)

    it('zaciera profil i odcina logowanie', () => {
        const profile = steps.find(s => s.table === 'profiles')
        expect(profile?.operation).toBe('update')
        // employment_status='exited' blokuje logowanie w trzech warstwach (Faza 43);
        // bez tego zostałoby żywe konto z pustym nazwiskiem.
        expect(profile?.patch.employment_status).toBe('exited')
        expect(profile?.patch.phone).toBeNull()
        expect(profile?.patch.cv_url).toBeNull()
        // Wektor odtwarza treść CV i bio, więc jest daną osobową tak samo jak one.
        expect(profile?.patch.embedding).toBeNull()
    })

    it('nie kasuje rekordów z własnym okresem przechowywania', () => {
        const retentionBound = ['timesheets', 'invoices', 'bonuses', 'contracts', 'leave_requests', 'audit_logs', 'user_rates']
        for (const step of steps) {
            expect(retentionBound).not.toContain(step.table)
        }
    })

    it('kasuje tylko to, co nie ma okresu przechowywania', () => {
        const deleted = steps.filter(s => s.operation === 'delete').map(s => s.table).sort()
        expect(deleted).toEqual(['placement_person_aliases', 'push_subscriptions', 'verification_codes'])
    })

    it('kroki delete nie niosą patcha', () => {
        for (const step of steps.filter(s => s.operation === 'delete')) {
            expect(Object.keys(step.patch)).toEqual([])
        }
    })
})

describe('kroki zacierania — kontraktor', () => {
    const steps = contractorScrubSteps(USER_ID)

    it('zaciera nazwisko we wszystkich tabelach, które trzymają jego kopię', () => {
        // Importy z Excela zapisują nazwisko jako tekst obok contractor_id, więc
        // zatarcie samej kartoteki zostawiłoby pełne dane w Wejściach i Zejściach.
        const tables = steps.map(s => s.table)
        for (const t of ['contractors', 'placements', 'client_entries', 'client_departures', 'contractor_bench', 'support_inbox_meta']) {
            expect(tables).toContain(t)
        }
    })

    it('wszystkie kroki są aktualizacjami — nic nie znika z dokumentacji współpracy', () => {
        expect(steps.every(s => s.operation === 'update')).toBe(true)
    })

    it('każdy krok wstawia tę samą etykietę zastępczą', () => {
        const label = anonymizedLabel(USER_ID)
        const names = steps.flatMap(s => [s.patch.consultant_name, s.patch.full_name]).filter(Boolean)
        expect(names.every(n => n === label)).toBe(true)
    })
})

describe('raport dla osoby', () => {
    it('mówi, co zostaje i z jakiego powodu', () => {
        expect(retainedFor('employee').length).toBeGreaterThan(0)
        expect(retainedFor('employee').every(r => r.reason.length > 0)).toBe(true)
    })

    it('nazywa granice automatu zamiast udawać komplet', () => {
        // Raport, który milczy o Storage i o arkuszach źródłowych, wygląda na
        // kompletny — i właśnie dlatego jest groźny.
        expect(manualFollowUpsFor('employee').some(t => /Storage/i.test(t))).toBe(true)
        expect(manualFollowUpsFor('contractor').some(t => /SharePoint/i.test(t))).toBe(true)
    })

    it('scrubStepsFor wybiera zestaw po typie podmiotu', () => {
        expect(scrubStepsFor('employee', USER_ID)[0].table).toBe('profiles')
        expect(scrubStepsFor('contractor', USER_ID)[0].table).toBe('contractors')
    })
})

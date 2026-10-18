import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// „Ludzie w NEXUSIE”: akcje zapisu przeniesionych modułów odmawiają w jednym miejscu
// (`assertHrModuleWritable` / `hrModuleRefusal` z lib/hr/moved-to-nexus.ts).
//
// Część 1 — mapa moduł → akcje zapisu, sprawdzana na źródle. Nowa akcja zapisu modułu
// bez odmowy albo wycięte wywołanie łamie ten test. Mapa jest też listą do raportu.
// Część 2 — kilka akcji na żywo: odmowa przychodzi PRZED jakimkolwiek zapytaniem do bazy.

type HrModule = 'people' | 'leave' | 'time' | 'payroll' | 'lifecycle' | 'care' | 'cases'

/** plik → akcja → moduł (+ opcjonalnie prywatne ciało, w którym siedzi odmowa). */
const WRITE_ACTIONS: Record<string, Record<string, HrModule | [HrModule, string]>> = {
    'internal-leave': {
        uploadLeaveProof: 'leave', createLeaveRequest: 'leave', cancelMyLeaveRequest: 'leave',
        createLeaveOnBehalf: 'leave', cancelTeamLeave: 'leave', updateTeamLeave: 'leave',
        approveLeaveRequest: 'leave', rejectLeaveRequest: 'leave', retryLeaveGraphSync: 'leave',
        setLeaveMailForward: 'leave',
    },
    'leave-forward-admin': { removeForwardRule: 'leave', runForwardReconcileNow: 'leave' },
    'internal-attendance': { upsertAttendanceDay: 'time', deleteAttendanceDay: 'time' },
    'internal-timesheet': {
        addEntry: 'time', quickFillMonth: 'time', updateEntry: 'time', deleteEntry: 'time',
        submitTimesheet: 'time', approveTimesheet: 'time', rejectTimesheet: 'time', unlockTimesheet: 'time',
        approverAddEntry: 'time', approverUpdateEntry: 'time', approverDeleteEntry: 'time',
        copyPreviousMonthEntries: 'time', ensureTeamTimesheet: 'time', adminOverrideTimesheetEntry: 'time',
        clearOvertimeOverride: 'time',
    },
    'internal-timesheet-templates': {
        createTemplate: 'time', updateTemplate: 'time', deleteTemplate: 'time', applyTemplateToEntry: 'time',
    },
    'internal-timesheet-role-defaults': {
        createRoleDefault: 'time', updateRoleDefault: 'time', deleteRoleDefault: 'time', applyDefaultsToTimesheet: 'time',
    },
    'internal-bonus': {
        linkBonusToInvoice: 'payroll', unlinkBonus: 'payroll', proposeBonus: 'payroll', cancelBonus: 'payroll',
        assignBonus: 'payroll', updateBonus: 'payroll', uploadBonusAttachment: 'payroll', removeBonusAttachment: 'payroll',
    },
    'internal-rates': {
        setUserRate: 'payroll', setRateProgression: 'payroll', copyRateProgression: ['payroll', 'applyCopyProgression'],
        setUserContractType: 'people', setUserVacationPool: 'leave',
    },
    placements: {
        commitPlacementImport: 'payroll', confirmPlacementHours: ['payroll', 'confirmPlacementHoursBody'],
        deletePlacementBonus: 'payroll', cancelPlacement: 'payroll',
    },
    'user-admin': { setUserManager: 'people', archiveEmployee: 'lifecycle' },
    lifecycle: Object.fromEntries([
        'createTemplate', 'updateTemplate', 'deleteTemplate', 'startOnboardingWithOptions', 'addTemplateItem',
        'updateTemplateItem', 'deleteTemplateItem', 'reorderTemplateItems', 'startOnboarding', 'assignBuddy',
        'completeOnboardingTask', 'addAdhocOnboardingTask', 'submitOnboardingCheckin', 'completeOnboarding',
        'sendOnboardingWelcomeEmailNow', 'scheduleExitInterview', 'markExitInterviewReviewed', 'completeOffboardingTask',
        'markEmployeeExited', 'sendExitInvitationNow', 'sendOffboardingChecklistNow', 'cancelOnboarding',
        'restartOnboarding', 'cancelExitInterview', 'updateLifecycleProfile', 'createExternalEmployee',
        'addLifecycleNote', 'deleteLifecycleNote', 'duplicateTemplate',
    ].map((fn) => [fn, 'lifecycle' as const])),
    'tech-map': {
        createTechnologyUnverified: 'care', updateTechnology: 'care', deleteTechnology: 'care',
        createVendorUnverified: 'care', updateVendor: 'care', deleteVendor: 'care', createClientArea: 'care',
        createClientForTechMap: 'care', createCardDraft: 'care', setAlertRecipients: 'care',
        saveCard: ['care', 'saveCardInternal'], finalizeCard: ['care', 'saveCardInternal'],
    },
    contractors: Object.fromEntries([
        'createContractor', 'updateContractor', 'addConversation', 'updateConversation', 'createOnboardingInterview',
        'saveOnboardingInterview', 'reviewOnboardingInterview', 'createExitInterview', 'saveExitInterview',
        'reviewExitInterview', 'createTask', 'updateTask', 'uploadContractorInterviewFile',
        'removeContractorInterviewFile', 'addBenchEntry', 'updateBenchEntry', 'dismissBenchEntry', 'assignCareOwner',
    ].map((fn) => [fn, 'care' as const])),
    'contractor-import': { commitRozmowyImport: 'care', commitWejsciaImport: 'care', commitZejsciaImport: 'care' },
    'consultant-success': Object.fromEntries([
        'activateSuccessMonitoring', 'pauseSuccessMonitoring', 'scheduleSuccessCheckIn', 'rescheduleSuccessCheckIn',
        'completeSuccessCheckIn', 'addSuccessClientFeedback', 'setSuccessHealthStatus', 'createSuccessTask',
        'updateSuccessTask', 'retrySuccessDelivery', 'sendSuccessPulseSurvey',
    ].map((fn) => [fn, 'care' as const])),
    'nexus-identity': {
        linkContractorToNexus: 'care', unlinkContractorFromNexus: 'care', dismissNexusMatch: 'care', reopenNexusMatch: 'care',
    },
    'support-inbox': {
        createInboxTicket: 'cases', moveInboxTicket: 'cases', addInboxComment: 'cases', renameInboxTicket: 'cases',
        assignInboxTicket: 'cases', updateInboxWorkspace: 'cases',
    },
}

function functionBody(source: string, name: string): string {
    const start = source.search(new RegExp(`\\n(export )?async function ${name}\\b`))
    if (start < 0) throw new Error(`Brak funkcji ${name}`)
    const next = source.slice(start + 1).search(/\n(export )?(async )?function |\nexport (const|type|interface) /)
    return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next)
}

describe('mapa akcji zapisu przeniesionych modułów', () => {
    for (const [file, actions] of Object.entries(WRITE_ACTIONS)) {
        const source = readFileSync(path.resolve(__dirname, `../${file}.ts`), 'utf8')
        for (const [action, spec] of Object.entries(actions)) {
            const [module, body] = Array.isArray(spec) ? spec : [spec, action]
            it(`${file}.${action} odmawia, gdy „${module}” jest w NEXUSIE`, () => {
                const text = functionBody(source, body)
                expect(
                    text.includes(`assertHrModuleWritable('${module}')`)
                    || text.includes(`hrModuleRefusal('${module}')`),
                ).toBe(true)
            })
        }
    }
})

// ─── Część 2: odmowa przed bazą ─────────────────────────────────────────────

const db = vi.hoisted(() => ({ touched: [] as string[] }))
// Każde dotknięcie bazy jest notowane i rzuca — odmowa ma przyjść wcześniej.
function trapClient() {
    const trap = (what: string) => () => {
        db.touched.push(what)
        throw new Error(`DB touched: ${what}`)
    }
    return {
        from: (table: string) => trap(`from:${table}`)(),
        rpc: (fn: string) => trap(`rpc:${fn}`)(),
        storage: { from: (bucket: string) => trap(`storage:${bucket}`)() },
        auth: {
            getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.test' } } }),
            admin: {
                getUserById: async (id: string) => ({ data: { user: { id, email: 'target@example.test' } }, error: null }),
                updateUserById: trap('auth.updateUserById'),
            },
        },
    }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: () => trapClient() }))
vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: () => trapClient() }))
vi.mock('@/lib/auth/internal-guard', () => {
    const ctx = {
        userId: 'user-1', email: 'user@example.test', role: 'admin', isAdmin: true, isManager: false,
        isTalentCommunity: false, hasTcmAccess: false, canLogOvertime: true, canViewTechMap: false, canViewLegalMonitor: false,
    }
    const allow = async () => ctx
    return {
        requireInternalOrAdminAction: allow, requireAdminAction: allow, requireLeaveApproverAction: allow,
        requireTimesheetApproverAction: allow, requireFinanseOrAdminAction: allow, requireBonusProposerAction: allow,
        requireLifecycleManagerAction: allow, requireTalentCommunityOrAdminAction: allow,
    }
})
vi.mock('@/lib/auth/super-admins', () => ({ getSuperAdmins: () => ['admin@example.test'], isSuperAdmin: () => false }))
vi.mock('@/lib/actions/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({}))
vi.mock('@/lib/push/dispatch', () => ({ sendPushToUserId: vi.fn() }))
vi.mock('@/lib/teams/webhook', () => ({ postToTeamsAlert: vi.fn() }))
vi.mock('@/lib/calendar/graph-events', () => ({}))
vi.mock('@/lib/mailbox/graph-oof', () => ({}))
vi.mock('@/lib/mailbox/graph-inbox-rules', () => ({ deleteForwardRule: vi.fn() }))

beforeEach(() => {
    db.touched = []
})
afterEach(() => {
    vi.unstubAllEnvs()
})

const MOVED = /działa teraz w NEXUSIE/

describe('odmowa zapisu na żywo', () => {
    it('akcja z runAction zwraca komunikat jako dane i nie dotyka bazy', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'leave')
        const { createLeaveRequest } = await import('@/lib/actions/internal-leave')
        const res = await createLeaveRequest({ leaveType: 'vacation', startDate: '2026-11-02', endDate: '2026-11-03' } as never)
        expect(res).toEqual({ success: false, error: expect.stringMatching(MOVED) })
        expect(db.touched).toEqual([])
    })

    it('starsza akcja bez runAction rzuca ExpectedError, zanim cokolwiek zapisze', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'time')
        const { upsertAttendanceDay } = await import('@/lib/actions/internal-attendance')
        await expect(upsertAttendanceDay({ date: '2026-11-02', status: 'active', location: 'remote' } as never))
            .rejects.toMatchObject({ name: 'ExpectedError', message: expect.stringMatching(MOVED) })
        expect(db.touched).toEqual([])
    })

    it('skrzynka zwraca odmowę w swoim kształcie wyniku', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'cases')
        const supabase = await import('@/lib/supabase/server')
        // isCallerHandler czyta profil — tu przepuszczamy tylko ten odczyt.
        const spy = vi.spyOn(supabase, 'createClient').mockReturnValue({
            ...trapClient(),
            from: (table: string) => {
                if (table !== 'profiles') throw new Error(`DB touched: from:${table}`)
                return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }
            },
        } as never)
        try {
            const { createInboxTicket } = await import('@/lib/actions/support-inbox')
            const res = await createInboxTicket({ subject: 'Test', categorySlug: 'inbox_inne' } as never)
            expect(res).toEqual({ success: false, error: expect.stringMatching(MOVED) })
        } finally {
            spy.mockRestore()
        }
    })

    it('reguły przekierowań nie są kasowane z Compassa po przeniesieniu urlopów', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'leave')
        const { removeForwardRule, runForwardReconcileNow } = await import('@/lib/actions/leave-forward-admin')
        const removed = await removeForwardRule({ mailbox: 'someone@example.test', ruleId: 'rule-1' })
        expect(removed).toEqual({ removed: false, error: expect.stringMatching(MOVED) })
        const run = await runForwardReconcileNow()
        expect(run.errors[0]).toMatch(MOVED)
        expect(db.touched).toEqual([])
    })

    it('fala 1 (people,leave) odmawia urlopu, ale zapis timesheetu idzie do bazy', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'people,leave')
        const { createLeaveRequest } = await import('@/lib/actions/internal-leave')
        const leave = await createLeaveRequest({ leaveType: 'vacation', startDate: '2026-11-02', endDate: '2026-11-03' } as never)
        expect(leave).toEqual({ success: false, error: expect.stringMatching(MOVED) })
        expect(db.touched).toEqual([])

        const { addEntry } = await import('@/lib/actions/internal-timesheet')
        // Pułapkowa baza rzuca przy pierwszym zapytaniu — akcja doszła za odmowę.
        const entry = await addEntry({ timesheetId: 'ts-1', workDate: '2026-10-20', hours: 8, description: 'Praca' })
        expect(entry.success).toBe(false)
        expect(JSON.stringify(entry)).not.toMatch(MOVED)
        expect(db.touched.length).toBeGreaterThan(0)
    })

    it('nic nie zmienia, gdy przełącznik jest pusty', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', '')
        const { upsertAttendanceDay } = await import('@/lib/actions/internal-attendance')
        // Bez przełącznika akcja idzie dalej i trafia w (pułapkową) bazę.
        await expect(upsertAttendanceDay({ date: '2026-11-02', status: 'active', location: 'remote' } as never)).rejects.toThrow()
        expect(db.touched.length).toBeGreaterThan(0)
    })
})

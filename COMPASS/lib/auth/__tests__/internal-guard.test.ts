import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockSupabaseClient, type MockSupabaseUser } from '@/test/mocks/supabase'

/**
 * Audyt 2026-08 — 19 guardów z lib/auth/internal-guard.ts nie miało ANI JEDNEGO
 * testu: każdy plik testowy akcji podmienia ten moduł własną atrapą
 * (`vi.mock('@/lib/auth/internal-guard', …)`), więc realna macierz uprawnień
 * nigdy się nie wykonywała. Zmiana warunku w guardzie przechodziła przez cały
 * zestaw na zielono, mimo że otwierała strefę HR.
 *
 * Tu jedziemy po prawdziwym module — podmieniamy tylko klienta Supabase.
 * `redirect` z next/navigation jest zamockowany globalnie w test/setup.ts
 * i rzuca `NEXT_REDIRECT:<url>`, więc warianty „Layout" sprawdzamy po celu
 * przekierowania, a warianty „Action" po komunikacie wyjątku.
 */

const supabaseState: { user: MockSupabaseUser | null; profile: Record<string, unknown> | null } = {
    user: null,
    profile: null,
}

vi.mock('@/lib/supabase/server', () => ({
    createClient: () =>
        createMockSupabaseClient({
            user: supabaseState.user,
            tables: { profiles: supabaseState.profile ? [supabaseState.profile] : [] },
        }),
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'

interface Grants {
    has_tcm_access?: boolean
    can_log_overtime?: boolean
    can_view_tech_map?: boolean
    can_view_legal_monitor?: boolean
}

function signedInAs(role: string | null, grants: Grants = {}) {
    supabaseState.user = { id: USER_ID, email: 'kto@b2bnetwork.pl' }
    supabaseState.profile = {
        id: USER_ID,
        role,
        has_tcm_access: grants.has_tcm_access ?? false,
        can_log_overtime: grants.can_log_overtime ?? false,
        can_view_tech_map: grants.can_view_tech_map ?? false,
        can_view_legal_monitor: grants.can_view_legal_monitor ?? false,
    }
}

function signedOut() {
    supabaseState.user = null
    supabaseState.profile = null
}

async function guards() {
    // resetModules przed każdym importem: `loadAuthContext` jest owinięty w
    // `cache()` Reacta, a świeży moduł gwarantuje, że żaden test nie odziedziczy
    // kontekstu poprzedniego.
    vi.resetModules()
    return import('@/lib/auth/internal-guard')
}

/** Zwraca cel przekierowania albo null, gdy guard przepuścił. */
async function redirectTargetOf(fn: () => Promise<unknown>): Promise<string | null> {
    try {
        await fn()
        return null
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const m = msg.match(/^NEXT_REDIRECT:(.*)$/)
        if (!m) throw e
        return m[1]
    }
}

/** Zwraca komunikat odmowy albo null, gdy guard przepuścił. */
async function rejectionOf(fn: () => Promise<unknown>): Promise<string | null> {
    try {
        await fn()
        return null
    } catch (e) {
        return e instanceof Error ? e.message : String(e)
    }
}

beforeEach(() => {
    signedOut()
})

describe('brak sesji', () => {
    it('warianty Layout odsyłają na /login', async () => {
        const g = await guards()
        expect(await redirectTargetOf(g.requireInternalOrAdminLayout)).toBe('/login')
        expect(await redirectTargetOf(g.requireTalentCommunityOrAdminLayout)).toBe('/login')
        expect(await redirectTargetOf(g.requireLifecycleHubLayout)).toBe('/login')
    })

    it('warianty Action rzucają wygaśnięciem sesji, nie zwykłym błędem', async () => {
        const g = await guards()
        const { SessionExpiredError } = await import('@/lib/actions/expected-error')
        await expect(g.requireInternalOrAdminAction()).rejects.toBeInstanceOf(SessionExpiredError)
        await expect(g.requireLifecycleManagerAction()).rejects.toBeInstanceOf(SessionExpiredError)
        await expect(g.requireTechMapViewerAction()).rejects.toBeInstanceOf(SessionExpiredError)
        await expect(g.requireLegalMonitorViewerAction()).rejects.toBeInstanceOf(SessionExpiredError)
    })
})

describe('konsultant IT nie wchodzi do strefy HR', () => {
    it('layout odsyła na /home, akcja odmawia', async () => {
        signedInAs('consultant')
        const g = await guards()
        expect(await redirectTargetOf(g.requireInternalOrAdminLayout)).toBe('/home')
        expect(await rejectionOf(g.requireInternalOrAdminAction)).toMatch(/pracownik wewnętrzny/i)
    })

    it('brak wiersza profilu = konsultant (fallback), nie cichy admin', async () => {
        supabaseState.user = { id: USER_ID, email: 'kto@b2bnetwork.pl' }
        supabaseState.profile = null
        const g = await guards()
        expect(await redirectTargetOf(g.requireInternalOrAdminLayout)).toBe('/home')
    })

    it('grant has_tcm_access NIE otwiera konsultantowi TCM ani lifecycle', async () => {
        // Obrona w głąb: nadawanie grantu jest admin-only, ale zabłąkana flaga
        // na koncie konsultanta nie może otworzyć strefy (lustro SQL: has_lifecycle_access()).
        signedInAs('consultant', { has_tcm_access: true })
        const g = await guards()
        expect(await rejectionOf(g.requireTalentCommunityOrAdminAction)).toMatch(/Talent Community/i)
        expect(await rejectionOf(g.requireLifecycleManagerAction)).toMatch(/Talent Community/i)
        expect(await redirectTargetOf(g.requireLifecycleHubLayout)).toBe('/home')
    })

    it('grant can_view_legal_monitor NIE otwiera konsultantowi monitoringu', async () => {
        signedInAs('consultant', { can_view_legal_monitor: true })
        const g = await guards()
        expect(await rejectionOf(g.requireLegalMonitorViewerAction)).toMatch(/monitoringu prawnego/i)
    })
})

describe('konsultant wewnętrzny (internal)', () => {
    it('wchodzi do strefy HR, ale nie do podstrefy admina', async () => {
        signedInAs('internal')
        const g = await guards()
        expect(await redirectTargetOf(g.requireInternalOrAdminLayout)).toBeNull()
        expect(await redirectTargetOf(g.requireAdminLayout)).toBe('/internal')
        expect(await rejectionOf(g.requireAdminAction)).toMatch(/administratora/i)
    })

    it('nie akceptuje timesheetów, urlopów, premii ani faktur', async () => {
        signedInAs('internal')
        const g = await guards()
        expect(await rejectionOf(g.requireTimesheetApproverAction)).not.toBeNull()
        expect(await rejectionOf(g.requireLeaveApproverAction)).not.toBeNull()
        expect(await rejectionOf(g.requireBonusProposerAction)).not.toBeNull()
        expect(await rejectionOf(g.requireInvoiceReviewerAction)).not.toBeNull()
        expect(await rejectionOf(g.requireFinanseOrAdminAction)).not.toBeNull()
        expect(await redirectTargetOf(g.requireInternalAdminAreaLayout)).toBe('/internal')
    })

    it('grant has_tcm_access otwiera TCM i lifecycle (rola w strefie HR)', async () => {
        signedInAs('internal', { has_tcm_access: true })
        const g = await guards()
        expect(await rejectionOf(g.requireTalentCommunityOrAdminAction)).toBeNull()
        expect(await rejectionOf(g.requireLifecycleManagerAction)).toBeNull()
    })
})

describe('manager', () => {
    it('akceptuje timesheety, urlopy i przypisuje premie', async () => {
        signedInAs('manager')
        const g = await guards()
        expect(await rejectionOf(g.requireTimesheetApproverAction)).toBeNull()
        expect(await rejectionOf(g.requireLeaveApproverAction)).toBeNull()
        expect(await rejectionOf(g.requireBonusProposerAction)).toBeNull()
        expect(await redirectTargetOf(g.requireInternalAdminAreaLayout)).toBeNull()
    })

    it('nie jest adminem, nie zatwierdza faktur w etapie 2 i nie czyta wszystkich premii', async () => {
        signedInAs('manager')
        const g = await guards()
        expect(await rejectionOf(g.requireAdminAction)).not.toBeNull()
        expect(await rejectionOf(g.requireInvoiceReviewerAction)).not.toBeNull()
        expect(await rejectionOf(g.requireBonusReadAllAction)).not.toBeNull()
        expect(await rejectionOf(g.requireFinanseOrAdminAction)).not.toBeNull()
    })
})

describe('finanse', () => {
    it('zatwierdza faktury, czyta premie i stawki', async () => {
        signedInAs('finanse')
        const g = await guards()
        expect(await rejectionOf(g.requireInvoiceReviewerAction)).toBeNull()
        expect(await redirectTargetOf(g.requireInvoiceReviewerLayout)).toBeNull()
        expect(await rejectionOf(g.requireBonusReadAllAction)).toBeNull()
        expect(await rejectionOf(g.requireFinanseOrAdminAction)).toBeNull()
        expect(await rejectionOf(g.requireLegalMonitorViewerAction)).toBeNull()
    })

    it('nie akceptuje urlopów i nie przypisuje premii', async () => {
        signedInAs('finanse')
        const g = await guards()
        expect(await rejectionOf(g.requireLeaveApproverAction)).not.toBeNull()
        expect(await rejectionOf(g.requireBonusProposerAction)).not.toBeNull()
    })
})

describe('talent_community', () => {
    it('ma TCM + lifecycle + mapę technologiczną, ale nie hub Administracji HR', async () => {
        signedInAs('talent_community')
        const g = await guards()
        expect(await rejectionOf(g.requireTalentCommunityOrAdminAction)).toBeNull()
        expect(await rejectionOf(g.requireLifecycleManagerAction)).toBeNull()
        expect(await rejectionOf(g.requireTechMapViewerAction)).toBeNull()
        expect(await redirectTargetOf(g.requireInternalAdminAreaLayout)).toBe('/internal')
    })
})

describe('granty read-only', () => {
    it('can_view_tech_map wpuszcza na zagregowaną kartę klienta bez roli TCM', async () => {
        signedInAs('internal', { can_view_tech_map: true })
        const g = await guards()
        expect(await rejectionOf(g.requireTechMapViewerAction)).toBeNull()
        // …ale nie na pojedyncze karty rozmów (te są lifecycle-only).
        expect(await rejectionOf(g.requireLifecycleManagerAction)).not.toBeNull()
    })

    it('can_view_legal_monitor wpuszcza do huba i na odczyt, bez prawa decyzji', async () => {
        signedInAs('manager', { can_view_legal_monitor: true })
        const g = await guards()
        expect(await rejectionOf(g.requireLegalMonitorViewerAction)).toBeNull()
        expect(await redirectTargetOf(g.requireInternalAdminAreaLayout)).toBeNull()
        // Przegląd wpisu (UPDATE) zostaje przy finanse/admin.
        expect(await rejectionOf(g.requireFinanseOrAdminAction)).not.toBeNull()
    })
})

describe('admin', () => {
    it('przechodzi przez każdy guard', async () => {
        signedInAs('admin')
        const g = await guards()
        for (const layout of [
            g.requireInternalOrAdminLayout,
            g.requireAdminLayout,
            g.requireInvoiceReviewerLayout,
            g.requireTalentCommunityOrAdminLayout,
            g.requireInternalAdminAreaLayout,
            g.requireLifecycleHubLayout,
        ]) {
            expect(await redirectTargetOf(layout)).toBeNull()
        }
        for (const action of [
            g.requireInternalOrAdminAction,
            g.requireAdminAction,
            g.requireTimesheetApproverAction,
            g.requireLeaveApproverAction,
            g.requireManagerInvoiceApproverAction,
            g.requireInvoiceReviewerAction,
            g.requireTalentCommunityOrAdminAction,
            g.requireLegalMonitorViewerAction,
            g.requireLifecycleManagerAction,
            g.requireTechMapViewerAction,
            g.requireBonusProposerAction,
            g.requireBonusReadAllAction,
            g.requireFinanseOrAdminAction,
        ]) {
            expect(await rejectionOf(action)).toBeNull()
        }
    })

    it('kontekst niesie flagi ról i granty', async () => {
        signedInAs('admin', { can_log_overtime: true })
        const g = await guards()
        const ctx = await g.requireInternalOrAdminAction()
        expect(ctx).toMatchObject({
            userId: USER_ID,
            email: 'kto@b2bnetwork.pl',
            role: 'admin',
            isAdmin: true,
            isManager: false,
            isTalentCommunity: false,
            canLogOvertime: true,
        })
    })
})

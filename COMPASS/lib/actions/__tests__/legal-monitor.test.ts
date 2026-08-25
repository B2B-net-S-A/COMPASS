import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

const ctx = { userId: 'finanse-1', email: 'ksiegowa@b2bnetwork.pl', role: 'finanse', isAdmin: false }

vi.mock('@/lib/auth/internal-guard', () => ({
    requireFinanseOrAdminAction: async () => ctx,
    requireLegalMonitorViewerAction: async () => ctx,
}))

vi.mock('@/lib/actions/audit', () => ({ logAudit: vi.fn(async () => {}) }))

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

function pinnedItem(overrides: Record<string, unknown> = {}) {
    return {
        id: 'item-1',
        title: 'Wpis przypięty',
        severity: 'red',
        source: 'TK',
        status: 'new',
        pinned_at: '2026-08-12T08:00:00Z',
        pinned_by: 'admin-1',
        review_note: 'Ustalenia ze spotkania',
        ...overrides,
    }
}

/** Pełny wiersz — eksport CSV dotyka wszystkich kolumn, także słownikowych. */
function exportableItem(overrides: Record<string, unknown> = {}) {
    return {
        id: 'item-1',
        source: 'NSA_WSA',
        source_label: 'WSA w Łodzi',
        topic: 'pip_b2b',
        severity: 'green',
        published_at: '2026-08-04',
        reference: 'I SA/Łd 598/25',
        title: 'Wpis testowy',
        url: null,
        summary: 'Podsumowanie',
        why_it_matters: 'Znaczenie',
        status: 'new',
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
        created_at: '2026-08-12T05:30:00Z',
        due_date: null,
        assigned_to: null,
        alerted_at: null,
        pinned_at: null,
        pinned_by: null,
        ...overrides,
    }
}

function itemsTable(rows: Array<Record<string, unknown>>): MockSupabaseConfig {
    return { tables: { legal_monitor_items: rows } }
}

// Audyt 2026-08: pierwszy test w tym pliku płacił cały koszt zimnego
// `await import('../legal-monitor')` (477 linii, ciągnie next/cache, supabase
// i 6 modułów lib) i przekraczał testTimeout=10s przy obciążonej maszynie —
// zestaw był czerwony lokalnie, choć na runnerach GH przechodził.
// Rozgrzewamy moduł RAZ, poza pomiarem pojedynczego testu: koszt importu
// przestaje obciążać ten test, który akurat jest pierwszy w kolejce.
beforeAll(async () => {
    await import('../legal-monitor')
}, 30_000)

afterEach(() => {
    vi.clearAllMocks()
})

// Pinezka jest ORTOGONALNA do statusu — te testy pilnują obu stron tej reguły,
// bo jest łatwa do zgubienia przy refaktorze payloadu przeglądu.
describe('pinezka a przegląd wpisu', () => {
    it('odrzucenie zdejmuje pinezkę', async () => {
        setup(itemsTable([pinnedItem()]))
        const { reviewLegalMonitorItem } = await import('../legal-monitor')

        await reviewLegalMonitorItem({ id: 'item-1', status: 'dismissed' })

        const row = currentClient._tables.legal_monitor_items[0]
        expect(row.status).toBe('dismissed')
        expect(row.pinned_at).toBeNull()
        expect(row.pinned_by).toBeNull()
    })

    it('oznaczenie jako przejrzane NIE zdejmuje pinezki', async () => {
        setup(itemsTable([pinnedItem()]))
        const { reviewLegalMonitorItem } = await import('../legal-monitor')

        await reviewLegalMonitorItem({ id: 'item-1', status: 'reviewed' })

        const row = currentClient._tables.legal_monitor_items[0]
        expect(row.status).toBe('reviewed')
        expect(row.pinned_at).toBe('2026-08-12T08:00:00Z')
        expect(row.pinned_by).toBe('admin-1')
    })

    it('„do reakcji” też nie zdejmuje pinezki', async () => {
        setup(itemsTable([pinnedItem()]))
        const { reviewLegalMonitorItem } = await import('../legal-monitor')

        await reviewLegalMonitorItem({ id: 'item-1', status: 'action_required' })

        expect(currentClient._tables.legal_monitor_items[0].pinned_at).toBe('2026-08-12T08:00:00Z')
    })

    it('odrzucenie hurtem też zdejmuje pinezkę — i nie kasuje notatek', async () => {
        setup(
            itemsTable([
                pinnedItem({ id: 'a' }),
                pinnedItem({ id: 'b', pinned_at: null, pinned_by: null }),
            ]),
        )
        const { reviewLegalMonitorItems } = await import('../legal-monitor')

        const changed = await reviewLegalMonitorItems(['a', 'b'], 'dismissed')

        expect(changed).toBe(2)
        for (const row of currentClient._tables.legal_monitor_items) {
            expect(row.status).toBe('dismissed')
            expect(row.pinned_at).toBeNull()
            expect(row.pinned_by).toBeNull()
            // Pusta notatka przy operacji zbiorczej nie kasuje ustaleń (Phase 50).
            expect(row.review_note).toBe('Ustalenia ze spotkania')
        }
    })

    it('przegląd hurtem inny niż odrzucenie zostawia pinezkę', async () => {
        setup(itemsTable([pinnedItem({ id: 'a' })]))
        const { reviewLegalMonitorItems } = await import('../legal-monitor')

        await reviewLegalMonitorItems(['a'], 'reviewed')

        expect(currentClient._tables.legal_monitor_items[0].pinned_at).toBe('2026-08-12T08:00:00Z')
    })
})

describe('setLegalMonitorPin', () => {
    it('przypina wpis stemplem i autorem', async () => {
        setup(itemsTable([pinnedItem({ pinned_at: null, pinned_by: null })]))
        const { setLegalMonitorPin } = await import('../legal-monitor')

        await setLegalMonitorPin({ id: 'item-1', pinned: true })

        const row = currentClient._tables.legal_monitor_items[0]
        expect(row.pinned_at).toEqual(expect.any(String))
        expect(row.pinned_by).toBe(ctx.userId)
        // Pinezka nie rusza stanu przeglądu.
        expect(row.status).toBe('new')
    })

    it('zdejmuje pinezkę, zerując oba pola', async () => {
        setup(itemsTable([pinnedItem()]))
        const { setLegalMonitorPin } = await import('../legal-monitor')

        await setLegalMonitorPin({ id: 'item-1', pinned: false })

        const row = currentClient._tables.legal_monitor_items[0]
        expect(row.pinned_at).toBeNull()
        expect(row.pinned_by).toBeNull()
    })

    it('odrzuca pusty identyfikator', async () => {
        setup(itemsTable([pinnedItem()]))
        const { setLegalMonitorPin } = await import('../legal-monitor')

        await expect(setLegalMonitorPin({ id: '  ', pinned: true })).rejects.toThrow(
            /identyfikatora/i,
        )
    })
})

describe('exportLegalMonitorCsv', () => {
    it('ma kolumnę „Przypięty” zaraz po statusie i znaczy nią tylko przypięte', async () => {
        setup(
            itemsTable([
                exportableItem({ id: 'a', title: 'Zwykły' }),
                exportableItem({
                    id: 'b',
                    title: 'Przypięty',
                    pinned_at: '2026-08-12T08:00:00Z',
                }),
            ]),
        )
        const { exportLegalMonitorCsv } = await import('../legal-monitor')

        const csv = await exportLegalMonitorCsv()
        const [header, first, second] = csv.split('\n')

        // BOM siedzi przed pierwszą komórką nagłówka (tego chce Excel) — zdejmujemy
        // go do porównania, zamiast wpisywać w oczekiwaną wartość.
        expect(header.replace('﻿', '').split(',').slice(0, 3)).toEqual([
            '"Pilność"',
            '"Status"',
            '"Przypięty"',
        ])
        // Przypięte idą na górę pliku, tak jak na ekranie.
        expect(first).toContain('"Przypięty"')
        expect(first.split(',')[2]).toBe('"tak"')
        expect(second).toContain('"Zwykły"')
        expect(second.split(',')[2]).toBe('""')
    })

    it('zachowuje BOM i liczbę wierszy przy zaznaczeniu', async () => {
        setup(
            itemsTable([
                exportableItem({ id: 'a' }),
                exportableItem({ id: 'b', pinned_at: '2026-08-12T08:00:00Z' }),
            ]),
        )
        const { exportLegalMonitorCsv } = await import('../legal-monitor')

        const csv = await exportLegalMonitorCsv(['a'])

        expect(csv.startsWith('﻿')).toBe(true)
        expect(csv.split('\n')).toHaveLength(2) // nagłówek + jeden wybrany wiersz
    })
})

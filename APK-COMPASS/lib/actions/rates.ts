'use server'

import { createClient } from '@/lib/supabase/server'
import { chatText } from '@/lib/ai/llm'

interface MarketRate {
    id: string
    position_title: string
    category: string | null
    seniority: string | null
    rate_min: number
    rate_median: number | null
    rate_max: number
    currency: string
    rate_type: string
    source: string | null
    region: string | null
}

interface RateVerification {
    id: string
    position_title: string
    profile_description: string | null
    expected_rate: number
    currency: string
    rate_type: string
    market_rate_min: number | null
    market_rate_max: number | null
    market_rate_median: number | null
    market_sources: string[] | null
    compass_rate_min: number | null
    compass_rate_max: number | null
    compass_rate_avg: number | null
    compass_sample_size: number
    verdict: 'below_market' | 'within_market' | 'above_market' | null
    notes: string | null
    created_at: string
    verified_by: string
}

interface VerifyRateInput {
    position_title: string
    profile_description?: string
    expected_rate: number
    rate_type: 'hourly' | 'monthly'
    currency?: string
}

interface VerifyRateResult {
    market: {
        min: number | null
        median: number | null
        max: number | null
        sources: string[]
        count: number
    }
    compass: {
        min: number | null
        avg: number | null
        max: number | null
        sample_size: number
    }
    verdict: 'below_market' | 'within_market' | 'above_market'
    expected_rate: number
    rate_type: string
    summary: string
}

async function requireCentralaOrAdmin() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!['administrator', 'admin', 'centrala'].includes(profile?.role || '')) {
        throw new Error('Brak dostępu do modułu Stawki')
    }

    return { supabase, user, role: profile?.role || '' }
}

async function requireAdmin() {
    const { supabase, user, role } = await requireCentralaOrAdmin()
    if (!['administrator', 'admin'].includes(role)) {
        throw new Error('Tylko administrator może zarządzać bazą stawek rynkowych')
    }
    return { supabase, user }
}

export async function getMarketRates(filters?: {
    category?: string
    source?: string
    search?: string
}): Promise<MarketRate[]> {
    const { supabase } = await requireCentralaOrAdmin()

    let query = supabase
        .from('market_rates')
        .select('*')
        .order('category', { ascending: true })
        .order('position_title', { ascending: true })

    if (filters?.category) {
        query = query.eq('category', filters.category)
    }
    if (filters?.source) {
        query = query.eq('source', filters.source)
    }
    if (filters?.search) {
        query = query.ilike('position_title', `%${filters.search}%`)
    }

    const { data, error } = await query

    if (error) {
        console.error('[getMarketRates]', error)
        return []
    }

    return data || []
}

export async function getMarketRateCategories(): Promise<string[]> {
    const { supabase } = await requireCentralaOrAdmin()

    const { data, error } = await supabase
        .from('market_rates')
        .select('category')
        .not('category', 'is', null)

    if (error || !data) return []

    const unique = Array.from(new Set(data.map(d => d.category).filter(Boolean))) as string[]
    return unique.sort()
}

export async function getMarketRateSources(): Promise<string[]> {
    const { supabase } = await requireCentralaOrAdmin()

    const { data, error } = await supabase
        .from('market_rates')
        .select('source')
        .not('source', 'is', null)

    if (error || !data) return []

    const unique = Array.from(new Set(data.map(d => d.source).filter(Boolean))) as string[]
    return unique.sort()
}

export async function verifyRate(input: VerifyRateInput): Promise<VerifyRateResult> {
    const { supabase, user } = await requireCentralaOrAdmin()

    const searchTerm = input.position_title.toLowerCase()

    // 1. Search market_rates by position title (fuzzy)
    const { data: marketRates } = await supabase
        .from('market_rates')
        .select('*')
        .ilike('position_title', `%${searchTerm}%`)

    // If no direct match, try broader search with individual keywords
    let matchedRates = marketRates || []
    if (matchedRates.length === 0 && searchTerm.includes(' ')) {
        const keywords = searchTerm.split(/\s+/).filter(k => k.length > 2)
        for (const keyword of keywords) {
            const { data } = await supabase
                .from('market_rates')
                .select('*')
                .ilike('position_title', `%${keyword}%`)
            if (data && data.length > 0) {
                matchedRates = [...matchedRates, ...data]
            }
        }
        // Deduplicate
        const seen = new Set<string>()
        matchedRates = matchedRates.filter(r => {
            if (seen.has(r.id)) return false
            seen.add(r.id)
            return true
        })
    }

    // Normalize rates to the requested type (hourly or monthly)
    const normalizedMarket = matchedRates.map(r => {
        let min = Number(r.rate_min)
        let max = Number(r.rate_max)
        let med = r.rate_median ? Number(r.rate_median) : (min + max) / 2

        if (input.rate_type === 'hourly' && r.rate_type?.includes('monthly')) {
            // monthly -> hourly: divide by 168 (21 days * 8h)
            min = Math.round(min / 168)
            max = Math.round(max / 168)
            med = Math.round(med / 168)
        } else if (input.rate_type === 'monthly' && r.rate_type?.includes('hourly')) {
            // hourly -> monthly: multiply by 168
            min = Math.round(min * 168)
            max = Math.round(max * 168)
            med = Math.round(med * 168)
        }

        return { min, max, med, source: r.source || 'Unknown' }
    })

    const marketSources = Array.from(new Set(normalizedMarket.map(r => r.source)))
    const allMins = normalizedMarket.map(r => r.min).filter(v => v > 0)
    const allMaxs = normalizedMarket.map(r => r.max).filter(v => v > 0)
    const allMeds = normalizedMarket.map(r => r.med).filter(v => v > 0)

    const marketMin = allMins.length > 0 ? Math.min(...allMins) : null
    const marketMax = allMaxs.length > 0 ? Math.max(...allMaxs) : null
    const marketMedian = allMeds.length > 0
        ? Math.round(allMeds.reduce((a, b) => a + b, 0) / allMeds.length)
        : null

    // 2. Search Compass rates (active contracts)
    const { data: contracts } = await supabase
        .from('contracts')
        .select('hourly_rate, monthly_rate')
        .eq('status', 'active')

    let compassRates: number[] = []
    if (contracts && contracts.length > 0) {
        compassRates = contracts
            .map(c => {
                if (input.rate_type === 'hourly') {
                    return c.hourly_rate ? Number(c.hourly_rate) : (c.monthly_rate ? Number(c.monthly_rate) / 168 : 0)
                } else {
                    return c.monthly_rate ? Number(c.monthly_rate) : (c.hourly_rate ? Number(c.hourly_rate) * 168 : 0)
                }
            })
            .filter(r => r > 0)
    }

    const compassMin = compassRates.length > 0 ? Math.round(Math.min(...compassRates)) : null
    const compassMax = compassRates.length > 0 ? Math.round(Math.max(...compassRates)) : null
    const compassAvg = compassRates.length > 0
        ? Math.round(compassRates.reduce((a, b) => a + b, 0) / compassRates.length)
        : null

    // 3. Determine verdict
    const referenceMedian = marketMedian || compassAvg
    let verdict: 'below_market' | 'within_market' | 'above_market' = 'within_market'

    if (referenceMedian) {
        const lowerBound = referenceMedian * 0.85
        const upperBound = referenceMedian * 1.15

        if (input.expected_rate < lowerBound) {
            verdict = 'below_market'
        } else if (input.expected_rate > upperBound) {
            verdict = 'above_market'
        }
    } else if (marketMin !== null && marketMax !== null) {
        if (input.expected_rate < marketMin) {
            verdict = 'below_market'
        } else if (input.expected_rate > marketMax) {
            verdict = 'above_market'
        }
    }

    // 4. Generate AI summary
    const summary = await generateRateSummary({
        position_title: input.position_title,
        profile_description: input.profile_description,
        expected_rate: input.expected_rate,
        rate_type: input.rate_type,
        matchedRates: matchedRates.map(r => ({
            position_title: r.position_title,
            category: r.category,
            seniority: r.seniority,
            rate_min: Number(r.rate_min),
            rate_median: r.rate_median ? Number(r.rate_median) : null,
            rate_max: Number(r.rate_max),
            rate_type: r.rate_type,
            source: r.source,
        })),
        market: { min: marketMin, median: marketMedian, max: marketMax, sources: marketSources, count: normalizedMarket.length },
        compass: { min: compassMin, avg: compassAvg, max: compassMax, sample_size: compassRates.length },
        verdict,
    })

    // 5. Save verification to history
    await supabase.from('rate_verifications').insert({
        verified_by: user.id,
        position_title: input.position_title,
        profile_description: input.profile_description || null,
        expected_rate: input.expected_rate,
        currency: input.currency || 'PLN',
        rate_type: input.rate_type,
        market_rate_min: marketMin,
        market_rate_max: marketMax,
        market_rate_median: marketMedian,
        market_sources: marketSources,
        compass_rate_min: compassMin,
        compass_rate_max: compassMax,
        compass_rate_avg: compassAvg,
        compass_sample_size: compassRates.length,
        verdict,
        notes: summary,
    })

    return {
        market: {
            min: marketMin,
            median: marketMedian,
            max: marketMax,
            sources: marketSources,
            count: normalizedMarket.length,
        },
        compass: {
            min: compassMin,
            avg: compassAvg,
            max: compassMax,
            sample_size: compassRates.length,
        },
        verdict,
        expected_rate: input.expected_rate,
        rate_type: input.rate_type,
        summary,
    }
}

interface MatchedRateDetail {
    position_title: string
    category: string | null
    seniority: string | null
    rate_min: number
    rate_median: number | null
    rate_max: number
    rate_type: string
    source: string | null
}

const RATE_TYPE_PL: Record<string, string> = {
    'hourly': 'godzinowa',
    'monthly': 'miesięczna',
    'monthly_gross_uop': 'mies. brutto UoP',
    'monthly_b2b_netto': 'mies. netto B2B',
    'hourly_b2b_netto': 'godz. netto B2B',
}

const SENIORITY_PL: Record<string, string> = {
    'junior': 'Junior',
    'mid': 'Mid/Regular',
    'senior': 'Senior',
    'specialist': 'Specjalista',
    'manager': 'Manager',
    'director': 'Dyrektor',
    'lead': 'Lead/Principal',
}

function formatMatchedRatesTable(rates: MatchedRateDetail[]): string {
    if (rates.length === 0) return 'Brak dopasowań w raportach płacowych.'

    const grouped = new Map<string, MatchedRateDetail[]>()
    for (const r of rates) {
        const src = r.source || 'Nieznane źródło'
        if (!grouped.has(src)) grouped.set(src, [])
        grouped.get(src)!.push(r)
    }

    const lines: string[] = []
    for (const [source, entries] of Array.from(grouped)) {
        lines.push(`\n📊 ${source}:`)
        for (const e of entries) {
            const seniority = e.seniority ? ` [${SENIORITY_PL[e.seniority] || e.seniority}]` : ''
            const category = e.category ? ` (${e.category})` : ''
            const rateType = RATE_TYPE_PL[e.rate_type] || e.rate_type
            const median = e.rate_median ? `, mediana: ${e.rate_median.toLocaleString('pl-PL')}` : ''
            lines.push(`  • ${e.position_title}${seniority}${category} — ${e.rate_min.toLocaleString('pl-PL')}–${e.rate_max.toLocaleString('pl-PL')} PLN${median} (${rateType})`)
        }
    }
    return lines.join('\n')
}

async function generateRateSummary(input: {
    position_title: string
    profile_description?: string
    expected_rate: number
    rate_type: 'hourly' | 'monthly'
    matchedRates: MatchedRateDetail[]
    market: { min: number | null; median: number | null; max: number | null; sources: string[]; count: number }
    compass: { min: number | null; avg: number | null; max: number | null; sample_size: number }
    verdict: string
}): Promise<string> {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock-key') {
        return 'Podsumowanie AI niedostępne — brak klucza OpenAI.'
    }

    const unit = input.rate_type === 'hourly' ? 'PLN/h' : 'PLN/mies.'
    const verdictPl = input.verdict === 'below_market' ? 'poniżej rynku'
        : input.verdict === 'above_market' ? 'powyżej rynku' : 'w normie rynkowej'

    const ratesTable = formatMatchedRatesTable(input.matchedRates)

    const prompt = `Jesteś ekspertem ds. wynagrodzeń IT w Polsce, pracującym dla firmy outsourcingowej B2B.net.
Analizujesz stawkę konsultanta na podstawie realnych raportów płacowych.

══════════════════════════════════════════
ZAPYTANIE UŻYTKOWNIKA:
- Stanowisko: ${input.position_title}
- Opis profilu: ${input.profile_description || 'brak szczegółów'}
- Oczekiwana stawka: ${input.expected_rate} ${unit}
══════════════════════════════════════════

DOPASOWANE POZYCJE Z RAPORTÓW PŁACOWYCH (${input.matchedRates.length} dopasowań):
${ratesTable}

══════════════════════════════════════════
ZAGREGOWANE STAWKI RYNKOWE (po normalizacji do ${unit}):
- Minimum: ${input.market.min ?? 'brak danych'} ${unit}
- Mediana: ${input.market.median ?? 'brak danych'} ${unit}
- Maksimum: ${input.market.max ?? 'brak danych'} ${unit}

STAWKI WEWNĘTRZNE COMPASS (${input.compass.sample_size} aktywnych kontraktów):
- Minimum: ${input.compass.min ?? 'brak danych'} ${unit}
- Średnia: ${input.compass.avg ?? 'brak danych'} ${unit}
- Maksimum: ${input.compass.max ?? 'brak danych'} ${unit}

WERDYKT SYSTEMU: ${verdictPl}
══════════════════════════════════════════

INSTRUKCJE — sporządź analizę w następującej strukturze:

1. DOPASOWANIE STANOWISKA
   Wymień wszystkie dopasowane nazwy stanowisk z raportów płacowych. Wskaż, które najlepiej odpowiadają zapytaniu użytkownika. Jeśli nazwa w raporcie jest inna niż podana przez użytkownika — wyjaśnij różnicę (np. "W raporcie Hays ta rola figuruje jako «Java Developer», a w Sedlak & Sedlak jako «Programista Java»").

2. ANALIZA STAWEK Z RAPORTÓW
   Dla każdego raportu oddzielnie: podaj widełki, typ stawki (UoP brutto / B2B netto / godzinowa), poziom seniorności. Uwzględnij różnice między raportami. Jeśli typy stawek się różnią (np. UoP vs B2B) — zaznacz to i przelicz orientacyjnie.

3. PORÓWNANIE Z OCZEKIWANĄ STAWKĄ
   Porównaj oczekiwaną stawkę z każdym raportem osobno. Podaj % odchylenia od mediany. Jeśli są dane Compass — porównaj też z wewnętrznymi benchmarkami.

4. REKOMENDACJA
   Podaj konkretną rekomendację: ✅ AKCEPTACJA / ⚠️ NEGOCJACJA / ❌ ODRZUCENIE
   Uzasadnij w 1-2 zdaniach. Wskaż ryzyka lub szanse.

Pisz po polsku, profesjonalnym językiem biznesowym. Bądź konkretny — podawaj liczby i procenty.`

    try {
        const text = await chatText({
            model: 'gpt-4o-mini',
            system: 'Jesteś ekspertem ds. stawek IT w Polsce. Tworzysz profesjonalne analizy stawek na podstawie raportów płacowych (Hays, Sedlak & Sedlak, itp.). Odpowiadasz po polsku, konkretnie, z odniesieniami do źródeł.',
            messages: [{ role: 'user', content: prompt }],
            maxTokens: 1200,
            temperature: 0.3,
        })
        return text || 'Nie udało się wygenerować podsumowania.'
    } catch (err) {
        console.error('[generateRateSummary]', err)
        return 'Błąd generowania podsumowania AI.'
    }
}

export async function getVerificationHistory(): Promise<RateVerification[]> {
    const { supabase } = await requireCentralaOrAdmin()

    const { data, error } = await supabase
        .from('rate_verifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

    if (error) {
        console.error('[getVerificationHistory]', error)
        return []
    }

    return (data || []) as RateVerification[]
}

// ─── Audit log for market_rates changes (Faza 6.4) ────────────────────────────

export interface RateChangeLogEntry {
    id: string
    rate_id: string | null
    action: 'INSERT' | 'UPDATE' | 'DELETE'
    changed_by: string | null
    changed_at: string
    position_title: string | null
    old_rate_min: number | null
    new_rate_min: number | null
    old_rate_median: number | null
    new_rate_median: number | null
    old_rate_max: number | null
    new_rate_max: number | null
    actor_name?: string | null
    actor_email?: string | null
}

/**
 * Audit-log fallback storage. Prod schema does not have a dedicated `rate_change_log`
 * table (its CREATE requires DDL via Supabase SQL Editor — see migration
 * 20260428_rate_change_log.sql). Until the migration is applied, we log market_rates
 * changes into the existing `audit_logs` table with action type `MARKET_RATE_*`
 * and a JSONB `details` payload. After the migration runs, getRateChangeLog tries
 * the dedicated table first and gracefully falls back here.
 */
const RATE_AUDIT_ACTIONS = ['MARKET_RATE_INSERT', 'MARKET_RATE_UPDATE', 'MARKET_RATE_DELETE'] as const

interface AuditLogRow {
    id: string
    user_id: string | null
    action: string
    details: Record<string, unknown> | null
    created_at: string
}

function auditRowToEntry(row: AuditLogRow): RateChangeLogEntry {
    const details = (row.details ?? {}) as Record<string, unknown>
    const action = (row.action.replace('MARKET_RATE_', '') || 'INSERT') as RateChangeLogEntry['action']
    return {
        id: row.id,
        rate_id: (details.rate_id as string) ?? null,
        action,
        changed_by: row.user_id,
        changed_at: row.created_at,
        position_title: (details.position_title as string) ?? null,
        old_rate_min: (details.old_rate_min as number) ?? null,
        new_rate_min: (details.new_rate_min as number) ?? null,
        old_rate_median: (details.old_rate_median as number) ?? null,
        new_rate_median: (details.new_rate_median as number) ?? null,
        old_rate_max: (details.old_rate_max as number) ?? null,
        new_rate_max: (details.new_rate_max as number) ?? null,
    }
}

/**
 * Returns the audit log of all market_rates changes (admin/centrala only).
 * Optionally scoped to a single rate via `rateId`.
 * Defaults to last 100 entries, newest first.
 *
 * Resolution order:
 *   1. Dedicated `rate_change_log` table (populated by trg_rate_change_log trigger
 *      from migration 20260428_rate_change_log.sql).
 *   2. Fallback: `audit_logs` rows with action LIKE 'MARKET_RATE_%' (populated by
 *      logRateChange() — see addMarketRate / deleteMarketRate below).
 */
export async function getRateChangeLog(rateId?: string, limit = 100): Promise<RateChangeLogEntry[]> {
    const { supabase } = await requireCentralaOrAdmin()

    // Try dedicated table first
    let query = supabase
        .from('rate_change_log')
        .select('id, rate_id, action, changed_by, changed_at, position_title, old_rate_min, new_rate_min, old_rate_median, new_rate_median, old_rate_max, new_rate_max')
        .order('changed_at', { ascending: false })
        .limit(limit)

    if (rateId) {
        query = query.eq('rate_id', rateId)
    }

    const dedicated = await query
    let entries: RateChangeLogEntry[]

    if (dedicated.error) {
        // Table does not exist on prod — fall back to audit_logs
        const auditQuery = supabase
            .from('audit_logs')
            .select('id, user_id, action, details, created_at')
            .in('action', RATE_AUDIT_ACTIONS)
            .order('created_at', { ascending: false })
            .limit(limit)

        const { data: auditRows, error: auditErr } = await auditQuery
        if (auditErr) {
            console.error('[getRateChangeLog] both stores failed:', dedicated.error, auditErr)
            return []
        }

        let rows = (auditRows || []) as AuditLogRow[]
        if (rateId) {
            rows = rows.filter(r => (r.details as { rate_id?: string } | null)?.rate_id === rateId)
        }
        entries = rows.map(auditRowToEntry)
    } else {
        entries = (dedicated.data || []) as RateChangeLogEntry[]
    }

    // Hydrate actor names — single batched query for all unique changed_by ids
    const actorIds = Array.from(new Set(entries.map(e => e.changed_by).filter((id): id is string => Boolean(id))))
    if (actorIds.length > 0) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', actorIds)

        const actorMap = new Map((profiles || []).map((p: { id: string; full_name: string | null; email: string | null }) => [p.id, p]))
        for (const e of entries) {
            if (e.changed_by) {
                const a = actorMap.get(e.changed_by)
                if (a) {
                    e.actor_name = a.full_name
                    e.actor_email = a.email
                }
            }
        }
    }

    return entries
}

/**
 * Internal helper — write a market_rates change event to audit_logs.
 * No-op if RLS blocks the insert (graceful degradation).
 */
async function logRateChange(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    action: 'INSERT' | 'UPDATE' | 'DELETE',
    details: Record<string, unknown>,
): Promise<void> {
    try {
        await supabase.from('audit_logs').insert({
            user_id: userId,
            action: `MARKET_RATE_${action}`,
            details,
        })
    } catch (e) {
        console.warn('[logRateChange] could not write audit row:', e)
    }
}

export async function deleteMarketRate(id: string) {
    const { supabase, user } = await requireAdmin()

    // Snapshot before delete for audit
    const { data: snapshot } = await supabase
        .from('market_rates')
        .select('position_title, rate_min, rate_median, rate_max')
        .eq('id', id)
        .maybeSingle()

    const { error } = await supabase
        .from('market_rates')
        .delete()
        .eq('id', id)

    if (error) throw new Error('Błąd usuwania: ' + error.message)

    if (snapshot) {
        await logRateChange(supabase, user.id, 'DELETE', {
            rate_id: id,
            position_title: snapshot.position_title,
            old_rate_min: snapshot.rate_min,
            old_rate_median: snapshot.rate_median,
            old_rate_max: snapshot.rate_max,
        })
    }

    return { success: true }
}

export async function addMarketRate(rate: {
    position_title: string
    category?: string
    seniority?: string
    rate_min: number
    rate_median?: number
    rate_max: number
    currency?: string
    rate_type?: string
    source?: string
    region?: string
}) {
    const { supabase, user } = await requireAdmin()

    const { data: inserted, error } = await supabase
        .from('market_rates')
        .insert({ ...rate, uploaded_by: user.id })
        .select('id')
        .single()

    if (error) throw new Error('Błąd dodawania: ' + error.message)

    if (inserted) {
        await logRateChange(supabase, user.id, 'INSERT', {
            rate_id: inserted.id,
            position_title: rate.position_title,
            new_rate_min: rate.rate_min,
            new_rate_median: rate.rate_median ?? null,
            new_rate_max: rate.rate_max,
        })
    }

    return { success: true }
}

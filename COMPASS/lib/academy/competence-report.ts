// Raport kompetencji (M12). Sama arytmetyka nad wierszami z bazy, bez wyników i procentów.

export type CompetenceRoute = 'live' | 'modules' | 'assessment'
export interface CompetenceRow {
    user_id: string
    full_name: string
    programme_key: string
    programme_title: string
    version_number: number
    route: CompetenceRoute
    completed_at: string
    valid_until: string | null
}
export interface CompetenceFilters { programmeKey?: string; expiringOnly?: boolean }

export const EXPIRING_WITHIN_DAYS = 60
export const ROUTE_LABELS: Record<CompetenceRoute, string> = { live: 'Live', modules: 'Moduły', assessment: 'Test' }

const DAY_MS = 86_400_000
const dateFormat = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Warsaw' })
export const reportDate = (iso: string) => dateFormat.format(new Date(iso))

/** Dni do końca ważności, gdy mieści się w oknie; poza nim i po terminie `null`. */
export function daysToExpiry(validUntil: string | null, now: number): number | null {
    if (!validUntil) return null
    const left = Date.parse(validUntil) - now
    if (!Number.isFinite(left) || left <= 0 || left > EXPIRING_WITHIN_DAYS * DAY_MS) return null
    return Math.ceil(left / DAY_MS)
}

export function filterCompetenceRows(rows: CompetenceRow[], filters: CompetenceFilters, now: number): CompetenceRow[] {
    return rows.filter(row => (!filters.programmeKey || row.programme_key === filters.programmeKey)
        && (!filters.expiringOnly || daysToExpiry(row.valid_until, now) !== null))
}

export function summarizeCompetence(rows: CompetenceRow[], active: number, now: number) {
    const people = new Set(rows.map(row => row.user_id)).size
    const expiring = rows.filter(row => daysToExpiry(row.valid_until, now) !== null)
    const lastExpiring = expiring.map(row => row.valid_until as string).sort().at(-1) ?? null
    return {
        active,
        withCertificate: people,
        inProgress: Math.max(0, active - people),
        programmes: rows.length,
        live: rows.filter(row => row.route === 'live').length,
        modules: rows.filter(row => row.route !== 'live').length,
        expiring: expiring.length,
        lastExpiring,
    }
}

function csvCell(value: string | number) {
    let text = String(value)
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
}

export function competenceCsv(rows: CompetenceRow[]): string {
    const lines = [['Osoba', 'Program', 'Wersja', 'Droga', 'Data', 'Ważne do'], ...rows.map(row => [
        row.full_name, row.programme_title, `v${row.version_number}`, ROUTE_LABELS[row.route], reportDate(row.completed_at), row.valid_until ? reportDate(row.valid_until) : 'bez terminu',
    ])]
    return '﻿' + lines.map(line => line.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

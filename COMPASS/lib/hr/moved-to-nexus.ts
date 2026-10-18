// „Ludzie w NEXUSIE” (decyzja Artura, 16.10.2026) — moduły HR przeniesione do NEXUSA.
//
// Kartoteka, urlopy, czas pracy, płace, wejście i odejście, opieka nad konsultantami
// i skrzynka administracja@ działają w NEXUSIE. Compass zostaje z Akademią. Danych
// Compassa nie kasujemy: przeniesiony moduł przechodzi w archiwum tylko do odczytu.
//
// Przełączanie modułami, bez wdrożenia — zmienne RUNTIME (vault Coolify, restart):
//
//   HR_MOVED_TO_NEXUS  moduły w archiwum: baner na ekranach, odmowa zapisu w akcjach,
//                      oznaczenie w menu, crony pomijają pracę, landing ról HR.
//   HR_EXPORTS_OFF     moduły, których eksporty dla NEXUSA/ATLASA odpowiadają 410.
//                      OSOBNA lista, bo eksport ma oddawać zamrożone dane, dopóki NEXUS
//                      (i ATLAS) nie przełączy źródła. Ta sama lista co wyżej starzałaby
//                      dostępność w NEXUSIE w oknie między „Compass tylko do odczytu”
//                      a „NEXUS = źródło” (runbook przełączenia, krok 2).
//   NEXUS_APP_URL      adres NEXUSA do linków w banerze (bez niego baner nie ma linku).
//
// Pusta lista = nic się nie zmienia (PR można scalić bez skutków).
//
// Plik jest czysty (bez `server-only`, bez Sentry): czyta go middleware na edge,
// akcje, crony i komponenty serwerowe. Komponent kliencki NIE może pytać o przełącznik
// sam — `process.env` w przeglądarce jest pusty i wyszłoby „nic nie przeniesione”.
// Listę dostaje propsem od serwera (`app/(protected)/layout.tsx`).

import { ExpectedError } from '@/lib/actions/expected-error'
import { logger } from '@/lib/logger'

/** Ten sam słownik modułów co w NEXUSIE (`app_settings['hr_modules']`). */
export const HR_MODULES = ['people', 'leave', 'time', 'payroll', 'lifecycle', 'care', 'cases'] as const
export type HrModule = (typeof HR_MODULES)[number]

export const HR_MODULE_LABELS: Readonly<Record<HrModule, string>> = {
    people: 'Kartoteka pracowników',
    leave: 'Urlopy i nieobecności',
    time: 'Obecność i timesheety',
    payroll: 'Stawki, premie i płace',
    lifecycle: 'Wejście i odejście pracowników',
    care: 'Opieka nad konsultantami i mapa technologii',
    cases: 'Skrzynka administracja@',
}

/** Gdzie w NEXUSIE moduł działa teraz (ścieżki frontu NEXUSA). */
export const HR_MODULE_NEXUS_PATHS: Readonly<Record<HrModule, string>> = {
    people: '/people',
    leave: '/my-time',
    time: '/my-time',
    payroll: '/people/payroll',
    lifecycle: '/people',
    care: '/care',
    cases: '/people/cases',
}

export interface ParsedModuleList {
    modules: HrModule[]
    /** Wpisy spoza słownika — literówka w vaulcie nie może przejść bez śladu. */
    unknown: string[]
}

/** `"leave, time;payroll"` → `['leave','time','payroll']`. Wielkość liter i spacje bez znaczenia. */
export function parseHrModuleList(raw: string | null | undefined): ParsedModuleList {
    const modules: HrModule[] = []
    const unknown: string[] = []
    for (const token of (raw ?? '').split(/[\s,;]+/)) {
        const value = token.trim().toLowerCase()
        if (!value) continue
        if ((HR_MODULES as readonly string[]).includes(value)) {
            if (!modules.includes(value as HrModule)) modules.push(value as HrModule)
        } else if (!unknown.includes(value)) {
            unknown.push(value)
        }
    }
    return { modules, unknown }
}

// Ostrzeżenie o nieznanym wpisie raz na wartość zmiennej, a nie przy każdym żądaniu.
const warnedRaw = new Set<string>()

function readList(envName: 'HR_MOVED_TO_NEXUS' | 'HR_EXPORTS_OFF', raw: string | undefined): ReadonlySet<HrModule> {
    const parsed = parseHrModuleList(raw)
    if (parsed.unknown.length > 0 && raw !== undefined && !warnedRaw.has(`${envName}=${raw}`)) {
        warnedRaw.add(`${envName}=${raw}`)
        logger.warn({ event: 'hr_moved.unknown_module', env: envName, unknown: parsed.unknown, known: HR_MODULES })
    }
    return new Set(parsed.modules)
}

/** Moduły w archiwum (tylko do odczytu). Czytane przy każdym wywołaniu — zmiana env + restart wystarcza. */
export function movedModules(): ReadonlySet<HrModule> {
    return readList('HR_MOVED_TO_NEXUS', process.env.HR_MOVED_TO_NEXUS)
}

export function isMovedToNexus(module: HrModule): boolean {
    return movedModules().has(module)
}

/** Moduły, których eksporty (`/api/internal/*`) odpowiadają 410. */
export function exportsOffModules(): ReadonlySet<HrModule> {
    return readList('HR_EXPORTS_OFF', process.env.HR_EXPORTS_OFF)
}

export function isExportOff(module: HrModule): boolean {
    return exportsOffModules().has(module)
}

export function movedToNexusMessage(module: HrModule): string {
    return `Moduł „${HR_MODULE_LABELS[module]}” działa teraz w NEXUSIE. `
        + 'Dane w Compassie zostały jako archiwum tylko do odczytu — tę zmianę wprowadź w NEXUSIE.'
}

/**
 * Jedno miejsce odmowy zapisu w przeniesionym module. Woła je każda akcja zapisu
 * modułu (w `lib/actions/`), na początku ciała — w akcjach z `runAction` wewnątrz
 * callbacku, żeby komunikat dotarł do użytkownika jako dane.
 */
export function assertHrModuleWritable(module: HrModule): void {
    if (isMovedToNexus(module)) throw new ExpectedError(movedToNexusMessage(module))
}

/**
 * Status zatrudnienia po przeniesieniu `lifecycle` prowadzi NEXUS (roster →
 * `nexus-roster-sync`). Wyjątek: konta Akademii z rolą `consultant` — tych osób nie ma
 * w kartotece NEXUSA, więc ich dezaktywacja i przywrócenie zostają w Compassie.
 */
export function assertEmploymentStatusWritable(targetRole: string | null | undefined): void {
    if (targetRole === 'consultant') return
    assertHrModuleWritable('lifecycle')
}

/** Wariant dla akcji, które zwracają `{ success: false, error }` zamiast rzucać. */
export function hrModuleRefusal(module: HrModule): string | null {
    return isMovedToNexus(module) ? movedToNexusMessage(module) : null
}

/** Adres NEXUSA z vaultu, tylko http(s). Bez niego baner mówi „w NEXUSIE” bez linku. */
export function nexusAppUrl(): string | null {
    const raw = process.env.NEXUS_APP_URL?.trim()
    if (!raw) return null
    try {
        const url = new URL(raw)
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
        return url.origin
    } catch {
        return null
    }
}

export function nexusModuleUrl(module: HrModule, base: string | null = nexusAppUrl()): string | null {
    return base ? `${base}${HR_MODULE_NEXUS_PATHS[module]}` : null
}

/**
 * Landing ról HR. Dziś wszystkie cztery (`internal`/`manager`/`finanse`/
 * `talent_community`) lądują w HR Hubie (`/internal`).
 *
 * - TCM idzie do Akademii (`/learning`), gdy WSZYSTKIE moduły HR są w NEXUSIE —
 *   wtedy hub i People Ops to samo archiwum, a TCM ma w Compassie jedną żywą pracę:
 *   globalny edytor Akademii.
 * - `internal`/`manager`/`finanse` zostają na `/internal`: Akademia ich nie wpuszcza
 *   (`requireAcademyContext`, middleware odsyła ich z `/learning` na landing), a hub
 *   pokazuje archiwum z banerem i linkiem do NEXUSA. Inny landing byłby pętlą albo
 *   pustym ekranem.
 */
export function hrLandingPath(role: string | null | undefined, moved: ReadonlySet<HrModule>): string {
    if (role === 'admin' || role === 'consultant' || !role) return '/home'
    if (role === 'talent_community' && HR_MODULES.every((m) => moved.has(m))) return '/learning'
    return '/internal'
}

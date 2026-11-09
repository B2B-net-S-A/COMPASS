// Kontrakt migracji Akademii (B0.12). Każdy merge jedzie na produkcję, a SQL stosuje
// właściciel później, w swoim oknie. Kod musi więc działać, gdy nowego obiektu w bazie
// jeszcze nie ma: akcja mówi „czeka na migrację”, a kanał wyjścia nie wysyła niczego.
// Rytm i kolejka plików: docs/academy/migracje-do-zastosowania.md.
//
// Plik jest czysty (bez `server-only`), bo używa go też granica błędów Akademii.

import { ExpectedError } from '@/lib/actions/expected-error'

export const MIGRATION_PENDING_PL =
    'Ta funkcja czeka na migrację bazy danych. Zostanie włączona po jej zastosowaniu przez administratora.'

/** Dosłowna notka w rejestrze dla migracji, której nie da się cofnąć skryptem. */
export const IRREVERSIBLE_NOTE = 'nieodwracalne, cofamy PITR'

// Same 42P01 i 42703 nie wystarczą. PostgREST sprawdza nazwy w swoim schemacie, zanim
// zapytanie dotrze do Postgresa, więc brak tabeli, kolumny w INSERT albo funkcji RPC
// przychodzi jako PGRST205, PGRST204 albo PGRST202. PGRST200 (relacja) jest celowo
// poza listą: to też znany błąd embedu na istniejącym FK, a nie brak migracji.
const MISSING_OBJECT_CODES: ReadonlySet<string> = new Set([
    '42P01', // undefined_table
    '42703', // undefined_column
    '42883', // undefined_function
    'PGRST202', // funkcji nie ma w schemacie PostgREST
    'PGRST204', // kolumny nie ma w schemacie PostgREST
    'PGRST205', // tabeli nie ma w schemacie PostgREST
])

export function isMissingDatabaseObject(error: { code?: string | null } | null | undefined): boolean {
    return MISSING_OBJECT_CODES.has(error?.code ?? '')
}

/** Dla akcji z `runAction`: brak obiektu to stan oczekiwany, więc komunikat bez zdarzenia w Sentry. */
export function assertMigrationApplied(error: { code?: string | null } | null | undefined): void {
    if (isMissingDatabaseObject(error)) throw new ExpectedError(MIGRATION_PENDING_PL)
}

export interface MigrationRegisterFiles {
    /** Treść pliku z `supabase/migrations` albo null, gdy go nie ma. */
    migration(name: string): string | null
    /** Czy `supabase/rollbacks/<name>` istnieje. */
    rollbackExists(name: string): boolean
}

/** Migracja ma się kończyć blokiem `DO` z `RAISE EXCEPTION`; dopuszczamy po nim tylko COMMIT. */
function endsWithSelfCheck(source: string): boolean {
    const sql = source.replace(/^\s*--.*$/gm, '')
    const opening = Array.from(sql.matchAll(/\bDO\s+(\$\w*\$)/gi)).pop()
    if (!opening || opening.index === undefined) return false
    const tag = opening[1]
    const bodyStart = opening.index + opening[0].length
    const bodyEnd = sql.indexOf(tag, bodyStart)
    if (bodyEnd === -1 || !/RAISE\s+EXCEPTION/i.test(sql.slice(bodyStart, bodyEnd))) return false
    return /^\s*;\s*(COMMIT\s*;)?\s*$/i.test(sql.slice(bodyEnd + tag.length))
}

function cells(line: string): string[] {
    return line.split('|').slice(1, -1).map(cell => cell.trim().replace(/`/g, ''))
}

/** Sprawdza wiersze rejestru (`| lp | plik | PR | cofnięcie | stan |`). Zwraca listę problemów. */
export function migrationRegisterProblems(markdown: string, files: MigrationRegisterFiles): string[] {
    const problems: string[] = []
    const seen = new Set<string>()
    let previous = ''
    for (const line of markdown.split('\n')) {
        if (!/^\|\s*\d+\s*\|/.test(line)) continue
        const [, name, , rollback] = cells(line)
        if (seen.has(name)) problems.push(`${name}: plik wpisany dwukrotnie`)
        seen.add(name)
        if (name < previous) problems.push(`${name}: zła kolejność, plik jest starszy niż poprzedni wiersz`)
        previous = name
        const source = files.migration(name)
        if (source === null) {
            problems.push(`${name}: brak pliku w supabase/migrations`)
            continue
        }
        if (!endsWithSelfCheck(source)) problems.push(`${name}: brak końcowego samosprawdzenia (DO z RAISE EXCEPTION)`)
        const reversible = rollback === `supabase/rollbacks/${name}` && files.rollbackExists(name)
        if (!reversible && rollback !== IRREVERSIBLE_NOTE) problems.push(`${name}: brak skryptu cofnięcia albo notki „${IRREVERSIBLE_NOTE}”`)
    }
    return problems
}

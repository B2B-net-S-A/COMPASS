import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ExpectedError } from '@/lib/actions/expected-error'
import { academyActionError, academyDatabaseError } from '../errors'
import {
    IRREVERSIBLE_NOTE,
    MIGRATION_PENDING_PL,
    assertMigrationApplied,
    isMissingDatabaseObject,
    migrationRegisterProblems,
} from '../migration-contract'

describe('brak obiektu bazy', () => {
    // PostgREST zgłasza brak tabeli jako PGRST205, zanim zapytanie dojdzie do Postgresa,
    // więc same 42P01 i 42703 przepuściłyby najczęstszy przypadek.
    it.each(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'])('rozpoznaje kod %s', code => {
        expect(isMissingDatabaseObject({ code })).toBe(true)
    })

    it.each(['23505', '42501', 'P0001', 'PGRST200', 'PGRST116', '', undefined, null])('nie myli kodu %s z brakiem migracji', code => {
        expect(isMissingDatabaseObject({ code })).toBe(false)
    })

    it('nie zgłasza braku obiektu, gdy błędu nie ma', () => {
        expect(isMissingDatabaseObject(null)).toBe(false)
        expect(isMissingDatabaseObject(undefined)).toBe(false)
    })

    it('w akcji runAction daje komunikat dla użytkownika, a nie awarię', () => {
        expect(() => assertMigrationApplied({ code: 'PGRST205' })).toThrow(ExpectedError)
        expect(() => assertMigrationApplied({ code: 'PGRST205' })).toThrow(MIGRATION_PENDING_PL)
    })

    it('nie przechwytuje innych błędów bazy', () => {
        expect(() => assertMigrationApplied({ code: '23505' })).not.toThrow()
        expect(() => assertMigrationApplied(null)).not.toThrow()
    })

    it('przechodzi przez granicę błędów Akademii bez nazwy tabeli', () => {
        const message = academyDatabaseError({ code: '42P01', message: 'relation "public.academy_outbox" does not exist' })
        expect(message).toBe(MIGRATION_PENDING_PL)
        expect(academyActionError(new Error(message))).toBe(MIGRATION_PENDING_PL)
    })
})

describe('rejestr migracji do zastosowania', () => {
    const selfChecked = "BEGIN;\nCREATE TABLE a(id int);\nDO $$\nBEGIN\n IF to_regclass('a') IS NULL THEN RAISE EXCEPTION 'brak a'; END IF;\nEND $$;\nCOMMIT;\n"
    const files = (migrations: Record<string, string>, rollbacks: string[] = []) => ({
        migration: (name: string) => migrations[name] ?? null,
        rollbackExists: (name: string) => rollbacks.includes(name),
    })
    const row = (lp: number, file: string, rollback: string) => `| ${lp} | \`${file}\` | #1 | ${rollback} | czeka |`

    it('przyjmuje wiersz ze skryptem cofnięcia i wiersz z notką o PITR', () => {
        const markdown = [row(1, '20270101000000_a.sql', '`supabase/rollbacks/20270101000000_a.sql`'), row(2, '20270102000000_b.sql', IRREVERSIBLE_NOTE)].join('\n')
        expect(migrationRegisterProblems(markdown, files({ '20270101000000_a.sql': selfChecked, '20270102000000_b.sql': selfChecked }, ['20270101000000_a.sql']))).toEqual([])
    })

    it('odrzuca wiersz bez pliku migracji', () => {
        expect(migrationRegisterProblems(row(1, '20270101000000_a.sql', IRREVERSIBLE_NOTE), files({}))[0]).toContain('brak pliku')
    })

    it('odrzuca migrację bez końcowego samosprawdzenia', () => {
        const problems = migrationRegisterProblems(row(1, '20270101000000_a.sql', IRREVERSIBLE_NOTE), files({ '20270101000000_a.sql': 'CREATE TABLE a(id int);\n' }))
        expect(problems[0]).toContain('samosprawdzenia')
    })

    it('odrzuca samosprawdzenie, po którym są jeszcze zmiany', () => {
        const source = `${selfChecked.replace('COMMIT;\n', '')}ALTER TABLE a ADD COLUMN b int;\nCOMMIT;\n`
        expect(migrationRegisterProblems(row(1, '20270101000000_a.sql', IRREVERSIBLE_NOTE), files({ '20270101000000_a.sql': source }))[0]).toContain('samosprawdzenia')
    })

    it('odrzuca blok DO bez RAISE EXCEPTION', () => {
        const source = 'CREATE TABLE a(id int);\nDO $$ BEGIN PERFORM 1; END $$;\n'
        expect(migrationRegisterProblems(row(1, '20270101000000_a.sql', IRREVERSIBLE_NOTE), files({ '20270101000000_a.sql': source }))[0]).toContain('samosprawdzenia')
    })

    it('odrzuca wiersz bez cofnięcia i bez notki', () => {
        expect(migrationRegisterProblems(row(1, '20270101000000_a.sql', 'później'), files({ '20270101000000_a.sql': selfChecked }))[0]).toContain('cofnięcia')
    })

    it('odrzuca wskazany skrypt cofnięcia, którego nie ma', () => {
        expect(migrationRegisterProblems(row(1, '20270101000000_a.sql', '`supabase/rollbacks/20270101000000_a.sql`'), files({ '20270101000000_a.sql': selfChecked }))[0]).toContain('cofnięcia')
    })

    it('odrzuca złą kolejność i powtórzenie pliku', () => {
        const markdown = [row(1, '20270102000000_b.sql', IRREVERSIBLE_NOTE), row(2, '20270101000000_a.sql', IRREVERSIBLE_NOTE), row(3, '20270101000000_a.sql', IRREVERSIBLE_NOTE)].join('\n')
        const problems = migrationRegisterProblems(markdown, files({ '20270101000000_a.sql': selfChecked, '20270102000000_b.sql': selfChecked }))
        expect(problems.some(problem => problem.includes('kolejność'))).toBe(true)
        expect(problems.some(problem => problem.includes('dwukrotnie'))).toBe(true)
    })

    it('prawdziwy rejestr w repo spełnia kontrakt', () => {
        const app = process.cwd()
        const markdown = readFileSync(path.resolve(app, '..', 'docs/academy/migracje-do-zastosowania.md'), 'utf8')
        const problems = migrationRegisterProblems(markdown, {
            migration: name => {
                const file = path.resolve(app, 'supabase/migrations', name)
                return existsSync(file) ? readFileSync(file, 'utf8') : null
            },
            rollbackExists: name => existsSync(path.resolve(app, 'supabase/rollbacks', name)),
        })
        expect(problems).toEqual([])
    })
})

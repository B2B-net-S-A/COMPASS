import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Pełny przebieg sprawdza supabase/tests/academy_b5_9_usun_dane_prob.sql na postgres:17.
// Tu pilnujemy w CI tego, co musi zostać prawdą przy każdej przyszłej edycji pliku,
// bo bramka Supabase odtwarza cały katalog migracji po kolei.
const file = '20261109233000_academy_b5_9_usun_dane_prob.sql'
const source = readFileSync(path.resolve(__dirname, '../../../supabase/migrations', file), 'utf8')
const sql = source.replace(/^\s*--.*$/gm, '')

describe('skrypt usuwania danych prób', () => {
    it('bez potwierdzenia kończy się przed pierwszą zmianą danych', () => {
        const guard = sql.indexOf("IF v_confirmation IS DISTINCT FROM 'TAK-USUN-DANE-PROB'")
        expect(guard).toBeGreaterThan(-1)
        expect(sql.slice(guard, sql.indexOf('END IF;', guard))).toContain('RETURN;')
        for (const statement of ['DELETE FROM', 'UPDATE public.', 'ALTER TABLE']) {
            expect(sql.indexOf(statement)).toBeGreaterThan(guard)
        }
    })

    it('nie kasuje treści kursów, w tym kursu-atrapy', () => {
        expect(sql).not.toMatch(/DELETE FROM public\.(courses|course_versions|course_lessons|course_quiz_questions|course_quiz_options)\b/)
        expect(sql).not.toContain('guard_version_snapshot')
        expect(sql).not.toContain('academy_version_immutable')
    })

    it('wyłącza tylko trzy triggery historii ukończeń i każdy włącza z powrotem', () => {
        const disabled = Array.from(sql.matchAll(/DISABLE TRIGGER (\w+)/g), match => match[1]).sort()
        const enabled = Array.from(sql.matchAll(/ENABLE TRIGGER (\w+)/g), match => match[1]).sort()
        expect(disabled).toEqual(['academy_completion_history', 'academy_revocation_history', 'academy_reward_link_history'])
        expect(enabled).toEqual(disabled)
        expect(sql).not.toContain('session_replication_role')
    })

    it('jest jednym blokiem DO, więc błąd cofa całość', () => {
        expect(sql.match(/\bDO\s+\$\$/g)).toHaveLength(1)
        expect(sql.trim().endsWith('END $$;')).toBe(true)
        expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/m)
    })

    it('usuwa konta wyłącznie ze źródła proba', () => {
        expect(sql).toContain("DELETE FROM public.academy_learner_accounts WHERE source='proba'")
        expect(sql).toContain("WHERE source='proba'")
        expect(sql).toContain('DELETE FROM auth.users WHERE id=ANY(v_users)')
    })

    it('wygasza także zatwierdzone wiadomości, nie tylko wstrzymane', () => {
        expect(sql).toContain("SET status='expired' WHERE status IN ('held','approved')")
    })
})

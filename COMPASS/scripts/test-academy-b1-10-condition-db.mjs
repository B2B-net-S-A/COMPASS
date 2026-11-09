// B1.10: warunek bramki startu i zamknięcie odczytu loyalty_rules dla kont bez roli administratora.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ rollout: true, extraMigrations: ['academy_readiness'] });
const { db, sql, actor, owner, engine } = f;
const read = name => fs.readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const ITEM = 'Izolacja konta nauki w warstwie danych: test JWT po pełnym katalogu (B1.10)';
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const rules = async who => { await actor(who); return (await sql('select count(*)::integer c from public.loyalty_rules')).rows[0].c; };
const condition = async () => { await owner(); return (await sql('select owner,status from public.academy_launch_conditions where item=$1', [ITEM])).rows; };

try {
    await owner();
    // Stan produkcji z odczytu katalogu: odczyt dla każdego zalogowanego i zapis dla administratora.
    await db.exec(`ALTER TABLE public.loyalty_rules ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON public.loyalty_rules TO authenticated;
        DROP POLICY IF EXISTS "Enable read loyalty_rules" ON public.loyalty_rules;
        DROP POLICY IF EXISTS "Admins write loyalty_rules" ON public.loyalty_rules;
        CREATE POLICY "Enable read loyalty_rules" ON public.loyalty_rules FOR SELECT USING ((SELECT auth.role())='authenticated');
        CREATE POLICY "Admins write loyalty_rules" ON public.loyalty_rules FOR ALL TO authenticated USING (public.is_admin());`);
    assert.ok(await rules('student') > 0, 'odtworzenie: student czyta zasady punktów'); checks++;
    equal(await condition(), [], 'warunku jeszcze nie ma');

    await owner();
    await db.exec(read('migrations/20261110160300_academy_b1_10_launch_condition.sql'));

    equal(await condition(), [{ owner: 'właściciel', status: 'not_started' }], 'warunek czeka na wynik');
    equal(await rules('student'), 0, 'konto bez roli administratora nie czyta zasad');
    assert.ok(await rules('admin') > 0, 'administrator czyta przez politykę zapisu'); checks++;
    await actor('', 'anon');
    equal((await sql('select count(*)::integer c from public.loyalty_rules')).rows[0].c, 0, 'anon nie widzi zasad');

    // Ponowne zastosowanie niczego nie psuje.
    await owner();
    await db.exec(read('migrations/20261110160300_academy_b1_10_launch_condition.sql'));
    equal((await condition()).length, 1);

    await db.exec(read('rollbacks/20261110160300_academy_b1_10_launch_condition.sql'));
    equal(await condition(), [], 'cofnięcie usuwa warunek');
    assert.ok(await rules('student') > 0, 'cofnięcie przywraca odczyt'); checks++;

    console.log(`Academy B1.10 condition: ${checks} checks (${engine})`);
} finally {
    await db.close();
}

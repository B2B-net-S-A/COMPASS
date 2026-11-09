// B4.5 / G44: limit autora z bazy, odmowa z wykonalnym komunikatem, wyjątek dla redakcji.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ patrykCycle: true });
const { db, ids, sql, actor, owner, rpc, expectDenied } = fixture;
let checks = 0;
const ok = () => { checks++; };
const reserve = 'select public.academy_reserve_material($1,$2,$3,$4,0,$5) r';
const rules = { quiz_required: false, quiz_pass_percent: 80, require_all_lessons: true, attendance_percent: 80 };

try {
    await owner();
    const before = (await sql("select p.oid::regprocedure::text fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc like '%10737418240%' order by 1")).rows.map(row => row.fn);
    assert(before.length >= 2, `expected the hard-coded limit in several functions, got ${before}`); ok();
    await db.exec(fs.readFileSync(fileURLToPath(new URL('../supabase/migrations/20261109213200_academy_author_storage_limit.sql', import.meta.url)), 'utf8'));
    const after = (await sql("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc like '%10737418240%'")).rows[0].n;
    assert.equal(after, 0); ok();
    const patched = (await sql("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc like '%assert_author_storage%'")).rows[0].n;
    assert.equal(patched, before.length); ok();

    await actor('admin');
    await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const course = await rpc('academy_create_course', [{ title: 'Limit', category: 'IT', completion_rules: rules }]);
    const lesson = (await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md)values($1,$2,'Video',0,'Opis')returning id", [course.course_id, course.version_id])).rows[0].id;

    await owner();
    await sql('update academy_storage_settings set author_limit_bytes=200');
    await actor('trainer');
    await sql(reserve, [course.course_id, 'One.mp4', 'video/mp4', 150, lesson]); ok();
    const error = await expectDenied(reserve, [course.course_id, 'Two.mp4', 'video/mp4', 100, lesson], /Przekroczony limit materiałów autora/);
    assert.match(error.message, /Usuń niepotrzebne materiały albo poproś administratora Akademii o podniesienie limitu/); ok();

    // Raising the value in the database unblocks the same upload.
    await owner();
    await sql('update academy_storage_settings set author_limit_bytes=400');
    await actor('trainer');
    await sql(reserve, [course.course_id, 'Two.mp4', 'video/mp4', 100, lesson]); ok();

    // Editorial roles are not limited, regular authors stay limited.
    await owner();
    await sql('update academy_storage_settings set author_limit_bytes=1');
    await actor('admin');
    await sql(reserve, [course.course_id, 'Admin.mp4', 'video/mp4', 1000, lesson]); ok();
    await actor('trainer');
    await expectDenied(reserve, [course.course_id, 'Three.mp4', 'video/mp4', 10, lesson], /Przekroczony limit/); ok();

    // Settings are not readable or writable through the Data API roles.
    await actor('admin');
    await expectDenied('select author_limit_bytes from academy_storage_settings', [], /permission denied/); ok();
    await expectDenied('update academy_storage_settings set author_limit_bytes=999', [], /permission denied/); ok();

    console.log(`Academy author storage limit DB checks passed: ${checks}`);
} finally {
    await db.close();
}

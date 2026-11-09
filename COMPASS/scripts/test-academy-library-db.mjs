// B4.7 / G47: podsumowanie biblioteki nie ujawnia kursów niepublikowanych, pola ustawia tylko zarządzający.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ materials: true });
const { db, ids, sql, actor, owner, rpc, expectDenied } = fixture;
let checks = 0;
const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
const denied = async (...args) => { await expectDenied(...args); checks++; };
const rules = { quiz_required: false, quiz_pass_percent: 80, require_all_lessons: true, attendance_percent: 80 };
const summary = 'select * from public.academy_library_summary($1::uuid[])';
const setFields = 'select public.academy_set_course_library_fields($1,$2,$3)';

try {
    await db.exec(fs.readFileSync(fileURLToPath(new URL('../supabase/migrations/20261109213400_academy_library.sql', import.meta.url)), 'utf8'));
    await actor('admin'); await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const draft = await rpc('academy_create_course', [{ title: 'Szkic', category: 'IT', completion_rules: rules }]);
    const published = await rpc('academy_create_course', [{ title: 'Biblioteka', category: 'IT', completion_rules: rules }]);
    for (let i = 0; i < 2; i++) await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md,estimated_minutes)values($1,$2,$3,$4,'Tekst',15)", [published.course_id, published.version_id, `L${i}`, i]);
    await rpc('academy_submit_for_review', [published.course_id]);
    await actor('admin'); await rpc('academy_review_course', [published.version_id, true, null]);

    await actor('student');
    const rows = (await sql(summary, [[published.course_id, draft.course_id]])).rows;
    eq(rows.length, 1);
    eq([rows[0].course_id, rows[0].modules, rows[0].minutes, rows[0].videos, rows[0].materials], [published.course_id, 2, 30, 0, 0]);

    // Only someone who manages the course sets its library fields.
    await denied(setFields, [published.course_id, 'DORA', null], /trainer_course_required/);
    await actor('', 'anon'); await denied(setFields, [published.course_id, 'DORA', null]);
    await actor('trainer');
    await denied(setFields, [published.course_id, '   ', null], /invalid_course_topic/);
    await denied(setFields, [published.course_id, 'x'.repeat(101), null], /invalid_course_topic/);
    await denied(setFields, [published.course_id, 'DORA', ids.admin], /programme_not_found/);
    await sql(setFields, [published.course_id, ' DORA ', null]);
    await owner();
    eq((await sql('select topic from courses where id=$1', [published.course_id])).rows[0].topic, 'DORA');

    // A programme links two courses and has no direct write path for learners.
    const programme = (await sql("insert into academy_programmes(title)values('Program DORA')returning id")).rows[0].id;
    await actor('trainer'); await sql(setFields, [published.course_id, 'DORA', programme]);
    await owner();
    eq((await sql('select programme_id from courses where id=$1', [published.course_id])).rows[0].programme_id, programme);
    await actor('student');
    await denied("insert into academy_programmes(title)values('Fałszywy')");

    console.log(`Academy library DB checks passed: ${checks}`);
} finally {
    await db.close();
}

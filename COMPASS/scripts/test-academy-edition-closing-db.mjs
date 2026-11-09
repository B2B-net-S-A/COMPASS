// B3.8: the in-app bell after an edition, with its refusals. It never touches the outbox.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ patrykCycle: true });
const { db, ids, sql, actor, owner, rpc } = f;
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const denied = async (...args) => { await f.expectDenied(...args); checks++; };
const hours = h => new Date(Date.now() + h * 3600000).toISOString();

try {
 const dir = new URL('../supabase/migrations/', import.meta.url);
 for (const suffix of ['_academy_tcm_full_editor.sql', '_academy_edition_closed_notify.sql']) {
  const names = fs.readdirSync(dir).filter(n => n.endsWith(suffix));
  equal(names.length, 1, suffix);
  await db.exec(fs.readFileSync(new URL(names[0], dir), 'utf8'));
 }
 await actor('admin'); await rpc('academy_set_rollout', ['open', []]); await rpc('academy_set_trainer', [ids.trainer, true]);
 await actor('trainer'); const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title: 'Closing course', category: 'IT', delivery_mode: 'live' }]);
 await rpc('academy_update_course', [course, { completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80 } }]);
 await rpc('academy_submit_for_review', [course]); await actor('admin');
 const token = (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id; await rpc('academy_review_course', [version, true, null, token]);
 await actor('trainer'); const run = await rpc('academy_create_run', [{ courseId: course, versionId: version, title: 'Closing run', capacity: 5 }]);
 const session = await rpc('academy_save_session', [{ runId: run, title: 'Teams', startsAt: hours(24), endsAt: hours(27), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/9', required: true }]);
 await denied('select academy_notify_edition_closed($1)', [run], /administrator lub TCM/);
 await actor('admin'); await denied('select academy_notify_edition_closed($1)', [run], /opublikowanej edycji/);
 await rpc('academy_publish_run', [run]);
 await actor('student'); await rpc('academy_register_run', [run]);
 await actor('admin'); await denied('select academy_notify_edition_closed($1)', [run], /po zakończeniu wszystkich spotkań/);
 await owner(); await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1', [session, hours(-3), hours(-1)]);
 await actor('admin'); equal(await rpc('academy_notify_edition_closed', [run]), 1);
 equal(await rpc('academy_notify_edition_closed', [run]), 0, 'A repeated click does not repeat the bell');
 await owner();
 equal((await sql("select count(*)::int n from notifications where user_id=$1 and title_pl like 'Szkolenie zakończone%'", [ids.student])).rows[0].n, 1);
 await actor('', 'anon'); await denied('select academy_notify_edition_closed($1)', [run]);
 await owner();
 await db.exec(fs.readFileSync(new URL('../supabase/rollbacks/20261109113000_academy_edition_closed_notify.sql', import.meta.url), 'utf8'));
 equal((await sql("select to_regprocedure('public.academy_notify_edition_closed(uuid)') p")).rows[0].p, null);
 console.log(`academy edition closing: ${checks} checks passed`);
} finally {
 await db.close();
}

// B3.12: the audience decision record, with its refusals.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ patrykCycle: true });
const { db, ids, sql, actor, owner, rpc: fixtureRpc } = f;
const rpc = (name, args = []) => fixtureRpc(name, name === 'academy_record_run_audience' ? args.map((v, i) => i === 1 && typeof v !== 'string' ? JSON.stringify(v) : v) : args);
const denied = (statement, args, message) => f.expectDenied(statement, args, message);
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const statement = 'select academy_record_run_audience($1,$2::jsonb,$3,$4)';
const filter = JSON.stringify({ includeNexus: true });

try {
 const dir = new URL('../supabase/migrations/', import.meta.url);
 for (const suffix of ['_academy_tcm_full_editor.sql', '_academy_run_audience.sql']) {
  const names = fs.readdirSync(dir).filter(n => n.endsWith(suffix));
  equal(names.length, 1, suffix);
  await db.exec(fs.readFileSync(new URL(names[0], dir), 'utf8'));
 }
 await actor('admin'); await rpc('academy_set_rollout', ['open', []]); await rpc('academy_set_trainer', [ids.trainer, true]);
 await actor('trainer'); const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title: 'Audience course', category: 'IT', delivery_mode: 'live' }]);
 await rpc('academy_update_course', [course, { completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80 } }]);
 await rpc('academy_submit_for_review', [course]); await actor('admin');
 const token = (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id; await rpc('academy_review_course', [version, true, null, token]);
 await actor('trainer'); const run = await rpc('academy_create_run', [{ courseId: course, versionId: version, title: 'Audience run', capacity: 5 }]);
 await rpc('academy_save_session', [{ runId: run, title: 'Teams', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/9', required: true }]);
 await denied(statement, [run, filter, 2, []], /administrator lub TCM/); checks++;
 await actor('admin'); await denied(statement, [run, filter, 2, []], /opublikowanej edycji/); checks++;
 await rpc('academy_publish_run', [run]);
 await denied(statement, [run, filter, 0, []], /Nieprawidłowy wybór/); checks++;
 await denied(statement, [run, filter, 1001, []], /Nieprawidłowy wybór/); checks++;
 const id = await rpc('academy_record_run_audience', [run, { includeNexus: true }, 55, ['x@example.test']]);
 assert.ok(id); checks++;
 equal((await sql('select recipient_count,excluded_emails,chosen_by from academy_run_audience where id=$1', [id])).rows, [{ recipient_count: 55, excluded_emails: ['x@example.test'], chosen_by: ids.admin }]);
 equal((await sql("select count(*)::int n from academy_audit_events where action='ACADEMY_RUN_AUDIENCE_CHOSEN'")).rows[0].n, 1);
 await actor('student'); equal((await sql('select count(*)::int n from academy_run_audience')).rows[0].n, 0, 'RLS hides the record from learners');
 await actor('', 'anon'); await denied(statement, [run, filter, 2, []]); checks++;
 await owner();
 await db.exec(fs.readFileSync(new URL('../supabase/rollbacks/20261109121000_academy_run_audience.sql', import.meta.url), 'utf8'));
 equal((await sql("select to_regclass('public.academy_run_audience') t")).rows[0].t, null);
 console.log(`academy run audience: ${checks} checks passed`);
} finally {
 await db.close();
}

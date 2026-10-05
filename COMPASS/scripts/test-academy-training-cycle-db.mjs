// Combined upgrade/ACL gate: all cycle migrations coexist in the hosted fixture.
import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';
import { TABLES } from '../../ops/academy/restore/verify.mjs';

const f = await createAcademyDatabase({ patrykCycle: true });
try {
    await f.owner();
    const tables = (await f.sql(`SELECT n.nspname||'.'||c.relname AS name FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND
        ((n.nspname='public' AND (c.relname ~ '^academy_' OR c.relname ~ '^course_'
        OR c.relname='courses' OR c.relname ~ '^learning_path' OR c.relname='session_attendance'))
        OR n.nspname='academy_private') ORDER BY n.nspname,c.relname`)).rows.map(row => row.name);
    assert.deepEqual(tables, TABLES, 'combined_cycle_restore_inventory_must_cover_actual_schema');
    const additions = ['public.academy_handovers', 'public.academy_webinar_roster',
        'public.academy_webinar_import_batches', 'public.academy_webinar_attendance',
        'public.academy_edition_survey_settings', 'public.academy_edition_survey_responses',
        'academy_private.edition_teaching_interest'];
    for (const table of additions) {
        const access = (await f.sql(`SELECT relrowsecurity AS rls,
            has_table_privilege('anon',$1,'SELECT') AS anon_read,
            has_table_privilege('authenticated',$1,'INSERT,UPDATE,DELETE') AS browser_write,
            has_table_privilege('service_role',$1,'SELECT') AS operator_read
            FROM pg_class WHERE oid=$1::regclass`, [table])).rows[0];
        assert.equal(access.rls, true, table + ':RLS');
        assert.equal(access.anon_read, false, table + ':anonymous_denied');
        assert.equal(access.browser_write, false, table + ':guarded_RPC_only');
        assert.equal(access.operator_read, true, table + ':service_export_available');
    }
    await f.actor('student');
    await f.expectDenied('SELECT academy_gdpr_teaching_interest($1)', [f.ids.student]);
    await f.expectDenied('SELECT * FROM academy_private.edition_teaching_interest');
    await f.service();
    assert.deepEqual(await f.rpc('academy_gdpr_teaching_interest', [f.ids.student]), []);
    console.log('PASS combined training-cycle upgrade, full 46-table inventory and new-data ACLs');
} finally { await f.db.close(); }

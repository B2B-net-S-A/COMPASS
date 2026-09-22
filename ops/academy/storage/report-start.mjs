import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
export function projectStart(mode, status, log, migrationCount) {
    const migrations = [...log.matchAll(/Applying migration ([a-zA-Z0-9_.-]+\.sql)/g)];
    const lastMigration = migrations.at(-1)?.[1] ?? null;
    const postgres = log.match(/(?:ERROR:\s*)?([^\r\n]{1,400})\s*\(SQLSTATE ([A-Z0-9]{5})\)/);
    const sqlState = postgres?.[2] ?? null;
    const skipped = [...log.matchAll(/Skipping migration ([a-zA-Z0-9_.-]+\.sql)/g)].map(item=>item[1]);
    const applied = new Set(migrations.map(item=>item[1])).size;
    const complete = mode !== 'historical-replay' || (skipped.length===0 && applied===migrationCount && migrationCount>0);
    const passed = status===0 && complete;
    const firstError = postgres?.[1]?.replace(/\x1b\[[0-9;]*m/g,'').replace(/'[^']*'/g,"'<redacted>'").replace(/[A-Za-z0-9+/_=-]{64,}/g,'<redacted>').slice(0,300) ?? null;
    // Keep only the first PostgreSQL diagnostic line, with string literals and long
    // token-like values redacted. SQL statements and the remaining raw log stay private.
    return {
        mode, outcome: passed ? 'passed' : 'failed', exitCode: status, appliedMigrationFiles: applied, skippedMigrationFiles: skipped,
        historicalMigrationFiles: mode === 'historical-replay' ? migrationCount : null,
        migrationRegistry: mode === 'historical-replay' ? 'disposable_unique_ids_original_sql_order_unchanged' : 'fixture_only',
        fullHistoricalReplay: mode === 'historical-replay' ? (passed ? 'passed' : 'failed') : 'not_run_in_fixture_job',
        lastMigration, sqlState, firstError,
        failureCategory: passed ? null : status===0&&!complete ? 'incomplete_historical_replay' : sqlState ? 'postgres_migration_error' : /duplicate|same version/i.test(log) ? 'migration_registry_collision' : status === 124 ? 'startup_timeout' : 'supabase_start_or_migration_failure',
    };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [, , mode, status, path, directory] = process.argv;
    const report = projectStart(mode, Number(status), fs.readFileSync(path, 'utf8'), fs.readdirSync(directory).filter(name => name.endsWith('.sql')).length);
    console.log(JSON.stringify(report));
    if(report.outcome==='failed')process.exitCode=1;
    if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Supabase ${mode}\n\n\`\`\`json\n${JSON.stringify(report,null,2)}\n\`\`\`\n\nFixture Academy is not a full historical replay. A failed historical replay remains a failing release gate.\n`);
}

/** Bounded Academy upgrade baseline, captured from read-only production catalogs.
 * This is deliberately not a database dump/reconstruction tool. The fixed SQL
 * allowlist and reviewed snapshot define its entire application object scope.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const snapshotUrl = new URL('../../../docs/academy/canonical-dependency-contract.json', import.meta.url);
export const canonicalQuery = fs.readFileSync(new URL('./canonical-contract.sql', import.meta.url), 'utf8');
const snapshotBytes = fs.readFileSync(snapshotUrl);
export const canonicalSnapshotSha256 = createHash('sha256').update(snapshotBytes).digest('hex');
assert.equal(canonicalSnapshotSha256, '122441ebf41d77443819364c12252bab3d70aaede3d17c278d66337d7f35b085', 'canonical_snapshot_changed_requires_explicit_review');
export const canonicalSnapshot = JSON.parse(snapshotBytes);
const ident = value => '"' + String(value).replaceAll('"', '""') + '"';
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const role = value => value === 'PUBLIC' || value === 'public' ? 'PUBLIC' : ident(value);
const applicationRoles = ['PUBLIC', 'anon', 'authenticated', 'service_role'];
const privilege = value => {
    assert(['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN','EXECUTE','USAGE'].includes(value), 'unexpected_catalog_privilege');
    return value;
};

function normalized(value) {
    if (Array.isArray(value)) return value.map(normalized);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key,
        key === 'grants' || key === 'columnGrants'
            ? item.map(normalized).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
            : normalized(item)]));
}

/** Incoming HR FKs/event triggers are inventoried, not synthesized. See the
 * contract document for why they cannot fire on this bounded upgrade path.
 * Only postgres-owned defaults apply: both the hosted and deployed migrations
 * must run as postgres, never silently as a different migration principal.
 */
export function comparableContract(contract) {
    return normalized({tables:contract.tables, enums:contract.enums, functions:contract.functions,
        defaultPrivileges:contract.defaultPrivileges.filter(row => row.owner === 'postgres')});
}

export async function assertCanonicalBaseline(db) {
    const identity = (await db.query('select current_user as actor,current_setting(\'server_version_num\')::integer as version')).rows[0];
    assert.equal(identity.actor, 'postgres', 'canonical_upgrade_requires_postgres_migration_principal');
    assert.equal(Math.floor(identity.version / 10000), 17, 'canonical_upgrade_requires_postgresql_17');
    const actual = (await db.query(canonicalQuery)).rows[0].contract;
    assert.deepEqual(comparableContract(actual), comparableContract(canonicalSnapshot.contract), 'canonical_academy_dependency_drift');
    return {snapshotSha256:canonicalSnapshotSha256, tables:actual.tables.length, functions:actual.functions.length,
        enums:actual.enums.length, postgresMajor:17, dependencyParity:true};
}

export async function installCanonicalBaseline(db) {
    assert.equal(canonicalSnapshot.format, 1);
    assert.equal(canonicalSnapshot.source.project, 'shduiynzemftkqqefscd');
    const contract = canonicalSnapshot.contract;
    assert.equal(contract.tables.length, 18, 'review_scope_before_adding_objects');
    await db.exec('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;');
    for (const type of contract.enums) await db.exec(`CREATE TYPE public.${ident(type.name)} AS ENUM (${type.labels.map(literal).join(',')});`);
    for (const table of contract.tables) {
        assert.equal(table.owner, 'postgres');
        assert(table.columns.every(column => !column.identity && !column.generated), 'identity_or_generated_column_requires_review');
        await db.exec(`CREATE TABLE public.${ident(table.name)} (${table.columns.map(column =>
            `${ident(column.name)} ${column.type}${column.default === null ? '' : ' DEFAULT ' + column.default}${column.notNull ? ' NOT NULL' : ''}`).join(',')});`);
    }
    // All referenced tables and unique keys exist before foreign keys are added.
    for (const foreign of [false,true]) for (const table of contract.tables) for (const constraint of table.constraints.filter(c => (c.type === 'f') === foreign)) {
        await db.exec(`ALTER TABLE public.${ident(table.name)} ADD CONSTRAINT ${ident(constraint.name)} ${constraint.definition};`);
    }
    for (const table of contract.tables) for (const index of table.indexes) await db.exec(index.definition + ';');
    for (const fn of contract.functions) {
        assert.equal(fn.owner, 'postgres');
        await db.exec(fn.definition);
        await db.exec(`REVOKE ALL ON FUNCTION public.${fn.signature} FROM ${applicationRoles.map(role).join(',')};`);
        for (const grant of fn.grants) await db.exec(`GRANT ${privilege(grant.privilege)} ON FUNCTION public.${fn.signature} TO ${role(grant.grantee)}${grant.grantable ? ' WITH GRANT OPTION' : ''};`);
    }
    for (const table of contract.tables) {
        const target = 'public.' + ident(table.name);
        for (const trigger of table.triggers) {
            assert.equal(trigger.enabled, 'O', 'nonstandard_trigger_mode_requires_review');
            await db.exec(trigger.definition + ';');
        }
        if (table.rowSecurity) await db.exec(`ALTER TABLE ${target} ENABLE ROW LEVEL SECURITY;`);
        if (table.forceRowSecurity) await db.exec(`ALTER TABLE ${target} FORCE ROW LEVEL SECURITY;`);
        for (const policy of table.policies) {
            assert(['ALL','SELECT','INSERT','UPDATE','DELETE'].includes(policy.command));
            assert(['PERMISSIVE','RESTRICTIVE'].includes(policy.permissive));
            await db.exec(`CREATE POLICY ${ident(policy.name)} ON ${target} AS ${policy.permissive} FOR ${policy.command} TO ${policy.roles.map(role).join(',')}${policy.using ? ' USING (' + policy.using + ')' : ''}${policy.check ? ' WITH CHECK (' + policy.check + ')' : ''};`);
        }
        await db.exec(`REVOKE ALL ON TABLE ${target} FROM ${applicationRoles.map(role).join(',')};`);
        for (const grant of table.grants) await db.exec(`GRANT ${privilege(grant.privilege)} ON TABLE ${target} TO ${role(grant.grantee)}${grant.grantable ? ' WITH GRANT OPTION' : ''};`);
        for (const grant of table.columnGrants) await db.exec(`GRANT ${privilege(grant.privilege)} (${ident(grant.column)}) ON TABLE ${target} TO ${role(grant.grantee)}${grant.grantable ? ' WITH GRANT OPTION' : ''};`);
    }
    for (const entry of contract.defaultPrivileges.filter(row => row.owner === 'postgres')) {
        assert.equal(entry.schema, 'public', 'non_public_default_privileges_require_review');
        const object = {r:'TABLES',S:'SEQUENCES',f:'FUNCTIONS'}[entry.objectType];
        assert(object, 'unexpected_default_privilege_object');
        for (const grant of entry.grants) await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ${privilege(grant.privilege)} ON ${object} TO ${role(grant.grantee)}${grant.grantable ? ' WITH GRANT OPTION' : ''};`);
    }
    return assertCanonicalBaseline(db);
}

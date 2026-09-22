import assert from 'node:assert/strict';

const schemas = ['public', 'academy_private'];
const ident = value => '"' + String(value).replaceAll('"', '""') + '"';
const grantee = value => value === 'PUBLIC' ? 'PUBLIC' : ident(value);
const objectTypes = { r: 'TABLES', S: 'SEQUENCES', f: 'FUNCTIONS', T: 'TYPES', n: 'SCHEMAS' };
const privilegeNames = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN', 'USAGE', 'CREATE', 'EXECUTE']);
const aclJson = expression => `(select coalesce(jsonb_agg(jsonb_build_object(
    'grantee',case when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end,
    'privilege',a.privilege_type,'grantable',a.is_grantable)
    order by a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb)
    from pg_catalog.aclexplode(${expression}) a)`;

export async function readFixtureDefaultPrivileges(sql) {
    return (await sql.query(`select pg_catalog.pg_get_userbyid(d.defaclrole) as owner,
        n.nspname::text as schema,d.defaclobjtype::text as kind,
        ${aclJson('d.defaclacl')} as privileges,
        ${aclJson("pg_catalog.acldefault(case when d.defaclobjtype='S' then 's'::\"char\" else d.defaclobjtype end,d.defaclrole)")} as baseline
        from pg_catalog.pg_default_acl d left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
        where d.defaclrole=current_user::regrole and (d.defaclnamespace=0 or n.nspname=any($1::text[]))
        order by d.defaclnamespace,d.defaclobjtype`, [schemas])).rows;
}

async function replaceDefaultPrivileges(sql, row, current, wanted) {
    assert(objectTypes[row.kind], 'unsupported_fixture_default_acl');
    assert(row.schema === null || schemas.includes(row.schema), 'native_schema_default_acl_forbidden');
    const prefix = `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(row.owner)}${row.schema ? ' IN SCHEMA ' + ident(row.schema) : ''}`;
    for (const role of new Set(current.map(entry => entry.grantee))) {
        await sql.query(`${prefix} REVOKE ALL ON ${objectTypes[row.kind]} FROM ${grantee(role)}`);
    }
    for (const entry of wanted) {
        assert(privilegeNames.has(entry.privilege), 'invalid_fixture_acl_privilege');
        await sql.query(`${prefix} GRANT ${entry.privilege} ON ${objectTypes[row.kind]} TO ${grantee(entry.grantee)}${entry.grantable ? ' WITH GRANT OPTION' : ''}`);
    }
}

async function resetDefaultPrivileges(sql, rows) {
    for (const row of rows) await replaceDefaultPrivileges(sql, row, row.privileges, row.schema === null ? row.baseline : []);
}

/** Only for the disposable hosted import (or an in-memory regression).
 * pg_dump emits ACL deltas against PostgreSQL defaults, not target Supabase
 * default grants. Normalize those defaults while CREATE runs, then restore the
 * exact snapshot. A failed import rolls back both its objects and the defaults.
 * Existing objects, including native auth/storage ACLs, are never changed.
 */
export async function withFixtureDefaultPrivileges(sql, importSchema) {
    await sql.query('BEGIN');
    try {
        const before = await readFixtureDefaultPrivileges(sql);
        await resetDefaultPrivileges(sql, before);
        const result = await importSchema();
        // The dump can itself contain ALTER DEFAULT PRIVILEGES statements.
        await resetDefaultPrivileges(sql, await readFixtureDefaultPrivileges(sql));
        for (const row of before) await replaceDefaultPrivileges(sql, row, row.schema === null ? row.baseline : [], row.privileges);
        assert.deepEqual(await readFixtureDefaultPrivileges(sql), before, 'fixture_default_acl_restore_mismatch');
        await sql.query('COMMIT');
        return result;
    } catch (error) {
        await sql.query('ROLLBACK');
        throw error;
    }
}

/** Include acldefault when the catalog ACL is NULL, plus the effective rights
 * of the three API roles (which also account for PUBLIC and role membership).
 * The caller compares source objects only: native target extensions stay intact.
 * The bounded baseline now includes vector columns. Their native extension
 * functions are not application dump objects and retain the target's own ACLs;
 * every non-extension application function remains in this comparison.
 */
export async function readFixtureObjectPrivileges(sql) {
    const previous = (await sql.query("select current_setting('search_path') as value")).rows[0].value;
    await sql.query("select set_config('search_path','pg_catalog',false)");
    try {
        const functions = (await sql.query(`select 'function:'||format('%I.%I(%s)',n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)) as object,
            ${aclJson("coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))")} as privileges,
            (select jsonb_object_agg(role,pg_catalog.has_function_privilege(role,p.oid,'EXECUTE'))
                from unnest(array['anon','authenticated','service_role']) role) as effective
            from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
            where n.nspname=any($1::text[])
                and not exists(select 1 from pg_catalog.pg_depend d join pg_catalog.pg_extension e on e.oid=d.refobjid
                    where d.classid='pg_catalog.pg_proc'::regclass and d.objid=p.oid and d.deptype='e' and e.extname='vector')
            order by 1`, [schemas])).rows;
        const relations = (await sql.query(`select case when c.relkind='S' then 'sequence:' else 'table:' end||format('%I.%I',n.nspname,c.relname) as object,
            ${aclJson("coalesce(c.relacl,pg_catalog.acldefault(case when c.relkind='S' then 's'::\"char\" else 'r'::\"char\" end,c.relowner))")} as privileges,
            (select jsonb_object_agg(role,rights) from (select role,
                (select jsonb_object_agg(privilege,case when c.relkind='S' then pg_catalog.has_sequence_privilege(role,c.oid,privilege)
                    else pg_catalog.has_table_privilege(role,c.oid,privilege) end)
                    from unnest(case when c.relkind='S' then array['SELECT','UPDATE','USAGE']
                        else array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] end) privilege) as rights
                from unnest(array['anon','authenticated','service_role']) role) roles) as effective
            from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
            where n.nspname=any($1::text[]) and c.relkind in ('r','p','v','m','f','S') order by 1`, [schemas])).rows;
        // OIDs differ across databases, so sort ACL entries by their role names.
        return [...functions, ...relations].map(row => ({ ...row, privileges: row.privileges.sort((a,b) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b))) })).sort((a,b) => a.object.localeCompare(b.object));
    } finally {
        await sql.query("select set_config('search_path',$1,false)", [previous]);
    }
}

export async function assertFixtureObjectPrivileges(source, target) {
    const expected = await readFixtureObjectPrivileges(source);
    assert(expected.length > 0, 'fixture_acl_manifest_empty');
    const actual = new Map((await readFixtureObjectPrivileges(target)).map(row => [row.object, row]));
    for (const row of expected) assert.deepEqual(actual.get(row.object), row, `fixture_acl_mismatch:${row.object}`);
    return expected.length;
}

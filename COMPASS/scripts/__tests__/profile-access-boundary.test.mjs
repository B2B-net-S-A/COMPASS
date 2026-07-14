import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
    buildInventory,
    compareWithBaseline,
    validateGuardEvidence,
} from '../check-profile-access-boundary.mjs'

async function fixture(source) {
    const root = await mkdtemp(path.join(tmpdir(), 'compass-profile-boundary-'))
    await mkdir(path.join(root, 'app'), { recursive: true })
    await writeFile(path.join(root, 'app', 'fixture.ts'), source)
    return root
}

test('classifies self, directory candidates, and server-only service reads', async () => {
    const root = await fixture(`
        async function run(supabase, user) {
            await supabase.from('profiles').select('email').eq('id', user.id).single()
            await supabase.from('profiles').select('id, full_name').order('full_name')
            const service = createServiceClient()
            await service.from('profiles').select('email, role').limit(10)
        }
    `)

    const inventory = await buildInventory(root)
    assert.deepEqual(inventory.map((entry) => entry.classification), [
        'self',
        'directory_candidate',
        'protected_backend',
    ])
})

test('rejects new queries and unresolved safe directory reads', async () => {
    const root = await fixture(`
        async function run(supabase) {
            await supabase.from('profiles').select('id, full_name').order('full_name')
        }
    `)
    const inventory = await buildInventory(root)
    const failures = compareWithBaseline(inventory, { entries: [] })

    assert.equal(failures.some((failure) => failure.includes('new profiles query')), true)
    assert.equal(failures.some((failure) => failure.includes('must use profile_directory')), true)
})

test('allows removing a reviewed baseline query', () => {
    const failures = compareWithBaseline([], {
        entries: [{ fingerprint: 'reviewed-query' }],
    })
    assert.deepEqual(failures, [])
})

test('rejects a reviewed self-scoped mutation outside the service boundary', async () => {
    const root = await fixture(`
        async function run(supabase, user) {
            await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id)
        }
    `)
    const inventory = await buildInventory(root)
    const failures = compareWithBaseline(inventory, { entries: inventory })

    assert.equal(
        failures.some((failure) => failure.includes('direct authenticated profiles mutation')),
        true,
    )
})

test('rejects a cross-user profiles embed from a session-scoped query', async () => {
    const root = await fixture(`
        async function run(supabase, user) {
            await supabase
                .from('leave_requests')
                .select('id, substitute:profiles!substitute_id(full_name)')
                .eq('user_id', user.id)
        }
    `)
    const inventory = await buildInventory(root)
    const failures = compareWithBaseline(inventory, { entries: inventory })

    assert.deepEqual(inventory.map((entry) => entry.classification), ['legacy_cross_user_embed'])
    assert.equal(
        failures.some((failure) => failure.includes('profiles embed must use a guarded service client')),
        true,
    )
})

test('resolves reused client names in their lexical function scope', async () => {
    const root = await fixture(`
        async function unsafe() {
            const supabase = createClient()
            await supabase
                .from('leave_requests')
                .select('id, substitute:profiles!substitute_id(full_name)')
        }

        async function guarded() {
            const supabase = createServiceClient()
            await supabase
                .from('leave_requests')
                .select('id, substitute:profiles!substitute_id(full_name)')
        }
    `)
    const inventory = await buildInventory(root)

    assert.deepEqual(inventory.map((entry) => entry.classification), [
        'legacy_cross_user_embed',
        'protected_backend',
    ])
})

test('detects profiles embeds stored in a select constant', async () => {
    const root = await fixture(`
        const TEAM_SELECT = 'id, user:profiles!user_id(full_name)'
        async function guarded() {
            const admin = createServiceClient()
            await admin.from('leave_requests').select(TEAM_SELECT)
        }
    `)
    const inventory = await buildInventory(root)

    assert.deepEqual(inventory.map((entry) => entry.classification), ['protected_backend'])
    assert.deepEqual(inventory[0]?.selected_columns, ['embedded:profiles'])
})

test('rejects removal of a required server-action guard', async () => {
    const root = await fixture(`
        export async function guardedAction() {
            const service = createServiceClient()
            return service.from('profiles').select('email')
        }
    `)
    const baseline = {
        guard_evidence: {
            'app/fixture.ts': {
                guardedAction: ['requireAdminAction'],
            },
        },
    }

    assert.deepEqual(await validateGuardEvidence(root, baseline), [
        'required guard missing: app/fixture.ts:guardedAction (requireAdminAction)',
    ])

    await writeFile(path.join(root, 'app', 'fixture.ts'), `
        export async function guardedAction() {
            await requireAdminAction()
            const service = createServiceClient()
            return service.from('profiles').select('email')
        }
    `)
    assert.deepEqual(await validateGuardEvidence(root, baseline), [])
})

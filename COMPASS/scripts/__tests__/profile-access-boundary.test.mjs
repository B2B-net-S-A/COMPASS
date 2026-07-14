import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
    buildInventory,
    compareWithBaseline,
} from '../check-profile-access-boundary.mjs'

async function fixture(source) {
    const root = await mkdtemp(path.join(tmpdir(), 'compass-profile-boundary-'))
    await mkdir(path.join(root, 'app'), { recursive: true })
    await writeFile(path.join(root, 'app', 'fixture.ts'), source)
    return root
}

test('classifies self, directory candidates, and guarded service reads', async () => {
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

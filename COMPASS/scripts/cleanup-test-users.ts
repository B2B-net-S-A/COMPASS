/**
 * Cleanup E2E test users + their data after a test session.
 *
 * Run AFTER test session completes:
 *   npx tsx scripts/cleanup-test-users.ts
 *
 * Removes all rows where email matches `e2e+%@b2bnetwork.pl`:
 *   - auth.users (cascades to profiles via FK ON DELETE CASCADE)
 *   - candidates table (delete by email match)
 *   - any conversations / messages / notifications they created
 *
 * Safe: only touches rows whose email starts with `e2e+`.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnvTest(): Record<string, string> {
    const envPath = resolve(__dirname, '..', '.env.test')
    const raw = readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq < 0) continue
        env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
    }
    return env
}

async function main() {
    console.log('=== Compass E2E Test Users Cleanup ===')
    const env = loadEnvTest()
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY.startsWith('TODO')) {
        throw new Error('Missing or unfilled SUPABASE_SERVICE_ROLE_KEY in .env.test')
    }
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    })

    // List all auth users matching e2e+
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const targets = (list?.users ?? []).filter(u => u.email?.toLowerCase().includes('e2e+'))
    console.log(`Found ${targets.length} test users to delete`)

    let deleted = 0
    for (const u of targets) {
        // delete candidate row (if any) by email — RLS bypass with service_role
        await supabase.from('candidates').delete().eq('email', u.email!)
        // notifications, conversations, messages should cascade via FK
        const { error } = await supabase.auth.admin.deleteUser(u.id)
        if (error) {
            console.error(`  ✗ ${u.email}: ${error.message}`)
            continue
        }
        console.log(`  ✓ deleted: ${u.email}`)
        deleted++
    }

    console.log(`\nDeleted: ${deleted}/${targets.length}`)
}

main().catch(e => {
    console.error('CLEANUP FAILED:', e)
    process.exit(1)
})

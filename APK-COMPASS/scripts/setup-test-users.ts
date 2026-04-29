/**
 * Idempotent script to set up the 4 E2E test users on Hetzner staging Supabase.
 *
 * Run once after pasting SUPABASE_SERVICE_ROLE_KEY into .env.test:
 *   npx tsx scripts/setup-test-users.ts
 *
 * What it does:
 *   1. Reads .env.test for service_role key + 4 test emails + password
 *   2. For each role (consultant / admin / centrala / administrator):
 *        - Creates the user via admin.createUser with email_confirm:true (no inbox round trip)
 *        - Updates profiles.role to the target role (default for consultant)
 *   3. Reports a summary of what was created vs already existed
 *
 * Cleanup later:
 *   npx tsx scripts/cleanup-test-users.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

interface EnvVars {
    NEXT_PUBLIC_SUPABASE_URL: string
    SUPABASE_SERVICE_ROLE_KEY: string
    TEST_PASSWORD: string
    TEST_CONSULTANT_EMAIL: string
    TEST_ADMIN_EMAIL: string
    TEST_CENTRALA_EMAIL: string
    TEST_ADMINISTRATOR_EMAIL: string
}

function loadEnvTest(): EnvVars {
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
    const required: (keyof EnvVars)[] = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'TEST_PASSWORD',
        'TEST_CONSULTANT_EMAIL',
        'TEST_ADMIN_EMAIL',
        'TEST_CENTRALA_EMAIL',
        'TEST_ADMINISTRATOR_EMAIL',
    ]
    for (const key of required) {
        if (!env[key]) throw new Error(`Missing ${key} in .env.test`)
        if (env[key].startsWith('TODO')) throw new Error(`${key} still has TODO placeholder — paste real value first`)
    }
    return env as unknown as EnvVars
}

async function ensureUser(supabase: any, email: string, password: string): Promise<{ id: string; created: boolean }> {
    // Check existing user via auth admin API
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existing = list?.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
    if (existing) {
        console.log(`  ✓ already exists: ${email} (${existing.id})`)
        // Ensure email is confirmed (in case the UI signup left it unconfirmed)
        if (!existing.email_confirmed_at) {
            await supabase.auth.admin.updateUserById(existing.id, { email_confirm: true } as any)
            console.log(`    └─ marked email_confirmed`)
        }
        return { id: existing.id, created: false }
    }
    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: deriveName(email) },
    })
    if (error || !data.user) throw new Error(`createUser failed for ${email}: ${error?.message}`)
    console.log(`  ✓ created: ${email} (${data.user.id})`)
    return { id: data.user.id, created: true }
}

function deriveName(email: string): string {
    const local = email.split('@')[0]
    const lastTag = local.split('+').slice(-1)[0]
    return `Test ${lastTag.charAt(0).toUpperCase() + lastTag.slice(1)}`
}

async function setRole(supabase: any, userId: string, role: string): Promise<void> {
    // Try the full upsert first (newer schema with onboarding_completed)
    let { error } = await supabase
        .from('profiles')
        .upsert([{ id: userId, role, onboarding_completed: false, full_name: 'E2E Test Account' }], { onConflict: 'id' })

    if (error && /onboarding_completed|schema cache/.test(error.message || '')) {
        // Fallback: minimal columns only
        const retry = await supabase
            .from('profiles')
            .upsert([{ id: userId, role, full_name: 'E2E Test Account' }], { onConflict: 'id' })
        error = retry.error
    }
    if (error && /full_name|schema cache/.test(error.message || '')) {
        const retry2 = await supabase
            .from('profiles')
            .upsert([{ id: userId, role }], { onConflict: 'id' })
        error = retry2.error
    }
    if (error) {
        // Last resort: bare update (no upsert)
        const { error: updateErr } = await supabase
            .from('profiles')
            .update({ role })
            .eq('id', userId)
        if (updateErr) throw new Error(`profile upsert failed for ${userId}: ${updateErr.message}`)
    }
}

async function main() {
    console.log('=== Compass E2E Test Users Setup ===')
    const env = loadEnvTest()
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    })

    const targets: Array<{ email: string; role: string }> = [
        { email: env.TEST_CONSULTANT_EMAIL, role: 'consultant' },
        { email: env.TEST_ADMIN_EMAIL, role: 'admin' },
        { email: env.TEST_CENTRALA_EMAIL, role: 'centrala' },
        { email: env.TEST_ADMINISTRATOR_EMAIL, role: 'administrator' },
    ]

    let createdCount = 0
    for (const t of targets) {
        console.log(`\n→ ${t.email} (${t.role})`)
        const { id, created } = await ensureUser(supabase, t.email, env.TEST_PASSWORD)
        await setRole(supabase, id, t.role)
        console.log(`    └─ role set to "${t.role}"`)
        if (created) createdCount++
    }

    console.log(`\n=== Done ===`)
    console.log(`Created: ${createdCount}, Already existed: ${targets.length - createdCount}`)
    console.log(`\nNote: 'administrator' role checks may also need ${env.TEST_ADMINISTRATOR_EMAIL} added to SUPER_ADMIN_EMAILS env on Hetzner.`)
}

main().catch(e => {
    console.error('SETUP FAILED:', e)
    process.exit(1)
})

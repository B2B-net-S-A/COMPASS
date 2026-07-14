import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, it } from 'node:test'

import { checkServiceRoleBoundary } from '../check-service-role-boundary.mjs'

const fixtures = []
const PROJECT_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const VALID_ADMIN = `
import 'server-only'
import { createClient } from '@supabase/supabase-js'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
export const createServiceClient = () => createClient('https://example.supabase.co', key)
`

function fixture(files = {}) {
    const root = mkdtempSync(resolve(tmpdir(), 'compass-service-boundary-'))
    fixtures.push(root)
    const entries = {
        'lib/supabase/admin.ts': VALID_ADMIN,
        ...files,
    }
    for (const [path, content] of Object.entries(entries)) {
        const target = resolve(root, path)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, content)
    }
    return root
}

afterEach(() => {
    for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('service-role boundary guard', () => {
    it('accepts the real COMPASS source tree', () => {
        assert.deepEqual(checkServiceRoleBoundary(PROJECT_ROOT), [])
    })

    it('rejects a direct legacy or new secret-key reference outside the boundary', () => {
        const root = fixture({
            'app/api/unsafe/route.ts': `
                const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY
                const current = process.env.SUPABASE_SECRET_KEY
                export { legacy, current }
            `,
        })

        assert.match(checkServiceRoleBoundary(root).join('\n'), /credential referenced outside/)
    })

    it('rejects raw privileged createClient imports', () => {
        const root = fixture({
            'app/api/unsafe/route.ts': `
                import { createClient as createAdmin } from '@supabase/supabase-js'
                export const client = createAdmin('https://example.supabase.co', 'unsafe')
            `,
        })

        assert.match(checkServiceRoleBoundary(root).join('\n'), /client creation bypasses/)
    })

    it('rejects a client component importing or re-exporting the admin boundary', () => {
        const root = fixture({
            'components/Unsafe.tsx': `
                'use client'
                import { createServiceClient } from '@/lib/supabase/admin'
                export const Unsafe = () => String(createServiceClient())
            `,
            'lib/supabase/index.ts': `export * from '@/lib/supabase/admin'`,
        })

        const violations = checkServiceRoleBoundary(root).join('\n')
        assert.match(violations, /client module imports/)
        assert.match(violations, /must not be re-exported/)
    })

    it('requires the boundary itself to keep the server-only marker', () => {
        const root = fixture({
            'lib/supabase/admin.ts': VALID_ADMIN.replace("import 'server-only'", ''),
        })

        assert.match(checkServiceRoleBoundary(root).join('\n'), /server-only marker/)
    })

    it('allows type-only imports from supabase-js', () => {
        const root = fixture({
            'lib/query.ts': `
                import type { SupabaseClient } from '@supabase/supabase-js'
                export type QueryClient = SupabaseClient
            `,
        })

        assert.deepEqual(checkServiceRoleBoundary(root), [])
    })
})

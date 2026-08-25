import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    process.env.VOYAGE_API_KEY = 'test-voyage-key'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.SUPER_ADMIN_EMAILS = 'super@compass.test'
    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.NEXT_PUBLIC_APP_URL = 'https://compass.test'
    // @ts-expect-error NODE_ENV typed as readonly literal in Next.js, but process.env is mutable at runtime
    process.env.NODE_ENV = 'test'
})

afterEach(() => {
    vi.clearAllMocks()
})

vi.mock('@anthropic-ai/sdk', async () => {
    const helper = await vi.importActual<typeof import('./mocks/anthropic')>('./mocks/anthropic')
    class MockAnthropic {
        messages = { create: helper.messagesCreate }
        constructor(_opts: unknown) {}
    }
    return { default: MockAnthropic }
})

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
}))

vi.mock('next/headers', async () => {
    const cookieStore = new Map<string, string>()
    return {
        cookies: () => ({
            get: (name: string) => cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined,
            getAll: () => Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value })),
            set: (name: string, value: string) => cookieStore.set(name, value),
            delete: (name: string) => cookieStore.delete(name),
            has: (name: string) => cookieStore.has(name),
        }),
        headers: () => new Headers(),
    }
})

vi.mock('next/navigation', () => ({
    redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
    notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
}))

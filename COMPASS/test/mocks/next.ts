import { vi } from 'vitest'

const cookieStore = new Map<string, string>()
export const setMockCookie = (name: string, value: string) => cookieStore.set(name, value)
export const clearMockCookies = () => cookieStore.clear()

vi.mock('next/headers', () => {
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

vi.mock('next/cache', () => {
    return {
        revalidatePath: vi.fn(),
        revalidateTag: vi.fn(),
    }
})

vi.mock('next/navigation', () => {
    return {
        redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
        notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
        useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
        usePathname: () => '/',
        useSearchParams: () => new URLSearchParams(),
    }
})

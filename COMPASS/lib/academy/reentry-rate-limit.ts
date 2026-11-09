// Limit próśb o link ponownego wejścia (B1.7). Pamięć procesu wystarcza, bo aplikacja chodzi
// w jednym kontenerze. Restart zeruje liczniki, a link i tak idzie wyłącznie na adres z listy.

const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_IP = 10
const MAX_PER_ADDRESS = 3
const MAX_TRACKED_KEYS = 10_000

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

function hit(key: string, limit: number, now: number): boolean {
    const current = buckets.get(key)
    if (!current || current.resetAt <= now) {
        // Zalew unikalnych adresów nie może rozdmuchać pamięci ani wyzerować cudzych limitów:
        // usuwamy tylko wpisy po terminie, a przy pełnej tabeli odmawiamy.
        if (!current && buckets.size >= MAX_TRACKED_KEYS) {
            buckets.forEach((bucket, tracked) => { if (bucket.resetAt <= now) buckets.delete(tracked) })
            if (buckets.size >= MAX_TRACKED_KEYS) return false
        }
        buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
        return true
    }
    current.count += 1
    return current.count <= limit
}

/** Zwraca `false`, gdy przekroczono limit na IP albo na adres. */
export function allowReentryRequest(ip: string, address: string, now: number = Date.now()): boolean {
    const ipAllowed = hit(`ip:${ip}`, MAX_PER_IP, now)
    const addressAllowed = hit(`address:${address}`, MAX_PER_ADDRESS, now)
    return ipAllowed && addressAllowed
}

export function resetReentryRateLimit(): void {
    buckets.clear()
}

export function clientIp(headers: Headers): string {
    return headers.get('cf-connecting-ip')?.trim() || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

// Limit próśb o link ponownego wejścia (B1.7). Pamięć procesu wystarcza, bo aplikacja chodzi
// w jednym kontenerze. Restart zeruje liczniki, a link i tak idzie wyłącznie na adres z listy.

const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_IP = 10
const MAX_PER_ADDRESS = 3
const MAX_TRACKED_KEYS = 10_000

type Bucket = { count: number; resetAt: number }

// Osobne tabele: zalew podrobionych IP nie wypycha limitów adresów i odwrotnie.
const ipBuckets = new Map<string, Bucket>()
const addressBuckets = new Map<string, Bucket>()

/**
 * Robi miejsce na nowy klucz, nigdy nie odmawia z powodu pełnej tabeli: inaczej zalew
 * unikalnych kluczy zamykałby wejście wszystkim. Kolejność: wpisy po terminie, najstarszy
 * wpis poniżej limitu, a dopiero gdy wszystkie są wyczerpane, najstarszy w ogóle.
 */
function makeRoom(buckets: Map<string, Bucket>, limit: number, now: number): void {
    if (buckets.size < MAX_TRACKED_KEYS) return
    let oldestUnderLimit: string | null = null
    buckets.forEach((bucket, tracked) => {
        if (bucket.resetAt <= now) buckets.delete(tracked)
        else if (oldestUnderLimit === null && bucket.count < limit) oldestUnderLimit = tracked
    })
    if (buckets.size < MAX_TRACKED_KEYS) return
    const evicted = oldestUnderLimit ?? buckets.keys().next().value
    if (evicted !== undefined) buckets.delete(evicted)
}

function hit(buckets: Map<string, Bucket>, key: string, limit: number, now: number): boolean {
    const current = buckets.get(key)
    if (!current || current.resetAt <= now) {
        if (!current) makeRoom(buckets, limit, now)
        buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
        return true
    }
    current.count += 1
    return current.count <= limit
}

/** Zwraca `false`, gdy przekroczono limit na IP albo na adres. Zablokowane IP nie zużywa limitu adresu. */
export function allowReentryRequest(ip: string, address: string, now: number = Date.now()): boolean {
    if (!hit(ipBuckets, ip, MAX_PER_IP, now)) return false
    return hit(addressBuckets, address, MAX_PER_ADDRESS, now)
}

export function resetReentryRateLimit(): void {
    ipBuckets.clear()
    addressBuckets.clear()
}

export function clientIp(headers: Headers): string {
    return headers.get('cf-connecting-ip')?.trim() || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

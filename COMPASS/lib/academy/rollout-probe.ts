/** Klient z sesją użytkownika: wystarczy mu RPC, które sprawdza `auth.uid()` w bazie. */
interface RolloutRpcClient {
    rpc: (fn: 'academy_rollout_access') => PromiseLike<{ data: unknown; error: unknown }>
}

/**
 * Czy rollout wpuszcza zalogowaną osobę. Odpowiada „nie” przy każdym błędzie, także
 * przy braku funkcji w bazie, bo to odczyt dla nawigacji i landingu: awaria ma zostawić
 * konto na dotychczasowym ekranie. Bez `server-only`, bo czyta to też middleware na edge.
 */
export async function academyRolloutAllows(client: unknown): Promise<boolean> {
    try {
        const { data, error } = await (client as RolloutRpcClient).rpc('academy_rollout_access')
        return !error && (data as { allowed?: unknown } | null)?.allowed === true
    } catch {
        return false
    }
}

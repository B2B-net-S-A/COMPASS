// Audyt 2026-08 (A0.3): parametr `?next=` w /auth/callback był doklejany do
// originu zwykłą interpolacją stringa, więc wartości zaczynające się od `@`
// lub `//` przenosiły przeglądarkę na obcy host — `${origin}@evil.com` jest
// czytane jako userinfo, a hostem staje się evil.com.
//
// Gałąź redirectu wykonuje się TAKŻE bez parametru `code`, czyli bez żadnego
// logowania, więc goły link wyglądający jak firmowy wystarczał każdemu.
//
// Moduł jest celowo czysty (zero importów, zero `server-only`), żeby dało się
// go przetestować bez uruchamiania trasy — wzorzec z lib/hr i lib/oof.
export function safeNextPath(next: string | null | undefined, fallback: string): string {
    if (!next) return fallback
    if (!next.startsWith('/')) return fallback // absolutne URL-e i userinfo-hijack
    if (next.startsWith('//')) return fallback // protocol-relative → obcy host
    if (next.includes('\\')) return fallback // część przeglądarek czyta \ jak /
    return next
}

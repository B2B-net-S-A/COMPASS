import * as React from 'react'

/**
 * Memoizacja na czas jednego żądania — `cache()` Reacta, gdy jest dostępne.
 *
 * `cache` istnieje WYŁĄCZNIE w buildzie Reacta spod warunku `react-server`
 * (komponenty i akcje serwerowe Next.js). W buildzie klienckim — a taki
 * rozwiązuje bundler przeglądarki i test runner — eksport nie istnieje i
 * `import { cache } from 'react'` daje `undefined`, czyli `cache is not a function`
 * przy pierwszym wywołaniu. Dlatego sięgamy po niego przez namespace i cofamy się
 * do przezroczystego opakowania, kiedy go nie ma.
 *
 * Kontrakt: to jest OPTYMALIZACJA, nigdy warunek poprawności. Bez memoizacji
 * funkcja po prostu wykonuje się tyle razy, ile ją zawołano — czyli dokładnie
 * tak jak przed jej wprowadzeniem.
 */
type Cacheable = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R

const reactCache = (React as unknown as { cache?: Cacheable }).cache

export const perRequestCache: Cacheable = typeof reactCache === 'function'
    ? reactCache
    : (fn) => fn

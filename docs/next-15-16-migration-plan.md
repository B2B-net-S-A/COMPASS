# Next.js 14 → 15 → 16 Migration Plan

> **Status:** PLAN (nie zaczęte). PR [#48](https://github.com/artur-t-96/compass/pull/48) (Dependabot 14.2.35 → 16.2.6) zamknięty świadomie — patrz sekcja "Decyzja". Migrację robimy etapowo: dwa osobne PR-y (14→15, 15→16), nie skok.

## TL;DR

- **Compass jest na Next 14.2.35** (App Router, React 18, standalone output, monorepo w `COMPASS/`).
- Dependabot zaproponował **bezpośredni skok 14 → 16.2.6** (PR #48) — odrzucone, bo to przejście przez **dwa cykle breaking changes** w jednym PR (sync→async API w 15, React 19 + Turbopack default w 16).
- Plan: **Fazowo**, każda faza w osobnym PR z UAT:
  - **Faza A: 14 → 15.4.x** (najnowsza stabilna 15.x w momencie migracji) — async API, Sentry SDK bump, fetch cache audit. **~20–30h.**
  - **Faza B: 15.4.x → 16.2.x** — React 18 → 19, Turbopack ergonomics, drobne config cleanup. **~12–16h.**
- **Łączny effort: 32–46h pracy + smoke** (Dependabot proponował "8-16h" jak na patch, ale to nierealistyczne dla 70+ plików dotkniętych async API).

## Decyzja: dlaczego nie merge PR #48

PR #48 = Dependabot 14.2.35 → 16.2.6 (skok przez dwie major). Powody zamknięcia:

1. **CI failed** (Typecheck + Lint + Test + Build) — potwierdzenie że nie jest to drop-in upgrade.
2. **Pominięcie wersji 15** = pominięcie testu integracyjnego z każdą wersją osobno. Jeśli 16 coś zepsuje, nie wiemy czy regresja przyszła z 14→15 czy 15→16. Diagnostyka pozioma.
3. **Bezpieczeństwo** (CVE'y w 14.2.35) — wiele ich łata już **Next 14.2.36+** (LTS branch). Jeśli urgent security fix potrzebny → bump do 14.2.36 jako oddzielny patch PR, nie skok do 16.
4. Dependabot widzi tylko `package.json` + lockfile — nie audytuje semantyki API. Decyzja merge'a jest człowieka.

## Audyt zakresu w Compass (stan 2026-05-11)

Wszystkie grep'y na `COMPASS/` (gdzie żyje aplikacja Next.js):

| Pattern | Count | Top files |
|---|---:|---|
| `headers()` | 4 | `lib/auth/security.ts` ×2, `lib/actions/compliance.ts`, `lib/actions/audit.ts` |
| `cookies()` | 7 | `app/login/actions.ts` ×4, `lib/supabase/server.ts`, `lib/actions/profile.ts`, `app/(protected)/layout.tsx` |
| `draftMode()` | 0 | — |
| `params:` w `page.tsx`/`layout.tsx`/`route.ts` | **22 plików** | różne route'y App Router |
| `searchParams` | **72 referencje, 15+ plików** | `admin/incubator/page.tsx`, `support/tickets/page.tsx`, `learning/page.tsx`, ... |
| `useFormState` | 0 | (Compass nie używa, używa `useActionState` lub server actions wprost) |
| Explicit `fetch(...)` z opcjami | 2 | `lib/ai/embeddings.ts`, `app/api/health/route.ts` |
| `webpack(...)` hook w `next.config.mjs` | 0 | (czysty config — łatwiej z Turbopack) |
| `@vercel/og` | 0 | (nie używamy, OK) |

**Dep versions (`COMPASS/package.json`):**
- `next`: `^14.2.35`
- `react`: `^18`, `react-dom`: `^18`
- `@sentry/nextjs`: `^8.55.2` (Next 15 wymaga `^9`, Next 16 najprawdopodobniej `^10`)

**Komendy do reweryfikacji audytu** (jeśli czas minął i kod się zmienił):
```bash
cd /Users/arturtwardowski/Compass/COMPASS
grep -rn "headers()" app lib 2>/dev/null | wc -l
grep -rn "cookies()" app lib 2>/dev/null | wc -l
grep -rln "params:" app | wc -l
grep -rn "searchParams" app 2>/dev/null | wc -l
grep -rn "useFormState" . 2>/dev/null
grep -E '"(react|react-dom|next|@sentry/nextjs)"' package.json
```

## Faza A: Next 14 → 15.4.x

> Reference: [Next 15.0 release notes](https://github.com/vercel/next.js/releases/tag/v15.0.0) · [15.1](https://github.com/vercel/next.js/releases/tag/v15.1.0) · [15.2](https://github.com/vercel/next.js/releases/tag/v15.2.0) · [15.3](https://github.com/vercel/next.js/releases/tag/v15.3.0) · [15.4](https://github.com/vercel/next.js/releases/tag/v15.4.0) · [oficjalny upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15)

### Breaking changes które dotyczą Compass

1. **Async Request APIs** (BREAKING — największa zmiana)
   - `headers()`, `cookies()`, `draftMode()` → wszystkie są teraz **`async`** (zwracają `Promise`).
   - **Zakres:** 11 wywołań w Compass (4× headers, 7× cookies). Wszystkie wymagają `await` + przeniesienia caller'a do `async function`.
   - **Migration codemod** dostępny: `npx @next/codemod@latest next-async-request-api ./` — automatycznie konwertuje większość. Ręczny review po każdym pliku.

2. **`params` i `searchParams` w server components → `Promise<...>`**
   - **Zakres:** 22 pliki z `params:`, 15+ stron z `searchParams`. ~72 referencji łącznie.
   - Codemod: `npx @next/codemod@latest next-async-request-api ./` (ten sam, obsługuje też params).
   - **Manual edge cases:**
     - `generateMetadata({ params })` → `async function generateMetadata({ params }: { params: Promise<...> })`
     - Dynamic route segments w `route.ts` (`context: { params: Promise<{ id: string }> }`)
     - Klient component dostający `params` przez props od server parent — params trzeba `await` po stronie server'a i przekazać już resolved.

3. **`fetch()` default cache zmiana** (`force-cache` → `no-store`)
   - **Zakres Compass:** Tylko 2 jawne `fetch(...)`. Implicit fetch'e przez Supabase SDK / Anthropic SDK — nie dotknięte (mają własną cache logic).
   - **Akcja:** Audyt 2 plików (`lib/ai/embeddings.ts`, `app/api/health/route.ts`). Jeśli polegamy gdzieś na cache → dodaj `{ cache: 'force-cache' }` explicit.

4. **Sentry SDK `@sentry/nextjs ^8` → `^9`**
   - Compass używa `withSentryConfig` w `next.config.mjs`. Bump `^8.55.2 → ^9.x` wymaga:
     - Update `package.json`
     - Re-check `instrumentation.ts` / `sentry.*.config.ts` — Sentry ^9 zmienił initialization API
     - Reupload source maps (sprawdź `SENTRY_AUTH_TOKEN` nadal build-time only)
   - Reference: [Sentry Next.js migration guide ^8 → ^9](https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v8-to-v9/)

5. **Min Node 18.18** → Compass ma Node 20 (Docker base + GHA). **OK, no action.**

6. **`@next/font` removed** (już od 14, ale finalize w 15) — Compass nie używa `@next/font`, **OK.**

### Faza A — checklist (PR `chore/next-15`)

- [ ] **A.1** Bump w `COMPASS/package.json`: `next: ^15.4.0`, `eslint-config-next: ^15.4.0`
- [ ] **A.2** Bump `@sentry/nextjs: ^9.x` + audit `sentry.*.config.ts` per Sentry migration guide
- [ ] **A.3** Run `npx @next/codemod@latest next-async-request-api ./` w `COMPASS/` → review diff
- [ ] **A.4** Manual fix wszystkich `headers()/cookies()` co codemod ominął (caller w sync function → przeniesienie do async)
- [ ] **A.5** Fix `params`/`searchParams` w 22+15 plikach (Promise + await)
- [ ] **A.6** Audyt 2 plików z explicit `fetch()` — czy zachowanie cache się nie zmienia
- [ ] **A.7** `npm --prefix COMPASS run typecheck` → 0 errors
- [ ] **A.8** `npm --prefix COMPASS run lint` → 0 errors
- [ ] **A.9** `npm --prefix COMPASS run test:unit` → all pass
- [ ] **A.10** `cd COMPASS && npm run build` → 0 errors
- [ ] **A.11** `cd COMPASS && npm run e2e` (Playwright) → critical flows pass
- [ ] **A.12** Local docker compose run + Chrome MCP smoke: login → /internal/timesheets → PDF export → /admin
- [ ] **A.13** Deploy do prod → smoke `compass.dynaminds.pl` (loginflow, timesheet, akademia)
- [ ] **A.14** Monitor Sentry 24h po deploy — żadne new error types

**Estymata Faza A:** **20–30h** (codemod cuts ~50% of manual work, ale review każdego pliku + Playwright debug konsumuje większość czasu)

## Faza B: Next 15.4.x → 16.2.x

> Reference: [Next 16.0 release notes](https://github.com/vercel/next.js/releases/tag/v16.0.0) · [16.1](https://github.com/vercel/next.js/releases/tag/v16.1.0) · [16.2](https://github.com/vercel/next.js/releases/tag/v16.2.0) · [oficjalny upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)

### Breaking changes które dotyczą Compass

1. **React 18 → React 19** (BREAKING)
   - Compass na `react ^18` → bump na `^19`. Compatibility issues do sprawdzenia:
     - **Custom hook prop typing** — React 19 stricter z `useEffect` cleanup timing
     - **Legacy Context API** — `contextType` static deprecated w klasach (Compass nie ma class components, ale verify)
     - **`useRef()` typing** — TypeScript 5+ wymagany (Compass ma TS 5, OK)
     - **`ReactDOM.flushSync`** — sprawdź czy używamy
     - **`act(...)` deprecation** w testach → migrate do `await act(...)`
   - Reference: [React 19 upgrade guide](https://react.dev/blog/2024/12/05/react-19-upgrade-guide)

2. **Turbopack default w `next dev` i `next build`**
   - Compass nie ma custom `webpack(...)` hook (good!) → Turbopack powinien działać out-of-box.
   - **Co sprawdzić:**
     - PDF generation (`pdf-lib`, `pdf2json`) — biblioteki używają native Node modules, Turbopack ma inny native-module loader
     - Sentry source map upload — sprawdź w Sentry docs czy `@sentry/nextjs ^10` (jeśli wymagane) wspiera Turbopack bundle output
     - Bundle analyzer (jeśli używamy) → bump `@next/bundle-analyzer ^16`
   - **Opt-out** (fallback do webpack): `next dev --webpack` / `next build --webpack`. Trzymaj jako bezpiecznik.

3. **Sentry SDK `^9` → `^10`** (potencjalnie)
   - Sprawdź [@sentry/nextjs releases](https://github.com/getsentry/sentry-javascript/releases) — czy w momencie migracji `^10` jest oficjalnie compatible z Next 16. Jeśli nie, zostań na `^9`.

4. **Middleware Edge runtime — drobne constraints**
   - Compass middleware: `COMPASS/middleware.ts` (Edge runtime). Drobne API zmiany w 16, sprawdź na konkretnym pliku.

5. **`unstable_*` API stabilization** — Compass nie używa `unstable_cache`, `unstable_after`, `unstable_noStore`. **OK.**

### Faza B — checklist (PR `chore/next-16`, **po merge Fazy A**)

- [ ] **B.1** Bump w `COMPASS/package.json`: `next: ^16.2.x`, `eslint-config-next: ^16.2.x`, `react: ^19`, `react-dom: ^19`, `@types/react: ^19`, `@types/react-dom: ^19`
- [ ] **B.2** Sprawdź `@sentry/nextjs` compatibility z Next 16 → bump `^10` jeśli wymagane
- [ ] **B.3** Run `npx @next/codemod@latest upgrade ./` (auto-migrate gdzie się da)
- [ ] **B.4** Run React 19 codemod: `npx codemod@latest react/19/migration-recipe` (act() + ref typing)
- [ ] **B.5** Audit `pdf-lib` / `pdf2json` z Turbopack — local build + PDF generate test
- [ ] **B.6** `npm --prefix COMPASS run typecheck` → 0 errors
- [ ] **B.7** `npm --prefix COMPASS run lint` → 0 errors (eslint-config-next 16 ma nowe rules)
- [ ] **B.8** `npm --prefix COMPASS run test:unit` → all pass (Vitest może wymagać `act()` updates)
- [ ] **B.9** `cd COMPASS && npm run build` z Turbopack → 0 errors. Fallback `--webpack` jeśli regress.
- [ ] **B.10** `cd COMPASS && npm run e2e` (Playwright)
- [ ] **B.11** Lokalna Chrome MCP weryfikacja: login → /internal/timesheets → PDF export → /admin → /akademia (z AI)
- [ ] **B.12** Deploy do prod → smoke + monitor Sentry 48h

**Estymata Faza B:** **12–16h** (React 19 audit + Turbopack PDF testing to większość)

## Razem: timeline

| Krok | Czas | Kto | Trigger |
|---|---|---|---|
| Faza A planning + setup | 2-4h | dev | feature branch |
| Faza A implementacja | 14-20h | dev | grep + codemod + manual |
| Faza A UAT (local + prod) | 4-6h | dev + Artur | Playwright + Chrome MCP |
| **Faza A merge** | — | — | **PR z Phase A** |
| Soak time w prod (24-48h) | passive | — | obserwacja Sentry |
| Faza B planning | 1-2h | dev | feature branch |
| Faza B implementacja | 8-10h | dev | grep + codemod + manual |
| Faza B UAT | 3-4h | dev + Artur | wszystko + PDF |
| **Faza B merge** | — | — | **PR z Phase B** |

**Total elapsed:** ~1 tydzień pracy (32-46h) + 2-3 dni soak po Fazy A.

## Co NIE robić w międzyczasie

- **NIE** mergować security PR-ów `next/...` które przeskakują major (jak #48). Każdy `next` PR od Dependabot przed Fazą A → zignoruj/zamknij/zaplanuj jako Faza A.
- **NIE** wprowadzać new `headers()` / `cookies()` użyć w obecnym kodzie bez świadomości że migracja je dotknie. Jeśli musisz — udokumentuj w komentarzu `// TODO(next-15-migration): convert to await`.
- **NIE** mergować `@sentry/nextjs ^9` przed Fazą A — Sentry SDK bump + Next bump razem, nie osobno (uniknij dwukrotnego testowania).

## Decyzja końcowa

**PR #48 zamknięty 2026-05-11.** Migracja Next 14 → 16 zaplanowana jako 2 fazy w osobnych PR-ach zgodnie z planem powyżej. Termin: niezdefiniowany, do zaplanowania jako oddzielny milestone (nie blocker dla aktualnej roadmapy).

**Owner:** TBD (Artur lub dedykowany sprint).

## References

- [Next.js 15 upgrade guide (official)](https://nextjs.org/docs/app/guides/upgrading/version-15)
- [Next.js 16 upgrade guide (official)](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [React 19 upgrade guide](https://react.dev/blog/2024/12/05/react-19-upgrade-guide)
- [Sentry Next.js v8 → v9 migration](https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v8-to-v9/)
- [PR #48 (zamknięty)](https://github.com/artur-t-96/compass/pull/48)
- [Next.js codemod docs](https://nextjs.org/docs/app/guides/upgrading/codemods)

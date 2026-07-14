# Next.js 14 → 15 → 16 Migration Plan

> **Status (2026-07-13):** Faza A zaimplementowana na `codex/p1-next15-security`
> jako aktualizacja bezpieczeństwa do Next.js 15.5.20; nie wdrożona. Faza B
> (Next 16 i jego React Canary) pozostaje osobnym zadaniem. PR [#48](https://github.com/artur-t-96/compass/pull/48)
> (Dependabot 14.2.35 → 16.2.6) zamknięto świadomie — patrz sekcja "Decyzja".

## Wynik Fazy A

- Next.js i `eslint-config-next`: 14.2.35 → 15.5.20; React/React DOM → 19.2.7.
- `react-joyride`: 2.9.3 → 3.2.0 z migracją API toura onboardingowego.
- Wszystkie `params`, `searchParams`, `cookies()` i `headers()` objęte zmianą Next 15
  zostały zmigrowane; produkcyjny adapter Supabase używa asynchronicznych cookies.
- Audit HIGH/CRITICAL: 0; Trivy finalnego obrazu: 0 HIGH/CRITICAL i 0 sekretów.
- Weryfikacja: lint, typecheck, 907 testów unit, 9 testów release, build,
  render `/login` i przekierowanie chronionej trasy do `/login`, Docker livez
  exact-SHA i health contract — PASS. Pełny auth E2E pozostaje obowiązkowym
  testem na stagingu przed wdrożeniem.

## TL;DR

- Punktem wyjścia był **Next 14.2.35 + React 18** (App Router, standalone output,
  monorepo w `COMPASS/`). Faza A przechodzi na Next 15.5.20 + React 19.2.7.
- Dependabot zaproponował **bezpośredni skok 14 → 16.2.6** (PR #48) — odrzucone, bo to przejście przez **dwa cykle breaking changes** w jednym PR (async request API + React 19 w 15, Turbopack/default proxy i dalsze zmiany runtime w 16).
- Plan: **Fazowo**, każda faza w osobnym PR z UAT:
  - **Faza A: 14.2.35/React 18 → 15.5.20/React 19** — async API,
    fetch cache audit i migracja Tour. Sentry 8.55.2 pozostaje, bo jego jawny
    peer range obejmuje Next 15. **~20–30h.**
  - **Faza B: 15.5.x → 16.2.x** — React Canary używany przez App Router,
    Turbopack jako domyślny bundler, `middleware` → `proxy` i przejście z
    `next lint` na ESLint CLI. **~12–16h.**
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

**Wersje bazowe z audytu 2026-05-11:** Next 14.2.35, React 18 i
`@sentry/nextjs` 8.55.2. Na gałęzi Fazy A są Next 15.5.20, React/React DOM
19.2.7 oraz typy React 19.2.x. Sentry 8.55.2 deklaruje kompatybilność z
`next ^13.2 || ^14 || ^15.0.0-rc.0`, więc nie dokładamy niezależnej migracji
SDK do awaryjnego upgrade'u frameworka.

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

## Faza A: Next 14/React 18 → Next 15.5.20/React 19

> Reference: [Next 15.0 release notes](https://github.com/vercel/next.js/releases/tag/v15.0.0) · [15.1](https://github.com/vercel/next.js/releases/tag/v15.1.0) · [15.2](https://github.com/vercel/next.js/releases/tag/v15.2.0) · [15.3](https://github.com/vercel/next.js/releases/tag/v15.3.0) · [15.4](https://github.com/vercel/next.js/releases/tag/v15.4.0) · [15.5](https://github.com/vercel/next.js/releases/tag/v15.5.0) · [oficjalny upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15)

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

4. **React 19 jest wymagany przez Next 15 App Router**
   - Aktualizujemy razem `react`, `react-dom`, `@types/react` i
     `@types/react-dom`; zgodność React 18 w Next 15 dotyczy Pages Routera.
   - `@sentry/nextjs` 8.55.2 pozostaje bez zmian, bo jego peer dependency
     obejmuje Next 15. Osobny upgrade Sentry wymaga własnego PR i testów source map.

5. **Min Node 18.18** → Compass ma Node 20 (Docker base + GHA). **OK, no action.**

6. **`@next/font` removed** (już od 14, ale finalize w 15) — Compass nie używa `@next/font`, **OK.**

### Faza A — checklist (PR `codex/p1-next15-security`)

- [x] **A.1** Next i `eslint-config-next` 15.5.20; React/DOM 19.2.7 i typy 19.2.x.
- [x] **A.2** Potwierdzić peer range Sentry i pozostawić 8.55.2 bez zbędnej migracji major.
- [x] **A.3** Uruchomić codemod `next-async-request-api` i przejrzeć cały diff.
- [x] **A.4** Ręcznie naprawić pozostałe `headers()`/`cookies()` i adapter Supabase.
- [x] **A.5** Zmienić `params`/`searchParams` na `Promise` + `await`.
- [x] **A.6** Przejrzeć jawne `fetch()` po zmianie domyślnego cache.
- [x] **A.7** `cd COMPASS && npx tsc --noEmit` → 0 błędów.
- [x] **A.8** `npm --prefix COMPASS run lint` → 0 błędów (zastane warningi pozostają).
- [x] **A.9** `npm --prefix COMPASS run test:unit` → 907/907.
- [x] **A.10** `cd COMPASS && npm run build` → 0 błędów.
- [x] **A.11** Produkcyjny smoke App Router: `/login` 200 i `/internal` 307 → `/login`;
  ten test jest również częścią Docker CI.
- [ ] **A.12** Auth E2E na stagingu dla realnej sesji i chronionych stron.
- [ ] **A.13** Akceptacja produkcji, deploy exact-SHA i smoke kluczowych przepływów.
- [ ] **A.14** Monitor Sentry przez minimum 24h bez nowych klas błędów.

**Estymata Faza A:** **20–30h** (codemod cuts ~50% of manual work, ale review każdego pliku + Playwright debug konsumuje większość czasu)

## Faza B: Next 15.5.x → 16.2.x

> Reference: [Next 16.0 release notes](https://github.com/vercel/next.js/releases/tag/v16.0.0) · [16.1](https://github.com/vercel/next.js/releases/tag/v16.1.0) · [16.2](https://github.com/vercel/next.js/releases/tag/v16.2.0) · [oficjalny upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)

### Breaking changes które dotyczą Compass

1. **React Canary w Next 16 App Router** (BREAKING RISK)
   - Stabilny React 19 jest już częścią Fazy A. Next 16 App Router używa najnowszego
     React Canary z funkcjami React 19.2, więc trzeba ponownie wykonać testy renderu,
     efektów, refów i bibliotek klienckich; nie jest to już migracja React 18 → 19.

2. **Turbopack default w `next dev` i `next build`**
   - Compass nie ma custom `webpack(...)` hook (good!) → Turbopack powinien działać out-of-box.
   - **Co sprawdzić:**
     - PDF generation (`pdf-lib`, `pdf2json`) — biblioteki używają native Node modules, Turbopack ma inny native-module loader
     - Sentry source map upload — sprawdź w Sentry docs czy `@sentry/nextjs ^10` (jeśli wymagane) wspiera Turbopack bundle output
     - Bundle analyzer (jeśli używamy) → bump `@next/bundle-analyzer ^16`
   - **Opt-out** (fallback do webpack): `next dev --webpack` / `next build --webpack`. Trzymaj jako bezpiecznik.

3. **Sentry 8.55.2 i Next 16** (do potwierdzenia)
   - Sprawdź [@sentry/nextjs releases](https://github.com/getsentry/sentry-javascript/releases)
     i peer range dla Next 16. Upgrade SDK wykonaj tylko jeśli jest wymagany, z testem
     source map i konfiguracji runtime.

4. **Middleware Edge runtime — drobne constraints**
   - Compass middleware: `COMPASS/middleware.ts` (Edge runtime). Drobne API zmiany w 16, sprawdź na konkretnym pliku.

5. **Usunięcie synchronicznego dostępu do Request APIs**
   - Next 15 tymczasowo dekoruje Promise zwracany przez `cookies()` metodami
     synchronicznymi. Lokalny emergency bypass w `lib/supabase/server.ts` korzysta
     z tej zgodności i został przetestowany, ale Next 16 ją usuwa. Przed Fazą B
     fabryka klienta musi stać się asynchroniczna albo otrzymać już rozwiązany cookie store.

6. **`unstable_*` API stabilization** — Compass nie używa `unstable_cache`, `unstable_after`, `unstable_noStore`. **OK.**

### Faza B — checklist (PR `chore/next-16`, **po merge Fazy A**)

- [ ] **B.1** Bump Next/`eslint-config-next` do 16.2.x i wersji React/typów wymaganych przez ten release.
- [ ] **B.2** Sprawdź `@sentry/nextjs` compatibility z Next 16 → bump `^10` jeśli wymagane
- [ ] **B.3** Run `npx @next/codemod@latest upgrade ./` (auto-migrate gdzie się da)
- [ ] **B.4** Migracja `next lint` → ESLint CLI oraz `middleware.ts` → `proxy.ts` po ocenie runtime.
- [ ] **B.5** Usunąć `UnsafeUnwrappedCookies`; przetestować local bypass i produkcyjny adapter.
- [ ] **B.6** Audit `pdf-lib` / `pdf2json` z Turbopack — local build + PDF generate test.
- [ ] **B.7** `cd COMPASS && npx tsc --noEmit` → 0 errors.
- [ ] **B.8** `npm --prefix COMPASS run lint` → 0 errors (eslint-config-next 16 ma nowe rules).
- [ ] **B.9** `npm --prefix COMPASS run test:unit` → all pass.
- [ ] **B.10** `cd COMPASS && npm run build` z Turbopack → 0 errors. Fallback `--webpack` jeśli regress.
- [ ] **B.11** `npm --prefix COMPASS run test:e2e` na stagingu.
- [ ] **B.12** Weryfikacja: login → `/internal/timesheets` → PDF export → `/admin` → `/akademia`.
- [ ] **B.13** Deploy exact-SHA do prod → smoke + monitor Sentry 48h.

**Estymata Faza B:** **12–16h** (React Canary, usunięcie sync Request APIs i testy PDF/Turbopack to większość)

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
- **NIE** dokładać niepotrzebnego upgrade'u Sentry do Fazy A; Sentry major ma mieć
  własny zakres, test source map i rollback.

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

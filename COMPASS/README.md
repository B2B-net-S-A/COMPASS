# COMPASS

Wewnętrzna aplikacja HR B2B Network: karta pracy, urlopy, premie, onboarding
i exit, mapa technologiczna klientów, skrzynka zgłoszeń, monitoring prawny.
Next.js 14 (App Router) + Supabase. Produkcja: **https://compass.dynaminds.pl**.

> Poprzednia wersja tego pliku była nietkniętym szablonem `create-next-app` —
> mówiła o porcie 3000, edytowaniu `app/page.tsx` i wdrażaniu na Vercela.
> Żadna z tych rzeczy nie jest prawdą o tym repozytorium.

## Gdzie co jest

| | |
|---|---|
| Aplikacja | `COMPASS/` (to ten katalog — repozytorium ma jeszcze `docker-compose.yml` i `.github/` w korzeniu) |
| Zasady projektu, fazy, pułapki | [`../CLAUDE.md`](../CLAUDE.md) — czytaj PRZED zmianami |
| Historia faz | [`../docs/historia-faz.md`](../docs/historia-faz.md) |
| Migracje SQL | `supabase/migrations/` (nigdy nie edytuj już zaaplikowanej) |

## Uruchomienie lokalne

```bash
npm ci
cp .env.local.example .env.local   # uzupełnij klucze Supabase
npm run dev                  # http://localhost:3000
```

Aplikacja w kontenerze słucha na **10000** (`APP_PORT` w compose); `npm run dev`
zostaje na domyślnym porcie Next.

## Kontrola jakości

```bash
npm run lint        # next lint
npx tsc --noEmit    # typecheck
npm test            # testy jednostkowe (Vitest)
npm run test:e2e    # Playwright — WYMAGA .env.test, patrz niżej
```

CI (`.github/workflows/build-check.yml`) bramkuje lint + typecheck + testy + build
i jest wymagany do merge'a. `next build` ma świadomie wyłączony typecheck
(`next.config.mjs`) — faza sprawdzania typów OOM-owała na build-hoście, więc
odpowiada za nią wyłącznie CI.

**E2E nie mają osobnego środowiska.** Zestaw zawiera testy piszące, a `.env.test`
wskazany na produkcję oznacza testy na danych 46 pracowników. Konta testowe
zakłada się ręcznie — patrz `.env.test.example` i `e2e/helpers/test-users.ts`.

## Wdrożenie

`git push origin main` → GitHub Actions woła webhook Coolify → Coolify buduje obraz
z repozytorium i restartuje → smoke test `/api/health` sprawdza zgodność `version`
z wdrażanym commitem. Rollback: panel Coolify → Deployments → Redeploy poprzedniego.
Szczegóły i procedury operacyjne: `CLAUDE.md` w korzeniu repozytorium.

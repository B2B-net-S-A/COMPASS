# Dodawanie bloków/prymitywów do Compass (DYNAMINDS DS)

Dwie biblioteki, dwie domeny:

- **Tailwind Plus** → application UI (shell, dashboardy, tabele, formularze). Brak CLI/rejestru — kod kopiujesz z **zalogowanej sesji** (`tailwindcss.com/plus`) i **adaptujesz na tokeny**.
- **shadcnblocks ELITE** → marketing/login/landing/onboarding. Rejestr `@shadcnblocks` w `components.json`; klucz `SHADCNBLOCKS_API_KEY` w gitignorowanym `.env.local` (odnów w `shadcnblocks.com/dashboard/api`).

## Złota zasada: token-first (nic verbatim)

Obie biblioteki dają zaszyte kolory; Tailwind Plus dodatkowo Tailwind v4 + własny JS `@tailwindplus/elements`. Przepisz na tokeny:

| zaszyte | token |
|---|---|
| `text-gray-900` / `text-slate-900` | `text-foreground` |
| `text-gray-500` / `text-gray-700` / `text-slate-200/400` | `text-muted-foreground` |
| `bg-white` / `bg-[#1a1a2e]` | `bg-card` |
| `bg-gray-50` | `bg-muted` |
| `bg-indigo-600` / `bg-blue-600` / `bg-[#3A8DFF]` | `bg-primary` |
| `hover:bg-indigo-500` | `hover:bg-primary/90` |
| `text-white` (na primary) | `text-primary-foreground` |
| `border-gray-200/300` / `border-white/10` | `border-border` |
| `divide-gray-200` | `divide-border` |
| `ring-indigo-*` / `ring-blue-*` | `ring-ring` |
| red-* (error/destructive/P1/rejected) | `destructive` |
| amber·yellow-* (warning/P2/pending) | `warning` |
| green-* (success/P3/approved) | `success` |
| blue-* (info) | `info` (token) lub `soft` badge |
| kolor wykresu (hex) | `hsl(var(--chart-1..5))` |
| tier hex (bronze/silver/platinum) | `hsl(var(--tier-bronze/-silver/-platinum))` |

- `--accent` to **subtelny neutral** (hover), **NIE** brand → emfaza zawsze przez `--primary`.
- Radius: używaj `rounded-lg/md/sm` (sterowane `--radius`) dla elementów reagujących na soft mode.
- Soft-mode hooki zostawiaj nietknięte: `.bg-card`, `rounded-xl/2xl`.
- Light-first: domyślnie jasny motyw; `.dark` to opt-in. Klient-skiny to accent-only `[data-theme="green|rose"]`.

## Prymitywy shadcn (atomy → `components/ui/`)

```bash
./scripts/add-block.sh primitive breadcrumb tooltip popover
npm install <wypisane deps> --legacy-peer-deps
```

Pobiera z publicznego rejestru shadcn (new-york) **bezpośrednio** — bez `npx shadcn add`, bo CLI: (1) przeformatowuje `tailwind.config.ts` i remapuje `--sidebar` → `--sidebar-background` (Compass tego nie ma → psuje sidebar), (2) bumpuje wersje istniejących deps. Prymitywy shadcn są już token-based (zwykle 0 przepisywania).

## Bloki shadcnblocks (sekcje → `components/blocks/`)

```bash
./scripts/add-block.sh shadcnblock login4 hero7
# następnie: przepisz raw-colory na tokeny wg tabeli wyżej
```

## Audyt (po każdym dodaniu)

```bash
git diff --stat                                                       # tylko zamierzone NOWE pliki
grep -nE "gray-[0-9]|indigo-[0-9]|slate-[0-9]|bg-white|sidebar-background" <plik>   # ma być pusto
npm run lint && npm run build                                        # zielone (build NIGDY równolegle z dev)
```

## Gotchas (Compass)

- App żyje w podkatalogu `COMPASS/`; wszystkie `npm`/`./scripts/*` odpalaj z `COMPASS/`.
- `@hello-pangea/dnd` (inbox Kanban) + nowsze `@radix-ui/react-primitive` augmentują `React.CSSProperties` → kolizja typów. Jeśli `tsc` wybuchnie na CSSProperties, przypnij `"@radix-ui/react-primitive": "2.1.4"` w `package.json` i zrób pełny reinstall.
- Worktree nie ma `node_modules` → `npm install` w `COMPASS/`.

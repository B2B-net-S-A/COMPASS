# Port koalescencji deployów + merge train z Nexusa — completion report

Data: 2026-08-08 · Port z Nexus PR #1072 (pełne uzasadnienie decyzji tam:
`docs/concurrent-deployments-completion-report.md` w repo Nexus).

## Co i po co

Wiele PR-ów wprowadzanych naraz blokowało się nawzajem (strict=true +
auto-merge nie aktualizuje gałęzi `BEHIND`), a burst merge'y = seria pełnych
rebuildów Coolify (jam kolejki 429) i fałszywie czerwone smoke testy
wyprzedzonych deployów (Coolify klonuje HEAD maina, smoke wymagał dokładnego
SHA).

## Zmiany

1. **`scripts/merge-train.sh`** — lokalny pociąg: uzbraja auto-merge (squash)
   i aktualizuje JEDEN PR na raz aż wszystkie wjadą. Lokalny, bo update
   z `GITHUB_TOKEN` w Actions nie triggeruje CI. GitHub merge queue
   niedostępny (repo prywatne na koncie osobistym).
2. **`deploy.yml` — precheck "burst coalescing"**: przed triggerem pyta
   `/api/health`; jeśli prod serwuje już pushnięty SHA lub jego potomka
   (compare API: `identical`/`ahead`) → skip rebuildu, od razu smoke test.
   Fail-open przy każdym błędzie sondy; `workflow_dispatch` nigdy nie skipuje.
3. **`deploy.yml` — smoke test akceptuje potomka** (fix z Nexus #965):
   deploy wyprzedzony przez nowszy merge = sukces, nie czerwień.

## Czego świadomie NIE portowano

- **Sharding testów** (Nexus PR #1083) — CI Compass ma ~6 min ściany
  (Typecheck + Lint + Test + Build 5,8 min), nie ma czego dzielić.
- **Deep healthcheck** — Compass nie ma `/api/health/deep`.
- **Bramkowanie deployu na CI** (Nexusowy łańcuch workflow_run) — poza
  zakresem tego portu; deploy nadal odpala się wprost na push.

## Weryfikacja

- [x] `yaml.safe_load` na deploy.yml, `bash -n` na skrypcie
- [ ] Deploy tego merge'a przechodzi ścieżką bez skipu (prod = przodek) —
      zielony smoke z nowym SHA
- [ ] Ścieżka skipu przy najbliższym burście: log "pomijam redundantny rebuild"

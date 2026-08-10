#!/usr/bin/env bash
set -euo pipefail

# Merge train: wprowadza WIELE gotowych PR-ów na main bez ręcznego klikania,
# pod branch protection strict=true ("branch must be up to date").
# Port z Nexusa (PR #1072) — tam pełny opis problemu i decyzji.
#
# Problem: przy strict=true każdy merge na main flipuje pozostałe PR-y w
# BEHIND, a GitHubowy auto-merge NIGDY sam nie aktualizuje gałęzi — seria
# PR-ów blokuje się nawzajem. Natywny GitHub merge queue jest niedostępny
# (repo prywatne na koncie osobistym — feature tylko dla organizacji).
#
# Jak działa: dla każdego PR-a Z KOLEJNOŚCI ARGUMENTÓW uzbraja auto-merge
# (squash), a gdy PR jest BEHIND — robi `gh pr update-branch` i czeka, aż CI
# przejdzie i auto-merge go wprowadzi. Aktualizuje JEDEN PR na raz (update
# wszystkich naraz marnuje minuty CI — każde lądowanie unieważnia resztę).
#
# Dlaczego to skrypt LOKALNY, a nie workflow w Actions: update-branch
# wykonany tokenem GITHUB_TOKEN nie triggeruje workflowów (suppression
# GitHuba), więc CI na PR-ze nigdy by nie ruszyło. Lokalny `gh` używa PAT-a.
#
# Deploye z serii merge'y NIE zapchają kolejki Coolify: deploy.yml pomija
# redundantny rebuild, gdy prod serwuje już dany SHA lub jego potomka.
#
# Użycie:
#   scripts/merge-train.sh 301 302 303
#
# Env (opcjonalne):
#   MERGE_TRAIN_REPO                (default artur-t-96/compass)
#   MERGE_TRAIN_POLL_SECONDS        (default 60 — CI trwa tu ~6 min)
#   MERGE_TRAIN_PR_TIMEOUT_MINUTES  (default 45 — na PR)

REPO="${MERGE_TRAIN_REPO:-artur-t-96/compass}"
POLL_SECONDS="${MERGE_TRAIN_POLL_SECONDS:-60}"
PER_PR_TIMEOUT_MINUTES="${MERGE_TRAIN_PR_TIMEOUT_MINUTES:-45}"

if [ $# -lt 1 ]; then
    echo "użycie: $0 <pr> [pr...]  (numery PR-ów w kolejności wprowadzania)" >&2
    exit 2
fi

skipped=()

for pr in "$@"; do
    echo "== PR #$pr =="
    state=$(gh pr view "$pr" --repo "$REPO" --json state --jq .state)
    if [ "$state" = "MERGED" ]; then
        echo "już zmergowany — dalej"
        continue
    fi
    if [ "$state" != "OPEN" ]; then
        echo "⚠️  pomijam (state=$state)"
        skipped+=("$pr")
        continue
    fi

    # Idempotentne: na CLEAN PR-ze z zielonym CI merguje od razu, w innym
    # stanie tylko uzbraja auto-merge na później.
    gh pr merge "$pr" --repo "$REPO" --squash --auto || true

    deadline=$(( $(date +%s) + PER_PR_TIMEOUT_MINUTES * 60 ))
    while :; do
        info=$(gh pr view "$pr" --repo "$REPO" --json state,mergeStateStatus)
        state=$(jq -r .state <<<"$info")
        mss=$(jq -r .mergeStateStatus <<<"$info")

        if [ "$state" = "MERGED" ]; then
            echo "✅ #$pr wjechał"
            break
        fi
        if [ "$state" = "CLOSED" ]; then
            echo "⚠️  #$pr zamknięty bez merge — pomijam"
            skipped+=("$pr")
            break
        fi

        case "$mss" in
            DIRTY)
                # Konflikt tekstowy z main — wymaga człowieka/agenta; nie
                # blokujemy reszty pociągu.
                echo "⚠️  #$pr ma konflikt z main — pomijam, jadę dalej"
                skipped+=("$pr")
                break
                ;;
            BEHIND)
                echo "#$pr BEHIND → gh pr update-branch (merge maina do gałęzi, CI ruszy od nowa)"
                gh pr update-branch "$pr" --repo "$REPO" \
                    || echo "update-branch nie przeszedł — ponowię w następnym obiegu"
                ;;
            *)
                # BLOCKED = CI w toku LUB nierozwiązane wątki review.
                # UNSTABLE = failuje niewymagany check. CLEAN = zaraz wjedzie.
                echo "#$pr status=$mss — czekam ${POLL_SECONDS}s (CI/auto-merge)"
                ;;
        esac

        if [ "$(date +%s)" -ge "$deadline" ]; then
            echo "⚠️  #$pr nie wjechał w ${PER_PR_TIMEOUT_MINUTES} min (status=$mss) — pomijam."
            echo "    Sprawdź: czerwony required check? nierozwiązane wątki review?"
            skipped+=("$pr")
            break
        fi
        sleep "$POLL_SECONDS"
    done
done

echo
if [ ${#skipped[@]} -gt 0 ]; then
    echo "Merge train zakończony. Pominięte PR-y (wymagają ręcznej uwagi): ${skipped[*]}"
    exit 1
fi
echo "Merge train zakończony — wszystkie PR-y wjechały."

#!/bin/bash
# Dla każdego czerwonego checka PR-a: ponów bieg tylko, gdy log pokazuje błąd 504 pobierania narzędzia.
R=B2B-net-S-A/COMPASS
G() { env -u GH_TOKEN gh "$@"; }
for n in "$@"; do
  for id in $(G pr checks "$n" --repo "$R" --json state,link --jq '.[]|select(.state=="FAILURE")|.link' | sed -E 's#.*/runs/([0-9]+).*#\1#' | sort -u); do
    log=$(G run view "$id" --repo "$R" --log-failed 2>&1 | sed -E 's/^[^\t]*\t[^\t]*\t//')
    if echo "$log" | grep -q 'returned error: 504'; then
      G run rerun "$id" --repo "$R" --failed >/dev/null 2>&1
      echo "#$n run $id: 504, ponowiono"
    else
      echo "#$n run $id: INNY BLAD"
      echo "$log" | grep -iE 'error|fail|leaks found|RuleID' | sed -E 's/(Secret|Match).*/\1 [redacted]/' | tail -8 | cut -c1-240
    fi
  done
done

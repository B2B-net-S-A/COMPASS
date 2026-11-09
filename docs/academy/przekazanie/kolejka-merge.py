#!/usr/bin/env python3
"""Szeregowa kolejka scalania: aktualizuje tylko jeden PR naraz. Kończy się, gdy scalony zostanie PR-cel."""
import json, os, subprocess, sys, time

REPO = 'B2B-net-S-A/COMPASS'
TARGET = int(sys.argv[1])
PRIORITY = [int(x) for x in sys.argv[2:]]
ENV = {k: v for k, v in os.environ.items() if k != 'GH_TOKEN'}
DEADLINE = time.time() + 3 * 3600


def gh(*args):
    return subprocess.run(['gh', *args], capture_output=True, text=True, env=ENV, timeout=60)


def prs():
    r = gh('pr', 'list', '--repo', REPO, '--state', 'open', '--limit', '60', '--json', 'number,title,isDraft,mergeable,mergeStateStatus,autoMergeRequest')
    return [p for p in json.loads(r.stdout or '[]') if p.get('autoMergeRequest') and not p['isDraft']]


def state(n):
    r = gh('pr', 'view', str(n), '--repo', REPO, '--json', 'state,mergeStateStatus,mergeable')
    return json.loads(r.stdout or '{}')


last_update = {}
while time.time() < DEADLINE:
    try:
        t = state(TARGET)
        if t.get('state') == 'MERGED':
            print(f'SCALONY #{TARGET}', flush=True)
            sys.exit(0)
        if t.get('mergeable') == 'CONFLICTING':
            print(f'KONFLIKT #{TARGET}', flush=True)
            sys.exit(2)
        items = sorted(prs(), key=lambda p: (PRIORITY.index(p['number']) if p['number'] in PRIORITY else 99, p['number']))
        def red(p):
            try:
                c = json.loads(gh('pr', 'checks', str(p['number']), '--repo', REPO, '--json', 'name,state').stdout or '[]')
            except Exception:
                return False
            return any(x['state'] == 'FAILURE' for x in c)
        head = next((p for p in items if p['mergeable'] != 'CONFLICTING' and not (p['mergeStateStatus'] == 'BLOCKED' and red(p))), None)
        if head and head['mergeStateStatus'] == 'BEHIND' and time.time() - last_update.get(head['number'], 0) > 120:
            r = gh('pr', 'update-branch', str(head['number']), '--repo', REPO)
            last_update[head['number']] = time.time()
            print(f"aktualizacja #{head['number']}: {(r.stdout or r.stderr).strip()[:100]}", flush=True)
    except Exception as exc:
        print(f'błąd pętli: {exc}', flush=True)
    time.sleep(45)
print(f'LIMIT CZASU dla #{TARGET}', flush=True)
sys.exit(3)

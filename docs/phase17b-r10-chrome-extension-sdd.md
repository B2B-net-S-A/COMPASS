# Phase 17b R10 — Chrome extension SDD (System Design Doc)

**Status:** Backlog — wymagana decyzja Artura czy w ogóle scope.

**Effort:** 40-80 h dev + 7-14 dni Chrome Web Store review.

**Plan parent:** [`~/.claude/plans/zaplanuj-wszystko-deep-dolphin.md`](../../../.claude/plans/zaplanuj-wszystko-deep-dolphin.md) — Faza 2 backlog item.

## Problem

Smart Work Clock (Phase 17 + Phase 17b) tracks aktywność TYLKO w przeglądarce, gdy karta Compass ma focus. Internal employees często pracują w innych narzędziach (Salesforce, Slack, Gmail, Notion) — ich praca w tych domenach NIE jest mierzona, mimo że jest pracą.

Skutek: pracownik realnie pracuje 8h, z czego 4h w Compass + 4h w Salesforce → w Smart Clock zobaczy 4h. Frustracja, niedoszacowanie godzin.

## Goal

Lekka Chrome extension która rozszerza tracking o **dozwolone domeny** (whitelist: Salesforce, Slack, Gmail, Notion — konfigurowalne per organizacja). Dane wpadają do tej samej tabeli `work_clock_heartbeats` z dodatkową kolumną `external_domain`.

## Non-goals (explicite POZA scope)

- ❌ Tracking domen prywatnych (Facebook, YouTube, Reddit) — RODO katastrofa
- ❌ Tracking treści stron (URL beyond domain, query params, scraped content)
- ❌ Screenshots, screen recording — Hubstaff territory, nie idziemy tam
- ❌ Always-on bez explicit opt-in
- ❌ Auto-install via MDM/policy — user zawsze musi zaakceptować z Chrome Store

## Architecture

### Components

1. **Chrome extension** (osobny repo `compass-extension`)
   - Manifest v3 (Chrome Store wymaga)
   - Background service worker — listenery `chrome.tabs`, `chrome.webNavigation`
   - Content script — tylko aby wykryć aktywny tab + `document.visibilityState`
   - Popup UI — toggle on/off + status "active session"
   - Settings page — manage whitelist (read-only — admin org pre-configures)

2. **Server-side w Compass**:
   - Nowa tabela `work_clock_external_domains` (whitelist per-org, jeśli kiedyś multi-tenant; dziś single org → static config)
   - Rozszerzony endpoint `/api/clock/heartbeat` z dodatkowym polem `external_domain` (nullable string, max 100 chars)
   - Server walidacja: `external_domain` musi być w whitelist albo null
   - `work_clock_heartbeats` ALTER ADD COLUMN external_domain TEXT (nullable)

3. **Token-based auth między extension a Compass**:
   - User loguje się raz w extension przez OAuth-like flow (extension popup → Compass `/auth/extension` → user akceptuje → token zwracany)
   - Token zapisywany w `chrome.storage.local` (encrypted)
   - Każdy heartbeat ma `Authorization: Bearer <token>` header

### Data flow

```
[Chrome tab: salesforce.com] → background SW detects URL change
   ↓ (whitelist check)
[Extension service worker] → POST /api/clock/heartbeat
   { sessionId, ts, wasActive: true, externalDomain: "salesforce.com" }
   ↓
[Compass /api/clock/heartbeat] → validate token + domain in whitelist
   ↓
[work_clock_heartbeats] INSERT row z external_domain="salesforce.com"
   ↓
[work_clock_daily VIEW] aggregates active_seconds (no change to view)
```

## Privacy / RODO

**Bumps consent terms version do v4** (force re-acceptance dla wszystkich userów).

Nowa sekcja w `MonitoringConsentDialog`:
> "Opcjonalnie: Chrome extension. Jeśli zainstalujesz Compass extension, system będzie też mierzył czas pracy w wybranych domenach (Salesforce, Slack, Gmail) — TYLKO domain name, NIGDY URL, query params ani treść stron. Możesz wyłączyć extension w dowolnym momencie."

**Whitelist** musi być explicit. Nie wildcard (`*.salesforce.com` OK, ale nie `*`).

**Visible icon** — Chrome wymaga dla `tabs` permission. User zawsze widzi że extension jest aktywne.

**Sentry breadcrumb** dla tracking spoof (extension wysyła heartbeat z domain spoza whitelist → audit + reject).

## DB migration

```sql
-- Phase 17b R10 — external domain tracking via Chrome extension
ALTER TABLE work_clock_heartbeats
    ADD COLUMN IF NOT EXISTS external_domain TEXT;

CREATE INDEX IF NOT EXISTS idx_heartbeats_external_domain
    ON work_clock_heartbeats(external_domain)
    WHERE external_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS work_clock_external_domains (
    domain TEXT PRIMARY KEY,
    label TEXT NOT NULL,  -- friendly name for UI ("Salesforce")
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

INSERT INTO work_clock_external_domains (domain, label) VALUES
    ('salesforce.com', 'Salesforce'),
    ('lightning.force.com', 'Salesforce Lightning'),
    ('slack.com', 'Slack'),
    ('app.slack.com', 'Slack App'),
    ('mail.google.com', 'Gmail'),
    ('notion.so', 'Notion'),
    ('atlassian.net', 'Jira/Confluence')
ON CONFLICT (domain) DO NOTHING;
```

## Effort breakdown

| Task | Hours |
|---|---|
| Chrome extension repo setup, manifest v3 boilerplate | 4 |
| Background SW: tab/URL listeners + whitelist filtering | 8 |
| Auth flow (Compass `/auth/extension` page + token storage) | 12 |
| Heartbeat sender + retry + offline queue (chrome.storage) | 8 |
| Popup UI (status + toggle) | 4 |
| Compass-side: ALTER table + extend `/api/clock/heartbeat` | 4 |
| Compass-side: settings page dla whitelist (admin) | 8 |
| Tests (extension unit + Compass integration) | 8 |
| Chrome Web Store submission + iteration | 8-16 |
| Docs (user guide, troubleshooting) | 4 |
| **Total** | **40-80 h dev + 7-14 d Store review** |

## Decision matrix

| Pro | Contra |
|---|---|
| Realna wartość — pracownicy nie tracą godzin za pracę poza Compass | Duży overhead (osobny repo, lifecycle, Store) |
| Wzmacnia "trust-first" positioning vs Hubstaff/Time Doctor | Tylko Chrome — Firefox/Safari users out |
| RODO compliant z whitelist + opt-in | Bump terms v4 = re-consent dla wszystkich |
| Skalowalne — można dodać domeny w przyszłości | Risk: user zapomni że extension zainstalowane → Sentry alert? |

## Recommended decision

**Backlog z 2 opcjami trigger:**
1. Po 30 dniach od PR-C2 merge — feedback od Artura/internal team czy widzą problem niedomierzania
2. Albo natychmiast po pierwszym konkretnym case (\"pracowałem 3h w Salesforce, w Smart Clock 0h\")

Jeśli decyzja na tak — sugerowany approach: **MVP Chrome-only w 2 sprintach**:
- Sprint 1 (1 tydzień): manifest + auth flow + 3 hardcoded domeny (no admin UI)
- Sprint 2 (1 tydzień): admin UI dla whitelist + Compass-side stats + Store submission

Firefox / Safari extension to OSOBNY projekt, nie blokuje Chrome MVP.

## Open questions dla biznesu

1. Czy Compass jest single-org (dynaminds.pl tylko) czy multi-tenant? Wpływa na schemat `work_clock_external_domains` (per-org vs global).
2. Czy ma być monitoring `chrome.idle.onStateChanged` żeby ekstensja tickowała heartbeats też podczas idle (browser-level idle detection)?
3. Decyzja: extension pracuje TYLKO gdy session w Compass jest active, czy autonomicznie (wykrywa pracę i tworzy session)?

---

**TL;DR:** Backlog. Wymaga decyzji Artura czy realnie potrzebny (vs alternative: trening pracowników żeby pracowali w Compass tab z dłużej otwartym timesheetem). Jeśli yes → osobne repo, ~2 sprinty pracy + Store review.

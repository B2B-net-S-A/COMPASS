# Internal role fix — completion report

**Date:** 2026-05-08
**PR:** [#43](https://github.com/artur-t-96/compass/pull/43) — `fix(auth): preserve internal role across logins`
**Deployed commit:** `61fa83e9568cb4cad5387af8d28ae326425d6b9c`
**Production verified:** `https://compass.dynaminds.pl/api/health` → `{"status":"healthy","version":"61fa83e..."}`

## Problem

`syncRole()` w [lib/auth/sync-role.ts](../lib/auth/sync-role.ts) hard-kodował wynik jako `'admin' | 'consultant'`. Po wprowadzeniu Phase 11a (3 role: admin/consultant/internal) funkcja nadal nie znała `internal` — przy każdym logowaniu (email+password ORAZ Microsoft SSO callback) resetowała rolę `internal` na `consultant`.

Skutek: pracownik wewnętrzny (Olaf — `olaf.moczydlowski@b2bnetwork.pl`) tracił dostęp do modułu HR (`/internal/timesheet`, `/internal/leave`, `/internal/attendance`). RLS bramka `is_internal_or_admin()` wpuszcza tylko `role IN ('internal','admin')`.

## Root cause

```ts
// PRZED (buggy):
const target: 'admin' | 'consultant' = shouldBeAdmin ? 'admin' : 'consultant'
if (currentRole !== target) {
    await supabase.from('profiles').update({ role: target }).eq('id', userId)
}
```

Każdy non-admin user był forsowany do `consultant`, niezależnie od tego co było w `currentRole`. Zero awareness o `internal`.

## Fix

Trzy-stanowa logika z preserve dla `internal`:

```ts
let target: DbRole
if (shouldBeAdmin) {
    target = 'admin'
} else if (currentRole === 'internal') {
    target = 'internal'  // preserve manual assignment
} else {
    target = 'consultant'
}
```

`admin_access_list` pozostaje source of truth dla admin promotion/demotion. `internal` jest ustawiany ręcznie przez admina przez `UserManagementPanel.setUserRole()` i syncRole już go nie clobberuje.

## Decision rationale

Rozważone 3 podejścia:

1. ❌ Self-service przy rejestracji (user wybiera "Konsultant"/"Pracownik wewnętrzny") — odrzucone, error-prone (każdy może wybrać internal i zobaczyć HR'owe dane zespołu).
2. ❌ `internal_access_list` table (analogicznie do `admin_access_list`) — rozważane jako default, ale Artur preferował zachowanie status quo.
3. ✅ **Manual admin assignment via UserManagementPanel + naprawa syncRole** — wybrane. Zero zmian w UI, zero nowych tabel, minimalna powierzchnia zmian.

## Files changed

- **Modified:** `APK-COMPASS/lib/auth/sync-role.ts` (~10 linii diff) — preserve `internal`, type widening do `DbRole`, header comment update.
- **Created:** `APK-COMPASS/lib/auth/__tests__/sync-role.test.ts` (164 linii) — 7 unit tests pokrywających wszystkie ścieżki:
  1. Super-admin promotion (consultant → admin)
  2. Admin_access_list hit (no-op write)
  3. **Internal preservation (regression test fix)**
  4. Consultant baseline (no-op)
  5. Ex-admin demotion (admin → consultant po removal z access list)
  6. Admin override (admin promotion overrides internal)
  7. Email case-insensitivity (lowercased lookup)

**No DB migration.** Enum `user_role` już ma `internal` (Phase 11a, [migration 20260507120000](../supabase/migrations/20260507120000_phase11a_internal_role_value.sql)).

## Data fix

Po wdrożeniu, jeden-raz UPDATE w prod (Supabase MCP):

```sql
UPDATE profiles SET role = 'internal'
WHERE email = 'olaf.moczydlowski@b2bnetwork.pl' AND role = 'consultant'
RETURNING id, email, role;
-- → fb20befa-fc4e-4860-8c8f-2bad04752b51 | olaf.moczydlowski@b2bnetwork.pl | internal
```

Wąski predicate `AND role = 'consultant'` chronił przed niezamierzoną zmianą gdyby Olaf był już admin/internal.

## Microsoft SSO admin consent (separate task)

Side-quest: Azure AD prompt "Need admin approval" przy SSO logowaniu dla każdego nowego usera z `@b2bnetwork.pl`.

**Akcja:** Azure Portal → App registrations → "Compass (compass.dynaminds.pl)" → API permissions → klik "Grant admin consent for B2bnet S.A." → potwierdzenie. Status User.Read przeszedł na "Granted for B2bnet S.A." z zielonym checkmarkiem.

Po consent grant wszyscy users z tenanta b2bnetwork.pl mogą logować się przez Microsoft bez per-user prompta.

**Azure App refs (zapisane w pamięci):**
- Client ID: `17f9ff8c-ac4e-414d-890e-a823722b4c35`
- Tenant ID: `e277180c-b58a-418c-b362-bb89ab0b1301`
- Client secret valid until: 2028-05-06

## Verification

- ✅ `npm run test:unit -- sync-role` → 7/7 pass
- ✅ `npm run lint` → no new warnings
- ✅ `npx tsc --noEmit` → clean
- ✅ Production deploy: SHA `61fa83e` healthy at `compass.dynaminds.pl/api/health`
- ✅ Olaf's profile: `role='internal'` w DB
- ✅ Regression: 6 admin + 2 consultant + 1 internal — distribucja zgodna z oczekiwaniami
- ✅ Azure admin consent shown jako "Granted for B2bnet S.A." w portal.azure.com
- ⏳ End-user UAT: Olaf musi się zalogować i sprawdzić `/internal/timesheet` (manual step)

## Known limitations / follow-ups

1. **`removeAdminMember` race** ([admin-management.ts:152-163](../lib/actions/admin-management.ts)): pre-sets na `consultant` przed syncRole. Jeśli zdejmowany admin był też ustawiony jako `internal` w innym kontekście, `internal` zostanie utracone (rare path). Out of scope, follow-up TODO.

2. **Brak self-service role choice przy rejestracji.** Świadoma decyzja — admin ręcznie zmienia rolę przez UserManagementPanel. Nowa user `marta.kozarzewska@b2bnetwork.pl` zarejestrowana 2026-05-08 będzie wymagała ręcznej zmiany jeśli ma być pracownikiem wewnętrznym.

3. **Deploy retry due to Sentry 504.** Pierwszy deploy padł (commit 61fa83e, deploy id 41) z powodu transient `sentry-cli releases new` 504 Gateway Timeout podczas source maps upload. Wszystkie deploye od 09:08 dnia 2026-05-08 padały tak samo (nie mój bug). Re-trigger workflow rozwiązał.

4. **Test coverage:** sync-role.test.ts to pierwsze unit testy dla tej funkcji. `admin-management.ts` (addAdminMember/removeAdminMember) nadal bez testów — TODO.

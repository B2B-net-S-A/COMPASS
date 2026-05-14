# Refactor ról 2026-05-11 — Completion Report

## TL;DR

3-rolowy model Compass z odwróconą semantyką `internal`. Zmiana w 2 zmergeowanych PR-ach + 2 migracje DB applied:

| Rola DB (bez zmian) | UI label | Co widzi |
|---|---|---|
| `admin` | **Super Admin** | Wszystko |
| `consultant` | **Konsultant IT** | Platform: home/learning/league/incubator/news/support + profile/settings/messages/documents |
| `internal` | **Konsultant biurowy** | **TYLKO** `/internal/*` (HR Hub) + profile/settings/messages |

## PR-y zmergeowane

### [#73 — chore(admin) cleanup post-Phase 16 + employment_type default b2b](https://github.com/artur-t-96/compass/pull/73)

**Merged:** 2026-05-11T13:03:34Z · commit `b4c4a04` · CI: green · Deployed: ✓

Fix 4 bugów:
1. `addAdminMember()` crashował w produkcji bo odwoływał się do tabeli `centrala_access_list` (zdroppiona w Phase 16, PR #27). Wszyscy obecni 4 adminowie byli dodani ręcznie via SQL, bo UI rzucał PGRST205.
2. Schema mismatch `admin_access_list.full_name` — kolumna w kodzie, nie istnieje w DB. `getAdminMembers` fallbackował na profiles.full_name, ale INSERT z full_name rzucał błąd.
3. Dead kolumna `profiles.role_name` — null wszędzie, 0 referencji w kodzie. Drop migration.
4. `employment_type` default `'uop'` → `'b2b'` (firma B2B Network).

Plus cleanup test fixtures: `e2e/helpers/test-users.ts` miał dead enum values `centrala|administrator` z Phase 16.

**Migracje DB applied 2026-05-11T13:18Z:**
- `cleanup_drop_role_name` ✓
- `employment_type_default_b2b` ✓

Verified: `SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name='role_name'` → empty; `column_default` dla employment_type = `'b2b'::text`.

### [#74 — feat(auth) refactor 3 ról](https://github.com/artur-t-96/compass/pull/74)

**Merged:** 2026-05-11T13:15:13Z · commit `4878de9` · CI: green · Deployed: ✓ (status: healthy)

Pliki zmienione:
- [lib/types/permissions.ts](../COMPASS/lib/types/permissions.ts) — `PermissionRole` poszerzony o `'internal'`, dodane `DEFAULT_PERMISSIONS.internal` z wszystkimi platform features `'false'`
- [middleware.ts](../COMPASS/middleware.ts) — inverse guard: jeśli `role==='internal'` i path platform → redirect `/internal`; jedno SELECT profile (wcześniej 2)
- [lib/types/role.ts](../COMPASS/lib/types/role.ts) — `roleLabelPl()`: Super Admin / Konsultant IT / Konsultant biurowy
- [lib/i18n/dictionary.ts](../COMPASS/lib/i18n/dictionary.ts) — `nav_settings`: "Ustawienia" → "Moje preferencje" (PL+EN)
- [app/(protected)/home/page.tsx](../COMPASS/app/\(protected\)/home/page.tsx) — defense-in-depth server-side redirect dla internal
- [app/login/actions.ts](../COMPASS/app/login/actions.ts) + [app/auth/callback/route.ts](../COMPASS/app/auth/callback/route.ts) — `redirect(role==='internal' ? '/internal' : '/home')`
- [lib/actions/user-admin.ts](../COMPASS/lib/actions/user-admin.ts) — `setUserRole`: auto-set `onboarding_completed=true` przy promote→internal (bez tego biurowi utknęliby w consultant onboarding flow)

### [#77 — feat(admin) admin invite flow + ukrycie self-signup](https://github.com/artur-t-96/compass/pull/77)

**Merged:** 2026-05-11T13:46:08Z · commit `e5df2de` · CI: green · Deployed: ✓ (po jednym retry — Sentry CLI 504 timeout zewnętrzny)

Pliki:
- `lib/actions/user-admin.ts` — nowa server action `inviteUser({email, fullName, role, employmentType, workStartDate})` wzywająca `supabase.auth.admin.inviteUserByEmail()` + override profile fields, auto `onboarding_completed=true` dla `internal`, audit log `INVITE_USER`
- `components/admin/InviteUserDialog.tsx` — modal z formularzem (HR fields warunkowo dla `internal`)
- `components/admin/UserManagementPanel.tsx` — button "Zaproś użytkownika" w header
- `app/login/page.tsx` — usunięty toggle "Zarejestruj się", zastąpiony komunikatem "Skontaktuj się z administratorem"
- `lib/actions/audit.ts` — nowy AuditAction `INVITE_USER`
- E2E testy signup → "self-signup disabled" tests

Smoke ✓: HTML `/login` zawiera komunikat "Skontaktuj się z administratorem", brak `Zarejestruj się` button.

## Pozostałe kroki

### PR #3 — Supabase identity linking (MANUAL action — wymaga Twojej akcji)

**Co:** włączyć "Automatic Identity Linking" w Supabase Auth żeby `marta@b2bnetwork.pl` (email/password) po pierwszym MS SSO zachowała swój profil zamiast tworzyć duplikat auth user.

**Jak:**
1. Login do https://supabase.com/dashboard/project/shduiynzemftkqqefscd
2. Authentication → Providers → "Manual linking" lub Auth Settings → "Identity linking"
3. Toggle ON
4. Save

**Bezpieczne włączenie:** pre-flight check pokazał 0 userów z duplikatami providerów (`SELECT user_id FROM auth.identities GROUP BY user_id HAVING COUNT(*) > 1` → empty).

### PR #4 — admin invite flow + ukrycie signup ✓ DONE (PR #77)

Zrealizowane w [#77](https://github.com/artur-t-96/compass/pull/77) — sekcja powyżej.

## Verification

### Tech (automatyczne, ✓ done)
- `npm run lint` — zielony (warnings pre-existing)
- `npm run test:unit` — 521/521 passed (po update tests dla nowych labelków)
- `npm run build` — zielony (oba PR-y)
- `curl https://compass.dynaminds.pl/api/health` — `{"status":"healthy","version":"4878de9..."}` ✓
- DB schema introspect — `role_name` dropped, `employment_type` default `'b2b'` ✓

### UI smoke (manual, TODO dla Ciebie)
Zaloguj się i sprawdź:

1. **Sidebar (jako Artur/Super Admin):**
   - Grupa "Konto" → pozycja **"Moje preferencje"** (zamiast "Ustawienia") ✓ oczekuje
   - Grupa "Administracja" → **"Ustawienia platformy"** (bez zmian)

2. **`/admin/settings/users` (jako Artur):**
   - Dropdown ról ma 3 opcje: "Super Admin / Konsultant IT / Konsultant biurowy"
   - Promote'uj Klaudię z `consultant` na `internal` — Klaudia po przelogowaniu powinna lądować na `/internal`

3. **Test internal (zaloguj się jako Olaf lub przerolowanej Klaudia):**
   - Po loginie → redirect na `/internal` (nie `/home`)
   - Sidebar pokazuje tylko "Strefa wewnętrzna" + "Konto" (bez Growth + Społeczność)
   - Manual nav `/learning` → redirect na `/internal`
   - `/home` → redirect na `/internal`

4. **Test admin functionality:**
   - `/admin/settings/admins` → "Dodaj Administratora" z dowolnym `@b2bnetwork.pl` → działa **bez PGRST205 error** (Bug 1 fix)
   - `/admin/settings/users` → edytuj profil HR nowego usera → default `employment_type` to **B2B** (nie UoP) (Fix 4)

## Out of scope (do osobnych ticketów)

- MFA dla `internal` — biurowi widzą HR data (urlopy, attendance). Dziś tylko admin ma MFA cookie. Opcjonalne wzmocnienie.
- DB enum cleanup — gdy potwierdzi się że `consultant` nie jest używany, można zdroppić wartość z enum (obecnie 3 userów wciąż ma `consultant`).
- `lib/actions/loyalty.ts:530` — filtruje dead enum values (`b2b_consultant`, `contractor`, `candidate`). Dead code, low risk.
- `AdminDashboardPanel` — label "Konsultantów" → automatycznie podejmie "Konsultanci IT" przez `roleLabelPl`. Jeśli mylące w kontekście dashboardu, osobny tweak.

## Plan oryginalny

Plik: [/Users/arturtwardowski/.claude/plans/zaplanuj-wszystko-zgodnie-z-woolly-scone.md](../../.claude/plans/zaplanuj-wszystko-zgodnie-z-woolly-scone.md) — pełny plan w 4 fazach z critical files list.

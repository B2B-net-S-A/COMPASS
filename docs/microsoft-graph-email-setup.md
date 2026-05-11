# Microsoft Graph email — Azure setup

> **Status: 2026-05-11 LIVE (in production).** Resend usunięty całkowicie (PR #68).
>
> Wszystkie kroki 1-6 wykonane. Application Access Policy aktywna, dedykowany shared mailbox `noreply@b2bnetwork.pl` utworzony, 7/7 emaili w smoke test wysłane bez błędów.
>
> Dokument zostawiamy jako historyczny opis konfiguracji (na wypadek migracji do innego tenanta lub drugiej aplikacji).

## TL;DR — co jest live

| Komponent | Wartość | Stan |
|---|---|---|
| Azure App | `Compass` (AppId `17f9ff8c-ac4e-414d-890e-a823722b4c35`, tenant `b2bnetwork.pl`) | ✅ |
| Application permission | `Mail.Send` (Microsoft Graph) | ✅ admin consent granted |
| Client secret | `compass-email-graph` | ✅ wygasa 2028-05-09 |
| Shared mailbox | `noreply@b2bnetwork.pl` (display: ComPass System) | ✅ created EU region (eurprd07) |
| Application Access Policy | `RestrictAccess` → grupa `compass-senders@b2bnetwork.pl` (1 mailbox) | ✅ Granted/Denied test passed |
| MAIL_FROM | `ComPass System <noreply@b2bnetwork.pl>` | ✅ Coolify env (runtime) |
| MAIL_PROVIDER | `graph` | ✅ Coolify env (runtime) |
| Smoke test | timesheet-reminder mon-nudge | ✅ 7 sent, 0 failed (2026-05-11) |

Po merge PR-E `lib/email/sender.ts` ma adapter Microsoft Graph który czeka na credentials. Bez nich kod fallbackuje do Resend (jeśli RESEND_API_KEY działa) — czyli zero downtime.

## 1. Azure Portal — App Registration permission

Compass ma już Azure App Registration dla SSO (b2bnetwork.pl tenant, single-tenant, admin consent granted 2026-05-08, secret expires 2028-05-06 — z memory).

Dodaj **Application permission** `Mail.Send` (NIE Delegated):

1. Login → [portal.azure.com](https://portal.azure.com)
2. Microsoft Entra ID → App registrations → znajdź Compass app (ta sama która ma `provider: 'azure'` w Supabase)
3. **API permissions** → **Add a permission** → Microsoft Graph → **Application permissions** → szukaj `Mail.Send` → zaznacz → **Add permissions**
4. **Grant admin consent for b2bnetwork.pl** (musi kliknąć admin tenanta — czyli Ty)

> ⚠️ Application permission `Mail.Send` **bez restrykcji** pozwala app wysyłać email JAKO dowolny user w tenant. To zbyt szerokie. Zob. punkt 3 (Application Access Policy).

## 2. Azure Portal — Client Secret (jeśli nie macie)

1. App Registration → **Certificates & secrets** → **+ New client secret**
2. Description: "Compass email Graph", Expiry: 24 miesiące
3. Skopiuj **Value** od razu (nie zobaczysz go drugi raz)
4. Zapisz w password manager (potem do Coolify env var)

> Jeśli macie już secret dla SSO — możesz go reużyć (ten sam app, ta sama tożsamość). Ale wygodniej osobny "Compass email" secret żeby móc rotować niezależnie od SSO.

## 3. PowerShell — Application Access Policy (ograniczenie do jednej skrzynki) — DONE 2026-05-11

To jest KLUCZOWE dla bezpieczeństwa. Bez tego Compass app może wysyłać jako CEO jak zechce — kompromitacja secret = wszystkie maile w firmie.

**Wykonane zostało via Exchange Online PowerShell na compass-prod (Linux ARM Hetzner).** Powód: lokalna instalacja pwsh wymagała sudo TTY (brak), Azure Cloud Shell wymaga subscription (tenant nie ma żadnej). Linux pwsh + ExchangeOnlineManagement module jako alternatywa.

Procedura (jeśli kiedyś trzeba powtórzyć):

```bash
# Na serwerze Linux (Ubuntu 24.04 ARM):
ssh root@<server>
mkdir -p /opt/pwsh && cd /opt/pwsh
curl -fsSL -o pwsh.tar.gz 'https://github.com/PowerShell/PowerShell/releases/download/v7.5.0/powershell-7.5.0-linux-arm64.tar.gz'
tar xzf pwsh.tar.gz && chmod +x pwsh
./pwsh -Command "Install-Module -Name ExchangeOnlineManagement -Scope AllUsers -Force"

# Connect device code (auth via przeglądarka jako Global Admin):
tmux new-session -d -s exo "/opt/pwsh/pwsh -NoExit -Command 'Connect-ExchangeOnline -Device -ShowBanner:\$false -UserPrincipalName artur.twardowski@b2bnetwork.pl' 2>&1 | tee /tmp/exo.log"
# → log pokazuje URL (https://login.microsoft.com/device) + kod (np. "LJYETC8RQ")
# Otwórz URL w przeglądarce, wpisz kod, zaloguj się jako Global Admin, potwierdź "Continue"
```

Następnie cmdlets:

```powershell
# 1. Stwórz mail-enabled security group z jedną skrzynką (Exchange wymaga grupy, nie pojedynczego user)
New-DistributionGroup -Name "CompassMailSenders" -Type "Security" -Members "noreply@b2bnetwork.pl" -PrimarySmtpAddress "compass-senders@b2bnetwork.pl"

# 2. Zarejestruj Application Access Policy
New-ApplicationAccessPolicy `
  -AppId "17f9ff8c-ac4e-414d-890e-a823722b4c35" `
  -PolicyScopeGroupId "compass-senders@b2bnetwork.pl" `
  -AccessRight RestrictAccess `
  -Description "Compass app can only send mail as noreply@b2bnetwork.pl"

# 3. Test (oba zwróciły poprawnie 2026-05-11)
Test-ApplicationAccessPolicy -Identity "noreply@b2bnetwork.pl" -AppId "17f9ff8c-ac4e-414d-890e-a823722b4c35"
# → AccessCheckResult: Granted ✓

Test-ApplicationAccessPolicy -Identity "artur.twardowski@b2bnetwork.pl" -AppId "17f9ff8c-ac4e-414d-890e-a823722b4c35"
# → AccessCheckResult: Denied ✓ (próby wysyłki jako artur kończą się 403 z Graph API)

# Cleanup po sesji:
Disconnect-ExchangeOnline -Confirm:$false
```

Po sesji: usuń `/opt/pwsh/pwsh` jeśli nie chcesz mieć powershella na serwerze produkcyjnym (instalacja zajmuje 200 MB).

## 4. Microsoft 365 — skrzynka noreply@b2bnetwork.pl — DONE 2026-05-11

Shared mailbox utworzony via Exchange Online PowerShell (jednocześnie z Application Access Policy w sekcji 3 — ten sam tmux session z `Connect-ExchangeOnline`):

```powershell
New-Mailbox -Shared -Name "ComPass System" -DisplayName "ComPass System" -Alias noreply -PrimarySmtpAddress noreply@b2bnetwork.pl
# → utworzono w EU region (eurprd07.prod.outlook.com), wolne 50 GB, bez licencji
```

Alternatywnie via UI (jeśli pwsh niedostępny):
- Microsoft 365 Admin Center → Teams & groups → Shared mailboxes → **+ Add shared mailbox**
- Name: "ComPass System", Email: `noreply@b2bnetwork.pl`
- Bez user ani license (shared mailbox jest free)

> Shared mailbox > regular user mailbox: nie zajmuje licencji, każdy admin może audytować Sent items.

## 5. Coolify — env vars

Po dodaniu permission w Azure i utworzeniu skrzynki, dodaj do Coolify env vault dla compass app:

```
AZURE_TENANT_ID=<from Azure App Registration → Overview → Directory (tenant) ID>
AZURE_CLIENT_ID=<from Azure App Registration → Overview → Application (client) ID>
AZURE_CLIENT_SECRET=<from punkt 2 — Value, nie Secret ID>
MAIL_FROM=ComPass System <noreply@b2bnetwork.pl>
MAIL_PROVIDER=graph
```

Wszystkie to **runtime** (`is_runtime: true`), żaden NIE jest buildtime.

Po zapisie Coolify zrestartuje container automatycznie.

## 6. Smoke test — DONE 2026-05-11

```bash
# 1. Sprawdź że provider jest aktywny w runtime
curl -fsSL https://compass.dynaminds.pl/api/health
# → { "status": "healthy", "version": "<sha>", ... }

# 2. Trigger reminder cron żeby wysłał Graph (Cloudflare Bot Fight Mode blokuje curl z laptopa,
# więc trzeba via SSH do kontenera)
ssh root@178.104.220.48 "
  APP=\$(docker ps --format '{{.Names}}' | grep '^app-w136' | head -1)
  CRON_SECRET=\$(docker exec \$APP printenv CRON_SECRET)
  curl -sf -H \"Authorization: Bearer \$CRON_SECRET\" \
    'http://localhost:10000/api/cron/timesheet-reminder?phase=mon-nudge&year=2026&month=5'
"
# → 2026-05-11 result: {"ok":true,"phase":"mon-nudge","year":2026,"month":5,
#   "total_employees":7,"already_submitted":0,"reminders_sent":7,"reminders_failed":0}
```

**Smoke test PASSED 2026-05-11.** 7 emaili wysłane przez Microsoft Graph z `noreply@b2bnetwork.pl`, 0 failed. Application Access Policy enforces że ŻADNA inna skrzynka nie może być użyta jako sender (nawet jeśli ktoś zhakuje secret).

## 7. Rollback

Jeśli Graph nie działa (Azure misconfig, permission scope problem, etc.) — natychmiast wróć do Resend:

```
# W Coolify env vars:
MAIL_PROVIDER=resend
```

Container restart automatyczny → fallback do Resend (potrzebny aktualny `RESEND_API_KEY`).

## Architektura

```
Compass server action
  → lib/email.ts (14 templates)
    → lib/email/sender.ts (sendEmail)
      → resolveProvider():
          MAIL_PROVIDER=graph → sendViaGraph (Microsoft Graph API)
          MAIL_PROVIDER=resend → sendViaResend (Resend SDK)
          undefined + Azure creds set → graph
          undefined + brak creds → resend (default fallback)
```

## Effort summary

| Krok | Czas | Kto |
|---|---|---|
| 1. Azure App permission Mail.Send + admin consent | 5 min | Admin tenant |
| 2. Client secret (jeśli nowy) | 2 min | Admin |
| 3. PowerShell Application Access Policy | 15 min (z install module) | Admin |
| 4. Shared mailbox noreply@b2bnetwork.pl (jeśli nie ma) | 5 min | Admin |
| 5. Coolify env vars | 2 min | DevOps |
| 6. Smoke test | 5 min | DevOps |
| **Razem** | **~35 min** | - |

Jeden raz robione. Potem zero maintenance — secret expires za 24m, PRZYPOMNIENIE w kalendarzu.

## Zalety vs Resend

- **Brak vendor lock-in dla emaila** — wszystko w Azure infra
- **Audit trail** — Sent items w shared mailbox (jeśli `saveToSentItems: true` — domyślnie wyłączone żeby nie zaśmiecać)
- **Domain auth** — `b2bnetwork.pl` własna, lepszy deliverability niż subdomena `compass.b2bnetwork.pl`
- **Spójność tożsamości** — ten sam Azure App już używany do SSO
- **Brak comiesięcznego rachunku za email** (Resend free do 3000/mo, ale rozwija się)

## Wady

- **Setup jednorazowo trudniejszy** (PowerShell, App Policy)
- **Limit Graph API: 10,000 emails/dzień** per app (Resend free 3000/mo) — w naszej skali bez znaczenia
- **Token TTL** = 1h, msal-node SDK refreshuje automatycznie — zero kodu po naszej stronie

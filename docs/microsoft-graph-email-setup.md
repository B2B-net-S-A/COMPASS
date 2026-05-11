# Microsoft Graph email — Azure setup (Artur action items)

Po merge PR-E `lib/email/sender.ts` ma adapter Microsoft Graph który czeka na credentials. Bez nich kod fallbackuje do Resend (jeśli RESEND_API_KEY działa) — czyli zero downtime.

Żeby aktywować Graph trzeba 4 rzeczy zrobić w Azure Portal i 4 env vars w Coolify.

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

## 3. PowerShell — Application Access Policy (ograniczenie do jednej skrzynki)

To jest KLUCZOWE dla bezpieczeństwa. Bez tego Compass app może wysyłać jako CEO jak zechce — kompromitacja secret = wszystkie maile w firmie.

Trzeba zainstalować Exchange Online PowerShell module (jednorazowo na komputerze admina):

```powershell
Install-Module -Name ExchangeOnlineManagement -Scope CurrentUser
Connect-ExchangeOnline -UserPrincipalName artur@b2bnetwork.pl
```

Następnie zdefiniuj policy ograniczającą Compass app do JEDNEJ skrzynki `noreply@b2bnetwork.pl`:

```powershell
# 1. Stwórz mail-enabled security group z jedną skrzynką (Exchange wymaga grupy, nie pojedynczego user)
New-DistributionGroup -Name "CompassMailSenders" -Type "Security" -Members "noreply@b2bnetwork.pl" -PrimarySmtpAddress "compass-senders@b2bnetwork.pl"

# 2. Zarejestruj Application Access Policy
New-ApplicationAccessPolicy `
  -AppId "<AZURE_CLIENT_ID>" `
  -PolicyScopeGroupId "compass-senders@b2bnetwork.pl" `
  -AccessRight RestrictAccess `
  -Description "Compass app can only send mail as noreply@b2bnetwork.pl"

# 3. Test
Test-ApplicationAccessPolicy -Identity "noreply@b2bnetwork.pl" -AppId "<AZURE_CLIENT_ID>"
# AccessCheckResult powinno być "Granted"

Test-ApplicationAccessPolicy -Identity "artur@b2bnetwork.pl" -AppId "<AZURE_CLIENT_ID>"
# AccessCheckResult powinno być "Denied"
```

## 4. Microsoft 365 — skrzynka noreply@b2bnetwork.pl

Sprawdź czy istnieje skrzynka `noreply@b2bnetwork.pl`:

- Microsoft 365 Admin Center → Users → Active users → search "noreply"
- Jeśli nie ma → **Shared mailbox** (free w Microsoft 365 Business plan, max 50 GB):
  - Admin Center → Teams & groups → Shared mailboxes → **+ Add shared mailbox**
  - Name: "Compass System", Email: `noreply@b2bnetwork.pl`
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

## 6. Smoke test

```bash
# 1. Sprawdź że provider jest aktywny w runtime
curl https://compass.dynaminds.pl/api/health
# (nie pokazuje providera explicite — sprawdź następnym smokem)

# 2. Trigger reminder cron żeby wysłał Graph
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://compass.dynaminds.pl/api/cron/timesheet-reminder?phase=mon-nudge&year=2026&month=5"
# expect: { reminders_sent: N, reminders_failed: 0 }

# 3. Sprawdź logi container
ssh root@178.104.220.48 \
  "docker logs app-w136dv828ofipvjfnxrqi643-<latest> --since 1m 2>&1 | grep email"
# expect: brak '[email/graph] send failed'; success → no log
```

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

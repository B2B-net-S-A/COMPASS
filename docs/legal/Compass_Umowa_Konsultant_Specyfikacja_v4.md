


COMPASS: UMOWA – KONSULTANT
Kompletna specyfikacja techniczna v4.0
Dokument zunifikowany dla developera

27 lutego 2026
Wersja 4.0 | Governance Layer Edition


# 1. Wprowadzenie i kontekst projektu


## 1.1. Cel modułu

Moduł "Compass: Umowa – Konsultant" wspomaga kompleksne zarządzanie umowami między B2B.net (Centrala) a konsultantami niezależnymi. Moduł obejmuje:
- Tworzenie i edycję umów z szablonów kategoryzowanych
- Negocjacje klauzul między stronami (draft → negotiation → finalized)
- Elektroniczne podpisanie umowy (e-podpis) przez obie strony
- Czytelny język dla konsultantów (Plain Language & FAQ)
- Automatyczne przypomnienia i monitoring SLA
- Podgląd zmian (diff) między wersjami
- Warunkowe klauzule (conditional clauses)
- Scoring ryzyka (risk assessment)
- Workflow zatwierdzenia (approval flow) dla umów wysokiego ryzyka
- Integracje webhooks z systemami zewnętrznymi
- [v4.0] Pełna oś zdarzeń umowy (Contract Event Timeline)
- [v4.0] Kontrola nadużyć i limitów operacyjnych (Abuse Prevention)
- [v4.0] Ślad prawny zgód RODO z wersjonowaniem (Consent Management)
- Audyt pełnej ścieżki zmian

## 1.2. Zakres dokumentu

Dokument obejmuje:
- Model danych: 13 tabel Supabase z RLS
- Backend API: endpoints do edycji, e-podpisu, reminders, approvals, webhooks
- Frontend: widoki dla Konsultanta, Centrali, Przeglądarki (Viewer)
- Integracje e-podpisu: Autenti, DocuSign, AdobeSign, Internal
- AI endpoints: sugestie prostego języka, interpretacje klauzul
- Testy: RLS (100%), Unit (80%+), E2E (ścieżki krytyczne)
- Timeline: 10-12 tygodni wdrożenia

## 1.3. Słownik pojęć


| Termin | Definicja |
| --- | --- |
| Draft | Umowa w przygotowaniu, edytowalna przez Konsultanta |
| Negotiation | Umowa wysłana do Centrali na przegląd i zmianę |
| Finalized | Umowa gotowa do wysłania na podpis (zmrożona, bez edycji) |
| Sent for Signature | Umowa wysłana do podpisu elektronicznego |
| Signed | Umowa podpisana elektronicznie, zarchiwizowana |
| E-podpis | Podpis elektroniczny (elektroniczne podpisanie dokumentu) |
| SLA | Service Level Agreement (umowa o poziomie usług, czas odpowiedzi) |
| Diff | Widok zmian między wersją oryginalną a zmienioną |
| Approval Flow | Proces zatwierdzenia umowy (legal, director) |
| Webhook | Integracja event-driven do systemu zewnętrznego |
| Conditional Clause | Klauzula wyświetlana warunkowo zależnie od wartości |
| Risk Scoring | Ocena ryzyka umowy na podstawie klauzul |
| Reminder | Automatyczne przypomnienie o działaniach wymaganych |
| Plain Language | Uproszczone, czytelne objaśnienie skomplikowanej klauzuli |


# 2. Repozytorium i setup projektu


## 2.1. GitHub Repository

Repozytorium: https://github.com/b2b-net/compass-umowa-konsultant
Gałąź główna: main (protected)
Gałęzie feature: feature/*, fix/*, docs/*

## 2.2. Bootstrap

git clone https://github.com/b2b-net/compass-umowa-konsultant.git
cd compass-umowa-konsultant
nvm use
npm install
cp .env.example .env.local

## 2.3. Hard Rules for Integration

- Wszystkie endpoints muszą być chronione JWT (Supabase Auth)
- RLS musi być włączony na wszystkich tabelach (z wyjątkami dla admin)
- Hasła do baz danych nigdy w kodzie (tylko env vars)
- Migracjami Supabase zarządzamy w ./migrations/ z numeracją sekwencyjną
- TypeScript obowiązkowy (no .js w src/)
- E-signatury nigdy nie mogą być generowane przez AI lub zmieniane poza dedykowanym flow

## 2.4. Tooling & Configuration


| Narzędzie | Plik | Opis |
| --- | --- | --- |
| Node.js version | .nvmrc | v20.10.0 (lub wyżej) |
| Environment | .env.example | Zmienne: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SIGNATURE_PROVIDER, SIGNATURE_API_KEY, SIGNATURE_API_SECRET, WEBHOOK_SECRET |
| Git hooks | husky | Pre-commit linting, Prettier formatting |
| Lint-staged | .lintstagedrc | ESLint + Prettier na staged files |
| TypeScript | tsconfig.json | strictMode: true, target: ES2020 |
| Prettier | .prettierrc | printWidth: 100, semi: true, singleQuote: true |
| ESLint | .eslintrc.json | next/core-web-vitals + recommended rules |


# 3. Supabase – izolacja backendu


## 3.1. DEV & PROD Separation

Maintain separate Supabase projects:
- compass-umowa-konsultant-dev: Development environment, reset daily
- compass-umowa-konsultant-prod: Production, backups every 4 hours
- Each has own JWT secret, RLS policies, and storage buckets

## 3.2. Migration Plan DEV → PROD

Migrations are tracked in git.


| Faza | Opis |
| --- | --- |
| Pre-migration | Backup PROD, test w DEV, peer review SQL |
| Schedule | Out-of-hours, documented rollback plan |
| Run | Execute via Supabase CLI: supabase migration up |
| Verify | Smoke tests, data integrity checks, query performance |
| Post-migration | Update docs, monitor logs for 24h |


## 3.3. User ID Mapping

Supabase Auth user ID → user_profiles.id (PK)
On sign-up, trigger creates user_profile record (via trigger).


| Kolumna | Typ | Opis |
| --- | --- | --- |
| auth.users.id | UUID | Unique ID from Supabase Auth |
| user_profiles.id | UUID | FK to auth.users.id |
| user_profiles.email | TEXT | Email (indexed) |
| user_profiles.role | ENUM | consultant|centrala|viewer|admin |


# 4. Model danych – kompletny schemat

Wszystkie tabele zawierają created_at, updated_at, created_by, updated_by timestamps (audytowane przez trigger na audit_log).

## 4.1. contract_categories


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Unique ID |
| name | TEXT NOT NULL | Nazwa kategorii (np. "Konsultant IT") |
| slug | TEXT UNIQUE NOT NULL | URL-friendly slug |
| description | TEXT | Long description |
| is_active | BOOLEAN DEFAULT true | Archiwizacja soft |
| created_at | TIMESTAMPTZ | Created timestamp |


## 4.2. contract_templates


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Unique ID |
| category_id | UUID FK | FK to contract_categories |
| name | TEXT NOT NULL | Template name |
| version | INT DEFAULT 1 | Version number |
| locale | TEXT DEFAULT "pl_PL" | Language (pl_PL, en_US) |
| is_active | BOOLEAN DEFAULT true | Active/archived |
| created_at | TIMESTAMPTZ | Created timestamp |


## 4.3. template_clauses (v2.0 + NEW)


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Unique ID |
| template_id | UUID FK | FK to contract_templates |
| order | INT | Display order |
| title | TEXT NOT NULL | Clause title |
| body | TEXT NOT NULL | Formal clause text |
| interpretation_simple | TEXT [NEW] | Plain language version |
| faq | JSONB [NEW] | FAQ array: [{q, a}] |
| examples | JSONB [NEW] | Examples array: [{title, desc}] |
| visibility_rules | JSONB [NEW] | Conditional logic: {field, operator, value} |
| is_required | BOOLEAN DEFAULT true | Must be included |
| requires_approval | BOOLEAN DEFAULT false | Needs approval if modified |
| risk_level | ENUM: low|medium|high | Risk classification |
| created_at | TIMESTAMPTZ | Created timestamp |


## 4.4. contracts (v2.0 + NEW)


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Unique ID |
| template_id | UUID FK | FK to contract_templates |
| category_id | UUID FK | FK to contract_categories |
| consultant_user_id | UUID FK | Consultant who started contract |
| status | ENUM | draft|negotiation|finalized|sent_for_signature|signed|signature_failed|expired |
| last_activity_at | TIMESTAMPTZ [NEW] | Last edit/action timestamp |
| sla_consultant_days | INT DEFAULT 3 [NEW] | SLA for consultant response |
| sla_centrala_days | INT DEFAULT 2 [NEW] | SLA for centrala response |
| final_snapshot | JSONB [NEW] | Frozen contract state at finalization |
| final_snapshot_sha256 | TEXT [NEW] | SHA256 hash of final state |
| created_at | TIMESTAMPTZ | Created timestamp |


## 4.5. contract_clauses (v2.0 + NEW)


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Unique ID |
| contract_id | UUID FK | FK to contracts |
| template_clause_id | UUID FK | FK to template_clauses |
| custom_body | TEXT | Negotiated clause text (NULL = use template) |
| risk_delta | INT DEFAULT 0 [NEW] | Change in risk score from template |
| risk_notes | TEXT [NEW] | Notes on risk assessment |
| version | INT DEFAULT 1 | Version counter |
| created_at | TIMESTAMPTZ | Created timestamp |


## 4.6. clause_comments


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Unique ID |
| contract_clause_id | UUID FK | FK to contract_clauses |
| user_id | UUID FK | Comment author |
| body | TEXT NOT NULL | Comment text |
| is_resolved | BOOLEAN DEFAULT false | Resolved status |
| created_at | TIMESTAMPTZ | Created timestamp |


## 4.7. user_profiles


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | FK to auth.users.id |
| email | TEXT UNIQUE NOT NULL | Email |
| full_name | TEXT | Full name |
| role | ENUM | consultant|centrala|viewer|admin |
| avatar_url | TEXT | Avatar image URL |
| created_at | TIMESTAMPTZ | Created timestamp |


## 4.8. audit_log


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Unique ID |
| table_name | TEXT NOT NULL | Table modified |
| record_id | UUID NOT NULL | Record ID |
| action | ENUM | INSERT|UPDATE|DELETE |
| old_data | JSONB | Previous state |
| new_data | JSONB | New state |
| user_id | UUID FK | User who made change |
| timestamp | TIMESTAMPTZ | When change occurred |


## 4.9. 


**[v2.1] contract_signatures (NEW table)**


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Unique ID |
| contract_id | UUID FK | FK to contracts |
| provider | TEXT NOT NULL | autenti|docusign|adobesign|internal |
| provider_envelope_id | TEXT | Envelope ID from provider |
| status | ENUM | created|sent|viewed|signed|declined|expired|error |
| signer_consultant_email | TEXT | Consultant signer email |
| signer_centrala_email | TEXT NULL | Centrala signer email (optional) |
| signed_at | TIMESTAMPTZ | When signed |
| signed_pdf_storage_path | TEXT | Path in Supabase storage |
| signed_pdf_sha256 | TEXT | SHA256 hash of PDF |
| evidence | JSONB | Signature evidence (timestamps, IPs, etc.) |
| created_at | TIMESTAMPTZ | Created timestamp |
| created_by | UUID FK | User who initiated |


## 4.10. 


**[v2.1] contract_reminders (NEW table)**


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Unique ID |
| contract_id | UUID FK | FK to contracts |
| target_role | TEXT | consultant|centrala |
| channel | TEXT | email|in_app |
| type | TEXT | no_response|signature_pending|approval_pending |
| next_run_at | TIMESTAMPTZ | When to send next reminder |
| last_run_at | TIMESTAMPTZ | When last sent |
| run_count | INT DEFAULT 0 | Number of times sent |
| is_active | BOOLEAN DEFAULT true | Mute individual reminder |
| created_at | TIMESTAMPTZ | Created timestamp |


## 4.11. 


**[v2.1] contract_approvals (NEW table)**


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Unique ID |
| contract_id | UUID FK | FK to contracts |
| contract_clause_id | UUID FK NULL | Specific clause or null for whole contract |
| required_role | TEXT | legal|director (approver role) |
| status | ENUM | pending|approved|rejected |
| decision_note | TEXT | Approver note |
| decided_at | TIMESTAMPTZ | When approved/rejected |
| decided_by | UUID FK | Approver user ID |
| created_at | TIMESTAMPTZ | Created timestamp |


## 4.12. 


**[v2.1] contract_webhooks (NEW table)**


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Unique ID |
| event | TEXT NOT NULL | contract.finalized|contract.signed|... |
| target_url | TEXT NOT NULL | HTTP endpoint to call |
| secret | TEXT NOT NULL | HMAC signing secret |
| is_active | BOOLEAN DEFAULT true | Enable/disable webhook |
| created_at | TIMESTAMPTZ | Created timestamp |


## 4.13. Indeksy i constrainty


| Tabela | Index/Constraint | Typ |
| --- | --- | --- |
| contracts | consultant_user_id, status | B-tree (queries by role + status) |
| contracts | last_activity_at | B-tree (SLA calculations) |
| contract_clauses | contract_id | B-tree (clause grouping) |
| contract_signatures | contract_id, provider | B-tree (status checks) |
| contract_reminders | contract_id, next_run_at | B-tree (cron scheduling) |
| audit_log | table_name, record_id, timestamp | B-tree (audit queries) |
| contracts | CHECK (status IN ...) | Constraint (only valid states) |


# 5. Role, uprawnienia i RLS


## 5.1. Role & Permissions Matrix


| Akcja | Consultant | Centrala | Admin | Viewer |
| --- | --- | --- | --- | --- |
| Przeglądaj swoje umowy | TAK | TAK | TAK | Tylko podpisane |
| Edytuj draft/negotiation | Swoje | TAK (all) | TAK (all) | NIE |
| Wysłanie do podpisu | NIE | TAK | TAK | NIE |
| Podpisanie umowy | TAK (swoje) | NIE | TAK | NIE |
| Zatwierdzenie (approval) | NIE | TAK (assigned) | TAK | NIE |
| Zarządzanie webhooks | NIE | NIE | TAK | NIE |
| Przeglądanie auditu | Częściowo | TAK | TAK | NIE |
| Eksport PDF | TAK (swoje) | TAK | TAK | TAK (signed) |


## 5.2. RLS (Row Level Security)

Wszystkie tabele mają RLS enabled. Polityki:

### 5.2.1 Consultant Role

- contracts: SELECT own (WHERE consultant_user_id = auth.uid())
- contract_clauses: SELECT own contracts + UPDATE only if status IN (draft, negotiation)
- contract_signatures: CREATE own, CANNOT UPDATE or DELETE signed
- Post-signature lockdown: status = "signed" → ALL read-only except admin internal notes

### 5.2.2 Centrala Role

- contracts: SELECT all, UPDATE all, DELETE not permitted
- contract_clauses: UPDATE all (negotiation), CANNOT after signed
- contract_signatures: CREATE + SEND, CANNOT sign for consultant
- contract_approvals: CREATE, UPDATE own assignments
- contract_reminders: CREATE + UPDATE

### 5.2.3 Admin Role

- All tables: FULL access (SELECT, INSERT, UPDATE, DELETE)
- Bypass RLS: Use service_role key
- Internal notes: Admin-only fields in audit_log, contract comments

### 5.2.4 Viewer Role

- contracts: SELECT WHERE status = "signed"
- Read-only: No UPDATE, INSERT, DELETE
- Restricted to: title, status, date_signed, signer names

## 5.3. Magic Link Security (Enhanced)

Magic links for contract viewers:
- Token: JWT with 7-day expiration
- Max 3 regenerations per day per contract
- One-time link expires after first access (or 7 days)
- IP whitelisting optional (if configured)


# 6. Struktura projektu


## 6.1. Root File Tree

compass-umowa-konsultant/
├── .github/workflows/
│   ├── test.yml
│   └── deploy.yml
├── migrations/
│   ├── 001_init_schema.sql
│   ├── 002_add_rls_policies.sql
│   ├── 003_add_new_v21_tables.sql
│   └── seed_data.sql
├── src/app/api/
│   ├── contracts/route.ts
│   ├── signatures/ [NEW v2.1]
│   │   ├── create/route.ts
│   │   ├── send/route.ts
│   │   ├── webhook/route.ts
│   │   └── cancel/route.ts
│   ├── reminders/cron/route.ts
│   ├── approvals/ [NEW v2.1]
│   ├── webhooks/dispatch/route.ts
│   └── ai/suggest_simple_language/route.ts
├── src/modules/contract/
│   ├── components/
│   │   ├── SignatureStatus.tsx
│   │   ├── DiffViewer.tsx
│   │   ├── RiskScorePanel.tsx
│   │   └── ...
│   └── lib/
│       ├── signature-service.ts
│       ├── diff-engine.ts
│       └── ...
├── tests/unit/
├── tests/rls/
├── tests/e2e/
├── .nvmrc
├── .env.example
├── package.json
└── README.md


# 7. AI – zasady, endpointy, guard-rails


## 7.1. AI Principles

- AI assists consultant understanding (never edits contract without human approval)
- AI suggests simple language interpretations (not legal advice)
- AI NEVER generates e-signatures or changes signature status
- AI NEVER modifies finalized contracts
- All AI outputs are logged in audit_log for transparency

## 7.2. AI Endpoints


### 7.2.1 POST /api/ai/suggest_simple_language [NEW v2.1]

Input:
{ "clause_id": "uuid", "clause_body": "string" }
Output:
{ "simple_language": "string", "confidence": 0.95 }

### 7.2.2 POST /api/ai/interpret

Input:
{ "clause_id": "uuid", "question": "string" }
Output:
{ "interpretation": "string", "related_clauses": ["..."] }

## 7.3. Guard-Rails

- Timeout: 10 second max for AI calls
- Token limit: 2000 input tokens max per request
- Rate limit: 10 AI calls per contract per day per user
- Validation: All outputs sanitized for injection (DOMPurify)
- Audit: Every AI call logged with user_id, contract_id, timestamp


# 8. 


**[v2.1] E-podpis: workflow i integracja**


## 8.1. Signature Workflow States


| Stan | Opis | Następny stan |
| --- | --- | --- |
| finalized | Umowa gotowa (zmrożona) | sent_for_signature |
| sent_for_signature | Wysłana do podpisu | signed | signature_failed | expired |
| signed | Podpisana, zarchiwizowana | (final, no changes) |
| signature_failed | Błąd podpisu | retry → sent_for_signature |
| expired | Link do podpisu wygasł | resend → sent_for_signature |


## 8.2. Provider Abstraction

Interface SignatureProvider:
interface SignatureProvider {
  createEnvelope(contract: Contract): Promise<{ envelope_id: string }>
  sendForSignature(envelope_id: string, emails: string[]): Promise<{ status: string }>
  cancelSignature(envelope_id: string): Promise<void>
  handleWebhook(body: any, signature: string): Promise<{ status: string }>
  getStatus(envelope_id: string): Promise<{ status: string, signed_at?: Date }>
}

## 8.3. Supported Providers


| Provider | Region | Status | Notes |
| --- | --- | --- | --- |
| Autenti | PL/EU | Recommended | USEF-compliant, fast |
| DocuSign | Global | Supported | High enterprise adoption |
| AdobeSign | Global | Supported | Legacy support |
| Internal | N/A | Fallback | Simple click-to-sign (no PKI) |


## 8.4. API Endpoints


### 8.4.1 POST /api/signatures/create

Request:
{
  "contract_id": "uuid",
  "provider": "autenti",
  "signer_consultant_email": "konsultant@example.com",
  "signer_centrala_email": "centrala@b2b.net"
}

### 8.4.2 POST /api/signatures/send

Request:
{ "signature_id": "uuid" }

### 8.4.3 POST /api/signatures/webhook

Webhook callback from provider (Autenti, DocuSign, etc.)

### 8.4.4 POST /api/signatures/cancel

Request:
{ "signature_id": "uuid" }
Cancels pending signature, resets contract to finalized state

## 8.5. PDF Generation Before Signature

Before sending for signature:
- Generate final PDF with all clauses in current language (PL)
- Include consultant name, email, company
- Include centrala name, email, company
- Add legal footer with contract ID
- Include timestamp
- Calculate SHA256 hash of PDF binary

## 8.6. Post-Signature Lockdown

When contract.status = "signed":
- RLS: ALL users (except admin) can SELECT but NOT UPDATE
- UI: Hide all edit buttons, show "Signed on [date]" badge
- API: POST/PATCH endpoints return 403 (Forbidden) for non-admin
- Audit: Every access logged in audit_log


# 9. 


**[v2.1] Prosty język i edukacja konsultanta**


## 9.1. Toggle: Formalnie | Prosto

In ClauseView component, two-button toggle:
- Button 1: "Formalnie" → Shows formal clause body (default)
- Button 2: "Prosto" → Shows interpretation_simple (if available)
- If NULL, button is disabled or AI-generates on-demand
- User preference persisted in localStorage

## 9.2. FAQ Panel per Clause

If template_clause.faq is populated:
- Collapsible FAQ section below clause
- Each FAQ item: {q: string, a: string}
- Format as accordion (expand/collapse)
- Searchable within FAQ

## 9.3. Examples: "Jak to działa w praktyce"

If template_clause.examples is populated:
- New tab "Przykłady" in clause view
- Each example: {title: string, desc: string}
- Show 2-3 realistic scenarios
- Editable by admin/legal only

## 9.4. AI Endpoint: suggest_simple_language [NEW]

Triggered by:
- User clicks "Prosto" but no interpretation_simple exists
- AI generates plain language version on-demand
- Result cached in template_clause.interpretation_simple
- Requires admin approval before persisting

## 9.5. Auto-Display for High-Risk Clauses

If template_clause.risk_level = "high":
- By default, show both Formal + Prosto side-by-side
- Add warning banner: "Klauzula wysokiego ryzyka. Przeczytaj uważnie."
- User cannot collapse interpretation_simple


# 10. 


**[v2.1] Reminders, SLA i nudging**


## 10.1. SLA Configuration per Contract


| Pole | Default | Opis |
| --- | --- | --- |
| sla_consultant_days | 3 | Days for consultant to respond to Centrala request |
| sla_centrala_days | 2 | Days for Centrala to respond to consultant suggestion |
| Trigger | Status change | SLA clock starts on draft→negotiation or edit |


## 10.2. Reminder Types & Escalation


| Typ | Kanał | Trigger | Max per stage |
| --- | --- | --- | --- |
| no_response | email + in_app | After SLA expires | 3 |
| signature_pending | email + in_app | status = sent_for_signature > 3 days | 3 |
| approval_pending | in_app | approval.status = pending > 1 day | 2 |

Escalation: 1st day 1 → 2nd day 3 → 3rd day 5

## 10.3. Cron Job: Every 1 Hour

Scheduled job (e.g., AWS Lambda, Vercel cron):
- Query contract_reminders WHERE next_run_at <= NOW AND is_active = true
- For each matching reminder: Check SLA, generate notification, update timestamps

## 10.4. Centrala Dashboard: "Umowy wymagające reakcji"

New dashboard view showing:
- Contracts in negotiation with SLA exceeded
- Contracts awaiting signature > 3 days
- Contracts with pending approvals > 1 day
- Sortable by urgency, contract ID, consultant name

## 10.5. Consultant Badge: "Czeka na Ciebie"

On Consultant dashboard:
- Red badge showing count of contracts awaiting action
- Tooltip: "Twoja odpowiedź oczekiwana na X umów"
- Click to filter view to "awaiting my response"


# 11. 


**[v2.1] Diff view i kontrola zmian**


## 11.1. Inline Diff: Original vs Modified

DiffViewer component shows:
- Left side (green background): Original clause text
- Right side (red background): Modified clause text
- Highlighted sections with word-level diffs
- Word additions: green highlight
- Word deletions: red highlight with strikethrough

## 11.2. Version History Diff

For each contract_clauses.version:
- Fetch from audit_log all edits
- Generate diff between consecutive versions
- Timeline view showing versions over time

## 11.3. Final Snapshot at Finalization

When contract.status changes to "finalized":
- Capture contracts table + all contract_clauses current state
- Store in contracts.final_snapshot (JSONB)
- Calculate SHA256 hash of JSON dump
- Never update final_snapshot (immutable)

## 11.4. UI: "Pokaż zmiany" Button

In ClauseView:
- Button "Pokaż zmiany" appears if contract.status in (negotiation, finalized, ...)
- On click: Show diff vs contract.final_snapshot
- Visual: Red/green highlighting, side-by-side layout


# 12. 


**[v2.1] Approval flow**

(SHOULD HAVE / MUST for banks)

## 12.1. When Triggered

Approval is required when:
- template_clause.requires_approval = true AND custom_body is changed
- OR contract.risk_level = high AND any content changed
- OR contract value > threshold (configurable per category)

## 12.2. Blocks sent_for_signature

Contract CANNOT transition to sent_for_signature until:
- All required contract_approvals have status = "approved"
- API guard: POST /api/signatures/send validates approvals first
- UI: Button "Wyślij do podpisu" disabled until approvals green

## 12.3. UI: Approval Request Panel

In Centrala view when approvals pending:
- Panel: "Wymagane zatwierdzenia"
- Table: Approver role | Required for | Status | Decision note
- For each pending: input field for notes, "Zatwierdź" / "Odrzuć" buttons

## 12.4. Notifications to Approvers

When approval required:
- In-app notification: "Nowa umowa czeka na Twoje zatwierdzenie"
- Email: Link to contract approval panel
- Reminder: Daily until approved/rejected


# 13. 


**[v2.1] Klauzule warunkowe**

(SHOULD HAVE)

## 13.1. visibility_rules JSON Schema

{
  "rules": [
    {
      "field": "consultant_type",
      "operator": "equals|contains|greater_than|in",
      "value": "payout_provider"
    }
  ],
  "logic": "AND"
}

## 13.2. Rule Engine (Pure Function)

Function isClauseVisible(clause, contractData): boolean
- Input: template_clause.visibility_rules + current contract_clauses data
- Evaluate rules against contract values
- Return true/false based on logic (AND/OR)
- Zero dependencies (testable, cacheable)

## 13.3. UI Indicator

If clause is conditional:
- Small icon next to clause title: "Klauzula włączona warunkowo"
- Tooltip shows conditions in plain Polish
- If clause is hidden due to conditions: Grayed out or hidden entirely

## 13.4. Examples


| Scenario | Condition | Clause |
| --- | --- | --- |
| VAT payer | consultant_type = "company" | Show VAT invoice clause |
| Bank-specific | category_slug = "banking" | Show regulatory compliance clause |
| High-value | contract_value > 100k PLN | Show escrow / insurance clause |


# 14. 


**[v2.1] Risk scoring i panel zarządczy**

(SHOULD HAVE)

## 14.1. risk_delta per Clause Change

When editing a clause:
- contract_clauses.risk_delta = change in risk from template
- Example: Template has risk_level="medium" (score 5), edit makes it "high" (score 8) → risk_delta = +3

## 14.2. Contract Risk Score

Total contract risk = sum of all clause risk_deltas + base template risk
- Base score: sum of all template_clause.risk_level (low=1, medium=5, high=10)
- Modified score: base + sum of risk_delta from contract_clauses
- Threshold: >50 → auto-flag for approval

## 14.3. Centrala Risk Dashboard

New dashboard widget:

| Metric | Opis |
| --- | --- |
| Top 3 risk clauses | By risk_level and risk_delta changes |
| Time to finalization (KPI) | Avg days draft → finalized (target: <7) |
| Iteration count per clause | How many edits before finalized |
| % contracts with approval | Compliance metric |
| SLA compliance rate | % contracts signed within SLA |


# 15. 


**[v2.1] Webhooks i integracje**

(SHOULD HAVE)

## 15.1. Events


| Event | Trigger | Payload |
| --- | --- | --- |
| contract.finalized | status changes to finalized | contract_id, consultant_id, finalized_at |
| contract.sent_for_signature | sent for e-signature | contract_id, provider, envelope_id |
| contract.signed | signature complete | contract_id, signed_at, signed_pdf_url |
| contract.approval_required | approval request created | contract_id, approver_role |


## 15.2. Webhook Dispatch with HMAC Signature

POST to contract_webhooks.target_url:
POST https://erp.company.com/compass-webhook
Content-Type: application/json
X-Compass-Signature: sha256=<HMAC-SHA256(body, secret)>

{
  "event": "contract.signed",
  "contract_id": "uuid",
  "timestamp": "2026-02-27T12:00:00Z",
  "data": { ... }
}

## 15.3. Use Cases

- ERP sync: Create contract record in finance system
- CRM sync: Update contractor profile with contract status
- Contractor creation: Auto-provision contractor account post-signature
- Notification: Send to external communication platform

## 15.4. Retry Policy

Failed webhook (non-2xx response):
- Retry 1: After 1 minute
- Retry 2: After 5 minutes
- Retry 3: After 30 minutes
- After 3 failures: Log error, mark webhook.is_active = false, alert admin


# 16. UI/UX – widoki i flow


## 16.1. Consultant View

My Contracts list:
- Filter: All | Draft | Awaiting Centrala | Awaiting Signature | Signed
- Columns: Contract ID, Template, Status, Created, Last Activity, Actions

## 16.2. Centrala View

All Contracts Dashboard:
- Main list: All contracts, filterable by status, consultant, risk level
- Right sidebar: "Umowy wymagające reakcji" (SLA monitoring)
- KPI cards: Avg finalization time, SLA compliance %, approval pending count

## 16.3. Viewer Role (Read-Only)

Shared link to view contract (magic link):
- Display: Title, key contract dates, status, signer names
- PDF embed or download
- No edit capability, no comment capability
- Expires: 7 days (customizable)

## 16.4. Error Handling


| Error | Message | Action |
| --- | --- | --- |
| Signature provider timeout | Provider niedostępny. Spróbuj za chwilę. | Retry button |
| Approval timeout | Zatwierdzenie przeterminowane. | Escalate button |
| Webhook failure | Integracja z systemem zewnętrznym nieudana. | Retry, Admin alert |
| RLS violation | Brak dostępu do tego dokumentu. | Redirect to dashboard |
| Invalid state transition | Nie można zmienić statusu z [X] na [Y]. | Show current state |


## 16.5. Optimistic Locking (v2.0)

To prevent concurrent edits:
- Each contract_clauses record has version counter
- On update: PATCH /api/contracts/[id]/clauses/[clauseId] includes version
- Server checks: IF db.version != submitted.version THEN conflict
- Return 409 Conflict with latest data


# 17. Eksport PDF


## 17.1. Final PDF for Signature

Generated before sending for signature. Includes:
- Header: B2B.net logo, contract title, ID
- All clauses in current language (Polish)
- Consultant data: Full name, email, company
- Centrala data: B2B.net, Warszawa
- Footer: Legal text, timestamp, contract ID, page numbers
- Signature block: _______________ (consultant) vs _______________ (centrala)

## 17.2. User Download

Consultant can download:
- Pre-signature: Current draft/negotiation as PDF (watermarked "DRAFT")
- Post-signature: Final signed PDF from storage bucket


# 18. Strategia testowania


## 18.1. Test Coverage Targets


| Typ | Cel | Tools |
| --- | --- | --- |
| Unit | 80%+ lines of code | Jest |
| RLS | 100% policies | Supabase CLI + custom |
| E2E | All critical paths | Playwright |
| Integration | API + Database | Jest + Supabase |


## 18.2. E2E Scenarios


| Scenariusz | Opis |
| --- | --- |
| Full signature flow | draft→finalized→sent_for_signature→signed (mock provider) |
| No edit after signed | Attempt PATCH after signed → 403 |
| Approvals block signature | Try send_for_signature without approval → 400 |
| Reminders trigger | SLA exceeded → reminder created + sent |
| Diff displays correctly | Modify clause → diff shows changes in red/green |
| Webhook dispatch | Contract signed → webhook POST to target URL |


## 18.3. RLS Tests


| Policy | Assertion |
| --- | --- |
| Consultant cannot create signatures | consultant_user_id != auth.uid() |
| Centrala cannot sign for consultant | Only consultant can sign own contract |
| No edits after signed | status="signed" → all UPDATE denied except admin |
| Viewer cannot edit | Viewer role → all write ops denied |


## 18.4. Unit Tests

- visibility-rules-engine: Test rule evaluation logic
- risk-calculator: Test risk score aggregation
- diff-engine: Test word-level diff generation
- approval-service: Test approval state transitions


# 19. Integracja z Compass


## 19.1. Compass Platform Integration

The "Compass: Umowa – Konsultant" module integrates into the larger B2B.net Compass platform

## 19.2. Data Exchange Points


| System | Data Flow | Frequency |
| --- | --- | --- |
| Consultant Dashboard | Push contract status updates | Real-time |
| Centrala Dashboard | Pull contract list + SLA info | Hourly + real-time |
| Audit System | Log all changes to central audit DB | Real-time |
| Finance System | POST webhook on contract.signed | Per-signature |
| Email Service | Queue reminders + notifications | Per trigger |


## 19.3. Auth & User Sync

Compass uses Supabase Auth for all modules:
- User roles (consultant, centrala, admin) managed centrally
- JWT tokens valid across all Compass modules
- user_profiles table synced with Compass user directory

## 19.4. Shared Styling & Branding

Use Compass design system:
- Colors: RED #E73748, DARK_GRAY #3A3A3A, FROST #AAB4BF, ASH #E1E1E1
- Logo: B2B.net (same across modules)
- Font: Calibri / system fonts


# 20. Plan wdrożenia v3.0


## 20.1. Timeline (10-12 tygodni)


| Tydzień | Etap | Deliverables |
| --- | --- | --- |
| 1-2 | Setup + Schema + RLS | GitHub repo, Supabase migrations, RLS policies, base types |
| 3-4 | Sprint 1: MVP Core | Contract CRUD, category templates, clause editor, views |
| 5-6 | Sprint 2: Value Features | AI interpret, PDF export, audit trail, plain language |
| 7-8 | Sprint 3: E-signature + Approval | E-sig provider integration, approval flow, diff viewer |
| 9 | Sprint 4: Reminders + Risk + Webhooks | SLA/reminder cron, risk scoring, webhook dispatch |
| 10 | Testing + Pilot | Unit 80%, RLS 100%, E2E critical paths |
| 11-12 | Integration + UAT + Deploy | Compass integration, UAT, production deploy |


## 20.2. Sprint Definition of Done (DoD)

Each sprint must complete:
- Code: Passed ESLint, Prettier, TypeScript strict mode
- Tests: Unit 80%+, E2E critical flows
- Docs: Updated inline comments, API endpoints documented
- Review: Peer review + approval from tech lead
- Demo: Working feature demo to stakeholders

## 20.3. Milestones


| Milestone | Data | Kryteria sukcesu |
| --- | --- | --- |
| MVP Core (v1.0) | Week 4 | Create/edit contracts, view by role, basic PDF |
| v2.0 Features | Week 6 | AI suggestions, audit, optimistic locking, plain language |
| v3.0 New Features | Week 9 | E-sig, approvals, diff, SLA, webhooks, risk scoring |
| Pilot | Week 10 | 2-3 consultants use live, no data loss, <1% bugs |
| Production | Week 12 | Full deployment, zero downtime, monitoring active |


# 21. MVP seed data


## 21.1. Sample Categories


| ID | Nazwa | Slug |
| --- | --- | --- |
| uuid-1 | Konsultant IT | consultant-it |
| uuid-2 | Konsultant Business | consultant-business |
| uuid-3 | Specjaliści IT | specialists-it |


## 21.2. Sample Template with Clauses

Template: "Standard IT Consultant Contract"
Clauses:
- 1. Scope of Work
- 2. Payment Terms (interpretation_simple: "How much & when you get paid")
- 3. Confidentiality (risk_level: high, faq: [...])
- 4. IP Rights (interpretation_simple, examples)
- 5. NDA (visibility_rules: {field: "company_type", operator: "equals", value: "tech"})

## 21.3. FAQ Examples

Clause: Confidentiality
"faq": [
  {
    "q": "Czy mogę mówić o projekcie znajomym?",
    "a": "Nie. Przedmiot pracy jest poufny."
  }
]


# 22. Walidacja danych


## 22.1. Input Validation Rules


| Pole | Reguła | Błąd |
| --- | --- | --- |
| contract.consultant_user_id | UUID format, must exist in user_profiles | 400: Invalid user |
| contract_clause.custom_body | Not empty, < 10000 chars | 400: Clause too long |
| contract.status | Must be one of enum values | 400: Invalid status |
| contract_reminders.next_run_at | Must be future timestamp | 400: Date in past |
| visibility_rules JSON | Valid JSON schema | 400: Invalid rules |


## 22.2. Business Logic Validation

- Cannot edit contract after status="signed"
- Cannot send for signature if approvals not all "approved"
- Cannot create signature if contract not "finalized"
- Cannot cancel signature if already signed
- SLA days must be > 0

## 22.3. XSS & SQL Injection Prevention

- All user inputs sanitized with DOMPurify before display
- Parameterized queries (Supabase client handles escaping)
- No raw SQL in application code (migrations only)
- Content-Security-Policy header enabled


# 23. Definition of Done v3.0


## 23.1. Consolidated Checklist

Contract must be able to flow through complete lifecycle:
- draft → negotiation → finalized → sent_for_signature → signed

Signature trail must be complete:
- Signed PDF stored + SHA256 hash verified
- Signer metadata (email, timestamp, IP) in evidence JSONB
- RLS enforced: read-only after signed

Consultant experience must be clear:
- Plain language toggle (Formalnie | Prosto)
- FAQ accessible for each clause
- High-risk clauses auto-show both versions

Operations must be monitored:
- Reminders sent on SLA breach (automated cron)
- "Umowy wymagające reakcji" dashboard for Centrala
- "Czeka na Ciebie" badge for Consultant

Changes must be visible:
- Diff view (original vs modified) in UI
- Version history with word-level diffs
- Audit log tracks all changes with old_data, new_data

Approvals must block signature:
- Cannot send for signature without all approvals = "approved"
- Approval notifications sent to approver role
- Approver can comment + approve/reject

Testing must be comprehensive:
- Unit tests: 80%+ lines of code
- RLS tests: 100% policy coverage
- E2E tests: All critical paths (signature, approval, SLA)
- No data loss in any failure scenario


# 24. Checklist gotowości


## 24.1. Pre-Launch Checklist


| Item | Owner | Status |
| --- | --- | --- |
| GitHub repo + branch protection | Tech Lead | O |
| Supabase projects (dev + prod) | DevOps | O |
| Migrations tested in dev | Backend Lead | O |
| RLS policies reviewed by security | Security Lead | O |
| E-signature provider accounts (Autenti) | Integration Lead | O |
| Email service configured (SendGrid/AWS SES) | DevOps | O |
| Webhook retry system deployed | Backend Lead | O |
| Cron job (reminders) scheduled | DevOps | O |
| Monitoring + alerting setup | DevOps | O |
| Pilot users identified (2-3 consultants) | Product Manager | O |
| User docs + onboarding video | Technical Writer | O |
| Deployment runbook | DevOps | O |
| Rollback plan | DevOps | O |


## 24.2. Go/No-Go Decision Criteria

MUST HAVE (all required):
- Zero data corruption in tests
- E2E signature flow works (end-to-end)
- All RLS policies enforced
- 80%+ unit test coverage
- Production monitoring active
- Rollback plan documented + tested

SHOULD HAVE (nice-to-have):
- AI plain language suggestions
- Advanced risk scoring
- Conditional clauses (full feature)
- Webhook retries with exponential backoff


# 25. [v4.0] Contract Event Timeline (Governance Layer)


## 25.1. Cel biznesowy

- Redukcja chaosu komunikacyjnego - zero sporów "kto co zmienił"
- Przejrzystość procesu (compliance + audyt) - pełna oś zdarzeń
- Skrócenie czasu finalizacji (UX) - 30-40% mniej maili wyjaśniających
- Narzędzie operacyjne dla Centrali - nie feature kosmetyczny

## 25.2. Nowa tabela: contract_events

Każde istotne działanie w systemie generuje event biznesowy. Różnica vs audit_log: audit_log jest techniczny (każdy UPDATE), contract_events są biznesowe (czytelne dla użytkownika).

| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK | Identyfikator zdarzenia |
| contract_id | UUID FK -> contracts | Umowa, której dotyczy |
| event_type | TEXT NOT NULL | Typ zdarzenia (patrz lista poniżej) |
| event_payload | JSONB DEFAULT '{}' | Szczegóły zdarzenia (np. zmienione pola, delta ryzyka) |
| user_id | UUID FK -> auth.users | Kto wywołał zdarzenie |
| visible_to | TEXT DEFAULT 'all' | consultant | centrala | admin | all |
| created_at | TIMESTAMPTZ DEFAULT now() | Timestamp zdarzenia |


## 25.3. Typy zdarzeń (event_type)


| event_type | Kategoria | Opis | visible_to |
| --- | --- | --- | --- |
| contract.created | Lifecycle | Umowa utworzona | all |
| contract.status_changed | Lifecycle | Zmiana statusu (np. draft -> negotiation) | all |
| clause.modified | Edycja | Klauzula zmodyfikowana przez Centralę | all |
| clause.risk_changed | Risk | Zmiana poziomu ryzyka klauzuli (+/- risk_delta) | centrala |
| comment.added | Negocjacje | Nowy komentarz do klauzuli | all |
| comment.replied | Negocjacje | Odpowiedź na komentarz | all |
| approval.requested | Approval | Zażądano akceptacji (legal/director) | centrala |
| approval.approved | Approval | Klauzula zaakceptowana | centrala |
| approval.rejected | Approval | Klauzula odrzucona | centrala |
| signature.created | E-podpis | Proces podpisu utworzony | all |
| signature.sent | E-podpis | Wysłano do podpisu | all |
| signature.viewed | E-podpis | Konsultant otworzył dokument | centrala |
| signature.signed | E-podpis | Umowa podpisana | all |
| signature.declined | E-podpis | Podpis odrzucony | all |
| reminder.sent | SLA | Przypomnienie wysłane | centrala |
| webhook.dispatched | Integracja | Webhook wysłany | admin |
| webhook.failed | Integracja | Webhook nie powiódł się | admin |
| consent.accepted | RODO | Zgoda RODO zaakceptowana | all |
| contract.escalated | Abuse | Umowa eskalowana (przekroczenie limitów) | centrala |
| ai.suggestion_generated | AI | AI wygenerowało sugestie | centrala |
| ai.suggestion_accepted | AI | Sugestia AI zaakceptowana | centrala |


## 25.4. Implementacja: automatyczne generowanie eventów

-- Trigger po zmianie statusu umowy
CREATE OR REPLACE FUNCTION contract_status_event_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO contract_events (contract_id, event_type, event_payload, user_id)
    VALUES (
      NEW.id,
      'contract.status_changed',
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER contract_status_event
  AFTER UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION contract_status_event_fn();

## 25.5. UI: Timeline View

Widok liniowy na stronie umowy - chronologiczna lista zdarzeń z filtrami:
// modules/contract/components/ContractTimeline.tsx
export function ContractTimeline({ contractId, userRole }) {
  const events = useContractEvents(contractId, userRole);
  return (
    <div className="space-y-3">
      <div className="flex gap-2 mb-4">
        <FilterChip label="Wszystkie" />
        <FilterChip label="Moje działania" />
        <FilterChip label="Zmiany prawne" />
        <FilterChip label="Approval" />
        <FilterChip label="E-podpis" />
      </div>
      {events.map(event => (
        <TimelineItem key={event.id}
          icon={getEventIcon(event.event_type)}
          timestamp={event.created_at}
          title={getEventTitle(event)}
          details={getEventDetails(event)}
          actor={event.user_name}
        />
      ))}
    </div>
  );
}
Przykład timeline:
[27.02 10:21] Umowa utworzona przez Jan Kowalski
[27.02 11:04] Klauzula "IP Rights" zmieniona (+3 risk) przez Anna Nowak
[27.02 11:10] Komentarz: "Proszę doprecyzować" - Konsultant
[27.02 14:32] Status -> negotiation
[28.02 09:12] Approval requested (Legal) przez Anna Nowak
[28.02 12:45] Approval approved przez Piotr Wiśniewski
[28.02 13:01] Wysłana do podpisu (Autenti)
[28.02 13:05] Konsultant otworzył dokument
[28.02 13:09] Podpisano

## 25.6. RLS na contract_events

-- Konsultant widzi tylko eventy ze swoich umów + visible_to IN ('consultant', 'all')
CREATE POLICY events_consultant ON contract_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM contracts WHERE id = contract_events.contract_id
    AND consultant_user_id = auth.uid())
  AND visible_to IN ('consultant', 'all')
);

-- Centrala widzi centrala + all
CREATE POLICY events_centrala ON contract_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM contracts WHERE id = contract_events.contract_id
    AND centrala_owner_id = auth.uid())
  AND visible_to IN ('centrala', 'all')
);

-- Admin widzi wszystko
CREATE POLICY events_admin ON contract_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

## 25.7. Indeksy

CREATE INDEX idx_events_contract ON contract_events(contract_id);
CREATE INDEX idx_events_type ON contract_events(event_type);
CREATE INDEX idx_events_created ON contract_events(created_at DESC);

## 25.8. Wartość biznesowa


| Metryka | Bez Timeline | Z Timeline |
| --- | --- | --- |
| Maile wyjaśniające | 100% | -30-40% |
| Czas finalizacji | Bazowy | -20% |
| Spory "kto co zmienił" | Częste | Zero |
| Przejrzystość audytu | Średnia | Pełna |


# 26. [v4.0] Abuse Prevention - kontrola nadużyć (Governance Layer)


## 26.1. Problem

Bez kontroli limitów konsultant lub użytkownik Centrali może "zamęczyć" system:
- 50 iteracji tej samej klauzuli
- 100 komentarzy dziennie
- 30 dni bez finalizacji
- 30 generowań PDF
- 20 wysłań do podpisu
- Spam webhooków
- Spam zapytań AI
Bez tych limitów: SLA się rozpada, koszty e-sign rosną, managerowie tracą kontrolę.

## 26.2. Nowe pola w contracts (liczniki)


| Kolumna | Typ | Opis |
| --- | --- | --- |
| iteration_count | INT DEFAULT 0 | Liczba iteracji edycji klauzul |
| signature_attempt_count | INT DEFAULT 0 | Liczba prób wysłania do podpisu |
| ai_calls_count | INT DEFAULT 0 | Liczba wywołań AI w tej umowie |
| pdf_generation_count | INT DEFAULT 0 | Liczba generowań PDF |


## 26.3. Nowa tabela: system_limits

Konfigurowalna tabela limitów globalnych. Centrala/admin może dostosowywać.

| Kolumna | Typ | Default | Opis |
| --- | --- | --- | --- |
| id | UUID PK | - |  |
| max_clause_iterations | INT | 20 | Max iteracji na klauzulę |
| max_signature_attempts | INT | 3 | Max prób podpisu per umowa |
| max_ai_calls_per_contract | INT | 15 | Max zapytań AI per umowa |
| max_contract_lifecycle_days | INT | 30 | Max dni od draft do finalizacji |
| max_comments_per_day | INT | 20 | Max komentarzy per user per dzień |
| max_pdf_generations | INT | 10 | Max generowań PDF per umowa |
| max_magic_link_regenerations | INT | 3 | Max regeneracji magic linka per dzień |
| cooldown_after_limit_minutes | INT | 120 | Cooldown po przekroczeniu limitu (min) |
| updated_at | TIMESTAMPTZ | now() |  |
| updated_by | UUID FK | - |  |


## 26.4. Nowy status umowy: escalated

Rozszerzenie contracts.status o wartość "escalated". Wymaga ręcznej decyzji Centrali/Admin.
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS chk_contract_status;
ALTER TABLE contracts ADD CONSTRAINT chk_contract_status
  CHECK (status IN (
    'draft', 'review', 'negotiation', 'finalized', 'cancelled',
    'sent_for_signature', 'signed', 'signature_failed', 'expired',
    'escalated'  -- [v4.0] NOWY
  ));

## 26.5. Automatyczne działania - reguły eskalacji


| Warunek | Działanie | Priorytet |
| --- | --- | --- |
| iteration_count > max_clause_iterations | status -> escalated + alert do managera | MUST |
| lifecycle > max_contract_lifecycle_days | Alert do centrala_owner + manager | MUST |
| signature_attempt_count >= max_signature_attempts | Blokada ponownej wysłki + alert | MUST |
| comments today > max_comments_per_day | Cooldown 2h + info do użytkownika | SHOULD |
| ai_calls_count >= max_ai_calls_per_contract | Blokada AI + info "limit wyczerpany" | SHOULD |
| pdf_generation_count >= max_pdf_generations | Blokada generowania + info | SHOULD |


## 26.6. Implementacja: middleware sprawdzający limity

// modules/contract/lib/abuse-prevention.ts

export async function checkContractLimits(
  contractId: string,
  action: 'iteration' | 'signature' | 'ai' | 'pdf' | 'comment'
): Promise<{ allowed: boolean; reason?: string }> {
  const contract = await getContract(contractId);
  const limits = await getSystemLimits();

  const checks: Record<string, () => { allowed: boolean; reason?: string }> = {
    iteration: () => ({
      allowed: contract.iteration_count < limits.max_clause_iterations,
      reason: `Limit iteracji (${limits.max_clause_iterations}) wyczerpany. Umowa eskalowana.`
    }),
    signature: () => ({
      allowed: contract.signature_attempt_count < limits.max_signature_attempts,
      reason: `Limit prób podpisu (${limits.max_signature_attempts}) wyczerpany.`
    }),
    ai: () => ({
      allowed: contract.ai_calls_count < limits.max_ai_calls_per_contract,
      reason: `Limit zapytań AI (${limits.max_ai_calls_per_contract}) wyczerpany.`
    }),
    pdf: () => ({
      allowed: contract.pdf_generation_count < limits.max_pdf_generations,
      reason: `Limit generowania PDF (${limits.max_pdf_generations}) wyczerpany.`
    }),
    comment: async () => {
      const todayCount = await getCommentCountToday(contractId);
      return {
        allowed: todayCount < limits.max_comments_per_day,
        reason: `Limit komentarzy dziennych (${limits.max_comments_per_day}) wyczerpany. Cooldown ${limits.cooldown_after_limit_minutes} min.`
      };
    }
  };

  const result = await checks[action]();
  if (!result.allowed) {
    await escalateIfNeeded(contractId, action);
    await createEvent(contractId, 'contract.limit_reached', { action, reason: result.reason });
  }
  return result;
}

## 26.7. UI: komunikaty limitów

- Toast/banner: "Limit iteracji wyczerpany. Umowa wymaga decyzji Centrali."
- Przycisk AI wyszarzony z tooltipem: "Limit zapytań AI wyczerpany (15/15)"
- Dashboard Centrali: "3 umowy eskalowane - wymagają decyzji"
- Panel Admin: konfiguracja limitów (edycja system_limits)

## 26.8. Metryki operacyjne

- % umów eskalowanych (cel: < 5%)
- Średnia liczba iteracji per klauzula (cel: < 5)
- Średni lifecycle umowy (cel: < 14 dni)
- Koszt AI per umowa (monitoring zużycia tokenów)


# 27. [v4.0] Zgoda RODO i ślad prawny (Governance Layer)


## 27.1. Cel

Moduł przetwarza dane osobowe konsultantów (NIP, adres, email, dane bankowe). Wymaga:
- Osobnego śladu zgody (nie tylko checkbox w UI)
- Zapisu IP i wersji klauzuli RODO
- Dowodu prawnego w sporze
- Możliwości wycofania i wersjonowania zgody

## 27.2. Nowa tabela: consents_log


| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK |  |
| contract_id | UUID FK -> contracts | Umowa, której dotyczy zgoda |
| user_id | UUID FK -> auth.users | Kto wyraził zgodę |
| consent_type | TEXT NOT NULL | rodo_processing | marketing | data_transfer |
| consent_version | TEXT NOT NULL | Wersja klauzuli (np. v1.2) |
| consent_text_snapshot | TEXT NOT NULL | [NOWE] Pełna treść klauzuli w momencie akceptacji |
| ip_address | INET NOT NULL | Adres IP użytkownika |
| user_agent | TEXT | Przeglądarka/klient |
| accepted | BOOLEAN NOT NULL | true = zaakceptowano, false = odrzucono/wycofano |
| accepted_at | TIMESTAMPTZ | Timestamp akceptacji |
| withdrawn_at | TIMESTAMPTZ | Timestamp wycofania (jeśli dotyczy) |
| created_at | TIMESTAMPTZ DEFAULT now() |  |


### Check constraints:

ALTER TABLE consents_log ADD CONSTRAINT chk_consent_type
  CHECK (consent_type IN ('rodo_processing', 'marketing', 'data_transfer'));

CREATE INDEX idx_consents_contract ON consents_log(contract_id);
CREATE INDEX idx_consents_user ON consents_log(user_id);

## 27.3. Wersjonowanie zgód

Nowa tabela: consent_versions - źródło prawdy dla treści klauzul RODO.

| Kolumna | Typ | Opis |
| --- | --- | --- |
| id | UUID PK |  |
| consent_type | TEXT NOT NULL | rodo_processing | marketing | data_transfer |
| version | TEXT NOT NULL | np. v1.0, v1.1, v2.0 |
| content_pl | TEXT NOT NULL | Treść po polsku |
| content_en | TEXT | Treść po angielsku (opcjonalnie) |
| is_active | BOOLEAN DEFAULT true | Czy aktywna wersja |
| effective_from | DATE NOT NULL | Od kiedy obowiązuje |
| created_by | UUID FK |  |
| created_at | TIMESTAMPTZ DEFAULT now() |  |


## 27.4. Flow: zgoda przed podpisem

Krok w workflow: finalized -> [CONSENT SCREEN] -> sent_for_signature
// Flow podpisu z wymaganymi zgodami:
//
// 1. Centrala klika "Wyślij do podpisu"
// 2. System generuje final PDF
// 3. System wyświetla konsultantowi ekran zgód:
//    [ ] Akceptuję przetwarzanie danych osobowych
//        zgodnie z polityką prywatności (v1.2)
//    [ ] Oświadczam, że zapoznałem się z regulaminem
//
// 4. Konsultant akceptuje -> zapis do consents_log
//    (IP, user_agent, consent_version, consent_text_snapshot)
// 5. Dopiero teraz: createEnvelope u providera podpisu
//
// BEZ zaznaczenia -> BRAK możliwości wysłania do podpisu

## 27.5. UI: ekran zgód

// modules/contract/components/ConsentScreen.tsx
export function ConsentScreen({ contractId, onComplete }) {
  const consents = useRequiredConsents();
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  const allAccepted = consents.every(c => accepted[c.consent_type]);

  const handleSubmit = async () => {
    for (const consent of consents) {
      await recordConsent({
        contract_id: contractId,
        consent_type: consent.consent_type,
        consent_version: consent.version,
        consent_text_snapshot: consent.content_pl,
        accepted: true,
        // IP i user_agent zbierane automatycznie server-side
      });
    }
    await createEvent(contractId, 'consent.accepted', {
      types: consents.map(c => c.consent_type),
    });
    onComplete();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wymagane zgody</CardTitle>
        <CardDescription>
          Przed podpisaniem umowy wymagana jest akceptacja
          poniższych zgód.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {consents.map(consent => (
          <ConsentCheckbox
            key={consent.consent_type}
            consent={consent}
            checked={accepted[consent.consent_type]}
            onChange={(v) => setAccepted(prev => ({...prev, [consent.consent_type]: v}))}
          />
        ))}
      </CardContent>
      <CardFooter>
        <Button disabled={!allAccepted} onClick={handleSubmit}>
          Potwierdź i przejdź do podpisu
        </Button>
      </CardFooter>
    </Card>
  );
}

## 27.6. Zapis w final_snapshot

W momencie finalizacji, do final_snapshot dodajemy sekcję consents:
// Fragment final_snapshot.consents
{
  "consents": {
    "rodo_processing": {
      "accepted": true,
      "accepted_at": "2026-02-27T13:05:00Z",
      "version": "v1.2",
      "ip": "192.168.1.100",
      "user_agent": "Mozilla/5.0..."
    },
    "data_transfer": {
      "accepted": true,
      "accepted_at": "2026-02-27T13:05:01Z",
      "version": "v1.0",
      "ip": "192.168.1.100"
    }
  }
}

## 27.7. PDF: informacja o zgodach

Na ostatniej stronie wygenerowanego PDF:
- "Osoba podpisująca potwierdza uprzednią akceptację przetwarzania danych osobowych zgodnie z polityką prywatności B2B.net S.A. (wersja v1.2)."
- Data i godzina akceptacji
- Wersja klauzuli RODO

## 27.8. Wycofanie zgody

Konsultant może wycofać zgodę (RODO Art. 7). Konsekwencje:
- Nowy wpis w consents_log z accepted=false i withdrawn_at
- Event: consent.withdrawn
- Jeśli umowa jest w trakcie (nie signed): blokada dalszego procesu
- Jeśli umowa jest signed: brak wpływu na ważność umowy (zgoda była ważna w momencie podpisu)
- Powiadomienie do Centrali i DPO

## 27.9. RLS na consents_log

-- Konsultant widzi tylko swoje zgody
CREATE POLICY consents_consultant ON consents_log FOR SELECT
  USING (user_id = auth.uid());

-- Konsultant może INSERT (akceptacja) i UPDATE (wycofanie)
CREATE POLICY consents_consultant_write ON consents_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Centrala i Admin widzą wszystko (audyt)
CREATE POLICY consents_admin ON consents_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('centrala', 'admin')));

## 27.10. Dlaczego osobna tabela (nie checkbox)?

- Zgoda może być wycofana (RODO Art. 7 ust. 3)
- Zgoda musi być wersjonowana (zmiana polityki prywatności)
- Potrzebny pełny ślad: IP, timestamp, wersja, treść
- W sporze prawnym: checkbox w UI nie jest dowodem, wpis w bazie z IP - jest
- Audytor/DPO musi mieć dostęp do historii zgód niezależnie od umów


# 28. [v4.0] Governance Layer - podsumowanie wpływu


## 28.1. Matryca wpływu


| Obszar | Bez Governance Layer | Z Governance Layer |
| --- | --- | --- |
| Przejrzystość procesu | Średnia | Wysoka (pełna oś zdarzeń) |
| Kontrola procesu | Ograniczona | Twarda (limity + eskalacja) |
| Compliance RODO | 80% | 100% (ślad prawny zgód) |
| Operacyjna dyscyplina | Niska | Wysoka (SLA + limity) |
| Ryzyko nadużyć | Wysokie | Kontrolowane |
| Audytowalność | Częściowa | Pełna |
| Wartość systemu | Moduł do umów | Platforma kontraktowa enterprise |


## 28.2. Nowe pliki w strukturze projektu

/modules/contract/components/
  ContractTimeline.tsx         [v4.0] Oś zdarzeń
  TimelineItem.tsx             [v4.0] Element timeline
  ConsentScreen.tsx            [v4.0] Ekran zgód RODO
  ConsentCheckbox.tsx          [v4.0] Checkbox zgody
  AbuseLimitBanner.tsx         [v4.0] Banner limitu
  EscalationPanel.tsx          [v4.0] Panel eskalacji
  SystemLimitsConfig.tsx       [v4.0] Admin: konfiguracja limitów

/modules/contract/lib/
  abuse-prevention.ts          [v4.0] Serwis limitów
  consent-service.ts           [v4.0] Serwis zgód RODO
  timeline-service.ts          [v4.0] Serwis timeline
  event-emitter.ts             [v4.0] Emitter zdarzeń biznesowych

## 28.3. Nowe tabele (podsumowanie v4.0)


| Tabela | Cel | Priorytet |
| --- | --- | --- |
| contract_events | Oś zdarzeń biznesowych | MUST HAVE |
| system_limits | Konfigurowalne limity operacyjne | MUST HAVE |
| consents_log | Ślad prawny zgód RODO | MUST HAVE |
| consent_versions | Wersjonowanie treści zgód | MUST HAVE |


## 28.4. Rozszerzenie planu wdrożenia

Governance Layer dodaje 1 dodatkowy sprint do timeline:

| Sprint | Okres | Zakres |
| --- | --- | --- |
| Sprint 5 (Governance) | Tydzien 10-11 | contract_events + timeline UI + system_limits + abuse prevention + consents_log + consent screen + testy RLS |

Nowy total timeline: 12-14 tygodni (vs 10-12 w v3.0).

## 28.5. Rozszerzone testy

- [E2E] Pełny flow z consent screen -> podpis (consent wymagany)
- [E2E] Eskalacja po przekroczeniu limitu iteracji
- [E2E] Wycofanie zgody RODO i blokada procesu
- [RLS] Konsultant nie widzi eventów visible_to=centrala
- [RLS] Konsultant nie może modyfikować cudzych zgód
- [Unit] checkContractLimits() - każdy typ limitu
- [Unit] Wersjonowanie zgód - poprawna wersja w snapshot
- [Integration] Trigger contract_status_event generuje eventy

## 28.6. Definition of Done v4.0

v4.0 jest gotowe, jeśli (ponad wymagania v3.0):
- Timeline pokazuje pełną historię umowy z filtrami
- System blokuje przekroczenie limitów (iteracje, podpisy, AI, PDF, komentarze)
- Status "escalated" działa i wymaga decyzji Centrali
- Consent screen blokuje podpis bez akceptacji RODO
- consents_log zawiera IP, user_agent, wersję, snapshot treści
- Wycofanie zgody jest możliwe i logowane
- Testy RLS na contract_events i consents_log - 100%
- Dashboard Centrali: "umowy eskalowane" + "wymagające zgód"

## 28.7. Pozycjonowanie systemu

Z Governance Layer, Compass: Umowa-Konsultant to już nie "system do umów". To:
- System zarządzania ryzykiem kontraktowym w B2B.net
- Platforma z pełnym audytem, compliance RODO i kontrolą procesów
- Potencjalny fundament pod spin-off jako legal-tech SaaS
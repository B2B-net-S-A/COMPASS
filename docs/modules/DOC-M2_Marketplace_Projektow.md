# DOC-M2: Marketplace Projektów (Internal Job Board)

**Aplikacja:** Qualrix by B2B.net S.A.
**Moduł:** M2 - Marketplace Projektów
**Data:** 2026-02-08
**Wersja:** 1.0
**Stack:** Next.js 14+, Supabase, TypeScript, Tailwind CSS, shadcn/ui, next-intl (PL+EN), Zustand

---

## 1. Opis Modułu

### 1.1 Czym jest Marketplace Projektów?

Marketplace Projektów (M2) to wewnętrzna tablica ogłoszeń projektów dostępna dla konsultantów zatrudnionych w B2B.net S.A. Moduł prezentuje:
- **Projekty dostępne teraz** (status: OPEN) – można się zgłaszać natychmiast
- **Projekty w planach** (status: PIPELINE) – przewidywane na 3-6 miesięcy

### 1.2 Cel Business

Marketplace Projektów jest **kluczowym modułem retencji** zespołu konsultantów:
1. **Eliminuje strach przed końcem umowy** – konsultant widzi pipeline przyszłych projektów
2. **Ułatwia planowanie** – konsultant wie, co go czeka w najbliższych miesiącach
3. **Przyśpiesza matching** – system automatycznie pokazuje projekty dopasowane do profilu
4. **Zwiększa konwersję** – exclusive projects dla Gold/Platinum status motywują upgrady
5. **Wspiera Delivery Lead** – zmniejsza czas na manualny matching

### 1.3 Wartość Biznesowa

| Metryka | Cel |
|---------|-----|
| Application Rate | Średnio 5+ zgłoszeń/miesiąc na konsultanta |
| Retention | Wzrost spędzonego czasu w app (target: 5 min/dzień) |
| Time-to-Placement | Redukcja z 2-3 tygodni do <1 tygodnia |
| Gold/Platinum Upgrade | +25% subskrybentów premium |

---

## 2. User Stories

### Dla roli: **consultant**

1. **US-M2-001:** Jako konsultant chcę zobaczyć listę projektów dostępnych teraz (OPEN), aby wiedzieć, na które mogę się zgłaszać zaraz
   - **AC:** Lista wyświetla projekty ze statusem OPEN, karty pokazują: klient, technologie, rate range, work mode, location
   - **AC:** Projekty posortowane: najpierw matching score (malejąco), potem data dodania (najnowsze)

2. **US-M2-002:** Jako konsultant chcę zobaczyć projekty coming soon (PIPELINE), aby planować swoją ścieżkę zawodową
   - **AC:** Osobna zakładka "Czekaj w kolejce" lub sekcja "Wkrótce"
   - **AC:** Projekty PIPELINE są identyczne jak OPEN, ale bez przycisku "Zgłoś się"
   - **AC:** Wyświetlana orientacyjna data dostępności

3. **US-M2-003:** Jako konsultant chcę filtrować projekty po technologiach, aby znaleźć tylko te z C# lub React
   - **AC:** Multi-select filter dla technologii (checkboxes)
   - **AC:** Filtry zachowywane w URL i localStorage
   - **AC:** Live update listy (bez konieczności klikania "Szukaj")

4. **US-M2-004:** Jako konsultant chcę filtrować projekty po rate (PLN/h), aby znaleźć tylko oferty powyżej 120 PLN/h
   - **AC:** Range slider: min 80, max 250 PLN/h
   - **AC:** Aktualizacja na żywo

5. **US-M2-005:** Jako konsultant chcę filtrować projekty po work mode (remote/hybrid/onsite), aby znaleźć remote only
   - **AC:** Checkboxes: Remote, Hybrid, Onsite
   - **AC:** Multi-select możliwy

6. **US-M2-006:** Jako konsultant chcę zobaczyć matching score (%), aby wiedzieć, jak dobrze projekt pasuje do mojego profilu
   - **AC:** Badge na karcie projektu z % i kolorem: >80% (zielony), 50-80% (żółty), <50% (szary)
   - **AC:** Po kliknięciu badge'a wyświetla breakdown: technologie (50%), experience (30%), location (20%)

7. **US-M2-007:** Jako konsultant chcę kliknąć "Zgłoś się" (I'm interested), aby sygnalizować Delivery Lead, że interesuję się projektem
   - **AC:** Button zmienia stan na "Oczekiwanie" i wysyła notifikację do DL
   - **AC:** Projekt pojawia się w sekcji "Moje zgłoszenia"
   - **AC:** Consultant może anulować zgłoszenie (status: withdrawn)

8. **US-M2-008:** Jako konsultant chcę zobaczyć historię moich zgłoszeń (aplikacji), aby śledzić, na które projekty się zgłosiłem i jaki był wynik
   - **AC:** Osobna zakładka "Moje zgłoszenia"
   - **AC:** Kolumny: Projekt, Klient, Status (oczekiwanie/akceptacja/odrzucenie/wycofane), Data zgłoszenia
   - **AC:** Filtry po statusie
   - **AC:** Sortowanie po dacie (najnowsze pierwsze)

9. **US-M2-009:** Jako konsultant chcę otrzymać alert, że moja umowa kończy się za 90 dni, z rekomendacją pasujących projektów
   - **AC:** Alert wyświetla się w topbar lub als toast notification
   - **AC:** Alert zawiera link do projektów z matching score >70%
   - **AC:** Możliwość zamknięcia alertu (nie znika na 7 dni lub do końca umowy)

10. **US-M2-010:** Jako konsultant chcę zobaczyć projekty exclusive (Gold/Platinum only), jeśli posiadam subskrypcję premium
    - **AC:** Dla Bronze: badge "Exclusive" + lock icon, brak dostępu do szczegółów
    - **AC:** Dla Gold/Platinum: full access, badge "Exclusive" (bez lock)
    - **AC:** Link do upgrade do Gold/Platinum status

11. **US-M2-011:** Jako konsultant chcę zobaczyć klienta anonimowo jeśli jest nieznany, aby znać kontekst (np. "Duży bank z sektora finansowego")
    - **AC:** Pole "Klient" wyświetla: "Duży bank z sektora finansowego" zamiast nazwy
    - **AC:** Inne info dostępne: sektor, wielkość, wymagania

12. **US-M2-012:** Jako konsultant chcę mieć push notification o nowym projekcie pasującym do mojego profilu (matching >75%)
    - **AC:** Notifikacja wysyłana w real-time gdy projekt zostanie opublikowany
    - **AC:** Tytuł: "Nowy projekt pasujący do Twojego profilu!"
    - **AC:** Możliwość wyłączenia w ustawieniach

13. **US-M2-013:** Jako konsultant chcę zobaczyć szczegóły projektu (full view), aby podjąć decyzję o zgłoszeniu
    - **AC:** Wyświetlane: klient, opis, technologie, rate range, work mode, location, matching score breakdown, datę dostępności
    - **AC:** Przycisk "Zgłoś się" na dole

14. **US-M2-014:** Jako konsultant chcę filtrować projekty po branży klienta, aby znaleźć projekty w sektorze finansowym
    - **AC:** Dropdown/checkboxes: Finanse, E-commerce, Healthcare, Tech, Edukacja, itd.
    - **AC:** Multi-select możliwy

15. **US-M2-015:** Jako konsultant (mobilny) chcę mieć responsywny interfejs, aby przeglądać projekty na telefonie
    - **AC:** Na mobile: karty pełna szerokość, filtry w bottom sheet, przycisk "Filtry" fixed bottom
    - **AC:** Touch-friendly: buttony min 44px, spacing 16px

### Dla roli: **delivery_lead**

1. **US-M2-DL-001:** Jako Delivery Lead chcę opublikować projekt (OPEN lub PIPELINE), aby był widoczny dla konsultantów
   - **AC:** Form z polami: nazwa, opis, technologie, rate min/max, work mode, location, klient (branded/anonymous), status, exclusive
   - **AC:** Walidacja: wszystkie pola wymagane
   - **AC:** Po publish: projekt pojawia się natychmiast (OPEN) lub w scheduled date (PIPELINE)

2. **US-M2-DL-002:** Jako Delivery Lead chcę zobaczyć listę konsultantów zainteresowanych projektem, aby kontaktować się z nimi
   - **AC:** Panel DL - lista aplikacji do projektu
   - **AC:** Kolumny: Konsultant, Matching score, Data zgłoszenia, Akcje (accept/reject)
   - **AC:** Sortowanie po matching score (malejąco)

3. **US-M2-DL-003:** Jako Delivery Lead chcę zaakceptować lub odrzucić aplikację konsultanta, aby potwierdzić zainteresowanie
   - **AC:** Button "Zaakceptuj" zmienia status na ACCEPTED
   - **AC:** Button "Odrzuć" zmienia status na REJECTED + opcja dodania powodu
   - **AC:** Konsultant otrzymuje notifikację

4. **US-M2-DL-004:** Jako Delivery Lead chcę edytować projekt, aby zaktualizować szczegóły
   - **AC:** Edit form - wszystkie pola edytowalne
   - **AC:** Historia zmian logowana (nie wymagane w MVP)

5. **US-M2-DL-005:** Jako Delivery Lead chcę archiwizować/usunąć projekt, aby ukryć go z widoku
   - **AC:** Status zmienia się na ARCHIVED
   - **AC:** Projekt nie widoczny dla konsultantów

---

## 3. Wireframe / Layout Description

### 3.1 Project List View (Mobile-First)

```
┌─────────────────────────────────┐
│ Marketplace Projektów           │ (header)
│ 🔔 Alert: 90 dni do końca umowy │
├─────────────────────────────────┤
│ [OPEN] [PIPELINE]               │ (tabs)
├─────────────────────────────────┤
│ 📊 Filtruj (sticky bottom)       │ (button)
├─────────────────────────────────┤
│ ┌────────────────────────────┐  │
│ │ 🎯 85%  React Expert       │  │ (card)
│ │ Duży e-commerce            │  │
│ │ 140-160 PLN/h • Remote     │  │
│ │ React, Node.js, PostgreSQL │  │
│ │ ✨ Exclusive (Gold+)       │  │
│ │ [Zgłoś się]                │  │
│ └────────────────────────────┘  │
│ ┌────────────────────────────┐  │
│ │ 🎯 72%  C# Backend Dev      │  │
│ │ Bank z sektora finansowego  │  │
│ │ 130-150 PLN/h • Hybrid     │  │
│ │ C#, .NET, SQL Server       │  │
│ │ [Zgłoś się]                │  │
│ └────────────────────────────┘  │
└─────────────────────────────────┘
```

**Elementy karty (ProjectCard):**
- Matching score badge (top-left): procent + kolor
- Exclusive badge (top-right): "✨ Exclusive" (jeśli exclusive=true)
- Tytuł projektu
- Nazwa klienta (lub anonimowa: "Duży bank...")
- Rate range (PLN/h)
- Work mode ikony (🌍 Remote, 🏢 Hybrid, 🏢 Onsite)
- Technologie (tags/pills)
- Button "Zgłoś się" (lub "Oczekiwanie" / "Anuluj")

**Na desktopie (sidebar + grid):**
```
┌─────────────────────────────────────────────────────┐
│ [OPEN] [PIPELINE]   🔔 90 dni alert      [Moje zgł]│
├────────────┬────────────────────────────────────────┤
│ FILTRY     │ 🎯 85%  React Expert                   │
│            │ Duży e-commerce                        │
│ Technologie│ 140-160 PLN/h • Remote                │
│ ☑ React   │ React, Node.js, PostgreSQL             │
│ ☑ Node.js │ ✨ Exclusive                           │
│ ☐ C#      │ [Zgłoś się]                            │
│ ☐ Java    │                                        │
│            │ 🎯 72%  C# Backend Dev                 │
│ Work Mode  │ Bank z sektora finansowego             │
│ ☑ Remote  │ 130-150 PLN/h • Hybrid                 │
│ ☐ Hybrid  │ C#, .NET, SQL Server                   │
│ ☐ Onsite  │ [Zgłoś się]                            │
│            │                                        │
│ Rate (PLN/h) │ 🎯 68%  Full Stack Dev              │
│ 80 ──●────250 │ Startup Tech                       │
│            │ 100-120 PLN/h • Remote                │
│ Branża     │ JavaScript, React, Node.js             │
│ ☑ Tech    │ [Zgłoś się]                            │
│ ☑ Finance │                                        │
└────────────┴────────────────────────────────────────┘
```

### 3.2 Project Detail View

```
┌─────────────────────────────────┐
│ ← Back  React Expert  [Share]   │ (header)
├─────────────────────────────────┤
│ 🎯 Matching Score: 85%          │ (score section)
│ Technologie 50%                 │ (breakdown)
│ Doświadczenie 30%               │
│ Lokalizacja 20%                 │
├─────────────────────────────────┤
│ PROJEKT                         │
│ Tytuł: React Expert             │
│ Klient: Duży e-commerce         │
│ Rate: 140-160 PLN/h             │
│ Work Mode: 🌍 Remote            │
│ Lokalizacja: Warszawa/Remote    │
│ Technologie: React, Node.js,    │
│   PostgreSQL, Docker            │
│ Branża: E-commerce              │
│ Status: OPEN                    │
│ Dostęp: Natychmiast             │
│ Exclusive: ✨ Gold+ required    │
│                                 │
│ OPIS                            │
│ Szukamy doświadczonego React    │
│ developera do projektu e-com... │
│ (pełny tekst, max 500 sł)       │
│                                 │
│ WYMAGANIA                       │
│ • 3+ lat doświadczenia React    │
│ • TypeScript                    │
│ • Experience z testing (Jest)   │
│ • Komunikatywny angielski       │
│                                 │
│ BENEFITY                        │
│ • Elastyczne godziny            │
│ • Możliwość wzrostu             │
│ • Bonusy za performance         │
│                                 │
│ KONTAKT                         │
│ Delivery Lead: John Kowalski    │
│ Email: john@b2b.net             │
│ ────────────────────────────────│
│ [Zgłoś się]                     │
│ lub "Anuluj zgłoszenie"         │
└─────────────────────────────────┘
```

### 3.3 My Applications View (Moje Zgłoszenia)

```
┌─────────────────────────────────┐
│ Moje Zgłoszenia (15)            │ (header)
│ Status: [Wszystkie] [Oczekiwanie]│
│           [Zaakceptowane]        │
├─────────────────────────────────┤
│ ┌────────────────────────────┐  │
│ │ React Expert               │  │
│ │ Duży e-commerce            │  │
│ │ Status: Oczekiwanie ⏳     │  │ (yellow)
│ │ Zgłoszono: 2026-01-15      │  │
│ │ [Anuluj]                   │  │
│ └────────────────────────────┘  │
│ ┌────────────────────────────┐  │
│ │ C# Backend Dev             │  │
│ │ Bank z sektora finansowego  │  │
│ │ Status: Zaakceptowana ✓    │  │ (green)
│ │ Zgłoszono: 2026-01-10      │  │
│ │ [Pokaż szczegóły]          │  │
│ └────────────────────────────┘  │
│ ┌────────────────────────────┐  │
│ │ Full Stack Dev             │  │
│ │ Startup Tech               │  │
│ │ Status: Odrzucona ✗        │  │ (red)
│ │ Zgłoszono: 2026-01-05      │  │
│ │ Powód: Niedostateczne      │  │
│ │ doświadczenie              │  │
│ └────────────────────────────┘  │
└─────────────────────────────────┘
```

### 3.4 Filter Panel (Bottom Sheet Mobile / Sidebar Desktop)

```
┌─────────────────────────────────┐
│ Filtry              [X]         │ (header, mobile)
├─────────────────────────────────┤
│ TECHNOLOGIE                     │
│ ☐ React                         │
│ ☐ Node.js                       │
│ ☐ Vue.js                        │
│ ☐ C#                            │
│ ☐ Java                          │
│ ☐ Python                        │
│ [+ Pokaż więcej]                │
│                                 │
│ RATE (PLN/h)                    │
│ 80 ────●────────●── 250         │
│ Min: 80        Max: 250         │
│                                 │
│ WORK MODE                       │
│ ☐ Remote                        │
│ ☐ Hybrid                        │
│ ☐ Onsite                        │
│                                 │
│ BRANŻA KLIENTA                  │
│ ☐ Tech                          │
│ ☐ Finance                       │
│ ☐ E-commerce                    │
│ ☐ Healthcare                    │
│                                 │
│ [Wyczyść filtry]  [Zastosuj]    │ (actions)
└─────────────────────────────────┘
```

---

## 4. Komponenty UI

### 4.1 ProjectCard
```typescript
interface ProjectCardProps {
  project: Project;
  matchingScore: number; // 0-100
  isExclusive: boolean;
  userStatus: ConsultantStatus; // none | interested | accepted | rejected
  onClick: () => void;
  onInterestClick: () => void;
  onCancelClick: () => void;
}

// Estructura:
// ┌─ Matching Badge (85%)
// ├─ Exclusive Badge (opsional)
// ├─ Title
// ├─ Client name (branded or anonymous)
// ├─ Rate range (PLN/h)
// ├─ Work mode icons
// ├─ Tech stack (first 3 + overflow)
// └─ Action button
```

### 4.2 ProjectDetail
```typescript
interface ProjectDetailProps {
  project: Project;
  matchingScore: MatchingScoreBreakdown;
  userApplicationStatus: ApplicationStatus;
  onInterest: () => void;
  onCancel: () => void;
}

// Sections:
// 1. Header (title, back, share)
// 2. Matching score + breakdown
// 3. Key info (rate, work mode, location)
// 4. Technologies
// 5. Description
// 6. Requirements (ul)
// 7. Benefits (ul)
// 8. Contact DL
// 9. Action buttons
```

### 4.3 FilterPanel
```typescript
interface FilterPanelProps {
  filters: ProjectFilters;
  onChange: (filters: ProjectFilters) => void;
  onClear: () => void;
}

interface ProjectFilters {
  technologies: string[];
  rateMin: number;
  rateMax: number;
  workModes: ('remote' | 'hybrid' | 'onsite')[];
  industries: string[];
}
```

### 4.4 MatchingScoreBadge
```typescript
interface MatchingScoreBadgeProps {
  score: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

// Colors:
// > 80%: #10b981 (green)
// 50-80%: #f59e0b (yellow)
// < 50%: #6b7280 (gray)
```

### 4.5 ApplicationStatusBadge
```typescript
interface ApplicationStatusBadgeProps {
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  rejectionReason?: string;
}

// Display:
// pending: "Oczekiwanie" (yellow) ⏳
// accepted: "Zaakceptowana" (green) ✓
// rejected: "Odrzucona" (red) ✗
// withdrawn: "Wycofana" (gray) ↩
```

### 4.6 ExclusiveBadge
```typescript
interface ExclusiveBadgeProps {
  exclusive: boolean;
  userTierHasAccess: boolean; // Gold+ or consultant is higher
}

// Display:
// exclusive && !hasAccess: "✨ Exclusive" + 🔒 lock + gray
// exclusive && hasAccess: "✨ Exclusive" + gold star
```

---

## 5. Model Danych

### 5.1 Tabela: projects

```sql
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Metadata
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  description TEXT NOT NULL,
  requirements TEXT[] NOT NULL DEFAULT '{}', -- ["req1", "req2"]
  benefits TEXT[] NOT NULL DEFAULT '{}',

  -- Client & Rate
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name VARCHAR(255), -- nullable, for anonymous projects
  client_is_anonymous BOOLEAN DEFAULT FALSE,
  client_industry VARCHAR(100),
  rate_min INTEGER NOT NULL, -- PLN/h, e.g. 120
  rate_max INTEGER NOT NULL, -- PLN/h, e.g. 150

  -- Location & Work
  location VARCHAR(255), -- "Warsaw", "Remote"
  work_modes TEXT[] NOT NULL, -- ["remote", "hybrid", "onsite"]

  -- Technologies
  required_technologies VARCHAR(100)[] NOT NULL, -- ["React", "Node.js", "TypeScript"]
  nice_to_have_technologies VARCHAR(100)[] DEFAULT '{}',

  -- Status & Visibility
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'PIPELINE', 'ARCHIVED')),
  is_exclusive BOOLEAN DEFAULT FALSE, -- visible only to Gold/Platinum
  exclusive_tier VARCHAR(50), -- "gold", "platinum"

  -- Dates
  available_at TIMESTAMP DEFAULT NOW(),
  pipeline_date TIMESTAMP, -- for PIPELINE projects
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Metadata
  created_by_delivery_lead_id UUID REFERENCES auth.users(id),
  view_count INTEGER DEFAULT 0,
  application_count INTEGER DEFAULT 0
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_technologies ON projects USING GIN(required_technologies);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);
```

### 5.2 Tabela: project_applications

```sql
CREATE TABLE IF NOT EXISTS project_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  consultant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'rejected', 'withdrawn')
  ),

  -- Matching score
  matching_score_total INTEGER, -- 0-100
  matching_score_technologies INTEGER, -- 0-100
  matching_score_experience INTEGER, -- 0-100
  matching_score_location INTEGER, -- 0-100

  -- Metadata
  rejection_reason TEXT,
  notes TEXT,

  -- Dates
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  reviewed_by_delivery_lead_id UUID REFERENCES auth.users(id)

  UNIQUE(project_id, consultant_id)
);

CREATE INDEX idx_applications_project ON project_applications(project_id);
CREATE INDEX idx_applications_consultant ON project_applications(consultant_id);
CREATE INDEX idx_applications_status ON project_applications(status);
CREATE INDEX idx_applications_matching_score ON project_applications(matching_score_total DESC);
```

### 5.3 Tabela: consultants (Extended)

Kolumny dodane do istniejącej tabeli (z M1 lub auth.users):

```sql
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS (
  -- Profile for matching
  technologies VARCHAR(100)[] DEFAULT '{}', -- ["React", "Node.js", ...]
  years_of_experience INTEGER DEFAULT 0,
  preferred_work_modes TEXT[] DEFAULT '{}', -- ["remote", "hybrid"]
  preferred_location VARCHAR(255),
  preferred_industries VARCHAR(100)[] DEFAULT '{}',

  -- Contract info
  contract_end_date DATE,

  -- Notification preferences
  notify_new_projects BOOLEAN DEFAULT TRUE,
  notify_matching_threshold INTEGER DEFAULT 75, -- notify if match > 75%

  -- Status
  subscription_tier VARCHAR(20) DEFAULT 'bronze' CHECK (subscription_tier IN ('bronze', 'gold', 'platinum')),

  -- Stats
  total_applications INTEGER DEFAULT 0,
  total_accepted INTEGER DEFAULT 0,
  profile_completion_percentage INTEGER DEFAULT 0
);
```

### 5.4 Tabela: clients

```sql
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(255) NOT NULL,
  industry VARCHAR(100),
  description TEXT,
  logo_url VARCHAR(255),

  -- Branding preferences
  show_name BOOLEAN DEFAULT TRUE, -- if false, client is "anonymous"
  anonymous_description VARCHAR(255), -- e.g., "Duży bank z sektora finansowego"

  created_at TIMESTAMP DEFAULT NOW()
);
```

### 5.5 TypeScript Types

```typescript
// Types for frontend

interface Project {
  id: string;
  title: string;
  slug: string;
  description: string;
  requirements: string[];
  benefits: string[];

  clientId: string | null;
  clientName: string | null;
  clientIsAnonymous: boolean;
  clientIndustry: string | null;

  rateMin: number;
  rateMax: number;

  location: string;
  workModes: ('remote' | 'hybrid' | 'onsite')[];

  requiredTechnologies: string[];
  niceToHaveTechnologies: string[];

  status: 'OPEN' | 'PIPELINE' | 'ARCHIVED';
  isExclusive: boolean;
  exclusiveTier: 'gold' | 'platinum' | null;

  availableAt: Date;
  pipelineDate: Date | null;
  createdAt: Date;
  updatedAt: Date;

  createdByDeliveryLeadId: string;
  viewCount: number;
  applicationCount: number;
}

interface ProjectApplication {
  id: string;
  projectId: string;
  consultantId: string;

  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';

  matchingScoreTotal: number;
  matchingScoreTechnologies: number;
  matchingScoreExperience: number;
  matchingScoreLocation: number;

  rejectionReason: string | null;
  notes: string | null;

  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  reviewedByDeliveryLeadId: string | null;
}

interface Consultant {
  id: string;
  email: string;
  name: string;

  technologies: string[];
  yearsOfExperience: number;
  preferredWorkModes: ('remote' | 'hybrid' | 'onsite')[];
  preferredLocation: string;
  preferredIndustries: string[];

  contractEndDate: Date | null;

  notifyNewProjects: boolean;
  notifyMatchingThreshold: number;

  subscriptionTier: 'bronze' | 'gold' | 'platinum';

  totalApplications: number;
  totalAccepted: number;
  profileCompletionPercentage: number;
}

interface MatchingScoreBreakdown {
  total: number; // 0-100
  technologies: number; // 50% weight
  experience: number; // 30% weight
  location: number; // 20% weight
}

interface ProjectFilters {
  technologies: string[];
  rateMin: number;
  rateMax: number;
  workModes: ('remote' | 'hybrid' | 'onsite')[];
  industries: string[];
}

interface ProjectWithMatching extends Project {
  matchingScore: MatchingScoreBreakdown;
  applicationStatus: 'none' | 'pending' | 'accepted' | 'rejected' | 'withdrawn';
}
```

---

## 6. Logika Biznesowa

### 6.1 Algorytm Matching Score

```typescript
function calculateMatchingScore(
  project: Project,
  consultant: Consultant
): MatchingScoreBreakdown {

  // 1. TECHNOLOGIES (50%)
  const requiredTechs = project.requiredTechnologies.map(t => t.toLowerCase());
  const consultantTechs = consultant.technologies.map(t => t.toLowerCase());

  const matchedTechs = requiredTechs.filter(t => consultantTechs.includes(t));
  const techScore = (matchedTechs.length / requiredTechs.length) * 100;

  // Nice-to-have: +5 points każda (max +20)
  const niceToHave = project.niceToHaveTechnologies.map(t => t.toLowerCase());
  const niceMatches = niceToHave.filter(t => consultantTechs.includes(t));
  const niceBonus = Math.min(niceMatches.length * 5, 20);

  const technologyScore = Math.min(techScore + niceBonus, 100);

  // 2. EXPERIENCE (30%)
  const projectImpliedYears = Math.ceil(requiredTechs.length * 1.5); // rough estimate
  const yearsRatio = Math.min(consultant.yearsOfExperience / projectImpliedYears, 1.0);
  const experienceScore = yearsRatio * 100;

  // 3. LOCATION (20%)
  const consultantPrefLocation = consultant.preferredLocation?.toLowerCase() || '';
  const projectLocation = project.location.toLowerCase();

  let locationScore = 0;

  if (consultant.preferredWorkModes.includes('remote')) {
    locationScore = 100; // no location constraint
  } else if (
    projectLocation.includes('remote') &&
    consultant.preferredWorkModes.includes('remote')
  ) {
    locationScore = 100;
  } else if (
    projectLocation.includes(consultantPrefLocation) ||
    consultantPrefLocation.includes(projectLocation)
  ) {
    locationScore = 90; // same location
  } else if (consultant.preferredWorkModes.includes('hybrid')) {
    locationScore = 60; // hybrid is compromise
  } else {
    locationScore = 0; // location mismatch
  }

  // WEIGHTED SCORE
  const total =
    (technologyScore * 0.5) +
    (experienceScore * 0.3) +
    (locationScore * 0.2);

  return {
    total: Math.round(total),
    technologies: Math.round(technologyScore),
    experience: Math.round(experienceScore),
    location: Math.round(locationScore)
  };
}
```

### 6.2 Reguły Widoczności Projektów

```typescript
function isProjectVisibleToConsultant(
  project: Project,
  consultant: Consultant
): boolean {

  // 1. Project musi mieć status OPEN lub PIPELINE
  if (!['OPEN', 'PIPELINE'].includes(project.status)) {
    return false;
  }

  // 2. Jeśli projekt jest exclusive
  if (project.isExclusive) {
    const tierHierarchy = { bronze: 0, gold: 1, platinum: 2 };
    const projectTierLevel = tierHierarchy[project.exclusiveTier] || 0;
    const consultantTierLevel = tierHierarchy[consultant.subscriptionTier] || 0;

    if (consultantTierLevel < projectTierLevel) {
      return false; // consultant nie ma dostępu
    }
  }

  // 3. Jeśli PIPELINE, projekt powinien mieć pipeline_date w przyszłości
  if (project.status === 'PIPELINE' && project.pipelineDate) {
    if (new Date(project.pipelineDate) < new Date()) {
      return false; // nie został jeszcze opublikowany
    }
  }

  return true;
}
```

### 6.3 Workflow Aplikacji (Application Flow)

```
1. Konsultant klika "Zgłoś się" (I'm interested)
   ↓
2. System tworzy ProjectApplication z status: 'pending'
   ↓
3. Toast notification: "Zgłoszono! Delivery Lead przejrzy wkrótce"
   ↓
4. Konsultant widzi button "Anuluj zgłoszenie"
   ↓
5. Delivery Lead otrzymuje notifikację
   ↓
6. DL przejrzewa listę aplikantów, sortowanych po matching score
   ↓
7a. DL klika "Zaakceptuj"
    → status: 'accepted'
    → Konsultant otrzymuje notyfikację: "Zaakceptowano!"

7b. DL klika "Odrzuć" + powód
    → status: 'rejected'
    → rejection_reason: "Niedostateczne doświadczenie"
    → Konsultant otrzymuje notyfikację: "Odrzucono. Powód: ..."

8. Konsultant widzi aplikacje w sekcji "Moje zgłoszenia"
```

### 6.4 Wyświetlanie Raty (Rate Display)

```typescript
// NIGDY nie pokazujemy dokładnej wartości (np. 135 PLN/h)
// ZAWSZE pokazujemy range (np. 120-150 PLN/h)

function formatRateRange(rateMin: number, rateMax: number): string {
  return `${rateMin}-${rateMax} PLN/h`;
}

// Display na karcie:
// "140-160 PLN/h"
//
// Display w filtrze:
// Range slider: 80 ────●────150 (visual representation)
// Tekstowo: "PLN/h: 80 - 250"
```

### 6.5 Obsługa Klienta Anonimowego

```typescript
function getClientDisplay(project: Project): string {
  if (project.clientIsAnonymous) {
    // Anonimowo
    return project.clientAnonymousDescription || "Poufny klient";
  } else {
    // Branded
    return project.clientName || "Klient";
  }
}

// Example:
// project.clientIsAnonymous = true
// project.clientAnonymousDescription = "Duży bank z sektora finansowego"
// → Display: "Duży bank z sektora finansowego"
```

### 6.6 Alert: 90 dni do końca umowy

```typescript
function calculateDaysUntilContractEnd(contractEndDate: Date): number {
  const today = new Date();
  const diffTime = new Date(contractEndDate).getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function shouldShowContractAlert(consultant: Consultant): boolean {
  if (!consultant.contractEndDate) return false;

  const daysLeft = calculateDaysUntilContractEnd(consultant.contractEndDate);
  return daysLeft > 0 && daysLeft <= 90; // 0-90 days
}

function getRecommendedProjects(
  consultant: Consultant,
  allProjects: Project[]
): Project[] {
  // Filtruj projekty z matching score > 70%
  return allProjects
    .filter(p => isProjectVisibleToConsultant(p, consultant))
    .map(p => ({
      project: p,
      score: calculateMatchingScore(p, consultant)
    }))
    .filter(({ score }) => score.total > 70)
    .sort((a, b) => b.score.total - a.score.total)
    .map(({ project }) => project);
}
```

### 6.7 Push Notification - nowy projekt

```typescript
// Trigger: Gdy DL publikuje nowy projekt ze status OPEN

async function notifyConsultantsAboutNewProject(project: Project) {
  // Pobierz wszystkich konsultantów, którzy:
  // 1. Mają notifyNewProjects = true
  // 2. Matching score > notifyMatchingThreshold

  const consultants = await supabase
    .from('consultants')
    .select('*')
    .eq('notify_new_projects', true);

  for (const consultant of consultants.data) {
    const score = calculateMatchingScore(project, consultant);

    if (score.total >= consultant.notifyMatchingThreshold) {
      const isVisible = isProjectVisibleToConsultant(project, consultant);
      if (!isVisible) continue;

      // Send push notification
      await sendPushNotification(consultant.id, {
        title: 'Nowy projekt pasujący do Twojego profilu!',
        body: `${project.title} (${score.total}% match)`,
        action_url: `/marketplace/projects/${project.id}`
      });
    }
  }
}
```

---

## 7. Internacjonalizacja (i18n)

### 7.1 Klucze tłumaczeń

```json
{
  "marketplace": {
    "title": {
      "pl": "Marketplace Projektów",
      "en": "Project Marketplace"
    },
    "tabs": {
      "open": {
        "pl": "Dostępne teraz",
        "en": "Available Now"
      },
      "pipeline": {
        "pl": "W planach",
        "en": "Coming Soon"
      },
      "myApplications": {
        "pl": "Moje zgłoszenia",
        "en": "My Applications"
      }
    },
    "filters": {
      "title": {
        "pl": "Filtry",
        "en": "Filters"
      },
      "technologies": {
        "pl": "Technologie",
        "en": "Technologies"
      },
      "rate": {
        "pl": "Rate (PLN/h)",
        "en": "Rate (PLN/h)"
      },
      "workMode": {
        "pl": "Forma pracy",
        "en": "Work Mode"
      },
      "industry": {
        "pl": "Branża klienta",
        "en": "Client Industry"
      },
      "clearAll": {
        "pl": "Wyczyść filtry",
        "en": "Clear Filters"
      },
      "apply": {
        "pl": "Zastosuj",
        "en": "Apply"
      }
    },
    "card": {
      "matching": {
        "pl": "Dopasowanie",
        "en": "Match"
      },
      "exclusive": {
        "pl": "Exclusive",
        "en": "Exclusive"
      },
      "interested": {
        "pl": "Zgłoś się",
        "en": "Apply"
      },
      "pending": {
        "pl": "Oczekiwanie",
        "en": "Pending"
      },
      "cancel": {
        "pl": "Anuluj",
        "en": "Cancel"
      },
      "remote": {
        "pl": "Zdalnie",
        "en": "Remote"
      },
      "hybrid": {
        "pl": "Hybrydowo",
        "en": "Hybrid"
      },
      "onsite": {
        "pl": "Stacjonarnie",
        "en": "Onsite"
      }
    },
    "detail": {
      "matchingBreakdown": {
        "pl": "Rozkład dopasowania",
        "en": "Matching Breakdown"
      },
      "technologies": {
        "pl": "Technologie",
        "en": "Technologies"
      },
      "experience": {
        "pl": "Doświadczenie",
        "en": "Experience"
      },
      "location": {
        "pl": "Lokalizacja",
        "en": "Location"
      },
      "description": {
        "pl": "Opis",
        "en": "Description"
      },
      "requirements": {
        "pl": "Wymagania",
        "en": "Requirements"
      },
      "benefits": {
        "pl": "Benefity",
        "en": "Benefits"
      },
      "contact": {
        "pl": "Kontakt",
        "en": "Contact"
      },
      "deliveryLead": {
        "pl": "Delivery Lead",
        "en": "Delivery Lead"
      }
    },
    "alert": {
      "contractEnding": {
        "pl": "Twoja umowa kończy się za 90 dni",
        "en": "Your contract ends in 90 days"
      },
      "seeMatchedProjects": {
        "pl": "Zobacz pasujące projekty",
        "en": "See matched projects"
      }
    },
    "myApplications": {
      "title": {
        "pl": "Moje zgłoszenia",
        "en": "My Applications"
      },
      "noApplications": {
        "pl": "Brak zgłoszeń. Zacznij od listy projektów!",
        "en": "No applications yet. Start with the project list!"
      },
      "status": {
        "pending": {
          "pl": "Oczekiwanie",
          "en": "Pending"
        },
        "accepted": {
          "pl": "Zaakceptowana",
          "en": "Accepted"
        },
        "rejected": {
          "pl": "Odrzucona",
          "en": "Rejected"
        },
        "withdrawn": {
          "pl": "Wycofana",
          "en": "Withdrawn"
        }
      },
      "appliedDate": {
        "pl": "Zgłoszono",
        "en": "Applied"
      },
      "rejectionReason": {
        "pl": "Powód odrzucenia",
        "en": "Rejection Reason"
      }
    }
  }
}
```

---

## 8. Scenariusze Testowe

### 8.1 Smoke Tests (~10 minut)

1. **ST-M2-001:** Zaloguj się jako konsultant, otwórz Marketplace Projektów
   - ✓ Strona ładuje się poprawnie
   - ✓ Lista projektów wyświetla się
   - ✓ Widoczna jest zakładka "Dostępne teraz" i "W planach"

2. **ST-M2-002:** Kliknij na projekt, sprawdź widok szczegółów
   - ✓ Szczegóły projektu ładują się
   - ✓ Matching score jest wyświetlony
   - ✓ Przycisk "Zgłoś się" jest widoczny

3. **ST-M2-003:** Kliknij "Zgłoś się"
   - ✓ Status zmienia się na "Oczekiwanie"
   - ✓ Toast notification pojawia się
   - ✓ Przycisk zmienia się na "Anuluj"

4. **ST-M2-004:** Przejdź do "Moje zgłoszenia"
   - ✓ Zgłoszenie pojawia się na liście
   - ✓ Status to "Oczekiwanie"

5. **ST-M2-005:** Filtruj po technologiach (np. React)
   - ✓ Lista filtruje się w real-time
   - ✓ Wyświetlane są tylko projekty z React

### 8.2 Business Scenarios (~8 scenariuszy, 30 minut)

**BS-M2-001:** Konsultant z Bronze status próbuje zobaczyć exclusive project (Gold+)
- Setup: Consultant_A (Bronze), Project_X (exclusive=true, tier=gold)
- Steps:
  1. Zaloguj się jako Consultant_A
  2. Otwórz Marketplace
  3. Szukaj Project_X (widoczny na liście, ale z lock ikoną)
- Expected:
  - ✓ Projekt widoczny z badge "✨ Exclusive" + 🔒 lock
  - ✓ Karta nieklikalnym (disabled state)
  - ✓ Link do upgrade: "Upgrade do Gold aby zobaczyć"

**BS-M2-002:** Consultant z Gold status widzi exclusive project
- Setup: Consultant_B (Gold), Project_X (exclusive=gold)
- Steps:
  1. Zaloguj się jako Consultant_B
  2. Otwórz Marketplace
  3. Kliknij Project_X
- Expected:
  - ✓ Projekt całkowicie widoczny
  - ✓ Badge "✨ Exclusive" (bez lock)
  - ✓ Przycisk "Zgłoś się" aktywny

**BS-M2-003:** Matching score se Calculate correctly
- Setup: Consultant_C (React 5lat, prefers remote), Project_Y (React+Node, Remote)
- Expected:
  - ✓ Matching score ~85% (React 100%, experience 90%, location 100% → 95% weighted)
  - ✓ Breakdown wyświetla prawidłowe wartości

**BS-M2-004:** Contract ending alert dla consultant
- Setup: Consultant_D (contract_end_date = TODAY + 60 days)
- Steps:
  1. Zaloguj się
  2. Otwórz Marketplace
- Expected:
  - ✓ Alert wyświetla się: "Twoja umowa kończy się za 60 dni"
  - ✓ Link "Zobacz pasujące projekty" → filtruje projekty z >70% match

**BS-M2-005:** Delivery Lead publikuje projekt
- Setup: DL account, form do publikacji
- Steps:
  1. Zaloguj się jako DL
  2. Kliknij "Nowy projekt"
  3. Wypełnij form (title, desc, techs, rate, location, client)
  4. Wybierz status "OPEN" (dostępny natychmiast)
  5. Publikuj
- Expected:
  - ✓ Projekt pojawia się w liście konsultantów
  - ✓ Push notifications wysyłane do matching consultants

**BS-M2-006:** Consultant anuluje zgłoszenie
- Setup: Consultant_E (pending application)
- Steps:
  1. Otwórz "Moje zgłoszenia"
  2. Kliknij "Anuluj"
  3. Potwierdzenie
- Expected:
  - ✓ Status zmienia się na "Wycofana"
  - ✓ Przycisk zmienia się na "Zgłoś się ponownie"

**BS-M2-007:** Delivery Lead akceptuje aplikację
- Setup: DL, Consultant_F (pending application do Project_Z)
- Steps:
  1. DL otwiera panel aplikacji
  2. Widzi Consultant_F z 85% matching score
  3. Klika "Zaakceptuj"
- Expected:
  - ✓ Status zmienia się na "Zaakceptowana"
  - ✓ Consultant_F otrzymuje notyfikację
  - ✓ Status u konsultanta zmienia się na "Zaakceptowana ✓"

**BS-M2-008:** Filtrowanie kombinowane (multiple filters)
- Setup: 20 projektów, varias technologies/rates/work modes
- Steps:
  1. Otwórz filtry
  2. Zaznacz: React, Node.js (technologies)
  3. Rate: 120-160 PLN/h
  4. Work mode: Remote
  5. Apply
- Expected:
  - ✓ Lista filtruje się do projektów spełniających WSZYSTKIE kryteria
  - ✓ Liczba wyników zmienia się w real-time

### 8.3 Integration Tests

**IT-M2-001:** Push notifications przy publikacji projektu
- Trigger: DL publikuje Project_NEW
- Check: Konsultanci z matching >75% otrzymują push notif

**IT-M2-002:** Matching score recalculates przy zmianie profilu
- Trigger: Konsultant dodaje nową technologię do profilu
- Check: Matching scores dla wszystkich projektów przeliczane

**IT-M2-003:** Contract alert wyłącza się po akceptacji projektu
- Trigger: Consultant_G (90-day alert) zostaje zaakceptowany do projektu
- Check: Alert nie wyświetla się (contract renewed)

---

## 9. Dane Testowe

### 9.1 SQL INSERTs - Projekty

```sql
-- Najpierw wstaw konsultantów (z M1)
INSERT INTO consultants (id, name, email, technologies, years_of_experience,
  preferred_work_modes, preferred_location, subscription_tier, contract_end_date)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Jan Kowalski',
   'jan@example.com', '{"React","Node.js","TypeScript"}', 5,
   '{"remote","hybrid"}', 'Warsaw', 'gold', '2026-05-15'),
  ('22222222-2222-2222-2222-222222222222', 'Maria Nowak',
   'maria@example.com', '{"C#",".NET","SQL Server"}', 7,
   '{"hybrid","onsite"}', 'Warsaw', 'bronze', '2026-04-20');

-- Project 1: OPEN, Exclusive (Gold), React Expert
INSERT INTO projects (
  title, slug, description, requirements, benefits,
  client_name, client_is_anonymous, client_industry,
  rate_min, rate_max, location, work_modes,
  required_technologies, nice_to_have_technologies,
  status, is_exclusive, exclusive_tier, available_at,
  created_by_delivery_lead_id
) VALUES (
  'React Expert - E-commerce Platform',
  'react-expert-ecommerce',
  'Szukamy doświadczonego React developera do projektu e-commerce.
   Będziesz pracować nad frontend aplikacji dla jednego z największych
   sklepów internetowych. Zespół: 4 frontend devs, 2 backend devs, 1 product owner.
   Projekt: 6 miesięcy, praca w agile (2-week sprints).',
  '{"3+ years React experience","TypeScript","Testing (Jest)","Git","REST APIs","Responsive design"}',
  '{"Flexible hours","Career growth","Performance bonuses","Health insurance"}',
  'Duża platforma e-commerce', false, 'E-commerce',
  140, 160, 'Warsaw / Remote', '{"remote","hybrid"}',
  '{"React","Node.js","TypeScript","Jest"}', '{"GraphQL","Docker"}',
  'OPEN', true, 'gold', NOW(),
  '99999999-9999-9999-9999-999999999999'
);

-- Project 2: OPEN, Anonymous client, C# Backend
INSERT INTO projects (
  title, slug, description, requirements, benefits,
  client_name, client_is_anonymous, client_anonymous_description, client_industry,
  rate_min, rate_max, location, work_modes,
  required_technologies, nice_to_have_technologies,
  status, is_exclusive, exclusive_tier, available_at,
  created_by_delivery_lead_id
) VALUES (
  'C# Backend Developer - Financial System',
  'csharp-backend-finance',
  'Nowa inicjatywa w czołowym banku finansowym. Budujemy system do zarządzania
   portfelem klienta. Backend: microservices w C#/.NET. Wysoki standard code review.
   Zespół: 8 backend devs, 2 DevOps, QA team.',
  '{"5+ years C# and .NET","SQL Server or PostgreSQL","Microservices","SOLID principles","Unit testing"}',
  '{"Competitive salary","Remote-first policy","Stock options","Learning budget"}',
  NULL, true, 'Duży bank z sektora finansowego', 'Finance',
  130, 150, 'Remote', '{"remote"}',
  '{"C#",".NET","SQL Server","Docker"}', '{"Kubernetes","Azure"}',
  'OPEN', false, NULL, NOW(),
  '99999999-9999-9999-9999-999999999999'
);

-- Project 3: PIPELINE (available in 2 months), Full Stack
INSERT INTO projects (
  title, slug, description, requirements, benefits,
  client_name, client_is_anonymous, client_industry,
  rate_min, rate_max, location, work_modes,
  required_technologies, nice_to_have_technologies,
  status, is_exclusive, exclusive_tier, available_at, pipeline_date,
  created_by_delivery_lead_id
) VALUES (
  'Full Stack Developer - SaaS Platform',
  'fullstack-saas-startup',
  'Startup w fazie scale-up szuka full-stack developera.
   Frontend: React, Backend: Node.js. Będziesz 1 z 2 devs w zespole,
   dużo autonomii i wzrostu. Możliwe equity participation.',
  '{"3+ years React","2+ years Node.js","JavaScript/TypeScript","PostgreSQL","AWS"}',
  '{"Equity participation","Remote-first","Flexible hours","Product ownership"}',
  'Startup Tech', false, 'Technology',
  100, 120, 'Remote', '{"remote"}',
  '{"React","Node.js","JavaScript","PostgreSQL"}', '{"TypeScript","Docker","GraphQL"}',
  'PIPELINE', false, NULL, NOW(), NOW() + INTERVAL '60 days',
  '99999999-9999-9999-9999-999999999999'
);

-- Project 4: OPEN, Exclusive (Platinum), DevOps Engineer
INSERT INTO projects (
  title, slug, description, requirements, benefits,
  client_name, client_is_anonymous, client_industry,
  rate_min, rate_max, location, work_modes,
  required_technologies, nice_to_have_technologies,
  status, is_exclusive, exclusive_tier, available_at,
  created_by_delivery_lead_id
) VALUES (
  'Senior DevOps Engineer - Infrastructure Lead',
  'devops-infrastructure-lead',
  'Szukamy seniora do wdrażania i zarządzania infrastrukturą cloud.
   Praca z Kubernetes, CI/CD pipelines, monitoring. Leader technical w zespole 5-osobowym.',
  '{"5+ years DevOps","Kubernetes production experience","AWS or GCP","CI/CD","Terraform","Linux"}',
  '{"High salary","Lead role","Conference budget","Remote-first","Stock options"}',
  'Global SaaS Company', false, 'Technology',
  160, 200, 'Remote', '{"remote"}',
  '{"Kubernetes","Docker","AWS","Terraform","Jenkins"}', '{"ArgoCD","Helm","Prometheus"}',
  'OPEN', true, 'platinum', NOW(),
  '99999999-9999-9999-9999-999999999999'
);

-- Project 5: OPEN, No special status, Python Data Scientist
INSERT INTO projects (
  title, slug, description, requirements, benefits,
  client_name, client_is_anonymous, client_industry,
  rate_min, rate_max, location, work_modes,
  required_technologies, nice_to_have_technologies,
  status, is_exclusive, exclusive_tier, available_at,
  created_by_delivery_lead_id
) VALUES (
  'Python Data Scientist - ML Models',
  'python-data-scientist-ml',
  'Zespół data science szuka expert data scientist do budowy ML models.
   Focus: predictive analytics, data pipeline optimization, model deployment.',
  '{"3+ years Python","Machine Learning frameworks","SQL","Statistics","Model evaluation"}',
  '{"Learning opportunities","Remote","Flexible hours","Data computing budget"}',
  'Insurance Company', false, 'Finance',
  120, 140, 'Hybrid', '{"hybrid","remote"}',
  '{"Python","Machine Learning","TensorFlow","SQL","Pandas"}', '{"PyTorch","Kubernetes"}',
  'OPEN', false, NULL, NOW(),
  '99999999-9999-9999-9999-999999999999'
);

-- Project 6: OPEN, OnSite, Java Developer
INSERT INTO projects (
  title, slug, description, requirements, benefits,
  client_name, client_is_anonymous, client_industry,
  rate_min, rate_max, location, work_modes,
  required_technologies, nice_to_have_technologies,
  status, is_exclusive, exclusive_tier, available_at,
  created_by_delivery_lead_id
) VALUES (
  'Java Senior Developer - Banking System',
  'java-banking-system',
  'Duży bank szuka seniora Java do systemu obsługi kredytów.
   Legacy system modernization. Strict code standards, high security requirements.',
  '{"7+ years Java","Spring Boot","Microservices","Oracle or PostgreSQL","Security"}',
  '{"High salary","On-site Warsaw office","Team collaboration","Pension plan"}',
  'Major Bank', false, 'Finance',
  150, 170, 'Warsaw', '{"onsite"}',
  '{"Java","Spring Boot","Oracle","Microservices"}', '{"Kotlin","Docker","Kubernetes"}',
  'OPEN', false, NULL, NOW(),
  '99999999-9999-9999-9999-999999999999'
);

-- Project 7: PIPELINE, Mobile Developer
INSERT INTO projects (
  title, slug, description, requirements, benefits,
  client_name, client_is_anonymous, client_industry,
  rate_min, rate_max, location, work_modes,
  required_technologies, nice_to_have_technologies,
  status, is_exclusive, exclusive_tier, available_at, pipeline_date,
  created_by_delivery_lead_id
) VALUES (
  'iOS Developer - Mobile App',
  'ios-mobile-app-dev',
  'Startup mobile-first szuka iOS developera. Budowanie nowej aplikacji mobilnej.
   SwiftUI, modern iOS development. Możliwość kształtowania kierunku produktu.',
  '{"3+ years iOS development","SwiftUI or UIKit","Swift","REST APIs"}',
  '{"Startup culture","Equity","Remote","Product impact"}',
  'Mobile Startup', false, 'Technology',
  110, 130, 'Remote', '{"remote"}',
  '{"Swift","SwiftUI","iOS"}', '{"Objective-C","TestFlight","Firebase"}',
  'PIPELINE', false, NULL, NOW(), NOW() + INTERVAL '90 days',
  '99999999-9999-9999-9999-999999999999'
);

-- Project 8: OPEN, Azure/Cloud specialist
INSERT INTO projects (
  title, slug, description, requirements, benefits,
  client_name, client_is_anonymous, client_industry,
  rate_min, rate_max, location, work_modes,
  required_technologies, nice_to_have_technologies,
  status, is_exclusive, exclusive_tier, available_at,
  created_by_delivery_lead_id
) VALUES (
  'Azure Cloud Solutions Architect',
  'azure-cloud-solutions',
  'Szukamy Azure specjalisty do wdrażania cloud solutions dla enterprise clients.
   Migration projects, infrastructure design, optimization. Lead role.',
  '{"5+ years cloud experience","Azure certifications","Infrastructure as Code","Security","Cost optimization"}',
  '{"High rate","Senior title","Flexible work","Professional development"}',
  'Cloud Solutions Provider', false, 'Technology',
  170, 200, 'Hybrid', '{"remote","hybrid"}',
  '{"Azure","Terraform","PowerShell","ARM templates"}', '{"Bicep","Kubernetes"}',
  'OPEN', false, NULL, NOW(),
  '99999999-9999-9999-9999-999999999999'
);
```

---

## 10. Przypadki Brzegowe (Edge Cases)

### 10.1 EC-M2-001: Brak projektów pasujących do filtrów
- Setup: Konsultant szuka "Go + Rate 200+ PLN/h"
- Expected:
  - ✓ Pusta lista
  - ✓ Wiadomość: "Brak projektów spełniających kryteria. Spróbuj zmienić filtry."
  - ✓ Link do "Reset filters"

### 10.2 EC-M2-002: Matching score = 0%
- Setup: Konsultant bez żadnych technologii w profilu
- Expected:
  - ✓ Badge wyświetla 0% (szary kolor)
  - ✓ Projekt widoczny (brak blokady), ale z ostrzeżeniem
  - ✓ Wiadomość: "Projekt nie pasuje do Twojego profilu. Rozważ uzupełnienie profilu."

### 10.3 EC-M2-003: Projekt EXPIRED (zaplanowany na przeszłość)
- Setup: Project_X ma pipeline_date = YESTERDAY
- Expected:
  - ✓ Projekt NIE wyświetla się na liście
  - ✓ Jeśli był zaaplikowany, widoczny w "Moje zgłoszenia" z info: "Projekt zakończył się"

### 10.4 EC-M2-004: Konsultant bez profilu technologii
- Setup: Nowy konsultant, technologies = []
- Expected:
  - ✓ Matching score dla wszystkich projektów = 0%
  - ✓ Alert w marketplace: "Uzupełnij swój profil, aby widzieć dopasowane projekty"

### 10.5 EC-M2-005: Exclusive project dla Bronze user
- Setup: Consultant_X (Bronze), Project_Y (exclusive=true, tier=gold)
- Expected:
  - ✓ Projekt widoczny z lock ikoną
  - ✓ Nie można kliknąć na kartę
  - ✓ Link: "Upgrade do Gold ($50/miesiąc)"

### 10.6 EC-M2-006: Multiple applications na ten sam projekt
- Setup: Consultant_A już ma status ACCEPTED na Project_X, próbuje apply ponownie
- Expected:
  - ✓ System blokuje duplikaty (UNIQUE constraint)
  - ✓ Wiadomość: "Już się zgłosiłeś na ten projekt"

### 10.7 EC-M2-007: Contract ending soon, ale brak pasujących projektów
- Setup: Consultant_B (contract kończy się za 60 dni), żaden projekt nie ma >70% match
- Expected:
  - ✓ Alert wyświetla się: "Twoja umowa kończy się za 60 dni"
  - ✓ Ale brak listy projektów
  - ✓ Wiadomość: "Brak projektów pasujących do Twojego profilu. Skontaktuj się z Delivery Lead."

### 10.8 EC-M2-008: Consultant wycofuje aplikację, potem próbuje apply ponownie
- Setup: Consultant_C (withdrawn), kliknięcie na projekt
- Expected:
  - ✓ Button zmienia się na "Zgłoś się ponownie"
  - ✓ Nowa aplikacja tworzy się jako odrębny record
  - ✓ Stare (withdrawn) jest archiwizowane

---

## 11. Metryki Sukcesu

### 11.1 Key Success Indicators (KSIs)

| Metrika | Target | Wymiar |
|---------|--------|--------|
| **Application Rate** | 5+ aplikacji/miesiąc/consultant | 📊 Engagement |
| **Matching Accuracy** | >80% consultants satisfied with match | ✓ Quality |
| **Time-to-Placement** | <1 tydzień (vs. 2-3 tygodnie current) | ⏱ Efficiency |
| **Exclusive Conversion** | 25% Bronze → Gold/Platinum | 💰 Revenue |
| **Alert CTR** | 40%+ click-through na 90-day alert | 📱 Retention |
| **Push Notif Engagement** | 60%+ open rate | 📲 Reach |
| **Daily Active Users** | 65%+ consultants visit 1x/week | 📈 Usage |
| **Average Session Duration** | 5+ minutes | ⏱ Stickiness |

### 11.2 Tracking

```typescript
// Events do trackowania (Analytics)

// Event: Consultant views project list
analytics.track('marketplace_project_list_viewed', {
  timestamp: new Date(),
  consultant_id: currentUser.id,
  open_count: visibleProjects.length,
  pipeline_count: pipelineProjects.length
});

// Event: Consultant applies to project
analytics.track('marketplace_application_submitted', {
  timestamp: new Date(),
  consultant_id: currentUser.id,
  project_id: project.id,
  matching_score: matchingScore.total
});

// Event: Application accepted by DL
analytics.track('marketplace_application_accepted', {
  timestamp: new Date(),
  consultant_id: consultantId,
  project_id: projectId,
  reviewed_by_delivery_lead_id: dlId,
  days_to_review: daysBetween(createdAt, now())
});

// Event: Consultant upgrades to Gold/Platinum
analytics.track('marketplace_subscription_upgraded', {
  timestamp: new Date(),
  consultant_id: currentUser.id,
  from_tier: oldTier,
  to_tier: newTier,
  trigger: 'exclusive_project_viewed' // or manual
});

// Event: Contract ending alert shown
analytics.track('marketplace_contract_ending_alert_shown', {
  timestamp: new Date(),
  consultant_id: currentUser.id,
  days_until_end: daysLeft,
  matching_projects_count: recommendedProjects.length
});
```

---

## 12. PROMPT DLA AI BUILDERA - Antygrivity/Bolt

**KRYTYCZNE:** Poniższy prompt jest gotowy do wklejenia bezpośrednio do Antygrivity/Bolt. Zawiera WSZYSTKIE detale potrzebne do zbudowania modułu bez dodatkowych pytań.

```
===== PROMPT START =====

PROJEKT: Qualrix - M2 Marketplace Projektów (Internal Job Board)
KOMPANIA: B2B.net S.A. (IT Outsourcing, 500+ consultants)
DATA: 2026-02-08

=== OVERVIEW ===

Buduj moduł M2: Marketplace Projektów dla aplikacji Qualrix (Next.js 14 + Supabase + TypeScript + Tailwind + shadcn/ui).

To jest KLUCZOWY moduł retencji - konsultanci muszą widzieć pipeline przyszłych projektów, aby nie bali się końca umowy.

=== FUNKCJONALNOŚĆ ===

M2 zawiera:
1. LISTA PROJEKTÓW: Dwie zakładki - "Dostępne teraz" (status OPEN) i "W planach" (status PIPELINE)
2. KARTY PROJEKTÓW: Każda karta pokazuje: klienta, technologie, rate range (PLN/h), work mode (ikony), matching score (%)
3. MATCHING SCORE: Automatyczne obliczanie 0-100%, z breakdown: technologie (50%), doświadczenie (30%), lokalizacja (20%)
4. FILTRY: Technologie (multi-select), Rate (range slider 80-250 PLN/h), Work mode (checkboxes), Branża (multi-select)
5. SZCZEGÓŁY PROJEKTU: Full view ze wszystkimi danymi, matching breakdown, przycisk "Zgłoś się"
6. MOJE ZGŁOSZENIA: Historia aplikacji konsultanta ze statusami (oczekiwanie/zaakceptowana/odrzucona/wycofana)
7. EXCLUSIVE PROJECTS: Viditelne tylko dla Gold/Platinum subscriptions (Bronze users widzą lock)
8. ALERT 90 DNI: Jeśli umowa kończy się za ≤90 dni, alert z rekomendacją projektów
9. PUSH NOTIF: Nowy projekt pasujący do profilu (match >75%) wysyła notifikację

=== WYMOGI TECHNICZNE ===

Stack:
- Next.js 14+ (App Router)
- Supabase (PostgreSQL)
- TypeScript (strict mode)
- Tailwind CSS + shadcn/ui
- next-intl (PL + EN)
- Zustand (state management)

Baza danych (tables):
- projects: id, title, slug, description, requirements[], benefits[], client_name, client_is_anonymous, client_industry, rate_min, rate_max, location, work_modes[], required_technologies[], nice_to_have_technologies[], status (DRAFT/OPEN/PIPELINE/ARCHIVED), is_exclusive, exclusive_tier (gold/platinum), available_at, pipeline_date, created_at, updated_at
- project_applications: id, project_id, consultant_id, status (pending/accepted/rejected/withdrawn), matching_score_total, matching_score_technologies, matching_score_experience, matching_score_location, rejection_reason, created_at, updated_at, reviewed_at, reviewed_by_delivery_lead_id
- consultants: id, email, name, technologies[], years_of_experience, preferred_work_modes[], preferred_location, preferred_industries[], contract_end_date, notify_new_projects, notify_matching_threshold, subscription_tier (bronze/gold/platinum), total_applications, total_accepted, profile_completion_percentage

=== MATCHING SCORE ALGORITHM ===

function calculateMatchingScore(project, consultant) {
  // 1. TECHNOLOGIES (50% weight)
  const requiredTechs = project.required_technologies.map(t => t.toLowerCase());
  const consultantTechs = consultant.technologies.map(t => t.toLowerCase());
  const matchedTechs = requiredTechs.filter(t => consultantTechs.includes(t));
  let techScore = (matchedTechs.length / requiredTechs.length) * 100;

  // Bonus za nice-to-have: +5 każda (max +20)
  const niceMatches = project.nice_to_have_technologies.filter(
    t => consultantTechs.includes(t.toLowerCase())
  ).length;
  techScore = Math.min(techScore + (niceMatches * 5), 100);

  // 2. EXPERIENCE (30% weight)
  const projectImpliedYears = Math.ceil(requiredTechs.length * 1.5);
  const yearsRatio = Math.min(consultant.years_of_experience / projectImpliedYears, 1.0);
  const experienceScore = yearsRatio * 100;

  // 3. LOCATION (20% weight)
  let locationScore = 0;
  if (consultant.preferred_work_modes.includes('remote')) {
    locationScore = 100;
  } else if (project.work_modes.includes('remote') && consultant.preferred_work_modes.includes('remote')) {
    locationScore = 100;
  } else if (project.location.toLowerCase().includes(consultant.preferred_location?.toLowerCase())) {
    locationScore = 90;
  } else if (consultant.preferred_work_modes.includes('hybrid')) {
    locationScore = 60;
  }

  // Weighted total
  const total = (techScore * 0.5) + (experienceScore * 0.3) + (locationScore * 0.2);

  return {
    total: Math.round(total),
    technologies: Math.round(techScore),
    experience: Math.round(experienceScore),
    location: Math.round(locationScore)
  };
}

=== VISIBILITY RULES ===

Projekt widoczny dla konsultanta TYLKO jeśli:
1. Status = OPEN lub PIPELINE
2. Jeśli is_exclusive: consultant.subscription_tier musi być >= exclusive_tier
3. Jeśli PIPELINE: pipeline_date musi być w przyszłości (lub równe dzisiaj)

=== LAYOUT - MOBILE FIRST ===

MOBILE (default):
- Full-width karty projektów
- Filtry w bottom sheet (button "Filtry" fixed bottom)
- Matching score badge top-left na karcie (%) z kolorem (zielony >80, żółty 50-80, szary <50)
- Touch-friendly: buttony min 44px, spacing 16px
- Zakładki OPEN/PIPELINE na topie (sticky)

DESKTOP (1024+):
- Sidebar (300px) z filtrami po lewej (zawsze widoczne)
- Grid/list projektów po prawej (3-kolumny na 1440px, 2-kolumny na 1024px)
- Matching score badge top-left
- Exclusive badge top-right z lock ikoną (dla Bronze users)

=== PROJECT CARD STRUKTURA ===

┌────────────────────────────────┐
│ 🎯 85%  [✨ Exclusive]        │ (badges top)
│ React Expert                   │ (title)
│ Duży e-commerce (anonimo)      │ (client)
│ 140-160 PLN/h                  │ (rate)
│ 🌍 Remote · 🏢 Hybrid         │ (work modes as icons)
│ React · Node.js · TypeScript   │ (tech tags)
│ [Zgłoś się]                    │ (button, or "Oczekiwanie" / "Anuluj")
└────────────────────────────────┘

Matching badge colors:
- >80%: bg-green-500, text-white
- 50-80%: bg-yellow-500, text-white
- <50%: bg-gray-400, text-white

Exclusive badge:
- visible && !access: gray lock 🔒 + "Exclusive"
- visible && access: gold star ✨ + "Exclusive"

=== PROJECT DETAIL VIEW ===

Sections (v order od top do bottom):
1. Header: [← Back] [Title] [Share icon]
2. Matching Score Section:
   - "Matching Score: 85%"
   - Breakdown: "Technologie 50% | Doświadczenie 30% | Lokalizacja 20%"
   - Visual progress bars dla każdej kategorii
3. Key Info (card):
   - Klient: "Duży e-commerce" (or anonimowy opis)
   - Rate: "140-160 PLN/h"
   - Work Mode: "🌍 Remote" (or icons)
   - Lokalizacja: "Warsaw / Remote"
   - Technologie: React, Node.js, TypeScript, Docker
   - Branża: "E-commerce"
   - Status dostępu: "Dostępny teraz" or "Dostępny za 60 dni"
4. Description (wyświetl full text, max 500 słów)
5. Requirements (UL list)
6. Benefits (UL list)
7. Kontakt: Delivery Lead name + email
8. Przycisk CTA bottom: "Zgłoś się" (or "Anuluj zgłoszenie" if pending)

=== MOJE ZGŁOSZENIA VIEW ===

Tabel/list View:
- Kolumny: Projekt | Klient | Status | Data zgłoszenia | Akcje
- Status badges z kolorami:
  - pending: żółty "Oczekiwanie" ⏳
  - accepted: zielony "Zaakceptowana" ✓
  - rejected: czerwony "Odrzucona" ✗
  - withdrawn: szary "Wycofana" ↩
- Filter po statusie (optional)
- Sortowanie: najnowsze pierwsze
- Empty state: "Brak zgłoszeń. Zacznij od listy projektów!"

=== FILTERING LOGIC ===

Live filtering (real-time update):
- Technologies: multi-select, OR logic (pokaż projekty z DOWOLNYM zaznaczonym)
- Rate: range slider, AND logic (min AND max)
- Work mode: multi-select, OR logic
- Branża: multi-select, OR logic

Filter state persistence:
- Przechowuj w URL query params (dla shareable links)
- I w localStorage (dla powrotu do ostatnich filtrów)
- Button "Wyczyść filtry" resetu wszystko

=== ALERT 90 DAYS ===

Trigger: Jeśli consultant.contract_end_date <= TODAY + 90 days i > TODAY
Display:
- Toast notification at top (lub banner)
- Title: "Twoja umowa kończy się za {daysLeft} dni"
- Link: "Zobacz pasujące projekty" → filtruje projekty z matching_score > 70%
- Possible to dismiss (nie pokaż na 7 dni or until contract renewed)

=== PUSH NOTIFICATIONS ===

Setup:
- Use Supabase Functions / Edge Functions do send push notifications
- Or trigger from server-side actions

When to send:
- Nowy projekt opublikowany (status OPEN)
- Jeśli matching_score > consultant.notify_matching_threshold (default 75)
- Jeśli consultant.notify_new_projects = true
- Jeśli projekt jest visible to consultant (nie exclusive lub consultant has access)

Notification content:
- Title: "Nowy projekt pasujący do Twojego profilu!"
- Body: "{project.title} ({matchingScore}% match)"
- Action URL: "/marketplace/projects/{project.id}"

=== INTERNATIONALIZATION (i18n) ===

Use next-intl setup (PL + EN).

Kluczowe stringi do tłumaczenia:
- "Marketplace Projektów" / "Project Marketplace"
- "Dostępne teraz" / "Available Now"
- "W planach" / "Coming Soon"
- "Moje zgłoszenia" / "My Applications"
- "Filtry" / "Filters"
- "Technologie" / "Technologies"
- "Rate (PLN/h)" / "Rate (PLN/h)"
- "Forma pracy" / "Work Mode"
- "Branża klienta" / "Client Industry"
- "Zgłoś się" / "Apply"
- "Oczekiwanie" / "Pending"
- "Zaakceptowana" / "Accepted"
- "Odrzucona" / "Rejected"
- "Wycofana" / "Withdrawn"
- "Zdalnie" / "Remote"
- "Hybrydowo" / "Hybrid"
- "Stacjonarnie" / "Onsite"
- "Exclusive" / "Exclusive"
- "Rozkład dopasowania" / "Matching Breakdown"
- "Doświadczenie" / "Experience"
- "Lokalizacja" / "Location"
- "Wymagania" / "Requirements"
- "Benefity" / "Benefits"
- "Twoja umowa kończy się za 90 dni" / "Your contract ends in 90 days"
- "Zobacz pasujące projekty" / "See matched projects"

=== RESPONSIVE DESIGN ===

Mobile (<640px):
- Single column layout
- Sticky top: tabs (OPEN/PIPELINE)
- Sticky bottom: "Filtry" button
- Filters in bottom sheet modal
- Full-width cards with padding

Tablet (640-1024px):
- 2-column card grid
- Filters in collapsible sidebar OR bottom sheet

Desktop (1024+px):
- 2-3 column grid
- Fixed left sidebar (300px) with filters
- Smooth filter transitions

=== SUPABASE QUERIES ===

// Get all visible projects for consultant (with matching score)
const { data: projects } = await supabase
  .from('projects')
  .select('*')
  .in('status', ['OPEN', 'PIPELINE'])
  .order('created_at', { ascending: false });

// Calculate matching for each, filter by exclusivity

// Get consultant's applications with project details
const { data: applications } = await supabase
  .from('project_applications')
  .select('*, projects(*)')
  .eq('consultant_id', currentUser.id)
  .order('created_at', { ascending: false });

// Submit application
const { data: application } = await supabase
  .from('project_applications')
  .insert({
    project_id: projectId,
    consultant_id: currentUser.id,
    status: 'pending',
    matching_score_total: matchingScore.total,
    matching_score_technologies: matchingScore.technologies,
    matching_score_experience: matchingScore.experience,
    matching_score_location: matchingScore.location,
    created_at: new Date()
  });

// Withdraw application
const { error } = await supabase
  .from('project_applications')
  .update({ status: 'withdrawn', updated_at: new Date() })
  .eq('id', applicationId);

=== STATE MANAGEMENT (Zustand) ===

Create store:
- marketplace.store.ts:
  - state: projects, filteredProjects, filters, applications, selectedProject
  - actions: setFilters, resetFilters, loadProjects, loadApplications, submitApplication, withdrawApplication

=== COMPONENTS TO BUILD ===

1. ProjectList.tsx
   - Displays grid/list of projects
   - Accepts projects[], filters, loading state
   - Handles card click → detail view

2. ProjectCard.tsx
   - Single project card
   - Props: project, matchingScore, isExclusive, applicationStatus, onInterest, onCancel
   - Shows all info: title, client, rate, work modes, techs, matching score badge

3. ProjectDetail.tsx
   - Full project view
   - Props: project, matchingScore breakdown, applicationStatus
   - Sections: description, requirements, benefits, contact info
   - Buttons: Apply / Cancel

4. FilterPanel.tsx
   - Desktop: left sidebar
   - Mobile: bottom sheet modal
   - Props: filters, onChange, onClear
   - Contains: tech multi-select, rate range slider, work modes checkboxes, industry multi-select

5. MatchingScoreBadge.tsx
   - Circular or percentage badge
   - Props: score (0-100), size, showLabel
   - Color: green >80, yellow 50-80, gray <50

6. ApplicationStatusBadge.tsx
   - Status indicator
   - Props: status (pending/accepted/rejected/withdrawn)
   - Shows: text + icon (⏳/✓/✗/↩)

7. MyApplications.tsx
   - Table/list of consultant's applications
   - Columns: Project, Client, Status, Applied Date
   - Status filtering
   - Empty state

8. ContractEndingAlert.tsx
   - Toast or banner component
   - Shows days left until contract end
   - Link to recommended projects
   - Dismiss button

=== EDGE CASES TO HANDLE ===

1. No matching projects → empty state message
2. Matching score 0% → gray badge, warning message
3. Project expired (pipeline_date in past) → don't show
4. Consultant without tech profile → all scores 0%, alert to fill profile
5. Bronze user viewing exclusive project → lock icon, no click, upgrade link
6. Double application attempt → prevent with UNIQUE constraint + error message
7. Consultant can withdraw application → status changes to withdrawn
8. DL can reject application with reason → consultant sees reason in list

=== CODE STRUCTURE ===

/app/marketplace/
  page.tsx (main page with tabs, list, filters)
  layout.tsx (marketplace layout)
  /projects/
    [projectId]/
      page.tsx (detail view)
  /my-applications/
    page.tsx (applications list)

/components/marketplace/
  ProjectList.tsx
  ProjectCard.tsx
  ProjectDetail.tsx
  FilterPanel.tsx
  MatchingScoreBadge.tsx
  ApplicationStatusBadge.tsx
  MyApplications.tsx
  ContractEndingAlert.tsx

/stores/
  marketplace.store.ts

/types/
  marketplace.types.ts

/lib/
  marketplace.utils.ts (matching calculation, visibility rules)
  supabase.ts (queries)

=== DONE ===

Kiedy skończysz, moduł powinien:
✓ Wyświetlać projekty OPEN i PIPELINE w osobnych zakładkach
✓ Pokazywać matching score (%) z breakdown
✓ Filtrować live po technologiach, rate, work mode, branży
✓ Wyświetlać szczegóły projektu w fullscreen/modal
✓ Pozwolić konsultantowi aplikować na projekt ("Zgłoś się")
✓ Pokazywać historię aplikacji w "Moje zgłoszenia"
✓ Blokować dostęp do exclusive projects dla Bronze users
✓ Wyświetlać alert jeśli kontrakt kończy się za ≤90 dni
✓ Być responsywnym (mobile-first)
✓ Być w pełni przetłumaczonym (PL + EN)
✓ Mieć state management (Zustand)
✓ Używać shadcn/ui components + Tailwind

===== PROMPT END =====
```

---

## 13. Zależności od Innych Modułów

### 13.1 Module M1: Consultant Profile

**Zależności:**
- **Read:** Konsultant's profile data (technologies, years_of_experience, preferred_work_modes, preferred_location, contract_end_date, subscription_tier)
- **Required for:** Calculating matching score, determining visibility (subscription tier), triggering 90-day alert
- **Data sync:** Jeśli user zmieni profil w M1, matching scores powinny się recalculować w M2

**Integration points:**
```typescript
// In Zustand store or component
const consultant = useConsultantStore((state) => state.consultant);
const matchingScore = calculateMatchingScore(project, consultant);
```

### 13.2 Module M3: Delivery Lead Dashboard (Future)

**Zależności:**
- M2 sends data to M3 (list of applications, consultant details, matching scores)
- M3 will provide management interface for DL (accept/reject, analytics)
- **API:** DL actions (accept/reject) trigger notifications back to M2

**Integration points:**
```typescript
// M2 listens for application updates from M3/Supabase realtime
const subscription = supabase
  .from('project_applications')
  .on('*', payload => {
    // Update application status
  })
  .subscribe();
```

### 13.3 Module M4: Notifications (Push)

**Zależności:**
- M2 triggers notifications via M4 API
- M4 handles push notification delivery (send to device)
- M4 tracks engagement (open rate, click-through)

**Integration points:**
```typescript
// When new project published or application status changes
await triggerNotification({
  recipientId: consultantId,
  type: 'PROJECT_MATCHED', // or APPLICATION_ACCEPTED
  projectId: projectId,
  title: '...',
  body: '...'
});
```

### 13.4 Module M5: Analytics & Reporting

**Zależności:**
- M2 sends events: project_viewed, application_submitted, application_accepted, contract_alert_shown
- M5 aggregates data for business metrics

**Integration points:**
```typescript
// Track events
analytics.track('marketplace_application_submitted', {
  consultant_id: currentUser.id,
  project_id: projectId,
  matching_score: score
});
```

### 13.5 Authentication (Global)

**Zależności:**
- Auth context/store: current user ID, email, role (consultant / delivery_lead)
- Row-Level Security (RLS) policies on Supabase tables

**Tables with RLS:**
- projects: visible to consultants based on status + exclusive tier
- project_applications: editable only by owner or DL

```sql
-- RLS Policy: consultants can only see their own applications
CREATE POLICY "consultants_see_own_applications"
  ON project_applications
  FOR SELECT
  USING (
    auth.uid() = consultant_id
    OR auth.uid() IN (SELECT id FROM auth.users WHERE role = 'delivery_lead')
  );
```

---

## Podsumowanie

Moduł **M2: Marketplace Projektów** jest kluczowym elementem strategii retencji zespołu Qualrix. Poprzez:

1. **Widoczność pipeline'u** - konsultanci widzą przyszłe projekty, eliminując strach przed bezrobociem
2. **Matching intelligence** - system automatycznie rekomenduje projekty pasujące do profilu
3. **Exclusive incentives** - Gold/Platinum tiers motywują upgrande subscriptions
4. **Retention alerts** - 90-day warning z rekomendacjami przechowuje talenty

Moduł jest **mobile-first**, w pełni **localized** (PL+EN), i integruje się z całym stackiem Qualrix (Supabase, next-intl, Zustand).

**Status:** Gotowy do implementacji w Antygrivity/Bolt za pomocą powyższego prompta.

---

**Koniec dokumentacji M2**

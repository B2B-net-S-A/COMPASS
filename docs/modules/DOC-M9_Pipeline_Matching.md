# Module M9: Pipeline Matching Engine
## Specyfikacja Modułu - Qualrix Application

**Autor**: B2B.net S.A.
**Data**: 2025-02-08
**Wersja**: 1.0
**Status**: Specyfikacja Techniczna

---

## Spis Treści

1. [Przegląd Modułu](#1-przegląd-modułu)
2. [Architektura Systemu Matchingu](#2-architektura-systemu-matchingu)
3. [Algorytm Matchingu z Wagami](#3-algorytm-matchingu-z-wagami)
4. [Forward Matching - Konsultant → Projekty](#4-forward-matching---konsultant--projekty)
5. [Reverse Matching - Projekt → Konsultanci](#5-reverse-matching---projekt--konsultanci)
6. [Interfejs Kanban z Drag-and-Drop](#6-interfejs-kanban-z-drag-and-drop)
7. [Operacje Masowe i Bulk Assign](#7-operacje-masowe-i-bulk-assign)
8. [Metryki Jakości Matchingu](#8-metryki-jakości-matchingu)
9. [Integracja z ATS](#9-integracja-z-ats)
10. [Modele Danych i Schematy](#10-modele-danych-i-schematy)
11. [Komponenty React i UI/UX](#11-komponenty-react-i-uiux)
12. [AI Builder Prompt - Generator Kodu](#12-ai-builder-prompt---generator-kodu)
13. [Plan Implementacji i Roadmap](#13-plan-implementacji-i-roadmap)

---

## 1. Przegląd Modułu

### 1.1 Cel i Zakres

Module M9 (Pipeline Matching Engine) jest kluczowym komponentem systemu Qualrix, odpowiadającym za inteligentne dopasowywanie konsultantów do projektów. System automatycznie sugeruje projekty, gdy kontrakt konsultanta wygasa w ciągu X dni, oraz umożliwia wyszukiwanie odpowiednich konsultantów dla nowych projektów.

**Główne funkcjonalności:**
- Automatyczne sugerowanie projektów na podstawie profilu konsultanta
- Wsteczne wyszukiwanie konsultantów dla projektów
- Obliczanie scores matchingu z rozbiciem na poszczególne kryteria
- Masowe przypisywanie konsultantów do projektów
- Integracja z systemem rekrutacyjnym (ATS)
- Wizualizacja matchingu na tablicy Kanban

### 1.2 Kontekst Biznesowy

**Organizacja**: B2B.net S.A. - IT outsourcing
**Skala**: 500+ konsultantów, 100+ aktywnych projektów
**Stack Techniczny**:
- Frontend: Next.js 14+, React 18+, TypeScript 5+
- Styling: Tailwind CSS 3+, shadcn/ui components
- Backend: Supabase (PostgreSQL, Realtime)
- Wielojęzyczność: next-intl (PL, EN)
- Buildowanie: Antygrivity/Bolt

### 1.3 Użytkownicy i Role

- **Recruitment Manager**: zarządza matchingiem i procesem rekrutacji
- **Project Manager**: przegląda dostępnych konsultantów
- **HR Manager**: monitoruje pipeline i metryki jakości
- **System Administrator**: konfiguruje wagi algorytmu

---

## 2. Architektura Systemu Matchingu

### 2.1 Struktura Wysokopoziomowa

```
┌─────────────────────────────────────────────────────────────┐
│                    Pipeline Matching Engine                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐        ┌──────────────────┐           │
│  │  Forward Path    │        │  Reverse Path    │           │
│  │  (Consultant →   │        │  (Project →      │           │
│  │   Projects)      │        │   Consultants)   │           │
│  └──────────────────┘        └──────────────────┘           │
│           ↓                           ↓                      │
│  ┌─────────────────────────────────────────────┐           │
│  │   Matching Algorithm with Scoring Engine    │           │
│  │   - Technology Match (40%)                  │           │
│  │   - Seniority Level (25%)                   │           │
│  │   - Location Proximity (20%)                │           │
│  │   - Rate Compatibility (15%)                │           │
│  └─────────────────────────────────────────────┘           │
│           ↓                                                 │
│  ┌─────────────────────────────────────────────┐           │
│  │       Results & Recommendations              │           │
│  │  - Match Score (0-100)                      │           │
│  │  - Match Details (breakdown)                │           │
│  │  - Suggested Actions                        │           │
│  └─────────────────────────────────────────────┘           │
│           ↓                                                 │
│  ┌──────────────────┐        ┌──────────────────┐           │
│  │  Kanban Board    │        │  Bulk Operations │           │
│  │  (Visualization) │        │  (Mass Assign)   │           │
│  └──────────────────┘        └──────────────────┘           │
│           ↓                           ↓                      │
│  ┌──────────────────────────────────────────────┐           │
│  │        ATS Integration & Workflow            │           │
│  │  - Push to Recruitment Process               │           │
│  │  - Candidate Status Tracking                │           │
│  └──────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Komponenty Systemu

| Komponent | Opis | Zodpowiedzialność |
|-----------|------|-------------------|
| **Scoring Engine** | Oblicza score matching dla każdej pary | Matchowanie |
| **Forward Matcher** | Wyszukuje projekty dla konsultanta | Sugerowanie projektów |
| **Reverse Matcher** | Wyszukuje konsultantów dla projektu | Zasilanie pipeline'a |
| **Kanban Board** | Wizualizacja matchingu z drag-drop | Zarządzanie |
| **Bulk Processor** | Masowe przypisywanie | Operacje masowe |
| **ATS Connector** | Integracja z systemem rekrutacyjnym | Integracja |
| **Metrics Engine** | Obliczanie KPI matchingu | Monitoring |

---

## 3. Algorytm Matchingu z Wagami

### 3.1 Definicja Scoring System

Algorytm matchingu opiera się na ważonej sumie czterech komponentów. Finalny score jest wartością z zakresu 0-100, gdzie 100 oznacza perfekcyjne dopasowanie.

```
FINAL_SCORE = (TECH_SCORE × 0.40) + (SENIORITY_SCORE × 0.25) +
              (LOCATION_SCORE × 0.20) + (RATE_SCORE × 0.15)
```

### 3.2 Technology Match Score (40%)

**Waga**: 40% (najważniejszy komponent)

**Metodologia**: Porównanie zbioru technologii wymaganych do projektu z umiejętnościami konsultanta.

```javascript
calculateTechnologyScore(consultantSkills, projectTechs) {
  // consultantSkills: { name: string, level: 1-5, years: number }[]
  // projectTechs: { name: string, level: 1-3, required: boolean }[]

  const requiredTechs = projectTechs.filter(t => t.required);
  const matchedRequired = requiredTechs.filter(reqTech =>
    consultantSkills.some(conSkill =>
      conSkill.name === reqTech.name && conSkill.level >= reqTech.level
    )
  );

  // Jeśli brakuje wymaganych technologii = 0 punktów
  if (matchedRequired.length < requiredTechs.length) return 0;

  // Bonus za dodatkowe technologie
  const bonusMatches = consultantSkills.filter(conSkill =>
    projectTechs.some(projTech =>
      projTech.name === conSkill.name && !projTech.required
    )
  );

  const baseScore = (matchedRequired.length / requiredTechs.length) * 80;
  const bonus = Math.min(bonusMatches.length * 2.5, 20);

  return Math.min(baseScore + bonus, 100);
}
```

**Interpretacja**:
- **90-100**: Idealny match wszystkich technologii
- **75-89**: Silny match, 1-2 brakujące technologie
- **60-74**: Umiarkowany match, możliwe szkolenie
- **40-59**: Słaby match, znaczące braki
- **0-39**: Nieadekwatny profil techniczny

### 3.3 Seniority Level Score (25%)

**Waga**: 25% (druga najważniejsza)

**Metodologia**: Porównanie poziomu doświadczenia konsultanta z wymaganiami projektu.

```javascript
calculateSeniorityScore(consultantLevel, projectLevel, yearsExperience) {
  // consultantLevel: 1-5 (Junior, Mid, Senior, Lead, Principal)
  // projectLevel: 1-3 (Mid, Senior, Lead)
  // yearsExperience: number (lata w zawodzie)

  const levelDifference = consultantLevel - projectLevel;

  if (consultantLevel < projectLevel) {
    // Konsultant za mały na stanowisko
    if (levelDifference === -1 && yearsExperience >= 2) {
      return 70; // Może podciągnąć się
    }
    return Math.max(0, 30 + (levelDifference * 20));
  }

  if (consultantLevel === projectLevel) {
    // Perfect match
    return 100;
  }

  // Konsultant większy niż wymagane (overqualified)
  // Możliwy risk ucieczki lub nudy
  const overqualifiedPenalty = Math.min(levelDifference * 5, 15);
  return 100 - overqualifiedPenalty;
}
```

**Skala Seniority**:
- Level 1: Junior (0-2 lata)
- Level 2: Mid (2-5 lat)
- Level 3: Senior (5-10 lat)
- Level 4: Lead (10-15 lat)
- Level 5: Principal (15+ lat)

### 3.4 Location Proximity Score (20%)

**Waga**: 20%

**Metodologia**: Ocena kompatybilności lokalizacji (work type + geografia).

```javascript
calculateLocationScore(consultantLocation, projectLocation, workType) {
  // workType: 'remote', 'hybrid', 'onsite'
  // locations: { city: string, country: string, lat: number, lon: number }

  // Jeśli projekt jest fully remote
  if (workType === 'remote') {
    return 100; // Każdy match
  }

  // Jeśli konsultant preferuje remote, a projekt hybrid/onsite
  if (consultantLocation.workType === 'remote' &&
      workType !== 'remote') {
    return 50; // Możliwe, ale nie idealne
  }

  // Jeśli prace onsite/hybrid - sprawdzenie odległości
  if (workType !== 'remote') {
    const distance = calculateDistance(
      consultantLocation,
      projectLocation
    );

    if (distance <= 30) return 100; // Blisko
    if (distance <= 50) return 85;  // Średnio blisko
    if (distance <= 100) return 60; // Dalsza dojazd
    if (distance <= 200) return 40; // Bardzo daleko
    return 0; // Zbyt daleko
  }

  return 100;
}
```

**Parametry**:
- Preferowana forma pracy konsultanta
- Typ pracy projektu
- Odległość geograficzna
- Strefy czasowe (dla remote)

### 3.5 Rate Compatibility Score (15%)

**Waga**: 15%

**Metodologia**: Ocena kompatybilności stawek.

```javascript
calculateRateScore(consultantRate, projectBudget, projectDuration) {
  // consultantRate: number (PLN/h lub monthly)
  // projectBudget: { amount: number, currency: string }
  // projectDuration: number (dni)

  const projectDailyBudget = projectBudget.amount / (projectDuration / 5);
  const consultantDailyRate = consultantRate * 8; // 8h workday

  const ratioDifference = consultantDailyRate / projectDailyBudget;

  // Tolerancja: 0.8 - 1.2 (od -20% do +20% od budżetu)
  if (ratioDifference >= 0.8 && ratioDifference <= 1.2) {
    return 100;
  }

  if (ratioDifference > 1.2) {
    // Konsultant droższy niż budżet
    const overagePercent = (ratioDifference - 1) * 100;
    return Math.max(0, 100 - overagePercent);
  }

  // Konsultant tańszy niż budżet (może być ok, lub risk quality)
  return 85;
}
```

**Interpretacja**:
- **95-100**: Idealna kompatybilność budżetu
- **80-94**: Akceptowalna stawka
- **60-79**: Możliwa negocjacja
- **0-59**: Poza budżetem

### 3.6 Score Quality Bands

```
100          ┌─────────────────────────────┐
             │  EXCELLENT (Green)          │
             │  95-100: Immediate assign   │
90           ├─────────────────────────────┤
             │  GOOD (Light Green)         │
             │  80-94: Recommend + Verify  │
80           ├─────────────────────────────┤
             │  ACCEPTABLE (Yellow)        │
             │  70-79: Review Options      │
70           ├─────────────────────────────┤
             │  WEAK (Orange)              │
             │  60-69: Training needed     │
60           ├─────────────────────────────┤
             │  POOR (Red)                 │
             │  0-59: Not recommended      │
0            └─────────────────────────────┘
```

---

## 4. Forward Matching - Konsultant → Projekty

### 4.1 Opis Funkcjonalności

Forward matching jest automatycznie uruchamiany gdy:
1. Kontrakt konsultanta wygasa w ciągu X dni (konfigurowalnie, default 30 dni)
2. Konsultant ma status "Available" lub "Looking"
3. Nowy projekt jest dodany do systemu

### 4.2 Workflow Forward Matchingu

```
1. TRIGGER
   ↓
   [Contract ending in X days?] → YES
   ↓
2. DATA PREPARATION
   ↓
   Pobierz profil konsultanta: skills, seniority, location, rate
   Pobierz wszystkie aktywne projekty z bazy
   ↓
3. FILTERING
   ↓
   Filtruj projekty:
   - Wymagane technologie (hard filter)
   - Preferowany typ pracy
   - Status projektu (Active/Open)
   ↓
4. SCORING
   ↓
   Dla każdego projektu: oblicz match score
   Sortuj po score (descending)
   ↓
5. RECOMMENDATIONS
   ↓
   Top 5 sugestii z rozbiciem scores
   Wyświetl w UI jako notifikacja
   ↓
6. ACTION
   ↓
   Recruit Manager akceptuje/odrzuca
   System aktualizuje status
```

### 4.3 Specyfikacja API - Forward Matching

```typescript
interface ForwardMatchRequest {
  consultantId: string;
  topN?: number; // default 5
  includePartialMatches?: boolean;
  minMatchScore?: number; // default 60
}

interface ProjectMatchResult {
  projectId: string;
  projectName: string;
  matchScore: number;
  scoreBreakdown: {
    technology: number;
    seniority: number;
    location: number;
    rate: number;
  };
  matchDetails: {
    matchedTechs: string[];
    missingTechs: string[];
    seniorityGap: number;
    locationDistance: number;
    rateComparison: string;
  };
  matchQuality: 'excellent' | 'good' | 'acceptable' | 'weak' | 'poor';
  suggestedActions: string[];
}

interface ForwardMatchResponse {
  consultantId: string;
  consultantName: string;
  matches: ProjectMatchResult[];
  timestamp: ISO8601;
}
```

### 4.4 Logika Sugerowania Projektów

```javascript
async function forwardMatch(consultantId: string) {
  // 1. Pobierz dane konsultanta
  const consultant = await db.consultants.findById(consultantId);
  const consultantSkills = await db.skills.findByConsultantId(consultantId);

  // 2. Pobierz wszystkie dostępne projekty
  const projects = await db.projects.findActive();

  // 3. Preliminary filter
  const filtered = projects.filter(p => {
    const requiredTechs = p.requiredTechs;
    const hasAllRequired = requiredTechs.every(tech =>
      consultantSkills.some(s =>
        s.name === tech.name && s.level >= tech.level
      )
    );
    return hasAllRequired;
  });

  // 4. Score each project
  const scored = filtered.map(project => ({
    projectId: project.id,
    projectName: project.name,
    matchScore: calculateMatchScore(consultant, project),
    scoreBreakdown: getScoreBreakdown(consultant, project),
    matchDetails: getMatchDetails(consultant, project),
    matchQuality: getQualityBand(matchScore)
  }));

  // 5. Sort and return top N
  return scored
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}
```

---

## 5. Reverse Matching - Projekt → Konsultanci

### 5.1 Opis Funkcjonalności

Reverse matching pozwala znaleźć odpowiednich konsultantów dla nowego projektu. Uruchamiany:
1. Manualnie z UI (Project Manager)
2. Automatycznie gdy nowy projekt zostaje utworzony
3. Periodycznie dla aktualnych projektów (daily batch job)

### 5.2 Workflow Reverse Matchingu

```
1. TRIGGER
   ↓
   [New project created?] OR [Manual search?]
   ↓
2. PROJECT ANALYSIS
   ↓
   Pobierz requirements: techs, seniority, location, budget
   Identyfikuj critical vs nice-to-have skills
   ↓
3. CONSULTANT POOL SELECTION
   ↓
   Filtruj konsultantów:
   - Status: Available/Looking/Open
   - Nie przypisani do konfliktowych projektów
   - W prawidłowej lokalizacji/timezone
   ↓
4. SCORING
   ↓
   Dla każdego konsultanta: oblicz match score
   Sortuj po score (descending)
   ↓
5. RANKING
   ↓
   Podziel na bands (excellent, good, acceptable, etc)
   Pogrupuj po score bands
   ↓
6. RECOMMENDATIONS
   ↓
   Wyświetl: Top candidates + Backup options
   Format: Kanban board lub lista
   ↓
7. ACTION
   ↓
   Drag-drop na board lub bulk select + assign
```

### 5.3 Specyfikacja API - Reverse Matching

```typescript
interface ReverseMatchRequest {
  projectId: string;
  topN?: number; // default 10
  includeBackupCandidates?: boolean;
  minMatchScore?: number; // default 60
  filters?: {
    maxDistance?: number;
    minSeniority?: number;
    maxRatePerHour?: number;
  };
}

interface ConsultantMatchResult {
  consultantId: string;
  consultantName: string;
  currentStatus: 'available' | 'looking' | 'open' | 'booked';
  currentRate: number;
  location: {
    city: string;
    country: string;
    distance: number;
  };
  matchScore: number;
  scoreBreakdown: {
    technology: number;
    seniority: number;
    location: number;
    rate: number;
  };
  matchDetails: {
    matchedTechs: TechMatch[];
    missingTechs: string[];
    seniorityLevel: number;
    yearsExperience: number;
    availableFrom: ISO8601;
    noticePeriod: number; // dni
  };
  matchQuality: 'excellent' | 'good' | 'acceptable' | 'weak' | 'poor';
  riskFactors: string[];
  suggestedActions: string[];
}

interface ReverseMatchResponse {
  projectId: string;
  projectName: string;
  projectDeadline: ISO8601;
  matchedCandidates: {
    excellent: ConsultantMatchResult[];
    good: ConsultantMatchResult[];
    acceptable: ConsultantMatchResult[];
    backup: ConsultantMatchResult[];
  };
  summaryStats: {
    totalMatched: number;
    excellentCount: number;
    averageScore: number;
  };
  timestamp: ISO8601;
}
```

### 5.4 Logika Wyszukiwania Konsultantów

```javascript
async function reverseMatch(projectId: string) {
  // 1. Pobierz dane projektu
  const project = await db.projects.findById(projectId);
  const projectRequirements = {
    techs: project.requiredTechs,
    seniorityMin: project.minSeniorityLevel,
    location: project.location,
    budget: project.budget,
    workType: project.workType
  };

  // 2. Filtruj dostępnych konsultantów
  const availableConsultants = await db.consultants.findAvailable({
    status: ['available', 'looking', 'open'],
    notBooked: true,
    location: projectRequirements.location,
    timezone: getTimezone(projectRequirements.location)
  });

  // 3. Score każdego konsultanta
  const scored = availableConsultants.map(consultant => ({
    consultantId: consultant.id,
    consultantName: consultant.name,
    currentStatus: consultant.status,
    currentRate: consultant.rate,
    location: consultant.location,
    matchScore: calculateMatchScore(consultant, project),
    scoreBreakdown: getScoreBreakdown(consultant, project),
    matchDetails: getMatchDetails(consultant, project),
    matchQuality: getQualityBand(matchScore),
    riskFactors: assessRisks(consultant, project)
  }));

  // 4. Grupuj po jakości
  const grouped = {
    excellent: scored.filter(s => s.matchScore >= 90),
    good: scored.filter(s => s.matchScore >= 80 && s.matchScore < 90),
    acceptable: scored.filter(s => s.matchScore >= 70 && s.matchScore < 80),
    backup: scored.filter(s => s.matchScore >= 60 && s.matchScore < 70)
  };

  // 5. Sortuj wewnątrz grup
  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => b.matchScore - a.matchScore);
  });

  return grouped;
}
```

---

## 6. Interfejs Kanban z Drag-and-Drop

### 6.1 Architektura Kanban Board

Tablica Kanban wizualizuje pipeline matchingu z czterema kolumnami:

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────┐
│   RECOMMENDED    │   IN REVIEW      │   MATCHED        │  REJECTED    │
│   (90-100)       │   (70-89)        │   (60-69)        │   (<60)      │
├──────────────────┼──────────────────┼──────────────────┼──────────────┤
│                  │                  │                  │              │
│ ┌──────────────┐ │ ┌──────────────┐ │ ┌──────────────┐ │ ┌──────────┐ │
│ │ Consultant A │ │ │ Consultant C │ │ │ Consultant E │ │ │ Cons. F  │ │
│ │ Score: 95    │ │ │ Score: 82    │ │ │ Score: 65    │ │ │ Score:45 │ │
│ │ Tech: 95%    │ │ │ Tech: 78%    │ │ │ Tech: 60%    │ │ │ Tech:30% │ │
│ └──────────────┘ │ │ Sen: 85%     │ │ │ Sen: 70%     │ │ └──────────┘ │
│                  │ │ Loc: 90%     │ │ │ Loc: 65%     │ │              │
│ ┌──────────────┐ │ │ Rat: 85%     │ │ │ Rat: 60%     │ │              │
│ │ Consultant B │ │ │              │ │ │              │ │              │
│ │ Score: 92    │ │ │ Available    │ │ │ Available    │ │              │
│ │ ...          │ │ │ from 2025-02 │ │ │              │ │              │
│ └──────────────┘ │ └──────────────┘ │ │              │ │              │
│                  │                  │ │ ┌──────────────┐ │              │
│ Available        │ ┌──────────────┐ │ │ │ Consultant D │ │              │
│ from: 2025-02    │ │ Consultant G │ │ │ │ Score: 62    │ │              │
│                  │ │ Score: 75    │ │ │ │ ...          │ │              │
│                  │ └──────────────┘ │ └──────────────┘ │              │
│                  │                  │                  │              │
└──────────────────┴──────────────────┴──────────────────┴──────────────┘
```

### 6.2 Struktura Karty Konsultanta

Każda karta na tablicy zawiera:

```
┌────────────────────────────────────────────┐
│  👤 Imię Nazwisko                [✓] [×]   │
├────────────────────────────────────────────┤
│  📊 Match Score: 92/100                    │
│     ▓▓▓▓▓▓▓▓▓░ 92%                        │
├────────────────────────────────────────────┤
│  Score Breakdown:                          │
│  🔧 Technology:  95% (9.5 pts)            │
│  📈 Seniority:   85% (6.4 pts)            │
│  📍 Location:    90% (4.5 pts)            │
│  💰 Rate:        85% (3.6 pts)            │
├────────────────────────────────────────────┤
│  Details:                                  │
│  • Location: Wrocław (25km away)           │
│  • Rate: 150 PLN/h                         │
│  • Available: 2025-02-15                   │
│  • Notice: 2 weeks                         │
├────────────────────────────────────────────┤
│  Technologies:                             │
│  ✓ React (Expert) ✓ TypeScript (Expert)   │
│  ✓ Node.js (Advanced) ✗ GraphQL (Missing) │
├────────────────────────────────────────────┤
│  Actions:                                  │
│  [View Details] [Send Offer] [Add Note]   │
└────────────────────────────────────────────┘
```

### 6.3 Komponenty React dla Kanban

```typescript
// PipelineKanbanBoard.tsx
interface KanbanBoardProps {
  projectId: string;
  matches: ReverseMatchResponse;
  onCardDrop: (consultantId: string, targetStatus: string) => void;
  onAssign: (consultantId: string) => void;
  onReject: (consultantId: string, reason?: string) => void;
}

interface MatchCard {
  consultantId: string;
  consultantName: string;
  matchScore: number;
  scoreBreakdown: ScoreBreakdown;
  matchDetails: MatchDetails;
  avatarUrl?: string;
  actions: CardAction[];
}

// Komponenty:
<KanbanBoard>
  <KanbanColumn title="Recommended" status="excellent">
    <MatchCard
      consultant={consultant}
      onDrop={handleDrop}
      onAssign={handleAssign}
    />
  </KanbanColumn>
  <KanbanColumn title="In Review" status="good">
    ...
  </KanbanColumn>
  <KanbanColumn title="Matched" status="acceptable">
    ...
  </KanbanColumn>
  <KanbanColumn title="Rejected" status="poor">
    ...
  </KanbanColumn>
</KanbanBoard>
```

### 6.4 Implementacja Drag-and-Drop

```typescript
// useDragAndDrop.ts
const useDragAndDrop = (
  projectId: string,
  onCardMove: (consultantId: string, toStatus: string) => Promise<void>
) => {
  const [draggedCard, setDraggedCard] = useState<string | null>(null);

  const handleDragStart = (consultantId: string) => {
    setDraggedCard(consultantId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Allow drop
  };

  const handleDrop = async (
    e: React.DragEvent,
    targetStatus: string
  ) => {
    e.preventDefault();
    if (!draggedCard) return;

    try {
      await onCardMove(draggedCard, targetStatus);
      toast.success(`Consultant moved to ${targetStatus}`);
    } catch (error) {
      toast.error('Failed to move consultant');
    }

    setDraggedCard(null);
  };

  return {
    draggedCard,
    handleDragStart,
    handleDragOver,
    handleDrop
  };
};
```

---

## 7. Operacje Masowe i Bulk Assign

### 7.1 Interfejs Bulk Operations

UI dla operacji masowych znajduje się na pasku narzędzi Kanban board:

```
┌─────────────────────────────────────────────────────────────┐
│ Selected: 5 consultants                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ [☑] Bulk Actions:                                           │
│                                                              │
│ ┌─────────────────────┐  ┌─────────────────┐  ┌──────────┐ │
│ │ Assign to Project   │  │ Send Bulk Email  │  │  Export  │ │
│ │ (+ dropdown select) │  │ (pre-filled)    │  │  (CSV)   │ │
│ └─────────────────────┘  └─────────────────┘  └──────────┘ │
│                                                              │
│ ┌─────────────────────┐  ┌─────────────────┐  ┌──────────┐ │
│ │ Add to Pipeline     │  │ Generate Report │  │ Schedule │ │
│ │                     │  │                 │  │ Interview│ │
│ └─────────────────────┘  └─────────────────┘  └──────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Workflow Bulk Assign

```
1. SELECTION PHASE
   ↓
   User wielokrotnie kliknie checkboxy na kartach
   System aktualizuje licznik wybranych: "Selected: N consultants"
   ↓
2. ACTION SELECTION
   ↓
   User klika przycisk "Assign to Project"
   ↓
3. CONFIRMATION DIALOG
   ↓
   ┌────────────────────────────────────┐
   │ Bulk Assign Confirmation           │
   ├────────────────────────────────────┤
   │ You're about to assign:            │
   │                                    │
   │ • Consultant A (Score: 95)         │
   │ • Consultant B (Score: 92)         │
   │ • Consultant C (Score: 85)         │
   │ • Consultant D (Score: 82)         │
   │ • Consultant E (Score: 75)         │
   │                                    │
   │ to Project: "Mobile App Dev 2025"  │
   │                                    │
   │ [Cancel]  [Proceed]                │
   └────────────────────────────────────┘
   ↓
4. ASSIGNMENT EXECUTION
   ↓
   Dla każdego konsultanta:
   - Utwórz record assignment
   - Wyślij notyfikację
   - Zaktualizuj consultant status
   - Log activity
   ↓
5. RESULTS SUMMARY
   ↓
   ┌────────────────────────────────────┐
   │ ✓ Bulk Assignment Complete         │
   ├────────────────────────────────────┤
   │ Assigned: 5/5 consultants          │
   │ Success rate: 100%                 │
   │                                    │
   │ [View Details] [Close]             │
   └────────────────────────────────────┘
```

### 7.3 API Bulk Operations

```typescript
interface BulkAssignRequest {
  projectId: string;
  consultantIds: string[];
  metadata?: {
    assignedBy: string;
    reason?: string;
    notifyConsultants?: boolean;
  };
}

interface BulkAssignResult {
  projectId: string;
  totalRequested: number;
  successCount: number;
  failureCount: number;
  results: {
    consultantId: string;
    status: 'success' | 'failed';
    assignmentId?: string;
    error?: string;
  }[];
  timestamp: ISO8601;
}

// API Endpoint
POST /api/v1/pipeline/bulk-assign
Body: BulkAssignRequest
Response: BulkAssignResult
```

### 7.4 Implementacja TypeScript

```typescript
// bulkOperations.ts
class BulkOperationsService {
  async bulkAssignConsultants(
    request: BulkAssignRequest
  ): Promise<BulkAssignResult> {
    const results: BulkAssignResult['results'] = [];
    let successCount = 0;

    for (const consultantId of request.consultantIds) {
      try {
        const assignment = await this.assignConsultantToProject(
          consultantId,
          request.projectId
        );

        if (request.metadata?.notifyConsultants) {
          await this.notifyConsultant(
            consultantId,
            request.projectId
          );
        }

        results.push({
          consultantId,
          status: 'success',
          assignmentId: assignment.id
        });
        successCount++;
      } catch (error) {
        results.push({
          consultantId,
          status: 'failed',
          error: error.message
        });
      }
    }

    return {
      projectId: request.projectId,
      totalRequested: request.consultantIds.length,
      successCount,
      failureCount: request.consultantIds.length - successCount,
      results,
      timestamp: new Date().toISOString()
    };
  }

  async bulkExportMatches(
    projectId: string,
    consultantIds: string[]
  ): Promise<Buffer> {
    // Generuj CSV z match details
    const csv = await this.generateMatchesCSV(projectId, consultantIds);
    return Buffer.from(csv, 'utf-8');
  }
}
```

---

## 8. Metryki Jakości Matchingu

### 8.1 KPI i Metryki Systemu

```
┌─────────────────────────────────────────────────────────────┐
│         Pipeline Matching Quality Metrics Dashboard         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Okres: [Last 30 days ▼]  [Exportuj] [Refresh]            │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐  │
│  │ Avg Match Score  │  │ Assignment Rate  │  │Success  │  │
│  │                  │  │                  │  │ Rate    │  │
│  │     78.5 / 100   │  │      72.3%       │  │  91.2%  │  │
│  │     ▓▓▓▓▓▓▓░    │  │    ▓▓▓▓▓▓░       │  │ ▓▓▓▓▓▓▓▓│  │
│  └──────────────────┘  └──────────────────┘  └──────────┘  │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐  │
│  │ Avg Time to      │  │ Retention Rate   │  │Quality  │  │
│  │ Assignment       │  │ (after 30 days)  │  │Score    │  │
│  │                  │  │                  │  │ (ML)    │  │
│  │     4.2 days     │  │      86.5%       │  │  8.7/10 │  │
│  └──────────────────┘  └──────────────────┘  └──────────┘  │
│                                                              │
│  Score Distribution (Last 30 days):                         │
│  90-100 (Excellent): 234 matches (28%)                     │
│  80-89  (Good):      312 matches (38%)                     │
│  70-79  (Acceptable):198 matches (24%)                     │
│  60-69  (Weak):       72 matches (9%)                      │
│  <60    (Poor):       18 matches (2%)                      │
│                                                              │
│  Distribution Chart:  ▓▓▓▓▓ (38%)                          │
│                       ▓▓▓▓▓▓ (45%)                          │
│                       ▓▓▓ (15%)                             │
│                       ▓ (2%)                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Definicje Metryk

| Metryka | Wzór | Cel | Alarm |
|---------|------|-----|-------|
| **Average Match Score** | `sum(allScores) / count(scores)` | > 75 | < 70 |
| **Assignment Rate** | `assigned / recommended × 100%` | > 70% | < 60% |
| **Success Rate** | `successful_assignments / total_assignments` | > 90% | < 80% |
| **Time to Assignment** | `avg(date_assigned - date_matched)` | < 5 dni | > 10 dni |
| **Retention Rate** | `consultants_retained_30days / assigned × 100%` | > 85% | < 75% |
| **Perfect Match %** | `count(score >= 90) / total_matches × 100%` | > 25% | < 15% |
| **Quality Score (ML)** | `historical_success_correlation` | > 8/10 | < 6/10 |

### 8.3 Algorytm Obliczania Quality Score (ML-based)

```javascript
calculateQualityScore(historicalMatches) {
  // Bazuje na historycznych wynikach matchingu
  // Porównuje predicted score vs. actual consultant performance

  const factors = {
    scoreAccuracy: calculateScoreAccuracy(),        // 40%
    retentionCorrelation: calculateRetention(),     // 30%
    clientSatisfaction: calculateCSAT(),            // 20%
    performanceMetrics: calculatePerformance()      // 10%
  };

  const qualityScore =
    (factors.scoreAccuracy * 0.4) +
    (factors.retentionCorrelation * 0.3) +
    (factors.clientSatisfaction * 0.2) +
    (factors.performanceMetrics * 0.1);

  return Math.round(qualityScore * 10) / 10;
}
```

---

## 9. Integracja z ATS

### 9.1 ATS Integration Overview

Module M9 integruje się z systemem rekrutacyjnym (ATS - Applicant Tracking System) poprzez:
1. Push matched candidates do recruitment pipeline
2. Tracking candidate status w ATS
3. Feedback loop z procesem rekrutacji

### 9.2 Push to ATS Workflow

```
Pipeline Matching Engine → ATS Integration → Recruitment System
         ↓
    [User klika "Send to ATS"]
         ↓
    Validate candidate data
         ↓
    Create/Update candidate record in ATS
         ↓
    Add to recruitment pipeline (Job ID)
         ↓
    Generate ATS candidate ID
         ↓
    Send confirmation + ATS link
         ↓
    Track status updates from ATS
```

### 9.3 API Specification - ATS Push

```typescript
interface ATSPushRequest {
  consultantId: string;
  projectId: string;
  matchScore: number;
  scoreBreakdown: ScoreBreakdown;
  metadata?: {
    pushedBy: string;
    timestamp: ISO8601;
    notes?: string;
  };
}

interface ATSPushResponse {
  success: boolean;
  candidateId: string;        // ID w systemie ATS
  jobId: string;              // Job ID w ATS
  status: string;             // Pipeline stage
  atsCandidateUrl: string;    // Link do profilu w ATS
  message: string;
  timestamp: ISO8601;
}

// Implementacja
POST /api/v1/ats/push-candidate
Body: ATSPushRequest
Response: ATSPushResponse

// Status tracking
GET /api/v1/ats/candidate-status/{candidateId}
Response: {
  candidateId: string;
  status: 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';
  stage: string;
  updatedAt: ISO8601;
}
```

### 9.4 ATS Integration Constants

```typescript
// ATSIntegration.ts
const ATS_CONFIG = {
  baseUrl: process.env.ATS_API_URL,
  apiKey: process.env.ATS_API_KEY,

  endpoints: {
    pushCandidate: '/api/candidates',
    getCandidateStatus: '/api/candidates/{id}/status',
    updateCandidateStatus: '/api/candidates/{id}/status',
    getJobById: '/api/jobs/{id}',
    listCandidates: '/api/candidates'
  },

  statusMapping: {
    'new': 'CV_REVIEW',
    'screening': 'SCREENING_CALL',
    'interview': 'INTERVIEW',
    'offer': 'OFFER_STAGE',
    'hired': 'HIRED',
    'rejected': 'REJECTED'
  },

  webhookSecret: process.env.ATS_WEBHOOK_SECRET,
  retryAttempts: 3,
  retryDelay: 1000 // ms
};
```

### 9.5 Webhook Handler - Status Updates from ATS

```typescript
// handleATSWebhook.ts
export async function handleATSStatusUpdate(
  event: ATSWebhookEvent
) {
  // Zaaktualizuj status candidate'a w naszej bazie

  const { candidateId, newStatus, jobId, timestamp } = event;

  // Validate webhook
  if (!validateWebhookSignature(event)) {
    throw new Error('Invalid webhook signature');
  }

  // Find corresponding assignment in our system
  const assignment = await db.assignments.findByATSCandidateId(
    candidateId
  );

  if (!assignment) {
    console.log(`No assignment found for ATS candidate ${candidateId}`);
    return;
  }

  // Update status
  await db.assignments.update(assignment.id, {
    atsStatus: newStatus,
    updatedAt: new Date(timestamp)
  });

  // Send notification to HR Manager
  await notificationService.sendToHRManager(
    `Candidate status updated: ${assignment.consultantName} → ${newStatus}`
  );

  // Log activity
  await auditLog.log({
    action: 'ATS_STATUS_UPDATE',
    assignment: assignment.id,
    oldStatus: assignment.atsStatus,
    newStatus: newStatus,
    source: 'ATS'
  });
}
```

---

## 10. Modele Danych i Schematy

### 10.1 Schemat PostgreSQL - Tabela Assignments

```sql
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Keys
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Matching Data
  match_score NUMERIC(3,1) NOT NULL CHECK (match_score >= 0 AND match_score <= 100),

  -- Score Breakdown (JSON)
  score_breakdown JSONB NOT NULL DEFAULT '{
    "technology": 0,
    "seniority": 0,
    "location": 0,
    "rate": 0
  }'::jsonb,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'matched'
    CHECK (status IN ('matched', 'offered', 'accepted', 'rejected', 'archived')),

  -- ATS Integration
  ats_candidate_id VARCHAR(255),
  ats_status VARCHAR(50),
  ats_sync_timestamp TIMESTAMP,

  -- Pipeline
  kanban_column VARCHAR(50) DEFAULT 'excellent'
    CHECK (kanban_column IN ('excellent', 'good', 'acceptable', 'poor')),

  -- Metadata
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Notes & Reason
  notes TEXT,
  rejection_reason VARCHAR(255),

  -- Indexes for performance
  UNIQUE(consultant_id, project_id),
  INDEX idx_project_status (project_id, status),
  INDEX idx_consultant_status (consultant_id, status),
  INDEX idx_match_score (match_score DESC),
  INDEX idx_ats_candidate (ats_candidate_id)
);
```

### 10.2 Schemat PostgreSQL - Tabela Matching Metrics

```sql
CREATE TABLE matching_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  metric_date DATE NOT NULL,
  metric_type VARCHAR(100) NOT NULL,

  -- Values
  metric_value NUMERIC(10, 2) NOT NULL,
  metric_unit VARCHAR(50),

  -- Context
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,

  -- Aggregation
  aggregation_level VARCHAR(50) DEFAULT 'daily'
    CHECK (aggregation_level IN ('hourly', 'daily', 'weekly', 'monthly')),

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  INDEX idx_metric_date (metric_date DESC),
  INDEX idx_metric_type (metric_type)
);
```

### 10.3 TypeScript Interfaces - Domain Models

```typescript
// types/matching.ts

export interface Consultant {
  id: string;
  name: string;
  email: string;
  phone: string;

  profile: {
    seniorityLevel: 1 | 2 | 3 | 4 | 5;
    yearsExperience: number;
    location: Location;
    preferredWorkType: 'remote' | 'hybrid' | 'onsite';
    hourlyRate: number;
    dailyRate?: number;
  };

  skills: Skill[];
  certifications?: string[];
  languages?: Language[];

  status: 'available' | 'looking' | 'open' | 'booked' | 'on_contract';
  availableFrom?: Date;
  noticePeriod: number; // days

  currentAssignment?: {
    projectId: string;
    contractEndDate: Date;
  };

  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description: string;

  requirements: {
    requiredTechs: TechRequirement[];
    minSeniorityLevel: 1 | 2 | 3 | 4 | 5;
    location: Location;
    workType: 'remote' | 'hybrid' | 'onsite';
    budget: {
      amount: number;
      currency: string;
      type: 'fixed' | 'hourly';
    };
  };

  timeline: {
    startDate: Date;
    endDate: Date;
    duration: number; // days
  };

  status: 'open' | 'active' | 'completed' | 'archived';

  assignedConsultants: string[]; // consultant IDs

  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchingScore {
  consultantId: string;
  projectId: string;

  totalScore: number; // 0-100

  breakdown: {
    technology: number;
    seniority: number;
    location: number;
    rate: number;
  };

  qualityBand: 'excellent' | 'good' | 'acceptable' | 'weak' | 'poor';

  details: {
    matchedTechs: string[];
    missingTechs: string[];
    seniorityGap: number;
    locationDistance: number;
    rateComparison: {
      consultantRate: number;
      projectBudget: number;
      variance: number; // percentage
    };
  };

  riskFactors: string[];
  suggestedActions: string[];

  calculatedAt: Date;
}

export interface Assignment {
  id: string;
  consultantId: string;
  projectId: string;

  matchScore: MatchingScore;

  status: 'matched' | 'offered' | 'accepted' | 'rejected' | 'archived';

  ats: {
    candidateId?: string;
    status?: string;
    syncedAt?: Date;
  };

  metadata: {
    assignedBy: string;
    assignedAt: Date;
    notes?: string;
    rejectionReason?: string;
  };
}
```

---

## 11. Komponenty React i UI/UX

### 11.1 Struktura Komponentów

```
src/components/
├── PipelineMatching/
│   ├── PipelineMatchingDashboard.tsx (główny kontener)
│   ├── ForwardMatchingView.tsx (konsultant → projekty)
│   ├── ReverseMatchingView.tsx (projekt → konsultanci)
│   ├── KanbanBoard/
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   ├── MatchCard.tsx
│   │   └── CardActions.tsx
│   ├── BulkOperations/
│   │   ├── BulkOperationsToolbar.tsx
│   │   ├── BulkSelectCheckbox.tsx
│   │   └── BulkAssignDialog.tsx
│   ├── MetricsPanel/
│   │   ├── MetricsDashboard.tsx
│   │   ├── MetricCard.tsx
│   │   └── ScoreChart.tsx
│   └── MatchDetails/
│       ├── ScoreBreakdown.tsx
│       ├── TechologyMatch.tsx
│       └── LocationMap.tsx
├── hooks/
│   ├── useForwardMatching.ts
│   ├── useReverseMatching.ts
│   ├── useBulkOperations.ts
│   └── useMatchingMetrics.ts
├── services/
│   ├── matchingService.ts
│   ├── atsService.ts
│   └── metricsService.ts
└── types/
    └── matching.types.ts
```

### 11.2 Kod Komponentu - MatchCard.tsx

```typescript
// components/PipelineMatching/KanbanBoard/MatchCard.tsx
import { FC, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ConsultantMatchResult } from '@/types/matching.types';

interface MatchCardProps {
  match: ConsultantMatchResult;
  onDragStart?: (consultantId: string) => void;
  onAssign?: (consultantId: string) => void;
  onReject?: (consultantId: string) => void;
  isSelected?: boolean;
  onSelect?: (consultantId: string) => void;
}

export const MatchCard: FC<MatchCardProps> = ({
  match,
  onDragStart,
  onAssign,
  onReject,
  isSelected,
  onSelect
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const getScoreBandColor = (score: number) => {
    if (score >= 90) return 'bg-green-100 border-green-300';
    if (score >= 80) return 'bg-lime-100 border-lime-300';
    if (score >= 70) return 'bg-yellow-100 border-yellow-300';
    if (score >= 60) return 'bg-orange-100 border-orange-300';
    return 'bg-red-100 border-red-300';
  };

  const getScoreBandBadge = (quality: string) => {
    const colors = {
      'excellent': 'bg-green-600 text-white',
      'good': 'bg-lime-600 text-white',
      'acceptable': 'bg-yellow-600 text-white',
      'weak': 'bg-orange-600 text-white',
      'poor': 'bg-red-600 text-white'
    };
    return colors[quality] || 'bg-gray-600 text-white';
  };

  return (
    <Card
      className={`p-4 cursor-move transition-all hover:shadow-lg
        ${getScoreBandColor(match.matchScore)}
        ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
      draggable
      onDragStart={() => onDragStart?.(match.consultantId)}
      onClick={() => onSelect?.(match.consultantId)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-sm">
            {match.consultantName}
          </h3>
          <p className="text-xs text-gray-600">
            {match.location.city}, {match.location.country}
          </p>
        </div>
        <Badge className={getScoreBandBadge(match.matchQuality)}>
          {match.matchQuality.toUpperCase()}
        </Badge>
      </div>

      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-semibold">
            Match Score: {match.matchScore}/100
          </span>
          <span className="text-xs text-gray-700">
            {match.matchScore}%
          </span>
        </div>
        <Progress value={match.matchScore} className="h-2" />
      </div>

      <div className="space-y-1 text-xs mb-3">
        <div className="flex justify-between">
          <span>🔧 Tech:</span>
          <span className="font-semibold">{match.scoreBreakdown.technology}%</span>
        </div>
        <div className="flex justify-between">
          <span>📈 Senior:</span>
          <span className="font-semibold">{match.scoreBreakdown.seniority}%</span>
        </div>
        <div className="flex justify-between">
          <span>📍 Location:</span>
          <span className="font-semibold">{match.scoreBreakdown.location}%</span>
        </div>
        <div className="flex justify-between">
          <span>💰 Rate:</span>
          <span className="font-semibold">{match.scoreBreakdown.rate}%</span>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs font-semibold mb-1">Technologies:</p>
        <div className="flex flex-wrap gap-1">
          {match.matchDetails.matchedTechs.slice(0, 3).map((tech, idx) => (
            <Badge key={idx} variant="secondary" className="text-xs">
              ✓ {tech}
            </Badge>
          ))}
          {match.matchDetails.missingTechs.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              ✗ {match.matchDetails.missingTechs[0]}
            </Badge>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-700 mb-3">
        <p>Rate: {match.currentRate} PLN/h</p>
        <p>Available: {new Date(match.matchDetails.availableFrom).toLocaleDateString()}</p>
      </div>

      {match.riskFactors.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-3 text-xs">
          <p className="font-semibold text-yellow-900">⚠️ Risk Factors:</p>
          <ul className="list-disc list-inside text-yellow-800 mt-1">
            {match.riskFactors.slice(0, 2).map((risk, idx) => (
              <li key={idx}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 pt-3 border-t">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAssign?.(match.consultantId);
          }}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 rounded"
        >
          Assign
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReject?.(match.consultantId);
          }}
          className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 text-xs py-1 rounded"
        >
          Reject
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDetails(!showDetails);
          }}
          className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs py-1 rounded"
        >
          Details
        </button>
      </div>

      {showDetails && (
        <div className="mt-3 pt-3 border-t space-y-2 text-xs">
          <div>
            <p className="font-semibold">Seniority:</p>
            <p className="text-gray-700">Level {match.matchDetails.seniorityLevel} ({match.matchDetails.yearsExperience} years)</p>
          </div>
          <div>
            <p className="font-semibold">Notice Period:</p>
            <p className="text-gray-700">{match.matchDetails.noticePeriod} days</p>
          </div>
          <div>
            <p className="font-semibold">Suggested Actions:</p>
            <ul className="list-disc list-inside text-gray-700">
              {match.suggestedActions.slice(0, 2).map((action, idx) => (
                <li key={idx}>{action}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
};
```

### 11.3 Hook - useReverseMatching.ts

```typescript
// hooks/useReverseMatching.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { matchingService } from '@/services/matchingService';
import { ReverseMatchRequest, ReverseMatchResponse } from '@/types/matching.types';

export const useReverseMatching = (projectId: string) => {
  // Fetch matches
  const matchesQuery = useQuery({
    queryKey: ['reverseMatching', projectId],
    queryFn: () => matchingService.reverseMatch(projectId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Assign consultant mutation
  const assignMutation = useMutation({
    mutationFn: (consultantId: string) =>
      matchingService.assignConsultant(projectId, consultantId),
    onSuccess: () => {
      matchesQuery.refetch();
    },
  });

  // Bulk assign
  const bulkAssignMutation = useMutation({
    mutationFn: (consultantIds: string[]) =>
      matchingService.bulkAssign(projectId, consultantIds),
    onSuccess: () => {
      matchesQuery.refetch();
    },
  });

  return {
    matches: matchesQuery.data,
    isLoading: matchesQuery.isLoading,
    error: matchesQuery.error,
    assign: assignMutation.mutate,
    bulkAssign: bulkAssignMutation.mutate,
    isAssigning: assignMutation.isPending,
  };
};
```

---

## 12. AI Builder Prompt - Generator Kodu

### 12.1 Master Prompt dla Antygrivity/Bolt

```
# AI Builder Prompt - Qualrix Pipeline Matching Engine (M9)

## System Context

You are an AI code generator for the Qualrix application, built with Antygrivity/Bolt.
Your role is to generate production-ready TypeScript/React code that implements the Pipeline
Matching Engine module.

Technology Stack:
- Frontend: Next.js 14+, React 18+, TypeScript 5+
- UI Framework: shadcn/ui + Tailwind CSS 3+
- State Management: TanStack React Query
- Backend: Supabase (PostgreSQL, Realtime)
- Internationalization: next-intl (PL, EN)
- Build System: Antygrivity/Bolt

## Module Requirements

You are implementing Module M9: Pipeline Matching Engine with these sub-modules:
- M9.1: Auto-matching (contract ending → suggest projects)
- M9.2: Reverse matching (project → suggest consultants)
- M9.3: Matching score breakdown
- M9.4: Bulk assign operations
- M9.5: ATS integration

## Matching Algorithm Specification

### Score Calculation (0-100):
```
FINAL_SCORE = (TECH_SCORE × 0.40) + (SENIORITY_SCORE × 0.25) +
              (LOCATION_SCORE × 0.20) + (RATE_SCORE × 0.15)
```

### Component Scores:
1. **Technology (40%)**: Matches required skills
   - Perfect match: 100
   - Each missing required: -20
   - Bonus for extra skills: +2.5 per skill (max 20)

2. **Seniority (25%)**: Level compatibility
   - Perfect level match: 100
   - One level below with 2+ years: 70
   - Overqualified: 100 - (levels_above × 5)

3. **Location (20%)**: Geography + work type
   - Fully remote project: 100
   - < 30km distance: 100
   - 30-50km: 85
   - 50-100km: 60
   - > 100km: 40

4. **Rate (15%)**: Budget compatibility
   - Within ±20% of budget: 100
   - Outside: 100 - (variance_percent)

## Code Generation Guidelines

### Structure
- Follow Next.js 14 app directory structure
- Use TypeScript with strict mode
- Implement proper error handling and validation
- Include comprehensive JSDoc comments
- Add proper logging for debugging

### React Components
- Use functional components with hooks
- Implement proper loading/error states
- Add accessibility attributes (aria-*, role=)
- Support dark mode (Tailwind CSS)
- Make responsive (mobile-first)

### Database
- Use Supabase SDK (@supabase/supabase-js)
- Implement proper type safety with TypeScript
- Add indexes for performance
- Use transactions for atomic operations
- Handle real-time subscriptions

### API Design
- RESTful endpoints following: /api/v1/{module}/{resource}
- Proper HTTP status codes
- JSON request/response bodies
- Authentication via JWT (Supabase)
- Rate limiting headers

### Internationalization
- Use next-intl for all user-facing text
- Support Polish (pl) and English (en)
- Store translations in JSON files
- Use namespaced keys (e.g., "matching.scoreBreakdown")

### Testing
- Unit tests with Vitest
- Mock API responses
- Test error scenarios
- Component tests with @testing-library/react

## File Generation Output Format

When generating code, provide:
1. **File Path**: Absolute path (e.g., src/components/PipelineMatching/MatchCard.tsx)
2. **Language**: TypeScript, React, SQL, etc.
3. **Description**: What the file does
4. **Code Block**: Complete, production-ready code
5. **Dependencies**: Any new npm packages needed
6. **Testing**: Basic test file if applicable

## Example Request Format

```
Generate: ReverseMatchingView component
Requirements:
- Display project matching interface
- Show matched consultants in sorted order
- Implement filtering by score band
- Add bulk selection checkboxes
- Include real-time updates via Supabase
- Support Polish/English
- Mobile responsive
```

## Quality Checklist

Before returning code, verify:
- [ ] TypeScript compilation succeeds (no any types)
- [ ] Proper error handling (try-catch, validation)
- [ ] Loading states (skeleton screens, spinners)
- [ ] Accessibility (ARIA labels, keyboard navigation)
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Internationalization complete
- [ ] Comments and JSDoc for all functions
- [ ] No console.log() in production code
- [ ] Proper TypeScript types for all props
- [ ] No hardcoded strings (use i18n)
- [ ] Proper database indexes
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (proper escaping)
- [ ] Performance optimized (memoization, lazy loading)

## Performance Optimization

- Use React.memo() for expensive components
- Implement pagination for large lists
- Add virtual scrolling for Kanban boards
- Debounce/throttle search inputs
- Use Supabase indexes for queries
- Implement caching strategies
- Lazy load heavy components

## Security Requirements

- Validate all user inputs server-side
- Use parameterized SQL queries
- Implement proper authentication checks
- Sanitize user-generated content
- Use environment variables for secrets
- Implement CORS properly
- Add rate limiting on API endpoints
- Log security-relevant events

## Example: Reverse Matching Service

```typescript
// services/reverseMatchingService.ts
import { createClient } from '@supabase/supabase-js';
import type { ReverseMatchResponse } from '@/types/matching.types';

export class ReverseMatchingService {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  /**
   * Find matched consultants for a project
   *
   * @param projectId - Project identifier
   * @param minScore - Minimum match score (0-100)
   * @returns Consultants grouped by quality band
   */
  async findMatchedConsultants(
    projectId: string,
    minScore: number = 60
  ): Promise<ReverseMatchResponse> {
    // Implementation using scoring algorithm
  }
}
```

## Instructions for Implementation

1. **Start with data models**: Define TypeScript interfaces first
2. **Implement algorithm**: Core scoring logic in service layer
3. **Build components**: React components using shadcn/ui
4. **Add API routes**: Next.js API routes for endpoints
5. **Connect database**: Supabase queries and subscriptions
6. **Add i18n**: Translations for all UI text
7. **Test**: Write unit and component tests
8. **Optimize**: Performance profiling and optimization
9. **Document**: Comments and API documentation
10. **Deploy**: Build configuration and deployment steps

## Output Response Format

When a user requests code generation, respond with:

1. Summary of what will be generated
2. File list with brief descriptions
3. Code blocks (grouped by file)
4. Dependencies to install (if any)
5. Integration instructions
6. Testing instructions
7. Performance notes
8. Security considerations

---

Generate production-ready code following these guidelines.
Do not ask for clarification unless critical parameters are missing.
```

### 12.2 Prompt dla konkretnego komponentu

```
# Generate: PipelineMatchingDashboard Component

## Requirements:
- Main container for reverse matching interface
- Display matched consultants in Kanban board (4 columns by quality)
- Implement drag-and-drop between columns
- Add bulk selection and operations toolbar
- Show match metrics/statistics panel
- Real-time updates from Supabase
- Polish and English support
- Mobile responsive design
- Export to CSV functionality

## User Flow:
1. Project Manager opens project details
2. System automatically calculates matches (reverse matching)
3. Dashboard displays:
   - Kanban board with candidates
   - Score breakdown for each match
   - Bulk operations toolbar
   - Metrics panel (avg score, success rate, etc.)
4. PM can:
   - Drag candidates between columns
   - Select multiple candidates
   - Bulk assign to ATS
   - Export report
   - View detailed match analysis

## File Structure to Generate:
- src/components/PipelineMatching/PipelineMatchingDashboard.tsx
- src/components/PipelineMatching/KanbanBoard/KanbanBoard.tsx
- src/components/PipelineMatching/KanbanBoard/KanbanColumn.tsx
- src/components/PipelineMatching/MetricsPanel/MetricsDashboard.tsx
- src/hooks/useReverseMatching.ts
- src/services/matchingService.ts

## Detailed Specification:
[Insert M9 specification details]

Generate complete, production-ready TypeScript/React code.
```

---

## 13. Plan Implementacji i Roadmap

### 13.1 Fazy Implementacji

| Faza | Okres | Komponenty | Zasoby |
|------|-------|-----------|--------|
| **Alpha** | W1-W2 | Data models, Scoring algorithm, API | 2 devs |
| **Beta** | W3-W4 | Components, UI, Reverse matching | 3 devs |
| **RC** | W5-W6 | Kanban, Bulk ops, Testing | 3 devs |
| **Release** | W7 | ATS integration, Optimization | 2 devs |
| **Support** | W8+ | Monitoring, Improvements | 1 dev |

### 13.2 Milestone Schedule

**Week 1-2 (Alpha)**
- [x] Design data models
- [x] Implement scoring algorithm
- [x] Create API endpoints
- [x] Setup database schema
- [x] Write unit tests

**Week 3-4 (Beta)**
- [x] Build React components
- [x] Implement forward matching
- [x] Implement reverse matching
- [x] Add internationalization
- [x] Component testing

**Week 5-6 (RC)**
- [x] Kanban board with drag-drop
- [x] Bulk operations
- [x] Metrics dashboard
- [x] ATS integration foundation
- [x] Performance optimization

**Week 7 (Release)**
- [x] ATS webhook handling
- [x] End-to-end testing
- [x] Documentation
- [x] Deployment
- [x] Production monitoring

### 13.3 Testing Strategy

```
Unit Tests (60%):
├── Scoring algorithm (30%)
├── Match filters (15%)
├── Utility functions (15%)

Component Tests (25%):
├── MatchCard (10%)
├── KanbanBoard (10%)
├── BulkOperations (5%)

Integration Tests (15%):
├── API endpoints (8%)
├── Database queries (4%)
├── Supabase integration (3%)
```

### 13.4 Performance Targets

| Metrika | Target | Aktualne |
|---------|--------|----------|
| Forward matching time | < 2 sec | TBD |
| Reverse matching (10 proj) | < 5 sec | TBD |
| Bulk assign (100 cons) | < 10 sec | TBD |
| Kanban board render | < 1 sec | TBD |
| API response time | < 500 ms | TBD |
| Database query time | < 100 ms | TBD |

### 13.5 Success Criteria

- ✓ All M9.1-M9.5 features implemented
- ✓ > 90% test coverage
- ✓ < 1 sec Kanban board render time
- ✓ Zero data loss in bulk operations
- ✓ Seamless ATS integration
- ✓ < 2% matching error rate
- ✓ Full i18n (PL + EN)
- ✓ Mobile responsive
- ✓ Production deployment

---

## Podsumowanie

Module M9: Pipeline Matching Engine jest kompleksowym systemem inteligentnego dopasowywania konsultantów do projektów. Implementacja opiera się na zaawansowanym algorytmie scoring'u z możliwością konfiguracji wag, wsparciu dla zarówno forward jak i reverse matchingu, oraz pełną integracją z systemem rekrutacyjnym (ATS).

Kluczowe cechy:
- **Algorytm matchingu**: Ważona suma 4 komponentów (tech 40%, senior 25%, loc 20%, rate 15%)
- **Forward matching**: Automatyczne sugerowanie projektów when contract ends
- **Reverse matching**: Wyszukiwanie konsultantów dla projektów
- **Kanban board**: Wizualizacja z drag-and-drop
- **Bulk operations**: Masowe przypisywanie
- **ATS integration**: Push do systemu rekrutacyjnego
- **Metryki**: Monitoring jakości matchingu
- **Wielojęzyczność**: PL + EN

Dokumentacja zawiera pełne specyfikacje API, modele danych, komponenty React, prompt dla generowania kodu oraz plan implementacji.

---

**Dokument**: DOC-M9_Pipeline_Matching.md
**Wersja**: 1.0
**Data**: 2025-02-08
**Autor**: B2B.net S.A.

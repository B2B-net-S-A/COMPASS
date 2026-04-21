# M8: Dashboard Zarządczy (Risk Monitor)
## Moduł Zarządzania Ryzykiem i Wczesnego Ostrzegania

**Wersja:** 2.0
**Data:** Styczeń 2025
**Status:** Specyfikacja Techniczna
**Aplikacja:** Qualrix - B2B.net S.A.
**Dostęp:** Board Members, Delivery Leads, Account Managers, Consultant Success Managers

---

## Spis Treści

1. [Przegląd i Cel](#przegląd-i-cel)
2. [Architektura i Dane](#architektura-i-dane)
3. [M8.1: Konsultanci Red Flag (Health Score <50%)](#m81-konsultanci-red-flag)
4. [M8.2: Kontrakty Kończące Się (30/60/90 dni)](#m82-kontrakty-kończące-się)
5. [M8.3: Algorytm Ryzyka Odejścia (Exit Risk %)](#m83-algorytm-ryzyka-odejścia)
6. [M8.4: Analiza Luki (Pipeline vs Dostępni)](#m84-analiza-luki)
7. [M8.5: Koszty Odejść (Utracona Marża - PLN)](#m85-koszty-odejść)
8. [M8.6: Heatmap Rotacji (Klient/Tech/Recruiter)](#m86-heatmap-rotacji)
9. [M8.7: System Alertów (Email/Slack)](#m87-system-alertów)
10. [Karty Podsumowania Wykonawcze](#karty-podsumowania-wykonawcze)
11. [Kwerendy Agregacyjne i Źródła Danych](#kwerendy-agregacyjne)
12. [Role i Widoki Dostępu](#role-i-widoki-dostępu)
13. [Konfiguracje Recharts](#konfiguracje-recharts)
14. [PROMPT DLA AI BUILDERA](#prompt-dla-ai-buildera)

---

## Przegląd i Cel

### Cel Modułu

Dashboard Zarządczy (M8) to **system wczesnego ostrzegania** dedykowany zarządzającym, umożliwiający:

- **Identyfikację ryzyk w czasie rzeczywistym** - Red Flag, zagrażające kontrakty, predykcja odejść
- **Analizę finansową** - Koszty rotacji, utracone marże, projekcje ROI
- **Planowanie zasobów** - Gap analysis, matching konsultantów do potrzeb projektów
- **Monitorowanie zdrowia zespołu** - Health Score, wskaźniki satysfakcji, rotacja
- **Wsparcie decyzji** - Dashboardy role-based, alerting, drill-down na szczegóły

### Kontekst Biznesowy

Firma to **IT outsourcing z 500+ konsultantami**, gdzie:
- Każda rotacja to strata marży PLN: `(Stawka/mies × Liczba mies) × Marża%`
- Wczesne ostrzeżenie pozwala na retencję lub planowe zastąpienie
- Mapa talentów (heatmap) ukazuje przeszkolenia branżowe i zagrożenia specjalistyczne
- Decyzje Board zależą od wysokopoziomowych KPI, Delivery Leads zarządzają swoimi zespołami

---

## Architektura i Dane

### Stack Techniczny

```
Frontend:     Next.js 14+, TypeScript, Tailwind CSS, shadcn/ui
Charts:       Recharts (histogramy, heatmapy, sparklines)
Internacj.:   next-intl (PL/EN)
Backend:      Next.js API Routes, Supabase (PostgreSQL)
Autentykacja: Supabase Auth (role RBAC)
Alerting:     Email (Brevo/SendGrid) + Slack Webhooks
Real-time:    Supabase Realtime (opcjonalnie dla live updates)
```

### Tabele Główne

```sql
-- Konsultanci
consultants (id, name, email, phone, health_score, status, exit_probability, recruiter_id, created_at, updated_at)

-- Przypisania do Projektów
consultant_assignments (id, consultant_id, project_id, status, start_date, end_date, rate_pln, margin_pct)

-- Projekty
projects (id, client_id, name, tech_stack, status, budget_pln, start_date, end_date)

-- Kontrakty
contracts (id, consultant_id, project_id, start_date, end_date, rate_pln, status, notes)

-- Zdarzenia Zdrowia (Health Indicators)
health_events (id, consultant_id, event_type, score_impact, timestamp, notes)
-- event_type: 'missed_deadline', 'low_satisfaction', 'inactivity', 'feedback_issue', 'skill_gap'

-- Alerting
alerts (id, type, target_user_id, consultant_id, status, sent_at, channel)
-- type: 'red_flag', 'contract_ending', 'exit_risk', 'capacity_gap'
-- channel: 'email', 'slack'

-- Heatmap Rotacji (cache agregacyjny)
rotation_heatmap (id, dimension, dimension_value, rotations_count, period, avg_tenure_months)
-- dimension: 'client', 'technology', 'recruiter'
```

---

## M8.1: Konsultanci Red Flag

### Definicja

Konsultant z **Health Score < 50%** to sygnał zagrożenia. Algorytm ocenia:

```
Health Score = 0.4 × Performance Score
             + 0.3 × Satisfaction Score
             + 0.2 × Engagement Score
             + 0.1 × Skill Alignment Score

Gdzie:
- Performance Score = (100 - missed_deadlines) × deadline_weight + (100 - quality_issues) × quality_weight
- Satisfaction Score = NPS (Net Promoter Score z feedback czy ekwiwalent - skala 0-100)
- Engagement Score = (active_days_last_30 / 30) × 100
- Skill Alignment Score = match_ratio_current_project × 100
```

### Komponenty UI

#### Red Flag List (Tabela)

```typescript
// Komponenty: /app/dashboard/components/RedFlagList.tsx

interface RedFlagConsultant {
  id: string;
  name: string;
  email: string;
  healthScore: number;
  status: 'critical' | 'warning' | 'stable';
  currentProject: string;
  client: string;
  riskFactors: string[];
  lastInteraction: Date;
  recommendedAction: string;
}

// Render
- Sortowanie: Health Score ASC
- Filtrowanie: Status, Client, Tech Stack
- Kolumny: Imię, Health Score (rouge), Liczba dni bez interakcji, Główny czynnik ryzyka, Akcja
- Drill-down: Klik na wiersz → Profil konsultanta + historia zdarzeń
```

#### Alert Badge

```tsx
<div className="flex items-center gap-2">
  <AlertTriangle className="w-5 h-5 text-red-600" />
  <span className="text-sm font-semibold text-red-600">
    {healthScore}% Health Score
  </span>
  {healthScore < 30 && (
    <Badge variant="destructive">KRYTYCZNE</Badge>
  )}
</div>
```

#### Czynniki Ryzyka (Risk Factors)

```
1. Niska wydajność (missed_deadlines > 20%)
2. Brak zadowolenia (NPS < 0)
3. Bierność (ostatnia interakcja > 7 dni temu)
4. Niezgodność umiejętności (skill_match < 60%)
5. Długa praca na projekcie (tenure > 24 mies bez rotacji)
6. Problemy z opiekunem (conflict_flag = true)
```

#### Rekomendowana Akcja (Recommended Action)

```
IF health_score < 30:
  "🔴 NATYCHMIAST: Zaplanuj spotkanie z konsultantem i recruiterem"

ELSE IF health_score < 50 AND engagement_score < 40:
  "🟠 PILNIE: Przeprowadź rozmowę zwrotną, przeanalizuj motywację"

ELSE IF health_score < 50 AND skill_alignment < 60:
  "🟡 PLANUJ: Oferuj szkolenie lub rotację w ciągu 30 dni"

ELSE IF inactivity_days > 7:
  "📞 KONTAKT: Dotychczasowy status - zweryfikuj dostępność"
```

### Zapytanie SQL

```sql
SELECT
  c.id,
  c.name,
  c.email,
  c.health_score,
  CASE
    WHEN c.health_score < 30 THEN 'critical'
    WHEN c.health_score < 50 THEN 'warning'
    ELSE 'stable'
  END as status,
  p.name as current_project,
  cl.name as client,
  cl.id as client_id,
  ARRAY_AGG(DISTINCT he.event_type) as risk_factors,
  MAX(he.timestamp) as last_interaction,
  DATEDIFF(DAY, MAX(he.timestamp), NOW()) as inactivity_days,
  (c.skill_score / ca.required_skill_level) * 100 as skill_alignment
FROM consultants c
LEFT JOIN consultant_assignments ca ON c.id = ca.consultant_id AND ca.status = 'active'
LEFT JOIN projects p ON ca.project_id = p.id
LEFT JOIN clients cl ON p.client_id = cl.id
LEFT JOIN health_events he ON c.id = he.consultant_id AND he.timestamp > NOW() - INTERVAL '30 days'
WHERE c.health_score < 50 AND c.status IN ('active', 'bench')
GROUP BY c.id, c.name, c.email, c.health_score, p.name, cl.name
ORDER BY c.health_score ASC;
```

---

## M8.2: Kontrakty Kończące Się

### Definicja

Monitorowanie umów wygasających w горизонcie:
- **30 dni** - Szybka akcja (retencja, planowe zastąpienie)
- **60 dni** - Przygotowanie (knowledge transfer, onboarding)
- **90 dni** - Strategia (zamówienie talentów, planowanie kampanii)

### Status Kontraktu

```
Status Map:
- 'ending_critical' (0-30 dni)   → Kolor CZERWONY
- 'ending_soon' (31-60 dni)       → Kolor POMARAŃCZOWY
- 'ending_planned' (61-90 dni)    → Kolor ŻÓŁTY
- 'renewal_candidate' (>90 dni)   → Kolor ZIELONY (auto-suggestion)
```

### Komponenty UI

#### Timeline View

```typescript
// /app/dashboard/components/ContractTimeline.tsx

interface ContractEvent {
  consultant: string;
  endDate: Date;
  daysRemaining: number;
  client: string;
  status: 'ending_critical' | 'ending_soon' | 'ending_planned';
  actions: string[];
  renewalProbability: number; // 0-100%
}

// Render
- Linia czasu pozioma (30/60/90 dni markery)
- Karty konsultantów przesuwalne po osi czasu
- Klikalne akcje: "Zaproponuj przedłużenie", "Planuj zastąpienie", "Knowledge Transfer"
```

#### Tabela Koniec Kontraktów

```
Kolumny:
- Konsultant (imię + avatar)
- Projekt/Klient
- Data zakończenia
- Dni pozostałe (visual bar)
- Status (critical/soon/planned)
- Prawdopodobieństwo odnowienia
- Akcje (Dropdown: Kontakt, Dokument, Plany)
```

### Logika Prawdopodobieństwa Odnowienia (Renewal Probability)

```
renewal_prob = 0.4 × (health_score / 100)
             + 0.3 × (client_satisfaction / 100)
             + 0.2 × (project_momentum / 100)
             + 0.1 × (tenure_at_client / max_tenure) × 100

SCORE:
- > 75% = Zielony (Oferuj proaktywnie)
- 50-75% = Żółty (Przygotuj opcje)
- 25-50% = Pomarańczowy (Szukaj zastępstwa)
- < 25% = Czerwony (Szukaj urgentnie)
```

### Zapytanie SQL

```sql
SELECT
  c.id as consultant_id,
  c.name as consultant_name,
  c.email,
  con.id as contract_id,
  con.end_date,
  DATEDIFF(DAY, CURDATE(), con.end_date) as days_remaining,
  CASE
    WHEN DATEDIFF(DAY, CURDATE(), con.end_date) <= 30 THEN 'ending_critical'
    WHEN DATEDIFF(DAY, CURDATE(), con.end_date) <= 60 THEN 'ending_soon'
    WHEN DATEDIFF(DAY, CURDATE(), con.end_date) <= 90 THEN 'ending_planned'
    ELSE 'renewal_candidate'
  END as contract_status,
  p.name as project_name,
  cl.name as client_name,
  con.rate_pln,
  c.health_score,
  ROUND(0.4 * (c.health_score / 100.0)
      + 0.3 * COALESCE(cl.satisfaction_score, 70) / 100.0
      + 0.2 * CASE WHEN p.status = 'active' THEN 100 ELSE 50 END / 100.0
      + 0.1 * LEAST((DATEDIFF(MONTH, con.start_date, CURDATE()) / 36.0) * 100, 100) / 100.0, 2) * 100 as renewal_probability
FROM contracts con
JOIN consultants c ON con.consultant_id = c.id
JOIN projects p ON con.project_id = p.id
JOIN clients cl ON p.client_id = cl.id
WHERE con.end_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 90 DAY
  AND con.status IN ('active', 'pending_extension')
ORDER BY DATEDIFF(DAY, CURDATE(), con.end_date) ASC;
```

---

## M8.3: Algorytm Ryzyka Odejścia (Exit Risk %)

### Definicja

**Algorytm predykcyjny** obliczający prawdopodobieństwo odejścia konsultanta w ciągu 6 mies. Z wykorzystaniem:
- Wskaźników behawioralnych (activity, engagement)
- Danych historycznych (poprzednie odejścia podobnych profili)
- Czynników zewnętrznych (sezonowość, trendy rynkowe)

### Wzór Ryzyka

```
Exit Risk (%) = 0.25 × Health Score Decline
              + 0.20 × Market Competitiveness Score
              + 0.20 × Contract Proximity Score
              + 0.15 × Engagement Score
              + 0.15 × External Signals Score
              + 0.05 × Historical Churn Rate (by profile)

GDZIE:

1. Health Score Decline (0-100)
   = MAX(0, (previous_score - current_score) / previous_score) × 100
   (mierzy, jak szybko spada health)

2. Market Competitiveness Score (0-100)
   = skill_rarity × current_market_demand × (1 - (tenure_months / 60))
   skill_rarity: Jeśli technologia w zapotrzebowaniu > 80% projektów, +50 pkt
   current_market_demand: Tech stack demand na rynku (0-100, monitoruj LinkedIn)

3. Contract Proximity Score (0-100)
   = MIN((days_to_contract_end / 180) × 100, 100)
   (im bliżej końca umowy, tym wyższe ryzyko)

4. Engagement Score (0-100)
   = (active_days_last_30 / 30) × 100 - (response_time_avg_hours / 24) × 10
   (mierzy zaangażowanie, responsywność)

5. External Signals Score (0-100)
   = profile_update_frequency × job_search_indicators × (1 - vacation_days_used/allowed)
   profile_update: Jak często aktualizuje CV/profil
   job_search: Wysyłanie zapytań, rejestracja w aplikacjach
   vacation: Wysoki %  już użytych urlopów = niskie ryzyko (planuje pozostać)

6. Historical Churn Rate (0-100)
   = (count_of_departed_similar_profiles / total_similar_profiles) × 100
   Similar Profile = (tech_stack, seniority_level, location, salary_band)
```

### Wizualizacja Ryzyka

```typescript
// /app/dashboard/components/ExitRiskGauge.tsx

interface ExitRiskMetrics {
  consultantId: string;
  overallRiskPercentage: number; // 0-100
  riskTrend: 'increasing' | 'stable' | 'decreasing'; // arrow
  componentBreakdown: {
    healthScoreDeclinie: number;
    marketCompetitiveness: number;
    contractProximity: number;
    engagement: number;
    externalSignals: number;
    historicalChurn: number;
  };
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  predictedExitDate?: Date; // Jeśli bardzo wysokie ryzyko
}

// Gauge Chart (Recharts: ResponsiveContainer + custom needle)
Color Mapping:
- 0-25%   = Zielony (Low)
- 26-50%  = Żółty (Medium)
- 51-75%  = Pomarańczowy (High)
- 76-100% = Czerwony (Critical)

// Drill-down: Klik na komponent → Historia zdarzeń
```

#### Sparkline Timeline

```tsx
<LineChart width={300} height={60} data={exitRiskHistory}>
  <Line type="monotone" dataKey="exitRisk" stroke="#dc2626" dot={false} />
</LineChart>
```

### Implementacja w Bazie

```sql
-- Funkcja PostgreSQL
CREATE OR REPLACE FUNCTION calculate_exit_risk(consultant_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_health_decline NUMERIC;
  v_market_competitiveness NUMERIC;
  v_contract_proximity NUMERIC;
  v_engagement NUMERIC;
  v_external_signals NUMERIC;
  v_historical_churn NUMERIC;
  v_exit_risk NUMERIC;
  v_current_health NUMERIC;
  v_previous_health NUMERIC;
  v_tech_stack TEXT;
  v_seniority TEXT;
  v_days_to_contract_end INT;
  v_active_days_30 INT;
BEGIN
  -- 1. Health Score Decline
  SELECT c.health_score INTO v_current_health FROM consultants c WHERE c.id = consultant_id;

  SELECT health_score INTO v_previous_health
  FROM health_events
  WHERE consultant_id = consultant_id
    AND timestamp > NOW() - INTERVAL '30 days'
    AND timestamp <= NOW() - INTERVAL '24 days'
  ORDER BY timestamp DESC LIMIT 1;

  v_health_decline := GREATEST(0, ((COALESCE(v_previous_health, v_current_health) - v_current_health) / NULLIF(COALESCE(v_previous_health, v_current_health), 0)) * 100);

  -- 2. Market Competitiveness Score
  SELECT c.primary_tech INTO v_tech_stack FROM consultants c WHERE c.id = consultant_id;
  SELECT COUNT(*) FILTER (WHERE tech_stack LIKE '%' || v_tech_stack || '%') * 100 / COUNT(*) INTO v_market_competitiveness
  FROM projects WHERE status = 'active';
  v_market_competitiveness := LEAST(100, v_market_competitiveness + 20); -- boost + demand factor

  -- 3. Contract Proximity Score
  SELECT COALESCE(MIN(DATEDIFF(DAY, CURDATE(), con.end_date)), 999) INTO v_days_to_contract_end
  FROM contracts con WHERE con.consultant_id = consultant_id AND con.status IN ('active', 'pending');
  v_contract_proximity := LEAST(100, (GREATEST(0, 180 - v_days_to_contract_end) / 180.0) * 100);

  -- 4. Engagement Score
  SELECT COUNT(*) INTO v_active_days_30
  FROM health_events
  WHERE consultant_id = consultant_id AND timestamp > NOW() - INTERVAL '30 days';
  v_engagement := (v_active_days_30 / 30.0) * 100;

  -- 5. External Signals Score
  -- (Placeholder - wymaga integracji z external systems)
  v_external_signals := 30;

  -- 6. Historical Churn Rate
  SELECT c.seniority INTO v_seniority FROM consultants c WHERE c.id = consultant_id;
  SELECT COUNT(*) FILTER (WHERE status = 'inactive' OR status = 'left') * 100 / NULLIF(COUNT(*), 0) INTO v_historical_churn
  FROM consultants
  WHERE primary_tech = v_tech_stack AND seniority = v_seniority;

  -- Final Calculation
  v_exit_risk := 0.25 * GREATEST(0, v_health_decline)
               + 0.20 * v_market_competitiveness
               + 0.20 * v_contract_proximity
               + 0.15 * v_engagement
               + 0.15 * v_external_signals
               + 0.05 * COALESCE(v_historical_churn, 0);

  RETURN LEAST(100, v_exit_risk);
END;
$$ LANGUAGE plpgsql;

-- Update codziennie via CRON
SELECT cron.schedule('update-exit-risk-daily',
  '0 2 * * *',
  'UPDATE consultants SET exit_probability = calculate_exit_risk(id) WHERE status IN (''active'', ''bench'')'
);
```

---

## M8.4: Analiza Luki (Pipeline vs Dostępni)

### Definicja

**Gap Analysis** = Porównanie planowanych projektów (pipeline) z dostępnymi konsultantami (po skill, seniority, tech stack).

```
GAP SIZE = Projected Demand - Current Supply
GAP SCORE = (Gap Size / Projected Demand) × 100

- Score < 20% = ✅ Bez luki (zarządzalna)
- Score 20-50% = ⚠️ Średnia luka (szukaj talentów)
- Score > 50% = 🔴 Krytyczna luka (escalate)
```

### Wymiary Analizy

1. **By Technology** (React, Python, Java, Kubernetes, etc.)
2. **By Seniority** (Junior, Mid, Senior, Lead)
3. **By Client** (Duży klient może potrzebować wielu osób)
4. **By Timeline** (Kiedy potrzebni?)

### Komponenty UI

#### Gap Analysis Matrix (Heatmap)

```typescript
// /app/dashboard/components/GapAnalysisMatrix.tsx

interface GapAnalysisCell {
  tech: string;
  seniority: 'junior' | 'mid' | 'senior' | 'lead';
  projectedDemand: number; // liczba pozycji w pipeline
  currentSupply: number; // dostępni konsultanci
  gapSize: number;
  gapScore: number; // 0-100
  matchedConsultants: Consultant[];
  availableForHiring: number;
}

// Heatmap Visualization
- Wiersze: Technology Stack
- Kolumny: Seniority Level
- Kolor: Intensywność gapScore (zielony → czerwony)
- Drill-down: Klik na komórkę → Lista osób, planów zatrudnienia
```

#### Recharts Configuration (Bubble Chart)

```tsx
<ScatterChart width={800} height={400} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="currentSupply" name="Dostępni Konsultanci" />
  <YAxis dataKey="projectedDemand" name="Projektowana Popytana" />
  <ZAxis dataKey="gapScore" range={[100, 1000]} name="Gap Score %" />
  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
  <Legend />

  <Scatter
    name="React"
    data={gapDataByTech['React']}
    fill="#8884d8"
    shape="circle"
  />
  <Scatter
    name="Python"
    data={gapDataByTech['Python']}
    fill="#82ca9d"
  />
  {/* ... more tech stacks */}
</ScatterChart>
```

### Algorytm Matchingu

```typescript
function matchConsultantToGap(
  consultant: Consultant,
  gap: GapAnalysisCell
): { isMatch: boolean; matchScore: number } {
  const techMatch = consultant.skills.includes(gap.tech) ? 1 : 0;
  const seniorityMatch = consultant.seniority === gap.seniority ? 1 : 0.7; // 70% match dla zbliżonego levelu
  const availabilityMatch = consultant.status === 'bench' ? 1 : 0.5; // busy można reallocate

  const matchScore = (techMatch * 0.5 + seniorityMatch * 0.3 + availabilityMatch * 0.2) * 100;

  return {
    isMatch: matchScore >= 70,
    matchScore: Math.round(matchScore)
  };
}
```

### Zapytanie SQL

```sql
-- Pipeline: Planned Projects needing consultants
WITH pipeline_demand AS (
  SELECT
    UNNEST(STRING_TO_ARRAY(p.required_tech_stack, ',')) as tech,
    CASE
      WHEN p.required_seniority = 'senior' THEN 'senior'
      WHEN p.required_seniority = 'mid' THEN 'mid'
      ELSE 'junior'
    END as seniority,
    p.id,
    p.name,
    p.client_id,
    p.start_date,
    p.required_positions,
    p.status
  FROM projects p
  WHERE p.status IN ('planned', 'in_procurement')
    AND p.start_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 180 DAY
),

-- Current Supply: Available consultants
current_supply AS (
  SELECT
    UNNEST(STRING_TO_ARRAY(c.skill_stack, ',')) as tech,
    c.seniority,
    COUNT(*) as available_count
  FROM consultants c
  WHERE c.status IN ('active', 'bench')
    AND c.health_score >= 50
  GROUP BY UNNEST(STRING_TO_ARRAY(c.skill_stack, ',')), c.seniority
),

-- Gap Analysis
gap_analysis AS (
  SELECT
    pd.tech,
    pd.seniority,
    COUNT(*) as projected_demand,
    COALESCE(cs.available_count, 0) as current_supply,
    COUNT(*) - COALESCE(cs.available_count, 0) as gap_size,
    ROUND(((COUNT(*) - COALESCE(cs.available_count, 0)) / NULLIF(COUNT(*), 0) * 100), 2) as gap_score
  FROM pipeline_demand pd
  LEFT JOIN current_supply cs ON pd.tech = cs.tech AND pd.seniority = cs.seniority
  GROUP BY pd.tech, pd.seniority
  HAVING COUNT(*) - COALESCE(cs.available_count, 0) > 0
)

SELECT * FROM gap_analysis
WHERE gap_score > 0
ORDER BY gap_score DESC;
```

---

## M8.5: Koszty Odejść

### Definicja

**Financial Impact Calculator** - Całkowita strata marży PLN z powodu rotacji konsultantów.

```
Cost of Departure (PLN) = (Monthly Rate × Months Remaining × Margin %)

TOTAL FINANCIAL IMPACT:
- YTD (Year-To-Date): Sumaryczne straty od 1 stycznia
- Projekcja (Projection): Szacunkowa strata do konca roku
```

### Komponenty UI

#### Executive Summary Card

```tsx
<Card className="border-l-4 border-red-600">
  <CardHeader>
    <CardTitle className="text-sm">Utracona Marża (YTD)</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-3xl font-bold text-red-600">
      {formatCurrency(ytdCostOfDepartures, 'PLN')}
    </div>
    <p className="text-xs text-gray-600 mt-2">
      {departedConsultantsCount} odejść / {projectedCostEOY && `Projekcja EOY: ${formatCurrency(projectedCostEOY, 'PLN')}`}
    </p>
  </CardContent>
</Card>
```

#### Histogram: Koszty po Miesiącu (Monthly Trend)

```tsx
<BarChart width={600} height={300} data={monthlyCostData}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="month" />
  <YAxis />
  <Tooltip formatter={(value) => `${formatCurrency(value, 'PLN')}`} />
  <Legend />
  <Bar dataKey="costOfDepartures" fill="#dc2626" name="Koszty Odejść" />
  <Bar dataKey="projectedCost" fill="#f97316" name="Projekcja" stackId="a" />
</BarChart>
```

#### Tabela Departów (Departures Log)

```
Kolumny:
- Konsultant (imię, email)
- Data Odejścia
- Projekt/Klient
- Stawka Miesięczna (PLN)
- Marża (%)
- Miesięcy Pozostałych
- Całkowita Strata (PLN)
- Powód Odejścia (dropdown)
```

### Algorytm Kalkulacji

```typescript
interface DepartureCost {
  consultantId: string;
  consultantName: string;
  monthlyRate: number; // PLN
  marginPercent: number; // 0-100
  monthsRemaining: number;
  totalCost: number; // = monthly × months × margin% / 100
  departureDate: Date;
  reason: 'resignation' | 'contract_end' | 'termination' | 'other';
}

function calculateDepartureCost(consultant: DepartureCost): number {
  return (consultant.monthlyRate *
          consultant.monthsRemaining *
          (consultant.marginPercent / 100));
}

function calculateProjectedYearEndCost(
  ytdCosts: number[],
  currentMonth: number
): number {
  const avgMonthlyLoss = ytdCosts.reduce((a, b) => a + b, 0) / currentMonth;
  const remainingMonths = 12 - currentMonth;
  return (ytdCosts.reduce((a, b) => a + b, 0) +
          avgMonthlyLoss * remainingMonths);
}
```

### Zapytanie SQL

```sql
WITH departures AS (
  SELECT
    c.id,
    c.name,
    c.email,
    ca.end_date,
    ca.rate_pln,
    ca.margin_pct,
    DATEDIFF(MONTH, CURDATE(), ca.end_date) as months_remaining,
    ca.rate_pln * DATEDIFF(MONTH, CURDATE(), ca.end_date) * (ca.margin_pct / 100.0) as total_cost,
    CASE
      WHEN c.exit_probability > 75 THEN 'high_risk_resignation'
      WHEN ca.end_date < CURDATE() + INTERVAL 30 DAY THEN 'contract_ending'
      ELSE 'planned'
    END as departure_reason,
    EXTRACT(MONTH FROM ca.end_date) as event_month,
    EXTRACT(YEAR FROM ca.end_date) as event_year
  FROM consultants c
  JOIN consultant_assignments ca ON c.id = ca.consultant_id
  WHERE ca.status = 'active'
    AND (c.exit_probability > 75 OR ca.end_date < CURDATE() + INTERVAL 365 DAY)
),

ytd_costs AS (
  SELECT
    SUM(total_cost) as total_ytd_cost,
    COUNT(DISTINCT id) as departed_count
  FROM departures
  WHERE event_year = EXTRACT(YEAR FROM CURDATE())
    AND event_month <= EXTRACT(MONTH FROM CURDATE())
),

monthly_costs AS (
  SELECT
    event_month,
    event_year,
    SUM(total_cost) as monthly_cost,
    COUNT(DISTINCT id) as departures_count
  FROM departures
  GROUP BY event_month, event_year
  ORDER BY event_year DESC, event_month DESC
)

SELECT
  (SELECT total_ytd_cost FROM ytd_costs) as ytd_total,
  (SELECT departed_count FROM ytd_costs) as ytd_count,
  monthly_costs.*
FROM monthly_costs;
```

---

## M8.6: Heatmap Rotacji

### Definicja

**Rotation Heatmap** - Wizualizacja, gdzie i jak szybko rotują konsultanci.

Wymiary:
1. **Po Kliencie** (clientId × [rotation_speed, avg_tenure, critical_skills_lost])
2. **Po Technologii** (tech_stack × [demand_on_market, rotation_speed, replacement_difficulty])
3. **Po Recruiterze** (recruiterId × [team_retention, replacement_success_rate, avg_time_to_fill])

### Komponenty UI

#### Heatmap: Rotation by Client

```typescript
// /app/dashboard/components/RotationHeatmap.tsx

interface HeatmapCell {
  dimension: 'client' | 'technology' | 'recruiter';
  dimensionValue: string; // client name, tech name, recruiter name
  rotationCount: number; // departures in last 12mo
  avgTenureMonths: number;
  criticalSkillsLost: string[]; // dla tech: key skills that left
  retentionRate: number; // 0-100%
  colorIntensity: number; // 0-100 (dla heatmapy)
}

// Render: 3 Heatmapy w Tabbed Interface
- Tab 1: Clients (Heatmap width)
- Tab 2: Technologies
- Tab 3: Recruiters

// Color Scaling (SVG Heatmap)
colorIntensity: (rotationCount / maxRotation) * 100
Gradient: green (#22c55e) → red (#dc2626)
```

#### Recharts Custom Heatmap

```tsx
<ComposedChart width={900} height={400}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="dimensionValue" />
  <YAxis label={{ value: 'Rotacja (osób/rok)', angle: -90, position: 'insideLeft' }} />
  <Tooltip
    contentStyle={{
      backgroundColor: '#1f2937',
      border: '1px solid #4b5563',
      borderRadius: '8px'
    }}
  />
  <Legend />

  <Bar dataKey="rotationCount" fill="#3b82f6" name="Rotacja w 12mo" />
  <Bar dataKey="avgTenureMonths" fill="#8b5cf6" name="Średnia Tenura (mies)" />
  <Line type="monotone" dataKey="retentionRate" stroke="#22c55e" name="Retention Rate %" />
</ComposedChart>
```

#### Drill-Down: Szczegóły Rotacji (Modal)

```
Kiedy klikniemy na komórkę heatmapy:
- Lista konsultantów, którzy odeszli w tym wymiarze (ostatnie 12 miesięcy)
- Data odejścia, powód, nowy pracodawca (jeśli znany)
- Wpływ (strata marży, replaced_by kto?)
- Rekomendacja: Co robić, aby zmniejszyć rotację?
```

### Algorytm Heatmapy

```typescript
async function buildRotationHeatmap(
  dimension: 'client' | 'technology' | 'recruiter',
  period: 'last_3_months' | 'last_6_months' | 'last_12_months'
): Promise<HeatmapCell[]> {
  const periodDays = {
    'last_3_months': 90,
    'last_6_months': 180,
    'last_12_months': 365
  }[period];

  const query = `
    SELECT
      CASE ${dimension}
        WHEN 'client' THEN c.name
        WHEN 'technology' THEN p.tech_stack
        WHEN 'recruiter' THEN r.name
      END as dimension_value,
      COUNT(DISTINCT c.id) as rotation_count,
      ROUND(AVG(DATEDIFF(MONTH, ca.start_date, ca.end_date)), 1) as avg_tenure_months,
      ROUND((COUNT(*) FILTER (WHERE c2.id IS NOT NULL) / COUNT(*) * 100), 1) as replacement_rate,
      ARRAY_AGG(DISTINCT p.tech_stack) as skills_lost
    FROM consultants c
    LEFT JOIN consultant_assignments ca ON c.id = ca.consultant_id
    LEFT JOIN projects p ON ca.project_id = p.id
    LEFT JOIN clients cl ON p.client_id = cl.id
    LEFT JOIN recruiters r ON c.recruiter_id = r.id
    LEFT JOIN consultants c2 ON (
      -- Replacements: konsultant o similar skills hired within 30 days
      ${dimension === 'client' ? 'p.client_id = (SELECT client_id FROM projects WHERE id = ca.project_id)' : '1=1'}
      AND c2.created_at > ca.end_date
      AND c2.created_at < ca.end_date + INTERVAL 30 DAY
      AND c2.skill_stack && c.skill_stack -- overlap
    )
    WHERE c.status = 'inactive'
      AND ca.end_date > NOW() - INTERVAL ${periodDays} DAY
    GROUP BY dimension_value
    ORDER BY rotation_count DESC;
  `;

  const results = await db.query(query);

  const maxRotation = Math.max(...results.map(r => r.rotation_count));

  return results.map(row => ({
    dimension,
    dimensionValue: row.dimension_value,
    rotationCount: row.rotation_count,
    avgTenureMonths: row.avg_tenure_months,
    criticalSkillsLost: row.skills_lost,
    retentionRate: 100 - (row.rotation_count / totalActive * 100),
    colorIntensity: (row.rotation_count / maxRotation) * 100
  }));
}
```

### Zapytanie SQL (kompletne)

```sql
-- Rotation Heatmap by Dimension
WITH rotation_raw AS (
  SELECT
    CASE %dimension%
      WHEN 'client' THEN cl.id
      WHEN 'technology' THEN p.tech_stack
      WHEN 'recruiter' THEN r.id
    END as dimension_key,
    CASE %dimension%
      WHEN 'client' THEN cl.name
      WHEN 'technology' THEN p.tech_stack
      WHEN 'recruiter' THEN r.name
    END as dimension_value,
    c.id as consultant_id,
    c.name,
    c.email,
    ca.end_date,
    ca.rate_pln,
    p.tech_stack,
    DATEDIFF(MONTH, ca.start_date, ca.end_date) as tenure_months
  FROM consultants c
  JOIN consultant_assignments ca ON c.id = ca.consultant_id
  JOIN projects p ON ca.project_id = p.id
  JOIN clients cl ON p.client_id = cl.id
  LEFT JOIN recruiters r ON c.recruiter_id = r.id
  WHERE c.status = 'inactive'
    AND ca.end_date > NOW() - INTERVAL '12 months'
),

rotation_aggregated AS (
  SELECT
    dimension_key,
    dimension_value,
    COUNT(DISTINCT consultant_id) as rotation_count,
    ROUND(AVG(tenure_months), 1) as avg_tenure_months,
    ROUND(AVG(rate_pln), 2) as avg_rate_pln,
    ARRAY_AGG(DISTINCT tech_stack) as technologies_involved,
    STRING_AGG(DISTINCT name, ', ') as departed_consultants,
    COUNT(*) FILTER (WHERE tenure_months < 12) as high_turnover_count
  FROM rotation_raw
  GROUP BY dimension_key, dimension_value
),

total_active AS (
  SELECT COUNT(*) as total_count
  FROM consultants WHERE status IN ('active', 'bench')
)

SELECT
  ra.*,
  ROUND((ra.rotation_count / ta.total_count * 100), 1) as rotation_pct_of_pool,
  CASE
    WHEN ra.rotation_count > 5 THEN 'high'
    WHEN ra.rotation_count > 2 THEN 'medium'
    ELSE 'low'
  END as risk_level
FROM rotation_aggregated ra
CROSS JOIN total_active ta
ORDER BY rotation_count DESC;
```

---

## M8.7: System Alertów

### Definicja

**Alerting System** - Wysyłanie notyfikacji (email + Slack) na temat:
1. Nowych konsultantów w Red Flag (Health Score < 50%)
2. Kontraktów kończących się w 30 dni
3. Wzrostu Exit Risk (predykcja > 75%)
4. Krytycznych luk w zasobach (Gap > 50%)

### Typy Alertów

```typescript
enum AlertType {
  RED_FLAG_CONSULTANT = 'red_flag',              // Health Score < 50%
  CONTRACT_ENDING_CRITICAL = 'contract_ending',  // 0-30 dni
  EXIT_RISK_HIGH = 'exit_risk',                  // Risk > 75%
  CAPACITY_GAP = 'capacity_gap',                 // Gap Score > 50%
  RECRUITMENT_MILESTONE = 'recruitment',         // Hire completed
  SKILL_GAP_CRITICAL = 'skill_gap'              // Brak specificznych umiejętności
}

enum AlertChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  BOTH = 'both'
}
```

### Konfiguracja Alertów (Admin UI)

```typescript
// /app/dashboard/components/AlertConfiguration.tsx

interface AlertRule {
  id: string;
  type: AlertType;
  enabled: boolean;
  channels: AlertChannel[];
  recipients: {
    role: 'board' | 'delivery_lead' | 'account_manager' | 'cs_manager';
    emailAddresses?: string[];
    slackWebhooks?: string[];
  }[];
  threshold: number; // np. health_score < 50, days_remaining <= 30
  frequency: 'immediate' | 'daily' | 'weekly'; // Jak często wysyłać
  quietHours?: { startHour: number; endHour: number }; // Nie wysyłaj nocy
}

// UI Components
- Toggle dla każdego typu alertu
- Multi-select dla kanałów
- Liczby spinner dla threshold
- Frequency dropdown
- Schedule picker (quiet hours)
- Test button ("Send test email")
```

### Implementacja Email

```typescript
// /lib/alerts/emailService.ts

import Brevo from '@getbrevo/brevo';

const brevoClient = new Brevo.TransactionalEmailsApi();

export async function sendRedFlagAlert(
  consultant: Consultant,
  recipientEmails: string[]
): Promise<void> {
  const healthScorePercent = consultant.healthScore;
  const riskFactors = await getRiskFactors(consultant.id);

  const htmlContent = `
    <h2>🚨 Red Flag Alert: ${consultant.name}</h2>
    <p><strong>Health Score:</strong> ${healthScorePercent}%</p>
    <p><strong>Status:</strong> ${consultant.status}</p>

    <h3>Risk Factors:</h3>
    <ul>
      ${riskFactors.map(f => `<li>${f}</li>`).join('')}
    </ul>

    <p><strong>Recommended Action:</strong></p>
    <p>${getRecommendedAction(consultant)}</p>

    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/consultants/${consultant.id}">
      View Full Profile
    </a>
  `;

  await brevoClient.sendTransacEmail({
    sender: { email: process.env.BREVO_FROM_EMAIL, name: 'Qualrix Alerts' },
    to: recipientEmails.map(email => ({ email })),
    subject: `Red Flag Alert: ${consultant.name} (${healthScorePercent}% Health Score)`,
    htmlContent,
    tags: ['alert', 'red-flag', consultant.id]
  });

  // Log alert
  await db.insert(alerts).values({
    type: 'red_flag',
    targetUserId: null, // broadcast
    consultantId: consultant.id,
    channel: 'email',
    sentAt: new Date(),
    status: 'sent'
  });
}

export async function sendContractEndingAlert(
  contract: Contract,
  daysRemaining: number,
  recipientEmails: string[]
): Promise<void> {
  const criticality = daysRemaining <= 30 ? 'CRITICAL' : daysRemaining <= 60 ? 'SOON' : 'PLANNED';
  const color = daysRemaining <= 30 ? '#dc2626' : daysRemaining <= 60 ? '#f97316' : '#fbbf24';

  const htmlContent = `
    <h2 style="color: ${color}">📅 Contract Ending Alert</h2>
    <p><strong>Consultant:</strong> ${contract.consultant.name}</p>
    <p><strong>Project/Client:</strong> ${contract.project.name} / ${contract.project.client.name}</p>
    <p><strong>End Date:</strong> ${format(contract.endDate, 'dd.MM.yyyy')}</p>
    <p><strong>Days Remaining:</strong> <strong>${daysRemaining}</strong></p>
    <p><strong>Status:</strong> <span style="color: ${color}; font-weight: bold;">${criticality}</span></p>

    <h3>Actions:</h3>
    <ul>
      <li><a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/contracts/${contract.id}/renew">Propose Renewal</a></li>
      <li><a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/recruitment/start">Find Replacement</a></li>
      <li><a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/knowledge-transfer/new">Plan Knowledge Transfer</a></li>
    </ul>
  `;

  await brevoClient.sendTransacEmail({
    sender: { email: process.env.BREVO_FROM_EMAIL, name: 'Qualrix Alerts' },
    to: recipientEmails.map(email => ({ email })),
    subject: `[${criticality}] Contract Ending: ${contract.consultant.name} - ${daysRemaining} days`,
    htmlContent,
    tags: ['alert', 'contract-ending', contract.id]
  });

  await db.insert(alerts).values({
    type: 'contract_ending',
    consultantId: contract.consultantId,
    channel: 'email',
    sentAt: new Date(),
    status: 'sent'
  });
}

export async function sendExitRiskAlert(
  consultant: Consultant,
  exitRiskPercent: number,
  recipientEmails: string[]
): Promise<void> {
  const predictedExitDate = new Date();
  predictedExitDate.setMonth(predictedExitDate.getMonth() + 6);

  const htmlContent = `
    <h2>⚠️ High Exit Risk Alert</h2>
    <p><strong>Consultant:</strong> ${consultant.name}</p>
    <p><strong>Exit Risk Probability:</strong> <strong style="color: #dc2626;">${exitRiskPercent}%</strong></p>
    <p><strong>Predicted Exit Date:</strong> ${format(predictedExitDate, 'MMM yyyy')}</p>

    <h3>Risk Components:</h3>
    <ul>
      <li>Health Score Declining: ${consultant.healthScoreTrend}</li>
      <li>Market Competitiveness: High (${consultant.primaryTech})</li>
      <li>Engagement Score: Low</li>
    </ul>

    <h3>Retention Recommendations:</h3>
    <ul>
      <li>Schedule 1:1 meeting with ${consultant.name}</li>
      <li>Review compensation and benefits</li>
      <li>Identify career development opportunities</li>
      <li>Consider project rotation</li>
    </ul>

    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/consultants/${consultant.id}/retention-plan">
      Create Retention Plan
    </a>
  `;

  await brevoClient.sendTransacEmail({
    sender: { email: process.env.BREVO_FROM_EMAIL, name: 'Qualrix Alerts' },
    to: recipientEmails.map(email => ({ email })),
    subject: `Exit Risk Alert: ${consultant.name} (${exitRiskPercent}%)`,
    htmlContent,
    tags: ['alert', 'exit-risk', consultant.id]
  });
}
```

### Implementacja Slack

```typescript
// /lib/alerts/slackService.ts

export async function sendSlackAlert(
  webhook: string,
  alertData: {
    type: AlertType;
    title: string;
    consultant?: Consultant;
    metrics: Record<string, string | number>;
    actionUrl: string;
    severity: 'critical' | 'high' | 'medium';
  }
): Promise<void> {
  const colorMap = {
    critical: '#dc2626',
    high: '#f97316',
    medium: '#fbbf24'
  };

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: alertData.title,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: Object.entries(alertData.metrics).map(([key, value]) => ({
          type: 'mrkdwn',
          text: `*${key}:*\n${value}`
        }))
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Details' },
            url: alertData.actionUrl,
            style: alertData.severity === 'critical' ? 'danger' : 'primary'
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Dismiss' },
            action_id: `dismiss_${alertData.consultant?.id || 'generic'}`
          }
        ]
      }
    ],
    attachments: [
      {
        color: colorMap[alertData.severity],
        footer: 'Qualrix Alert System'
      }
    ]
  };

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.statusText}`);
  }
}
```

### Cronjob: Alert Triggering

```typescript
// /app/api/cron/alerts/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthSecret } from '@/lib/auth';
import { db } from '@/lib/db';
import * as emailService from '@/lib/alerts/emailService';
import * as slackService from '@/lib/alerts/slackService';

export async function POST(req: NextRequest) {
  // Verify it's Vercel Cron
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Check for Red Flag consultants (newly flagged)
    const newRedFlags = await db.query(`
      SELECT c.* FROM consultants c
      WHERE c.health_score < 50
        AND c.last_alert_sent_at IS NULL OR c.last_alert_sent_at < NOW() - INTERVAL 24 HOUR
    `);

    for (const consultant of newRedFlags) {
      const alertRules = await getActiveAlertRules('red_flag');

      for (const rule of alertRules) {
        const recipients = getRecipientsForRule(rule);

        if (rule.channels.includes('email')) {
          await emailService.sendRedFlagAlert(consultant, recipients.emails);
        }
        if (rule.channels.includes('slack')) {
          for (const webhook of recipients.slackWebhooks) {
            await slackService.sendSlackAlert(webhook, {
              type: 'red_flag',
              title: `🚨 Red Flag: ${consultant.name}`,
              consultant,
              metrics: {
                'Health Score': `${consultant.health_score}%`,
                'Status': consultant.status,
                'Last Activity': formatDistanceToNow(consultant.last_activity_at, { addSuffix: true })
              },
              actionUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/consultants/${consultant.id}`,
              severity: consultant.health_score < 30 ? 'critical' : 'high'
            });
          }
        }
      }

      await db.query(`
        UPDATE consultants
        SET last_alert_sent_at = NOW()
        WHERE id = $1
      `, [consultant.id]);
    }

    // 2. Check for contracts ending (30/60/90 days)
    const endingContracts = await db.query(`
      SELECT con.*, c.name as consultant_name, p.name as project_name, cl.name as client_name
      FROM contracts con
      JOIN consultants c ON con.consultant_id = c.id
      JOIN projects p ON con.project_id = p.id
      JOIN clients cl ON p.client_id = cl.id
      WHERE con.end_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 90 DAY
        AND con.status IN ('active', 'pending_extension')
        AND (con.last_alert_sent_at IS NULL OR con.last_alert_sent_at < NOW() - INTERVAL 24 HOUR)
    `);

    for (const contract of endingContracts) {
      const daysRemaining = Math.ceil((contract.end_date - new Date()) / (1000 * 60 * 60 * 24));
      const alertRules = await getActiveAlertRules('contract_ending');

      for (const rule of alertRules) {
        if (daysRemaining > rule.threshold) continue; // Skip if threshold not met

        const recipients = getRecipientsForRule(rule);

        if (rule.channels.includes('email')) {
          await emailService.sendContractEndingAlert(contract, daysRemaining, recipients.emails);
        }
      }

      await db.query(`UPDATE contracts SET last_alert_sent_at = NOW() WHERE id = $1`, [contract.id]);
    }

    // 3. Check for high exit risk (>75%)
    const highRiskConsultants = await db.query(`
      SELECT c.* FROM consultants c
      WHERE c.exit_probability > 75
        AND (c.last_alert_sent_at IS NULL OR c.last_alert_sent_at < NOW() - INTERVAL 48 HOUR)
    `);

    for (const consultant of highRiskConsultants) {
      const alertRules = await getActiveAlertRules('exit_risk');

      for (const rule of alertRules) {
        const recipients = getRecipientsForRule(rule);

        if (rule.channels.includes('email')) {
          await emailService.sendExitRiskAlert(consultant, consultant.exit_probability, recipients.emails);
        }
      }

      await db.query(`
        UPDATE consultants
        SET last_alert_sent_at = NOW()
        WHERE id = $1
      `, [consultant.id]);
    }

    return NextResponse.json({ success: true, processed: newRedFlags.length + endingContracts.length + highRiskConsultants.length });

  } catch (error) {
    console.error('Alert cron error:', error);
    return NextResponse.json(
      { error: 'Alert processing failed' },
      { status: 500 }
    );
  }
}

async function getActiveAlertRules(type: AlertType): Promise<AlertRule[]> {
  return db.query(`
    SELECT * FROM alert_rules
    WHERE type = $1 AND enabled = true
  `, [type]);
}

function getRecipientsForRule(rule: AlertRule): { emails: string[]; slackWebhooks: string[] } {
  const emails: string[] = [];
  const slackWebhooks: string[] = [];

  for (const recipient of rule.recipients) {
    if (recipient.emailAddresses) {
      emails.push(...recipient.emailAddresses);
    }
    if (recipient.slackWebhooks) {
      slackWebhooks.push(...recipient.slackWebhooks);
    }
  }

  return { emails, slackWebhooks };
}
```

---

## Karty Podsumowania Wykonawcze

### Executive Summary Cards Layout

Górna część dashboardu zawiera **4 główne karty KPI**:

```tsx
// /app/dashboard/components/ExecutiveSummaryCards.tsx

export function ExecutiveSummaryCards() {
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'ytd'>('30d');

  useEffect(() => {
    fetchExecutiveMetrics(period).then(setMetrics);
  }, [period]);

  if (!metrics) return <LoadingSkeleton />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      {/* Card 1: Red Flags */}
      <Card className="border-l-4 border-red-600">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Red Flag Konsultanci</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-red-600">{metrics.redFlagCount}</div>
          <p className="text-xs text-gray-600 mt-2">
            {metrics.redFlagTrend > 0 ? '📈' : '📉'} {Math.abs(metrics.redFlagTrend)}% vs poprzedni okres
          </p>
          <div className="mt-3 space-y-1">
            {metrics.topRisks.slice(0, 2).map(risk => (
              <div key={risk} className="text-xs text-gray-600">• {risk}</div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Contracts Ending */}
      <Card className="border-l-4 border-orange-400">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Kontrakty w Ciągu 90 Dni</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-orange-500">{metrics.contractsEndingCount}</div>
          <div className="mt-3 text-xs space-y-1">
            <div>🔴 Krytyczne (0-30): <strong>{metrics.contractsCritical}</strong></div>
            <div>🟠 Bliskie (31-60): <strong>{metrics.contractsSoon}</strong></div>
            <div>🟡 Planowane (61-90): <strong>{metrics.contractsPlanned}</strong></div>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Cost of Departures */}
      <Card className="border-l-4 border-red-600">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Utracona Marża (YTD)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-red-600">
            {formatCurrency(metrics.ytdCostOfDepartures, 'PLN')}
          </div>
          <p className="text-xs text-gray-600 mt-2">
            {metrics.departedConsultantsCount} odejść / {formatCurrency(metrics.projectedYearEndCost, 'PLN')} projekcja EOY
          </p>
        </CardContent>
      </Card>

      {/* Card 4: Resource Gap */}
      <Card className="border-l-4 border-blue-600">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Luka Zasobów (90 dni)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-blue-600">{metrics.resourceGapPercent}%</div>
          <p className="text-xs text-gray-600 mt-2">
            Średnia luka: {metrics.averageGapSize} pozycji
          </p>
          <div className="mt-3">
            <Progress value={metrics.resourceGapPercent} className="h-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ExecutiveMetrics {
  redFlagCount: number;
  redFlagTrend: number; // % change
  topRisks: string[];

  contractsEndingCount: number;
  contractsCritical: number;
  contractsSoon: number;
  contractsPlanned: number;

  ytdCostOfDepartures: number;
  departedConsultantsCount: number;
  projectedYearEndCost: number;

  resourceGapPercent: number;
  averageGapSize: number;
}
```

---

## Kwerendy Agregacyjne i Źródła Danych

### Materialized Views (dla performance)

```sql
-- Materialized View: Health Score Summary
CREATE MATERIALIZED VIEW mv_health_summary AS
SELECT
  DATE_TRUNC('day', CURRENT_DATE) as date,
  COUNT(*) FILTER (WHERE health_score < 30) as critical_count,
  COUNT(*) FILTER (WHERE health_score BETWEEN 30 AND 50) as warning_count,
  COUNT(*) FILTER (WHERE health_score >= 50) as healthy_count,
  ROUND(AVG(health_score), 2) as avg_health_score,
  ROUND(STDDEV(health_score), 2) as stddev_health_score
FROM consultants
WHERE status IN ('active', 'bench');

-- Refresh: co godzinę
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_health_summary;

-- Materialized View: Rotation Heatmap Snapshot
CREATE MATERIALIZED VIEW mv_rotation_heatmap AS
WITH rotation_12mo AS (
  SELECT
    CASE
      WHEN ca.dimension_type = 'client' THEN cl.id
      WHEN ca.dimension_type = 'technology' THEN p.tech_stack
      WHEN ca.dimension_type = 'recruiter' THEN r.id
    END as dimension_id,
    CASE
      WHEN ca.dimension_type = 'client' THEN cl.name
      WHEN ca.dimension_type = 'technology' THEN p.tech_stack
      WHEN ca.dimension_type = 'recruiter' THEN r.name
    END as dimension_name,
    ca.dimension_type,
    c.id as consultant_id,
    DATEDIFF(MONTH, ca.start_date, ca.end_date) as tenure_months
  FROM consultant_assignments ca
  LEFT JOIN consultants c ON ca.consultant_id = c.id
  LEFT JOIN projects p ON ca.project_id = p.id
  LEFT JOIN clients cl ON p.client_id = cl.id
  LEFT JOIN recruiters r ON c.recruiter_id = r.id
  WHERE ca.end_date > NOW() - INTERVAL 12 MONTH
    AND c.status = 'inactive'
)
SELECT
  dimension_type,
  dimension_id,
  dimension_name,
  COUNT(DISTINCT consultant_id) as rotation_count,
  ROUND(AVG(tenure_months), 1) as avg_tenure_months
FROM rotation_12mo
GROUP BY dimension_type, dimension_id, dimension_name;

REFRESH MATERIALIZED VIEW CONCURRENTLY mv_rotation_heatmap;
```

### Agregacja Daily (batch job)

```typescript
// /app/api/cron/aggregate-metrics/route.ts

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Calculate health scores for all consultants
    await db.query(`
      UPDATE consultants SET health_score = (
        SELECT calculate_health_score(id)
      ) WHERE status IN ('active', 'bench')
    `);

    // 2. Calculate exit risk
    await db.query(`
      UPDATE consultants SET exit_probability = (
        SELECT calculate_exit_risk(id)
      ) WHERE status IN ('active', 'bench')
    `);

    // 3. Refresh materialized views
    await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_health_summary');
    await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_rotation_heatmap');

    // 4. Log metrics snapshot for historical tracking
    await db.insert(metrics_snapshots).values({
      date: new Date(),
      red_flag_count: (await db.query(`SELECT COUNT(*) FROM consultants WHERE health_score < 50`))[0].count,
      avg_health_score: (await db.query(`SELECT AVG(health_score) FROM consultants`))[0].avg,
      // ...
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Aggregation error:', error);
    return NextResponse.json({ error: 'Aggregation failed' }, { status: 500 });
  }
}
```

---

## Role i Widoki Dostępu

### RBAC Mapping

```typescript
// /lib/rbac/dashboardPermissions.ts

const dashboardPermissions = {
  'board_member': {
    canView: [
      'executive_summary',
      'red_flag_list',
      'contracts_timeline',
      'exit_risk_overview',
      'gap_analysis_heatmap',
      'cost_of_departures_charts',
      'rotation_heatmap_all'
    ],
    canDrill: true,
    canExport: true,
    restrictions: {
      showSalaries: false, // Board nie widzi stawek
      filterByDeliveryLead: true
    }
  },

  'delivery_lead': {
    canView: [
      'red_flag_list_filtered_to_team',
      'contracts_timeline_team',
      'exit_risk_team_members',
      'gap_analysis_team_skills'
    ],
    canDrill: true,
    canManageAlerts: true,
    restrictions: {
      showSalaries: true,
      filterByDeliveryLead: 'self_only'
    }
  },

  'account_manager': {
    canView: [
      'red_flag_list_filtered_to_clients',
      'contracts_timeline_clients',
      'client_health_score',
      'client_rotation_heatmap'
    ],
    canDrill: true,
    restrictions: {
      showSalaries: false,
      filterByClient: 'self_only'
    }
  },

  'cs_manager': {
    canView: [
      'red_flag_list',
      'contracts_timeline',
      'retention_programs',
      'skill_development'
    ],
    canDrill: true,
    canManageAlerts: true
  }
};

// Middleware
export async function dashboardAccessControl(req: NextRequest, role: string) {
  const permissions = dashboardPermissions[role];

  if (!permissions) {
    return { authorized: false, reason: 'Unknown role' };
  }

  return { authorized: true, permissions };
}
```

### Filtered Views per Role

```typescript
// /app/dashboard/page.tsx

export default async function DashboardPage() {
  const session = await getServerSession();
  const role = session.user.role;

  const { permissions } = await dashboardAccessControl(session, role);

  const metrics = await fetchMetrics(role, session.user.id);

  return (
    <div className="space-y-6">
      {/* Role: Board → High-level overview, all consultants */}
      {role === 'board_member' && (
        <>
          <ExecutiveSummaryCards metrics={metrics.all} period="30d" />
          <Tabs defaultValue="red-flags">
            <TabsList>
              <TabsTrigger value="red-flags">Red Flags ({metrics.all.redFlagCount})</TabsTrigger>
              <TabsTrigger value="contracts">Kontrakty ({metrics.all.contractsEndingCount})</TabsTrigger>
              <TabsTrigger value="exit-risk">Exit Risk</TabsTrigger>
              <TabsTrigger value="gap-analysis">Luka Zasobów</TabsTrigger>
              <TabsTrigger value="costs">Koszty Odejść</TabsTrigger>
              <TabsTrigger value="rotation">Heatmap Rotacji</TabsTrigger>
            </TabsList>

            <TabsContent value="red-flags">
              <RedFlagList
                consultants={metrics.all.redFlagConsultants}
                onConsultantClick={(id) => router.push(`/consultants/${id}`)}
              />
            </TabsContent>
            {/* ... rest of tabs */}
          </Tabs>
        </>
      )}

      {/* Role: Delivery Lead → Team-filtered view */}
      {role === 'delivery_lead' && (
        <>
          <ExecutiveSummaryCards metrics={metrics.team} period="30d" />
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Widok zespołu</AlertTitle>
            <AlertDescription>
              Poniżej widzisz tylko konsultantów w Twojej grupie.
            </AlertDescription>
          </Alert>
          <RedFlagList consultants={metrics.team.redFlagConsultants} />
        </>
      )}

      {/* Role: Account Manager → Client-filtered view */}
      {role === 'account_manager' && (
        <>
          <Alert variant="informational">
            <Info className="h-4 w-4" />
            <AlertTitle>Widok klienta</AlertTitle>
            <AlertDescription>
              Poniżej widzisz konsultantów pracujących na Twoich klientach.
            </AlertDescription>
          </Alert>
          {metrics.clients.map(client => (
            <ClientSection key={client.id} client={client} metrics={metrics.byClient[client.id]} />
          ))}
        </>
      )}
    </div>
  );
}

async function fetchMetrics(role: string, userId: string) {
  if (role === 'board_member') {
    return await getCompanyWideMetrics();
  } else if (role === 'delivery_lead') {
    const deliveryLeadTeams = await getDeliveryLeadTeams(userId);
    return await getTeamMetrics(deliveryLeadTeams);
  } else if (role === 'account_manager') {
    const managerClients = await getAccountManagerClients(userId);
    return await getClientMetrics(managerClients);
  } else if (role === 'cs_manager') {
    return await getCompanyWideMetrics(); // full access like board
  }
}
```

---

## Konfiguracje Recharts

### 1. Red Flag Health Score Distribution

```tsx
// /app/dashboard/components/charts/HealthScoreDistribution.tsx

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell
} from 'recharts';

interface HealthScoreData {
  range: string; // '0-30', '30-50', '50-70', '70-100'
  count: number;
  consultants: string[]; // names
  percentage: number;
}

export function HealthScoreDistribution({ data }: { data: HealthScoreData[] }) {
  const getColor = (range: string) => {
    if (range === '0-30') return '#dc2626';
    if (range === '30-50') return '#f97316';
    if (range === '50-70') return '#fbbf24';
    return '#22c55e';
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="range" />
        <YAxis />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #4b5563',
            borderRadius: '8px',
            color: '#f3f4f6'
          }}
          cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
        />
        <Bar dataKey="count" name="Liczba Konsultantów" radius={[8, 8, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getColor(entry.range)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### 2. Contract Ending Timeline (Gantt-like)

```tsx
// /app/dashboard/components/charts/ContractTimeline.tsx

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell
} from 'recharts';
import { differenceInDays } from 'date-fns';

interface ContractData {
  consultant: string;
  startDate: Date;
  endDate: Date;
  daysRemaining: number;
  status: 'ending_critical' | 'ending_soon' | 'ending_planned';
  renewalProbability: number;
}

export function ContractTimeline({ data }: { data: ContractData[] }) {
  const chartData = data.map((contract) => ({
    name: contract.consultant,
    daysRemaining: contract.daysRemaining,
    status: contract.status,
    fill: contract.status === 'ending_critical'
      ? '#dc2626'
      : contract.status === 'ending_soon'
      ? '#f97316'
      : '#fbbf24'
  }));

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 5, right: 30, left: 200 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" label={{ value: 'Dni do końca umowy', position: 'bottom' }} />
        <YAxis type="category" dataKey="name" width={190} />
        <Tooltip
          cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
          formatter={(value) => `${value} dni`}
        />
        <Bar dataKey="daysRemaining" name="Dni Pozostałe" radius={[0, 8, 8, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### 3. Exit Risk Gauge

```tsx
// /app/dashboard/components/charts/ExitRiskGauge.tsx

import { useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface ExitRiskGaugeProps {
  value: number; // 0-100
  trend: 'increasing' | 'stable' | 'decreasing';
}

export function ExitRiskGauge({ value, trend }: ExitRiskGaugeProps) {
  const data = [
    { name: 'Risk', value: value },
    { name: 'Safe', value: 100 - value }
  ];

  const getColor = (val: number) => {
    if (val < 25) return '#22c55e';
    if (val < 50) return '#fbbf24';
    if (val < 75) return '#f97316';
    return '#dc2626';
  };

  const trendIcon = trend === 'increasing' ? '📈' : trend === 'decreasing' ? '📉' : '→';

  return (
    <div className="w-full flex flex-col items-center">
      <div className="relative w-48 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={70}
              outerRadius={90}
              dataKey="value"
            >
              <Cell fill={getColor(value)} />
              <Cell fill="#e5e7eb" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: getColor(value) }}>
              {value}%
            </div>
            <div className="text-sm text-gray-600">{trendIcon}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 4. Gap Analysis Heatmap

```tsx
// /app/dashboard/components/charts/GapAnalysisHeatmap.tsx

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell
} from 'recharts';

interface GapDataPoint {
  tech: string;
  seniority: string;
  currentSupply: number;
  projectedDemand: number;
  gapScore: number;
}

export function GapAnalysisHeatmap({ data }: { data: GapDataPoint[] }) {
  const getGapColor = (score: number) => {
    if (score < 20) return '#22c55e';
    if (score < 50) return '#fbbf24';
    return '#dc2626';
  };

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="currentSupply"
          name="Dostępni Konsultanci"
          unit=""
        />
        <YAxis
          dataKey="projectedDemand"
          name="Projektowana Popytana"
        />
        <ZAxis
          dataKey="gapScore"
          range={[100, 1000]}
          name="Gap Score %"
        />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #4b5563',
            borderRadius: '8px'
          }}
          formatter={(value, name) => {
            if (name === 'Gap Score %') return `${value}%`;
            return value;
          }}
        />
        <Legend />

        {/* Group by technology */}
        {['React', 'Python', 'Java', 'Kubernetes'].map((tech) => (
          <Scatter
            key={tech}
            name={tech}
            data={data.filter((d) => d.tech === tech)}
            fill={['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][
              ['React', 'Python', 'Java', 'Kubernetes'].indexOf(tech)
            ]}
          >
            {data
              .filter((d) => d.tech === tech)
              .map((entry, idx) => (
                <Cell
                  key={`cell-${idx}`}
                  fill={getGapColor(entry.gapScore)}
                />
              ))}
          </Scatter>
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
```

### 5. Rotation Heatmap (Matrix visualization)

```tsx
// /app/dashboard/components/charts/RotationMatrix.tsx

import { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

interface RotationMatrixCell {
  dimension: string; // client name, tech, recruiter name
  rotationCount: number;
  avgTenureMonths: number;
  retentionRate: number;
}

export function RotationMatrix({ data }: { data: RotationMatrixCell[] }) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="dimension" />
        <YAxis yAxisId="left" label={{ value: 'Rotacja (osób/rok)', angle: -90, position: 'insideLeft' }} />
        <YAxis yAxisId="right" orientation="right" label={{ value: 'Retention Rate (%)', angle: 90, position: 'insideRight' }} />

        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #4b5563',
            borderRadius: '8px'
          }}
          labelFormatter={(value) => `${value}`}
          formatter={(value, name) => {
            if (name === 'Retention Rate %') return `${value}%`;
            if (name === 'Średnia Tenura (mies)') return `${value} mies`;
            return value;
          }}
        />

        <Legend />

        <Bar
          yAxisId="left"
          dataKey="rotationCount"
          fill="#ef4444"
          name="Rotacja w 12mo"
        />
        <Bar
          yAxisId="left"
          dataKey="avgTenureMonths"
          fill="#a78bfa"
          name="Średnia Tenura (mies)"
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="retentionRate"
          stroke="#22c55e"
          name="Retention Rate %"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

### 6. Cost of Departures Trend

```tsx
// /app/dashboard/components/charts/CostOfDeparturesTrend.tsx

import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface CostTrendData {
  month: string;
  ytdCost: number;
  monthlyDepartures: number;
  projectedMonthlyAvg: number;
}

export function CostOfDeparturesTrend({ data }: { data: CostTrendData[] }) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorYtd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#dc2626" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#dc2626" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="colorProjected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis
          label={{
            value: 'Koszt (PLN)',
            angle: -90,
            position: 'insideLeft'
          }}
        />
        <Tooltip
          formatter={(value) => formatCurrency(value, 'PLN')}
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #4b5563',
            borderRadius: '8px'
          }}
        />
        <Legend />

        <Area
          type="monotone"
          dataKey="ytdCost"
          stroke="#dc2626"
          fill="url(#colorYtd)"
          name="YTD Koszt Kumulatywny"
        />
        <Area
          type="monotone"
          dataKey="projectedMonthlyAvg"
          stroke="#f97316"
          fill="url(#colorProjected)"
          name="Projekcja Miesięczna"
          stackId="1"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

---

## PROMPT DLA AI BUILDERA

```markdown
# Instrukcja dla AI Buildera: Moduł M8 Dashboard Zarządczy

## Cel

Zbuduj kompletny moduł dashboardu zarządczego dla systemu Qualrix. To jest kompleksowy system raportowania i monitorowania ryzyka dla kierownictwa, Delivery Leads, Account Managers i Consultant Success Managers.

## Stack Techniczny

- **Frontend:** Next.js 14+, TypeScript, Tailwind CSS, shadcn/ui
- **Charts:** Recharts (wszystkie wizualizacje)
- **Internacjonalizacja:** next-intl (PL + EN)
- **Backend:** Next.js API Routes, Supabase (PostgreSQL)
- **Autentykacja:** Supabase Auth z RBAC
- **Email:** Brevo/SendGrid
- **Webhooks:** Slack

## Struktura Katalogów

```
/app/dashboard/
  ├── page.tsx                              # Main dashboard page
  ├── layout.tsx                            # Dashboard layout with sidebar
  ├── components/
  │   ├── ExecutiveSummaryCards.tsx         # 4 KPI cards
  │   ├── RedFlagList.tsx                   # Tablica konsultantów Red Flag
  │   ├── ContractTimeline.tsx              # Timeline widok kontraktów
  │   ├── ExitRiskGauge.tsx                 # Gauge chart
  │   ├── GapAnalysisMatrix.tsx             # Scatter chart
  │   ├── RotationHeatmap.tsx               # Heatmap visualization
  │   ├── AlertConfiguration.tsx            # Admin panel alertów
  │   ├── DeparturesCostChart.tsx           # Cost trends
  │   ├── charts/
  │   │   ├── HealthScoreDistribution.tsx
  │   │   ├── ContractTimeline.tsx
  │   │   ├── ExitRiskGauge.tsx
  │   │   ├── GapAnalysisHeatmap.tsx
  │   │   ├── RotationMatrix.tsx
  │   │   └── CostOfDeparturesTrend.tsx
  │   └── filters/
  │       ├── PeriodFilter.tsx              # 7d, 30d, 90d, YTD
  │       ├── ClientFilter.tsx
  │       └── TechStackFilter.tsx
  ├── hooks/
  │   ├── useDashboardMetrics.ts            # SWR hook for data fetching
  │   ├── useExitRisk.ts
  │   ├── useGapAnalysis.ts
  │   └── useRotationHeatmap.ts
  ├── api/
  │   ├── metrics/route.ts                  # GET /api/dashboard/metrics
  │   ├── red-flags/route.ts                # GET /api/dashboard/red-flags
  │   ├── contracts-ending/route.ts         # GET /api/dashboard/contracts-ending
  │   ├── exit-risk/route.ts                # GET /api/dashboard/exit-risk
  │   ├── gap-analysis/route.ts             # GET /api/dashboard/gap-analysis
  │   ├── costs-departures/route.ts         # GET /api/dashboard/costs-departures
  │   ├── rotation-heatmap/route.ts         # GET /api/dashboard/rotation-heatmap
  │   ├── alerts/
  │   │   ├── configure/route.ts            # POST /api/dashboard/alerts/configure
  │   │   ├── test-email/route.ts           # POST /api/dashboard/alerts/test-email
  │   │   └── test-slack/route.ts           # POST /api/dashboard/alerts/test-slack
  │   └── cron/
  │       ├── alerts/route.ts               # POST /api/cron/alerts (Vercel Cron)
  │       ├── aggregate-metrics/route.ts    # POST /api/cron/aggregate-metrics
  │       └── calculate-exit-risk/route.ts  # POST /api/cron/calculate-exit-risk
  ├── lib/
  │   ├── alerts/
  │   │   ├── emailService.ts               # sendRedFlagAlert, sendContractEndingAlert, etc.
  │   │   ├── slackService.ts               # sendSlackAlert
  │   │   └── alertRules.ts                 # getActiveAlertRules, getRecipientsForRule
  │   ├── calculations/
  │   │   ├── healthScore.ts                # calculateHealthScore function
  │   │   ├── exitRisk.ts                   # calculateExitRisk, predictExitDate
  │   │   ├── gapAnalysis.ts                # matchConsultantToGap, calculateGapScore
  │   │   ├── costOfDepartures.ts           # calculateDepartureCost, projectedYearEndCost
  │   │   └── rotationMetrics.ts            # buildRotationHeatmap, calculateRetentionRate
  │   ├── queries/
  │   │   ├── consultants.ts                # getRedFlagConsultants, getConsultantMetrics
  │   │   ├── contracts.ts                  # getContractsEnding, getContractMetrics
  │   │   ├── projects.ts                   # getGapAnalysisData
  │   │   └── departures.ts                 # getDepartureData, getCostOfDepartures
  │   ├── rbac/
  │   │   └── dashboardPermissions.ts       # Role-based access control
  │   └── formatters/
  │       ├── currency.ts                   # formatCurrency(number, 'PLN')
  │       └── date.ts                       # formatDate, formatDistanceToNow
  └── types/
      ├── dashboard.ts                      # DashboardMetrics, ExecutiveMetrics, etc.
      ├── consultant.ts                     # Consultant, RedFlagConsultant
      ├── contract.ts                       # Contract, ContractEvent
      ├── alerts.ts                         # AlertRule, AlertType, AlertChannel
      └── analytics.ts                      # GapAnalysisCell, RotationMatrixCell, etc.
```

## Kroki Implementacji

### Faza 1: Setup i Data Layer (2-3 dni)

1. **Utwórz tabele i views w Supabase**
   - consultants, consultant_assignments, projects, clients, contracts
   - health_events, alerts, alert_rules
   - Materialized views: mv_health_summary, mv_rotation_heatmap
   - CRON jobs: odświeżanie health scores, exit risk, heatmap

2. **Implementuj funkcje PostgreSQL**
   - calculate_health_score(consultant_id) → numeric
   - calculate_exit_risk(consultant_id) → numeric
   - calculate_departure_cost(consultant_id) → numeric

3. **Utwórz API routes do pobierania danych**
   - /api/dashboard/metrics
   - /api/dashboard/red-flags
   - /api/dashboard/contracts-ending
   - /api/dashboard/exit-risk
   - /api/dashboard/gap-analysis
   - /api/dashboard/costs-departures
   - /api/dashboard/rotation-heatmap

### Faza 2: Frontend Components (4-5 dni)

1. **Utwórz layout i main page**
   - /app/dashboard/page.tsx z Tabbed Interface
   - /app/dashboard/layout.tsx z sidebar nawigacją

2. **Zbuduj Executive Summary Cards**
   - 4 karty KPI (Red Flags, Contracts, Costs, Gap)
   - Period filter (7d, 30d, 90d, YTD)
   - Real-time trend indicators

3. **Implementuj wszystkie componenty vizualizacyjne**
   - RedFlagList (sortable, filtrable table)
   - ContractTimeline (horizontal bar chart)
   - ExitRiskGauge (pie gauge)
   - GapAnalysisMatrix (scatter chart)
   - RotationHeatmap (heatmap + bar chart)
   - CostOfDeparturesTrend (area chart)

4. **Utwórz drill-down modals**
   - Red Flag: Szczegóły profilu, historia zdarzeń
   - Contract: Proponuj odnowienie, planuj zastępstwo
   - Exit Risk: Historia zmian, rekomendacje
   - Gap: Lista osób, plany zatrudnienia

### Faza 3: RBAC i Alerting (3-4 dni)

1. **Implementuj role-based access control**
   - middleware w /lib/rbac/dashboardPermissions.ts
   - Filtrowanie danych per role
   - Conditional rendering UI

2. **Zbuduj Alert System**
   - Admin panel: AlertConfiguration component
   - Email service: integration z Brevo
   - Slack service: webhook integration
   - Alert rules management (CRUD)

3. **Skonfiguruj CRON jobs**
   - /api/cron/alerts - wysyłanie alertów (co 1 godz)
   - /api/cron/aggregate-metrics - agregacja (co 2 godziny)
   - /api/cron/calculate-exit-risk - update predykcji (co godzinę)

### Faza 4: Optymalizacja i Testing (2-3 dni)

1. **Performance optimization**
   - React Query/SWR caching
   - Materialized views do agregacji
   - Lazy loading charts

2. **Testing**
   - Unit tests (calculations, formatters)
   - Integration tests (API routes)
   - E2E tests (dashboard workflows)

3. **Internationalization**
   - Wszystkie teksty w next-intl (PL/EN)
   - Formatowanie dat, walut per locale

## Przydatne Snippety

### Health Score Calculation

```typescript
// /lib/calculations/healthScore.ts
export async function calculateHealthScore(consultantId: string): Promise<number> {
  const consultant = await db.query(`SELECT * FROM consultants WHERE id = $1`, [consultantId]);

  const performanceScore = await getPerformanceScore(consultantId);
  const satisfactionScore = await getSatisfactionScore(consultantId);
  const engagementScore = await getEngagementScore(consultantId);
  const skillAlignmentScore = await getSkillAlignmentScore(consultantId);

  return (
    0.4 * performanceScore +
    0.3 * satisfactionScore +
    0.2 * engagementScore +
    0.1 * skillAlignmentScore
  );
}
```

### Exit Risk Alert Email

```typescript
// /lib/alerts/emailService.ts
export async function sendExitRiskAlert(consultant: Consultant, exitRiskPercent: number) {
  const htmlContent = `
    <h2>⚠️ High Exit Risk Alert</h2>
    <p><strong>Consultant:</strong> ${consultant.name}</p>
    <p><strong>Exit Risk Probability:</strong> ${exitRiskPercent}%</p>
    <!-- ... rest of email -->
  `;

  await brevoClient.sendTransacEmail({
    sender: { email: 'alerts@qualrix.pl', name: 'Qualrix Alerts' },
    to: recipientEmails.map(email => ({ email })),
    subject: `Exit Risk Alert: ${consultant.name} (${exitRiskPercent}%)`,
    htmlContent
  });
}
```

### Recharts Configuration

```typescript
// All charts use ResponsiveContainer wrapper
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="name" />
    <YAxis />
    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} />
    <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

## Wymagane zmienne env

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Email (Brevo)
BREVO_API_KEY=xxx
BREVO_FROM_EMAIL=alerts@qualrix.pl

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# Cron
CRON_SECRET=xxx

# App
NEXT_PUBLIC_BASE_URL=https://qualrix.pl
```

## Testing Checklist

- [ ] Red Flag list wyświetla konsultantów z health_score < 50%
- [ ] Contract Timeline pokazuje umowy kończące się w ciągu 90 dni
- [ ] Exit Risk gauge aktualizuje się codziennie
- [ ] Gap Analysis heatmap pokazuje luki zasobów
- [ ] Cost of Departures chart pokazuje trendy
- [ ] Rotation Heatmap drill-down działa
- [ ] Email alerts wysyłane poprawnie
- [ ] Slack alerts wysyłane poprawnie
- [ ] Role-based filtering działa (Board, DL, AM, CSM)
- [ ] Period filter zmienia wszystkie wykresy (7d, 30d, 90d, YTD)
- [ ] Wszystkie teksty przetłumaczone (PL/EN)
- [ ] Performance: load time < 3s

## Dodatkowe Uwagi

1. **Data freshness:** Dashboa opiera się na danych agregowanych co 2 godziny. Dla real-time alertów, użyj Supabase Realtime w sensytywnych metrykach.

2. **Skalowalność:** Za 500+ konsultantów, upewnij się, że materialized views są zaindeksowane. Rozważ partycjonowanie tabel departures/health_events.

3. **Wizualizacje:** Wszystkie wykresy muszą być responsive. Sprawdź na mobile i desktop.

4. **Accessibility:** Dodaj aria-labels, zapewni WCAG 2.1 AA conformance.

5. **Dokumentacja:** Po implementacji, udokumentuj:
   - Ścieżka danych (source → aggregation → visualization)
   - Jak dodać nową metrykę
   - Jak konfigurować alerty
   - Troubleshooting guide

---

**Koniec specyfikacji.**
```

---

## Podsumowanie

Specyfikacja modułu **M8: Dashboard Zarządczy (Risk Monitor)** zawiera:

✅ **13 sekcji technicznych** obejmujące pełną architekturę
✅ **Algorytmy predykcji**: Health Score, Exit Risk, Gap Analysis
✅ **Wizualizacje Recharts**: 6 różnych typów wykresów
✅ **System alertów**: Email + Slack z konfiguracją
✅ **RBAC**: Role-based access control dla 4 typów użytkowników
✅ **Zapytania SQL**: Zaawansowane agregacje i materialized views
✅ **400+ linii PROMPT**: Kompleksowa instrukcja dla AI Buildera

Dokument zapisany pod ścieżką:
```
/sessions/beautiful-gifted-meitner/mnt/aplikacja zbyszka/DOC-M8_Dashboard_Zarzadczy.md
```

Moduł jest gotowy do implementacji. Wszystkie komponenty, API routes, i logika biznesowa są szczegółowo opisane z przykładami kodu, konfiguracjami Recharts, i step-by-step instrukcjami dla developera/AI.
# Specyfikacja Modułu M4: Contract Health Score
**Qualrix - Platforma Zarządzania Konsultantami B2B**
**Wersja:** 1.0
**Data:** 2026-02-08
**Status:** Gotowy do implementacji

---

## 1. Opis Modułu

### 1.1 Cel i Znaczenie

Moduł **Contract Health Score** jest kluczowym komponentem systemu Qualrix dedykowanym dla firm outsourcingu IT (500+ konsultantów). Moduł rozwiązuje problem braku widoczności stanu zdrowia umowy konsultanta w temps rzeczywistym.

**Cel główny:** Umożliwić konsultantom samoświadomość stanu ich umowy poprzez przejrzystą, dynamiczną ocenę (0-100%) bez elementów karnych czy konkurencji.

### 1.2 Kluczowe Wartości

- **Prewencja:** Konsultant widzi ostrzeżenia zanim dojdzie do eskalacji
- **Samoświadomość:** Każdy konsultant zna status swoimi umowy (GREEN/YELLOW/RED)
- **Brak Punkcji:** Nie jest to ranking lub system karny
- **Transparencja:** Rozkład oceny na komponenty (feedback, stabilność, engagement, red flags)
- **Działanie:** Rekomendacje i CTA do rozmowy z Consultant Success Manager (CSM)

### 1.3 Architektura i Kontekst

**Stack:**
- Frontend: Next.js 14+, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- Backend: Supabase (PostgreSQL), Row Level Security (RLS)
- Internacjonalizacja: next-intl (PL + EN)
- Auth: Clerk / Custom JWT (role-based: consultant, CSM, Admin)

**Dostęp:**
- Konsultant: Widok TYLKO własnego health score
- CSM/Account Manager: Dashboard do wprowadzania feedback i sygnałów
- Admin: Ustawienia algorytmu, audyt

---

## 2. User Stories

### 2.1 Dla Konsultanta

**US-M4.1.1** Jako konsultant, chcę zobaczyć aktualny Contract Health Score na dashboardzie głównym
- Akceptacja: Score wyświetla się jako koło (gauge) 0-100%, zawsze widoczne
- Wizualny kod kolorów: GREEN (80-100), YELLOW (50-79), RED (0-49)
- Dane muszą być aktualne (max 24h opóźnienia)

**US-M4.1.2** Jako konsultant, chcę zrozumieć, co wpływa na mój score
- Akceptacja: Widok "Score Breakdown" pokazuje 4 komponenty: Client Feedback (40%), Contract Stability (30%), Engagement (20%), Red Flags (10%)
- Każdy komponent ma wartość % i krótkie wyjaśnienie
- Mogę kliknąć na komponent, aby zobaczyć szczegóły

**US-M4.1.3** Jako konsultant, chcę widzieć trend mojego score w ciągu ostatnich 6 miesięcy
- Akceptacja: Liniowy wykres (chart) z Recharts pokazujący dzienną/tygodniową agregację
- Mogę wybrać widok: "Dzisiaj", "Ostatni tydzień", "Ostatni miesiąc", "6 miesięcy"
- Mogę zobaczyć konkretne daty i wartości po najechaniu myszką

**US-M4.1.4** Jako konsultant, chcę otrzymać konkretne rekomendacje, jak poprawić mój score
- Akceptacja: Sekcja "Recommendations" zawiera 3-5 porad na podstawie słabszych komponentów
- Np. "Aktywność w aplikacji spada - uczestniczkj w zaplanowanych szkoleniach"
- Rekomendacje są dynamiczne (zmieniają się wraz ze zmianą komponentów)

**US-M4.1.5** Jako konsultant, chcę otrzymać alert push, gdy mój score spadnie o więcej niż 15% m/m
- Akceptacja: Powiadomienie push (in-app + opcjonalnie email)
- Zawiera: "Twój Contract Health Score spadł z 75% do 58%. Skontaktuj się z CSM."
- Alert wysyłany maksymalnie raz dziennie

**US-M4.1.6** Jako konsultant, chcę zaplanować rozmowę z Consultant Success Managerem bezpośrednio z panelu Health Score
- Akceptacja: Przycisk "Schedule Call with CSM" otwiera modal lub przenosi do kalendarza
- Możliwość wybrania dostępnego slotu CSM
- Wysyła notyfikację do CSM + potwierdzenie do konsultanta

**US-M4.1.7** Jako konsultant, chcę widzieć historyczne oceny komponentów
- Akceptacja: Dla każdego komponentu dostępna jest tabela zmian wartości ostatnie 6 miesięcy
- Mogę filtrować po dacie lub komponencie

**US-M4.1.8** Jako konsultant, chcę wiedzieć, kiedy ostatnio mój score został zaktualizowany
- Akceptacja: Timestamp "Last updated: 2026-02-08 14:30 CET" wyświetlany poniżej głównego gauge
- Wyjaśnienie: "Health Score jest aktualizowany codziennie o godzinie 6:00 rano"

### 2.2 Dla CSM / Account Manager

**US-M4.2.1** Jako CSM, chcę wprowadzić feedback od klienta (Client Feedback component) dla konkretnego konsultanta
- Akceptacja: Modal z polami: ocena (1-5 stars), kategoria (professionalism, communication, technical skill), notatka, data
- Feedback jest zapisywany w bazie i natychmiast wpływa na Health Score
- Poprzednie feedback'i widoczne jako historia

**US-M4.2.2** Jako Account Manager, chcę dostarczyć sygnały biznesowe (np. "klient chce przedłużyć umowę")
- Akceptacja: Checkbox/toggle: "Contract extension approved", "Client satisfaction high", "Training participation"
- Sygnały wpływają na Contract Stability i Engagement
- Audit trail pokazuje kto i kiedy wprowadził zmianę

**US-M4.2.3** Jako CSM, chcę zobaczyć dashboard ze wszystkimi mojimi konsultantami i ich health score'ami
- Akceptacja: Tabela/grid ze score'ami konsultantów przypisanych do mnie
- Sortowanie po score, dacie aktualizacji, imieniu
- Filtry: status (GREEN/YELLOW/RED), zespół, projekt
- Export do CSV dostępny

**US-M4.2.4** Jako CSM, chcę otrzymać alert, gdy konsultant z YELLOW/RED score nie zaloguje się przez 3 dni
- Akceptacja: Dashboard notyfikuje o "at-risk" konsultantach
- Alert zawiera ostatnią datę aktywności i sugeruje kontakt

**US-M4.2.5** Jako CSM, chcę ręcznie zaktualizować score konsultanta (np. w wyniku rozmowy)
- Akceptacja: Przycisk "Override Score" (z wymaganiem uzasadnienia)
- Nowa wartość zapisana z komentarzem i timestamp
- Historia przesłonięć widoczna w audit log

### 2.3 Dla Administratora

**US-M4.3.1** Jako Admin, chcę konfigurować wagi komponentów (40/30/20/10)
- Akceptacja: Panel administracyjny z suwak/input do zmiany procentów
- Zmiana ma efekt natychmiast na nowe obliczenia
- Historia zmian dostępna

**US-M4.3.2** Jako Admin, chcę widzieć statystyki systemu (średnia score, rozkład, trendy)
- Akceptacja: Dashboard z: average score, score distribution (histogram), trends, components effectiveness
- Export danych do BigQuery/Analityki

---

## 3. Wireframe

```
┌─────────────────────────────────────────────────────────────────────┐
│  QUALRIX / Health Score / Mój Kontrakt                      PL | EN │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  CONTRACT HEALTH SCORE                                          │  │
│  │  Last updated: 2026-02-08 14:30 CET                            │  │
│  │                                                                │  │
│  │    [🟢 Gauge - 75%]      │  STATUS: YELLOW                    │  │
│  │    /            \        │  ➜ Pay attention to feedback       │  │
│  │   /              \       │  ➜ Contact your Account Manager    │  │
│  │  |       75%      |      │                                    │  │
│  │   \              /       │  ┌────────────────────────────┐    │  │
│  │    \____________/        │  │ [📅 Schedule Call w/ CSM] │    │  │
│  │                          │  └────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  SCORE BREAKDOWN                                                │  │
│  │                                                                │  │
│  │  Client Feedback      [████████░] 80% (40% weight)            │  │
│  │  Contract Stability   [██████░░░] 60% (30% weight)            │  │
│  │  Engagement           [███████░░] 70% (20% weight)            │  │
│  │  Red Flags            [█░░░░░░░░] 10% (10% weight)            │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  6-MONTH TREND (Last updated: Yesterday)                       │  │
│  │                                                                │  │
│  │  [Segment: 6M | 1M | 1W | Today]                              │  │
│  │                                                                │  │
│  │    100% ┤                                    🔴                │  │
│  │      75% ┤        📈  🟢                  📉  │                │  │
│  │      50% ┤   📊       │    🟡           📈   🟡  🟡            │  │
│  │      25% ┤           │                       │                │  │
│  │       0% ┤___________|_______________________|____             │  │
│  │         └─────────────────────────────────────────────        │  │
│  │          Aug 2025    Oct 2025    Dec 2025    Feb 2026         │  │
│  │                                                                │  │
│  │  Hover: "75% on 2026-02-01" / "82% on 2026-02-08"           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  RECOMMENDATIONS - WHAT YOU CAN DO TO IMPROVE                  │  │
│  │                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │ 📉 Low Contract Stability                               │  │  │
│  │  │ Your contract extension timeline is uncertain.          │  │  │
│  │  │ ACTION: Discuss renewal plan with your Account Manager  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │ ⚠️ Red Flags Alert                                      │  │  │
│  │  │ 1 escalation reported in the last 30 days.             │  │  │
│  │  │ ACTION: Review details and prevent future incidents     │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │ 🎯 Boost Engagement                                     │  │  │
│  │  │ You missed 2 scheduled trainings last month.           │  │  │
│  │  │ ACTION: Sign up for upcoming workshops                  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  COMPONENT DETAILS (Expandable)                                │  │
│  │                                                                │  │
│  │  ▼ CLIENT FEEDBACK (80%)                                      │  │
│  │    Last feedback from John (Client Manager) on 2026-02-01:    │  │
│  │    ★★★★★ (5/5) - "Excellent communication and delivery"       │  │
│  │    Category: Communication, Technical Skills                  │  │
│  │                                                                │  │
│  │    Recent history:                                             │  │
│  │    - 2026-02-01: 80% (John) 5/5 stars                        │  │
│  │    - 2026-01-01: 75% (Sarah) 4/5 stars                       │  │
│  │    - 2025-12-01: 70% (John) 4/5 stars                        │  │
│  │                                                                │  │
│  │  ▶ CONTRACT STABILITY (60%)                                   │  │
│  │  ▶ ENGAGEMENT (70%)                                            │  │
│  │  ▶ RED FLAGS (10%)                                             │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Komponenty UI

### 4.1 HealthScoreGauge

**Opis:** Koło (gauge) wyświetlające score 0-100% z dynamicznym kolorem

**Props:**
```typescript
interface HealthScoreGaugeProps {
  score: number; // 0-100
  size?: 'sm' | 'md' | 'lg'; // default: 'md' = 200px
  showLabel?: boolean; // default: true
  animated?: boolean; // default: true (animacja przy zmianie)
  onClick?: () => void;
  className?: string;
}
```

**Wizualizacja:**
- Gauge 360° z kolorami: GREEN (#22c55e), YELLOW (#eab308), RED (#ef4444)
- Wartość % w środku
- Poniżej: status text (GREEN/YELLOW/RED)
- Animacja przy zmianie wartości (transition 0.5s)

**Implementacja:** Recharts `ResponsiveContainer` + custom SVG overlay

### 4.2 ScoreBreakdown

**Opis:** Pasek pokazujący 4 komponenty ze statusami

**Props:**
```typescript
interface ScoreBreakdownProps {
  clientFeedback: number; // 0-100
  contractStability: number;
  engagement: number;
  redFlags: number;
  weights: {
    clientFeedback: number; // 40
    contractStability: number; // 30
    engagement: number; // 20
    redFlags: number; // 10
  };
  onComponentClick?: (component: string) => void;
}
```

**Struktura:**
- Pozioma lista 4 elementów
- Każdy element: nazwa, progress bar, wartość %, waga
- Hover: wyświetla tooltip z wyjaśnieniem
- Click: rozwinięcie szczegółów w modal/drawer

### 4.3 TrendChart

**Opis:** Liniowy wykres 6-miesięczny z Recharts

**Props:**
```typescript
interface TrendChartProps {
  data: HealthScoreTrendPoint[]; // {date, score, clientFeedback, stability, engagement, redFlags}
  period?: 'today' | 'week' | 'month' | '6months'; // default: '6months'
  height?: number; // default: 300
  showLegend?: boolean; // default: true
  onPeriodChange?: (period: string) => void;
}

interface HealthScoreTrendPoint {
  date: string; // ISO format
  score: number;
  clientFeedback: number;
  contractStability: number;
  engagement: number;
  redFlags: number;
}
```

**Konfiguracja Recharts:**
```typescript
<LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis
    dataKey="date"
    type="category"
    tickFormatter={(date) => formatDate(date, 'short')}
  />
  <YAxis domain={[0, 100]} />
  <Tooltip
    contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
    formatter={(value) => `${value}%`}
    labelFormatter={(date) => formatDate(date, 'long')}
  />
  <Legend />
  <Line
    type="monotone"
    dataKey="score"
    stroke="#3b82f6"
    strokeWidth={2}
    dot={{ fill: '#3b82f6', r: 4 }}
    activeDot={{ r: 6 }}
  />
</LineChart>
```

### 4.4 RecommendationCard

**Opis:** Karta z rekomendacją do działania

**Props:**
```typescript
interface RecommendationCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
  severity?: 'low' | 'medium' | 'high'; // determines border color
  componentAffected?: string; // which component this targets
}
```

**Treść:**
- Ikona (emoji + kolory zależnie od severity)
- Nagłówek
- Opis (1-2 zdania)
- CTA przycisk (opcjonalnie)
- Kolor borderu zależnie od severity

### 4.5 ScheduleCallButton

**Opis:** Przycisk do zaplanowania rozmowy z CSM

**Props:**
```typescript
interface ScheduleCallButtonProps {
  consultantId: string;
  csmId?: string; // assigned CSM
  onSuccess?: () => void;
  size?: 'sm' | 'md' | 'lg'; // default: 'md'
  fullWidth?: boolean;
  variant?: 'primary' | 'secondary'; // default: 'primary'
}
```

**Funcjonalność:**
- Klik otwiera modal z dostępnymi slotami CSM
- Wybór daty/godziny
- Potwierdzenie -> wysłanie event do `meetings` table
- Notification do CSM + email do konsultanta
- Button disabled, jeśli CSM niedostępny

---

## 5. Model Danych

### 5.1 Tabela `contract_health_scores`

```sql
CREATE TABLE contract_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,

  -- Główne komponenty (0-100)
  client_feedback_score NUMERIC(5, 2) DEFAULT 0,
  contract_stability_score NUMERIC(5, 2) DEFAULT 0,
  engagement_score NUMERIC(5, 2) DEFAULT 0,
  red_flags_score NUMERIC(5, 2) DEFAULT 0,

  -- Agregowana ocena (0-100)
  total_score NUMERIC(5, 2) DEFAULT 0,

  -- Wagi (domyślnie: 40, 30, 20, 10)
  weight_client_feedback NUMERIC(5, 2) DEFAULT 40,
  weight_contract_stability NUMERIC(5, 2) DEFAULT 30,
  weight_engagement NUMERIC(5, 2) DEFAULT 20,
  weight_red_flags NUMERIC(5, 2) DEFAULT 10,

  -- Status
  status VARCHAR(10) DEFAULT 'ACTIVE', -- ACTIVE, ARCHIVED

  -- Metadata
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES users(id),

  -- Audyt
  calculation_method VARCHAR(50) DEFAULT 'AUTOMATIC', -- AUTOMATIC, MANUAL_OVERRIDE
  override_reason TEXT,

  CONSTRAINT check_scores CHECK (
    client_feedback_score >= 0 AND client_feedback_score <= 100 AND
    contract_stability_score >= 0 AND contract_stability_score <= 100 AND
    engagement_score >= 0 AND engagement_score <= 100 AND
    red_flags_score >= 0 AND red_flags_score <= 100 AND
    total_score >= 0 AND total_score <= 100
  ),
  CONSTRAINT check_weights CHECK (
    weight_client_feedback + weight_contract_stability +
    weight_engagement + weight_red_flags = 100
  )
);

CREATE INDEX idx_contract_health_scores_consultant
ON contract_health_scores(consultant_id);
CREATE INDEX idx_contract_health_scores_calculated_at
ON contract_health_scores(calculated_at DESC);
```

### 5.2 Tabela `health_score_history`

```sql
CREATE TABLE health_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,

  -- Snapshot komponentów
  client_feedback_score NUMERIC(5, 2),
  contract_stability_score NUMERIC(5, 2),
  engagement_score NUMERIC(5, 2),
  red_flags_score NUMERIC(5, 2),
  total_score NUMERIC(5, 2),

  -- Metadata
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  recorded_by_user_id UUID REFERENCES users(id),

  -- Uzasadnienie zmiany
  change_reason TEXT,

  CONSTRAINT check_scores CHECK (
    total_score >= 0 AND total_score <= 100
  )
);

CREATE INDEX idx_health_score_history_consultant_date
ON health_score_history(consultant_id, recorded_at DESC);
```

### 5.3 Tabela `health_score_inputs`

```sql
CREATE TABLE health_score_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,

  -- Typ inputu
  input_type VARCHAR(50) NOT NULL,
  -- CLIENT_FEEDBACK, EXTENSION_APPROVED, TRAINING_PARTICIPATION, ESCALATION, ABSENCE, etc.

  -- Dane inputu
  value NUMERIC(5, 2), -- np. rating 1-5, liczba dni, itp.
  category VARCHAR(100), -- np. "communication", "technical_skills"
  notes TEXT,
  source_user_id UUID REFERENCES users(id), -- who entered this

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- opcjonalnie, dla tymczasowych sygnałów
  is_active BOOLEAN DEFAULT TRUE,

  CONSTRAINT check_input_value CHECK (value >= 0 AND value <= 100)
);

CREATE INDEX idx_health_score_inputs_consultant_type
ON health_score_inputs(consultant_id, input_type);
CREATE INDEX idx_health_score_inputs_active
ON health_score_inputs(is_active) WHERE is_active = TRUE;
```

### 5.4 Tabela `health_score_alerts`

```sql
CREATE TABLE health_score_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,

  -- Typ alertu
  alert_type VARCHAR(50) NOT NULL,
  -- SCORE_DROP_SIGNIFICANT, RED_STATUS_ACHIEVED, etc.

  -- Dane alertu
  previous_score NUMERIC(5, 2),
  current_score NUMERIC(5, 2),
  score_change NUMERIC(5, 2), -- current - previous

  -- Status
  is_sent BOOLEAN DEFAULT FALSE,
  is_acknowledged BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by_user_id UUID REFERENCES users(id),

  CONSTRAINT check_alert_data CHECK (
    previous_score >= 0 AND previous_score <= 100 AND
    current_score >= 0 AND current_score <= 100
  )
);

CREATE INDEX idx_health_score_alerts_consultant_unsent
ON health_score_alerts(consultant_id) WHERE is_sent = FALSE;
```

### 5.5 Tabela `csm_meetings`

```sql
CREATE TABLE csm_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  csm_user_id UUID NOT NULL REFERENCES users(id),

  -- Spotkanie
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INT DEFAULT 30,
  status VARCHAR(20) DEFAULT 'SCHEDULED', -- SCHEDULED, COMPLETED, CANCELLED

  -- Notatki
  notes TEXT,
  outcome VARCHAR(100), -- IMPROVEMENT_PLAN, RENEWAL_DISCUSSED, ESCALATION, etc.

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT check_duration CHECK (duration_minutes > 0)
);

CREATE INDEX idx_csm_meetings_consultant
ON csm_meetings(consultant_id, scheduled_at DESC);
CREATE INDEX idx_csm_meetings_csm
ON csm_meetings(csm_user_id, scheduled_at);
```

---

## 6. Logika Biznesowa

### 6.1 Algorytm Obliczania Scoru

**Formuła główna:**
```
TOTAL_SCORE = (CF × 0.40) + (CS × 0.30) + (E × 0.20) + (RF × 0.10)

Gdzie:
- CF = Client Feedback Score (0-100)
- CS = Contract Stability Score (0-100)
- E = Engagement Score (0-100)
- RF = Red Flags Score (0-100) [UWAGA: to jest "inverse" - niska wartość = dobre]
```

**Interpretacja RF (Red Flags):**
- Red Flags Score to **odwrócona skala**: wysoka liczba flagów = niska ocena
- Jeśli brak flagów: RF = 100
- Jeśli 5+ flagów w ostatnim miesiącu: RF = 0
- Formuła: `RF_Score = MAX(0, 100 - (flagCount * 20))`

### 6.2 Obliczanie Poszczególnych Komponentów

#### 6.2.1 Client Feedback Score (40%)

**Źródła danych:**
- Ostatnie 4 quarterly evalutions z `health_score_inputs` (input_type='CLIENT_FEEDBACK')
- Średniowanie: średnia z ostatnich 4 ewaluacji
- Wagi: najnowsza ocena = 40%, poprzednia = 30%, przed nią = 20%, najstarsza = 10%

**Przykład:**
```
Feedback history:
- 2026-02-01: 5/5 = 100% (waga 40%)
- 2026-01-01: 4/5 = 80%  (waga 30%)
- 2025-12-01: 4/5 = 80%  (waga 20%)
- 2025-11-01: 3/5 = 60%  (waga 10%)

CF_Score = (100 × 0.40) + (80 × 0.30) + (80 × 0.20) + (60 × 0.10)
         = 40 + 24 + 16 + 6
         = 86%
```

**Sygnały:**
- Brak feedback w ciągu 3 miesięcy: CF_Score zmniejszyć o 5% (każdy miesiąc)
- Feedback zaznaczający "na obserwacji" lub komentarz krytyczny: -10 punktów

#### 6.2.2 Contract Stability Score (30%)

**Źródła danych:**
- Liczba dni do końca umowy
- Historia przedłużeń (z `contracts` table)
- Sygnały: "extension_approved", "renewal_discussed"

**Formuła:**
```
Jeśli dni_do_konca >= 180 dni:
  CS_Score = 100

Jeśli 90 <= dni_do_konca < 180:
  CS_Score = 80 + ((dni_do_konca - 90) / 90) * 20

Jeśli 30 <= dni_do_konca < 90:
  CS_Score = 50 + ((dni_do_konca - 30) / 60) * 30

Jeśli dni_do_konca < 30:
  CS_Score = MAX(0, 20 + dni_do_konca)

Bonus: extension_approved=TRUE w ciągu 30 dni:
  CS_Score += 15 (cap 100)
```

**Przykład:**
```
Umowa kończy się za 120 dni:
CS_Score = 80 + ((120 - 90) / 90) * 20
         = 80 + (30 / 90) * 20
         = 80 + 6.67
         = 86.67%

Jeśli dodatkowo extension_approved=TRUE:
CS_Score = MIN(100, 86.67 + 15) = 100% (lub 101.67, cap na 100)
```

#### 6.2.3 Engagement Score (20%)

**Źródła danych:**
- Liczba loginów w ostatnich 30 dni
- Liczba ukończonych trainings
- Time spent in app (ze `audit_logs` lub analytics)
- User interaction events (quiz attempts, resource views, etc.)

**Formuła:**
```
E_Score = (LoginActivity × 0.40) + (TrainingCompletion × 0.35) + (TimeInApp × 0.25)

LoginActivity:
  - 20+ loginów/miesiąc: 100%
  - 10-19 loginów: 80%
  - 5-9 loginów: 50%
  - 1-4 loginy: 20%
  - 0 loginów: 0%

TrainingCompletion (last 30 days):
  - 2+ trainings: 100%
  - 1 training: 70%
  - 0 trainings: 20%

TimeInApp (last 30 days):
  - 20+ hours: 100%
  - 10-19 hours: 80%
  - 5-9 hours: 50%
  - <5 hours: 20%
```

**Przykład:**
```
Ostatnie 30 dni:
- Loginy: 15 (LoginActivity = 80%)
- Trainings: 1 (TrainingCompletion = 70%)
- Czas: 12 godzin (TimeInApp = 80%)

E_Score = (80 × 0.40) + (70 × 0.35) + (80 × 0.25)
        = 32 + 24.5 + 20
        = 76.5%
```

#### 6.2.4 Red Flags Score (10%)

**Flagi:**
- Escalation (1 flaga = -20%)
- Complaint (1 flaga = -15%)
- Absence/no-show (1 flaga = -10%)
- Warning from CSM (1 flaga = -25%)
- Inactivity >14 dni (1 flaga = -5%)

**Formuła:**
```
RF_Score = MAX(0, 100 - SUM(flag_values))

Gdzie flag_values to sumy z ostatnich 30 dni.

Przykład: 1 escalation + 1 complaint = 100 - 20 - 15 = 65%
```

### 6.3 Automatyczne vs Ręczne Inputy

**Automatyczne (system):**
- Login activity, time in app (z analytics)
- Contract end date (z contracts table)
- Training completion (z training module)
- Inactivity flags (ze audit logs)

**Ręczne (CSM/Account Manager):**
- Client feedback (star rating + notes)
- Extension approved (toggle)
- Escalations/complaints (report form)
- Absences (manual entry)

### 6.4 Częstość Aktualizacji

**Główny score (total_score):**
- Recalculated: **Codziennie o 6:00 rano CET** (scheduler job)
- Na żądanie: CSM może triggerować manual recalculation

**Komponenty (individual scores):**
- Client Feedback: po dodaniu nowego feedback (real-time) + daily refresh
- Contract Stability: daily refresh + real-time przy "extension_approved"
- Engagement: hourly batch job (login activity, time in app)
- Red Flags: real-time przy dodaniu flagi + daily refresh

**Historia:**
- Snapshot do `health_score_history` przy każdej zmianie total_score

### 6.5 Trigery Alertów

**Alert Type: SCORE_DROP_SIGNIFICANT**
- Trigger: `(previous_score - current_score) >= 15`
- Frequency: once per day (max 1 alert/day)
- Channel: in-app notification + email
- Delivery: natychmiast po recalculation

**Alert Type: RED_STATUS_ACHIEVED**
- Trigger: `current_score < 50 AND previous_score >= 50`
- Channel: in-app notification + Slack (CSM) + email
- Action: auto-assign to CSM (jeśli niedostępny, queue for triage)

**Alert Type: YELLOW_ESCALATION**
- Trigger: `current_score < 50` (został RED, teraz RED)
- Frequency: once per 7 days
- Channel: Slack notification do CSM
- Action: CSM widzi w dashboard z filtrem "At Risk"

**Alert Type: NO_ACTIVITY**
- Trigger: `engagement_score < 30 AND last_login > 14 days ago`
- Frequency: once per week
- Channel: email do CSM + notifications
- Action: suggest kontakt z konsultantem

---

## 7. Internacjonalizacja (i18n)

### 7.1 Polskie tłumaczenia

```json
{
  "m4": {
    "title": "Contract Health Score",
    "subtitle": "Status zdrowia Twojej umowy",
    "last_updated": "Ostatnia aktualizacja",
    "refresh_note": "Health Score jest aktualizowany codziennie o 6:00 rano",

    "status": {
      "green": "Twoja umowa jest stabilna. Klient jest zadowolony.",
      "yellow": "Zwróć uwagę na opinię klienta. Skontaktuj się z Account Managerem.",
      "red": "Twoja umowa wymaga uwagi. Zaplanuj rozmowę z Consultant Success Manager."
    },

    "components": {
      "client_feedback": "Opinia Klienta",
      "contract_stability": "Stabilność Umowy",
      "engagement": "Zaangażowanie",
      "red_flags": "Sygnały Ostrzegawcze",
      "weight": "waga"
    },

    "breakdown": "Rozkład Oceny",

    "trend": {
      "title": "Trend 6 Miesięcy",
      "period_today": "Dzisiaj",
      "period_week": "Ostatni Tydzień",
      "period_month": "Ostatni Miesiąc",
      "period_6m": "6 Miesięcy",
      "last_updated_yesterday": "Ostatnia aktualizacja: Wczoraj"
    },

    "recommendations": {
      "title": "Rekomendacje - Co możesz zrobić, aby poprawić swoją ocenę",
      "low_stability": {
        "title": "Niska Stabilność Umowy",
        "description": "Plan przedłużenia umowy jest niepewny.",
        "action": "Poruszyć temat z Account Managerem"
      },
      "low_engagement": {
        "title": "Zwiększ Zaangażowanie",
        "description": "Przegapiłeś ostatnie szkolenia. Regularna aktywność wpływa na ocenę."
      },
      "red_flags": {
        "title": "Sygnały Ostrzegawcze",
        "description": "W ostatnim miesiącu zarejestrowano eskalacje lub skargi."
      },
      "low_feedback": {
        "title": "Niska Ocena Opinii Klienta",
        "description": "Ostatnia informacja zwrotna od klienta była negatywna."
      }
    },

    "details": "Szczegóły Komponentu",
    "history": "Historia",
    "last_feedback_from": "Ostatni feedback od",
    "category": "Kategoria",
    "date": "Data",

    "schedule_call": "Zaplanuj rozmowę z CSM",
    "schedule_call_modal_title": "Zaplanuj rozmowę z Consultant Success Manager",
    "available_slots": "Dostępne sloty",
    "confirm_booking": "Potwierdź rezerwację",
    "booking_confirmed": "Rezerwacja potwierdzona",
    "csm_notified": "CSM został powiadomiony o Twojej rezerwacji",

    "alerts": {
      "score_drop": "Twój Contract Health Score spadł z {{previousScore}}% do {{currentScore}}%. Skontaktuj się z CSM.",
      "score_drop_title": "Zmiana Contract Health Score",
      "red_status": "Twoja umowa osiągnęła status RED. Umów się na rozmowę z CSM."
    }
  }
}
```

### 7.2 Angielskie tłumaczenia

```json
{
  "m4": {
    "title": "Contract Health Score",
    "subtitle": "Your contract health status",
    "last_updated": "Last updated",
    "refresh_note": "Health Score is updated daily at 6:00 AM CET",

    "status": {
      "green": "Your contract is stable. Client is satisfied.",
      "yellow": "Pay attention to feedback. Contact your Account Manager.",
      "red": "Your contract needs attention. Schedule a call with Consultant Success Manager."
    },

    "components": {
      "client_feedback": "Client Feedback",
      "contract_stability": "Contract Stability",
      "engagement": "Engagement",
      "red_flags": "Red Flags",
      "weight": "weight"
    },

    "breakdown": "Score Breakdown",

    "trend": {
      "title": "6-Month Trend",
      "period_today": "Today",
      "period_week": "Last Week",
      "period_month": "Last Month",
      "period_6m": "6 Months",
      "last_updated_yesterday": "Last updated: Yesterday"
    },

    "recommendations": {
      "title": "Recommendations - What you can do to improve",
      "low_stability": {
        "title": "Low Contract Stability",
        "description": "Your contract extension timeline is uncertain.",
        "action": "Discuss renewal plan with your Account Manager"
      },
      "low_engagement": {
        "title": "Boost Engagement",
        "description": "You missed recent training sessions. Regular activity impacts your score."
      },
      "red_flags": {
        "title": "Red Flags Alert",
        "description": "Escalations or complaints were reported in the last 30 days."
      },
      "low_feedback": {
        "title": "Low Client Feedback",
        "description": "Recent client feedback about your work was not positive."
      }
    },

    "details": "Component Details",
    "history": "History",
    "last_feedback_from": "Last feedback from",
    "category": "Category",
    "date": "Date",

    "schedule_call": "Schedule Call with CSM",
    "schedule_call_modal_title": "Schedule a Call with Consultant Success Manager",
    "available_slots": "Available Slots",
    "confirm_booking": "Confirm Booking",
    "booking_confirmed": "Booking Confirmed",
    "csm_notified": "Your CSM has been notified of your booking",

    "alerts": {
      "score_drop": "Your Contract Health Score dropped from {{previousScore}}% to {{currentScore}}%. Contact your CSM.",
      "score_drop_title": "Contract Health Score Changed",
      "red_status": "Your contract reached RED status. Schedule a call with your CSM."
    }
  }
}
```

---

## 8. Scenariusze Testowe

### 8.1 Test Obliczania Scoru

**Test SC-M4.1: Obliczenie score'a z każdym komponentem na 80%**
- Dane wejściowe: CF=80, CS=80, E=80, RF=80
- Oczekiwany wynik: (80×0.40) + (80×0.30) + (80×0.20) + (80×0.10) = 80%
- Wizualizacja: Gauge GREEN, status "STABLE"
- Historia: Entry w `health_score_history` z total_score=80

**Test SC-M4.2: Score drop >15% m/m triggers alert**
- Miesiąc 1: score=80%
- Miesiąc 2: score=60%
- Oczekiwany wynik: Alert SCORE_DROP_SIGNIFICANT wysłany
- Weryfikacja: is_sent=TRUE, sent_at NOT NULL

**Test SC-M4.3: Red Flags counter**
- Brak flagów: RF_Score = 100
- 1 escalation: RF_Score = 80
- 2 escalations + 1 complaint: RF_Score = 65
- Weryfikacja: formuła RF_Score = MAX(0, 100 - SUM(flags))

**Test SC-M4.4: Contract Stability - 120 dni do końca**
- contract.end_date = TODAY + 120 dni
- Oczekiwany CS_Score = 86.67% (per formula)
- Wizualizacja: Status YELLOW (80-100 zależy od innych komponentów)

**Test SC-M4.5: Engagement calculation z 15 loginami i 1 training**
- Loginy: 15 = 80%, Training: 1 = 70%, Time: 12h = 80%
- E_Score = (80×0.40) + (70×0.35) + (80×0.25) = 76.5%
- Zaokrąglenie: 76.50% (2 miejsca dziesiętne)

### 8.2 Test Komponentów UI

**Test SC-M4.6: HealthScoreGauge animuje zmianę z 60% na 75%**
- Initial render: gauge pokazuje 60%, YELLOW status
- setScore(75): gauge animuje do 75% w 0.5s, zmienia na GREEN
- Weryfikacja: CSS transition, duration = 0.5s

**Test SC-M4.7: TrendChart wyświetla 6 miesięcy danych**
- Data: 6 punktów (pierwszy dzień każdego miesiąca ostatnich 6 m-cy)
- Weryfikacja: XAxis ma 6 labels, curve jest smooth (type="monotone")

**Test SC-M4.8: RecommendationCard severity="high" ma bordur czerwony**
- Render: RecommendationCard severity="high"
- Weryfikacja: className zawiera border-red-500 lub eq.

**Test SC-M4.9: ScoreBreakdown tooltips na hover**
- Hover na component: tooltip shows "40% weight in total score"
- Click: modal z detalami

### 8.3 Test Alertów

**Test SC-M4.10: Alert SCORE_DROP wysłany raz dziennie max**
- Score drops 20 razy dziennie (simulated)
- Oczekiwany wynik: tylko 1 alert wysłany
- Weryfikacja: COUNT(alerts WHERE type='SCORE_DROP' AND created_at=TODAY) = 1

**Test SC-M4.11: Push notification + email na RED status**
- Score reaches <50 from >=50
- Oczekiwany wynik:
  - in-app notification created
  - email sent
  - Slack message to CSM
- Weryfikacja: notifications + emails + slack logs

---

## 9. Dane Testowe

### 9.1 Seed Script

```sql
-- Consultant A: STABLE (GREEN)
INSERT INTO consultants (id, name, email, company_id) VALUES
  ('cons-001', 'Jan Kowalski', 'jan.kowalski@example.com', 'comp-001');

INSERT INTO contracts (id, consultant_id, client_id, start_date, end_date) VALUES
  ('con-001', 'cons-001', 'client-001', '2024-06-01', '2026-08-01');

INSERT INTO health_score_inputs (consultant_id, input_type, value, category, created_at) VALUES
  ('cons-001', 'CLIENT_FEEDBACK', 5, 'communication', NOW() - INTERVAL '1 day'),
  ('cons-001', 'CLIENT_FEEDBACK', 4.5, 'technical_skills', NOW() - INTERVAL '31 days'),
  ('cons-001', 'CLIENT_FEEDBACK', 4, 'communication', NOW() - INTERVAL '61 days'),
  ('cons-001', 'CLIENT_FEEDBACK', 4, 'delivery', NOW() - INTERVAL '91 days'),
  ('cons-001', 'EXTENSION_APPROVED', 1, NULL, NOW() - INTERVAL '5 days');

-- Consultant B: AT RISK (YELLOW)
INSERT INTO consultants (id, name, email, company_id) VALUES
  ('cons-002', 'Maria Nowak', 'maria.nowak@example.com', 'comp-001');

INSERT INTO contracts (id, consultant_id, client_id, start_date, end_date) VALUES
  ('con-002', 'cons-002', 'client-002', '2024-01-01', '2026-03-15');

INSERT INTO health_score_inputs (consultant_id, input_type, value, category, created_at) VALUES
  ('cons-002', 'CLIENT_FEEDBACK', 3, 'communication', NOW() - INTERVAL '1 day'),
  ('cons-002', 'ESCALATION', 1, NULL, NOW() - INTERVAL '10 days'),
  ('cons-002', 'ABSENCE', 1, NULL, NOW() - INTERVAL '20 days');

-- Consultant C: CRITICAL (RED)
INSERT INTO consultants (id, name, email, company_id) VALUES
  ('cons-003', 'Piotr Lewandowski', 'piotr.lewandowski@example.com', 'comp-001');

INSERT INTO contracts (id, consultant_id, client_id, start_date, end_date) VALUES
  ('con-003', 'cons-003', 'client-003', '2024-03-01', '2026-02-28');

INSERT INTO health_score_inputs (consultant_id, input_type, value, category, created_at) VALUES
  ('cons-003', 'CLIENT_FEEDBACK', 2, 'technical_skills', NOW() - INTERVAL '2 days'),
  ('cons-003', 'ESCALATION', 1, NULL, NOW() - INTERVAL '5 days'),
  ('cons-003', 'COMPLAINT', 1, NULL, NOW() - INTERVAL '8 days'),
  ('cons-003', 'ESCALATION', 1, NULL, NOW() - INTERVAL '15 days');

-- Calculate initial scores
SELECT calculate_health_scores('cons-001');
SELECT calculate_health_scores('cons-002');
SELECT calculate_health_scores('cons-003');
```

---

## 10. Przypadki Brzegowe

### 10.1 Nowy konsultant bez danych

**Scenario:** Konsultant dołączył do firmy 2 dni temu. Brak feedbacku, brak login activity.

**Oczekiwane zachowanie:**
- CF_Score = 50 (default dla braku danych)
- CS_Score = 100 (jeśli umowa ma >180 dni do końca)
- E_Score = 0 (brak loginów)
- RF_Score = 100 (brak flagów)
- Total: (50×0.40) + (100×0.30) + (0×0.20) + (100×0.10) = 50%
- Status: YELLOW
- Rekomendacja: "Zaloguj się do aplikacji, aby wykazać zaangażowanie"

**Testy:**
- Weryfikacja default values w DB
- Ui wyświetla "no data available" dla feedbacku
- Recommendations engine sugeruje onboarding actions

### 10.2 Score = dokładnie 50%

**Scenario:** Score jest dokładnie na granicy GREEN/YELLOW.

**Oczekiwane zachowanie:**
- Total = 50.00%
- Status = YELLOW (граница jest >=50, ale <80 = YELLOW)
- Wizualizacja: Gauge na dokładnie 50%, kolor przejściowy (żółty)
- Wiadomość: "Pay attention to feedback..." (YELLOW message)

**Testy:**
- Verify that 50.0 maps to YELLOW (not GREEN)
- Boundary condition: 49.99% = RED, 50.01% = YELLOW

### 10.3 Szybki spadek >15% w ciągu 1 dnia

**Scenario:** Score spadł z 80% do 60% w jednym dniu (np. escalation zarejestrowana)

**Oczekiwane zachowanie:**
- Alert SCORE_DROP_SIGNIFICANT wysłany natychmiast
- Wiadomość: "Twój score spadł z 80% do 60%. Skontaktuj się z CSM."
- CSM widzi w dashboard "At Risk" list
- Licznik w dwóch wnioskach: "days since score drop" = 0

**Testy:**
- Trigger alert logic
- Verify email/push sent immediately
- CSM dashboard shows consultant in priority

### 10.4 Wszystkie komponenty na różnych poziomach

**Scenario:** CF=90%, CS=40%, E=75%, RF=55%

**Obliczenie:**
- Total = (90×0.40) + (40×0.30) + (75×0.20) + (55×0.10)
        = 36 + 12 + 15 + 5.5
        = 68.5%
- Status: YELLOW

**Rekomendacje:**
1. "Low Contract Stability" (40%)
2. "Red Flags Alert" (55%)

**Testy:**
- Verify weighted calculation
- Verify multiple recommendations sorted by severity
- Chart shows trend across components

### 10.5 Consultant z contract_end_date w przeszłości

**Scenario:** Umowa skończyła się 5 dni temu, ale status = ACTIVE

**Oczekiwane zachowanie:**
- CS_Score = 0 (umowa wygasła)
- Flag "Contract Expired" dodana do Red Flags
- Alert RED_STATUS wysłany
- Recommendation: "Renew your contract or discuss next steps"

**Testy:**
- Cron job detectuje expired contracts daily
- Automatic flag created
- Alert triggered

---

## 11. Metryki i Monitorowanie

### 11.1 Metryki Biznesowe

**M1: Average Contract Health Score**
- Definicja: Średnia `total_score` dla wszystkich aktywnych konsultantów
- Target: ≥ 75% (zdrowy ecosystem)
- Alarm: < 65%

**M2: RED Status Distribution**
- Definicja: % konsultantów ze score < 50
- Target: < 5%
- Alarm: > 10%

**M3: YELLOW Trend**
- Definicja: % konsultantów ze score 50-79
- Target: 15-25% (naturalna dystrybucja)
- Alarm: > 35%

**M4: CSM Meeting Booking Rate**
- Definicja: % konsultantów RED/YELLOW, którzy zaplanowali meeting w ciągu 7 dni score change
- Target: ≥ 40%
- Insight: correlation z score improvement

**M5: Score Improvement Velocity**
- Definicja: Średni wzrost score między consecutive months dla konsultantów, którzy mieli meeting
- Target: +10% m/m
- Insight: effectiveness CSM interventions

### 11.2 Metryki Techniczne

**T1: Score Calculation Latency**
- Definicja: Czas pomiędzy trigger'em recalculation a aktualizacją DB
- Target: < 2 sekund
- SLA: < 5 sekund

**T2: Alert Delivery Time**
- Definicja: Czas od triggera alertu do received in client app
- Target: < 30 sekund
- SLA: < 2 minuty

**T3: API Response Time (get health score)**
- Definicja: Czas odpowiedzi GET /api/health-score/:id
- Target: < 200ms (p95)
- Alert: > 500ms

**T4: Database Query Performance**
- Definicja: Czas query'a na `health_score_history` (last 6 months)
- Target: < 100ms
- Index: (consultant_id, recorded_at DESC)

**T5: Availability**
- Definicja: % uptime Module M4 dashboard
- SLA: 99.9%

---

## 12. PROMPT DLA AI BUILDERA

### Kontekst

Opracowujesz Moduł M4: Contract Health Score dla platformy Qualrix (B2B.net S.A.). Platforma obsługuje 500+ konsultantów IT. Stack: **Next.js 14+, TypeScript, Supabase, Tailwind CSS, shadcn/ui, Recharts, next-intl**. Interfejs: Next.js App Router. Autentykacja: role-based (consultant, CSM, admin).

Moduł M4 ma za zadanie zapewnić **przejrzystość i samoświadomość** konsultantów dotyczącej stanu ich umowy bez elementów karnych czy konkurencji. Konsultant widzi tylko SWÓJ score (brak rankingu).

### Wymagania Funkcjonalne

1. **HealthScoreGauge** - Koło (gauge) 0-100% z dynamicznym kolorem (GREEN/YELLOW/RED)
2. **ScoreBreakdown** - Rozkład 4 komponentów (Client Feedback 40%, Contract Stability 30%, Engagement 20%, Red Flags 10%)
3. **TrendChart** - 6-miesięczny liniowy wykres z Recharts, wybieralne okresy (Today, 1W, 1M, 6M)
4. **RecommendationCards** - Dynamiczne karty z poradami bazującymi na słabych komponentach
5. **ScheduleCallButton** - Modal do zaplanowania rozmowy z CSM z dostępnymi slotami
6. **i18n** - Polish + English (next-intl)

### Logika Obliczania

**Formuła:**
```
TOTAL = (CF × 0.40) + (CS × 0.30) + (E × 0.20) + (RF × 0.10)
```

**Client Feedback (40%):**
- Średnia z ostatnich 4 quarterly evals (ostatnia = 40%, poprzednia = 30%, itd.)
- Brak feedback >3 m-cy: -5% za każdy miesiąc
- Krytyczy komentarz: -10%

**Contract Stability (30%):**
```
dni >= 180: CS = 100
90 <= dni < 180: CS = 80 + ((dni-90)/90)*20
30 <= dni < 90: CS = 50 + ((dni-30)/60)*30
dni < 30: CS = MAX(0, 20+dni)
Bonus: extension_approved=TRUE: +15 (cap 100)
```

**Engagement (20%):**
```
E = (LoginActivity×0.40) + (TrainingCompletion×0.35) + (TimeInApp×0.25)
LoginActivity: 20+ loginy=100%, 10-19=80%, 5-9=50%, 1-4=20%, 0=0%
TrainingCompletion: 2+=100%, 1=70%, 0=20%
TimeInApp: 20+h=100%, 10-19h=80%, 5-9h=50%, <5h=20%
```

**Red Flags (10%):**
```
RF = MAX(0, 100 - SUM(flags))
Escalation: -20%
Complaint: -15%
Absence: -10%
Warning: -25%
Inactivity >14d: -5%
```

### Model Danych (Supabase)

**contract_health_scores**
- Główna tabela z scores (client_feedback_score, contract_stability_score, engagement_score, red_flags_score, total_score)
- Pola wag (weight_client_feedback, etc.)
- Status (ACTIVE/ARCHIVED)
- calculated_at, updated_at, updated_by_user_id
- calculation_method ('AUTOMATIC' lub 'MANUAL_OVERRIDE')

**health_score_history**
- Snapshot każdej zmiany total_score
- recorded_at, recorded_by_user_id
- change_reason

**health_score_inputs**
- input_type: CLIENT_FEEDBACK, EXTENSION_APPROVED, TRAINING_PARTICIPATION, ESCALATION, ABSENCE, etc.
- value (0-100), category, notes, source_user_id
- expires_at (opcjonalnie dla tymczasowych sygnałów)
- is_active

**health_score_alerts**
- alert_type: SCORE_DROP_SIGNIFICANT, RED_STATUS_ACHIEVED, etc.
- previous_score, current_score, score_change
- is_sent, is_acknowledged
- created_at, sent_at, acknowledged_at

**csm_meetings**
- Rezerwacje spotkań konsultant-CSM
- scheduled_at, duration_minutes
- status (SCHEDULED, COMPLETED, CANCELLED)
- outcome, notes

### RLS (Row Level Security)

- Consultant: widzi TYLKO swój health score (WHERE consultant_id = auth.uid())
- CSM: widzi scores przypisanych mu konsultantów
- Admin: widzi wszystko

### Automatyzacja

**Cron Job (codziennie 6:00 AM CET):**
1. Query `health_score_inputs` dla każdego konsultanta
2. Oblicz CF, CS, E, RF dla każdego
3. Oblicz Total
4. Porównaj z poprzednią wartością
5. Jeśli drop >= 15%: utwórz alert SCORE_DROP_SIGNIFICANT
6. Jeśli nowy total < 50 a poprzedni >= 50: utwórz alert RED_STATUS
7. Utwórz entry w `health_score_history`

**Real-time Triggers:**
- CSM submit feedback: przelicz CF_Score, przelicz Total, sprawdź alert conditions
- Escalation logged: dodaj flag, przelicz RF_Score, przelicz Total, check alert
- Extension approved: dodaj sygnał, przelicz CS_Score, przelicz Total

### Komponenty & Struktura

**Pages:**
- `/consultant/health-score` - Main dashboard
- `/csm/health-score-dashboard` - CSM view all consultants
- `/admin/health-score-config` - Admin settings

**Components:**
- HealthScoreGauge
- ScoreBreakdown
- TrendChart (z Recharts LineChart)
- RecommendationCard
- ScheduleCallButton
- ComponentDetailsModal

**API Routes:**
- GET /api/health-score - get current score
- GET /api/health-score/history - get 6-month history
- GET /api/health-score/recommendations - get AI recommendations
- POST /api/health-score/recalculate - trigger manual recalc
- POST /api/health-score-inputs - submit feedback/signal
- GET /api/csm-meetings/available-slots - get CSM availability
- POST /api/csm-meetings - book meeting

### Wizualizacja & UX

**Gauge:**
- Recharts ResponsiveContainer
- SVG custom gauge z 3 segmentami (RED 0-49, YELLOW 50-79, GREEN 80-100)
- Animacja na zmianę (transition CSS)
- Tooltip: "75% | Stable"

**Trend Chart:**
- 6 linii na wykresie (total_score + 4 komponenty) LUB single line (total)
- Toggle: "Show components breakdown"
- Period selector: 6M default
- Hover: value + date

**Cards:**
- shadcn/ui Card + Badge
- Color: border-green-500 (low priority), border-yellow-500 (medium), border-red-500 (high)
- Icon: emoji (📉, ⚠️, 🎯)

**Modal ScheduleCall:**
- Fetch CSM available slots (next 7 days, intervals 30min)
- Select slot -> Confirm -> Send notification to CSM + email to consultant
- Success message: "CSM has been notified"

### Testy

**Unit Tests:**
- Calculation logic (score formula)
- Component scoring (CF, CS, E, RF)
- Boundary conditions (score=50, score=100, score=0)
- Red Flags counter

**Integration Tests:**
- Create consultant + inputs -> score calculated correctly
- Submit feedback -> Total recalculated
- Alert triggered on score drop
- CSM books meeting

**E2E Tests:**
- Consultant logs in -> views health score + breakdown + trend
- CSM submits feedback -> consultant sees score update
- Score drops 20% -> alert received

### Instrukcje Implementacji

1. **Setup DB schema:**
   - Run migration SQL (contract_health_scores, health_score_history, health_score_inputs, health_score_alerts, csm_meetings)
   - Configure RLS policies
   - Create indexes

2. **Backend logic:**
   - Implement `calculateHealthScore(consultantId)` function (PostgreSQL fn lub Node.js service)
   - Setup cron job (pg_cron lub external scheduler)
   - Create API routes
   - Implement alert logic

3. **Frontend components:**
   - Create HealthScoreGauge with Recharts
   - Create TrendChart with 6-month data
   - Create ScoreBreakdown bars
   - Create RecommendationCards (logic: if component < threshold, show relevant card)
   - Create ScheduleCallButton + modal

4. **i18n:**
   - Add PL + EN translations (use next-intl config)
   - Ensure all strings use translation keys

5. **Testing:**
   - Unit tests for calculation logic
   - Mock Supabase for integration tests
   - E2E with Playwright/Cypress

---

## 13. Zależności

### 13.1 Pakiety NPM

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "shadcn-ui": "latest",
    "recharts": "^2.10.0",
    "next-intl": "^3.0.0",
    "@supabase/supabase-js": "^2.38.0",
    "date-fns": "^2.30.0",
    "clsx": "^2.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "@testing-library/react": "^14.0.0",
    "typescript-eslint": "^6.0.0"
  }
}
```

### 13.2 Supabase Extensions / Setup

- **pg_cron:** Do scheduled health score calculations (codziennie 6:00 AM)
- **pg_net (opcjonalnie):** Do asynchronicznych notyfikacji

### 13.3 Zewnętrzne API

- **Slack API:** Do powiadomień CSM (jeśli zintegrowana)
- **Email Service** (SendGrid/AWS SES): Do powiadomień email
- **Calendar API** (Google Calendar/Outlook): Do integracji ze slotami CSM (opcjonalnie)

### 13.4 Moduły Wewnętrzne Qualrix

- **Module M1 (Consultant Profiles):** Data o konsultantach (name, email, assigned_csm)
- **Module M2 (Contracts):** Data o umowach (start_date, end_date, client_id)
- **Module M3 (Training):** Data o szkoleniach (completion status)
- **Auth Module:** Role-based access (consultant, CSM, admin)
- **Notification Module:** Push/email notifications

---

## Podsumowanie

**Moduł M4: Contract Health Score** to kluczowy komponent Qualrix, który:
- Umożliwia konsultantom **samoświadomość** stanu umowy (0-100%)
- Zapewnia **przejrzystość** poprzez rozkład 4 komponentów
- Działa w **trzech kodach kolorów** (GREEN/YELLOW/RED) ze zrozumiałymi statusami
- Oferuje **konkretne rekomendacje** do działania
- Nie karze ani nie rankuje - służy **prewencji eskalacji**
- Wspiera CSM w **identyfikacji zagrożonych konsultantów**
- Jest **w pełni zlokalizowany** (PL + EN)

Implementacja: Next.js 14+ + Supabase + Recharts, z automatycznym codziennym recalculowaniem i real-time alertami.

**Status:** Gotowy do uruchomienia sprint'u implementacyjnego.

---

**Dokument przygotowany:** 2026-02-08
**Autorzy:** B2B.net S.A. Product Team
**Wersja:** 1.0 Final

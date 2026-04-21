# Moduł M11: Analytics & Reporting
## Specyfikacja Techniczna - Qualrix by B2B.net S.A.

**Wersja:** 1.0
**Data:** 2026-02-08
**Status:** Draft
**Audience:** Board, Rada Nadzorcza, Management
**Stack:** Next.js 14+, Supabase, TypeScript, Tailwind, shadcn/ui, Recharts
**Język:** Polski + Angielski (next-intl)

---

## 1. Wprowadzenie i Cel Modułu

### 1.1 Cel Strategiczny
Moduł M11 stanowi centralny system raportowania dla zarządu i Rady Nadzorczej B2B.net S.A. Zapewnia real-time widoczność kluczowych metryk operacyjnych, finansowych i strategicznych dotyczących:
- Umów konsultantów (średni czas trwania, wczesne wyjścia)
- Wskaźników zatrudnienia (placement rate, engagement)
- Zdrowia organizacji (Health Score, churn, koszty)
- Efektywności rekrutacji (referral conversion pipeline)

### 1.2 Stakeholders
- **Rada Nadzorcza**: Codzienny monitoring KPI strategicznych
- **C-Level (CEO, CFO, COO)**: Decyzje operacyjne
- **Team Leads**: Drill-down do szczegółowych raportów
- **Business Analysts**: Eksport i analiza zaawansowana

### 1.3 Wymagania Non-Functional
- **Dostępność**: 99.5% uptime (excl. scheduled maintenance)
- **Performance**: Ładowanie dashboarda < 2s, report generation < 5s
- **Skalowanie**: Wsparcie dla 500+ consultants, 10k+ records daily
- **Compliance**: GDPR, RODO, logowanie dostępu (audit trail)
- **Bezpieczeństwo**: Role-based access (RBAC), encryption at rest/transit

---

## 2. Architektura i Struktura Danych

### 2.1 Źródła Danych
```
├── Supabase (PostgreSQL)
│   ├── contracts (umowy, data_start, data_end, status)
│   ├── consultants (profil, health_score, engagement_score)
│   ├── placements (assignment, end_reason, revenue)
│   ├── referrals (source, status, conversion_date)
│   └── audit_logs (user, action, timestamp, ip)
├── Realtime Events (Supabase Postgres Changes)
└── ETL Pipeline (nightly aggregate job)
```

### 2.2 Data Model - Agregaty Raportowe
```typescript
// Agregat dla Contract Duration Trend (M11.1)
interface ContractMetrics {
  month: string;
  avg_duration_days: number;
  avg_duration_prev_month: number;
  total_contracts: number;
  new_contracts: number;
  contract_endings: number;
  trend_percentage: number; // % m/m
}

// Agregat dla Early Exit Rate (M11.2)
interface ExitMetrics {
  month: string;
  manageable_exits: number;
  unmanageable_exits: number;
  total_exits: number;
  manageable_rate: number; // %
  unmanageable_rate: number; // %
  exit_reasons: {
    reason_code: string;
    count: number;
    percentage: number;
  }[];
}

// Agregat dla Placement Rate (M11.3)
interface PlacementMetrics {
  month: string;
  available_consultants: number;
  placed_consultants: number;
  placement_rate: number; // %
  avg_placement_duration: number;
  placement_velocity: number; // days to placement
}

// Agregat dla Health Score (M11.4)
interface HealthScoreMetrics {
  week: string;
  green_count: number; // score >= 80
  yellow_count: number; // score 60-79
  red_count: number; // score < 60
  green_percentage: number;
  yellow_percentage: number;
  red_percentage: number;
  avg_health_score: number;
}

// Agregat dla Referral Effectiveness (M11.5)
interface ReferralMetrics {
  quarter: string;
  total_referrals: number;
  referrals_hired: number;
  hired_retention_6m: number;
  conversion_rate: number; // referrals -> hired
  retention_rate: number; // hired -> retained 6m
  end_to_end_conversion: number; // referrals -> hired -> retained
  top_referral_sources: {
    source: string;
    count: number;
    conversion_rate: number;
  }[];
}

// Agregat dla Cost of Churn (M11.6)
interface ChurnCostMetrics {
  month: string;
  churned_consultants: number;
  lost_margin_ytd: number;
  lost_margin_monthly: number;
  churn_rate: number; // %
  avg_margin_lost_per_consultant: number;
  cumulative_ytd_impact: number;
}

// Agregat dla Engagement (M11.7)
interface EngagementMetrics {
  week: string;
  mau: number; // Monthly Active Users
  dau: number; // Daily Active Users
  feature_adoption: {
    feature_name: string;
    adoption_rate: number; // %
    daily_active_users: number;
  }[];
  session_avg_duration: number;
  feature_retention_7d: number;
}
```

### 2.3 Scheduled Jobs (Airflow/Supabase Functions)
```yaml
jobs:
  - name: daily_contract_aggregate
    schedule: "0 2 * * *"  # 2 AM
    task: aggregate_contract_metrics()

  - name: weekly_health_score_calc
    schedule: "0 3 * * 0"  # Sunday 3 AM
    task: calculate_health_scores()

  - name: monthly_exit_analysis
    schedule: "0 4 1 * *"  # 1st of month, 4 AM
    task: analyze_exits_and_churn()

  - name: quarterly_referral_report
    schedule: "0 5 1 1,4,7,10 *"  # 1st day of Q1, Q2, Q3, Q4
    task: generate_referral_effectiveness()

  - name: email_board_digest
    schedule: "0 8 * * 1"  # Monday 8 AM
    task: send_board_digest()
```

---

## 3. M11.1: Average Contract Duration Trend (Średni Czas Trwania Umowy)

### 3.1 Cel
Monitorowanie średniego czasu trwania umów konsultantów z trendem m/m. KPI strategiczny dla zarządzania zasobami i long-term planning.

### 3.2 Dane Źródłowe
```sql
-- Query: Contract Duration Calculation
SELECT
  DATE_TRUNC('month', c.contract_start_date)::date as month,
  COUNT(*) as total_contracts,
  AVG(EXTRACT(DAY FROM (COALESCE(c.contract_end_date, CURRENT_DATE) - c.contract_start_date))) as avg_duration_days,
  STDDEV(EXTRACT(DAY FROM (COALESCE(c.contract_end_date, CURRENT_DATE) - c.contract_start_date))) as stddev_duration,
  COUNT(CASE WHEN c.contract_end_date IS NULL THEN 1 END) as active_contracts,
  COUNT(CASE WHEN c.contract_end_date IS NOT NULL THEN 1 END) as completed_contracts
FROM contracts c
WHERE c.status IN ('ACTIVE', 'COMPLETED', 'TERMINATED')
GROUP BY DATE_TRUNC('month', c.contract_start_date)
ORDER BY month DESC;
```

### 3.3 Wizualizacja - Recharts Composite Chart
```typescript
// components/reports/ContractDurationTrend.tsx
import React, { useState, useEffect } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useTranslations } from 'next-intl';

interface ContractTrendData {
  month: string;
  avg_duration_days: number;
  avg_duration_prev_month: number;
  total_contracts: number;
  new_contracts: number;
  trend_percentage: number;
}

export function ContractDurationTrend() {
  const t = useTranslations('reports.m11_1');
  const [data, setData] = useState<ContractTrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(12);
  const [comparison, setComparison] = useState('current'); // 'current' | 'previous'

  useEffect(() => {
    fetchContractDuration();
  }, [months]);

  const fetchContractDuration = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reports/m11-1/contract-duration?months=${months}`);
      const result = await response.json();
      setData(result.data);
    } catch (error) {
      console.error('Error fetching contract duration:', error);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-300 rounded shadow">
          <p className="font-semibold">{payload[0].payload.month}</p>
          <p className="text-blue-600">
            {t('avg_duration')}: {payload[0].value.toFixed(1)} {t('days')}
          </p>
          {payload[1] && (
            <p className="text-red-600">
              {t('contracts')}: {payload[1].value}
            </p>
          )}
          {payload[0].payload.trend_percentage > 0 && (
            <p className="text-red-500 text-sm">
              ↑ {payload[0].payload.trend_percentage.toFixed(2)}% {t('vs_prev')}
            </p>
          )}
          {payload[0].payload.trend_percentage < 0 && (
            <p className="text-green-500 text-sm">
              ↓ {Math.abs(payload[0].payload.trend_percentage).toFixed(2)}% {t('vs_prev')}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <p className="text-sm text-gray-600 mt-1">{t('description')}</p>
          </div>
          <div className="flex gap-2">
            <Select
              value={months.toString()}
              onValueChange={(val) => setMonths(parseInt(val))}
            >
              <option value="3">3m</option>
              <option value="6">6m</option>
              <option value="12">12m</option>
              <option value="24">24m</option>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-96 flex items-center justify-center">
            <p>{t('loading')}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" angle={-45} textAnchor="end" height={80} />
              <YAxis yAxisId="left" label={{ value: t('days'), angle: -90, position: 'insideLeft' }} />
              <YAxis yAxisId="right" orientation="right" label={{ value: t('contracts'), angle: 90, position: 'insideRight' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="avg_duration_days"
                fill="#3b82f6"
                name={t('avg_duration')}
                radius={[8, 8, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="total_contracts"
                stroke="#ef4444"
                name={t('contracts')}
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        <div className="mt-6 grid grid-cols-4 gap-4">
          <MetricCard
            label={t('current_avg')}
            value={data[0]?.avg_duration_days.toFixed(1)}
            unit={t('days')}
          />
          <MetricCard
            label={t('trend')}
            value={data[0]?.trend_percentage.toFixed(2)}
            unit="%"
            isPositive={data[0]?.trend_percentage < 0}
          />
          <MetricCard
            label={t('active_contracts')}
            value={data[0]?.total_contracts}
          />
          <MetricCard
            label={t('new_contracts')}
            value={data[0]?.new_contracts}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// Komponent MetricCard
interface MetricCardProps {
  label: string;
  value: string | number | undefined;
  unit?: string;
  isPositive?: boolean;
}

function MetricCard({ label, value, unit, isPositive }: MetricCardProps) {
  return (
    <div className="border rounded p-4 bg-gray-50">
      <p className="text-sm text-gray-600">{label}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${isPositive ? 'text-green-600' : 'text-blue-600'}`}>
          {value ?? 'N/A'}
        </span>
        {unit && <span className="text-sm text-gray-600">{unit}</span>}
      </div>
    </div>
  );
}
```

### 3.4 Eksport Danych
```typescript
// Export PDF/Excel
export async function exportContractDurationReport(format: 'pdf' | 'excel', months: number) {
  const data = await fetchReportData(`/api/reports/m11-1/contract-duration?months=${months}`);

  if (format === 'pdf') {
    return generatePDF({
      title: 'Average Contract Duration Trend',
      data,
      chart: 'composed',
      columns: ['month', 'avg_duration_days', 'total_contracts', 'trend_percentage']
    });
  }

  if (format === 'excel') {
    return generateExcel({
      sheetName: 'Contract Duration',
      data,
      columns: [
        { header: 'Month', key: 'month' },
        { header: 'Avg Duration (days)', key: 'avg_duration_days' },
        { header: 'Total Contracts', key: 'total_contracts' },
        { header: 'Trend %', key: 'trend_percentage' }
      ]
    });
  }
}
```

---

## 4. M11.2: Early Exit Rate (Wskaźnik Wczesnych Wyjść)

### 4.1 Cel
Monitorowanie liczby wczesnych zakończeń umów, z podziałem na wyjścia zarządzalne (normal) i niezarządzalne (problematic). KPI zdrowia organizacji.

### 4.2 Klasyfikacja Wyjść
```typescript
enum ExitReason {
  // Zarządzalne (Expected/Manageable)
  CLIENT_COMPLETION = 'client_completion', // Client zakończył projekt
  CONSULTANT_PROMOTION = 'consultant_promotion', // Konsultant dostał lepszą ofertę
  STRATEGIC_MOVE = 'strategic_move', // Zmiana strategiczna

  // Niezarządzalne (Problematic)
  CLIENT_DISSATISFACTION = 'client_dissatisfaction', // Klient niezadowolony
  CONSULTANT_PERFORMANCE = 'consultant_performance', // Problemy performance
  CONFLICT = 'conflict', // Konflikt na projekcie
  COMPANY_BANKRUPTCY = 'company_bankruptcy', // Upadłość firmy
  CONSULTANT_HEALTH = 'consultant_health', // Problemy zdrowotne
  UNKNOWN = 'unknown'
}

// Mapping to categories
const exitCategories: Record<ExitReason, 'manageable' | 'unmanageable'> = {
  [ExitReason.CLIENT_COMPLETION]: 'manageable',
  [ExitReason.CONSULTANT_PROMOTION]: 'manageable',
  [ExitReason.STRATEGIC_MOVE]: 'manageable',
  [ExitReason.CLIENT_DISSATISFACTION]: 'unmanageable',
  [ExitReason.CONSULTANT_PERFORMANCE]: 'unmanageable',
  [ExitReason.CONFLICT]: 'unmanageable',
  [ExitReason.COMPANY_BANKRUPTCY]: 'unmanageable',
  [ExitReason.CONSULTANT_HEALTH]: 'unmanageable',
  [ExitReason.UNKNOWN]: 'unmanageable'
};
```

### 4.3 SQL Query
```sql
-- Query: Early Exit Analysis
SELECT
  DATE_TRUNC('month', c.contract_end_date)::date as month,
  c.exit_reason,
  CASE
    WHEN c.exit_reason IN ('client_completion', 'consultant_promotion', 'strategic_move')
      THEN 'manageable'
    ELSE 'unmanageable'
  END as exit_category,
  COUNT(*) as exit_count,
  AVG(EXTRACT(DAY FROM (c.contract_end_date - c.contract_start_date))) as avg_duration_before_exit
FROM contracts c
WHERE c.status = 'TERMINATED' AND c.contract_end_date IS NOT NULL
GROUP BY DATE_TRUNC('month', c.contract_end_date), c.exit_reason
ORDER BY month DESC, exit_count DESC;
```

### 4.4 Komponenty Wizualizacji
```typescript
// components/reports/EarlyExitRate.tsx
import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

interface ExitData {
  month: string;
  manageable_exits: number;
  unmanageable_exits: number;
  total_exits: number;
  manageable_rate: number;
  unmanageable_rate: number;
  exit_breakdown: {
    reason: string;
    count: number;
    percentage: number;
    category: 'manageable' | 'unmanageable';
  }[];
}

export function EarlyExitRate() {
  const t = useTranslations('reports.m11_2');
  const [data, setData] = useState<ExitData[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<ExitData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExitData();
  }, []);

  const fetchExitData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/reports/m11-2/exit-rate');
      const result = await response.json();
      setData(result.data);
      if (result.data.length > 0) {
        setSelectedMonth(result.data[0]);
      }
    } catch (error) {
      console.error('Error fetching exit data:', error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = {
    manageable: '#10b981',
    unmanageable: '#ef4444'
  };

  const pieData = selectedMonth ? [
    { name: t('manageable'), value: selectedMonth.manageable_exits, color: COLORS.manageable },
    { name: t('unmanageable'), value: selectedMonth.unmanageable_exits, color: COLORS.unmanageable }
  ] : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <p className="text-sm text-gray-600">{t('description')}</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-96 flex items-center justify-center">
              <p>{t('loading')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {/* Chart: Trend m/m */}
              <div>
                <h3 className="font-semibold mb-4">{t('trend')}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.slice(0, 6)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="manageable_exits" fill={COLORS.manageable} name={t('manageable')} />
                    <Bar dataKey="unmanageable_exits" fill={COLORS.unmanageable} name={t('unmanageable')} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chart: Distribution */}
              <div>
                <h3 className="font-semibold mb-4">{t('current_distribution')}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Breakdown by Reason */}
          {selectedMonth && (
            <div className="mt-8">
              <h3 className="font-semibold mb-4">{t('breakdown_by_reason')}</h3>
              <div className="space-y-2">
                {selectedMonth.exit_breakdown.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: item.category === 'manageable' ? COLORS.manageable : COLORS.unmanageable }}
                      />
                      <span>{item.reason}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{item.count}</div>
                      <div className="text-sm text-gray-600">{item.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPI Cards */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <KPICard
              label={t('manageable_rate')}
              value={selectedMonth?.manageable_rate.toFixed(1)}
              unit="%"
              color="green"
            />
            <KPICard
              label={t('unmanageable_rate')}
              value={selectedMonth?.unmanageable_rate.toFixed(1)}
              unit="%"
              color="red"
            />
            <KPICard
              label={t('total_exits')}
              value={selectedMonth?.total_exits}
              color="blue"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface KPICardProps {
  label: string;
  value: string | number | undefined;
  unit?: string;
  color: 'green' | 'red' | 'blue';
}

function KPICard({ label, value, unit, color }: KPICardProps) {
  const colorMap = {
    green: 'text-green-600 bg-green-50',
    red: 'text-red-600 bg-red-50',
    blue: 'text-blue-600 bg-blue-50'
  };

  return (
    <div className={`rounded p-4 ${colorMap[color]}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-2xl font-bold mt-2">
        {value ?? 'N/A'}{unit}
      </p>
    </div>
  );
}
```

---

## 5. M11.3: Internal Placement Rate (Wskaźnik Umiejscowienia)

### 5.1 Cel
Monitorowanie % konsultantów umiejscowionych (assigned to projects). KPI dostępności zasobów i sprzedaży.

### 5.2 SQL Query
```sql
-- Query: Placement Rate Analysis
SELECT
  DATE_TRUNC('month', DATE(NOW()))::date as metric_month,
  COUNT(DISTINCT c.consultant_id) as total_available_consultants,
  COUNT(DISTINCT CASE WHEN c.status = 'ACTIVE' AND p.placement_id IS NOT NULL THEN c.consultant_id END) as placed_consultants,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN c.status = 'ACTIVE' AND p.placement_id IS NOT NULL THEN c.consultant_id END) /
    NULLIF(COUNT(DISTINCT c.consultant_id), 0), 2) as placement_rate,
  AVG(EXTRACT(DAY FROM (COALESCE(p.assignment_end_date, CURRENT_DATE) - p.assignment_start_date))) as avg_placement_duration,
  AVG(EXTRACT(DAY FROM (p.assignment_start_date - c.profile_created_date))) as avg_days_to_placement
FROM consultants c
LEFT JOIN placements p ON c.consultant_id = p.consultant_id AND p.assignment_status = 'ACTIVE'
WHERE c.status IN ('ACTIVE', 'AVAILABLE')
GROUP BY DATE_TRUNC('month', DATE(NOW()));
```

### 5.3 Komponenty
```typescript
// components/reports/PlacementRate.tsx
import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

interface PlacementData {
  month: string;
  total_available_consultants: number;
  placed_consultants: number;
  placement_rate: number;
  avg_placement_duration: number;
  avg_days_to_placement: number;
}

export function PlacementRate() {
  const t = useTranslations('reports.m11_3');
  const [data, setData] = useState<PlacementData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('12m');

  useEffect(() => {
    fetchPlacementData();
  }, [timeRange]);

  const fetchPlacementData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reports/m11-3/placement-rate?range=${timeRange}`);
      const result = await response.json();
      setData(result.data);
    } catch (error) {
      console.error('Error fetching placement data:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentMonth = data[0];
  const targetRate = 85; // Threshold KPI

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-gray-600">{t('description')}</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-96 flex items-center justify-center"><p>{t('loading')}</p></div>
        ) : (
          <div className="space-y-6">
            {/* Main Chart */}
            <div>
              <h3 className="font-semibold mb-4">{t('trend')}</h3>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => [`${value.toFixed(1)}%`, t('placement_rate')]} />
                  <Area
                    type="monotone"
                    dataKey="placement_rate"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorRate)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-4 gap-4">
              <MetricBox label={t('current_rate')} value={currentMonth?.placement_rate} unit="%" color="blue" />
              <MetricBox label={t('target_rate')} value={targetRate} unit="%" color="gray" />
              <MetricBox label={t('placed')} value={currentMonth?.placed_consultants} color="green" />
              <MetricBox label={t('available')} value={currentMonth?.total_available_consultants} color="purple" />
            </div>

            {/* Velocity Analysis */}
            <div className="grid grid-cols-2 gap-6">
              <div className="border rounded p-4">
                <h3 className="font-semibold mb-4">{t('avg_days_to_placement')}</h3>
                <div className="text-3xl font-bold text-orange-600">
                  {currentMonth?.avg_days_to_placement.toFixed(1)} {t('days')}
                </div>
                <p className="text-sm text-gray-600 mt-2">{t('time_from_profile_to_placement')}</p>
              </div>
              <div className="border rounded p-4">
                <h3 className="font-semibold mb-4">{t('avg_placement_duration')}</h3>
                <div className="text-3xl font-bold text-blue-600">
                  {currentMonth?.avg_placement_duration.toFixed(0)} {t('days')}
                </div>
                <p className="text-sm text-gray-600 mt-2">{t('avg_engagement_length')}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricBox({ label, value, unit, color }: any) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    gray: 'bg-gray-50 text-gray-600',
  };

  return (
    <div className={`rounded p-4 ${colorMap[color]}`}>
      <p className="text-xs font-medium uppercase">{label}</p>
      <p className="text-2xl font-bold mt-2">{value}{unit ? unit : ''}</p>
    </div>
  );
}
```

---

## 6. M11.4: Health Score Distribution (Rozkład Zdrowotności)

### 6.1 Definicja Health Score
```typescript
interface HealthScoreComponents {
  engagement_score: number; // 0-100: login frequency, feature usage
  performance_score: number; // 0-100: project completion, client satisfaction
  retention_score: number; // 0-100: contract tenure, renewal rate
  skills_match_score: number; // 0-100: project alignment, skill utilization
}

function calculateHealthScore(components: HealthScoreComponents): number {
  const weights = {
    engagement: 0.25,
    performance: 0.35,
    retention: 0.25,
    skillsMatch: 0.15
  };

  return Math.round(
    components.engagement_score * weights.engagement +
    components.performance_score * weights.performance +
    components.retention_score * weights.retention +
    components.skills_match_score * weights.skillsMatch
  );
}

// Health Categories
export const HealthCategory = {
  GREEN: { min: 80, max: 100, label: 'Healthy', color: '#10b981' },
  YELLOW: { min: 60, max: 79, label: 'At Risk', color: '#f59e0b' },
  RED: { min: 0, max: 59, label: 'Critical', color: '#ef4444' }
};
```

### 6.2 SQL - Weekly Aggregation
```sql
-- Query: Weekly Health Score Distribution
SELECT
  DATE_TRUNC('week', DATE(NOW()))::date as week_start,
  COUNT(CASE WHEN c.health_score >= 80 THEN 1 END) as green_count,
  COUNT(CASE WHEN c.health_score BETWEEN 60 AND 79 THEN 1 END) as yellow_count,
  COUNT(CASE WHEN c.health_score < 60 THEN 1 END) as red_count,
  COUNT(*) as total_consultants,
  ROUND(100.0 * COUNT(CASE WHEN c.health_score >= 80 THEN 1 END) / NULLIF(COUNT(*), 0), 2) as green_pct,
  ROUND(100.0 * COUNT(CASE WHEN c.health_score BETWEEN 60 AND 79 THEN 1 END) / NULLIF(COUNT(*), 0), 2) as yellow_pct,
  ROUND(100.0 * COUNT(CASE WHEN c.health_score < 60 THEN 1 END) / NULLIF(COUNT(*), 0), 2) as red_pct,
  AVG(c.health_score) as avg_health_score
FROM consultants c
WHERE c.status IN ('ACTIVE', 'AVAILABLE')
GROUP BY DATE_TRUNC('week', DATE(NOW()));
```

### 6.3 Komponenty
```typescript
// components/reports/HealthScoreDistribution.tsx
import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';

interface HealthData {
  week: string;
  green_count: number;
  yellow_count: number;
  red_count: number;
  green_pct: number;
  yellow_pct: number;
  red_pct: number;
  total_consultants: number;
  avg_health_score: number;
}

export function HealthScoreDistribution() {
  const t = useTranslations('reports.m11_4');
  const [data, setData] = useState<HealthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState(12);

  useEffect(() => {
    fetchHealthData();
  }, [weeks]);

  const fetchHealthData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reports/m11-4/health-score?weeks=${weeks}`);
      const result = await response.json();
      setData(result.data);
    } catch (error) {
      console.error('Error fetching health data:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentWeek = data[0];
  const COLORS = {
    green: '#10b981',
    yellow: '#f59e0b',
    red: '#ef4444'
  };

  const healthPieData = currentWeek ? [
    { name: t('healthy'), value: currentWeek.green_pct, color: COLORS.green },
    { name: t('at_risk'), value: currentWeek.yellow_pct, color: COLORS.yellow },
    { name: t('critical'), value: currentWeek.red_pct, color: COLORS.red }
  ] : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <p className="text-sm text-gray-600">{t('description')}</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-96 flex items-center justify-center"><p>{t('loading')}</p></div>
          ) : (
            <div className="space-y-6">
              {/* Health Score Pie Chart */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-4">{t('current_distribution')}</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={healthPieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {healthPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Stats Cards */}
                <div className="flex flex-col justify-center gap-3">
                  <HealthCard
                    label={t('healthy')}
                    count={currentWeek?.green_count}
                    pct={currentWeek?.green_pct}
                    color="green"
                  />
                  <HealthCard
                    label={t('at_risk')}
                    count={currentWeek?.yellow_count}
                    pct={currentWeek?.yellow_pct}
                    color="yellow"
                  />
                  <HealthCard
                    label={t('critical')}
                    count={currentWeek?.red_count}
                    pct={currentWeek?.red_pct}
                    color="red"
                  />
                  <div className="border-t pt-3 mt-3">
                    <p className="text-sm text-gray-600">{t('avg_score')}</p>
                    <p className="text-3xl font-bold text-blue-600">
                      {currentWeek?.avg_health_score.toFixed(1)} / 100
                    </p>
                  </div>
                </div>
              </div>

              {/* Trend Chart */}
              <div>
                <h3 className="font-semibold mb-4">{t('trend_weeks')}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.slice(0, weeks)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="green_count" fill={COLORS.green} name={t('healthy')} stackId="health" />
                    <Bar dataKey="yellow_count" fill={COLORS.yellow} name={t('at_risk')} stackId="health" />
                    <Bar dataKey="red_count" fill={COLORS.red} name={t('critical')} stackId="health" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface HealthCardProps {
  label: string;
  count: number | undefined;
  pct: number | undefined;
  color: 'green' | 'yellow' | 'red';
}

function HealthCard({ label, count, pct, color }: HealthCardProps) {
  const colorMap = {
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    red: 'bg-red-50 border-red-200'
  };

  return (
    <div className={`border rounded p-3 ${colorMap[color]}`}>
      <div className="flex justify-between items-center">
        <span className="font-medium">{label}</span>
        <Badge variant="outline">{count}</Badge>
      </div>
      <p className="text-sm mt-1">{pct?.toFixed(1)}% of total</p>
    </div>
  );
}
```

---

## 7. M11.5: Referral Effectiveness (Efektywność Rekomendacji)

### 7.1 Cel
Śledzenie conversion pipeline: referrals → hired → retained 6m. Quarterly analysis.

### 7.2 SQL - Quarterly Conversion
```sql
-- Query: Quarterly Referral Pipeline
SELECT
  DATE_TRUNC('quarter', r.referral_date)::date as quarter_start,
  COUNT(DISTINCT r.referral_id) as total_referrals,
  COUNT(DISTINCT CASE WHEN r.referral_status = 'HIRED' THEN r.referral_id END) as referrals_hired,
  COUNT(DISTINCT CASE
    WHEN r.referral_status = 'HIRED' AND
         DATEDIFF(day, r.hire_date, CURRENT_DATE) >= 180 AND
         c.current_status = 'ACTIVE'
    THEN r.referral_id
  END) as hired_retained_6m,
  r.referral_source,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN r.referral_status = 'HIRED' THEN r.referral_id END) /
    NULLIF(COUNT(DISTINCT r.referral_id), 0), 2) as conversion_rate,
  ROUND(100.0 * COUNT(DISTINCT CASE
    WHEN r.referral_status = 'HIRED' AND
         DATEDIFF(day, r.hire_date, CURRENT_DATE) >= 180 AND
         c.current_status = 'ACTIVE'
    THEN r.referral_id
  END) / NULLIF(COUNT(DISTINCT CASE WHEN r.referral_status = 'HIRED' THEN r.referral_id END), 0), 2) as retention_rate
FROM referrals r
LEFT JOIN consultants c ON r.consultant_id = c.consultant_id
GROUP BY DATE_TRUNC('quarter', r.referral_date), r.referral_source
ORDER BY quarter_start DESC, conversion_rate DESC;
```

### 7.3 Komponenty - Funnel Visualization
```typescript
// components/reports/ReferralEffectiveness.tsx
import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

interface ReferralData {
  quarter: string;
  total_referrals: number;
  referrals_hired: number;
  hired_retained_6m: number;
  conversion_rate: number;
  retention_rate: number;
  end_to_end_conversion: number;
  top_sources: {
    source: string;
    referral_count: number;
    hire_count: number;
    conversion_pct: number;
    retention_pct: number;
  }[];
}

export function ReferralEffectiveness() {
  const t = useTranslations('reports.m11_5');
  const [data, setData] = useState<ReferralData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuarter, setSelectedQuarter] = useState<ReferralData | null>(null);

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/reports/m11-5/referral-effectiveness');
      const result = await response.json();
      setData(result.data);
      if (result.data.length > 0) {
        setSelectedQuarter(result.data[0]);
      }
    } catch (error) {
      console.error('Error fetching referral data:', error);
    } finally {
      setLoading(false);
    }
  };

  const funnelData = selectedQuarter ? [
    { stage: t('referrals'), count: selectedQuarter.total_referrals, pct: 100 },
    { stage: t('hired'), count: selectedQuarter.referrals_hired, pct: (selectedQuarter.referrals_hired / selectedQuarter.total_referrals * 100) },
    { stage: t('retained_6m'), count: selectedQuarter.hired_retained_6m, pct: (selectedQuarter.hired_retained_6m / selectedQuarter.total_referrals * 100) }
  ] : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <p className="text-sm text-gray-600">{t('description')}</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-96 flex items-center justify-center"><p>{t('loading')}</p></div>
          ) : (
            <div className="space-y-6">
              {/* Funnel Chart */}
              <div>
                <h3 className="font-semibold mb-4">{t('conversion_funnel')}</h3>
                <div className="space-y-3">
                  {funnelData.map((stage, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between mb-1">
                        <span className="font-medium">{stage.stage}</span>
                        <span className="text-sm text-gray-600">{stage.count} ({stage.pct.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded h-8 overflow-hidden">
                        <div
                          className="bg-blue-600 h-full flex items-center justify-end pr-2 text-white text-sm font-semibold"
                          style={{ width: `${stage.pct}%` }}
                        >
                          {stage.pct > 15 && `${stage.pct.toFixed(0)}%`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-4 gap-4">
                <KPICard
                  label={t('conversion_rate')}
                  value={selectedQuarter?.conversion_rate.toFixed(1)}
                  unit="%"
                  color="blue"
                />
                <KPICard
                  label={t('retention_rate')}
                  value={selectedQuarter?.retention_rate.toFixed(1)}
                  unit="%"
                  color="green"
                />
                <KPICard
                  label={t('end_to_end')}
                  value={selectedQuarter?.end_to_end_conversion.toFixed(1)}
                  unit="%"
                  color="purple"
                />
                <KPICard
                  label={t('total_referrals')}
                  value={selectedQuarter?.total_referrals}
                  color="orange"
                />
              </div>

              {/* Top Referral Sources */}
              {selectedQuarter && selectedQuarter.top_sources.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-4">{t('top_sources')}</h3>
                  <div className="space-y-3">
                    {selectedQuarter.top_sources.map((source, idx) => (
                      <div key={idx} className="border rounded p-4 bg-gray-50">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium">{source.source}</h4>
                          <Badge>{source.referral_count} {t('referrals')}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600">{t('hired')}</p>
                            <p className="text-lg font-semibold">{source.hire_count}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">{t('conversion')}</p>
                            <p className="text-lg font-semibold text-blue-600">{source.conversion_pct.toFixed(1)}%</p>
                          </div>
                          <div>
                            <p className="text-gray-600">{t('retention_6m')}</p>
                            <p className="text-lg font-semibold text-green-600">{source.retention_pct.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quarterly Trend */}
              <div>
                <h3 className="font-semibold mb-4">{t('quarterly_trend')}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="quarter" />
                    <YAxis label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                    <Tooltip formatter={(value) => `${(value as number).toFixed(1)}%`} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="conversion_rate"
                      stroke="#3b82f6"
                      name={t('conversion_rate')}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="retention_rate"
                      stroke="#10b981"
                      name={t('retention_rate')}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="end_to_end_conversion"
                      stroke="#a855f7"
                      name={t('end_to_end')}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface KPICardProps {
  label: string;
  value: string | number | undefined;
  unit?: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}

function KPICard({ label, value, unit, color }: KPICardProps) {
  const colorMap = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    purple: 'text-purple-600 bg-purple-50',
    orange: 'text-orange-600 bg-orange-50'
  };

  return (
    <div className={`rounded p-4 ${colorMap[color]}`}>
      <p className="text-xs font-medium uppercase">{label}</p>
      <p className="text-2xl font-bold mt-2">{value}{unit}</p>
    </div>
  );
}
```

---

## 8. M11.6: Cost of Churn (Koszt Churn'u)

### 8.1 Cel
Monitorowanie straty margin'u YTD z powodu churn'u (wyjścia konsultantów).

### 8.2 SQL - Churn Cost Analysis
```sql
-- Query: YTD Churn Cost
SELECT
  DATE_TRUNC('month', c.contract_end_date)::date as month,
  COUNT(*) as churned_consultants,
  SUM(CASE
    WHEN c.exit_reason NOT IN ('client_completion', 'consultant_promotion', 'strategic_move')
    THEN COALESCE(p.monthly_revenue, 0) * DATEDIFF(month, c.contract_start_date, c.contract_end_date)
    ELSE 0
  END) as lost_margin_monthly,
  SUM(CASE
    WHEN c.exit_reason NOT IN ('client_completion', 'consultant_promotion', 'strategic_move')
    THEN COALESCE(p.monthly_revenue, 0) * DATEDIFF(month, c.contract_start_date, c.contract_end_date)
    ELSE 0
  END) FILTER (WHERE YEAR(c.contract_end_date) = YEAR(CURRENT_DATE)) as lost_margin_ytd,
  ROUND(100.0 * COUNT(CASE WHEN c.exit_reason NOT IN ('client_completion', 'consultant_promotion', 'strategic_move') THEN 1 END) /
    NULLIF(COUNT(*), 0), 2) as unmanageable_churn_rate,
  ROUND(AVG(COALESCE(p.monthly_revenue, 0) * DATEDIFF(month, c.contract_start_date, c.contract_end_date)), 2) as avg_margin_lost_per_consultant
FROM contracts c
LEFT JOIN placements p ON c.placement_id = p.placement_id
WHERE c.status = 'TERMINATED'
GROUP BY DATE_TRUNC('month', c.contract_end_date)
ORDER BY month DESC;
```

### 8.3 Komponenty
```typescript
// components/reports/ChurnCost.tsx
import React, { useState, useEffect } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

interface ChurnData {
  month: string;
  churned_consultants: number;
  lost_margin_monthly: number;
  lost_margin_ytd: number;
  churn_rate: number;
  avg_margin_lost_per_consultant: number;
}

export function ChurnCost() {
  const t = useTranslations('reports.m11_6');
  const [data, setData] = useState<ChurnData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('PLN');

  useEffect(() => {
    fetchChurnData();
  }, []);

  const fetchChurnData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reports/m11-6/churn-cost?currency=${currency}`);
      const result = await response.json();
      setData(result.data);
    } catch (error) {
      console.error('Error fetching churn data:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentMonth = data[0];
  const currencySymbol = currency === 'PLN' ? 'zł' : currency === 'EUR' ? '€' : '$';

  const formatCurrency = (value: number | undefined) => {
    if (!value) return '0';
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <p className="text-sm text-gray-600">{t('description')}</p>
          </div>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="px-3 py-2 border rounded"
          >
            <option value="PLN">PLN</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-96 flex items-center justify-center"><p>{t('loading')}</p></div>
        ) : (
          <div className="space-y-6">
            {/* Main Chart */}
            <div>
              <h3 className="font-semibold mb-4">{t('monthly_impact')}</h3>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={data.slice(0, 12)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" angle={-45} textAnchor="end" height={80} />
                  <YAxis yAxisId="left" label={{ value: t('margin'), angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: t('people'), angle: 90, position: 'insideRight' }} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name.includes('lost_margin')) return [formatCurrency(value), name];
                      return [value.toString(), name];
                    }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="lost_margin_monthly"
                    fill="#ef4444"
                    name={t('monthly_margin')}
                    radius={[8, 8, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="churned_consultants"
                    stroke="#f97316"
                    name={t('churned_people')}
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              <MetricCard
                label={t('ytd_loss')}
                value={formatCurrency(currentMonth?.lost_margin_ytd)}
                color="red"
              />
              <MetricCard
                label={t('monthly_loss')}
                value={formatCurrency(currentMonth?.lost_margin_monthly)}
                color="orange"
              />
              <MetricCard
                label={t('churn_rate')}
                value={`${currentMonth?.churn_rate.toFixed(1)}%`}
                color="yellow"
              />
              <MetricCard
                label={t('avg_loss_per')}
                value={formatCurrency(currentMonth?.avg_margin_lost_per_consultant)}
                color="purple"
              />
            </div>

            {/* Alert */}
            {currentMonth && currentMonth.churn_rate > 5 && (
              <div className="border border-red-300 bg-red-50 rounded p-4">
                <p className="font-semibold text-red-900">{t('high_churn_alert')}</p>
                <p className="text-sm text-red-800 mt-1">
                  {t('alert_message')}: {formatCurrency(currentMonth.lost_margin_ytd)}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  color: 'red' | 'orange' | 'yellow' | 'purple';
}

function MetricCard({ label, value, color }: MetricCardProps) {
  const colorMap = {
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600'
  };

  return (
    <div className={`rounded p-4 ${colorMap[color]}`}>
      <p className="text-xs font-medium uppercase">{label}</p>
      <p className="text-lg font-bold mt-2">{value}</p>
    </div>
  );
}
```

---

## 9. M11.7: Engagement Metrics (MAU/DAU, Feature Adoption)

### 9.1 Cel
Real-time śledzenie zaangażowania użytkowników (MAU, DAU, feature adoption).

### 9.2 SQL - Weekly Engagement
```sql
-- Query: Weekly Engagement Metrics
SELECT
  DATE_TRUNC('week', u.last_login_date)::date as week_start,
  COUNT(DISTINCT CASE
    WHEN DATEDIFF(day, u.last_login_date, CURRENT_DATE) <= 30
    THEN u.user_id
  END) as mau,
  COUNT(DISTINCT CASE
    WHEN DATEDIFF(day, u.last_login_date, CURRENT_DATE) <= 1
    THEN u.user_id
  END) as dau,
  AVG(u.avg_session_duration_minutes) as avg_session_duration,
  COUNT(DISTINCT u.user_id) as total_active,
  (SELECT STRING_AGG(feature_name || ':' || adoption_pct, ',' ORDER BY adoption_pct DESC)
   FROM (
     SELECT
       f.feature_name,
       ROUND(100.0 * COUNT(DISTINCT uf.user_id) / (SELECT COUNT(*) FROM users), 2) as adoption_pct,
       COUNT(DISTINCT CASE WHEN DATEDIFF(day, uf.last_used_date, CURRENT_DATE) <= 7 THEN uf.user_id END) as weekly_active
     FROM user_features uf
     JOIN features f ON uf.feature_id = f.feature_id
     GROUP BY f.feature_name
     HAVING COUNT(DISTINCT uf.user_id) > 0
     ORDER BY adoption_pct DESC
     LIMIT 5
   ) features
  ) as top_features
FROM users u
WHERE u.status = 'ACTIVE'
GROUP BY DATE_TRUNC('week', u.last_login_date);
```

### 9.3 Komponenty - Dashboard
```typescript
// components/reports/EngagementMetrics.tsx
import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';

interface EngagementData {
  week: string;
  mau: number;
  dau: number;
  avg_session_duration: number;
  total_active: number;
  top_features: {
    name: string;
    adoption_rate: number;
    weekly_active_users: number;
  }[];
}

export function EngagementMetrics() {
  const t = useTranslations('reports.m11_7');
  const [data, setData] = useState<EngagementData[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState(12);

  useEffect(() => {
    fetchEngagementData();
  }, [weeks]);

  const fetchEngagementData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reports/m11-7/engagement?weeks=${weeks}`);
      const result = await response.json();
      setData(result.data);
    } catch (error) {
      console.error('Error fetching engagement data:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentWeek = data[0];
  const mauDauRatio = currentWeek ? ((currentWeek.dau / currentWeek.mau) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <p className="text-sm text-gray-600">{t('description')}</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-96 flex items-center justify-center"><p>{t('loading')}</p></div>
          ) : (
            <div className="space-y-6">
              {/* MAU/DAU Metrics */}
              <div className="grid grid-cols-4 gap-4">
                <MetricBox
                  label={t('mau')}
                  value={currentWeek?.mau}
                  subtext={t('last_30_days')}
                  color="blue"
                />
                <MetricBox
                  label={t('dau')}
                  value={currentWeek?.dau}
                  subtext={t('last_24h')}
                  color="purple"
                />
                <MetricBox
                  label={t('mau_dau_ratio')}
                  value={`${mauDauRatio}%`}
                  subtext={t('engagement_index')}
                  color="green"
                />
                <MetricBox
                  label={t('avg_session')}
                  value={`${currentWeek?.avg_session_duration.toFixed(1)}m`}
                  subtext={t('session_duration')}
                  color="orange"
                />
              </div>

              {/* Trend Chart */}
              <div>
                <h3 className="font-semibold mb-4">{t('trend')}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.slice(0, weeks)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="mau" stroke="#3b82f6" name={t('mau')} strokeWidth={2} />
                    <Line type="monotone" dataKey="dau" stroke="#a855f7" name={t('dau')} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Feature Adoption */}
              {currentWeek && currentWeek.top_features.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-4">{t('top_features')}</h3>
                  <div className="space-y-3">
                    {currentWeek.top_features.map((feature, idx) => (
                      <div key={idx} className="border rounded p-4">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-medium">{feature.name}</h4>
                          <Badge variant="outline">{feature.adoption_rate.toFixed(1)}% adoption</Badge>
                        </div>
                        <div className="w-full bg-gray-200 rounded h-6 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-purple-500 h-full flex items-center justify-end pr-2 text-white text-xs font-semibold"
                            style={{ width: `${feature.adoption_rate}%` }}
                          >
                            {feature.adoption_rate > 20 && `${feature.adoption_rate.toFixed(0)}%`}
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                          {feature.weekly_active_users} {t('weekly_active_users')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Health Summary */}
              <div className="border-t pt-4 grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded">
                  <p className="text-sm text-gray-600">{t('total_active')}</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{currentWeek?.total_active}</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <p className="text-sm text-gray-600">{t('retention_trend')}</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">↑ 12%</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded">
                  <p className="text-sm text-gray-600">{t('feature_usage')}</p>
                  <p className="text-2xl font-bold text-purple-600 mt-1">
                    {currentWeek?.top_features.length ?? 0} features
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface MetricBoxProps {
  label: string;
  value: string | number | undefined;
  subtext?: string;
  color: 'blue' | 'purple' | 'green' | 'orange';
}

function MetricBox({ label, value, subtext, color }: MetricBoxProps) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600'
  };

  return (
    <div className={`rounded p-4 ${colorMap[color]}`}>
      <p className="text-xs font-medium uppercase">{label}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
      {subtext && <p className="text-xs text-gray-600 mt-1">{subtext}</p>}
    </div>
  );
}
```

---

## 10. Dashboard Główny (Main Analytics Dashboard)

### 10.1 Layout
```typescript
// app/analytics/dashboard/page.tsx
import React from 'react';
import { Container } from '@/components/ui/container';
import { DateRangeSelector } from '@/components/reports/DateRangeSelector';
import { ContractDurationTrend } from '@/components/reports/ContractDurationTrend';
import { EarlyExitRate } from '@/components/reports/EarlyExitRate';
import { PlacementRate } from '@/components/reports/PlacementRate';
import { HealthScoreDistribution } from '@/components/reports/HealthScoreDistribution';
import { ReferralEffectiveness } from '@/components/reports/ReferralEffectiveness';
import { ChurnCost } from '@/components/reports/ChurnCost';
import { EngagementMetrics } from '@/components/reports/EngagementMetrics';
import { ExportButtons } from '@/components/reports/ExportButtons';
import { useTranslations } from 'next-intl';

export default function AnalyticsDashboard() {
  const t = useTranslations('analytics.dashboard');

  return (
    <Container className="py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold">{t('title')}</h1>
          <p className="text-gray-600 mt-2">{t('subtitle')}</p>
        </div>
        <div className="flex gap-4">
          <DateRangeSelector />
          <ExportButtons />
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <KPISummaryCard icon="📊" label={t('avg_contract_duration')} value="180d" />
        <KPISummaryCard icon="🚪" label={t('exit_rate_manageable')} value="72%" />
        <KPISummaryCard icon="🎯" label={t('placement_rate')} value="85%" />
        <KPISummaryCard icon="💚" label={t('health_score_avg')} value="78/100" />
        <KPISummaryCard icon="💰" label={t('ytd_churn_cost')} value="2.4M zł" />
      </div>

      {/* Reports Grid */}
      <div className="space-y-8">
        {/* Row 1: Contract Duration & Exit Rate */}
        <div className="grid grid-cols-2 gap-8">
          <ContractDurationTrend />
          <EarlyExitRate />
        </div>

        {/* Row 2: Placement & Health Score */}
        <div className="grid grid-cols-2 gap-8">
          <PlacementRate />
          <HealthScoreDistribution />
        </div>

        {/* Row 3: Referral & Churn Cost */}
        <div className="grid grid-cols-2 gap-8">
          <ReferralEffectiveness />
          <ChurnCost />
        </div>

        {/* Row 4: Engagement */}
        <EngagementMetrics />
      </div>

      {/* Footer */}
      <div className="mt-12 border-t pt-6 text-center text-sm text-gray-600">
        <p>{t('last_updated')}: {new Date().toLocaleString('pl-PL')}</p>
      </div>
    </Container>
  );
}

interface KPISummaryCardProps {
  icon: string;
  label: string;
  value: string;
}

function KPISummaryCard({ icon, label, value }: KPISummaryCardProps) {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
```

### 10.2 Date Range Selector
```typescript
// components/reports/DateRangeSelector.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';

export function DateRangeSelector() {
  const t = useTranslations('reports.date_range');
  const [open, setOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState('current_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const ranges = [
    { id: 'today', label: t('today') },
    { id: 'last_7_days', label: t('last_7_days') },
    { id: 'last_30_days', label: t('last_30_days') },
    { id: 'current_month', label: t('current_month') },
    { id: 'last_month', label: t('last_month') },
    { id: 'current_quarter', label: t('current_quarter') },
    { id: 'ytd', label: t('year_to_date') },
    { id: 'custom', label: t('custom') }
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        📅 {t('select_date_range')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('choose_period')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {ranges.map(range => (
            <button
              key={range.id}
              onClick={() => {
                setSelectedRange(range.id);
                if (range.id !== 'custom') setOpen(false);
              }}
              className={`w-full text-left px-4 py-2 rounded hover:bg-gray-100 ${
                selectedRange === range.id ? 'bg-blue-50 border border-blue-300' : 'border border-gray-200'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
        {selectedRange === 'custom' && (
          <div className="space-y-3 mt-4 pt-4 border-t">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder={t('start_date')}
            />
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder={t('end_date')}
            />
            <Button onClick={() => setOpen(false)} className="w-full">
              {t('apply')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

---

## 11. Export & Scheduled Reports

### 11.1 Export Functionality
```typescript
// lib/reports/export.ts
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

export async function exportReportPDF(
  reportName: string,
  data: any,
  charts: any[]
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPosition = 20;

  // Header
  doc.setFontSize(16);
  doc.text(reportName, 20, yPosition);
  yPosition += 10;

  doc.setFontSize(10);
  doc.setTextColor(128, 128, 128);
  doc.text(`Wygenerowano: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: pl })}`, 20, yPosition);
  yPosition += 15;

  // Add summary metrics
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Kluczowe Metryki', 20, yPosition);
  yPosition += 8;

  // Add data table
  if (Array.isArray(data) && data.length > 0) {
    const columns = Object.keys(data[0]);
    const rows = data.map(row =>
      columns.map(col => {
        const value = row[col];
        if (typeof value === 'number') {
          return value.toFixed(2);
        }
        return String(value);
      })
    );

    doc.autoTable({
      head: [columns.map(col => col.toUpperCase())],
      body: rows,
      startY: yPosition,
      margin: { left: 20, right: 20 },
      theme: 'grid',
      headerStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 244, 248] }
    });
  }

  // Save
  doc.save(`${reportName}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

export async function exportReportExcel(
  reportName: string,
  sheets: { name: string; data: any[] }[]
) {
  const workbook = XLSX.utils.book_new();

  sheets.forEach(sheet => {
    const worksheet = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  });

  XLSX.writeFile(workbook, `${reportName}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

export async function exportReportCSV(
  reportName: string,
  data: any[]
) {
  const csv = XLSX.utils.json_to_csv(data);
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
  element.setAttribute('download', `${reportName}-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}
```

### 11.2 Scheduled Report Email
```typescript
// lib/reports/scheduler.ts
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { format, subMonths } from 'date-fns';
import { pl } from 'date-fns/locale';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function sendBoardDigestEmail() {
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  // Fetch latest metrics
  const metrics = await fetchBoardMetrics();

  const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #333; }
          .header { background: #1e3a8a; color: white; padding: 20px; border-radius: 8px; }
          .metric-card { border: 1px solid #e5e7eb; padding: 16px; margin: 8px 0; border-radius: 6px; }
          .metric-label { color: #6b7280; font-size: 12px; text-transform: uppercase; }
          .metric-value { font-size: 28px; font-weight: bold; margin-top: 8px; }
          .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 12px 0; }
          .footer { color: #9ca3af; font-size: 12px; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Qualrix - Board Analytics Digest</h1>
          <p>${format(new Date(), 'dd MMMM yyyy', { locale: pl })}</p>
        </div>

        <div class="metric-card">
          <div class="metric-label">Średni czas umowy</div>
          <div class="metric-value">${metrics.contractDuration} dni</div>
        </div>

        <div class="metric-card">
          <div class="metric-label">Wskaźnik umiejscowienia</div>
          <div class="metric-value">${metrics.placementRate}%</div>
        </div>

        <div class="metric-card">
          <div class="metric-label">Health Score (średnia)</div>
          <div class="metric-value">${metrics.healthScore}/100</div>
        </div>

        <div class="metric-card">
          <div class="metric-label">Strata margin z churn'u (YTD)</div>
          <div class="metric-value">${metrics.churnCostYTD} zł</div>
        </div>

        ${metrics.churnRate > 5 ? `
          <div class="alert">
            <strong>⚠️ Wysoki wskaźnik churn'u!</strong>
            <p>Wskaźnik wczesnych wyjść wynosi ${metrics.churnRate}%, co jest powyżej celu 5%.</p>
          </div>
        ` : ''}

        <div class="footer">
          <p>Raport wygenerowany automatycznie każdy poniedziałek o 8:00 AM.</p>
          <p><a href="${process.env.APP_URL}/analytics/dashboard">Otwórz pełny dashboard</a></p>
        </div>
      </body>
    </html>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: 'board@b2b.net,supervisory@b2b.net',
    subject: `Qualrix Board Digest - ${format(new Date(), 'dd.MM.yyyy')}`,
    html: htmlContent
  });

  console.log('Board digest email sent successfully');
}

async function fetchBoardMetrics() {
  const { data } = await supabase
    .from('report_metrics')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();

  return {
    contractDuration: data?.avg_contract_duration || 'N/A',
    placementRate: data?.placement_rate || 'N/A',
    healthScore: data?.avg_health_score || 'N/A',
    churnCostYTD: data?.churn_cost_ytd || 'N/A',
    churnRate: data?.churn_rate || 0
  };
}

// Scheduled via pg_cron or external scheduler (e.g., AWS Lambda, GitHub Actions)
// SELECT cron.schedule('send-board-digest', '0 8 * * 1', 'SELECT send_board_digest()');
```

---

## 12. API Endpoints Specification

### 12.1 Report Data Endpoints
```typescript
// app/api/reports/m11-1/contract-duration/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { format, subMonths } from 'date-fns';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const months = request.nextUrl.searchParams.get('months') || '12';
    const startDate = subMonths(new Date(), parseInt(months));

    const { data, error } = await supabase
      .from('contract_metrics_monthly')
      .select('*')
      .gte('month', format(startDate, 'yyyy-MM-01'))
      .order('month', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching contract duration:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch contract duration data' },
      { status: 500 }
    );
  }
}
```

### 12.2 Export Endpoints
```typescript
// app/api/reports/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { exportReportPDF, exportReportExcel } from '@/lib/reports/export';

export async function POST(request: NextRequest) {
  try {
    const { format: exportFormat, reportName, data } = await request.json();

    if (exportFormat === 'pdf') {
      const pdfBuffer = await exportReportPDF(reportName, data, []);
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${reportName}.pdf"`
        }
      });
    }

    if (exportFormat === 'excel') {
      const excelBuffer = await exportReportExcel(reportName, [{ name: 'Data', data }]);
      return new NextResponse(excelBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${reportName}.xlsx"`
        }
      });
    }

    return NextResponse.json(
      { error: 'Invalid export format' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Export failed' },
      { status: 500 }
    );
  }
}
```

---

## 13. AI Builder Prompt (300+ lines)

```markdown
# AI BUILDER PROMPT: M11 Analytics & Reporting Module

## Overview
You are building the M11 Analytics & Reporting module for Qualrix (B2B.net S.A.),
an IT outsourcing platform with 500+ consultants. This module provides real-time
analytics and reporting for Board and Supervisory Board (Rada Nadzorcza).

## Stack & Constraints
- **Frontend**: Next.js 14+, TypeScript, Tailwind CSS, shadcn/ui
- **Visualization**: Recharts (only library)
- **Backend**: Supabase (PostgreSQL), Edge Functions
- **I18n**: next-intl (Polish + English)
- **Deployment**: Vercel/Docker
- **Performance**: Dashboards < 2s load, reports < 5s generation
- **Security**: RBAC, audit logs, GDPR compliance

## Data Layer Requirements

### 1. Database Schema
Create PostgreSQL tables in Supabase:

```sql
-- Main metrics aggregation tables (materialized views)
CREATE MATERIALIZED VIEW contract_metrics_monthly AS
SELECT
  DATE_TRUNC('month', c.contract_start_date)::date as month,
  COUNT(*) as total_contracts,
  AVG(EXTRACT(DAY FROM (COALESCE(c.contract_end_date, CURRENT_DATE) - c.contract_start_date))) as avg_duration_days,
  COUNT(CASE WHEN c.status = 'ACTIVE' THEN 1 END) as active_contracts,
  COUNT(CASE WHEN c.contract_end_date IS NOT NULL THEN 1 END) as completed_contracts,
  LAG(AVG(EXTRACT(DAY FROM (COALESCE(c.contract_end_date, CURRENT_DATE) - c.contract_start_date))))
    OVER (ORDER BY DATE_TRUNC('month', c.contract_start_date)) as prev_month_avg,
  ROUND(100.0 * (
    AVG(EXTRACT(DAY FROM (COALESCE(c.contract_end_date, CURRENT_DATE) - c.contract_start_date))) -
    LAG(AVG(EXTRACT(DAY FROM (COALESCE(c.contract_end_date, CURRENT_DATE) - c.contract_start_date))))
      OVER (ORDER BY DATE_TRUNC('month', c.contract_start_date))
  ) / NULLIF(
    LAG(AVG(EXTRACT(DAY FROM (COALESCE(c.contract_end_date, CURRENT_DATE) - c.contract_start_date))))
      OVER (ORDER BY DATE_TRUNC('month', c.contract_start_date)), 0
  ), 2) as trend_pct,
  CURRENT_TIMESTAMP as computed_at
FROM contracts c
GROUP BY DATE_TRUNC('month', c.contract_start_date);

CREATE INDEX idx_contract_metrics_monthly ON contract_metrics_monthly(month DESC);
```

### 2. ETL Pipeline
- **Daily**: Run aggregations at 2 AM UTC+1
- **Weekly**: Health score calculations (Sunday 3 AM)
- **Monthly**: Exit analysis, churn cost (1st day, 4 AM)
- **Quarterly**: Referral effectiveness (Q start dates, 5 AM)
- **On-demand**: Real-time engagement via RLS policies

## Frontend Architecture

### 1. Directory Structure
```
src/
├── app/
│   └── analytics/
│       ├── dashboard/
│       │   └── page.tsx
│       ├── reports/
│       │   ├── m11-1/
│       │   ├── m11-2/
│       │   └── ...
│       └── layout.tsx
├── components/
│   ├── reports/
│   │   ├── ContractDurationTrend.tsx
│   │   ├── EarlyExitRate.tsx
│   │   ├── PlacementRate.tsx
│   │   ├── HealthScoreDistribution.tsx
│   │   ├── ReferralEffectiveness.tsx
│   │   ├── ChurnCost.tsx
│   │   ├── EngagementMetrics.tsx
│   │   ├── DateRangeSelector.tsx
│   │   └── ExportButtons.tsx
│   └── ui/
├── lib/
│   ├── reports/
│   │   ├── export.ts
│   │   ├── scheduler.ts
│   │   └── hooks.ts
│   └── api/
└── public/
    └── locales/
        ├── en/
        └── pl/
```

### 2. Component Requirements

#### Chart Components
- **Recharts Usage**: ComposedChart, BarChart, LineChart, AreaChart, PieChart, RadarChart
- **Custom Tooltips**: Show metric names, values, % changes
- **Responsive**: Work on mobile (320px), tablet, desktop
- **Loading States**: Skeleton loaders, spinners
- **Error Handling**: User-friendly error messages

#### KPI Cards
- Display metric, current value, previous period value
- Color coding: Green (good), Yellow (warning), Red (critical)
- Trend indicators: ↑/↓ with percentage
- Tooltips with explanations

#### Filters & Selectors
- Date range picker (Today, Last 7/30 days, Month, Quarter, YTD, Custom)
- Department/Team filter
- Consultant type filter (Internal, External, Hybrid)
- Health score filter (Green, Yellow, Red)

### 3. Data Fetching Strategy
- Use React Query (TanStack Query) for caching, invalidation
- SWR for real-time updates (engagement metrics)
- Server components for static data
- Client components for interactive charts

```typescript
// Example: React Query setup
export function useContractMetrics(months: number) {
  return useQuery({
    queryKey: ['contracts', months],
    queryFn: async () => {
      const res = await fetch(`/api/reports/m11-1/contract-duration?months=${months}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 60 * 1000 // 30 minutes
  });
}
```

## Export & Scheduling

### 1. PDF/Excel Export
- Use jsPDF + XLSX.js
- Include charts as images
- Format: Company logo, report title, date, data table, summary
- Support bulk export (multiple reports at once)

### 2. Scheduled Reports
- Cron jobs: Email digest to board@b2b.net, supervisory@b2b.net
- Schedule: Monday 8:00 AM, Friday 5:00 PM
- Content: Top 5 KPIs, alerts, week/month summary
- Format: HTML email with unsubscribe link

### 3. Webhook Events
- Alert when KPI crosses threshold (e.g., churn > 5%)
- Trigger Slack notification
- Create audit log entry

## Internationalization (i18n)

### Polish Translations
```json
{
  "reports": {
    "m11_1": {
      "title": "Średni Czas Trwania Umowy",
      "description": "Monitorowanie trendu średniego czasu trwania umów m/m",
      "days": "dni",
      "contracts": "Umowy",
      "current_avg": "Obecna średnia",
      "vs_prev": "vs poprzedni",
      "loading": "Ładowanie..."
    }
  }
}
```

## Security & Audit

### 1. Role-Based Access Control (RBAC)
```typescript
// RLS Policy Example
CREATE POLICY "Board can view all reports"
  ON report_metrics
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'board_member');

CREATE POLICY "Team leads see own team reports"
  ON report_metrics
  FOR SELECT
  USING (team_id = (SELECT team_id FROM users WHERE id = auth.uid()));
```

### 2. Audit Logging
```typescript
// Log all report access
INSERT INTO audit_logs (user_id, action, resource, timestamp, ip_address)
VALUES (auth.uid(), 'REPORT_VIEW', 'm11-1-contract-duration', NOW(), request.ip);
```

## Testing Strategy

### 1. Unit Tests
- Test metric calculations (avg duration, churn cost, etc.)
- Test data transformations
- Test export functions

### 2. Integration Tests
- Test API endpoints
- Test database queries
- Test real-time updates

### 3. E2E Tests
- User flows: Login → View Dashboard → Export Report
- Filter interactions
- Date range selections

## Performance Optimization

### 1. Database
- Materialized views for monthly aggregates
- Indices on date columns
- Connection pooling (Supabase)
- Query optimization (EXPLAIN ANALYZE)

### 2. Frontend
- Code splitting (dynamic imports for charts)
- Image optimization (recharts exports)
- Lazy loading (Intersection Observer)
- CSS optimization (Tailwind purge)

### 3. Caching Strategy
- Client-side: React Query with 5-30 minute stale time
- Server-side: Redis for API responses (if using Edge Functions)
- Browser: Cache-Control headers (public, max-age=300)

## Deployment Checklist

- [ ] Environment variables configured (.env.local, .env.production)
- [ ] Database migrations run (schema.sql)
- [ ] Scheduled jobs configured (pg_cron, AWS Lambda, etc.)
- [ ] Email service configured (nodemailer, SendGrid)
- [ ] S3/storage for report exports
- [ ] CDN for static assets
- [ ] SSL/TLS certificates
- [ ] Monitoring alerts (errors, slow queries)
- [ ] Backup strategy
- [ ] Disaster recovery plan

## Success Criteria

✅ Dashboard loads in < 2 seconds
✅ All 7 reports generate correctly
✅ PDF/Excel exports include charts
✅ Scheduled emails deliver on time
✅ KPI alerts trigger < 1 minute
✅ Supports 500+ consultants without performance degradation
✅ GDPR compliant (logs, retention, privacy)
✅ 99.5% uptime
✅ All text translatable (PL/EN)
✅ Mobile responsive (iOS, Android)

## Maintenance & Monitoring

- **Daily**: Check job logs, database performance
- **Weekly**: Review alert frequency, user feedback
- **Monthly**: Analyze usage patterns, plan improvements
- **Quarterly**: Update strategies based on business changes

---

## Implementation Priority

### Phase 1 (Weeks 1-2)
1. Database schema setup
2. API endpoints (m11-1, m11-2)
3. Basic components (ContractDuration, EarlyExit)
4. Dashboard layout

### Phase 2 (Weeks 3-4)
1. Remaining components (M11.3-M11.7)
2. Filters & date ranges
3. Export functionality
4. Internationalization

### Phase 3 (Weeks 5-6)
1. Scheduled reports & email
2. Audit logging
3. Performance optimization
4. Testing & QA

### Phase 4 (Week 7+)
1. Monitoring & alerting
2. User feedback incorporation
3. Documentation
4. Deployment & rollout
```

---

## 13.1 Build Sequence for AI Assistants

```
STEP 1: Database & Data Layer
  ├─ Create Supabase schema (contracts, consultants, placements, etc.)
  ├─ Create materialized views for metrics
  ├─ Create indices for performance
  └─ Create RLS policies for security

STEP 2: API Layer
  ├─ Create /api/reports/m11-1/contract-duration
  ├─ Create /api/reports/m11-2/exit-rate
  ├─ Create /api/reports/m11-3/placement-rate
  ├─ Create /api/reports/m11-4/health-score
  ├─ Create /api/reports/m11-5/referral-effectiveness
  ├─ Create /api/reports/m11-6/churn-cost
  ├─ Create /api/reports/m11-7/engagement
  └─ Create /api/reports/export (PDF/Excel)

STEP 3: Components (Reports)
  ├─ ContractDurationTrend (M11.1)
  ├─ EarlyExitRate (M11.2)
  ├─ PlacementRate (M11.3)
  ├─ HealthScoreDistribution (M11.4)
  ├─ ReferralEffectiveness (M11.5)
  ├─ ChurnCost (M11.6)
  └─ EngagementMetrics (M11.7)

STEP 4: Dashboard & Utilities
  ├─ Main dashboard layout
  ├─ DateRangeSelector component
  ├─ ExportButtons component
  ├─ KPI summary cards
  └─ Navigation

STEP 5: Advanced Features
  ├─ Scheduled reports (cron jobs)
  ├─ Email notifications
  ├─ Real-time updates (WebSocket)
  ├─ Advanced filters
  └─ Comparison views

STEP 6: Polish & Optimization
  ├─ Internationalization (i18n)
  ├─ Performance tuning
  ├─ Error handling
  ├─ Loading states
  └─ Accessibility (a11y)
```

---

## Document Summary

**File Location**: `/sessions/beautiful-gifted-meitner/mnt/aplikacja zbyszka/DOC-M11_Analytics_Reporting.md`

**Content**: 600+ lines comprehensive specification covering:
- 7 distinct analytics reports with detailed SQL, React components, and Recharts configs
- Complete dashboard layout with KPI cards and filters
- PDF/Excel export functionality with email scheduling
- 300+ line AI builder prompt for implementation
- Database schema, API endpoints, security model
- I18n support (Polish/English)
- Build sequence for rapid development

**Ready for**: AI assistants, developers, project managers, technical leads.


# M12: Monetyzacja Internalizacji (Right to Hire)
## Moduł Zarządzania Opłatami za Zatrudnienie Bezpośrednie Konsultanta

**Wersja:** 1.0
**Data:** Luty 2025
**Status:** Specyfikacja
**Aplikacja:** Qualrix by B2B.net S.A.
**Stos Techniczny:** Next.js 14+, Supabase, TypeScript, Tailwind CSS, shadcn/ui, next-intl
**Język:** PL/EN

---

## 1. Wstęp i Cel Modułu

Moduł M12 zapewnia kompleksowe zarządzanie scenariuszami internalizacji (Right to Hire), czyli sytuacji, w której klient zatrudnia konsultanta bezpośrednio, pomijając platformę B2B.net. Celem modułu jest:

- **Detektowanie sygnałów internalizacji** w oparciu o wzorce behawioralne
- **Kalkulator opłat** za prawo do zatrudnienia (2-3x wynagrodzenie miesięczne)
- **Workflow negocjacyjny** z możliwością śledzenia stanu
- **Raportowanie przychodów** z internalizacji na poziomie YTD
- **Integracja z M8** (Risk Dashboard) w celu wczesnej detekcji zagrożeń
- **Zarządzanie klauzulami prawnych** w umowach

---

## 2. Architektura Modułu

### 2.1 Komponenty Główne

```
M12: Monetyzacja Internalizacji
├── 2.1.1 Signal Detection Engine (SDE)
├── 2.1.2 Fee Calculator Module (FCM)
├── 2.1.3 Negotiation Workflow Manager (NWM)
├── 2.1.4 Revenue Tracker (RT)
├── 2.1.5 Legal Compliance Manager (LCM)
├── 2.1.6 M8 Integration Bridge
└── 2.1.7 Analytics & Forecasting (AF)
```

### 2.2 Baza Danych - Schematy Tabel

#### Tabela: `internalization_signals`
```sql
CREATE TABLE internalization_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  consultant_id UUID NOT NULL REFERENCES consultants(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  signal_type TEXT NOT NULL, -- 'consultant_activity_drop', 'client_inquiry', 'linkedin_update', 'contract_expiration_no_renewal'
  signal_strength DECIMAL(3,2), -- 0.0 - 1.0 (confidence score)
  detected_at TIMESTAMP DEFAULT NOW(),
  signal_metadata JSONB, -- Dodatkowe dane (np. wiadomość, data aktualizacji LinkedIn)
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_internalization_signals_engagement ON internalization_signals(engagement_id);
CREATE INDEX idx_internalization_signals_consultant ON internalization_signals(consultant_id);
CREATE INDEX idx_internalization_signals_client ON internalization_signals(client_id);
```

#### Tabela: `right_to_hire_fees`
```sql
CREATE TABLE right_to_hire_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  consultant_id UUID NOT NULL REFERENCES consultants(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  base_monthly_rate DECIMAL(10,2) NOT NULL,
  multiplier DECIMAL(2,1) NOT NULL DEFAULT 2.5, -- 2.0 - 3.0
  calculated_fee DECIMAL(10,2) NOT NULL, -- base_monthly_rate * multiplier
  fee_status TEXT DEFAULT 'pending', -- pending, negotiating, agreed, invoiced, settled, disputed
  negotiation_notes TEXT,
  estimated_hiring_date DATE,
  actual_hiring_date DATE,
  invoice_id UUID REFERENCES invoices(id),
  settlement_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_right_to_hire_fees_status ON right_to_hire_fees(fee_status);
CREATE INDEX idx_right_to_hire_fees_engagement ON right_to_hire_fees(engagement_id);
```

#### Tabela: `negotiation_workflow`
```sql
CREATE TABLE negotiation_workflow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_id UUID NOT NULL REFERENCES right_to_hire_fees(id),
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  current_stage TEXT NOT NULL, -- alert, discussion, proposal, negotiation, agreement, invoice_sent, settled
  stage_entry_date TIMESTAMP DEFAULT NOW(),
  assignee_id UUID REFERENCES users(id),
  priority TEXT DEFAULT 'medium', -- low, medium, high, critical
  reason_for_delay TEXT,
  last_contact_date TIMESTAMP,
  next_action_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_negotiation_workflow_stage ON negotiation_workflow(current_stage);
CREATE INDEX idx_negotiation_workflow_assignee ON negotiation_workflow(assignee_id);
```

#### Tabela: `internalization_revenue`
```sql
CREATE TABLE internalization_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INT NOT NULL,
  quarter INT NOT NULL, -- 1-4
  month INT NOT NULL, -- 1-12
  consultant_id UUID REFERENCES consultants(id),
  client_id UUID REFERENCES clients(id),
  fee_amount DECIMAL(10,2) NOT NULL,
  invoice_status TEXT DEFAULT 'pending', -- pending, issued, paid, overdue
  revenue_type TEXT DEFAULT 'right_to_hire', -- right_to_hire, negotiation_discount, other
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_internalization_revenue_fiscal ON internalization_revenue(fiscal_year, quarter);
CREATE INDEX idx_internalization_revenue_month ON internalization_revenue(fiscal_year, month);
```

#### Tabela: `contract_right_to_hire_clauses`
```sql
CREATE TABLE contract_right_to_hire_clauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  clause_text TEXT NOT NULL,
  multiplier DECIMAL(2,1) NOT NULL DEFAULT 2.5,
  exclusion_period_days INT DEFAULT 365, -- Okres, w którym opłata obowiązuje
  conditions JSONB, -- np. { "min_engagement_duration_days": 90, "applicable_to_permanent_roles": true }
  status TEXT DEFAULT 'active', -- active, archived, disputed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contract_rth_clauses_contract ON contract_right_to_hire_clauses(contract_id);
```

---

## 3. Signal Detection Algorithm (SDE)

### 3.1 Algorytm Detekcji Sygnałów Internalizacji

Moduł SDE monitoruje pięć głównych kategorii sygnałów:

#### 3.1.1 Spadek Aktywności Konsultanta (`consultant_activity_drop`)

**Opis:** Konsultant wykazuje zmniejszoną aktywność na platformie (mniej logowań, mniej interakcji).

**Wzór obliczeniowy:**
```
aktywność_obecna = (logowania_7d + interakcje_7d + raporty_7d) / 7
aktywność_historyczna = średnia(aktywność ostatnie 90 dni)
spadek_procentowy = (1 - aktywność_obecna / aktywność_historyczna) * 100

IF spadek_procentowy >= 50% AND aktywność_obecna > 0:
  signal_strength = 0.5 + (min(spadek_procentowy - 50, 50) / 100)
```

**Praktyka:** Konsultant zatrudniony 90+ dni, wcześniej aktywny, w ostatnim tygodniu 2x mniej aktywny.

**Próg alertu:** signal_strength >= 0.65

#### 3.1.2 Pytania Klienta o Warunki Zatrudnienia (`client_inquiry`)

**Opis:** Klient wysyła pytania poprzez platformę dotyczące warunków zatrudnienia konsultanta na umowę o pracę.

**Słowa kluczowe:** "zatrudnienie", "kontrakt pracy", "salary", "benefits", "employment terms", "permanent position"

**Metodologia:**
```typescript
const keywords = [
  'zatrudnienie', 'umowa o pracę', 'etat', 'pensja', 'wynagrodzenie',
  'benefity', 'ubezpieczenie', 'urlop', 'contract of employment',
  'permanent', 'salary', 'benefits', 'hiring', 'employment'
];

function detectInquiry(message: string): number {
  const normalized = message.toLowerCase();
  const matchCount = keywords.filter(kw => normalized.includes(kw)).length;
  return matchCount > 0 ? Math.min(matchCount * 0.3, 1.0) : 0;
}
```

**Signal strength:** 0.3-1.0 (zależy od liczby słów kluczowych)

**Próg alertu:** signal_strength >= 0.6

#### 3.1.3 Aktualizacja Profilu LinkedIn (`linkedin_update`)

**Opis:** Konsultant aktualizuje profil LinkedIn, wskazując nową pozycję/pracodawcę.

**Integracja:** LinkedIn API (w przyszłości) lub ręczne zgłaszanie przez użytkownika.

**Pole:** `signal_metadata` zawiera datę aktualizacji i zmienione informacje.

**Signal strength:** 0.8 (wysoka pewność)

**Próg alertu:** Automatycznie >= 0.8

#### 3.1.4 Brak Odnowienia Umowy, Kontynuacja Pracy (`contract_expiration_no_renewal`)

**Opis:** Umowa konsultanta wygasa, ale konsultant wciąż pracuje dla tego samego klienta (widoczne w raportach aktywności).

**Logika:**
```
IF contract.end_date <= NOW()
   AND consultant_still_working_for_client(consultant_id, client_id, last_7_days)
   AND NOT EXISTS(new_contract FOR consultant_id AND client_id):

  signal_strength = 0.75
```

**Signal strength:** 0.75

**Próg alertu:** Automatycznie >= 0.75

#### 3.1.5 Powtarzające się Wymagania (`repeated_engagement_pattern`)

**Opis:** Klient wznawia angażowanie konsultanta po przerwie - wzór zatrudnienia bez bezpośredniej umowy.

**Logika:**
```
contracts_count = COUNT(contracts WHERE consultant_id = ? AND client_id = ? AND status = 'completed')
break_periods = identifyBreakPeriods(contracts)

IF contracts_count >= 3 AND average_break_period <= 30_days:
  signal_strength = 0.6 + (min(contracts_count - 3, 2) * 0.1)
```

**Signal strength:** 0.6-0.8

**Próg alertu:** signal_strength >= 0.6

### 3.2 Agregacja Sygnałów

Każdy konsultant/klient ma **Overall Internalization Risk Score** (OIRS):

```
OIRS = (
  signal_1_strength * weight_1 +
  signal_2_strength * weight_2 +
  signal_3_strength * weight_3 +
  signal_4_strength * weight_4 +
  signal_5_strength * weight_5
) / sum_of_weights

weights = {
  consultant_activity_drop: 0.20,
  client_inquiry: 0.30,
  linkedin_update: 0.25,
  contract_expiration_no_renewal: 0.20,
  repeated_engagement_pattern: 0.05
}
```

**Interpretacja OIRS:**
- 0.0 - 0.4: Brak ryzyka
- 0.4 - 0.6: Niskie ryzyko
- 0.6 - 0.8: Średnie ryzyko → Alert
- 0.8 - 1.0: Wysokie ryzyko → Natychmiastowa akcja

---

## 4. Fee Calculator Module (FCM)

### 4.1 Kalkulator Opłat za Prawo do Zatrudnienia

#### 4.1.1 Formuła Podstawowa

```
calculated_fee = base_monthly_rate * multiplier

gdzie:
- base_monthly_rate = średnia stawka miesięczna konsultanta (ostatnie 3 miesiące)
- multiplier = konfigurowalny współczynnik (2.0 - 3.0)
```

#### 4.1.2 Logika Wyboru Mnożnika

Mnożnik można ustawić na **trzech poziomach:**

1. **Mnożnik Domyślny** (2.5x)
   - Zastosowanie: Ogólne przypadki internalizacji
   - Base: 2.5x wynagrodzenia przeciętnego na stanowisku

2. **Mnożnik Zniżkowy** (2.0x - 2.4x)
   - Warunki: Umowa zawiera klauzulę "tiered pricing" LUB wczesne zgłoszenie (>30 dni przed zatrudnieniem)
   - Użycie: Negocjacje, aby zmotywować szybkie rozliczenie

3. **Mnożnik Premium** (2.6x - 3.0x)
   - Warunki: Brak klauzuli Right to Hire LUB zatrudnienie bez powiadomienia (<7 dni)
   - Użycie: Ochrona przed unikaniem opłat, karanie naruszania umowy

#### 4.1.3 TypeScript Implementation

```typescript
// types/right-to-hire.ts
export interface RightToHireCalculation {
  base_monthly_rate: number;
  multiplier: number;
  calculated_fee: number;
  breakdown: {
    rate_currency: string;
    multiplier_justification: string;
    fee_currency: string;
  };
}

export interface FeeCalculationParams {
  engagement_id: string;
  consultant_id: string;
  client_id: string;
  contract_id: string;
  lookback_months?: number; // default: 3
  override_multiplier?: number;
  reason_for_override?: string;
}

// lib/rth-calculator.ts
import { createClient } from '@supabase/supabase-js';

export async function calculateRTHFee(
  params: FeeCalculationParams
): Promise<RightToHireCalculation> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const lookback = params.lookback_months || 3;

  // 1. Pobranie średniej stawki konsultanta
  const { data: invoiceData, error: invoiceError } = await supabase
    .from('invoices')
    .select('amount')
    .eq('consultant_id', params.consultant_id)
    .eq('engagement_id', params.engagement_id)
    .gte('created_at', new Date(Date.now() - lookback * 30 * 24 * 60 * 60 * 1000))
    .order('created_at', { ascending: false });

  if (invoiceError) throw invoiceError;

  const baseMonthlyRate =
    invoiceData && invoiceData.length > 0
      ? invoiceData.reduce((sum, inv) => sum + inv.amount, 0) / lookback
      : 0;

  if (baseMonthlyRate === 0) {
    throw new Error('Nie można obliczyć średniej stawki konsultanta');
  }

  // 2. Określenie mnożnika
  let multiplier = params.override_multiplier || 2.5;

  if (!params.override_multiplier) {
    const { data: contractData } = await supabase
      .from('contract_right_to_hire_clauses')
      .select('multiplier, conditions')
      .eq('contract_id', params.contract_id)
      .single();

    if (contractData) {
      multiplier = contractData.multiplier;
    } else {
      // Jeśli brak klauzuli, użyj multiplier premium
      multiplier = 3.0;
    }
  }

  // 3. Walidacja zakresu mnożnika
  multiplier = Math.max(2.0, Math.min(3.0, multiplier));

  // 4. Obliczenie opłaty
  const calculatedFee = baseMonthlyRate * multiplier;

  return {
    base_monthly_rate: baseMonthlyRate,
    multiplier,
    calculated_fee: calculatedFee,
    breakdown: {
      rate_currency: 'PLN',
      multiplier_justification: await getMultiplierJustification(
        params.contract_id,
        multiplier
      ),
      fee_currency: 'PLN',
    },
  };
}

async function getMultiplierJustification(
  contract_id: string,
  multiplier: number
): Promise<string> {
  if (multiplier >= 2.9) {
    return 'Premium (brak klauzuli lub naruszenie warunków)';
  } else if (multiplier >= 2.5) {
    return 'Standard (domyślny wskaźnik)';
  } else {
    return 'Zniżka (wcześniejsze zgłoszenie lub negocjacja)';
  }
}
```

#### 4.1.4 Konfigurowalne Ustawienia

W pliku konfiguracyjnym aplikacji:

```typescript
// config/rth-config.ts
export const RTH_CONFIG = {
  DEFAULT_MULTIPLIER: 2.5,
  MIN_MULTIPLIER: 2.0,
  MAX_MULTIPLIER: 3.0,

  LOOKBACK_MONTHS: 3,

  MULTIPLIER_TIERS: {
    discount: { min: 2.0, max: 2.4, trigger: 'early_notification_30days' },
    standard: { min: 2.4, max: 2.6, trigger: 'normal_case' },
    premium: { min: 2.6, max: 3.0, trigger: 'no_clause_or_breach' },
  },

  // Możliwość zastosowania rabatów na podstawie programu lojalnościowego
  LOYALTY_DISCOUNTS: {
    engagement_duration_90days: -0.05, // -5%
    engagement_duration_180days: -0.10, // -10%
    engagement_duration_365days: -0.15, // -15% (max)
  },

  INVOICE_TERMS: {
    due_days: 30,
    payment_methods: ['bank_transfer', 'credit_card'],
  },
};
```

---

## 5. Negotiation Workflow Manager (NWM)

### 5.1 Etapy Workflow

```
ALERT (Detekcja)
  ↓
DISCUSSION (Dyskusja wewnętrzna)
  ↓
PROPOSAL (Propozycja klientowi)
  ↓
NEGOTIATION (Negocjacja warunków)
  ↓
AGREEMENT (Zgoda na warunki)
  ↓
INVOICE_SENT (Faktura wysłana)
  ↓
SETTLED (Rozliczenie zakończone)
```

### 5.2 Zarządzanie Kanban-style

#### React Component: `KanbanNegotiationBoard.tsx`

```typescript
// components/internalization/KanbanNegotiationBoard.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Clock, Users, FileText } from 'lucide-react';

interface NegotiationItem {
  id: string;
  fee_id: string;
  engagement_id: string;
  current_stage: string;
  stage_entry_date: string;
  assignee_id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  calculated_fee: number;
  consultant_name: string;
  client_name: string;
  last_contact_date: string | null;
  next_action_date: string | null;
  reason_for_delay: string | null;
}

const STAGES = [
  'alert',
  'discussion',
  'proposal',
  'negotiation',
  'agreement',
  'invoice_sent',
  'settled',
];

const STAGE_LABELS_PL = {
  alert: 'Alert',
  discussion: 'Dyskusja',
  proposal: 'Propozycja',
  negotiation: 'Negocjacja',
  agreement: 'Zgoda',
  invoice_sent: 'Faktura wysłana',
  settled: 'Rozliczone',
};

const PRIORITY_COLORS = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

export function KanbanNegotiationBoard() {
  const t = useTranslations();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [items, setItems] = useState<NegotiationItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<NegotiationItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNegotiationItems();
  }, []);

  async function loadNegotiationItems() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('negotiation_workflow')
        .select(`
          id,
          fee_id,
          engagement_id,
          current_stage,
          stage_entry_date,
          assignee_id,
          priority,
          last_contact_date,
          next_action_date,
          reason_for_delay,
          right_to_hire_fees (
            calculated_fee,
            engagements (consultant_id, client_id),
            consultants (name),
            clients (name)
          )
        `)
        .order('stage_entry_date', { ascending: false });

      if (error) throw error;

      // Transformacja danych
      const transformed = (data || []).map((item: any) => ({
        id: item.id,
        fee_id: item.fee_id,
        engagement_id: item.engagement_id,
        current_stage: item.current_stage,
        stage_entry_date: item.stage_entry_date,
        assignee_id: item.assignee_id,
        priority: item.priority,
        calculated_fee: item.right_to_hire_fees?.calculated_fee || 0,
        consultant_name: item.right_to_hire_fees?.engagements?.consultant_id || 'N/A',
        client_name: item.right_to_hire_fees?.clients?.name || 'N/A',
        last_contact_date: item.last_contact_date,
        next_action_date: item.next_action_date,
        reason_for_delay: item.reason_for_delay,
      }));

      setItems(transformed);
    } catch (error) {
      console.error('Błąd podczas ładowania workflow:', error);
    } finally {
      setLoading(false);
    }
  }

  async function moveItemToStage(itemId: string, newStage: string) {
    try {
      const { error } = await supabase
        .from('negotiation_workflow')
        .update({
          current_stage: newStage,
          stage_entry_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;

      await loadNegotiationItems();
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Błąd przy przesunięciu karty:', error);
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Ładowanie...</div>;
  }

  return (
    <div className="w-full overflow-x-auto p-6">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Workflow Negocjacji - Internalizacja</h2>
          <Button onClick={loadNegotiationItems}>Odśwież</Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          {STAGES.map((stage) => {
            const stageItems = items.filter((item) => item.current_stage === stage);
            return (
              <div
                key={stage}
                className="bg-gray-50 rounded-lg p-4 border border-gray-200 min-h-96"
              >
                <h3 className="font-semibold text-sm mb-4 text-gray-700">
                  {STAGE_LABELS_PL[stage as keyof typeof STAGE_LABELS_PL]}
                  <Badge className="ml-2">{stageItems.length}</Badge>
                </h3>

                <div className="space-y-3">
                  {stageItems.map((item) => (
                    <Card
                      key={item.id}
                      className="cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => {
                        setSelectedItem(item);
                        setIsDialogOpen(true);
                      }}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-xs text-gray-900">
                              {item.consultant_name}
                            </p>
                            <p className="text-xs text-gray-600">{item.client_name}</p>
                          </div>
                          <Badge className={PRIORITY_COLORS[item.priority]}>
                            {item.priority}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <FileText className="w-3 h-3" />
                          {item.calculated_fee.toLocaleString('pl-PL', {
                            style: 'currency',
                            currency: 'PLN',
                          })}
                        </div>

                        {item.reason_for_delay && (
                          <div className="flex items-start gap-1 text-xs text-orange-600">
                            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>{item.reason_for_delay}</span>
                          </div>
                        )}

                        {item.next_action_date && (
                          <div className="flex items-center gap-1 text-xs text-blue-600">
                            <Clock className="w-3 h-3" />
                            {new Date(item.next_action_date).toLocaleDateString('pl-PL')}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Szczegóły Negocjacji</DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-600">Konsultant</label>
                  <p className="text-lg">{selectedItem.consultant_name}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Klient</label>
                  <p className="text-lg">{selectedItem.client_name}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Opłata</label>
                  <p className="text-lg font-bold text-green-600">
                    {selectedItem.calculated_fee.toLocaleString('pl-PL', {
                      style: 'currency',
                      currency: 'PLN',
                    })}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Priorytet</label>
                  <Badge className={PRIORITY_COLORS[selectedItem.priority]}>
                    {selectedItem.priority}
                  </Badge>
                </div>
              </div>

              {selectedItem.reason_for_delay && (
                <div className="bg-orange-50 border border-orange-200 rounded p-3">
                  <p className="text-sm font-semibold text-orange-900">Powód opóźnienia:</p>
                  <p className="text-sm text-orange-800">{selectedItem.reason_for_delay}</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold">Przenieś do etapu:</label>
                <div className="flex flex-wrap gap-2">
                  {STAGES.map((stage) => (
                    <Button
                      key={stage}
                      variant={selectedItem.current_stage === stage ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => moveItemToStage(selectedItem.id, stage)}
                    >
                      {STAGE_LABELS_PL[stage as keyof typeof STAGE_LABELS_PL]}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

### 5.3 Automatyzacja Etapów

```typescript
// lib/negotiation-automation.ts
import { createClient } from '@supabase/supabase-js';

export async function automateNegotiationProgression() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Reguła 1: Jeśli brak kontaktu > 7 dni i stage = discussion/proposal/negotiation
  const { data: staleCases } = await supabase
    .from('negotiation_workflow')
    .select('id, current_stage')
    .in('current_stage', ['discussion', 'proposal', 'negotiation'])
    .lt('last_contact_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (staleCases && staleCases.length > 0) {
    for (const caseItem of staleCases) {
      await supabase
        .from('negotiation_workflow')
        .update({
          priority: 'critical',
          reason_for_delay: 'Brak kontaktu > 7 dni',
        })
        .eq('id', caseItem.id);
    }
  }

  // Reguła 2: Jeśli agreement stage > 3 dni, automatycznie przenieś do invoice_sent
  const { data: agreementCases } = await supabase
    .from('negotiation_workflow')
    .select('id')
    .eq('current_stage', 'agreement')
    .lt('stage_entry_date', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString());

  if (agreementCases && agreementCases.length > 0) {
    for (const caseItem of agreementCases) {
      await supabase
        .from('negotiation_workflow')
        .update({
          current_stage: 'invoice_sent',
          stage_entry_date: new Date().toISOString(),
        })
        .eq('id', caseItem.id);
    }
  }
}
```

---

## 6. Revenue Tracker (RT)

### 6.1 Śledzenie Przychodów

```typescript
// lib/revenue-tracker.ts
import { createClient } from '@supabase/supabase-js';

export interface InternalizationRevenueReport {
  fiscal_year: number;
  total_revenue: number;
  invoiced: number;
  paid: number;
  overdue: number;
  pending: number;
  by_quarter: Record<number, number>;
  by_month: Record<number, number>;
  by_consultant: Record<string, number>;
  by_client: Record<string, number>;
}

export async function getInternalizationRevenueYTD(
  year: number
): Promise<InternalizationRevenueReport> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: revenue, error } = await supabase
    .from('internalization_revenue')
    .select(`
      *,
      consultants (name),
      clients (name)
    `)
    .eq('fiscal_year', year)
    .order('month', { ascending: true });

  if (error) throw error;

  const report: InternalizationRevenueReport = {
    fiscal_year: year,
    total_revenue: 0,
    invoiced: 0,
    paid: 0,
    overdue: 0,
    pending: 0,
    by_quarter: { 1: 0, 2: 0, 3: 0, 4: 0 },
    by_month: {},
    by_consultant: {},
    by_client: {},
  };

  for (const item of revenue) {
    report.total_revenue += item.fee_amount;

    // By status
    if (item.invoice_status === 'paid') {
      report.paid += item.fee_amount;
      report.invoiced += item.fee_amount;
    } else if (item.invoice_status === 'issued') {
      report.invoiced += item.fee_amount;
    } else if (item.invoice_status === 'overdue') {
      report.overdue += item.fee_amount;
      report.invoiced += item.fee_amount;
    } else {
      report.pending += item.fee_amount;
    }

    // By quarter
    report.by_quarter[item.quarter] += item.fee_amount;

    // By month
    report.by_month[item.month] = (report.by_month[item.month] || 0) + item.fee_amount;

    // By consultant
    if (item.consultant_id) {
      const consultantName = item.consultants?.name || 'Unknown';
      report.by_consultant[consultantName] =
        (report.by_consultant[consultantName] || 0) + item.fee_amount;
    }

    // By client
    if (item.client_id) {
      const clientName = item.clients?.name || 'Unknown';
      report.by_client[clientName] =
        (report.by_client[clientName] || 0) + item.fee_amount;
    }
  }

  return report;
}

export async function forecastInternalizationRevenue(
  currentYear: number,
  months_ahead: number = 3
): Promise<Record<string, number>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Pobranie danych z ostatnich 6 miesięcy
  const { data: historicalData } = await supabase
    .from('internalization_revenue')
    .select('month, fee_amount')
    .gte('fiscal_year', currentYear - 1)
    .order('month', { ascending: true });

  if (!historicalData || historicalData.length === 0) {
    return {};
  }

  // Obliczenie średniej z ostatnich 6 miesięcy
  const monthlyAverages: Record<number, number[]> = {};
  for (const item of historicalData) {
    if (!monthlyAverages[item.month]) {
      monthlyAverages[item.month] = [];
    }
    monthlyAverages[item.month].push(item.fee_amount);
  }

  const forecast: Record<string, number> = {};
  const currentMonth = new Date().getMonth() + 1;

  for (let i = 1; i <= months_ahead; i++) {
    const forecastMonth = ((currentMonth + i - 1) % 12) + 1;
    const monthData = monthlyAverages[forecastMonth] || [];
    const avgFee =
      monthData.length > 0 ? monthData.reduce((a, b) => a + b, 0) / monthData.length : 0;

    // Dodaj wzrost +5% za każdy miesiąc (trend optymistyczny)
    forecast[`M+${i}`] = avgFee * (1 + 0.05 * i);
  }

  return forecast;
}
```

### 6.2 React Component: Revenue Dashboard

```typescript
// components/internalization/RevenueDashboard.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getInternalizationRevenueYTD, forecastInternalizationRevenue } from '@/lib/revenue-tracker';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1'];

export function RevenueDashboard() {
  const t = useTranslations();
  const [report, setReport] = useState<any>(null);
  const [forecast, setForecast] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const currentYear = new Date().getFullYear();
        const revenueReport = await getInternalizationRevenueYTD(currentYear);
        const forecastData = await forecastInternalizationRevenue(currentYear, 3);

        setReport(revenueReport);
        setForecast(forecastData);
      } catch (error) {
        console.error('Błąd ładowania danych przychodów:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return <div className="p-8 text-center">Ładowanie...</div>;
  }

  if (!report) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Brak danych przychodów z internalizacji</AlertDescription>
      </Alert>
    );
  }

  // Przygotowanie danych do wykresu
  const monthlyData = Object.entries(report.by_month).map(([month, value]) => ({
    month: `M${month}`,
    revenue: value,
  }));

  const consultantData = Object.entries(report.by_consultant)
    .slice(0, 10)
    .map(([name, value]) => ({
      name,
      value,
    }));

  const clientData = Object.entries(report.by_client)
    .slice(0, 10)
    .map(([name, value]) => ({
      name,
      value,
    }));

  const statusData = [
    { name: 'Paid', value: report.paid },
    { name: 'Invoiced', value: report.invoiced - report.paid },
    { name: 'Overdue', value: report.overdue },
    { name: 'Pending', value: report.pending },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Całkowity Przychód YTD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {report.total_revenue.toLocaleString('pl-PL', {
                style: 'currency',
                currency: 'PLN',
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Zapłacone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {report.paid.toLocaleString('pl-PL', {
                style: 'currency',
                currency: 'PLN',
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Zaległości</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {report.overdue.toLocaleString('pl-PL', {
                style: 'currency',
                currency: 'PLN',
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Oczekujące</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {report.pending.toLocaleString('pl-PL', {
                style: 'currency',
                currency: 'PLN',
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Przychód Miesięczny</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Przychód"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status Płatności</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) =>
                    `${name}: ${(value / 1000).toFixed(0)}k`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {COLORS.map((color, index) => (
                    <Cell key={`cell-${index}`} fill={color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Konsultantów (Przychód)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={consultantData}
                layout="vertical"
                margin={{ left: 200 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis width={190} dataKey="name" type="category" />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 10 Klientów (Przychód)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={clientData}
                layout="vertical"
                margin={{ left: 150 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis width={140} dataKey="name" type="category" />
                <Tooltip />
                <Bar dataKey="value" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

---

## 7. Legal Compliance Manager (LCM)

### 7.1 Zarządzanie Klauzulami Right to Hire

```typescript
// lib/legal-compliance.ts
import { createClient } from '@supabase/supabase-js';

export interface RTHClause {
  id: string;
  contract_id: string;
  clause_text: string;
  multiplier: number;
  exclusion_period_days: number;
  conditions: Record<string, any>;
  status: 'active' | 'archived' | 'disputed';
}

export async function validateRTHClauseForContract(
  contract_id: string
): Promise<{ valid: boolean; clause: RTHClause | null; issues: string[] }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: clause, error } = await supabase
    .from('contract_right_to_hire_clauses')
    .select('*')
    .eq('contract_id', contract_id)
    .eq('status', 'active')
    .single();

  if (error || !clause) {
    return {
      valid: false,
      clause: null,
      issues: ['Brak aktywnej klauzuli Right to Hire w umowie'],
    };
  }

  const issues: string[] = [];

  // Walidacja tekstu klauzuli
  if (!clause.clause_text || clause.clause_text.length < 50) {
    issues.push('Tekst klauzuli jest zbyt krótki lub niejasny');
  }

  // Walidacja mnożnika
  if (clause.multiplier < 2.0 || clause.multiplier > 3.0) {
    issues.push(`Mnożnik ${clause.multiplier} poza dozwolonym zakresem 2.0-3.0`);
  }

  // Walidacja okresu wykluczenia
  if (clause.exclusion_period_days < 30 || clause.exclusion_period_days > 730) {
    issues.push(
      `Okres wykluczenia ${clause.exclusion_period_days} dni poza normalnym zakresom`
    );
  }

  return {
    valid: issues.length === 0,
    clause,
    issues,
  };
}

export async function checkIfRTHApplies(
  consultant_id: string,
  client_id: string,
  contract_id: string,
  employment_date: Date
): Promise<{ applies: boolean; reason: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Sprawdzenie czy umowa ma klauzulę RTH
  const { data: clause } = await supabase
    .from('contract_right_to_hire_clauses')
    .select('*')
    .eq('contract_id', contract_id)
    .eq('status', 'active')
    .single();

  if (!clause) {
    return {
      applies: true,
      reason: 'Umowa nie zawiera klauzuli RTH - obowiązuje opłata premium',
    };
  }

  // 2. Sprawdzenie okresu wykluczenia
  const { data: originalContract } = await supabase
    .from('contracts')
    .select('end_date')
    .eq('id', contract_id)
    .single();

  if (originalContract) {
    const exclusionEndDate = new Date(originalContract.end_date);
    exclusionEndDate.setDate(
      exclusionEndDate.getDate() + clause.exclusion_period_days
    );

    if (employment_date < exclusionEndDate) {
      return {
        applies: true,
        reason: `RTH obowiązuje - zatrudnienie w okresie ${clause.exclusion_period_days} dni`,
      };
    } else {
      return {
        applies: false,
        reason: `RTH nie obowiązuje - zatrudnienie ${Math.floor(
          (employment_date.getTime() - exclusionEndDate.getTime()) / (1000 * 60 * 60 * 24)
        )} dni po końcu okresu ekspozycji`,
      };
    }
  }

  return {
    applies: true,
    reason: 'Brak danych umowy - obowiązuje opłata RTH',
  };
}

export async function generateRTHClauseTemplate(): Promise<string> {
  return `
KLAUZULA 8: PRAWO DO ZATRUDNIENIA (RIGHT TO HIRE)

8.1 Definicje
"Konsultant" oznacza pracownika lub podwykonawcę udostępnianego przez Dostawcę.
"Zatrudnienie Bezpośrednie" oznacza oferowanie lub zatrudnienie Konsultanta bezpośrednio przez Klienta bez udziału Dostawcy.

8.2 Okres Ochrony
Zakaz Zatrudnienia Bezpośredniego obowiązuje przez okres 12 (dwunastu) miesięcy od daty rozpoczęcia zaangażowania lub zakończenia umowy, w zależności od tego, które zdarzenie nastąpi później.

8.3 Opłata za Prawo do Zatrudnienia
Jeśli Klient zaproponuje lub zdecyduje się na Zatrudnienie Bezpośrednie w okresie ochrony, Klient zobowiązany jest zapłacić Dostawcy opłatę w wysokości 2,5-krotności średniomiesięcznego wynagrodzenia Konsultanta, wyliczonego na podstawie stawek z ostatnich 3 miesięcy zaangażowania.

8.4 Warunki Zastosowania Opłaty
Opłata nie obowiązuje w przypadku:
a) Przerwania zaangażowania przez Dostawcę z przyczyn dotyczących Konsultanta
b) Nieprzedłużenia umowy przez Klienta, jeśli Klient wyraźnie nie wyraził zamiaru zatrudnienia Konsultanta bezpośrednio

8.5 Warunki Płatności
Opłata staje się należna w ciągu 30 dni od złożenia faktury. Klient zobowiązany jest do zapłaty w terminie 14 dni od faktury lub karata 0,5% dziennie za każdy dzień zwłoki.

8.6 Dyskontowe Procedury
Jeśli Klient powiadomi Dostawcę o zamiarze Zatrudnienia Bezpośredniego ponad 30 dni przed oficjalnym zatrudnieniem, opłata może być zmniejszona o 20% za pomocą negocjacji.

8.7 Brak Ograniczenia Konkurencji
Niniejsza klauzula nie stanowi ograniczenia konkurencji, a jedynie rekompensatę za inwestycje Dostawcy w rekrutację, szkolenie i ustanowienie relacji.
  `.trim();
}
```

### 7.2 Generowanie Raportu Zgodności

```typescript
// lib/compliance-report.ts
export async function generateComplianceReport(
  fiscal_year: number
): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: cases } = await supabase
    .from('right_to_hire_fees')
    .select(`
      *,
      contracts (*),
      contract_right_to_hire_clauses (*)
    `)
    .order('created_at', { ascending: false });

  let casesWithClause = 0;
  let casesWithoutClause = 0;
  let casesDisputed = 0;

  for (const caseItem of cases || []) {
    if (caseItem.contract_right_to_hire_clauses.length > 0) {
      casesWithClause++;
    } else {
      casesWithoutClause++;
    }
    if (caseItem.fee_status === 'disputed') {
      casesDisputed++;
    }
  }

  const report = `
=== RAPORT ZGODNOŚCI - PRAWO DO ZATRUDNIENIA ===
Data Raportu: ${new Date().toLocaleDateString('pl-PL')}
Rok Obrachunkowy: ${fiscal_year}

PODSUMOWANIE:
- Liczba spraw ogółem: ${cases?.length || 0}
- Sprawy z klauzulą RTH: ${casesWithClause}
- Sprawy bez klauzuli RTH: ${casesWithoutClause}
- Sprawy w sporze: ${casesDisputed}

REKOMENDACJE:
1. Wykonać przegląd ${casesWithoutClause} umów bez klauzuli RTH
2. Rozpatrzeć dodanie klauzuli RTH do wszystkich nowych umów
3. Wznowić rozmowy na temat ${casesDisputed} spraw spornych
  `.trim();

  return report;
}
```

---

## 8. Integration with M8 (Risk Dashboard)

### 8.1 Przesyłanie Sygnałów do M8

```typescript
// lib/m8-integration.ts
import { createClient } from '@supabase/supabase-js';

export async function pushInternalizationSignalToM8(signal: {
  engagement_id: string;
  consultant_id: string;
  client_id: string;
  signal_type: string;
  signal_strength: number;
  signal_metadata: Record<string, any>;
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Zapis do tabeli M8
  const { error } = await supabase.from('risk_signals_m8').insert({
    module_source: 'M12',
    risk_category: 'internalization',
    risk_type: signal.signal_type,
    risk_score: signal.signal_strength,
    engagement_id: signal.engagement_id,
    consultant_id: signal.consultant_id,
    client_id: signal.client_id,
    metadata: signal.signal_metadata,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Błąd przesyłania sygnału do M8:', error);
  }
}

export async function queryM8RiskDashboard(engagement_id: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: signals } = await supabase
    .from('risk_signals_m8')
    .select('*')
    .eq('engagement_id', engagement_id)
    .order('created_at', { ascending: false });

  return signals || [];
}
```

---

## 9. API Endpoints

### 9.1 Endpoints REST

#### POST `/api/m12/detect-signals`
Ręczny trigger detekcji sygnałów dla konkretnego zaangażowania.

```typescript
// app/api/m12/detect-signals/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  detectConsultantActivityDrop,
  detectClientInquiry,
  detectLinkedInUpdate,
  detectContractExpirationNoRenewal,
} from '@/lib/signal-detection';

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { engagement_id } = await request.json();

  if (!engagement_id) {
    return NextResponse.json(
      { error: 'engagement_id is required' },
      { status: 400 }
    );
  }

  try {
    // Pobranie danych zaangażowania
    const { data: engagement } = await supabase
      .from('engagements')
      .select('*')
      .eq('id', engagement_id)
      .single();

    if (!engagement) {
      return NextResponse.json(
        { error: 'Engagement not found' },
        { status: 404 }
      );
    }

    // Uruchomienie detektywów
    const signals = [];

    const activitySignal = await detectConsultantActivityDrop(
      engagement.consultant_id,
      engagement.id
    );
    if (activitySignal.signal_strength > 0.5) signals.push(activitySignal);

    const inquirySignal = await detectClientInquiry(
      engagement.client_id,
      engagement.id
    );
    if (inquirySignal.signal_strength > 0.5) signals.push(inquirySignal);

    // Zapis sygnałów
    for (const signal of signals) {
      await supabase.from('internalization_signals').insert(signal);
    }

    return NextResponse.json({
      engagement_id,
      signals_detected: signals.length,
      signals,
    });
  } catch (error) {
    console.error('Error detecting signals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### GET `/api/m12/revenue/ytd`
Pobranie raportu przychodu za bieżący rok.

```typescript
// app/api/m12/revenue/ytd/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getInternalizationRevenueYTD } from '@/lib/revenue-tracker';

export async function GET(request: NextRequest) {
  try {
    const year = parseInt(
      request.nextUrl.searchParams.get('year') ||
        new Date().getFullYear().toString()
    );

    const report = await getInternalizationRevenueYTD(year);

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error fetching revenue:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### POST `/api/m12/fees/calculate`
Obliczenie opłaty Right to Hire.

```typescript
// app/api/m12/fees/calculate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { calculateRTHFee } from '@/lib/rth-calculator';

export async function POST(request: NextRequest) {
  try {
    const params = await request.json();

    const calculation = await calculateRTHFee(params);

    return NextResponse.json(calculation);
  } catch (error) {
    console.error('Error calculating fee:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## 10. Scheduled Jobs

### 10.1 Cron Jobs (Next.js App Router)

```typescript
// app/api/cron/m12-signal-detection/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectAllSignals } from '@/lib/signal-detection';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Autoryzacja - sprawdzenie authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Pobranie wszystkich aktywnych zaangażowań
    const { data: engagements } = await supabase
      .from('engagements')
      .select('id, consultant_id, client_id')
      .eq('status', 'active')
      .gte('start_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

    if (!engagements) {
      return NextResponse.json({ processed: 0 });
    }

    let signalsDetected = 0;

    for (const engagement of engagements) {
      const signals = await detectAllSignals(engagement);
      signalsDetected += signals.length;
    }

    return NextResponse.json({
      processed: engagements.length,
      signals_detected: signalsDetected,
    });
  } catch (error) {
    console.error('Error in signal detection cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

```typescript
// app/api/cron/m12-revenue-forecast/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { forecastInternalizationRevenue } from '@/lib/revenue-tracker';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const currentYear = new Date().getFullYear();
    const forecast = await forecastInternalizationRevenue(currentYear, 6);

    return NextResponse.json({
      year: currentYear,
      forecast,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in revenue forecast cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## 11. AI Builder Prompt (300+ lines)

```prompt
# AI Builder Prompt: M12 Monetyzacja Internalizacji (Right to Hire)

## Cel Systemu
Opracowanie kompletnego modułu zarządzania scenariuszami internalizacji (Right to Hire) dla platformy Qualrix by B2B.net. Moduł automatycznie detektuje, kalkuluje, negocjuje i śledzi przychody z opłat za zatrudnienie bezpośrednie konsultantów.

## Kontekst Biznesowy
- Firma B2B.net świadczy usługi outsourcingu IT z 500+ konsultantami
- Problem: Klienci zatrudniają konsultantów bezpośrednio, pomijając platformę
- Rozwiązanie: Opłata Right to Hire (2-3x wynagrodzenie miesięczne)
- Perspektywa: Dodatkowe źródło przychodów, ochrona modelumarż konsultantów

## Architektura Techniczna
- Frontend: Next.js 14+, TypeScript, React 18+
- Backend: Next.js API Routes, Supabase (PostgreSQL)
- Styling: Tailwind CSS + shadcn/ui
- Internacjonalizacja: next-intl (PL/EN)
- Baza danych: PostgreSQL z Supabase

## Komponenty do Zbudowania

### 1. Signal Detection Engine (SDE)
Sygnały internalizacji:
- Spadek aktywności konsultanta (50%+ w ostatnim tygodniu)
- Pytania klienta o zatrudnienie (słowa kluczowe: zatrudnienie, umowa, salary)
- Aktualizacja LinkedIn (nowa pozycja)
- Brak odnowienia umowy, kontynuacja pracy
- Powtarzający się wzór zaangażowania (3+ kontrakty)

Algorytm:
```
OIRS = suma(signal_strength * weight) / suma(weights)
Progi: 0.4 = niskie, 0.6 = średnie (alert), 0.8 = wysokie
```

Tabele:
- `internalization_signals` (id, engagement_id, consultant_id, signal_type, signal_strength, metadata)
- Indeksy na: engagement_id, consultant_id, client_id, created_at

### 2. Fee Calculator Module (FCM)
Formuła: `fee = base_monthly_rate * multiplier`

Mnożniki:
- 2.0-2.4x: Zniżkowy (wcześniejsze zgłoszenie > 30 dni)
- 2.5x: Standardowy (domyślny)
- 2.6-3.0x: Premium (brak klauzuli lub naruszenie)

Implementacja:
- Pobierz średnią stawkę z ostatnich 3 miesięcy
- Sprawdź klauzulę Right to Hire w umowie
- Oblicz opłatę na podstawie mnożnika
- Zwróć breakdown i uzasadnienie

Tabele:
- `right_to_hire_fees` (id, engagement_id, base_monthly_rate, multiplier, calculated_fee, fee_status)
- Statusy: pending, negotiating, agreed, invoiced, settled, disputed

### 3. Negotiation Workflow Manager (NWM)
Workflow: alert → discussion → proposal → negotiation → agreement → invoice_sent → settled

Kanban Board:
- 7 kolumn (stage), każda zawiera karty z dedułami
- Drag-and-drop między stagami
- Detail modal: konsultant, klient, opłata, priorytet, powód opóźnienia
- Automatyzacja: jeśli brak kontaktu > 7 dni → critical; jeśli agreement > 3 dni → invoice_sent

Tabele:
- `negotiation_workflow` (id, fee_id, current_stage, assignee_id, priority, last_contact_date, reason_for_delay)

### 4. Revenue Tracker (RT)
Dashboard z metrykami:
- Całkowity przychód YTD
- Przychód zapłacony / zaległy / oczekujący
- Przychód po kwartałach, miesiącach
- Top 10 konsultantów / klientów (przychód)
- Prognozy na 3-6 miesięcy

Wykresy:
- Line chart: przychód miesięczny
- Pie chart: status płatności
- Bar charts: top konsultanci i klienci

Forecast: średnia z ostatnich 6 miesięcy + wzrost 5% za miesiąc

Tabele:
- `internalization_revenue` (id, fiscal_year, quarter, month, consultant_id, client_id, fee_amount, invoice_status)

### 5. Legal Compliance Manager (LCM)
Zarządzanie klauzulami:
- Szablon klauzuli Right to Hire (8 sekcji, 400+ słów)
- Walidacja umowy: czy ma aktywną klauzulę?
- Sprawdzenie czy RTH obowiązuje: czy w okresie ekspozycji?
- Raport zgodności: liczba spraw z klauzulą / bez klauzuli / w sporze

Tabele:
- `contract_right_to_hire_clauses` (id, contract_id, clause_text, multiplier, exclusion_period_days, status)

### 6. M8 Integration Bridge
Przesyłanie sygnałów internalizacji do M8 Risk Dashboard:
- Zapis w tabeli `risk_signals_m8` (module_source='M12', risk_type, risk_score)
- Pobranie już zgłoszonych ryzyk dla zaangażowania

## Baza Danych - DDL

```sql
-- Sygnały
CREATE TABLE internalization_signals (
  id UUID PRIMARY KEY,
  engagement_id UUID NOT NULL REFERENCES engagements,
  consultant_id UUID NOT NULL REFERENCES consultants,
  client_id UUID NOT NULL REFERENCES clients,
  signal_type TEXT NOT NULL,
  signal_strength DECIMAL(3,2),
  detected_at TIMESTAMP,
  signal_metadata JSONB,
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_internalization_signals_engagement ON internalization_signals(engagement_id);

-- Opłaty
CREATE TABLE right_to_hire_fees (
  id UUID PRIMARY KEY,
  engagement_id UUID NOT NULL REFERENCES engagements,
  consultant_id UUID NOT NULL REFERENCES consultants,
  client_id UUID NOT NULL REFERENCES clients,
  base_monthly_rate DECIMAL(10,2) NOT NULL,
  multiplier DECIMAL(2,1) NOT NULL DEFAULT 2.5,
  calculated_fee DECIMAL(10,2) NOT NULL,
  fee_status TEXT DEFAULT 'pending',
  invoice_id UUID REFERENCES invoices,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_right_to_hire_fees_status ON right_to_hire_fees(fee_status);

-- Workflow negocjacji
CREATE TABLE negotiation_workflow (
  id UUID PRIMARY KEY,
  fee_id UUID NOT NULL REFERENCES right_to_hire_fees,
  current_stage TEXT NOT NULL,
  stage_entry_date TIMESTAMP DEFAULT NOW(),
  assignee_id UUID REFERENCES users,
  priority TEXT DEFAULT 'medium',
  last_contact_date TIMESTAMP,
  reason_for_delay TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Przychody
CREATE TABLE internalization_revenue (
  id UUID PRIMARY KEY,
  fiscal_year INT NOT NULL,
  quarter INT NOT NULL,
  month INT NOT NULL,
  consultant_id UUID REFERENCES consultants,
  client_id UUID REFERENCES clients,
  fee_amount DECIMAL(10,2) NOT NULL,
  invoice_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Klauzule umów
CREATE TABLE contract_right_to_hire_clauses (
  id UUID PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES contracts,
  clause_text TEXT NOT NULL,
  multiplier DECIMAL(2,1) NOT NULL DEFAULT 2.5,
  exclusion_period_days INT DEFAULT 365,
  conditions JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints

GET /api/m12/revenue/ytd?year=2025
GET /api/m12/negotiations/board
GET /api/m12/signals?engagement_id=...
GET /api/m12/legal/clauses?contract_id=...

POST /api/m12/fees/calculate
POST /api/m12/detect-signals
POST /api/m12/negotiations/move-stage
POST /api/m12/fees/create-invoice

## Frontend Components

- KanbanNegotiationBoard: Kanban z workflow
- RevenueDashboard: Metryki i wykresy przychodu
- SignalAlert: Alert o nowych sygnałach
- FeeCalculator: Formularz do ręcznego obliczenia opłaty
- LegalClauseManager: Zarządzanie klauzulami
- ComplianceReport: Raport zgodności

## Integracja z Systemem

- M8 Risk Dashboard: Przesyłanie sygnałów na bazie OIRS >= 0.6
- System Fakturowania: Automatyczne tworzenie faktur na podstawie ustalonej opłaty
- Moduł Komunikacji: Notyfikacje o nowych negocjacjach
- Moduł Raportowania: Włączenie przychodów RTH do raportów YTD

## Bezpieczeństwo i Compliance

- RLS (Row Level Security) na poziomie użytkownika
- Audyt zmian w fee_status i fee_amount
- Ochrona danych osobowych konsultantów
- Szablony RODO-compliant dla komunikacji
- Weryfikacja autoryzacji dla zmian stage workflow

## Walidacja i Błędy

- Sprawdzenie czy base_monthly_rate > 0
- Sprawdzenie czy multiplier w zakresie 2.0-3.0
- Sprawdzenie czy consultant_id / client_id / engagement_id istnieją
- Sprawdzenie czy umowa aktywna w momencie zatrudnienia
- Obsługa biznesowa: negocjacja, sporny status, brak zgody

## Dokumentacja

- README z instrukcjami deployment
- Schemat bazy danych z diagramem ER
- Instrukcje konfiguracji mnożników
- Szablony wiadomości e-mail dla klientów
- FAQ dotyczące Right to Hire

## Language & Localization

- Wszystkie komunikaty w PL i EN (next-intl)
- Formaty dat i walut lokalne (pl-PL, en-US)
- Support dla EUR i PLN w umowach
```

---

## 12. Monitoring i Alerting

### 12.1 Metryki do Śledzenia

```typescript
// lib/monitoring.ts
export const MONITORING_METRICS = {
  // Sygnały
  signals_detected_daily: 'Liczba sygnałów wykrytych dziennie',
  signals_high_confidence: 'Sygnały z OIRS >= 0.8',
  signals_by_type: 'Rozkład sygnałów po typach',

  // Negocjacje
  negotiations_pending: 'Negocjacje w statusie pending',
  negotiations_overdue: 'Negocjacje bez postępu > 7 dni',
  avg_negotiation_duration: 'Średni czas negocjacji (dni)',

  // Przychody
  revenue_ytd: 'Przychód YTD',
  revenue_invoiced: 'Przychód zakomunikowany w fakturach',
  revenue_paid: 'Przychód zapłacony',
  overdue_amount: 'Zaległa kwota',

  // Compliance
  contracts_with_rth_clause: 'Umowy z klauzulą RTH',
  rth_disputes: 'Sprawy w sporze',
};
```

---

## 13. Roadmap Przyszłego Rozwoju

1. **Q2 2025:** Integracja z LinkedIn API do automatycznej detekcji zmian
2. **Q3 2025:** Machine Learning dla predykcji internalizacji (zamiast rules-based)
3. **Q4 2025:** Automatyczne wysyłanie ofert negocjacyjnych via email
4. **2026:** Integracja z systemami HR klientów (API webhook)
5. **2026:** Automatyczne rozliczenia poprzez payment gateway

---

## Podsumowanie

Moduł M12 stanowi kluczową część strategii monetyzacji internalizacji w platformie Qualrix. Poprzez:
- Automatyczną detektywę sygnałów
- Transparentne obliczanie opłat
- Strukturalny workflow negocjacyjny
- Kompleksowe raportowanie przychodów
- Zgodność z wymogami prawnymi

...system zapewnia efektywne zarządzanie scenariuszami zatrudnienia bezpośredniego i generowanie dodatkowych przychodów dla B2B.net.
```

---

## Zasoby i Referencje

- **Dokumentacja Supabase:** https://supabase.com/docs
- **Next.js 14 Docs:** https://nextjs.org/docs
- **shadcn/ui Components:** https://ui.shadcn.com
- **Tailwind CSS:** https://tailwindcss.com
- **next-intl:** https://next-intl-docs.vercel.app
- **TypeScript Handbook:** https://www.typescriptlang.org/docs

---

**Dokument przygotowany dla:** B2B.net S.A. / Qualrix Platform
**Wersja specyfikacji:** 1.0 (Luty 2025)
**Status:** Gotowy do implementacji

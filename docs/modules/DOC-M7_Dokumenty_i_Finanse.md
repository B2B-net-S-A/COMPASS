# Specyfikacja Modułu M7: Dokumenty i Finanse
## Aplikacja Qualrix | B2B.net S.A.

**Wersja:** 1.0
**Data:** Luty 2025
**Autor:** B2B.net S.A. - Zespół DevOps
**Status:** PRODUKCJA
**Stack Techniczny:** Next.js 14+, Supabase, TypeScript, Tailwind CSS, shadcn/ui, next-intl

---

## Spis treści
1. [Przegląd modułu](#1-przegląd-modułu)
2. [Cele biznesowe](#2-cele-biznesowe)
3. [Architektura systemowa](#3-architektura-systemowa)
4. [Moduły funkcjonalne](#4-moduły-funkcjonalne)
5. [Model danych](#5-model-danych)
6. [Zarządzanie plikami](#6-zarządzanie-plikami)
7. [Generowanie raportów](#7-generowanie-raportów)
8. [Bezpieczeństwo i dostęp](#8-bezpieczeństwo-i-dostęp)
9. [Przepływy biznesowe](#9-przepływy-biznesowe)
10. [Interfejs użytkownika](#10-interfejs-użytkownika)
11. [API i Integracje](#11-api-i-integracje)
12. [Monitoring i obsługa błędów](#12-monitoring-i-obsługa-błędów)
13. [Prompt AI Builder (300+ linii)](#13-prompt-ai-builder)

---

## 1. Przegląd modułu

### 1.1 Opis
Moduł M7 stanowi centralne repozytorium dla wszystkich dokumentów i danych finansowych konsultantów w aplikacji Qualrix. Zapewnia spójne źródło informacji o umowach, historii płatności, fakturile i dokumentach finansowych, wspierając 500+ konsultantów zaangażowanych w projekty IT outsourcingowe.

### 1.2 Escenariusze użytkownika
- **Konsultant:** dostęp do aktualnej umowy, historii płatności, generowanie faktur
- **Administrator:** zarządzanie dokumentami, weryfikacja faktur, generowanie raportów rocznych
- **Księgowy:** przegląd warunków finansowych, status płatności, raport roczny do rozliczeń
- **Manager:** nadzór nad warunkami umowy zespołu, monitorowanie statusu płatności

### 1.3 Kluczowe cechy
- Pobieranie PDF umowy w aktualnej wersji
- Archiwum historycznych wersji umów
- Dashboard statusu płatności z chronologią
- Zarządzanie fakturami (upload, weryfikacja, archiw)
- Generowanie rocznych raportów finansowych
- Bezpieczne przechowywanie danych z szyfrowaniem
- Wsparcie wielojęzyczności (PL/EN)
- Kontrola dostępu oparta na rolach

---

## 2. Cele biznesowe

### 2.1 Cele główne
1. **Centralizacja dokumentów** - jedna platforma dla wszystkich dokumnów umowy i finansowych
2. **Automatyzacja raportowania** - generowanie raportów rocznych dla rachunkowości
3. **Przejrzystość płatności** - real-time informacje o statusie wszystkich płatności
4. **Zgodność prawna** - przechowywanie zgodne z wymogami RODO i podatkowymi
5. **Efektywność administracyjna** - redukcja czasu zarządzania dokumentami papierowymi

### 2.2 Metryki sukcesu
- Średni czas dostępu do umowy: < 5 sekund
- Czas generowania raportu rocznego: < 30 sekund
- Dostępność systemu: > 99.5%
- Poprawność danych finansowych: 100%
- Czas weryfikacji faktury przez admina: < 2 dni

### 2.3 Ograniczenia
- Maksymalny rozmiar pliku umowy: 50 MB
- Maksymalny rozmiar archiwum rocznie: 10 GB
- Okres przechowywania: 10 lat
- Równoczesni użytkownicy: 500+

---

## 3. Architektura systemowa

### 3.1 Stack techniczny
```
Frontend:
  - Next.js 14+ (App Router)
  - TypeScript
  - Tailwind CSS v3
  - shadcn/ui (komponenty)
  - next-intl (i18n PL/EN)
  - Zustand (state management)
  - TanStack Query v5 (data fetching)
  - jsPDF / PDFKit (generowanie PDF)

Backend:
  - Next.js API Routes
  - Supabase (baza danych + storage + auth)
  - PostgreSQL (główna DB)
  - Edge Functions (serverless)

Bezpieczeństwo:
  - Row Level Security (RLS) w Supabase
  - Szyfrowanie danych wrażliwych
  - JWT tokens
  - CORS polityka
  - Rate limiting

Deployment:
  - Vercel (hosting)
  - Supabase Cloud (baza + storage)
  - CDN dla statycznych plików
```

### 3.2 Diagram przepływu danych
```
┌─────────────────────────────────────────────┐
│           Interfejs użytkownika              │
│     (Next.js komponenty, TypeScript)        │
└────────────────┬────────────────────────────┘
                 │
         ┌───────▼────────┐
         │  API Routes    │
         │  (/api/docs)   │
         └───────┬────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼──┐    ┌───▼──┐    ┌───▼──┐
│ Auth │    │  DB  │    │Storage│
│(JWT) │    │(SQL) │    │(Files)│
└──────┘    └──────┘    └───────┘
    │            │            │
    └────────────┴────────────┘
          │
    ┌─────▼──────┐
    │  Supabase  │
    │   Cloud    │
    └────────────┘
```

### 3.3 Architektura modułów
```
M7/
├── pages/
│   ├── /dokumenty/              # Dashboard dokumentów
│   ├── /umowa-aktualna/         # Przeglądarka umowy
│   ├── /historia-umow/          # Archiwum umów
│   ├── /finanse/                # Dashboard finansowy
│   ├── /status-platnosci/       # Timeline płatności
│   ├── /faktury/                # Zarządzanie fakturami
│   └── /raport-roczny/          # Generowanie raportu
├── components/
│   ├── DocumentPreview.tsx      # Podgląd dokumentu
│   ├── ContractUpload.tsx       # Upload umowy
│   ├── PaymentTimeline.tsx      # Timeline płatności
│   ├── InvoiceTable.tsx         # Tabela faktur
│   ├── FinancialSummary.tsx     # Podsumowanie finansowe
│   └── ReportGenerator.tsx      # Generator raportów
├── api/
│   ├── /documents/[id]          # CRUD dokumentów
│   ├── /contracts/history       # Historia umów
│   ├── /payments/status         # Status płatności
│   ├── /invoices/[id]           # CRUD faktur
│   ├── /reports/generate        # Generowanie raportów
│   └── /files/upload            # Upload plików
├── lib/
│   ├── supabase.ts              # Klient Supabase
│   ├── pdf-generator.ts         # Generowanie PDF
│   ├── encryption.ts            # Szyfrowanie danych
│   ├── validators.ts            # Validacja danych
│   └── hooks/
│       ├── useDocuments.ts
│       ├── usePayments.ts
│       ├── useInvoices.ts
│       └── useReports.ts
└── types/
    ├── documents.ts
    ├── financial.ts
    ├── payments.ts
    └── invoices.ts
```

---

## 4. Moduły funkcjonalne

### 4.1 M7.1: Umowa bieżąca (Current Contract)

**Opis:** Pobieranie aktualnej umowy w formacie PDF.

**Funkcjonalności:**
- Wyświetlanie danych umowy (numer, data zawarcia, stawka)
- Pobieranie PDF umowy
- Weryfikacja podpisu cyfrowego
- Informacje o stronie: B2B.net S.A.
- Data ważności umowy

**Przepływ:**
```
1. Użytkownik otwiera /umowa-aktualna
2. System pobiera najnowszą umowę z bazy
3. Wyświetla podgląd (HTML)
4. Udostępnia przycisk "Pobierz PDF"
5. System generuje PDF z danymi szyfrowanymi
6. Pobieranie następuje z Supabase Storage
```

**Dane:**
- `contract_id`: UUID
- `version_number`: Integer (1.0, 2.0, etc)
- `file_url`: URL do pliku w Storage
- `status`: 'active' | 'expired' | 'pending'
- `signed_date`: Timestamp
- `effective_date`: Timestamp
- `expiry_date`: Timestamp
- `rate_per_hour`: Decimal
- `currency`: 'PLN' | 'EUR' | 'USD'

**Bezpieczeństwo:**
- RLS: tylko właściciel umowy i admini mogą pobrać
- Logs: każde pobranie rejestrowane
- Timeout: link pobierania wygasa po 24h

---

### 4.2 M7.2: Historia umów (Contract History)

**Opis:** Archiwum poprzednich wersji umów z chronologią zmian.

**Funkcjonalności:**
- Lista wszystkich wersji umów
- Filtrowanie po dacie, statusie, wersji
- Porównanie dwóch wersji (diff)
- Pobranie dowolnej wersji
- Notatki do zmian (audit trail)

**Tabela:** `contract_versions`
```sql
CREATE TABLE contract_versions (
  id UUID PRIMARY KEY,
  consultant_id UUID REFERENCES consultants(id),
  contract_id UUID,
  version_number DECIMAL,
  file_url TEXT,
  file_hash TEXT, -- SHA256 dla weryfikacji
  change_log TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  status VARCHAR(20),
  start_date DATE,
  end_date DATE,
  metadata JSONB, -- przechowuje dodatkowe dane
  FOREIGN KEY (contract_id) REFERENCES contracts(id)
);
```

**Interfejs:**
```
┌─────────────────────────────────────────┐
│  Historia umów - Filtr                  │
│  [Lata ▼] [Status ▼] [Wersja ▼]        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Wersja | Data    | Status  | Akcje      │
├─────────────────────────────────────────┤
│ 2.5    | 2025-01 | Aktywna | [▼ Pobierz]│
│ 2.4    | 2024-06 | Zmiana | [+ Porównaj]│
│ 2.3    | 2023-12 | Zmiana | [▼ Pobierz]│
│ 2.2    | 2023-06 | Wygasła| [▼ Pobierz]│
│ 2.1    | 2022-12 | Wygasła| [▼ Pobierz]│
└─────────────────────────────────────────┘
```

---

### 4.3 M7.3: Warunki finansowe (Financial Conditions)

**Opis:** Wyświetlanie stawek, warunków płatności i bonusów.

**Funkcjonalności:**
- Stawka godzinowa (netto/brutto)
- Stawka dla nadgodzin
- Bonusy i premie
- Warunki płatności (np. do 30 dni)
- Waluta rozliczenia
- Korekty za lata poprzednie
- Koszty operacyjne

**Struktura danych:**
```typescript
interface FinancialConditions {
  id: UUID;
  consultant_id: UUID;
  contract_version: DECIMAL;

  // Stawki
  base_hourly_rate: DECIMAL;      // Stawka bazowa
  overtime_multiplier: DECIMAL;   // 1.5x, 2x
  night_shift_multiplier: DECIMAL;
  weekend_multiplier: DECIMAL;

  // Dodatkowe wynagrodzenie
  bonuses: {
    type: 'performance' | 'seniority' | 'annual';
    percentage: DECIMAL;
    description: TEXT;
  }[];

  // Warunki
  payment_terms: {
    days: INTEGER; // np. 30 dni
    start_date: 'invoice_date' | 'delivery_date';
  };

  // Finansowe
  currency: 'PLN' | 'EUR' | 'USD';
  tax_rate: DECIMAL; // VAT/PIT
  operational_costs: DECIMAL; // koszty operacyjne

  // Status
  effective_from: DATE;
  effective_to: DATE | NULL;
  created_at: TIMESTAMP;
  updated_by: UUID;
}
```

**Obliczenia:**
```typescript
// Przykład obliczania kwoty
const calculateGrossAmount = (
  baseCost: number,
  taxRate: number,
  operationalCosts: number
): number => {
  const subtotal = baseCost + operationalCosts;
  return subtotal * (1 + taxRate / 100);
};
```

**Dashboard finansowy:**
```
┌──────────────────────────────────────┐
│     WARUNKI FINANSOWE                │
├──────────────────────────────────────┤
│                                      │
│  Stawka godzinowa:        250 PLN   │
│  Nadgodziny (1.5x):       375 PLN   │
│  Noc (2x):                500 PLN   │
│  Weekendy (2x):           500 PLN   │
│                                      │
│  Bonus wydajności:        5%        │
│  Bonus seniority:         3%        │
│                                      │
│  Warunki płatności:       do 30 dni │
│  Waluta:                  PLN       │
│  Stawka VAT:              23%       │
│  Koszty operacyjne:       50 PLN   │
│                                      │
│  Obowiązuje od:           2024-01-01│
│  Obowiązuje do:           bieżący  │
│                                      │
└──────────────────────────────────────┘
```

---

### 4.4 M7.4: Status płatności (Payment Status)

**Opis:** Real-time informacje o statusie płatności z TimelineView.

**Statusy płatności:**
- `pending` - Oczekująca na przetworzenie
- `processing` - W trakcie przetwarzania (1-3 dni)
- `paid` - Wykonana (verified by bank)
- `failed` - Nieudana (requires action)
- `disputed` - Sporna (do wyjaśnienia)

**Model danych:**
```typescript
interface Payment {
  id: UUID;
  consultant_id: UUID;
  invoice_id: UUID;

  // Kwoty
  amount_gross: DECIMAL;
  amount_net: DECIMAL;
  currency: VARCHAR;

  // Daty
  invoice_date: DATE;
  due_date: DATE;
  payment_date: DATE | NULL;

  // Status
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'disputed';
  status_updated_at: TIMESTAMP;

  // Detale
  payment_method: 'transfer' | 'card' | 'check';
  bank_reference: TEXT | NULL;
  transaction_id: TEXT | NULL;
  notes: TEXT;

  // Audyt
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;
  updated_by: UUID;
}
```

**Timeline Component:**
```tsx
// Timeline payments z colorem statusu
interface TimelinePayment {
  id: UUID;
  date: DATE;
  amount: DECIMAL;
  status: PaymentStatus;
  days_outstanding: INTEGER;
  notes: TEXT;
  actions: 'view' | 'dispute' | 'retry';
}

// Renderowanie
<PaymentTimeline payments={payments}>
  {payment => (
    <TimelineItem
      date={payment.date}
      status={payment.status}
      amount={payment.amount}
      color={getStatusColor(payment.status)}
      overdue={payment.days_outstanding > 0}
    />
  )}
</PaymentTimeline>
```

**Wizualizacja:**
```
┌─────────────────────────────────────────────┐
│  TIMELINE PŁATNOŚCI - 2025                  │
├─────────────────────────────────────────────┤
│                                             │
│ ● 2025-02-05  ✓ PAID           2,500 PLN   │
│   (5 dni temu) Bank: PKNB ref:xyz          │
│                                             │
│ ● 2025-01-28  ⏳ PROCESSING    2,400 PLN   │
│   (9 dni temu) Expected: 2025-02-10        │
│                                             │
│ ● 2025-01-15  ! OVERDUE        2,300 PLN   │
│   (24 dni temu) Due: 2025-02-14            │
│   [DISPUTE] [RETRY]                        │
│                                             │
│ ● 2024-12-28  ✓ PAID           2,100 PLN   │
│   (1.5 mies.)  Bank: PKNB ref:abc          │
│                                             │
└─────────────────────────────────────────────┘
```

**Logika alert:**
```typescript
const getPaymentAlert = (payment: Payment): Alert | null => {
  const today = new Date();
  const daysOverdue = (today - payment.due_date) / (1000 * 60 * 60 * 24);

  if (payment.status === 'paid') return null;
  if (daysOverdue > 30) return { type: 'error', msg: 'Ponad 30 dni zwłoki' };
  if (daysOverdue > 7) return { type: 'warning', msg: 'Zawiadomienie 7 dni' };
  if (payment.status === 'failed') return { type: 'error', msg: 'Płatność nieudana' };
  if (daysOverdue > 0) return { type: 'info', msg: 'Nadpłata/przeterminowanie' };

  return null;
};
```

---

### 4.5 M7.5: Historia faktur (Invoice History)

**Opis:** Zarządzanie fakturami wystawionymi przez konsultanta.

**Funkcjonalności:**
- Upload faktury przez konsultanta (PDF)
- Weryfikacja przez administratora
- Arkusz kalkulacyjny faktur (sum, filtry)
- Wyszukiwanie zaawansowane
- Eksport do Excel
- Powiązanie z płatnikami

**Tabela faktury:**
```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  consultant_id UUID NOT NULL,
  invoice_number VARCHAR(50) UNIQUE,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,

  -- Kwoty
  amount_net DECIMAL(15,2),
  amount_vat DECIMAL(15,2),
  amount_gross DECIMAL(15,2),
  currency VARCHAR(3),

  -- Detale
  description TEXT,
  line_items JSONB, -- tabela pozycji

  -- Dokumenty
  pdf_file_url TEXT,
  pdf_hash VARCHAR(64), -- SHA256

  -- Status
  status VARCHAR(20), -- 'draft' | 'submitted' | 'verified' | 'paid' | 'disputed'
  verified_by UUID, -- ID admina
  verified_at TIMESTAMP,
  payment_received_date DATE,

  -- Audyt
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- soft delete

  FOREIGN KEY (consultant_id) REFERENCES consultants(id),
  INDEX idx_invoice_date (invoice_date),
  INDEX idx_status (status),
  INDEX idx_consultant (consultant_id)
);
```

**Przepływ weryfikacji faktury:**
```
1. Konsultant wchodzi na /faktury/upload
2. Wybiera plik PDF
3. System waliduje PDF (format, czytaność)
4. Ekstraktuje metadane (numer, datę, kwotę)
5. Zapisuje do DB ze statusem 'submitted'
6. Admin otrzymuje notyfikację
7. Admin otwiera /faktury/verify
8. Przegląda fakturę i dane ekstrakcji
9. Weryfikuje poprawność
10. Zatwierza (verified) lub odrzuca (rejected)
11. Konsultant otrzymuje notyfikację
```

**Interfejs Upload:**
```
┌──────────────────────────────────────┐
│  UPLOAD FAKTURY                      │
├──────────────────────────────────────┤
│                                      │
│  [📁 Wybierz plik PDF]              │
│  lub przeciągnij i upuść             │
│                                      │
│  ✓ Numer faktury:  [2025/001    ]   │
│  ✓ Data faktury:   [2025-02-05  ]   │
│  ✓ Kwota netto:    [2500.00     ]   │
│  ✓ VAT (23%):      [575.00      ]   │
│  ✓ Razem brutto:   [3075.00     ]   │
│                                      │
│  [🔍 Podgląd PDF] [✓ SUBMIT]        │
│                                      │
└──────────────────────────────────────┘
```

**Tabela historii:**
```
┌────────────────────────────────────────────────────┐
│ Nr faktury│ Data     │ Kwota   │ Status  │ Akcje  │
├────────────────────────────────────────────────────┤
│ 2025/001 │2025-02-05│3075 PLN │ ✓ Verify│▼ ✓    │
│ 2025/002 │2025-02-01│2850 PLN │ ⏳ Oczek │▼      │
│ 2025/003 │2025-01-28│3200 PLN │ ✓ Verify│▼ ✓    │
│ 2024/156 │2024-12-30│2900 PLN │ ✓ Paid  │▼      │
│ 2024/155 │2024-12-15│2750 PLN │ ✓ Paid  │▼      │
└────────────────────────────────────────────────────┘
```

---

### 4.6 M7.6: Generowanie raportu rocznego (Annual Report)

**Opis:** Automatyczne generowanie raportu finansowego do celów księgowych.

**Zawartość raportu:**
- Podsumowanie roczne zarobków
- Lista wszystkich faktur
- Średnia stawka godzinowa
- Razem godzin przepracowanych
- Raport płatności (zaległości)
- Warunki umowy obowiązujące w roku
- Zestawienie podatków

**Generowanie:**
```typescript
// API route: /api/reports/generate-annual
interface AnnualReportRequest {
  consultant_id: UUID;
  year: INTEGER; // 2024, 2025, itp.
  format: 'pdf' | 'excel' | 'json';
  include_sections: {
    summary: boolean;
    invoices: boolean;
    payments: boolean;
    tax_data: boolean;
  };
}

// Proces generowania
async function generateAnnualReport(req: AnnualReportRequest) {
  // 1. Pobierz dane z bazy
  const consultant = await getConsultant(req.consultant_id);
  const invoices = await getYearInvoices(req.consultant_id, req.year);
  const payments = await getYearPayments(req.consultant_id, req.year);

  // 2. Oblicz statystyki
  const stats = {
    total_gross: invoices.reduce((sum, inv) => sum + inv.amount_gross, 0),
    total_net: invoices.reduce((sum, inv) => sum + inv.amount_net, 0),
    total_vat: invoices.reduce((sum, inv) => sum + inv.amount_vat, 0),
    paid_amount: payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount_gross, 0),
    pending_amount: payments.filter(p => p.status !== 'paid').reduce((sum, p) => sum + p.amount_gross, 0),
    average_hourly_rate: calculateAverageRate(invoices),
    total_hours: calculateTotalHours(invoices),
  };

  // 3. Generuj raport (PDF/Excel/JSON)
  if (req.format === 'pdf') {
    return generatePDFReport(consultant, invoices, payments, stats, req.include_sections);
  } else if (req.format === 'excel') {
    return generateExcelReport(consultant, invoices, payments, stats);
  }

  return { data: stats, invoices, payments };
}
```

**Struktura raportu PDF:**
```
┌─────────────────────────────────────────┐
│                                         │
│     RAPORT FINANSOWY ROCZNY 2024        │
│                                         │
│     B2B.net S.A.                        │
│     Konsultant: Jan Kowalski            │
│     ID: 12345                           │
│     Data raportu: 2025-02-05            │
│                                         │
├─────────────────────────────────────────┤
│ PODSUMOWANIE ROCZNE                     │
├─────────────────────────────────────────┤
│                                         │
│  Razem netto:              30,000 PLN  │
│  VAT (23%):                 6,900 PLN  │
│  Razem brutto:             36,900 PLN  │
│                                         │
│  Wpłacone:                 36,000 PLN  │
│  Do wpłaty:                   900 PLN  │
│                                         │
│  Średnia stawka:            280 PLN   │
│  Łącznie godzin:            120 h     │
│                                         │
├─────────────────────────────────────────┤
│ SZCZEGÓŁOWE FAKTURY                    │
├─────────────────────────────────────────┤
│ [Tabela 12 faktur...]                  │
│                                         │
├─────────────────────────────────────────┤
│ WARUNKI OBOWIĄZUJĄCE W 2024             │
├─────────────────────────────────────────┤
│ Stawka bazowa:             250 PLN    │
│ Bonus wydajności:           5%        │
│ Warunki płatności:    do 30 dni       │
│ Waluta:                   PLN        │
│                                         │
└─────────────────────────────────────────┘
```

**Biblioteka PDF:** jsPDF + html2canvas
```typescript
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const generateReportPDF = async (htmlElement: HTMLElement, filename: string) => {
  const canvas = await html2canvas(htmlElement);
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const imgWidth = 210; // A4 width mm
  const pageHeight = 295; // A4 height mm
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft >= 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
};
```

---

### 4.7 M7.7: Dane fakturowania (Invoicing Data)

**Opis:** Dane B2B.net S.A. do celów fakturowania i identyfikacji firmy.

**Dane przechowywane:**
```typescript
interface CompanyInvoicingData {
  company_name: string; // "B2B.net S.A."
  nip: string; // Numer NIP
  regon: string; // Numer REGON
  krs: string; // Numer KRS

  address: {
    street: string;
    building_number: string;
    apartment_number?: string;
    postal_code: string;
    city: string;
    country: string;
  };

  contact: {
    email: string;
    phone: string;
    website: string;
  };

  bank_account: {
    account_number: string;
    bank_name: string;
    swift_code: string;
    iban: string;
  };

  tax_settings: {
    vat_rate: DECIMAL; // np. 23
    payment_terms_days: INTEGER; // np. 30
    invoice_prefix: string; // np. "2025/"
  };

  legal_info: {
    company_form: string; // "Spółka Akcyjna"
    registration_date: DATE;
    ceo_name: string;
    fiscal_representative?: string;
  };
}
```

**Wyświetlanie danych na fakturze:**
```
Wystawca:
B2B.net S.A.
ul. Testowa 10
00-001 Warszawa
Polska

NIP: PL12345678901
REGON: 123456789
KRS: 0000123456

Konto bankowe:
PL12 1234 5678 9012 3456 7890 1234
PKNB PL PW
SWIFT: PKOPPLPW

Kontakt:
Email: invoices@b2b.net
Telefon: +48 22 XXX XXXX
```

**Edycja przez admina:**
```tsx
// /admin/faktury/konfiguracja

<Form>
  <FieldGroup label="Dane firmy">
    <TextField label="Nazwa" defaultValue={data.company_name} />
    <TextField label="NIP" defaultValue={data.nip} />
    <TextField label="REGON" defaultValue={data.regon} />
  </FieldGroup>

  <FieldGroup label="Adres">
    <TextField label="Ulica" defaultValue={data.address.street} />
    <TextField label="Nr budynku" defaultValue={data.address.building_number} />
    <TextField label="Kod pocztowy" defaultValue={data.address.postal_code} />
  </FieldGroup>

  <FieldGroup label="Konto bankowe">
    <TextField label="Numer konta" defaultValue={data.bank_account.account_number} />
    <TextField label="IBAN" defaultValue={data.bank_account.iban} />
    <TextField label="SWIFT" defaultValue={data.bank_account.swift_code} />
  </FieldGroup>

  <Button>Zapisz zmiany</Button>
</Form>
```

---

## 5. Model danych

### 5.1 Tabele główne

```sql
-- Umowy (Contracts)
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL,
  contract_number VARCHAR(50) UNIQUE,
  current_version DECIMAL,
  status VARCHAR(20) DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (consultant_id) REFERENCES consultants(id),
  INDEX idx_consultant_id (consultant_id),
  INDEX idx_status (status)
);

-- Wersje umów
CREATE TABLE contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL,
  consultant_id UUID NOT NULL,
  version_number DECIMAL,
  file_url TEXT NOT NULL,
  file_hash VARCHAR(64),
  change_log TEXT,
  metadata JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
  FOREIGN KEY (consultant_id) REFERENCES consultants(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(contract_id, version_number),
  INDEX idx_contract_id (contract_id)
);

-- Warunki finansowe
CREATE TABLE financial_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL,
  contract_version DECIMAL,
  base_hourly_rate DECIMAL(10,2),
  overtime_multiplier DECIMAL(5,2),
  night_shift_multiplier DECIMAL(5,2),
  weekend_multiplier DECIMAL(5,2),
  bonuses JSONB,
  payment_terms_days INTEGER,
  currency VARCHAR(3) DEFAULT 'PLN',
  tax_rate DECIMAL(5,2),
  operational_costs DECIMAL(10,2),
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID NOT NULL,
  FOREIGN KEY (consultant_id) REFERENCES consultants(id),
  FOREIGN KEY (updated_by) REFERENCES users(id),
  INDEX idx_consultant_id (consultant_id),
  INDEX idx_effective_date (effective_from)
);

-- Faktury
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount_net DECIMAL(15,2),
  amount_vat DECIMAL(15,2),
  amount_gross DECIMAL(15,2),
  currency VARCHAR(3) DEFAULT 'PLN',
  description TEXT,
  line_items JSONB,
  pdf_file_url TEXT,
  pdf_hash VARCHAR(64),
  status VARCHAR(20) DEFAULT 'draft',
  verified_by UUID,
  verified_at TIMESTAMP,
  payment_received_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  FOREIGN KEY (consultant_id) REFERENCES consultants(id),
  FOREIGN KEY (verified_by) REFERENCES users(id),
  INDEX idx_consultant_id (consultant_id),
  INDEX idx_status (status),
  INDEX idx_invoice_date (invoice_date),
  INDEX idx_deleted_at (deleted_at)
);

-- Płatności
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  amount_gross DECIMAL(15,2),
  amount_net DECIMAL(15,2),
  currency VARCHAR(3) DEFAULT 'PLN',
  invoice_date DATE,
  due_date DATE,
  payment_date DATE,
  status VARCHAR(20) DEFAULT 'pending',
  status_updated_at TIMESTAMP,
  payment_method VARCHAR(20),
  bank_reference TEXT,
  transaction_id TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID,
  FOREIGN KEY (consultant_id) REFERENCES consultants(id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (updated_by) REFERENCES users(id),
  INDEX idx_consultant_id (consultant_id),
  INDEX idx_status (status),
  INDEX idx_invoice_id (invoice_id),
  INDEX idx_due_date (due_date)
);

-- Dokumenty (ogólne)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID,
  document_type VARCHAR(50),
  title VARCHAR(255),
  description TEXT,
  file_url TEXT NOT NULL,
  file_hash VARCHAR(64),
  file_size INTEGER,
  mime_type VARCHAR(50),
  metadata JSONB,
  access_level VARCHAR(20),
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  FOREIGN KEY (consultant_id) REFERENCES consultants(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_consultant_id (consultant_id),
  INDEX idx_document_type (document_type),
  INDEX idx_created_at (created_at)
);

-- Logi dostępu
CREATE TABLE document_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action VARCHAR(50),
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_document_id (document_id),
  INDEX idx_timestamp (timestamp)
);

-- Dane firmowe (B2B.net S.A.)
CREATE TABLE company_invoicing_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL DEFAULT 'B2B.net S.A.',
  nip VARCHAR(12),
  regon VARCHAR(10),
  krs VARCHAR(10),
  address_street VARCHAR(255),
  address_building_number VARCHAR(10),
  address_apartment_number VARCHAR(10),
  address_postal_code VARCHAR(10),
  address_city VARCHAR(100),
  address_country VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  website VARCHAR(255),
  bank_account_number VARCHAR(34),
  bank_name VARCHAR(255),
  swift_code VARCHAR(11),
  iban VARCHAR(34),
  vat_rate DECIMAL(5,2) DEFAULT 23,
  payment_terms_days INTEGER DEFAULT 30,
  invoice_prefix VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);
```

### 5.2 Row Level Security (RLS)

```sql
-- Zabezpieczenia dla tabeli contracts
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_select_policy ON contracts
  FOR SELECT
  USING (
    consultant_id = auth.uid() OR
    auth.jwt() ->> 'role' = 'admin' OR
    auth.jwt() ->> 'role' = 'accountant'
  );

CREATE POLICY contracts_insert_policy ON contracts
  FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY contracts_update_policy ON contracts
  FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Zabezpieczenia dla faktur
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_select_policy ON invoices
  FOR SELECT
  USING (
    consultant_id = auth.uid() OR
    auth.jwt() ->> 'role' = 'admin' OR
    auth.jwt() ->> 'role' = 'accountant'
  );

CREATE POLICY invoices_insert_policy ON invoices
  FOR INSERT
  WITH CHECK (consultant_id = auth.uid() OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY invoices_update_policy ON invoices
  FOR UPDATE
  USING (
    consultant_id = auth.uid() OR
    auth.jwt() ->> 'role' = 'admin'
  );

-- Zabezpieczenia dla płatności
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_select_policy ON payments
  FOR SELECT
  USING (
    consultant_id = auth.uid() OR
    auth.jwt() ->> 'role' IN ('admin', 'accountant')
  );

CREATE POLICY payments_update_policy ON payments
  FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

---

## 6. Zarządzanie plikami

### 6.1 Supabase Storage

**Struktura bucket:**
```
documents-storage/
├── contracts/
│   ├── {consultant_id}/
│   │   ├── current/
│   │   │   └── contract_v2.5.pdf
│   │   └── archive/
│   │       ├── contract_v2.4.pdf
│   │       ├── contract_v2.3.pdf
│   │       └── ...
│   └── ...
├── invoices/
│   ├── {consultant_id}/
│   │   ├── 2025/
│   │   │   ├── invoice_2025_001.pdf
│   │   │   ├── invoice_2025_002.pdf
│   │   │   └── ...
│   │   ├── 2024/
│   │   │   └── ...
│   │   └── ...
│   └── ...
├── reports/
│   ├── {consultant_id}/
│   │   ├── annual_2024.pdf
│   │   ├── annual_2023.pdf
│   │   └── ...
│   └── ...
└── temp/
    ├── {session_id}/
    │   └── temp_files/
    └── ...
```

### 6.2 Upload i bezpieczeństwo

```typescript
// lib/storage.ts

import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from './encryption';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface UploadOptions {
  bucket: 'documents-storage';
  path: string;
  file: File;
  encrypt?: boolean;
  metadata?: Record<string, any>;
}

export async function uploadDocument(options: UploadOptions): Promise<string> {
  const { bucket, path, file, encrypt: shouldEncrypt, metadata } = options;

  // Walidacja
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('Plik jest za duży (max 50 MB)');
  }

  const allowedTypes = ['application/pdf', 'application/msword'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Niedozwolony typ pliku');
  }

  // Szyfrowanie
  let fileData: Buffer;
  if (shouldEncrypt) {
    const arrayBuffer = await file.arrayBuffer();
    fileData = encrypt(Buffer.from(arrayBuffer));
  } else {
    fileData = Buffer.from(await file.arrayBuffer());
  }

  // Upload
  const fileName = `${Date.now()}_${file.name}`;
  const uploadPath = `${path}/${fileName}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(uploadPath, fileData, {
      contentType: file.type,
      metadata: {
        ...metadata,
        original_name: file.name,
        uploaded_at: new Date().toISOString(),
      },
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return uploadPath;
}

export async function downloadDocument(
  bucket: string,
  path: string,
  decrypt_needed: boolean = false
): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path);

  if (error) {
    throw new Error(`Download failed: ${error.message}`);
  }

  let buffer = Buffer.from(await data.arrayBuffer());

  if (decrypt_needed) {
    buffer = decrypt(buffer);
  }

  return buffer;
}

export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600 // 1 hour
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(`Signed URL failed: ${error.message}`);
  }

  return data.signedUrl;
}

export async function deleteDocument(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}
```

### 6.3 Weryfikacja integralności

```typescript
// lib/file-verification.ts

import crypto from 'crypto';

export function calculateFileHash(buffer: Buffer): string {
  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}

export interface FileVerification {
  original_hash: string;
  current_hash: string;
  is_valid: boolean;
  checked_at: Date;
}

export function verifyFileIntegrity(
  buffer: Buffer,
  expectedHash: string
): FileVerification {
  const currentHash = calculateFileHash(buffer);
  const isValid = currentHash === expectedHash;

  return {
    original_hash: expectedHash,
    current_hash: currentHash,
    is_valid: isValid,
    checked_at: new Date(),
  };
}

// Weryfikacja PDF przed archiwizacją
export async function verifyPDFIntegrity(pdfPath: string): Promise<boolean> {
  try {
    // Użycie biblioteki pdfparse do walidacji
    const pdf = require('pdf-parse');
    const fileBuffer = await downloadDocument('documents-storage', pdfPath);
    const data = await pdf(fileBuffer);

    return data.version !== undefined && data.pages > 0;
  } catch (error) {
    console.error('PDF verification failed:', error);
    return false;
  }
}
```

---

## 7. Generowanie raportów

### 7.1 Raport roczny (Annual Report)

```typescript
// lib/report-generator.ts

import jsPDF from 'jspdf';
import ExcelJS from 'exceljs';

export interface AnnualReportData {
  consultant: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  year: number;
  invoices: Invoice[];
  payments: Payment[];
  financialConditions: FinancialConditions;
}

export class ReportGenerator {
  static async generatePDF(data: AnnualReportData): Promise<Buffer> {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    let yPosition = margin;

    // Header
    pdf.setFontSize(20);
    pdf.text('RAPORT FINANSOWY ROCZNY', margin, yPosition);
    yPosition += 10;

    pdf.setFontSize(12);
    pdf.text(`${data.year}`, margin, yPosition);
    yPosition += 15;

    // Informacje o konsultancie
    pdf.setFontSize(11);
    pdf.text(`Konsultant: ${data.consultant.first_name} ${data.consultant.last_name}`, margin, yPosition);
    yPosition += 7;
    pdf.text(`Email: ${data.consultant.email}`, margin, yPosition);
    yPosition += 7;
    pdf.text(`Data raportu: ${new Date().toLocaleDateString('pl-PL')}`, margin, yPosition);
    yPosition += 15;

    // Podsumowanie
    const stats = this.calculateStatistics(data);
    pdf.setFontSize(13);
    pdf.text('PODSUMOWANIE ROCZNE', margin, yPosition);
    yPosition += 10;

    pdf.setFontSize(10);
    const summaryItems = [
      [`Razem netto:`, `${stats.total_net.toFixed(2)} PLN`],
      [`VAT (23%):`, `${stats.total_vat.toFixed(2)} PLN`],
      [`Razem brutto:`, `${stats.total_gross.toFixed(2)} PLN`],
      [`Wpłacone:`, `${stats.paid_amount.toFixed(2)} PLN`],
      [`Do wpłaty:`, `${stats.pending_amount.toFixed(2)} PLN`],
      [`Średnia stawka:`, `${stats.average_hourly_rate.toFixed(2)} PLN/h`],
      [`Łącznie godzin:`, `${stats.total_hours.toFixed(1)} h`],
    ];

    summaryItems.forEach(([label, value]) => {
      if (yPosition > pageHeight - 20) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.text(label, margin, yPosition);
      pdf.text(value, pageWidth - margin - 40, yPosition, { align: 'right' });
      yPosition += 7;
    });

    yPosition += 10;

    // Szczegóły faktur
    pdf.setFontSize(13);
    pdf.text('FAKTURY', margin, yPosition);
    yPosition += 10;

    data.invoices.forEach((invoice, index) => {
      if (yPosition > pageHeight - 20) {
        pdf.addPage();
        yPosition = margin;
      }

      pdf.setFontSize(10);
      pdf.text(
        `${index + 1}. ${invoice.invoice_number} | ${invoice.invoice_date} | ${invoice.amount_gross.toFixed(2)} PLN`,
        margin,
        yPosition
      );
      yPosition += 6;
    });

    return pdf.output('arraybuffer') as unknown as Buffer;
  }

  static async generateExcel(data: AnnualReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Arkusz 1: Podsumowanie
    const summarySheet = workbook.addWorksheet('Podsumowanie');
    summarySheet.columns = [
      { header: 'Kategoria', key: 'category', width: 30 },
      { header: 'Wartość', key: 'value', width: 20 },
    ];

    const stats = this.calculateStatistics(data);
    summarySheet.addRows([
      { category: 'Konsultant', value: `${data.consultant.first_name} ${data.consultant.last_name}` },
      { category: 'Rok', value: data.year },
      { category: 'Razem netto', value: stats.total_net },
      { category: 'VAT (23%)', value: stats.total_vat },
      { category: 'Razem brutto', value: stats.total_gross },
      { category: 'Wpłacone', value: stats.paid_amount },
      { category: 'Do wpłaty', value: stats.pending_amount },
      { category: 'Średnia stawka (PLN/h)', value: stats.average_hourly_rate },
      { category: 'Łącznie godzin', value: stats.total_hours },
    ]);

    // Arkusz 2: Faktury
    const invoicesSheet = workbook.addWorksheet('Faktury');
    invoicesSheet.columns = [
      { header: 'Nr faktury', key: 'invoice_number', width: 15 },
      { header: 'Data', key: 'invoice_date', width: 12 },
      { header: 'Netto', key: 'amount_net', width: 15 },
      { header: 'VAT', key: 'amount_vat', width: 15 },
      { header: 'Brutto', key: 'amount_gross', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    invoicesSheet.addRows(data.invoices);

    // Arkusz 3: Płatności
    const paymentsSheet = workbook.addWorksheet('Płatności');
    paymentsSheet.columns = [
      { header: 'Data faktury', key: 'invoice_date', width: 15 },
      { header: 'Termin', key: 'due_date', width: 15 },
      { header: 'Kwota brutto', key: 'amount_gross', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Data płatności', key: 'payment_date', width: 15 },
    ];
    paymentsSheet.addRows(data.payments);

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as Buffer;
  }

  private static calculateStatistics(data: AnnualReportData) {
    const totalNet = data.invoices.reduce((sum, inv) => sum + (inv.amount_net || 0), 0);
    const totalVat = data.invoices.reduce((sum, inv) => sum + (inv.amount_vat || 0), 0);
    const totalGross = data.invoices.reduce((sum, inv) => sum + (inv.amount_gross || 0), 0);
    const paidAmount = data.payments
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount_gross, 0);
    const pendingAmount = totalGross - paidAmount;

    const averageRate = data.financialConditions?.base_hourly_rate || 250;
    const totalHours = data.invoices.reduce((sum, inv) => {
      const lineItems = inv.line_items as any[] || [];
      return sum + lineItems.reduce((itemSum, item) => itemSum + (item.hours || 0), 0);
    }, 0);

    return {
      total_net: totalNet,
      total_vat: totalVat,
      total_gross: totalGross,
      paid_amount: paidAmount,
      pending_amount: pendingAmount,
      average_hourly_rate: averageRate,
      total_hours: totalHours,
    };
  }
}
```

### 7.2 API endpoint generowania raportów

```typescript
// pages/api/reports/generate.ts

import { NextRequest, NextResponse } from 'next/server';
import { ReportGenerator } from '@/lib/report-generator';
import { supabase } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    if (!user || !['admin', 'accountant'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { consultant_id, year, format = 'pdf' } = body;

    // Pobierz dane
    const [
      { data: invoices, error: invoicesError },
      { data: payments, error: paymentsError },
      { data: consultant, error: consultantError },
      { data: conditions, error: conditionsError },
    ] = await Promise.all([
      supabase
        .from('invoices')
        .select('*')
        .eq('consultant_id', consultant_id)
        .gte('invoice_date', `${year}-01-01`)
        .lte('invoice_date', `${year}-12-31`),
      supabase
        .from('payments')
        .select('*')
        .eq('consultant_id', consultant_id)
        .gte('invoice_date', `${year}-01-01`)
        .lte('invoice_date', `${year}-12-31`),
      supabase
        .from('consultants')
        .select('*')
        .eq('id', consultant_id)
        .single(),
      supabase
        .from('financial_conditions')
        .select('*')
        .eq('consultant_id', consultant_id)
        .lte('effective_from', `${year}-12-31`)
        .or(`effective_to.is.null,effective_to.gte.${year}-01-01`)
        .order('effective_from', { ascending: false })
        .limit(1),
    ]);

    if (invoicesError || paymentsError || consultantError) {
      throw new Error('Failed to fetch data');
    }

    const reportData = {
      consultant,
      year,
      invoices: invoices || [],
      payments: payments || [],
      financialConditions: conditions?.[0],
    };

    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'excel') {
      buffer = await ReportGenerator.generateExcel(reportData);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `Raport_roczny_${year}.xlsx`;
    } else {
      buffer = await ReportGenerator.generatePDF(reportData);
      contentType = 'application/pdf';
      filename = `Raport_roczny_${year}.pdf`;
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
```

---

## 8. Bezpieczeństwo i dostęp

### 8.1 Szyfrowanie danych

```typescript
// lib/encryption.ts

import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const ALGORITHM = 'aes-256-cbc';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY must be at least 32 characters');
}

export function encrypt(text: string | Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
    iv
  );

  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(encrypted: string): Buffer {
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
    iv
  );

  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted;
}

export function encryptSensitiveField(field: string): string {
  return encrypt(field);
}

export function decryptSensitiveField(encrypted: string): string {
  return decrypt(encrypted).toString('utf-8');
}
```

### 8.2 Kontrola dostępu

```typescript
// lib/access-control.ts

export type UserRole = 'consultant' | 'admin' | 'accountant' | 'manager';

export interface AccessControl {
  resource: string;
  action: 'view' | 'create' | 'update' | 'delete' | 'download';
  allowedRoles: UserRole[];
  conditions?: (user: User, resource: any) => boolean;
}

const PERMISSIONS: AccessControl[] = [
  {
    resource: 'contract',
    action: 'view',
    allowedRoles: ['consultant', 'admin', 'accountant', 'manager'],
    conditions: (user, contract) => {
      // Konsultant może widzieć tylko swoją umowę
      if (user.role === 'consultant') return user.id === contract.consultant_id;
      // Admin i księgowy mogą widzieć wszystko
      return true;
    },
  },
  {
    resource: 'contract',
    action: 'download',
    allowedRoles: ['consultant', 'admin', 'accountant'],
    conditions: (user, contract) => {
      if (user.role === 'consultant') return user.id === contract.consultant_id;
      return true;
    },
  },
  {
    resource: 'contract',
    action: 'update',
    allowedRoles: ['admin'],
  },
  {
    resource: 'invoice',
    action: 'view',
    allowedRoles: ['consultant', 'admin', 'accountant'],
    conditions: (user, invoice) => {
      if (user.role === 'consultant') return user.id === invoice.consultant_id;
      return true;
    },
  },
  {
    resource: 'invoice',
    action: 'create',
    allowedRoles: ['consultant', 'admin'],
  },
  {
    resource: 'invoice',
    action: 'update',
    allowedRoles: ['admin'],
  },
  {
    resource: 'payment',
    action: 'view',
    allowedRoles: ['consultant', 'admin', 'accountant'],
    conditions: (user, payment) => {
      if (user.role === 'consultant') return user.id === payment.consultant_id;
      return true;
    },
  },
  {
    resource: 'payment',
    action: 'update',
    allowedRoles: ['admin'],
  },
  {
    resource: 'report',
    action: 'view',
    allowedRoles: ['admin', 'accountant'],
  },
  {
    resource: 'report',
    action: 'create',
    allowedRoles: ['admin', 'accountant'],
  },
];

export function hasPermission(
  user: User,
  resource: string,
  action: string,
  resourceData?: any
): boolean {
  const permission = PERMISSIONS.find(
    p => p.resource === resource && p.action === action
  );

  if (!permission) return false;

  if (!permission.allowedRoles.includes(user.role)) {
    return false;
  }

  if (permission.conditions && resourceData) {
    return permission.conditions(user, resourceData);
  }

  return true;
}

// Middleware do weryfikacji dostępu
export function withAccessControl(
  resource: string,
  action: string
) {
  return async (request: NextRequest, user: User) => {
    if (!hasPermission(user, resource, action)) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 403 });
    }
  };
}
```

### 8.3 Audit logging

```typescript
// lib/audit-log.ts

import { supabase } from './supabase';

export interface AuditLog {
  id?: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  changes?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  timestamp?: Date;
  status: 'success' | 'failure';
  error_message?: string;
}

export async function logAction(log: AuditLog): Promise<void> {
  const { error } = await supabase
    .from('audit_logs')
    .insert({
      user_id: log.user_id,
      action: log.action,
      resource_type: log.resource_type,
      resource_id: log.resource_id,
      changes: log.changes,
      ip_address: log.ip_address,
      user_agent: log.user_agent,
      status: log.status,
      error_message: log.error_message,
      timestamp: new Date(),
    });

  if (error) {
    console.error('Failed to log action:', error);
  }
}

export async function getAuditLogs(
  filters: {
    user_id?: string;
    resource_type?: string;
    resource_id?: string;
    start_date?: Date;
    end_date?: Date;
  }
): Promise<AuditLog[]> {
  let query = supabase.from('audit_logs').select('*');

  if (filters.user_id) query = query.eq('user_id', filters.user_id);
  if (filters.resource_type) query = query.eq('resource_type', filters.resource_type);
  if (filters.resource_id) query = query.eq('resource_id', filters.resource_id);
  if (filters.start_date) query = query.gte('timestamp', filters.start_date);
  if (filters.end_date) query = query.lte('timestamp', filters.end_date);

  const { data, error } = await query.order('timestamp', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch audit logs: ${error.message}`);
  }

  return data || [];
}
```

---

## 9. Przepływy biznesowe

### 9.1 Przepływ pobrania umowy

```
START
  │
  ├─> Użytkownik otwiera /umowa-aktualna
  │
  ├─> System weryfikuje dostęp (RLS)
  │
  ├─> Pobiera najnowszą umowę z DB
  │   (gdzie status = 'active')
  │
  ├─> Wyświetla:
  │   - Numer umowy
  │   - Data zawarcia
  │   - Stawka godzinowa
  │   - Warunki płatności
  │   - Data wygaśnięcia
  │
  ├─> Użytkownik klikuje "Pobierz PDF"
  │
  ├─> System generuje podpisany link (24h)
  │
  ├─> Rejestruje download w audit log
  │
  ├─> Zwraca plik PDF
  │
END
```

### 9.2 Przepływ weryfikacji faktury

```
START
  │
  ├─> Konsultant wchodzi na /faktury/upload
  │
  ├─> Wybiera plik PDF (< 50 MB)
  │
  ├─> System waliduje PDF
  │   ├─> Format (.pdf)
  │   ├─> Rozmiar
  │   ├─> Czytaność
  │
  ├─> Ekstraktuje metadane:
  │   ├─> invoice_number
  │   ├─> invoice_date
  │   ├─> amount_gross
  │   ├─> due_date
  │
  ├─> Wyświetla podsumowanie
  │
  ├─> Konsultant potwierdza (SUBMIT)
  │
  ├─> Zapisuje do DB:
  │   status = 'submitted'
  │   verified_by = NULL
  │   verified_at = NULL
  │
  ├─> Admin otrzymuje notyfikację email
  │
  ├─> Admin otwiera /admin/faktury/weryfikacja
  │
  ├─> Przegląda fakturę:
  │   ├─> Podgląd PDF
  │   ├─> Ekstrakcja metadanych
  │   ├─> Walidacja NIP
  │   ├─> Weryfikacja stawek
  │
  ├─> Admin zatwierdza (VERIFY)
  │   lub odrzuca (REJECT)
  │
  ├─> System aktualizuje DB:
  │   ├─> status = 'verified' lub 'rejected'
  │   ├─> verified_by = admin_id
  │   ├─> verified_at = NOW()
  │
  ├─> Konsultant otrzymuje powiadomienie
  │
END
```

### 9.3 Przepływ statusu płatności

```
START
  │
  ├─> Admin tworzy płatność w systemi finansowym
  │   (status = 'pending')
  │
  ├─> System przypisuje payment_id
  │
  ├─> Konsultant widzi na dashboardzie:
  │   "Status: Oczekująca"
  │   "Data spodziewanej płatności: [data]"
  │
  ├─> Po 1-3 dniach
  │   Admin aktualizuje status
  │   (status = 'processing')
  │
  ├─> Po potwierdzeniu z banku
  │   Admin maruje jako 'paid'
  │   payment_date = data faktyczna
  │   bank_reference = numer transakcji
  │
  ├─> System rejestruje zmianę:
  │   - Audit log
  │   - Notification
  │   - Timeline update
  │
  ├─> Konsultant widzi:
  │   ✓ Płatność wykonana
  │   Kwota: 3,075 PLN
  │   Data: 2025-02-05
  │   Ref: PKNB12345
  │
END
```

---

## 10. Interfejs użytkownika

### 10.1 Dashboard dokumentów

```
┌──────────────────────────────────────────────────────┐
│ 📋 DOKUMENTY I FINANSE                               │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Tabs: [Dokumenty] [Finanse] [Faktury] [Raporty]   │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  UMOWA BIEŻĄCA                              │    │
│  │  Status: ✓ Aktywna                          │    │
│  │                                             │    │
│  │  Numer:        2024/B2B/001                 │    │
│  │  Data zawarcia: 2024-01-15                  │    │
│  │  Stawka:        250 PLN/h                   │    │
│  │  Wygaśnie:      2025-12-31                  │    │
│  │                                             │    │
│  │  [📥 Pobierz PDF] [📜 Historia umów]       │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  OSTATNIE FAKTURY                           │    │
│  │                                             │    │
│  │  2025/001 | 2025-02-05 | 3,075 PLN | ✓     │    │
│  │  2025/002 | 2025-02-01 | 2,850 PLN | ⏳    │    │
│  │  2025/003 | 2025-01-28 | 3,200 PLN | ✓     │    │
│  │                                             │    │
│  │  [➕ Nowa faktura] [📊 Wszystkie]           │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 10.2 Timeline płatności

```
┌──────────────────────────────────────────────────────┐
│ TIMELINE PŁATNOŚCI - 2025                            │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ●─── 2025-02-05 ✓ PAID               2,500 PLN    │
│       5 dni temu                                    │
│       Bank: PKNB | Ref: PKO20250205001              │
│                                                      │
│  ●─── 2025-01-28 ⏳ PROCESSING        2,400 PLN    │
│       9 dni temu                                    │
│       Spodziewana: 2025-02-10                       │
│       [🔄 TRACKING]                                 │
│                                                      │
│  ●─── 2025-01-15 ⚠️ OVERDUE          2,300 PLN    │
│       24 dni temu                                   │
│       Termin był: 2025-02-14                        │
│       [⚠️ 10 DNI OPÓŹNIENIA]                       │
│       [💬 DISPUTE] [🔁 RETRY]                      │
│                                                      │
│  ●─── 2024-12-28 ✓ PAID               2,100 PLN    │
│       1.5 miesiąca temu                             │
│       Bank: PKNB | Ref: PKO20250101002              │
│                                                      │
└──────────────────────────────────────────────────────┘

Legenda:
  ✓ = Opłacone
  ⏳ = W trakcie
  ⚠️ = Spowolnione/Przeterminowane
  🔄 = Można śledzić
```

### 10.3 Formularz upload faktury

```
┌──────────────────────────────────────────────────────┐
│ 📄 UPLOAD NOWEJ FAKTURY                              │
├──────────────────────────────────────────────────────┤
│                                                      │
│  1. WYBIERZ PLIK                                    │
│  ┌──────────────────────────────────────────────┐   │
│  │  [📁 Wybierz PDF]                            │   │
│  │  lub przeciągnij i upuść tutaj               │   │
│  │                                              │   │
│  │  Maksymalny rozmiar: 50 MB                   │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  2. PODGLĄD I METADANE                              │
│  ┌──────────────────────────────────────────────┐   │
│  │ Plik: invoice_2025_001.pdf (245 KB) ✓        │   │
│  │                                              │   │
│  │ Numer faktury:  [2025/001          ]  ✓     │   │
│  │ Data faktury:   [2025-02-05        ]  ✓     │   │
│  │ Termin płatności:[2025-03-07       ]  ✓     │   │
│  │ Kwota netto:    [2500.00           ]  ✓     │   │
│  │ VAT (23%):      [575.00            ]  ✓     │   │
│  │ Razem brutto:   [3075.00           ]  ✓     │   │
│  │                                              │   │
│  │ [🔍 Podgląd PDF]                            │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  3. POTWIERDZENIE                                   │
│  ┌──────────────────────────────────────────────┐   │
│  │ ☑ Potwierdzam poprawność danych              │   │
│  │                                              │   │
│  │ [ANULUJ] [✓ WYŚLIJ DO WERYFIKACJI]         │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 11. API i Integracje

### 11.1 Endpoints API

```
DOKUMENTY
  GET    /api/documents/contracts/current
  GET    /api/documents/contracts/history
  GET    /api/documents/contracts/{id}
  POST   /api/documents/contracts/upload
  GET    /api/documents/contracts/{id}/download

FAKTURY
  GET    /api/invoices
  GET    /api/invoices/{id}
  POST   /api/invoices/upload
  GET    /api/invoices/{id}/verify
  PUT    /api/invoices/{id}/status
  DELETE /api/invoices/{id}

PŁATNOŚCI
  GET    /api/payments
  GET    /api/payments/{id}
  GET    /api/payments/timeline
  GET    /api/payments/summary
  PUT    /api/payments/{id}/status

FINANSE
  GET    /api/financial/conditions
  GET    /api/financial/summary/{year}
  GET    /api/financial/analytics

RAPORTY
  POST   /api/reports/generate
  POST   /api/reports/generate/excel
  GET    /api/reports/{year}

PLIKI
  POST   /api/files/upload
  GET    /api/files/{id}/download
  DELETE /api/files/{id}
  GET    /api/files/verify/{id}
```

### 11.2 Webhook integracji

```typescript
// Integracja z systemem finansowym

interface PaymentWebhookPayload {
  event: 'payment.created' | 'payment.processing' | 'payment.completed' | 'payment.failed';
  payment: {
    id: string;
    consultant_id: string;
    invoice_id: string;
    amount: number;
    status: string;
    transaction_id: string;
    timestamp: string;
  };
  signature: string; // HMAC-SHA256
}

// Handler
async function handlePaymentWebhook(payload: PaymentWebhookPayload) {
  // Weryfikacja podpisu
  const signature = verifyWebhookSignature(payload);
  if (!signature) {
    throw new Error('Invalid signature');
  }

  // Aktualizacja statusu
  await updatePaymentStatus(
    payload.payment.id,
    payload.payment.status,
    payload.payment.transaction_id
  );

  // Notyfikacja
  await notifyConsultant(payload.payment.consultant_id, payload.event);
}
```

---

## 12. Monitoring i obsługa błędów

### 12.1 Logi i monitoring

```typescript
// lib/logger.ts

import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

export function logDocumentAccess(userId: string, documentId: string, action: string) {
  logger.info('Document access', {
    timestamp: new Date(),
    user_id: userId,
    document_id: documentId,
    action,
  });
}

export function logError(error: Error, context: Record<string, any>) {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date(),
  });
}
```

### 12.2 Health checks

```typescript
// pages/api/health.ts

export async function GET(request: NextRequest) {
  try {
    // Sprawdź połączenie z bazą
    const { error: dbError } = await supabase
      .from('contracts')
      .select('id')
      .limit(1);

    if (dbError) throw dbError;

    // Sprawdź Storage
    const { error: storageError } = await supabase.storage
      .from('documents-storage')
      .list('');

    if (storageError) throw storageError;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date(),
      services: {
        database: 'ok',
        storage: 'ok',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
```

---

## 13. Prompt AI Builder

### 13.1 Comprehensive AI Builder Prompt (300+ linii)

```
Jesteś Senior Full-Stack Developer specjalizujący się w budowaniu aplikacji
biznesowych dla firm IT outsourcingowych. Twoje zadanie to zaimplementować
Moduł M7: Dokumenty i Finanse dla aplikacji Qualrix by B2B.net S.A.

KONTEKST PROJEKTU:
================
Aplikacja: Qualrix - System zarządzania kontraktami dla 500+ konsultantów IT
Budowana w: Antygrivity/Bolt framework
Stack techniczny:
  - Frontend: Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
  - Backend: Next.js API Routes, Supabase (PostgreSQL, Storage, Auth)
  - I18n: next-intl (obsługa PL/EN)
  - State: Zustand, TanStack Query v5
  - PDF: jsPDF, html2canvas

WYMAGANIA FUNKCJONALNE:
======================

1. UMOWA BIEŻĄCA (M7.1)
   - Wyświetlanie aktualnej wersji umowy w HTML
   - Pobieranie PDF z Supabase Storage
   - Informacje: numer, data, stawka, warunki
   - Weryfikacja integralności pliku (SHA256 hash)
   - Logi dostępu (audit trail)

2. HISTORIA UMÓW (M7.2)
   - Archiwum wszystkich wersji (2.1, 2.2, ..., 2.5)
   - Filtrowanie: rok, status, wersja
   - Porównanie dwóch wersji (diff)
   - Download dowolnej wersji
   - Changelog z datami zmian

3. WARUNKI FINANSOWE (M7.3)
   - Stawka bazowa (250 PLN/h)
   - Mnożniki (nadgodziny 1.5x, noc 2x, weekendy 2x)
   - Bonusy (wydajność 5%, seniority 3%, roczny)
   - Warunki płatności (30 dni od faktury)
   - Waluta (PLN/EUR/USD)
   - Koszty operacyjne

4. STATUS PŁATNOŚCI (M7.4)
   - Timeline view z chronologią
   - Statusy: pending, processing, paid, failed, disputed
   - Alerts dla płatności zalegających (> 7 dni, > 30 dni)
   - Kwota, termin, data faktyczna, referencja banku
   - Możliwość otwarcia sporu (dispute)

5. HISTORIA FAKTUR (M7.5)
   - Upload PDF przez konsultanta
   - Ekstrakcja metadanych (numer, data, kwota)
   - Weryfikacja przez admina
   - Status: draft, submitted, verified, paid, disputed
   - Tabela z sortowaniem i filtrowaniem
   - Eksport do Excel

6. RAPORT ROCZNY (M7.6)
   - Generowanie PDF do celów księgowych
   - Zawartość: podsumowanie, lista faktur, statystyki
   - Format: PDF, Excel, JSON
   - Szybkie generowanie (< 30 sekund)
   - Wysyłanie emailem

7. DANE FAKTUROWANIA (M7.7)
   - Dane B2B.net S.A. (NIP, adres, konto)
   - Edycja przez admina
   - Wyświetlanie na fakturach
   - Przechowywanie szyfrowane

ARCHITEKTURA SYSTEMU:
====================

Baza danych (Supabase PostgreSQL):
  - contracts (umowy)
  - contract_versions (historia)
  - financial_conditions (warunki finansowe)
  - invoices (faktury)
  - payments (płatności)
  - documents (dokumenty ogólne)
  - document_access_logs (logi)
  - company_invoicing_data (dane B2B.net)
  - audit_logs (logi zmian)

Storage (Supabase):
  - documents-storage/contracts/{consultant_id}/current/
  - documents-storage/contracts/{consultant_id}/archive/
  - documents-storage/invoices/{consultant_id}/{year}/
  - documents-storage/reports/{consultant_id}/
  - documents-storage/temp/{session_id}/

Komponenty (components/):
  - DocumentPreview (podgląd dokumentu)
  - ContractUpload (upload umowy)
  - PaymentTimeline (timeline płatności)
  - InvoiceTable (tabela faktur)
  - FinancialSummary (podsumowanie)
  - ReportGenerator (generator raportów)

Strony (pages/):
  - /dokumenty (dashboard)
  - /umowa-aktualna (przegląd umowy)
  - /historia-umow (archiwum)
  - /finanse (finanse)
  - /status-platnosci (timeline)
  - /faktury (zarządzanie)
  - /raport-roczny (generator)

API (api/):
  - /documents/* (CRUD dokumentów)
  - /contracts/* (umowy)
  - /invoices/* (faktury)
  - /payments/* (płatności)
  - /reports/* (raporty)
  - /files/* (pliki)

BEZPIECZEŃSTWO:
==============

1. Autentykacja:
   - Supabase Auth (JWT tokens)
   - Rola użytkownika: consultant | admin | accountant | manager

2. Autoryzacja:
   - Row Level Security (RLS) na todas tabelach
   - Konsultant widzi tylko swoje dane
   - Admin/accountant widzą wszystko
   - Permission checks na każdym endpoincie

3. Szyfrowanie:
   - AES-256-CBC dla danych wrażliwych
   - HTTPS dla przesyłów
   - SHA256 hash dla weryfikacji integralności

4. Audit:
   - Logi wszystkich operacji
   - Kto, co, kiedy, skąd
   - Permanent audit trail

5. Limity:
   - Rate limiting (100 req/min per user)
   - Rozmiar pliku: max 50 MB
   - Timeout pobierania: 24 godziny

PRZEPŁYWY BIZNESOWE:
===================

Pobranie umowy:
  1. Konsultant otwiera /umowa-aktualna
  2. System pobiera najnowszą umowę (status = 'active')
  3. Wyświetla podgląd HTML
  4. Konsultant klika "Pobierz PDF"
  5. System generuje podpisany link z Storage (24h validity)
  6. Rejestruje download w audit log
  7. Plik wysyłany do klienta

Upload faktury:
  1. Konsultant otwiera /faktury/upload
  2. Wybiera PDF
  3. System waliduje (format, rozmiar, czytaność)
  4. Ekstraktuje metadane (pdfparse library)
  5. Wyświetla podsumowanie
  6. Konsultant potwierdza
  7. Zapisuje do DB (status = 'submitted')
  8. Admin otrzymuje notyfikację
  9. Admin weryfikuje i zatwierdza
  10. Konsultant otrzymuje powiadomienie

Status płatności:
  1. Faktura wystawiona (invoice_date)
  2. System ustawia status = 'pending'
  3. Termin płatności (due_date) = invoice_date + 30 dni
  4. Admin zmienia status na 'processing' (gdy wysłana)
  5. Po potwierdzeniu banku: status = 'paid'
  6. Konsultant widzi timeline z kolorami
  7. Alerty dla opóźnień

Generowanie raportu:
  1. Admin otwiera /raporty/roczny
  2. Wybiera rok i format (PDF/Excel)
  3. System pobiera dane:
     - Wszystkie faktury z roku
     - Wszystkie płatności
     - Warunki finansowe obowiązujące
  4. Oblicza statystyki (sum, average, etc)
  5. Generuje dokument
  6. Wysyła do pobierania
  7. Zapisuje kopię w Storage

INTERFEJS UŻYTKOWNIKA:
====================

Designu guidelines:
  - Tailwind CSS (dark mode support)
  - shadcn/ui components (buttons, cards, forms, dialogs)
  - Responsive (mobile first)
  - Accessibility (a11y): WCAG 2.1 AA
  - Ikony: Lucide React

Layout:
  - Header z breadcrumbs i language switcher
  - Sidebar z navigacją
  - Main content area
  - Footer z linkami

Komponenty:
  - Tabele z sortowaniem, filtrowaniem, paginacją
  - Formularze z validacją (react-hook-form, zod)
  - Notyfikacje (toasts, alerts)
  - Modale do potwierdzenia akcji
  - Loading spinners
  - Error boundaries

IMPLEMENTACJA:
==============

Struktura folderów:
```
src/
  app/
    (dashboard)/
      dokumenty/
        page.tsx
        layout.tsx
      umowa-aktualna/
        page.tsx
      historia-umow/
        page.tsx
      finanse/
        page.tsx
      status-platnosci/
        page.tsx
      faktury/
        page.tsx
        upload/
          page.tsx
      raport-roczny/
        page.tsx
    api/
      documents/
        [...route].ts
      invoices/
        [...route].ts
      payments/
        [...route].ts
      reports/
        [...route].ts
      files/
        [...route].ts
  components/
    (m7)/
      DocumentPreview.tsx
      ContractUpload.tsx
      PaymentTimeline.tsx
      InvoiceTable.tsx
      FinancialSummary.tsx
      ReportGenerator.tsx
  lib/
    supabase.ts
    encryption.ts
    pdf-generator.ts
    report-generator.ts
    validators.ts
    hooks/
      useDocuments.ts
      usePayments.ts
      useInvoices.ts
      useReports.ts
  types/
    documents.ts
    financial.ts
    payments.ts
    invoices.ts
```

Kroki implementacji:

1. SETUP BAZY DANYCH (2h)
   - Tworzy alle tabele SQL
   - Konfiguruje RLS policies
   - Dodaje indexes dla performance
   - Seed data (test data)

2. STORAGE I SZYFROWANIE (2h)
   - Konfiguruje Supabase Storage bucket
   - Implementuje encryption/decryption
   - Tworzy upload/download functions
   - Weryfikacja integralności (SHA256)

3. BACKEND API (4h)
   - Implementuje /api/documents/*
   - Implementuje /api/invoices/*
   - Implementuje /api/payments/*
   - Implementuje /api/reports/*
   - Error handling i logging

4. KOMPONENTY (3h)
   - DocumentPreview
   - ContractUpload
   - PaymentTimeline
   - InvoiceTable
   - FinancialSummary
   - ReportGenerator

5. STRONY I ROUTING (3h)
   - /dokumenty (główny dashboard)
   - /umowa-aktualna
   - /historia-umow
   - /finanse
   - /status-platnosci
   - /faktury/upload
   - /raport-roczny

6. INTEGRACJE (2h)
   - Supabase Auth
   - Notyfikacje email
   - Webhook z systemem finansowym
   - Export do Excel

7. TESTY I DEPLOYMENT (2h)
   - Unit tests (komponenty)
   - Integration tests (API)
   - E2E tests (strony)
   - Deployment do Vercel

8. DOKUMENTACJA (1h)
   - API documentation
   - User guide
   - Admin guide

DODATKOWE WYMAGANIA:
===================

1. Wielojęzyczność (next-intl):
   - Wszystkie tekst UI w pl.json, en.json
   - Language switcher w headerze
   - Lokalizacja formatów daty

2. Performance:
   - Lazy loading komponenty
   - Pagination dla list > 50 itemów
   - Caching (TanStack Query)
   - Compression plików
   - CDN dla statycznych assets

3. Dostępność:
   - WCAG 2.1 AA
   - ARIA labels
   - Keyboard navigation
   - Screen reader support

4. Monitoring:
   - Sentry dla błędów
   - LogRocket dla sesji
   - Google Analytics dla metryk
   - Health checks

5. Testowanie:
   - Jest (unit tests)
   - React Testing Library (komponenty)
   - Playwright (E2E)
   - Coverage: > 80%

INSTRUKCJE WYDANIA:
===================

Kod musi być:
- TypeScript strict mode
- Prettier formatted
- Eslint compliant
- Kommentarze dla skomplikowanej logiki
- Exports typed properly
- Database migrations included
- Environment variables documented

Deliverables:
- Kod na GitHub branch: feature/m7-documents-finances
- Pull Request z opisem zmian
- Database migrations (SQL files)
- .env.example z potrzebnymi zmiennymi
- README z instrukcjami deployment
- Screenshots interfejsu (optionalnie)

Jeśli masz jakiekolwiek pytania o:
- Wymagania biznesowe
- Decyzje architektoniczne
- Best practices
- API design
- Bezpieczeństwo
- Performance

Zapytaj w trakcie implementacji!

Cel: 100% zaproponowanej funkcjonalności, high code quality,
production-ready, thoroughly tested, well-documented.

Powodzenia!
```

---

## Podsumowanie

Moduł M7: Dokumenty i Finanse stanowi krytyczną część aplikacji Qualrix, zapewniając:

- **Centralizacje danych:** Jedno miejsce dla wszystkich umów, faktur, płatności
- **Automatyzację:** Generowanie raportów, ekstrakcja metadanych
- **Transparentność:** Real-time status płatności, timeline event
- **Bezpieczeństwo:** Szyfrowanie, RLS, audit trails
- **Zgodność:** RODO, podatkowe, księgowe
- **Skalowalność:** 500+ konsultantów, 10 lat historii

Szacunkowy koszt implementacji: 60-80 godzin developerskich.

---

**Dokument zatwierdzony przez:** B2B.net S.A. DevOps Team
**Data zatwierdzenia:** Luty 2025
**Wersja:** 1.0 - PRODUKCJA
**Następny przegląd:** Wrzesień 2025

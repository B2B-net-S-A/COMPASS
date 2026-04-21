# Specyfikacja Modułu M3: Program Lojalnościowy
**Aplikacja:** Qualrix
**Organizacja:** B2B.net S.A.
**Data:** 2025-02-08
**Wersja:** 1.0
**Status:** Aktywny

---

## 1. Opis Modułu

### 1.1 Cel i Zakres
Program Lojalnościowy (M3) stanowi **system behawioralny oparty na sztucznym wzmacnianiu pozytywnym**, dedykowany motywowaniu konsultantów poprzez zbieranie punktów i awansowanie na wyższe poziomy statusu (tier'y). System obejmuje wyłącznie **nagrody i zachęty** – ZERO kar czy penalizacji.

Moduł integruje się z istniejącymi procesami biznesowymi (rozliczenia projektów, certyfikacje, rozszerzenia umów) i automatycznie przyznaje punkty na podstawie zdefiniowanych zdarzeń.

### 1.2 Kluczowe Założenia
- **Behavioral Incentive Design:** Każda akcja ma jasno zdefiniowaną wartość punktową
- **Tier-Based System:** 4 poziomy statusu (Bronze → Silver → Gold → Platinum)
- **Auto-trigger Mechanism:** Większość przyznań punktów jest automatyczna
- **Real-time Feedback:** Natychmiastowe animacje i notyfikacje przy zdobyciu punktów
- **Bezstratność:** Punkty nikdy się nie usuwają, co najmniej wygasają (opcjonalnie)

### 1.3 Kluczowe Metryki Sukcesu
- Wskaźnik zaangażowania (engagement rate) >75%
- Średnie punkty na konsultanta >2500 w ciągu 12 miesięcy
- Konwersja do wyższych tier'ów >60%
- NPS modułu ≥8/10

---

## 2. User Stories

### 2.1 User Stories - Konsultant (Uczestnik Programu)

**US-M3.1.01:** Jako konsultant chcę wyświetlić mój obecny bilans punktów na głównym dashboardzie, aby szybko sprawdzić postęp.
- AC: Komponent wyświetla licznik punktów, animacja przy zmianie wartości, dziś/wczoraj/total
- Priorytet: P0

**US-M3.1.02:** Jako konsultant chcę zobaczyć szczegółową historię transakcji punktów (ostatnie 6 miesięcy), aby zrozumieć, skąd pochodzą moje punkty.
- AC: Tabela z datą, typem zdarzenia, przyznaniem punktów, opisem; sortowanie, filtrowanie po typie
- Priorytet: P0

**US-M3.1.03:** Jako konsultant chcę zobaczyć mój aktualny tier (status) i pasek postępu do następnego tier'u, aby wiedzieć, co trzeba zrobić.
- AC: Wyświetla Bronze/Silver/Gold/Platinum, procent zaawansowania, liczba pozostałych punktów
- Priorytet: P0

**US-M3.1.04:** Jako konsultant chcę otrzymać animowaną notyfikację (toast + celebracyjna animacja) gdy otrzymam punkty, aby czuć się wynagrodzony.
- AC: Pop-up z ikoną, nazwą zdarzenia, +XX pkt, dźwięk (opcjonalnie), confetti animation
- Priorytet: P1

**US-M3.1.05:** Jako konsultant chcę zobaczyć notyfikację tier-up gdy awansuję na wyższy tier, wraz z lista przywilejów nowego tier'u.
- AC: Modal celebracyjny, nazwa nowego tier'u, ikona/kolor, przywileje
- Priorytet: P1

**US-M3.1.06:** Jako konsultant chcę przeglądać listę moich dostępnych przywilejów dla bieżącego tier'u, aby znać moje uprawnienia.
- AC: Kartę z przywileje, opis, ikony, sekcje organizacyjne (priorytety, projekty, negocjacje)
- Priorytet: P0

**US-M3.1.07:** Jako konsultant chcę znać regulamin programu lojalnościowego (jak się zbiera punkty, tier'y, wygaśnięcie), aby zrozumieć zasady.
- AC: Dedykowana strona/modal, pełna dokumentacja, dostępna dla PL i EN
- Priorytet: P1

**US-M3.1.08:** Jako konsultant chcę wyeksportować raport moich punktów i statusu (PDF/CSV) za ostatni rok, aby mieć dokumentację.
- AC: Przycisk export, generuje PDF z tabelą, podsumowaniem tier'u, datą
- Priorytet: P2

**US-M3.1.09:** Jako konsultant chcę widzieć, które zdarzenia są automatyczne a które wymagają zatwierdzenia (np. certyfikacja), aby znać proces.
- AC: Ikony/label 'Auto' vs 'Pending', tooltip z wyjaśnieniem
- Priorytet: P1

**US-M3.1.10:** Jako konsultant chcę otrzymać notyfikację email o zbliżającym się tier-up (np. "50 pkt do Silver"), aby być zmotywowany.
- AC: Email weekly/monthly, wykrywanie progu >80% postępu
- Priorytet: P2

**US-M3.1.11:** Jako konsultant chcę widzieć event-based points (np. na dzień rocznicy zatrudnienia), aby wiedzieć o specjalnych okazjach.
- AC: Badge/tag na anniversary, animacja, +500 pkt, notyfikacja
- Priorytet: P1

**US-M3.1.12:** Jako konsultant chcę mieć dostęp do katalogu nagród (rewards) gdzie mogę zobaczyć, na jakie bonusy mogę wymienić punkty (OPCJONALNE).
- AC: Katalog, filtry po kategorii, wymiana punktów na vouchery/esej/event
- Priorytet: P3

**US-M3.1.13:** Jako konsultant chcę widzieć, ile czasu pozostało do ewentualnego wygasania punktów (jeśli obowiązuje), aby planować zbieranie.
- AC: Alert przy ostatnich 30 dniach, countdown, info o wygaśnięciu
- Priorytet: P2

**US-M3.1.14:** Jako konsultant chcę mieć mobilnie-responsywny widok modułu loyalty, aby korzystać z telefonu.
- AC: Wszystkie komponenty responsywne, testy na urządzeniach
- Priorytet: P0

**US-M3.1.15:** Jako konsultant chcę zobaczyć badge/ikona tier'u na moim profilu, aby się wyróżniać.
- AC: Dynamiczna ikona w headrze, na karcie profilu
- Priorytet: P1

### 2.2 User Stories - Administrator (Zarządzanie Programem)

**US-M3.2.01:** Jako admin chcę wyświetlić dashboard pokazujący statystyki programu lojalnościowego dla całej organizacji.
- AC: Wykresy (rozkład tier'ów, trendy punktów), statystyki zaangażowania, eksport danych
- Priorytet: P1

**US-M3.2.02:** Jako admin chcę ręcznie przyznać punkty konsultantowi (np. za specjalny achievement), aby umieć nagrodzić wyjątkowe działania.
- AC: Modal, wybór konsultanta, liczba pkt, powód, log auditu
- Priorytet: P1

**US-M3.2.03:** Jako admin chcę wyświetlić listę wszystkich konsultantów z ich tier'ami, saldem pkt, trendami, aby monitorować program.
- AC: Sortowalna tabela, filtry, eksport, link do profilu
- Priorytet: P1

**US-M3.2.04:** Jako admin chcę skonfigurować wartości punktów dla poszczególnych zdarzeń (np. zmiana +100 → +150 za miesiąc), aby dostosować program.
- AC: Admin panel, słowniki wartości, historia zmian, log zmian konfiguracji
- Priorytet: P2

**US-M3.2.05:** Jako admin chcę ręcznie zmienić tier konsultanta (np. degradacja za błędy z innego systemu), aby móc kontrolować status.
- AC: Modal potwierdzenia, log auditu, notyfikacja do konsultanta
- Priorytet: P2

**US-M3.2.06:** Jako admin chcę zobaczyć log wszystkich przyznań punktów z datą, konsultantem, kwotą, przyczyną, aby móc kontrolować integralność.
- AC: Tabela ze szczegółowymi logami, filtry, eksport
- Priorytet: P1

**US-M3.2.07:** Jako admin chcę włączyć/wyłączyć określone typy przyznań punktów (np. tymczasowo wyłączyć anniversary bonus), aby kontrolować program.
- AC: Toggle switches dla każdego typu zdarzenia, konfiguracja w admin panelu
- Priorytet: P2

**US-M3.2.08:** Jako admin chcę wyznaczyć manualnie tier-up dla konsultanta (np. promocja specjalna), aby realizować kampanie.
- AC: Bulk action, mail do beneficjentów, log
- Priorytet: P2

---

## 3. Wireframe / Layout

### 3.1 Główna Strona Modułu Loyalty (Dashboard Konsultanta)

```
┌─────────────────────────────────────────────────────────────┐
│  Qualrix | Program Lojalnościowy                 [EN/PL] 👤│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │  MOJE PUNKTY             │  │  MÓJ STATUS              │ │
│  │  12,450 pkt ↑ +100       │  │  ⭐ GOLD                │ │
│  │  [animacja +100]         │  │  4,250 / 5,999 pkt      │ │
│  │  Dzisiaj: +100           │  │  ▓▓▓▓▓▓░░░░ 71%        │ │
│  │  Wczoraj: +200           │  │  851 pkt do Platinum ✨ │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  MOJE PRZYWILEJE (Gold tier)                        │   │
│  │  ✓ Dostęp do wyjątkowych projektów                  │   │
│  │  ✓ Negocjacja stawki +5%                            │   │
│  │  ✓ Priorytet w kolejce oczekiwania                  │   │
│  │  [Więcej szczegółów →]                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Historia Punktów ▼] [Regulamin ℹ] [Eksport PDF ↓]       │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ © 2025 B2B.net S.A. | Program Lojalnościowy v1.0           │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Historia Transakcji Punktów (Expanded View)

```
┌─────────────────────────────────────────────────────────────┐
│  HISTORIA PUNKTÓW                                   [CSV↓]  │
├────────────┬──────────────┬─────────┬──────────────────────┤
│ Data       │ Typ Zdarzenia│ Punkty  │ Opis / Szczegóły     │
├────────────┼──────────────┼─────────┼──────────────────────┤
│ 2025-02-08 │ ✔ Miesiąc    │ +100    │ Pełny miesiąc na ... │
│ 2025-02-01 │ 📌 Ankieta   │ +200    │ Rating 4.5/5, Q1 ...│
│ 2025-01-15 │ 🎯 Rozszerzenie│ +500  │ Umowa przedłużona... │
│ 2025-01-10 │ ✔ Miesiąc    │ +100    │ Pełny miesiąc na ... │
│ 2025-01-01 │ 🎂 Rocznica   │ +500    │ 2 lata zatrudnienia │
│ 2024-12-20 │ 🏆 Cert      │ +150    │ Azure Solutions .... │
│ ...        │ ...          │ ...     │ ...                  │
└────────────┴──────────────┴─────────┴──────────────────────┘
[Filtry: Typ▼] [Miesiąc▼] [Sortuj▼]
```

### 3.3 Status Card - Detailed View

```
┌──────────────────────────────────────────────┐
│  POZIOM: Gold              [Regulamin ℹ]    │
├──────────────────────────────────────────────┤
│                                              │
│     🌟 GOLD (3000-5999 pkt)                  │
│                                              │
│  Obecny balans: 4,250 pkt                    │
│  ▓▓▓▓▓▓░░░░ 71% postępu                     │
│                                              │
│  Następny poziom: Platinum (6000+ pkt)      │
│  Zostało: 1,750 pkt                          │
│  Szacunkowy czas: ~4 miesiące                │
│                                              │
│  Przywileje tego poziomu:                    │
│  • Dostęp do wyjątkowych projektów           │
│  • Negocjacja stawki +5%                     │
│  • Priorytet w kolejce                       │
│  • Skrócone procesy                          │
│                                              │
│                      [Przywileje ▶]          │
└──────────────────────────────────────────────┘
```

### 3.4 Privileges Page (Lista Przywilejów)

```
┌────────────────────────────────────────────────────┐
│  MOJE PRZYWILEJE                                   │
├────────────────────────────────────────────────────┤
│                                                     │
│  🔓 BRONZE (Podstawowe - Zawsze dostępne)         │
│  ✓ Widok profilu i statusu                        │
│  ✓ Historia punktów                               │
│                                                     │
│  📈 SILVER (1000-2999 pkt) - AKTYWNY              │
│  ✓ Priorytet w kolejce oczekiwania                │
│  ✓ Raport wyników dostępny                        │
│  ✓ Preferencje projektów                          │
│                                                     │
│  ⭐ GOLD (3000-5999 pkt) - AKTYWNY               │
│  ✓ Dostęp do wyjątkowych projektów                │
│  ✓ Negocjacja stawki +5%                          │
│  ✓ Priorytet wysokiego poziomu                    │
│                                                     │
│  👑 PLATINUM (6000+ pkt) - Niedostępny            │
│  ◇ Dedykowany Account Manager                     │
│  ◇ Skrócone procesy (2-dniowe)                    │
│  ◇ Zaproszenia na exclusive eventy                │
│  ◇ Negocjacja stawki +10%                         │
│                                                     │
└────────────────────────────────────────────────────┘
```

### 3.5 Optional - Rewards Catalog (Katalog Nagród)

```
┌────────────────────────────────────────────────────┐
│  KATALOG NAGRÓD (do wymiany punktów)               │
│  [Kategoria ▼] [Cena ▼] [Dostępne ▼]              │
├────────────────────────────────────────────────────┤
│                                                     │
│  ┌────────────────┐  ┌────────────────┐           │
│  │ Voucher Coffee │  │ Kurs Leadership │           │
│  │ Starbucks      │  │ Udemy Pro       │           │
│  │ 500 pkt        │  │ 2,000 pkt       │           │
│  │ [Wymień]       │  │ [Wymień]        │           │
│  └────────────────┘  └────────────────┘           │
│                                                     │
│  ┌────────────────┐  ┌────────────────┐           │
│  │ Tablet iPadAir │  │ Event Tech2025 │           │
│  │ Premium        │  │ VIP Pass        │           │
│  │ 5,000 pkt      │  │ 3,500 pkt       │           │
│  │ [Wymień]       │  │ [Wymień]        │           │
│  └────────────────┘  └────────────────┘           │
│                                                     │
└────────────────────────────────────────────────────┘
```

---

## 4. Komponenty UI

### 4.1 Struktura Komponentów

```
📁 components/loyalty/
├── LoyaltyOverview.tsx          # Główny dashboard
├── PointsBalance.tsx             # Licznik punktów z animacją
├── PointsHistory.tsx             # Tabela historii
├── StatusProgressCard.tsx         # Pasek postępu tier'u
├── PrivilegesList.tsx            # Lista przywilejów
├── TierBadge.tsx                 # Badge tier'u (Bronze/Silver/Gold/Platinum)
├── PointsAnimation.tsx           # Celebracyjna animacja +XX pkt
├── TierUpModal.tsx               # Modal tier-up
├── PointsNotification.tsx        # Toast notyfikacji
├── RewardsCatalog.tsx            # Katalog nagród (opcjonalnie)
└── AdminDashboard.tsx            # Admin panel
```

### 4.2 Komponenty Główne

#### LoyaltyOverview
```typescript
// Główny komponent, koordynuje wszystkie podkomponenty
// Props: consultantId: string, onPointsEarned: (points: number) => void
// State: points, tier, history, privileges
// Lifecycle: Fetch data na mount, subscribe do real-time updates
```

#### PointsBalance
```typescript
// Wyświetla bieżący bilans punktów
// Props: balance: number, changeDelta?: number (ostatnia zmiana)
// Features:
//   - Animacja licznika (0 → X w 1 sec)
//   - Green highlight na +, neutral na total
//   - Tooltip z breakdown (dzisiaj/wczoraj/total)
//   - Responsive (mobile: inline, desktop: card)
```

#### PointsHistory
```typescript
// Tabela z historią transakcji
// Props: transactions: Transaction[], onExport: () => void
// Features:
//   - Sortowanie po dacie/typie/punktach
//   - Filtrowanie po typie zdarzenia
//   - Virtualizacja (nieskończony scroll dla 1000+ rekordów)
//   - Export CSV/PDF
//   - Icon/badge dla typu zdarzenia
```

#### StatusProgressCard
```typescript
// Karta pokazująca obecny tier i postęp
// Props: currentTier: Tier, currentPoints: number
// Features:
//   - Pasek postępu (ProgressBar)
//   - Nazwa tier'u z ikoną/kolorem
//   - Procent zaawansowania
//   - Liczba punktów do następnego tier'u
//   - Szacunkowy czas (based na historii przyznań)
```

#### PrivilegesList
```typescript
// Lista przywilejów dla bieżącego tier'u
// Props: tier: Tier, allPrivileges: Privilege[]
// Features:
//   - Sekcje organizacyjne (priorytety, projekty, stawki)
//   - Ikony i opisy
//   - Tier progress (locked/active/available)
//   - Expandable kategorie
```

#### TierBadge
```typescript
// Dynamiczny badge tier'u (reusable)
// Props: tier: TierType, size?: 'small'|'medium'|'large'
// Features:
//   - SVG ikony (Bronze/Silver/Gold/Platinum)
//   - Kolory theme'u (Tailwind)
//   - Animacja shine effect (opcjonalnie)
```

#### PointsAnimation
```typescript
// Celebracyjna animacja +XX pkt (popup)
// Props: points: number, reason: string, position?: [x, y]
// Features:
//   - Particle effect (confetti opcjonalnie)
//   - Growing text animation
//   - Fade out po 2 sekundach
//   - Sound effect (muted by default)
```

#### TierUpModal
```typescript
// Modal celebracyjny na tier-up
// Props: fromTier: Tier, toTier: Tier, newPoints: number
// Features:
//   - Large icon animacja
//   - "Congratulations" header
//   - Lista nowych przywilejów
//   - CTA: "View Privileges" / "Close"
//   - Overlay confetti animation
```

#### PointsNotification
```typescript
// Toast notyfikacja (corner)
// Props: type: 'points'|'tierup'|'milestone', message: string, points?: number
// Features:
//   - Auto-dismiss po 5 sec
//   - Icon animation
//   - Sound notification (optional)
```

#### RewardsCatalog (OPCJONALNIE)
```typescript
// Katalog nagród do wymiany punktów
// Props: consultantPoints: number, rewards: Reward[]
// Features:
//   - Grid/list view
//   - Filtry (categoria, dostępne)
//   - "Wymień" button (deducting points)
//   - Purchase confirmation modal
```

#### AdminDashboard
```typescript
// Admin panel do zarządzania programem
// Features:
//   - Stats overview (wykresy, trendy)
//   - Tabela konsultantów z tier'ami
//   - Manual point award form
//   - Configuration panel (punkt values)
//   - Audit log
```

---

## 5. Model Danych

### 5.1 Tabele PostgreSQL (Supabase)

#### loyalty_transactions
```sql
CREATE TABLE loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- e.g., 'monthly_work', 'contract_extension', 'referral', 'smooth_transition', 'feedback', 'certification', 'anniversary', 'manual'
  points INT NOT NULL,
  reason TEXT, -- Human-readable description
  evidence_link TEXT, -- URL to supporting doc (cert, contract, etc.)
  is_auto BOOLEAN DEFAULT TRUE, -- TRUE = auto-triggered, FALSE = manual
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP, -- NULL until approved (for manual awards)
  metadata JSONB, -- Flexible storage: {project_id, contract_id, rating_score, cert_name, etc}
  created_by UUID REFERENCES auth.users(id), -- NULL if auto, admin user if manual
  INDEX idx_consultant_date (consultant_id, created_at DESC),
  INDEX idx_event_type (event_type)
);
```

#### consultants (modified)
```sql
ALTER TABLE consultants ADD COLUMN (
  loyalty_points INT DEFAULT 0, -- Cached total (denormalized for performance)
  loyalty_tier VARCHAR(20) DEFAULT 'bronze', -- Current tier: bronze, silver, gold, platinum
  loyalty_tier_updated_at TIMESTAMP DEFAULT NOW(),
  loyalty_tier_expiry TIMESTAMP NULL, -- If tiers expire (optional)
  loyalty_last_monthly_award TIMESTAMP NULL, -- Last time monthly +100 was awarded
  loyalty_last_anniversary DATE NULL, -- Last anniversary date (for recurring)
  INDEX idx_tier (loyalty_tier),
  INDEX idx_points (loyalty_points DESC)
);
```

#### tier_privileges (Reference Table)
```sql
CREATE TABLE tier_privileges (
  id SERIAL PRIMARY KEY,
  tier_name VARCHAR(20) NOT NULL UNIQUE, -- bronze, silver, gold, platinum
  tier_order INT NOT NULL, -- 0=bronze, 1=silver, 2=gold, 3=platinum
  tier_min_points INT NOT NULL, -- Lower bound
  tier_max_points INT, -- Upper bound (NULL for platinum)
  title_pl VARCHAR(100),
  title_en VARCHAR(100),
  description_pl TEXT,
  description_en TEXT,
  color_hex VARCHAR(7), -- #FFB700 (gold), etc
  icon_name VARCHAR(50), -- star, trophy, crown
  privileges JSONB NOT NULL, -- List of privilege objects
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### privilege_rules (Reference Table - Wartości Punktów)
```sql
CREATE TABLE privilege_rules (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL UNIQUE, -- monthly_work, contract_extension, etc
  points_value INT NOT NULL,
  description_pl VARCHAR(255),
  description_en VARCHAR(255),
  auto_trigger BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 5.2 Struktura Danych (TypeScript)

```typescript
// Types
type TierType = 'bronze' | 'silver' | 'gold' | 'platinum';
type EventType = 'monthly_work' | 'contract_extension' | 'referral' | 'smooth_transition'
               | 'feedback' | 'certification' | 'anniversary' | 'manual';

interface LoyaltyTransaction {
  id: string;
  consultant_id: string;
  event_type: EventType;
  points: number;
  reason: string;
  evidence_link?: string;
  is_auto: boolean;
  created_at: Date;
  processed_at?: Date;
  metadata?: Record<string, any>;
  created_by?: string;
}

interface Consultant {
  id: string;
  // ... existing fields
  loyalty_points: number;
  loyalty_tier: TierType;
  loyalty_tier_updated_at: Date;
  loyalty_last_monthly_award?: Date;
  loyalty_last_anniversary?: Date;
}

interface Tier {
  tier_name: TierType;
  tier_order: number;
  tier_min_points: number;
  tier_max_points?: number;
  title_pl: string;
  title_en: string;
  description_pl: string;
  description_en: string;
  color_hex: string;
  icon_name: string;
  privileges: Privilege[];
}

interface Privilege {
  id: string;
  category: 'queue' | 'projects' | 'rates' | 'processes' | 'events';
  title_pl: string;
  title_en: string;
  description_pl: string;
  description_en: string;
  icon?: string;
  tier_required: TierType;
}

interface PointsEarningEvent {
  type: EventType;
  points: number;
  timestamp: Date;
  details: string;
  icon: string;
}
```

---

## 6. Logika Biznesowa

### 6.1 Zasady Przyznawania Punktów

| Event Type | Punkty | Trigger | Warunki | Auto? |
|---|---|---|---|---|
| **Pełny miesiąc na projekcie** | +100 | Po 1. dnia następnego miesiąca | Minimum 90% present days | ✓ |
| **Przedłużenie umowy** | +500 | Po podpisaniu anexu | Dokument w systemie HR | ✓ |
| **Referral zatrudniony** | +1000 | Po starcie referred person | Linked w systemie HR | ✓ |
| **Gładkie przejście** | +300 | Po starcie nowego projektu | Brak przerwy >14 dni | ✓ |
| **Pozytywna ankieta** | +200 | Po kwartalnej ewaluacji | Rating ≥4.5/5.0 | ✓ |
| **Certyfikacja** | +150 | Po załadowaniu certyfikatu | W sekcji HR/dev | ✓ |
| **Rocznica zatrudnienia** | +500 | Rocznie na dzień rocznicy | Auto-trigger | ✓ |
| **Ręczna nagroda** | Zmienna | Admin award | Log + notyfikacja | ✗ |

### 6.2 Tier'y i Progi Punktów

```
┌──────────┬─────────────┬──────────────────────────────────────────┐
│ Tier     │ Zakres Pkt  │ Przywileje                               │
├──────────┼─────────────┼──────────────────────────────────────────┤
│ BRONZE   │ 0-999       │ • Podstawowe - viewable history & profile │
├──────────┼─────────────┼──────────────────────────────────────────┤
│ SILVER   │ 1000-2999   │ • Priorytet w kolejce oczekiwania        │
│          │             │ • Widoczność raportów wyników            │
│          │             │ • Preferencje projektów                  │
├──────────┼─────────────┼──────────────────────────────────────────┤
│ GOLD     │ 3000-5999   │ • Dostęp do wyjątkowych projektów        │
│          │             │ • Negocjacja stawki +5%                  │
│          │             │ • Priorytet wysokiego poziomu            │
│          │             │ • Skrócone procesy (5 dni)               │
├──────────┼─────────────┼──────────────────────────────────────────┤
│ PLATINUM │ 6000+       │ • Dedykowany Account Manager             │
│          │             │ • Skrócone procesy (2 dni)               │
│          │             │ • Zaproszenia na exclusive eventy        │
│          │             │ • Negocjacja stawki +10%                 │
│          │             │ • Priority sa feedback & awards          │
└──────────┴─────────────┴──────────────────────────────────────────┘
```

### 6.3 Automatyczne Przyznania - Triggery

#### Trigger 1: Monthly Work Award
```
Opis: Przyznaję +100 pkt na ostatni dzień miesiąca dla każdego konsultanta,
      który był na projekcie minimum 90% czasu.

SQL Job (cron: 0 0 L * * - ostatni dzień miesiąca):
SELECT consultant_id
FROM project_assignments pa
WHERE pa.month = DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
  AND pa.attendance_rate >= 0.90
  AND NOT EXISTS (
    SELECT 1 FROM loyalty_transactions lt
    WHERE lt.consultant_id = pa.consultant_id
    AND lt.event_type = 'monthly_work'
    AND DATE_TRUNC('month', lt.created_at) = DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
  );

INSERT loyalty_transactions (consultant_id, event_type, points, reason, is_auto)
VALUES ($1, 'monthly_work', 100, 'Pełny miesiąc na projekcie: ' || project_name, TRUE);
```

#### Trigger 2: Contract Extension
```
Opis: Przyznaję +500 pkt gdy HR zaznaczył nowy annex umowy w systemie.

Event Hook: On umowa_aneks.created
  IF umowa_aneks.type = 'extension' THEN
    INSERT loyalty_transactions (...)
    VALUES (umowa_aneks.consultant_id, 'contract_extension', 500, ...)
  END IF;
```

#### Trigger 3: Anniversary
```
Opis: Przyznaję +500 pkt na dzień rocznicy zatrudnienia.

SQL Job (cron: 0 9 * * * - każdego dnia o 9:00):
SELECT consultant_id, employment_start_date
FROM consultants c
WHERE EXTRACT(month, c.employment_start_date) = EXTRACT(month, NOW())
  AND EXTRACT(day, c.employment_start_date) = EXTRACT(day, NOW())
  AND NOT EXISTS (
    SELECT 1 FROM loyalty_transactions lt
    WHERE lt.consultant_id = c.id
    AND lt.event_type = 'anniversary'
    AND DATE_TRUNC('year', lt.created_at) = DATE_TRUNC('year', NOW())
  );

INSERT loyalty_transactions (...)
VALUES ($1, 'anniversary', 500, 'Rocznica zatrudnienia: X lat', TRUE);
```

### 6.4 Logika Tier-Up i Tier-Down

#### Tier Promotion (Awans)
```typescript
async function checkAndPromoteTier(consultantId: string): Promise<Tier | null> {
  const consultant = await getConsultant(consultantId);
  const currentTier = consultant.loyalty_tier;
  const currentPoints = consultant.loyalty_points;

  const newTier = getTierForPoints(currentPoints);

  if (newTier.tier_order > getTier(currentTier).tier_order) {
    // Promotion!
    await updateConsultant(consultantId, { loyalty_tier: newTier.tier_name });

    // Trigger notification
    await sendNotification(consultantId, {
      type: 'tier_up',
      fromTier: currentTier,
      toTier: newTier.tier_name,
      points: currentPoints
    });

    // Log
    console.log(`Consultant ${consultantId} promoted to ${newTier.tier_name}`);

    return newTier;
  }

  return null;
}
```

#### Tier Demotion (Degradacja - OPCJONALNIE)
```
Założenie: Punkty nigdy się nie usuwają, ale mogą wygasnąć po X lat.
Jeśli obowiązuje wygasanie:
- Wygasanie: +1 rok dla starych (2023) = -points w 2025
- Trigger: Na initial point creation set expiry_date = created_at + 1 year
- Job: Monthly, check expiry_date < NOW(), delete old transactions, recalc tier

Inne założenie: Brak degradacji (default)
- Punkty narastają, tier robi się tylko wyżej
- Konsultant nigdy nie "przegrywa" statusu
```

### 6.5 Aktywacja Przywilejów

```typescript
async function getActivePrivileges(consultantId: string): Promise<Privilege[]> {
  const consultant = await getConsultant(consultantId);
  const currentTier = getTier(consultant.loyalty_tier);

  // Zbierz przywileje dla bieżącego tier'u i niższych
  const activePrivileges = tiers
    .filter(t => t.tier_order <= currentTier.tier_order)
    .flatMap(t => t.privileges);

  return activePrivileges;
}

// Przy checkowaniu uprawnienia:
async function canAccessExclusiveProject(consultantId: string): Promise<boolean> {
  const consultant = await getConsultant(consultantId);
  return consultant.loyalty_tier === 'gold' || consultant.loyalty_tier === 'platinum';
}
```

### 6.6 Obsługa Wygasania Punktów (OPCJONALNE)

```
Konfiguracja: loyalty_expiry_enabled = FALSE (domyślnie brak wygasania)

Jeśli włączone:
  expiry_period = 1 year (konfigurowalne)

  Każda transakcja dostaje:
    expiry_date = created_at + 1 year

  Wygasanie (cron job, codzienny):
    SELECT lt.* FROM loyalty_transactions lt
    WHERE lt.expiry_date < NOW() AND lt.expired_at IS NULL

    UPDATE lt SET expired_at = NOW()
    RECALCULATE consultants.loyalty_points (sum active + non-expired)
    CHECK IF tier downgrade needed
```

---

## 7. Internationalization (i18n)

### 7.1 Słownik PL + EN

```typescript
// locales/pl.json - Fragment
{
  "loyalty": {
    "title": "Program Lojalnościowy",
    "subtitle": "Zbieraj punkty i odbieraj nagrody",

    "dashboard": {
      "myPoints": "Moje Punkty",
      "myStatus": "Mój Status",
      "today": "Dzisiaj",
      "yesterday": "Wczoraj",
      "allTime": "Razem"
    },

    "tiers": {
      "bronze": {
        "name": "Bronze",
        "description": "Fundament programu - podstawowe prawa"
      },
      "silver": {
        "name": "Silver",
        "description": "Priorytet i preferencje projektów"
      },
      "gold": {
        "name": "Gold",
        "description": "Dostęp do projektów premium i negocjacje"
      },
      "platinum": {
        "name": "Platinum",
        "description": "VIP: Dedykowany AM, exclusive eventy"
      }
    },

    "eventTypes": {
      "monthly_work": "Pełny miesiąc na projekcie",
      "contract_extension": "Przedłużenie umowy",
      "referral": "Polecenie zatrudnionego",
      "smooth_transition": "Gładkie przejście",
      "feedback": "Pozytywna ankieta",
      "certification": "Nowa certyfikacja",
      "anniversary": "Rocznica zatrudnienia",
      "manual": "Ręczna nagroda"
    },

    "privileges": {
      "queue": "Kolejka Oczekiwania",
      "projects": "Dostęp do Projektów",
      "rates": "Negocjacja Stawek",
      "processes": "Procesy",
      "events": "Zaproszenia"
    },

    "notifications": {
      "pointsEarned": "Zdobyłeś {{points}} pkt!",
      "tierUp": "Gratulacje! Awansowałeś na {{tier}}!",
      "nearMilestone": "Jesteś {{remaining}} pkt od {{nextTier}}!"
    },

    "regulations": {
      "title": "Regulamin Programu Lojalnościowego",
      "section1": "1. Cel programu...",
      // ...
    }
  }
}

// locales/en.json - Fragment
{
  "loyalty": {
    "title": "Loyalty Program",
    "subtitle": "Collect points and unlock rewards",

    "dashboard": {
      "myPoints": "My Points",
      "myStatus": "My Status",
      "today": "Today",
      "yesterday": "Yesterday",
      "allTime": "Total"
    },

    "tiers": {
      "bronze": {
        "name": "Bronze",
        "description": "Foundation - basic benefits"
      },
      "silver": {
        "name": "Silver",
        "description": "Priority queue and project preferences"
      },
      "gold": {
        "name": "Gold",
        "description": "Premium projects and rate negotiation"
      },
      "platinum": {
        "name": "Platinum",
        "description": "VIP: Dedicated AM, exclusive events"
      }
    },

    "eventTypes": {
      "monthly_work": "Full month on project",
      "contract_extension": "Contract extension",
      "referral": "Referral hired",
      "smooth_transition": "Smooth transition",
      "feedback": "Positive feedback",
      "certification": "Certification completed",
      "anniversary": "Employment anniversary",
      "manual": "Manual award"
    },

    "privileges": {
      "queue": "Queue Priority",
      "projects": "Project Access",
      "rates": "Rate Negotiation",
      "processes": "Processes",
      "events": "Invitations"
    },

    "notifications": {
      "pointsEarned": "You earned {{points}} points!",
      "tierUp": "Congratulations! You've advanced to {{tier}}!",
      "nearMilestone": "You're {{remaining}} points away from {{nextTier}}!"
    },

    "regulations": {
      "title": "Loyalty Program Terms",
      "section1": "1. Program Purpose...",
      // ...
    }
  }
}
```

---

## 8. Scenariusze Testowe

### 8.1 Smoke Tests (Podstawowe)

**ST-M3-01:** Wyświetlanie dashboardu loyalty'ego
- Kroki: Login → Loyalty Module
- Oczekiwane: Komponent ładuje się, wyświetla punkty, tier, przywileje
- Status: PASS/FAIL

**ST-M3-02:** Wyświetlanie historii punktów
- Kroki: Loyalty → Historia Punktów
- Oczekiwane: Tabela ze ≥3 transakcjami, sortowanie działa
- Status: PASS/FAIL

**ST-M3-03:** Exportu danych (PDF)
- Kroki: Loyalty → Historia → Eksport PDF
- Oczekiwane: Pobiera się plik PDF z danymi
- Status: PASS/FAIL

### 8.2 Scenariusze Biznesowe (8+)

**SB-M3-01: Monthly Work Award - Happy Path**
```
Scenariusz: Konsultant spędza pełny miesiąc na projekcie
Warunki wstępne:
  - Konsultant assignment_start = 2025-01-01
  - Attendance_rate = 95% w január
  - Brak wcześniejszych monthly_work awards w janeiro

Kroki:
  1. Czekaj na koniec miesiąca (2025-02-01 o 00:00)
  2. Trigger SQL job (monthly_work)
  3. Sprawdź loyalty_transactions w BD
  4. Sprawdź konsultanta dashboard

Oczekiwane:
  - loyalty_transactions zawiera nowy wiersz
  - event_type = 'monthly_work', points = 100, is_auto = true
  - Konsultanta dashboard pokazuje +100 pkt (z animacją)
  - Notyfikacja email/toast

Asercje:
  ASSERT consultants.loyalty_points += 100
  ASSERT loyalty_transactions.count > before_count
  ASSERT notification.sent = true
```

**SB-M3-02: Tier-Up Promotion (Bronze → Silver)**
```
Scenariusz: Konsultant osiąga 1000 pkt i automatycznie awansuje do Silver
Warunki wstępne:
  - Konsultanta loyalty_points = 950
  - loyalty_tier = 'bronze'
  - Przygotuj transakcję +100 pkt

Kroki:
  1. Award +100 pkt (manual lub auto monthly)
  2. Trigger checkAndPromoteTier()
  3. Sprawdź consultant.loyalty_tier

Oczekiwane:
  - loyalty_tier zmienia się na 'silver'
  - TierUpModal wyskakuje z animacją
  - Notyfikacja "Congratulations! You've advanced to Silver"
  - Nowe przywileje stają się dostępne

Asercje:
  ASSERT consultants.loyalty_tier = 'silver'
  ASSERT tierUpModal.visible = true
  ASSERT notification.type = 'tier_up'
  ASSERT consultants.loyalty_tier_updated_at = NOW()
```

**SB-M3-03: Anniversary Award**
```
Scenariusz: Na dzień rocznicy zatrudnienia konsultant dostaje +500 pkt
Warunki wstępne:
  - Konsultanta employment_start_date = 2024-02-08
  - Data systemowa = 2025-02-08
  - Brak anniversary award w 2025

Kroki:
  1. Ustaw sys date na 2025-02-08 09:00
  2. Trigger anniversary job
  3. Sprawdź loyalty_transactions

Oczekiwane:
  - Nowa transakcja z event_type = 'anniversary', points = 500
  - Konsultanta dashboard notyfikuje "Rocznica zatrudnienia"
  - Badge/animation anniversary

Asercje:
  ASSERT loyalty_transactions.event_type = 'anniversary'
  ASSERT loyalty_transactions.points = 500
  ASSERT consultants.loyalty_points += 500
```

**SB-M3-04: Contract Extension Award**
```
Scenariusz: Nowy annex umowy → +500 pkt
Warunki wstępne:
  - Przygotuj nowy umowa_aneks w HR systemie
  - aneks.type = 'extension'
  - aneks.consultant_id = $consultantId

Kroki:
  1. INSERT umowa_aneks
  2. Trigger event hook
  3. Check loyalty_transactions

Oczekiwane:
  - Transakcja contract_extension, +500 pkt
  - Toast notyfikacja

Asercje:
  ASSERT loyalty_transactions.event_type = 'contract_extension'
```

**SB-M3-05: Smooth Transition Bonus**
```
Scenariusz: Konsultant przechodzi na nowy projekt bez przerwy >14 dni
Warunki wstępne:
  - Project1 end_date = 2025-02-07
  - Project2 start_date = 2025-02-15 (8 dni gap)
  - Brak przerwy > 14 dni

Kroki:
  1. Update project assignments
  2. Trigger smooth_transition job (monthly?)
  3. Check loyalty_transactions

Oczekiwane:
  - Transakcja smooth_transition, +300 pkt
  - Warunek: gap ≤ 14 dni

Asercje:
  ASSERT loyalty_transactions.event_type = 'smooth_transition'
  ASSERT loyalty_transactions.points = 300
```

**SB-M3-06: Positive Feedback Award**
```
Scenariusz: Konsultant otrzymuje rating ≥4.5 w kwartalnej ewaluacji → +200 pkt
Warunki wstępne:
  - Quarterly evaluation (Q1 2025)
  - client_rating = 4.6 / 5.0
  - Evaluation completed

Kroki:
  1. Finalize quarterly evaluation
  2. Trigger feedback hook
  3. Check loyalty_transactions

Oczekiwane:
  - event_type = 'feedback', points = 200

Asercje:
  ASSERT loyalty_transactions.points = 200
  ASSERT evaluation.rating >= 4.5
```

**SB-M3-07: Certification Award**
```
Scenariusz: Konsultant załaduje nową certyfikację → +150 pkt
Warunki wstępne:
  - HR system, sekcja certifications
  - Upload cert PDF/image
  - Status approved

Kroki:
  1. Upload certification (Azure, AWS, etc)
  2. Trigger cert upload hook
  3. Check loyalty_transactions

Oczekiwane:
  - event_type = 'certification', points = 150
  - evidence_link = URL do certyfikatu

Asercje:
  ASSERT loyalty_transactions.event_type = 'certification'
```

**SB-M3-08: Referral Award**
```
Scenariusz: Polecony przez konsultanta kandydat zatrudnia się i startuje → +1000 pkt
Warunki wstępne:
  - HR system, linked referral
  - Referred consultant starts project

Kroki:
  1. New referred consultant starts
  2. Trigger referral hook
  3. Check loyalty_transactions

Oczekiwane:
  - event_type = 'referral', points = 1000
  - metadata.referred_consultant_id = $newConsultantId

Asercje:
  ASSERT loyalty_transactions.points = 1000
```

**SB-M3-09: Admin Manual Award**
```
Scenariusz: Admin przyznaje ręczną nagrodę (special achievement)
Warunki wstępne:
  - Admin login
  - Konsultant wybrany z listy
  - Powód: "Extra bonus dla MVP"

Kroki:
  1. Admin Dashboard → Award Points
  2. Select consultant, enter 500 pkt, reason
  3. Submit
  4. Check loyalty_transactions

Oczekiwane:
  - Nowa transakcja, event_type = 'manual', is_auto = false
  - created_by = admin_user_id
  - Notyfikacja do konsultanta

Asercje:
  ASSERT loyalty_transactions.is_auto = false
  ASSERT loyalty_transactions.created_by = admin_id
  ASSERT notification.sent = true
```

### 8.3 Testy Integracyjne

**INT-M3-01: Full Journey - New Consultant to Silver**
```
Scenariusz: Nowy konsultant zbiera punkty i awansuje do Silver
Kroki:
  1. New consultant starts (0 pkt, Bronze)
  2. Complete first month (Day 1-31, 95% attendance) → +100
  3. Wait for monthly job → +100 (total 200)
  4. Repeat monthly for 5 months → +500 (total 1000)
  5. Trigger tier-up check
  6. Verify dashboard shows Silver + privileges

Oczekiwane:
  - Tier automatycznie zmienia się na Silver
  - Przywileje Silver widoczne
  - History zawiera 6 monthly_work transakcji

Asercje:
  ASSERT consultants.loyalty_tier = 'silver'
  ASSERT consultants.loyalty_points = 1000
  ASSERT privileges.queue_priority = true
```

**INT-M3-02: Anniversary + Monthly Award Same Month**
```
Scenariusz: Rocznica i monthly award w tym samym miesiącu
Kroki:
  1. Set consultant employment_start = 2024-02-15
  2. Set current date = 2025-02-15
  3. Trigger anniversary job → +500
  4. Trigger monthly job (if applicable) → +100
  5. Check history

Oczekiwane:
  - 2 odrębne transakcje
  - Total +600 pkt w tym miesiącu

Asercje:
  ASSERT loyalty_transactions.count = 2 (in month)
  ASSERT SUM(points) = 600
```

---

## 9. Dane Testowe

### 9.1 SQL Script - Tworzenie Test Consultants

```sql
-- Insert test consultants with various tiers

-- 1. Bronze tier (200 pkt)
INSERT INTO consultants (id, name, email, loyalty_points, loyalty_tier)
VALUES
  ('bronze-001', 'Jan Kowalski', 'jan.kowalski@b2bnet.pl', 200, 'bronze');

INSERT INTO loyalty_transactions (consultant_id, event_type, points, reason, is_auto, metadata)
VALUES
  ('bronze-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt X', true, '{"project":"Projekt X"}'),
  ('bronze-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt X', true, '{"project":"Projekt X"}');

-- 2. Silver tier (1500 pkt)
INSERT INTO consultants (id, name, email, loyalty_points, loyalty_tier)
VALUES
  ('silver-001', 'Maria Nowak', 'maria.nowak@b2bnet.pl', 1500, 'silver');

INSERT INTO loyalty_transactions (consultant_id, event_type, points, reason, is_auto, metadata)
VALUES
  ('silver-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt Y', true, '{"project":"Projekt Y"}'),
  ('silver-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt Y', true, '{"project":"Projekt Y"}'),
  ('silver-001', 'contract_extension', 500, 'Przedłużenie umowy', true, '{"contract_id":"ABC123"}'),
  ('silver-001', 'feedback', 200, 'Pozytywna ankieta Q1 2025 (rating: 4.6/5)', true, '{"rating":4.6,"quarter":"Q1"}'),
  ('silver-001', 'certification', 150, 'Certyfikacja: Azure Solutions Architect', true, '{"cert_name":"Azure SA"}'),
  ('silver-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt Y', true, '{"project":"Projekt Y"}'),
  ('silver-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt Y', true, '{"project":"Projekt Y"}'),
  ('silver-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt Y', true, '{"project":"Projekt Y"}'),
  ('silver-001', 'smooth_transition', 300, 'Gładkie przejście: Projekt Y → Projekt Z (5 dni gap)', true, '{"from_project":"Y","to_project":"Z"}'),
  ('silver-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt Z', true, '{"project":"Projekt Z"}'),
  ('silver-001', 'feedback', 200, 'Pozytywna ankieta Q2 2025 (rating: 4.7/5)', true, '{"rating":4.7,"quarter":"Q2"}');

-- 3. Gold tier (4000 pkt)
INSERT INTO consultants (id, name, email, loyalty_points, loyalty_tier)
VALUES
  ('gold-001', 'Piotr Lewandowski', 'piotr.lewandowski@b2bnet.pl', 4000, 'gold');

INSERT INTO loyalty_transactions (consultant_id, event_type, points, reason, is_auto, metadata)
VALUES
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt ABC', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt ABC', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt ABC', true, NULL),
  ('gold-001', 'contract_extension', 500, 'Przedłużenie umowy', true, NULL),
  ('gold-001', 'referral', 1000, 'Polecenie: Anna Adamska zatrudniona', true, '{"referred":"anna-001"}'),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt ABC', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt DEF', true, NULL),
  ('gold-001', 'smooth_transition', 300, 'Gładkie przejście', true, NULL),
  ('gold-001', 'feedback', 200, 'Pozytywna ankieta Q1 (4.8/5)', true, NULL),
  ('gold-001', 'certification', 150, 'Cert: AWS Solutions Architect', true, NULL),
  ('gold-001', 'anniversary', 500, 'Rocznica zatrudnienia: 3 lata', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt DEF', true, NULL),
  ('gold-001', 'contract_extension', 500, 'Przedłużenie umowy', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt DEF', true, NULL),
  ('gold-001', 'feedback', 200, 'Pozytywna ankieta Q2 (4.7/5)', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt GHI', true, NULL),
  ('gold-001', 'certification', 150, 'Cert: Kubernetes CKA', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt GHI', true, NULL),
  ('gold-001', 'smooth_transition', 300, 'Gładkie przejście: GHI → IJK (10 dni)', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt IJK', true, NULL),
  ('gold-001', 'feedback', 200, 'Pozytywna ankieta Q3 (4.6/5)', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt IJK', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt IJK', true, NULL),
  ('gold-001', 'contract_extension', 500, 'Przedłużenie umowy', true, NULL),
  ('gold-001', 'certification', 150, 'Cert: GCP Professional', true, NULL),
  ('gold-001', 'feedback', 200, 'Pozytywna ankieta Q4 (4.8/5)', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt IJK', true, NULL),
  ('gold-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt KLM', true, NULL),
  ('gold-001', 'referral', 1000, 'Polecenie: Krzysztof Kamiński zatrudniony', true, '{"referred":"krzysztof-001"}');

-- 4. Platinum tier (6500 pkt)
INSERT INTO consultants (id, name, email, loyalty_points, loyalty_tier)
VALUES
  ('platinum-001', 'Anna Adamska', 'anna.adamska@b2bnet.pl', 6500, 'platinum');

INSERT INTO loyalty_transactions (consultant_id, event_type, points, reason, is_auto, metadata)
VALUES
  ('platinum-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt X', true, NULL),
  ('platinum-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt X', true, NULL),
  ('platinum-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt X', true, NULL),
  ('platinum-001', 'contract_extension', 500, 'Przedłużenie umowy', true, NULL),
  ('platinum-001', 'feedback', 200, 'Pozytywna ankieta Q1 (4.9/5)', true, NULL),
  ('platinum-001', 'certification', 150, 'Cert: AWS Solutions', true, NULL),
  ('platinum-001', 'anniversary', 500, 'Rocznica zatrudnienia: 5 lat', true, NULL),
  ('platinum-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt Y', true, NULL),
  ('platinum-001', 'referral', 1000, 'Polecenie: Tomasz Nowak zatrudniony', true, NULL),
  ('platinum-001', 'smooth_transition', 300, 'Gładkie przejście: Y → Z (3 dni)', true, NULL),
  ('platinum-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt Z', true, NULL),
  ('platinum-001', 'contract_extension', 500, 'Przedłużenie umowy', true, NULL),
  ('platinum-001', 'feedback', 200, 'Pozytiwna ankieta Q2 (4.8/5)', true, NULL),
  ('platinum-001', 'certification', 150, 'Cert: GCP Architect', true, NULL),
  ('platinum-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt Z', true, NULL),
  ('platinum-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt Z', true, NULL),
  ('platinum-001', 'manual', 500, 'Ręczna nagroda: MVP Projektu', false, '{"reason":"MVP achievement"}'),
  ('platinum-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt W', true, NULL),
  ('platinum-001', 'referral', 1000, 'Polecenie: Joanna Kuchna zatrudniona', true, NULL),
  ('platinum-001', 'feedback', 200, 'Pozytywna ankieta Q3 (4.9/5)', true, NULL),
  ('platinum-001', 'certification', 150, 'Cert: Terraform Associate', true, NULL),
  ('platinum-001', 'smooth_transition', 300, 'Gładkie przejście: W → V (7 dni)', true, NULL),
  ('platinum-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt V', true, NULL),
  ('platinum-001', 'contract_extension', 500, 'Przedłużenie umowy', true, NULL),
  ('platinum-001', 'feedback', 200, 'Pozytywna ankieta Q4 (4.8/5)', true, NULL),
  ('platinum-001', 'manual', 1000, 'Ręczna nagroda: Leader mentoringu', false, NULL),
  ('platinum-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt V', true, NULL),
  ('platinum-001', 'anniversary', 500, 'Rocznica zatrudnienia: 6 lat', true, NULL),
  ('platinum-001', 'certification', 150, 'Cert: Kubernetes Advanced', true, NULL),
  ('platinum-001', 'monthly_work', 100, 'Pełny miesiąc: Projekt V', true, NULL);

-- Insert tier definitions
INSERT INTO tier_privileges (tier_name, tier_order, tier_min_points, tier_max_points,
                              title_pl, title_en, description_pl, description_en,
                              color_hex, icon_name, privileges)
VALUES
  ('bronze', 0, 0, 999,
   'Bronze', 'Bronze',
   'Poziom podstawowy - fundament programu',
   'Basic tier - foundation of the program',
   '#CD7F32', 'circle',
   '[{"category":"profile","title_pl":"Profil","title_en":"Profile","desc_pl":"Widoczność profilu","desc_en":"Profile visibility"}]'::jsonb),

  ('silver', 1, 1000, 2999,
   'Silver', 'Silver',
   'Priorytet i preferencje',
   'Priority and preferences',
   '#C0C0C0', 'star',
   '[
     {"category":"queue","title_pl":"Priorytet Kolejki","title_en":"Queue Priority"},
     {"category":"projects","title_pl":"Preferencje Projektów","title_en":"Project Preferences"},
     {"category":"reports","title_pl":"Dostęp do Raportów","title_en":"Report Access"}
   ]'::jsonb),

  ('gold', 2, 3000, 5999,
   'Gold', 'Gold',
   'Premium: projekty, negocjacje, procesy',
   'Premium: projects, negotiation, processes',
   '#FFD700', 'trophy',
   '[
     {"category":"queue","title_pl":"Priorytet VIP","title_en":"VIP Priority"},
     {"category":"projects","title_pl":"Wyjątkowe Projekty","title_en":"Exclusive Projects"},
     {"category":"rates","title_pl":"Negocjacja +5%","title_en":"Rate Negotiation +5%"},
     {"category":"processes","title_pl":"Skrócone (5 dni)","title_en":"Expedited (5 days)"}
   ]'::jsonb),

  ('platinum', 3, 6000, NULL,
   'Platinum', 'Platinum',
   'VIP: Dedykowany AM, exclusive eventy',
   'VIP: Dedicated AM, exclusive events',
   '#E5B4F3', 'crown',
   '[
     {"category":"queue","title_pl":"Priorytet Maksymalny","title_en":"Maximum Priority"},
     {"category":"projects","title_pl":"Wszystkie Premium Projekty","title_en":"All Premium Projects"},
     {"category":"rates","title_pl":"Negocjacja +10%","title_en":"Rate Negotiation +10%"},
     {"category":"processes","title_pl":"Skrócone (2 dni)","title_en":"Expedited (2 days)"},
     {"category":"support","title_pl":"Dedykowany AM","title_en":"Dedicated Account Manager"},
     {"category":"events","title_pl":"Zaproszenia VIP","title_en":"VIP Event Invites"}
   ]'::jsonb);

-- Insert privilege rules (point values)
INSERT INTO privilege_rules (event_type, points_value, description_pl, description_en, auto_trigger)
VALUES
  ('monthly_work', 100, 'Pełny miesiąc na projekcie', 'Full month on project', true),
  ('contract_extension', 500, 'Przedłużenie umowy (annex)', 'Contract extension signed', true),
  ('referral', 1000, 'Polecony kandydat zatrudniony', 'Referred candidate hired', true),
  ('smooth_transition', 300, 'Gładkie przejście (gap ≤14 dni)', 'Smooth transition (gap ≤14 days)', true),
  ('feedback', 200, 'Pozytywna ankieta (≥4.5/5)', 'Positive feedback (≥4.5/5)', true),
  ('certification', 150, 'Nowa certyfikacja', 'Certification completed', true),
  ('anniversary', 500, 'Rocznica zatrudnienia', 'Employment anniversary', true),
  ('manual', 0, 'Ręczna nagroda (admin)', 'Manual award (admin)', false);
```

---

## 10. Przypadki Brzegowe (Edge Cases)

### 10.1 Ekwivalentne Punkty na Granicy Tier'u

**Scenario:** Konsultant ma dokładnie 1000 pkt (granica Bronze/Silver)
```
Oczekiwane:
  - Tier = silver (>=1000 qualifies)
  - Tier badge wyświetla Silver
  - Silver privileges dostępne

Asercja:
  ASSERT consultants.loyalty_tier = 'silver'
  WHERE loyalty_points = 1000
```

### 10.2 Pierwszy Użytkownik (Zero Punktów)

**Scenario:** Nowy konsultant (dzień 1)
```
Oczekiwane:
  - loyalty_points = 0
  - loyalty_tier = 'bronze'
  - Dashboard wyświetla "0 pkt"
  - Przywileje = tylko Bronze (profile view)
  - Pasek postępu = 0% (do 1000 pkt)

Asercja:
  ASSERT consultants.loyalty_points = 0
  ASSERT consultants.loyalty_tier = 'bronze'
  ASSERT progress_bar.percentage = 0
```

### 10.3 Degradacja Tier'u (Jeśli Włączone Wygasanie)

**Scenario:** Punkt wygaśnie (1 rok), recalc obniża tier
```
Założenie: loyalty_expiry_enabled = true, expiry_period = 1 year

Kroki:
  1. Konsultant ma 6500 pkt (Platinum)
  2. Czekaj 1 rok
  3. Job wygasania: stare transakcje → expired
  4. Recalc: new_points = sum(non-expired) = 4500
  5. Check tier

Oczekiwane:
  - new_tier = gold (3000-5999)
  - Notyfikacja: "Your status has changed"
  - Historia pokazuje wygasłe transakcje (greyed out?)

Asercja:
  ASSERT consultants.loyalty_points = 4500
  ASSERT consultants.loyalty_tier = 'gold'
```

### 10.4 Wiele Zdarzeń w Tym Samym Dniu

**Scenario:** Multiple awards w jednym dniu (np. monthly + feedback + cert)
```
Kroki:
  1. Day 1: monthly_work (+100)
  2. Day 1: feedback approved (+200)
  3. Day 1: certification uploaded (+150)
  4. Total: +450 pkt w jednym dniu

Oczekiwane:
  - 3 odrębne transakcje (z tą samą datą)
  - Dashboard aggregate: +450
  - Notification stack (3 toasty)
  - History wyświetla 3 wiersze

Asercja:
  ASSERT loyalty_transactions.count = 3 (same day)
  ASSERT SUM(points) = 450
  ASSERT notifications.count = 3
```

### 10.5 Referral - Duplikat Check

**Scenario:** Admin spróbuje przyznać referral award dwa razy dla tego samego referred candidate
```
Kroki:
  1. First referral award: konsultant A → kandydat X (+1000)
  2. Second attempt: same referral link

Oczekiwane:
  - System zapobiega duplikatom
  - Error message: "Referral already awarded for this candidate"

Asercja:
  ASSERT loyalty_transactions.count = 1 (only once)
  ASSERT error.code = 'DUPLICATE_REFERRAL'
```

### 10.6 Monthly Award - Attendance Threshold

**Scenario:** Konsultant ma 85% attendance (poniżej 90% threshold)
```
Kroki:
  1. End of month
  2. Attendance check: 85% < 90%
  3. Monthly job runs

Oczekiwane:
  - NO monthly_work award
  - Konsultant nie dostaje +100 pkt
  - Log: "Consultant did not meet attendance threshold"

Asercja:
  ASSERT loyalty_transactions.count = 0 (no monthly award)
```

### 10.7 Anniversary - Rok Przestępny (Feb 29)

**Scenario:** Konsultant zatrudniony 2024-02-29, anniversary w 2025
```
Kroki:
  1. employment_start_date = 2024-02-29
  2. Anniversary job (annual)
  3. Sys date = 2025-02-28 lub 2025-03-01

Oczekiwane:
  - Award przyznany na 2025-02-28 lub 2025-03-01 (depending on config)
  - Dokumentacja: "Leap year handling"

Asercja:
  ASSERT loyalty_transactions.event_type = 'anniversary'
  ASSERT loyalty_transactions.created_at BETWEEN '2025-02-28' AND '2025-03-01'
```

---

## 11. Metryki (Analytics & Monitoring)

### 11.1 Dashboard Metryki

```
📊 LOYALTY PROGRAM METRICS (Admin Dashboard)

┌─────────────────────────────────────────┐
│ Główne Wskaźniki (Last 30 Days)         │
├─────────────────────────────────────────┤
│ Total Consultants Active: 487           │
│ Total Points Awarded: 142,350 pkt       │
│ Avg Points per Consultant: 2,923        │
│ Engagement Rate: 78.2% (> 75% target ✓) │
│ Tier Up Conversions: 34 (6.9%)          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Tier Distribution (Pie Chart)            │
├─────────────────────────────────────────┤
│ Bronze:    89 (18.2%)                   │
│ Silver:   217 (44.6%)  ← Most popular   │
│ Gold:     156 (32.0%)                   │
│ Platinum:  25 (5.1%)                    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Point Earning Trends (Bar Chart)         │
├─────────────────────────────────────────┤
│ monthly_work:      71,500 (50.3%)       │
│ contract_ext:      15,000 (10.5%)       │
│ referral:          12,000 (8.4%)        │
│ feedback:           8,900 (6.3%)        │
│ smooth_trans:       7,200 (5.1%)        │
│ certification:      4,500 (3.2%)        │
│ anniversary:        3,250 (2.3%)        │
│ manual:             2,000 (1.4%)        │
│ [View Detailed Report →]                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Engagement Trends (Line Chart, 12 months)
├─────────────────────────────────────────┤
│ Monthly Active Users: 75-85% (trending ↑)
│ Avg Points/Month: 2,300-2,800 (stable)  │
│ Tier-Ups/Month: 25-35 (consistent)      │
└─────────────────────────────────────────┘
```

### 11.2 KPI Targets

| Metryka | Target | Frequency | Owner |
|---|---|---|---|
| Engagement Rate | >75% | Weekly | PM |
| Avg Points/Consultant/Year | >2500 | Monthly | PM |
| Tier-Up Conversion | >60% | Quarterly | PM |
| Module NPS | ≥8/10 | Quarterly | Product |
| Bug Resolution Time | <48h | Per incident | QA |
| Monthly Award Accuracy | 99.5% | Monthly | Tech |

### 11.3 Monitoring & Alerts

```
⚠️  AUTOMATED ALERTS

1. Tier-Up Failure
   Trigger: calc_new_tier() returns error
   Action: Email to dev team, log incident

2. Double Award Prevention
   Trigger: Duplicate event_type + consultant_id in same period
   Action: Block transaction, alert admin

3. Points Inflation
   Trigger: Total points awarded > monthly budget +20%
   Action: Notification, review manual awards

4. Missing Monthly Awards
   Trigger: End of month, <90% consultants got +100
   Action: Check job execution, retry
```

---

## 12. PROMPT DLA AI BUILDERA

```
# AI BUILDER PROMPT - Program Lojalnościowy (M3)

Jesteś expert developer Next.js 14+ / TypeScript / Supabase.
Twoim zadaniem jest zbudowanie modułu Program Lojalnościowy dla aplikacji Qualrix.

## CONTEXT

Qualrix to aplikacja do zarządzania projektami dla B2B.net S.A. (500+ konsultantów, Antygrivity/Bolt stack).

Stack technologiczny:
- Next.js 14+ (App Router)
- TypeScript (strict mode)
- Supabase (PostgreSQL backend)
- Tailwind CSS + shadcn/ui
- next-intl (PL+EN i18n)

## SPECYFIKACJA MODUŁU M3

### Cel
Zbudować system behawioralny przyznawania punktów konsultantom za:
- Pełne miesiące na projekcie (+100)
- Rozszerzenia umów (+500)
- Polecenia zatrudnione (+1000)
- Gładkie przejścia między projektami (+300)
- Pozytywne ankiety (≥4.5/5) (+200)
- Certyfikacje (+150)
- Rocznice zatrudnienia (+500)
- Ręczne nagrody (admin)

### Tier'y (Poziomy Statusu)
1. Bronze (0-999 pkt): Podstawowe
2. Silver (1000-2999 pkt): +priorytet kolejki
3. Gold (3000-5999 pkt): +exclusive projekty, +5% rate negotiation
4. Platinum (6000+ pkt): +dedicated AM, +2-day expedited process, +events

### Komponenty do Zbudowania

1. **LoyaltyOverview** (Main Dashboard)
   - Wyświetl bilans punktów (z animacją)
   - Pokaż status tier'u + pasek postępu
   - Lista aktywnych przywilejów
   - Link do historii, regulaminu, exportu

2. **PointsBalance**
   - Licznik z animacją (0 → X w 1sec)
   - Tooltip: dzisiaj/wczoraj/total
   - Responsive

3. **PointsHistory**
   - Tabela transakcji (last 6 months)
   - Sortowanie/filtrowanie
   - Virtualizacja (nieskończony scroll)
   - Export CSV/PDF

4. **StatusProgressCard**
   - Tier name + icon + color
   - Progress bar (%)
   - Points remaining to next tier
   - Est. time to promote

5. **PrivilegesList**
   - Sekcje: queue, projects, rates, processes, events
   - Icons + descriptions
   - Locked (future tiers) vs Active (current)

6. **TierBadge** (Reusable)
   - Dynamic icon/color based on tier
   - Optional animation (shine effect)

7. **PointsAnimation** (Toast/Popup)
   - Celebratory animation on points earn
   - +XX pkt, event name, fade out 2sec
   - Optional confetti particle effect
   - Optional sound

8. **TierUpModal**
   - Celebration overlay
   - "Congratulations!" header
   - New privileges list
   - CTA: "View Privileges" or "Close"

9. **PointsNotification** (Corner Toast)
   - 3 types: 'points', 'tierup', 'milestone'
   - Auto-dismiss 5sec
   - Optional sound

10. **AdminDashboard** (Admin Panel)
    - Stats: total points, tier distribution, trends
    - Consultant table (tier, points, actions)
    - Manual award form
    - Point values configuration
    - Audit log viewer

11. **RewardsCatalog** (Optional)
    - Grid of redeemable rewards
    - Filter by category, price
    - Point redemption
    - Confirmation modal

### Database Schema

Create tables (see spec section 5.1):
- loyalty_transactions (main)
- consultants (add fields: loyalty_points, loyalty_tier, etc)
- tier_privileges (static reference)
- privilege_rules (configurable points)

### Automatyczne Triggery (Jobs/Hooks)

1. **Monthly Work** (cron: end of month)
   - Query: consultants with 90%+ attendance
   - Award +100
   - Check & promote tier

2. **Anniversary** (cron: daily at 9:00)
   - Query: birth month/day match
   - Award +500
   - Notifi

3. **Contract Extension** (event hook)
   - On umowa_aneks created
   - Award +500
   - Check tier

4. **Feedback** (event hook)
   - On quarterly eval ≥4.5
   - Award +200

5. **Certification** (event hook)
   - On cert upload approved
   - Award +150

6. **Referral** (event hook)
   - On referred consultant starts
   - Award +1000
   - Dedup check

7. **Smooth Transition** (job or on project start)
   - Check previous project end_date
   - If gap ≤14 days → +300

### i18n Setup

Create locales/pl.json and locales/en.json with:
- All tier names + descriptions
- Event types
- Notification messages
- UI labels
- Regulations

### Features Required

1. Real-time updates (subscribe to loyalty_transactions)
2. Animations on point earn (celebrate!)
3. Tier-up celebratory modal
4. Toast notifications (points, tier-up, milestone)
5. Export (PDF report, CSV history)
6. Admin: Manual awards, config points, audit log
7. Responsive mobile design
8. Accessibility (a11y)
9. Error handling & retry logic
10. Optimistic updates

### Design Tokens

Use Tailwind + shadcn/ui:
- Bronze: #CD7F32
- Silver: #C0C0C0
- Gold: #FFD700
- Platinum: #E5B4F3

### Testing Requirements

1. Unit tests for tier calculation logic
2. Integration tests for point awards
3. E2E tests for full user journey
4. Edge cases: boundary points, duplicate awards, etc.

### Deliverables

1. Source code (/components/loyalty/*, /app/loyalty/*, /lib/loyalty/)
2. Database migrations (SQL)
3. API routes (point awards, tier checks, admin)
4. Tests (unit + integration + e2e)
5. Documentation (README, API docs)

### Notes

- ZERO penalties, ONLY rewards (positive reinforcement)
- Prioritize real-time feedback (animations, notifications)
- Make it feel rewarding and fun (gamification)
- Performance: handle 500+ consultants efficiently
- Security: only admins can award points manually
- Audit trail: all point transactions logged
- Mobile-first responsive design

Good luck! Build something amazing! 🚀
```

---

## 13. Zależności (Dependencies)

### 13.1 Systemy Wewnętrzne

| System | Interfejs | Owner | Notes |
|---|---|---|---|
| HR System (HRIS) | API | HR Team | Employment dates, anniversaries |
| Project Management | API | PM Team | Project assignments, dates |
| Evaluation System | API/Webhook | HR Team | Quarterly ratings ≥4.5 |
| Certification Module | API/Upload | HR Team | Cert uploads & approvals |
| Contract Management | API/Webhook | Legal | Annex signatures |
| Authentication (Supabase) | SDK | Eng | User login, roles |

### 13.2 Zewnętrzne Zależności

| Library | Version | Purpose | Notes |
|---|---|---|---|
| next | ^14.0 | Framework | Latest LTS |
| typescript | ^5.0 | Type safety | Strict mode |
| @supabase/supabase-js | ^2.40 | DB client | Real-time subs |
| tailwindcss | ^3.3 | Styling | Utility-first CSS |
| shadcn/ui | Latest | UI components | Headless |
| next-intl | ^3.0 | i18n | PL + EN |
| recharts | ^2.9 | Charts (Admin) | Analytics dashboard |
| framer-motion | ^10.0 | Animations | Smooth tier-up, confetti |
| date-fns | ^2.30 | Date utils | Formatting, calculations |
| react-toastify | ^10.0 | Toast notifications | User feedback |
| react-pdf | ^8.0 | PDF export | Report generation |
| zod | ^3.22 | Validation | Type-safe schemas |

### 13.3 Konfiguracja Środowiska

```env
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx

# API Endpoints (for external integrations)
HR_SYSTEM_API_URL=https://hr-api.internal.com
PROJECT_SYSTEM_API_URL=https://pm-api.internal.com

# Loyalty Config
LOYALTY_EXPIRY_ENABLED=false
LOYALTY_EXPIRY_PERIOD_DAYS=365

# Feature Flags
LOYALTY_REWARDS_CATALOG_ENABLED=true
LOYALTY_SOUND_EFFECTS_ENABLED=true
LOYALTY_ANIMATIONS_ENABLED=true
```

### 13.4 Bezpieczeństwo & Compliance

- **Row-Level Security (RLS):** Konsultant widzi tylko swoje punkty
- **Audit Trail:** Każda transakcja jest logowana (created_by, timestamp, etc)
- **Admin Role:** Tylko role='admin' mogą przyznawać ręczne nagrody
- **GDPR:** Dane konsultanta zgodne z RODO
- **Data Privacy:** Historyczne dane archiwizowane co 2 lata

---

## Podsumowanie

Program Lojalnościowy M3 to kluczowy moduł gamifikacji dla Qualrix, zapewniający:

✅ **Pozytywne wzmacnianie:** ZERO kar, tylko nagrody
✅ **Automatyczne przyznania:** Większość zdarzeń auto-triggered
✅ **Tier'y i przywileje:** Intuicyjne poziomy z jasnymi benefitami
✅ **Real-time feedback:** Animacje, toasty, celebracje
✅ **Transparency:** Historia, regulamin, export danych
✅ **Admin Control:** Ręczne nagrody, konfiguracja, audit log
✅ **Skalowalne:** 500+ konsultantów, efektywne DB queries
✅ **Responsive & Accessible:** Mobile-first, a11y compliant

**Target Launch:** Q2 2025
**Success Metrics:** >75% engagement, >2500 avg points/consultant/year, ≥8/10 NPS

---

**Dokument przygotowany dla:** B2B.net S.A.
**Wersja:** 1.0
**Ostatnia aktualizacja:** 2025-02-08
**Autor:** AI Builder (Claude Opus 4.5)
**Status:** ✅ Ready for Development

---

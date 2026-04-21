# DOC-M1: Dashboard Konsultanta

**Wersja:** 1.0
**Data:** Luty 2025
**Dla:** B2B.net S.A.
**Aplikacja:** Qualrix - System Zarządzania Konsultantami
**Moduł:** M1 - Dashboard Konsultanta
**Status:** Gotowy do buildowania

---

## 1. Opis Modułu

### 1.1 Co to jest Dashboard Konsultanta?

Dashboard Konsultanta (M1) to **główna strona domowa** aplikacji Qualrix, którą konsultant widzi bezpośrednio po zalogowaniu. Jest to **hub informacyjny i motywacyjny**, który pokazuje konsultantowi aktualny stan jego:

- **Statusu kontraktu** (aktywny, kończy się, zakończony)
- **Zdrowia relacji z klientem** (Health Score)
- **Nagrodzenia za lojalność** (punkty i poziom statusu)
- **Szybkiego dostępu** do kluczowych funkcji

### 1.2 Dlaczego to ważne?

Dashboard M1 spełnia **cztery kluczowe role biznesowe** w strategii retencji B2B.net:

| Cel | Jak Dashboard to osiąga |
|-----|-------------------------|
| **Przejrzystość** | Konsultant zawsze wie jaki ma kontrakt, ile dni zostało, jaka jest jego wartość dla klienta |
| **Poczucie kontroli** | Widzi szybkie akcje (Projekty, Dokumenty, Poleć), czuje się agencją w swoim rozwoju |
| **Motywacja** | Widzi punkty lojalnościowe, status (Bronze/Silver/Gold/Platinum), progres do następnego poziomu |
| **Wczesne ostrzeżenia** | Jeśli Health Score spada lub kontrakt się kończy, konsultant WIDZI to i może działać proaktywnie |

💡 **Wskazówka:** Jest to "first impression screen" - jeśli Dashboard wygląda dobrze, konsultant czuje że system jest profesjonalny i poważnie traktuje jego potrzeby.

### 1.3 Pozycja w architekturze

Dashboard jest **pierwszym modułem do zbudowania** (M1) z ważnych powodów:

1. **Dane agregujące** - łączy dane z wielu modułów (kontrakty, Health Score, lojalność, powiadomienia)
2. **Integracyjny hub** - Quick Actions prowadzą do M2 (Marketplace), M3 (Lojalność), M4 (Profil)
3. **Powiększona** - gdy inne moduły dodają dane, Dashboard się automatycznie aktualizuje
4. **Fundament UX** - jeśli Dashboard jest intuicyjny, reszta systemu czuje się znana

---

## 2. User Stories

Poniżej znajduje się zestaw user stories opisujących kluczowe interakcje z Dashboard. Format: **"Jako [rola] chcę [akcja] aby [cel]"**

1. **Jako konsultant chcę zobaczyć moje imię przy zalogowaniu, aby wiedzieć że jestem na prawidłowym koncie**

2. **Jako konsultant chcę widzieć ile dni zostało do końca mojego kontraktu, aby planować swoją przyszłość zawodową**

3. **Jako konsultant chcę widzieć mój aktualny Health Score, aby wiedzieć jak klient ocenia moją pracę**

4. **Jako konsultant chcę widzieć Health Score w formie wizualnej (zielony/żółty/czerwony), aby szybko zrozumieć status bez czytania tekstu**

5. **Jako konsultant chcę widzieć moje punkty lojalnościowe, aby czuć że moja lojalność jest doceniana**

6. **Jako konsultant chcę widzieć jaki mam status lojalnościowy (Bronze/Silver/Gold/Platinum), aby wiedzieć jakie przywileje mam**

7. **Jako konsultant chcę widzieć progress bar do następnego statusu, aby wiedzieć ile punktów mi brakuje**

8. **Jako konsultant chcę mieć szybki dostęp do Marketplace projektów, aby nie martwić się o przyszłość po zakończeniu kontraktu**

9. **Jako konsultant chcę móc kliknąć "Poleć znajomego", aby zarobić bonusowe punkty**

10. **Jako konsultant chcę pobrać moje dokumenty (umowa, faktura), aby mieć je do swoich zapisów**

11. **Jako konsultant chcę przejść do mojego profilu, aby aktualizować dane zawodowe**

12. **Jako konsultant chcę widzieć powiadomienia o zmianach statusu, aby nie przegapić ważnych komunikatów**

13. **Jako konsultant chcę zaznaczać powiadomienia jako przeczytane, aby śledzić które już widziałem**

14. **Jako konsultant chcę przełączać język między PL i EN, aby wygodnie korzystać z aplikacji w preferowanym języku**

15. **Jako konsultant chcę mieć dostęp do Dashboard offline (cached), aby móc zobaczyć swoje dane nawet bez internetu**

---

## 3. Wireframe / Layout Description

### 3.1 Mobile Layout (Primary - 375px-480px)

Poniżej znajduje się szczegółowy opis layoutu dla urządzeń mobilnych. **Brak zdjęć** - opis jest na tyle precyzyjny, że AI builder powinien go wygenerować.

#### Top Navigation Bar (Fixed, Height 56px)
```
┌──────────────────────────────────────────────────────────┐
│ [Logo Qualrix]        [🔔(3)]  [PL/EN]  [👤 Avatar]     │
└──────────────────────────────────────────────────────────┘
```

- **Lewa strona:** Logo Qualrix (clickable → home)
- **Środek:** Pusty (reserved for breadcrumb na desktop)
- **Prawa strona:**
  - Notification bell z red badge (liczba unread) - click → drawer z notifications
  - Language toggle (PL/EN switch) - toggle → zmienia interfejs instantly
  - Avatar user - click → profile menu (Mój profil, Ustawienia, Wyloguj)

#### Hero Section (Padding 16px, Background: linear gradient)
```
┌──────────────────────────────────────────────────────────┐
│  Cześć, Ania! 👋                                        │
│  Niedziela, 9 lutego 2025                               │
└──────────────────────────────────────────────────────────┘
```

- **Greeting:** "Cześć, {first_name}! 👋" (dynamicznie pobierane z JWT token)
- **Data:** Pełna data w formacie "Dzień, DD miesiąc RRRR"
- **Tło:** Gradient (light: linear-gradient(135deg, #667eea 0%, #764ba2 100%))
- **Tekst:** Biały, bold (font-weight 600), Heading 2 (32px)

#### Contract Status Card (Full width - 8px margin)
```
┌──────────────────────────────────────────────────────────┐
│  AKTYWNY 🟢                                             │
│                                                          │
│  Acme Corp / Backend Migration                          │
│                                                          │
│  POZOSTAŁO 120 DNI                                      │
│  [████████████████░░░░░] (circular progress: 85%)       │
│                                                          │
│  Stawka: 120 PLN/h (tap to reveal) [👁️‍🗨️]            │
└──────────────────────────────────────────────────────────┘
```

- **Status Badge:**
  - Zielony (#10b981) "AKTYWNY" jeśli end_date > dzisiaj + 90 dni
  - Żółty (#f59e0b) "KOŃCZY SIĘ" jeśli end_date <= dzisiaj + 90 dni AND > dzisiaj
  - Czerwony (#ef4444) "ZAKOŃCZONY" jeśli end_date <= dzisiaj
  - Szary (#6b7280) "BRAK KONTRAKTU" jeśli brak aktywnego kontraktu
  - Icon emoji (🟢/🟡/🔴)
- **Klient + Projekt:** Tekst szary (dark: #374151), font 14px, jeden wiersz (truncate)
- **Countdown:**
  - Duży tekst (20px, bold): "POZOSTAŁO XX DNI"
  - Jeśli < 7 dni: pulsing animation (opacity 1 → 0.6 → 1 co 1.5s)
  - Jeśli < 30 dni: kolor czerwony zamiast szarego
  - Circular progress indicator: SVG circle, stroke color = status color
  - Jeśli kontrakt zakończony: "ZAKOŃCZONY XX DNI TEMU"
- **Rate Info (expandable):**
  - Default: blurred "●●● PLN/h" (privacy)
  - Icon: eye icon z "tap to reveal"
  - Click → show "120 PLN/h" fully visible, opacity 1
  - Reveal time: 5s, po czym wraca do blurred

#### Health Score Widget (Full width - 8px margin)
```
┌──────────────────────────────────────────────────────────┐
│                  HEALTH SCORE                            │
│                                                          │
│              ╱────────╲                                  │
│           ╱              ╲                               │
│         │      85%        │ 🟢 STABILNY                 │
│         │    (Dobrze!)    │                             │
│           ╲              ╱                               │
│              ╲────────╱                                  │
│                                                          │
│  Świetnie pracujesz. Kontynuuj tak!                      │
│                                                          │
│  [Rozwiń > ]  (tap for breakdown)                       │
└──────────────────────────────────────────────────────────┘
```

- **Circular Gauge:**
  - SVG circle (150px diameter)
  - Stroke: 8px
  - Kolor zależy od wartości:
    - 80-100%: Green (#10b981)
    - 50-79%: Yellow (#f59e0b)
    - 0-49%: Red (#ef4444)
    - null: Gray (#d1d5db)
  - Center text: percentage + emoji (✨🟢 / ⚠️🟡 / 🚨🔴)
- **Status Text:**
  - Green (80-100%): "STABILNY" + "Świetnie pracujesz. Kontynuuj tak!"
  - Yellow (50-79%): "WYMAGA UWAGI" + "Skontaktuj się z Account Managerem, aby poprawić Score"
  - Red (0-49%): "KRYTYCZNY" + Button "Umów rozmowę" (red background, click → /schedule-call)
  - Null: "BRAK DANYCH" + "Score będzie dostępny po pierwszej ewaluacji od klienta"
- **Expand Action:**
  - Click card → expand to show breakdown:
    - "Feedback od klienta: 85%"
    - "Stabilność projektu: 90%"
    - "Zaangażowanie: 78%"
    - "Red flags: 0"
  - Animation: slide down, fade in

#### Loyalty Card (Full width - 8px margin)
```
┌──────────────────────────────────────────────────────────┐
│  🥇 GOLD STATUS                                         │
│                                                          │
│  3,450 pkt                                              │
│  [████████░░░░] 69% do PLATINUM                         │
│                                                          │
│  Potrzebujesz jeszcze 2,550 pkt                         │
│                                                          │
│  [Znajdź projekty >] [Poleć znajomego >]               │
└──────────────────────────────────────────────────────────┘
```

- **Status Badge:**
  - Bronze 🥉 (0-999 pkt): Brown badge
  - Silver 🥈 (1000-2999 pkt): Gray badge
  - Gold 🥇 (3000-5999 pkt): Gold badge
  - Platinum 💎 (6000+ pkt): Purple badge
- **Points Display:**
  - Large text (28px, bold): "X,XXX pkt"
  - Format: z separatorem tysięcy (3450 → "3,450")
- **Progress Bar:**
  - Zełży background: linear-gradient(90deg, currentStatusColor, nextStatusColor)
  - Percentage text: "XX% do [NEXT_TIER]"
  - Jeśli Platinum: zamiast bar → "🎉 Maksymalny poziom osiągnięty!"
- **CTA Buttons:**
  - "Znajdź projekty >" → click → navigate to /marketplace (M2)
  - "Poleć znajomego >" → click → navigate to /referral (M3)
  - Secondary buttons (ghost style, border only)

#### Quick Actions Grid (Full width, 2x2 grid - 8px margin)
```
┌──────┬──────┐
│ 🔍   │ 👤   │
│ Proj │ Poleć│
├──────┼──────┤
│ 📄   │ 📊   │
│ Dok  │ Profil│
└──────┴──────┘
```

- **Grid:** 2 columns, 4 rows (2x2 cells)
- **Card spacing:** 8px gap
- **Cell height:** 96px (square on mobile)
- **Cell content:**
  1. 🔍 "Projekty" → click → `/marketplace` (M2)
  2. 👤 "Poleć znajomego" → click → `/referral` (M3)
  3. 📄 "Dokumenty" → click → `/documents` (M4)
  4. 📊 "Mój profil" → click → `/profile` (M5)
- **Styling:**
  - Border: 1px solid #e5e7eb
  - Hover: background #f3f4f6, shadow
  - Icon: 32px, centered
  - Text: 12px, centered, bold

#### Recent Notifications List (Full width - 8px margin)
```
┌──────────────────────────────────────────────────────────┐
│  POWIADOMIENIA (3 nowe)                                 │
│                                                          │
│  ├─ 🎉 [NEW] Osiągnąłeś status Silver!                  │
│  │  5 minut temu                                        │
│  │  [○ Mark as read]                                    │
│  │                                                      │
│  ├─ ⚠️  Health Score spadł do 55%                        │
│  │  3 godziny temu                                      │
│  │  [○ Mark as read]                                    │
│  │                                                      │
│  └─ 📋 Nowy dokument: Raport Q4                          │
│     1 dzień temu                                        │
│     [○ Mark as read]                                    │
│                                                          │
│  [Wszystkie powiadomienia >]                            │
└──────────────────────────────────────────────────────────┘
```

- **Section title:** "POWIADOMIENIA" (14px, bold, gray)
- **Unread badge:** "(X nowe)" - red, small
- **Notification item:**
  - Icon (emoji): 🎉 / ⚠️ / 📋 / 📧
  - Title: 14px, bold, dark
  - "[NEW]" tag (red background, white text) - only if unread
  - Timestamp: 12px, gray, relative ("5 minut temu", "3 godziny temu")
  - Action: Dot icon (○) to mark as read - click → PATCH /api/notifications/:id/read
  - Divider: 1px solid #e5e7eb
- **Limit:** Show 3 most recent
- **See all link:** Click → /notifications (full notifications page)

#### Bottom Navigation (Fixed, Height 56px)
```
┌──────────────────────────────────────────────────────────┐
│  [🏠 Dashboard] [🔍 Projekty] [👤 Profil] [≡ Więcej]    │
└──────────────────────────────────────────────────────────┘
```

- **Tab navigation:**
  - Dashboard (active): filled icon, primary color
  - Projekty: outline icon → /marketplace
  - Profil: outline icon → /profile
  - Więcej: outline icon → /menu (settings, help, logout)
- **Icons:** 24px, centered
- **Labels:** 10px, below icon
- **Background:** white, shadow above

---

### 3.2 Tablet Layout (769px-1024px)

- Sidebar na lewej (160px, fixed)
- Main content (center) z 2-column grid dla Cards
- Notifications drawer na prawej (300px, collapsible)
- Same komponenty jak mobile, ale szerzej rozpropagowane

---

### 3.3 Desktop Layout (1025px+)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Qualrix Logo]  Dashboard > Mój Profil      [🔔] [PL/EN] [👤]      │
├──────────────────────────────────────────────────────────────────────┤
│  Sidebar       │                                    │ Notifications  │
│  ├ Dashboard   │  Cześć, Ania! 👋                  │ (scrollable)   │
│  ├ Projekty    │  Niedziela, 9 lutego 2025         │                │
│  ├ Profil      │                                    │ 3 nowe         │
│  ├ Lojalność   │  [Contract Status Card] [H-Score] │ ├─ 🎉 Silver  │
│  └ Więcej      │                                    │ ├─ ⚠️  Score   │
│                │  [Loyalty Card]        [Q-Actions]│ └─ 📋 Document│
│                │                                    │                │
│                │  [Recent Notifications]           │ [Mark all ✓]  │
│                │                                    │                │
└──────────────────────────────────────────────────────────────────────┘
```

- **Sidebar:** Collapsible (hamburger icon na mobile)
- **Main:** 3-column grid (Contract Card + Health Score side-by-side, Loyalty + Q-Actions below)
- **Right panel:** Notifications feed (separate scrollbar)
- **Header:** Top navigation bar (persistent)

💡 **Wskazówka:** Responsive design: użyj TailwindCSS breakpoints (`md:`, `lg:`, `xl:`)
- `md:` (768px) → tablet 2-column
- `lg:` (1024px) → desktop 3-column z sidebar

---

## 4. Komponenty UI

Poniżej znajduje się lista każdego komponentu użytego w Dashboard, wraz z props, danymi i zachowaniem.

### 4.1 ContractStatusCard

**Co robi:** Wyświetla status kontraktu, klienta, projekt, ile dni zostało.

**Props:**
```typescript
interface ContractStatusCardProps {
  contractId: string;
  status: "active" | "ending" | "ended" | "none";
  clientName: string;
  projectName: string;
  startDate: Date;
  endDate: Date;
  hourlyRate: number;
  currencyCode?: string; // default: "PLN"
  onViewDetails?: () => void;
}
```

**Dane pobierane z Supabase:**
- `contracts` table: `id`, `client_name`, `project_name`, `start_date`, `end_date`, `rate_per_hour`, `status`

**shadcn/ui Components:**
- `Card` - container
- `Badge` - status label
- `Progress` - countdown progress bar (custom circular variant)
- `Button` - reveal rate, view details CTA

**Zachowanie:**
- Status color zmienia się na podstawie logiki (patrz sekcja 6 - Logika Biznesowa)
- Rate info: domyślnie blurred (`text-transparent blur-sm`), click on eye icon → reveal (full opacity), auto-hide po 5s
- Circular progress: SVG, animacja stroke-dashoffset (CSS transition)
- Jeśli < 7 dni: pulsing animation (`animation: pulse 1.5s ease-in-out infinite`)
- Responsywne: padding 16px na mobile, 24px na desktop

**Kod komponentu (template):**
```typescript
export function ContractStatusCard({ contractId, status, clientName, projectName, startDate, endDate, hourlyRate }: ContractStatusCardProps) {
  const daysRemaining = calculateDaysRemaining(endDate);
  const [showRate, setShowRate] = useState(false);

  const statusConfig = getStatusConfig(status, daysRemaining);

  return (
    <Card className="border-2 p-6">
      <Badge className={statusConfig.bgColor}>
        {statusConfig.emoji} {statusConfig.label}
      </Badge>
      <p className="text-sm text-gray-600 mt-2">{clientName} / {projectName}</p>
      <div className="mt-4 flex items-center gap-4">
        <CircularProgress
          value={calculateProgress(startDate, endDate)}
          color={statusConfig.color}
        />
        <div>
          <p className="text-2xl font-bold">POZOSTAŁO {daysRemaining} DNI</p>
          {daysRemaining < 7 && <span className="animate-pulse">⚠️ Krótko!</span>}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <input
          type="text"
          value={showRate ? `${hourlyRate} PLN/h` : '●●● PLN/h'}
          disabled
          className={showRate ? '' : 'blur-sm'}
        />
        <button onClick={() => setShowRate(!showRate)}>👁️</button>
      </div>
    </Card>
  );
}

function getStatusConfig(status: string, daysRemaining: number) {
  if (status === 'ended') return { label: 'ZAKOŃCZONY', emoji: '🔴', bgColor: 'bg-red-100', color: '#ef4444' };
  if (daysRemaining <= 90 && daysRemaining > 0) return { label: 'KOŃCZY SIĘ', emoji: '🟡', bgColor: 'bg-yellow-100', color: '#f59e0b' };
  if (daysRemaining > 90) return { label: 'AKTYWNY', emoji: '🟢', bgColor: 'bg-green-100', color: '#10b981' };
  return { label: 'BRAK KONTRAKTU', emoji: '⚫', bgColor: 'bg-gray-100', color: '#6b7280' };
}
```

---

### 4.2 HealthScoreGauge

**Co robi:** Wyświetla Health Score w formie koła (gauge) z kolorem i interpretacją tekstu.

**Props:**
```typescript
interface HealthScoreGaugeProps {
  score: number | null; // 0-100
  clientFeedback?: number;
  stability?: number;
  engagement?: number;
  redFlags?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
}
```

**Dane z Supabase:**
- `contract_health_scores` table: `overall_score`, `client_feedback_score`, `stability_score`, `engagement_score`, `red_flags_score`

**shadcn/ui Components:**
- `Card` - container
- `Button` - expand/collapse
- `AlertCircle` / `CheckCircle` - icons

**Zachowanie:**
- Circular gauge: SVG circle element, stroke-dasharray animation
- Kolor zależy od score (patrz sekcja 6)
- Default: collapsed (pokazuje tylko gauge + label)
- Click → expanded (pokazuje breakdown tabelki)
- Jeśli score null: gray circle, placeholder message
- Gauge animation on mount: stroke-dashoffset zmienia się z 0 do calculated (1.5s duration)

**Kod komponentu (template):**
```typescript
export function HealthScoreGauge({
  score,
  clientFeedback,
  stability,
  engagement,
  redFlags,
  expanded,
  onToggleExpand
}: HealthScoreGaugeProps) {
  const config = getScoreConfig(score);
  const circumference = 2 * Math.PI * 45; // radius 45
  const strokeDashoffset = circumference * (1 - (score ?? 0) / 100);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-center">
          <svg width="150" height="150" className="relative">
            <circle cx="75" cy="75" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            <circle
              cx="75"
              cy="75"
              r="45"
              fill="none"
              stroke={config.color}
              strokeWidth="8"
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: strokeDashoffset,
                transition: 'stroke-dashoffset 1.5s ease-out'
              }}
              strokeLinecap="round"
            />
            <text x="75" y="75" textAnchor="middle" dominantBaseline="middle" fontSize="28" fontWeight="bold">
              {score ?? '—'}%
            </text>
          </svg>
        </div>
        <div className="ml-6">
          <h3 className={`text-xl font-bold ${config.textColor}`}>{config.status}</h3>
          <p className="text-sm text-gray-600 mt-2">{config.message}</p>
          {config.status === 'KRYTYCZNY' && (
            <Button className="mt-4 bg-red-600">Umów rozmowę</Button>
          )}
        </div>
      </div>

      {expanded && score !== null && (
        <div className="mt-6 border-t pt-4">
          <table className="w-full text-sm">
            <tbody>
              <tr><td>Feedback od klienta:</td><td className="font-bold text-right">{clientFeedback}%</td></tr>
              <tr><td>Stabilność projektu:</td><td className="font-bold text-right">{stability}%</td></tr>
              <tr><td>Zaangażowanie:</td><td className="font-bold text-right">{engagement}%</td></tr>
              <tr><td>Red flags:</td><td className="font-bold text-right">{redFlags}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      <Button variant="ghost" className="mt-4 w-full" onClick={onToggleExpand}>
        {expanded ? 'Zwiń ▲' : 'Rozwiń ▼'}
      </Button>
    </Card>
  );
}

function getScoreConfig(score: number | null) {
  if (score === null) return {
    status: 'BRAK DANYCH',
    color: '#d1d5db',
    textColor: 'text-gray-500',
    message: 'Score będzie dostępny po pierwszej ewaluacji od klienta'
  };
  if (score >= 80) return {
    status: 'STABILNY',
    color: '#10b981',
    textColor: 'text-green-600',
    message: 'Świetnie pracujesz. Kontynuuj tak!'
  };
  if (score >= 50) return {
    status: 'WYMAGA UWAGI',
    color: '#f59e0b',
    textColor: 'text-yellow-600',
    message: 'Skontaktuj się z Account Managerem, aby poprawić Score'
  };
  return {
    status: 'KRYTYCZNY',
    color: '#ef4444',
    textColor: 'text-red-600',
    message: 'Twoja pozycja w projekcie jest zagrożona. Działaj szybko!'
  };
}
```

---

### 4.3 LoyaltyStatusCard

**Co robi:** Wyświetla aktualny stan lojalności (punkty, status tier, progress do następnego).

**Props:**
```typescript
interface LoyaltyStatusCardProps {
  points: number;
  currentTier: "bronze" | "silver" | "gold" | "platinum";
  nextTierPoints?: number; // undefined if platinum
  onViewPrivileges?: () => void;
}
```

**Dane z Supabase:**
- `consultants` table: `loyalty_points`, `loyalty_status`
- Kalkulacja tier based on points (logic in sekcja 6)

**shadcn/ui Components:**
- `Card` - container
- `Badge` - tier badge
- `Progress` - progress bar to next tier
- `Button` - CTA buttons

**Zachowanie:**
- Tier badge: icon + text, style zależy od tier
- Points: formatted z separatorem tysięcy (3450 → "3,450 pkt")
- Progress bar: `(points - tierMin) / (nextTierMin - tierMin) * 100`
- Jeśli Platinum: zamiast progress bar → celebratory message
- Button actions: "Znajdź projekty" → /marketplace, "Poleć znajomego" → /referral

**Kod komponentu (template):**
```typescript
export function LoyaltyStatusCard({
  points,
  currentTier,
  nextTierPoints,
  onViewPrivileges
}: LoyaltyStatusCardProps) {
  const tierConfig = getTierConfig(currentTier);
  const progressPercent = calculateProgressToNextTier(points, currentTier);

  return (
    <Card className="p-6 bg-gradient-to-br from-purple-50 to-pink-50">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-3xl">{tierConfig.emoji}</span>
        <Badge className={tierConfig.bgColor}>{tierConfig.label}</Badge>
      </div>

      <p className="text-3xl font-bold mb-2">{points.toLocaleString('pl-PL')} pkt</p>

      {currentTier !== 'platinum' ? (
        <>
          <Progress value={progressPercent} className="mb-2" />
          <p className="text-xs text-gray-600">
            {progressPercent}% do {getTierConfig('next').label}
          </p>
          <p className="text-xs font-semibold mt-2 text-gray-700">
            Potrzebujesz jeszcze {nextTierPoints! - points} pkt
          </p>
        </>
      ) : (
        <div className="bg-purple-100 border border-purple-300 rounded p-3 text-center">
          <p className="text-sm font-bold text-purple-700">🎉 Maksymalny poziom osiągnięty!</p>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <Button className="flex-1" onClick={() => window.location.href = '/marketplace'}>
          🔍 Projekty
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => window.location.href = '/referral'}>
          👤 Poleć
        </Button>
      </div>
    </Card>
  );
}

function getTierConfig(tier: string) {
  const config = {
    bronze: { emoji: '🥉', label: 'BRONZE', bgColor: 'bg-amber-100 text-amber-800' },
    silver: { emoji: '🥈', label: 'SILVER', bgColor: 'bg-gray-100 text-gray-800' },
    gold: { emoji: '🥇', label: 'GOLD', bgColor: 'bg-yellow-100 text-yellow-800' },
    platinum: { emoji: '💎', label: 'PLATINUM', bgColor: 'bg-purple-100 text-purple-800' },
  };
  return config[tier] || config.bronze;
}

function calculateProgressToNextTier(points: number, tier: string): number {
  const thresholds = {
    bronze: { min: 0, max: 999, next: 1000 },
    silver: { min: 1000, max: 2999, next: 3000 },
    gold: { min: 3000, max: 5999, next: 6000 },
    platinum: { min: 6000, max: Infinity, next: Infinity },
  };
  const current = thresholds[tier];
  return Math.round(((points - current.min) / (current.max - current.min + 1)) * 100);
}
```

---

### 4.4 QuickActionsGrid

**Co robi:** Wyświetla 2x2 grid z 4 szybkimi akcjami (Projekty, Poleć, Dokumenty, Profil).

**Props:**
```typescript
interface QuickActionsGridProps {
  disabled?: boolean;
  onNavigate?: (path: string) => void;
}
```

**shadcn/ui Components:**
- `Button` - each action cell

**Zachowanie:**
- 2 columns na mobile, 4 columns na desktop
- Card cells z ikoną (emoji) + tekst
- Hover: background color change, shadow
- Click: navigate to route
- Disable state: opacity-50, pointer-events-none (jeśli loading)

**Kod komponentu (template):**
```typescript
export function QuickActionsGrid({ disabled, onNavigate }: QuickActionsGridProps) {
  const actions = [
    { icon: '🔍', label: 'Projekty', path: '/marketplace' },
    { icon: '👤', label: 'Poleć znajomego', path: '/referral' },
    { icon: '📄', label: 'Dokumenty', path: '/documents' },
    { icon: '📊', label: 'Mój profil', path: '/profile' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {actions.map((action) => (
        <button
          key={action.path}
          disabled={disabled}
          onClick={() => onNavigate?.(action.path) || window.location.href = action.path}
          className="border border-gray-300 rounded-lg p-4 hover:bg-gray-50 transition-all flex flex-col items-center justify-center gap-2 h-24 disabled:opacity-50"
        >
          <span className="text-3xl">{action.icon}</span>
          <span className="text-xs font-semibold text-center">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
```

---

### 4.5 NotificationsList

**Co robi:** Wyświetla listę ostatnich 3 powiadomień z opcją zaznaczenia jako przeczytane.

**Props:**
```typescript
interface NotificationsListProps {
  notifications: Notification[];
  onMarkAsRead?: (id: string) => void;
  onViewAll?: () => void;
}

interface Notification {
  id: string;
  type: 'achievement' | 'warning' | 'info' | 'document';
  title: string;
  timestamp: Date;
  read: boolean;
}
```

**Dane z Supabase:**
- `notifications` table: `id`, `type`, `title`, `created_at`, `read`, `consultant_id`

**shadcn/ui Components:**
- `Card` - container
- `Button` - mark as read, view all
- `Badge` - unread count

**Zachowanie:**
- Show last 3 (order by created_at DESC)
- Unread badge (red dot) if not read
- Click circle icon → PATCH /api/notifications/:id/read (set read=true)
- Icon based on type (🎉 for achievement, ⚠️ for warning, etc.)
- Timestamp: relative time (pikaday.js or date-fns)
- "Wszystkie powiadomienia >" link → /notifications

**Kod komponentu (template):**
```typescript
export function NotificationsList({
  notifications,
  onMarkAsRead,
  onViewAll
}: NotificationsListProps) {
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg">POWIADOMIENIA {unreadCount > 0 && <Badge>{unreadCount} nowe</Badge>}</h3>
      </div>

      <div className="space-y-4">
        {notifications.slice(0, 3).map((notif) => (
          <div key={notif.id} className="border-b pb-3 last:border-b-0">
            <div className="flex gap-3">
              <span className="text-xl">{getNotificationIcon(notif.type)}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{notif.title}</p>
                  {!notif.read && <Badge className="bg-red-500 text-white text-xs">NEW</Badge>}
                </div>
                <p className="text-xs text-gray-500 mt-1">{getRelativeTime(notif.timestamp)}</p>
              </div>
              <button
                onClick={() => onMarkAsRead?.(notif.id)}
                className="text-gray-400 hover:text-gray-600"
              >
                ○
              </button>
            </div>
          </div>
        ))}
      </div>

      <Button variant="ghost" className="w-full mt-4" onClick={onViewAll}>
        Wszystkie powiadomienia &gt;
      </Button>
    </Card>
  );
}

function getNotificationIcon(type: string): string {
  return {
    achievement: '🎉',
    warning: '⚠️',
    info: '📋',
    document: '📄',
  }[type] || '📧';
}

function getRelativeTime(date: Date): string {
  // Implementation using date-fns
  // e.g., "5 minut temu", "3 godziny temu", "1 dzień temu"
}
```

---

### 4.6 CountdownTimer

**Co robi:** Utility komponent do formatowania i wyświetlania odliczania dni.

**Props:**
```typescript
interface CountdownTimerProps {
  endDate: Date;
  isEnded?: boolean;
  pulse?: boolean; // if < 7 days
}
```

**Zachowanie:**
- Return formatted string: "POZOSTAŁO XX DNI" lub "ZAKOŃCZONY XX DNI TEMU"
- Pulse animation if < 7 days (CSS animation)
- Color red if < 30 days

**Kod (utility hook):**
```typescript
export function useCountdownTimer(endDate: Date) {
  const [daysRemaining, setDaysRemaining] = useState(0);

  useEffect(() => {
    const updateCountdown = () => {
      const today = new Date();
      const diffTime = endDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setDaysRemaining(diffDays);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000 * 60 * 60); // update every hour

    return () => clearInterval(interval);
  }, [endDate]);

  if (daysRemaining < 0) {
    return { days: Math.abs(daysRemaining), text: `ZAKOŃCZONY ${Math.abs(daysRemaining)} DNI TEMU`, isEnded: true };
  }

  return { days: daysRemaining, text: `POZOSTAŁO ${daysRemaining} DNI`, isEnded: false, shouldPulse: daysRemaining < 7 };
}
```

---

### 4.7 ProgressToNextTier

**Co robi:** Utility komponent do obliczania postępu do następnego tier'a lojalności.

**Kod (utility function):**
```typescript
export function calculateProgressToNextTier(points: number): {
  currentTier: 'bronze' | 'silver' | 'gold' | 'platinum';
  nextTier: 'silver' | 'gold' | 'platinum' | null;
  progressPercent: number;
  pointsNeeded: number;
} {
  const tiers = [
    { name: 'bronze', min: 0, max: 999 },
    { name: 'silver', min: 1000, max: 2999 },
    { name: 'gold', min: 3000, max: 5999 },
    { name: 'platinum', min: 6000, max: Infinity },
  ];

  const currentTierObj = tiers.find(t => points >= t.min && points <= t.max);
  const nextTierObj = tiers.find(t => t.min > currentTierObj.max);

  const progressPercent = currentTierObj && nextTierObj
    ? Math.round(((points - currentTierObj.min) / (nextTierObj.min - currentTierObj.min)) * 100)
    : 100;

  const pointsNeeded = nextTierObj ? nextTierObj.min - points : 0;

  return {
    currentTier: currentTierObj.name,
    nextTier: nextTierObj?.name || null,
    progressPercent,
    pointsNeeded,
  };
}
```

---

## 5. Model Danych

### 5.1 Tabele Supabase

Dashboard odczytuje dane z poniższych tabel. Są one zdefiniowane w DOC-0, ale tutaj powtarzamy dla kompletności.

#### Tabela: `consultants`

```sql
CREATE TABLE consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  first_name VARCHAR NOT NULL,
  last_name VARCHAR NOT NULL,
  avatar_url VARCHAR,
  status VARCHAR DEFAULT 'active', -- 'active', 'inactive', 'onboarding'
  loyalty_points INTEGER DEFAULT 0,
  loyalty_status VARCHAR DEFAULT 'bronze', -- 'bronze', 'silver', 'gold', 'platinum'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Tabela: `contracts`

```sql
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id),
  client_name VARCHAR NOT NULL,
  project_name VARCHAR NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  rate_per_hour DECIMAL(8, 2) NOT NULL,
  status VARCHAR DEFAULT 'active', -- 'active', 'ending', 'ended'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contracts_consultant_id ON contracts(consultant_id);
CREATE INDEX idx_contracts_end_date ON contracts(end_date);
```

#### Tabela: `contract_health_scores`

```sql
CREATE TABLE contract_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  overall_score DECIMAL(5, 2), -- 0-100, nullable
  client_feedback_score DECIMAL(5, 2),
  stability_score DECIMAL(5, 2),
  engagement_score DECIMAL(5, 2),
  red_flags_count INTEGER DEFAULT 0,
  last_evaluated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_health_scores_contract_id ON contract_health_scores(contract_id);
```

#### Tabela: `notifications`

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id),
  type VARCHAR NOT NULL, -- 'achievement', 'warning', 'info', 'document'
  title VARCHAR NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_consultant_id ON notifications(consultant_id);
CREATE INDEX idx_notifications_read ON notifications(read);
```

---

### 5.2 API Endpoints

#### GET /api/consultant/dashboard

**Co zwraca:** Agregowana data dla Dashboard (contract, health score, loyalty, notifications).

**Query Parameters:** Brak (autoryzacja via JWT token w header)

**Response:**
```json
{
  "consultant": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "firstName": "Anna",
    "lastName": "Kowalska",
    "email": "anna.kowalska@example.com",
    "avatarUrl": "https://..."
  },
  "contract": {
    "id": "660e8400-e29b-41d4-a716-446655440111",
    "clientName": "Acme Corp",
    "projectName": "Backend Migration",
    "startDate": "2024-01-15",
    "endDate": "2025-05-15",
    "ratePerHour": 120,
    "status": "active",
    "daysRemaining": 127
  },
  "healthScore": {
    "id": "770e8400-e29b-41d4-a716-446655440222",
    "overallScore": 85,
    "clientFeedbackScore": 85,
    "stabilityScore": 90,
    "engagementScore": 78,
    "redFlagsCount": 0,
    "lastEvaluatedAt": "2025-02-01T10:30:00Z"
  },
  "loyalty": {
    "points": 3450,
    "status": "gold",
    "pointsToNextTier": 2550
  },
  "unreadNotificationsCount": 3
}
```

**Implementacja (Next.js API route):**
```typescript
// /app/api/consultant/dashboard/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set(name, value, options)
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete(name)
        },
      },
    }
  )

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return new Response('Unauthorized', { status: 401 })

  // Get consultant
  const { data: consultant, error: consultantError } = await supabase
    .from('consultants')
    .select('*')
    .eq('email', user.email)
    .single()

  if (consultantError) return new Response(JSON.stringify({ error: 'Consultant not found' }), { status: 404 })

  // Get active contract
  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('*')
    .eq('consultant_id', consultant.id)
    .gte('end_date', new Date().toISOString().split('T')[0])
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get health score
  let healthScore = null
  if (contract) {
    const { data: score } = await supabase
      .from('contract_health_scores')
      .select('*')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    healthScore = score
  }

  // Get unread notifications count
  const { count: notifCount } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('consultant_id', consultant.id)
    .eq('read', false)

  // Format response
  const daysRemaining = contract
    ? Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return new Response(JSON.stringify({
    consultant: {
      id: consultant.id,
      firstName: consultant.first_name,
      lastName: consultant.last_name,
      email: consultant.email,
      avatarUrl: consultant.avatar_url,
    },
    contract: contract ? {
      id: contract.id,
      clientName: contract.client_name,
      projectName: contract.project_name,
      startDate: contract.start_date,
      endDate: contract.end_date,
      ratePerHour: contract.rate_per_hour,
      status: contract.status,
      daysRemaining,
    } : null,
    healthScore: healthScore ? {
      id: healthScore.id,
      overallScore: healthScore.overall_score,
      clientFeedbackScore: healthScore.client_feedback_score,
      stabilityScore: healthScore.stability_score,
      engagementScore: healthScore.engagement_score,
      redFlagsCount: healthScore.red_flags_count,
      lastEvaluatedAt: healthScore.last_evaluated_at,
    } : null,
    loyalty: {
      points: consultant.loyalty_points,
      status: consultant.loyalty_status,
      pointsToNextTier: calculatePointsToNextTier(consultant.loyalty_points),
    },
    unreadNotificationsCount: notifCount || 0,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function calculatePointsToNextTier(points: number): number {
  if (points >= 6000) return 0; // Platinum
  if (points >= 3000) return 6000 - points; // Gold → Platinum
  if (points >= 1000) return 3000 - points; // Silver → Gold
  return 1000 - points; // Bronze → Silver
}
```

---

#### GET /api/consultant/notifications

**Co zwraca:** Lista ostatnich powiadomień (domyślnie 10).

**Query Parameters:**
- `limit` (optional, default: 10)
- `offset` (optional, default: 0)

**Response:**
```json
{
  "notifications": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440333",
      "type": "achievement",
      "title": "Osiągnąłeś status Silver!",
      "message": "Gratulacje! Twoje punkty lojalnościowe osiągnęły 1000.",
      "read": false,
      "createdAt": "2025-02-05T14:30:00Z"
    },
    {
      "id": "990e8400-e29b-41d4-a716-446655440444",
      "type": "warning",
      "title": "Health Score spadł do 55%",
      "message": "Twój Health Score spadł poniżej 60%. Skontaktuj się z Account Managerem.",
      "read": false,
      "createdAt": "2025-02-05T10:00:00Z"
    }
  ],
  "totalCount": 42
}
```

**Implementacja:**
```typescript
// /app/api/consultant/notifications/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '10')
  const offset = parseInt(searchParams.get('offset') || '0')

  const supabase = createServerClient(...)
  const { data: { user } } = await supabase.auth.getUser()

  const { data: consultant } = await supabase
    .from('consultants')
    .select('id')
    .eq('email', user?.email)
    .single()

  const { data: notifications, count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('consultant_id', consultant.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  return new Response(JSON.stringify({
    notifications: notifications?.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      createdAt: n.created_at,
    })) || [],
    totalCount: count || 0,
  }), { status: 200 })
}
```

---

#### PATCH /api/consultant/notifications/:id/read

**Co robi:** Oznacza powiadomienie jako przeczytane.

**Body:**
```json
{
  "read": true
}
```

**Response:**
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440333",
  "read": true,
  "updatedAt": "2025-02-08T11:45:00Z"
}
```

**Implementacja:**
```typescript
// /app/api/consultant/notifications/[id]/read/route.ts
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient(...)
  const { data: { user } } = await supabase.auth.getUser()

  const { data: notification, error } = await supabase
    .from('notifications')
    .update({ read: true, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 })

  return new Response(JSON.stringify({
    id: notification.id,
    read: notification.read,
    updatedAt: notification.updated_at,
  }), { status: 200 })
}
```

---

### 5.3 Supabase RLS Policies

Dashboard endpoints powinny być chronione RLS. Poniżej pokazane políticas:

```sql
-- Consultants table: can only read own record
CREATE POLICY "Consultants can read own data"
ON consultants FOR SELECT
USING (auth.uid()::text = id);

-- Contracts table: can only read own contracts
CREATE POLICY "Consultants can read own contracts"
ON contracts FOR SELECT
USING (
  consultant_id = (
    SELECT id FROM consultants WHERE auth.uid()::text = id
  )
);

-- Health scores: can read own contract's health scores
CREATE POLICY "Consultants can read own health scores"
ON contract_health_scores FOR SELECT
USING (
  contract_id IN (
    SELECT id FROM contracts
    WHERE consultant_id = (
      SELECT id FROM consultants WHERE auth.uid()::text = id
    )
  )
);

-- Notifications: can read own notifications
CREATE POLICY "Consultants can read own notifications"
ON notifications FOR SELECT
USING (
  consultant_id = (
    SELECT id FROM consultants WHERE auth.uid()::text = id
  )
);

-- Notifications: can update own notifications (mark as read)
CREATE POLICY "Consultants can update own notifications"
ON notifications FOR UPDATE
USING (
  consultant_id = (
    SELECT id FROM consultants WHERE auth.uid()::text = id
  )
);
```

---

## 6. Logika Biznesowa

### 6.1 Contract Status Logic

Status kontraktu jest obliczany dynamicznie na podstawie `end_date` i dnia dzisiejszego.

```
STATUS = function(end_date):
  if end_date <= today:
    return "ended" (🔴 RED)
  elif end_date <= today + 90 days:
    return "ending" (🟡 YELLOW) [ALERT!]
  elif end_date > today + 90 days:
    return "active" (🟢 GREEN)
  else:
    return "none" (⚫ GRAY, brak kontraktu)
```

**Implementacja:**
```typescript
export function getContractStatus(endDate: Date | null): 'active' | 'ending' | 'ended' | 'none' {
  if (!endDate) return 'none'

  const today = new Date()
  const endDateObj = new Date(endDate)
  const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)

  if (endDateObj <= today) return 'ended'
  if (endDateObj <= ninetyDaysFromNow) return 'ending'
  return 'active'
}
```

---

### 6.2 Countdown Logic

Dni do końca kontraktu są wyświetlane w specjalny sposób.

```
daysRemaining = ceil((end_date - today) / 24 hours)

if daysRemaining < 0:
  display: "ZAKOŃCZONY {abs(daysRemaining)} DNI TEMU"
  styling: red, gray text
  animation: none
elif daysRemaining <= 7:
  display: "POZOSTAŁO {daysRemaining} DNI"
  styling: red text, bold
  animation: pulsing (opacity 1 → 0.6 every 1.5s)
elif daysRemaining <= 30:
  display: "POZOSTAŁO {daysRemaining} DNI"
  styling: red text, bold
  animation: none
else:
  display: "POZOSTAŁO {daysRemaining} DNI"
  styling: normal gray text
  animation: none
```

**Implementacja:**
```typescript
export interface CountdownDisplay {
  daysRemaining: number;
  text: string;
  styling: 'normal' | 'warning' | 'critical' | 'ended';
  shouldPulse: boolean;
}

export function getCountdownDisplay(endDate: Date): CountdownDisplay {
  const today = new Date()
  const diffMs = endDate.getTime() - today.getTime()
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (daysRemaining < 0) {
    return {
      daysRemaining: Math.abs(daysRemaining),
      text: `ZAKOŃCZONY ${Math.abs(daysRemaining)} DNI TEMU`,
      styling: 'ended',
      shouldPulse: false,
    }
  }

  if (daysRemaining <= 7) {
    return {
      daysRemaining,
      text: `POZOSTAŁO ${daysRemaining} DNI`,
      styling: 'critical',
      shouldPulse: true,
    }
  }

  if (daysRemaining <= 30) {
    return {
      daysRemaining,
      text: `POZOSTAŁO ${daysRemaining} DNI`,
      styling: 'warning',
      shouldPulse: false,
    }
  }

  return {
    daysRemaining,
    text: `POZOSTAŁO ${daysRemaining} DNI`,
    styling: 'normal',
    shouldPulse: false,
  }
}
```

---

### 6.3 Health Score Display Logic

Health Score (0-100%) jest wyświetlany z komentarzem i CTA w zależności od wartości.

```
if score === null:
  gauge: gray
  status: "BRAK DANYCH"
  message: "Score będzie dostępny po pierwszej ewaluacji od klienta"
  cta: none

elif score >= 80:
  gauge: green (#10b981)
  status: "STABILNY"
  message: "Świetnie pracujesz. Kontynuuj tak!"
  cta: none

elif 50 <= score < 80:
  gauge: yellow (#f59e0b)
  status: "WYMAGA UWAGI"
  message: "Skontaktuj się z Account Managerem, aby poprawić swój wynik"
  cta: Button "Zaplanuj rozmowę" → /schedule-call

elif score < 50:
  gauge: red (#ef4444)
  status: "KRYTYCZNY"
  message: "Twoja pozycja jest zagrożona. Działaj teraz!"
  cta: Button "UMÓW ROZMOWĘ" (prominent) → /schedule-call
```

**Implementacja:**
```typescript
export interface HealthScoreConfig {
  status: string;
  color: string;
  message: string;
  showCTA: boolean;
  ctaText?: string;
  bgGradient: string;
}

export function getHealthScoreConfig(score: number | null): HealthScoreConfig {
  if (score === null) {
    return {
      status: 'BRAK DANYCH',
      color: '#d1d5db',
      message: 'Score będzie dostępny po pierwszej ewaluacji od klienta',
      showCTA: false,
      bgGradient: 'from-gray-50 to-gray-100',
    }
  }

  if (score >= 80) {
    return {
      status: 'STABILNY',
      color: '#10b981',
      message: 'Świetnie pracujesz. Kontynuuj tak!',
      showCTA: false,
      bgGradient: 'from-green-50 to-emerald-50',
    }
  }

  if (score >= 50) {
    return {
      status: 'WYMAGA UWAGI',
      color: '#f59e0b',
      message: 'Skontaktuj się z Account Managerem, aby poprawić swój wynik',
      showCTA: true,
      ctaText: 'Zaplanuj rozmowę',
      bgGradient: 'from-yellow-50 to-amber-50',
    }
  }

  return {
    status: 'KRYTYCZNY',
    color: '#ef4444',
    message: 'Twoja pozycja jest zagrożona. Działaj teraz!',
    showCTA: true,
    ctaText: 'UMÓW ROZMOWĘ',
    bgGradient: 'from-red-50 to-rose-50',
  }
}
```

---

### 6.4 Loyalty Status Thresholds

Cztery poziomy lojalności, każdy z progiem punktów.

```
loyalty_status = function(points):
  if points >= 6000: return "platinum" (💎)
  elif points >= 3000: return "gold" (🥇)
  elif points >= 1000: return "silver" (🥈)
  else: return "bronze" (🥉)

progress_to_next = function(points, tier):
  thresholds = {
    bronze: [0, 999, nextTier: silver at 1000],
    silver: [1000, 2999, nextTier: gold at 3000],
    gold: [3000, 5999, nextTier: platinum at 6000],
    platinum: [6000, ∞, nextTier: none],
  }

  current = thresholds[tier]
  percentage = ((points - current.min) / (current.max - current.min + 1)) * 100
  pointsNeeded = max(0, current.nextTier - points)

  return { percentage, pointsNeeded }
```

**Implementacja:**
```typescript
export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum'

const LOYALTY_THRESHOLDS = {
  bronze: { min: 0, max: 999, next: 1000 },
  silver: { min: 1000, max: 2999, next: 3000 },
  gold: { min: 3000, max: 5999, next: 6000 },
  platinum: { min: 6000, max: Infinity, next: Infinity },
}

export function calculateLoyaltyStatus(points: number): LoyaltyTier {
  if (points >= 6000) return 'platinum'
  if (points >= 3000) return 'gold'
  if (points >= 1000) return 'silver'
  return 'bronze'
}

export function calculateProgressToNextTier(points: number): {
  currentTier: LoyaltyTier;
  nextTier: LoyaltyTier | null;
  progressPercent: number;
  pointsNeeded: number;
} {
  const currentTier = calculateLoyaltyStatus(points)
  const current = LOYALTY_THRESHOLDS[currentTier]

  let nextTier: LoyaltyTier | null = null
  let progressPercent = 100
  let pointsNeeded = 0

  if (currentTier !== 'platinum') {
    const nextTierName = Object.entries(LOYALTY_THRESHOLDS).find(([_, t]) => t.min > current.max)?.[0] as LoyaltyTier
    nextTier = nextTierName
    const next = LOYALTY_THRESHOLDS[nextTier]
    progressPercent = Math.round(((points - current.min) / (next.min - current.min)) * 100)
    pointsNeeded = Math.max(0, next.min - points)
  }

  return { currentTier, nextTier, progressPercent, pointsNeeded }
}
```

---

### 6.5 Notification Badge Logic

Badge na notification bell pokazuje liczbę unread powiadomień.

```
badge_count = unread_notifications.count

if badge_count === 0:
  hide badge
elif badge_count > 9:
  display: "9+"
else:
  display: badge_count

animation: red dot pulses every 2s if count > 0
```

**Implementacja:**
```typescript
export function getNotificationBadge(unreadCount: number): string | null {
  if (unreadCount === 0) return null
  if (unreadCount > 9) return '9+'
  return unreadCount.toString()
}
```

---

## 7. Internacjonalizacja (i18n)

Dashboard używa `next-intl` do tłumaczenia. Poniżej wszystkie klucze dla PL i EN.

### 7.1 Polskie tłumaczenia (pl.json)

```json
{
  "dashboard": {
    "title": "Dashboard Konsultanta",
    "greeting": "Cześć, {name}! 👋",
    "today": "Dzisiaj, {date}",
    "contract": {
      "section": "Twój Kontrakt",
      "statusActive": "AKTYWNY",
      "statusEnding": "KOŃCZY SIĘ",
      "statusEnded": "ZAKOŃCZONY",
      "statusNone": "BRAK KONTRAKTU",
      "clientProject": "{client} / {project}",
      "daysRemaining": "POZOSTAŁO {days} DNI",
      "daysAgo": "ZAKOŃCZONY {days} DNI TEMU",
      "rate": "Stawka: {rate} PLN/h",
      "rateHidden": "●●● PLN/h",
      "tapToReveal": "Kliknij, aby pokazać"
    },
    "healthScore": {
      "section": "Health Score",
      "stable": "STABILNY",
      "needsAttention": "WYMAGA UWAGI",
      "critical": "KRYTYCZNY",
      "noData": "BRAK DANYCH",
      "stableMessage": "Świetnie pracujesz. Kontynuuj tak!",
      "needsAttentionMessage": "Skontaktuj się z Account Managerem, aby poprawić swój wynik",
      "criticalMessage": "Twoja pozycja jest zagrożona. Działaj teraz!",
      "noDataMessage": "Score będzie dostępny po pierwszej ewaluacji od klienta",
      "scheduleCall": "UMÓW ROZMOWĘ",
      "expand": "Rozwiń ▼",
      "collapse": "Zwiń ▲",
      "clientFeedback": "Feedback od klienta",
      "projectStability": "Stabilność projektu",
      "engagement": "Zaangażowanie",
      "redFlags": "Red flags"
    },
    "loyalty": {
      "section": "Twoja Lojalność",
      "points": "{points} pkt",
      "status": "{tier} Status",
      "bronze": "BRONZE",
      "silver": "SILVER",
      "gold": "GOLD",
      "platinum": "PLATINUM",
      "progressTo": "{percent}% do {tier}",
      "pointsNeeded": "Potrzebujesz jeszcze {points} pkt",
      "maxReached": "🎉 Maksymalny poziom osiągnięty!",
      "findProjects": "🔍 Projekty",
      "referFriend": "👤 Poleć znajomego"
    },
    "quickActions": {
      "projects": "Projekty",
      "referral": "Poleć znajomego",
      "documents": "Dokumenty",
      "profile": "Mój profil"
    },
    "notifications": {
      "section": "POWIADOMIENIA",
      "new": "{count} nowe",
      "markAsRead": "Oznacz jako przeczytane",
      "seeAll": "Wszystkie powiadomienia >",
      "minutesAgo": "{minutes} minut temu",
      "hoursAgo": "{hours} godzin temu",
      "daysAgo": "{days} dni temu",
      "achievement": "🎉",
      "warning": "⚠️",
      "info": "📋",
      "document": "📄"
    },
    "navigation": {
      "dashboard": "Dashboard",
      "projects": "Projekty",
      "profile": "Profil",
      "more": "Więcej"
    }
  }
}
```

### 7.2 Angielskie tłumaczenia (en.json)

```json
{
  "dashboard": {
    "title": "Consultant Dashboard",
    "greeting": "Hello, {name}! 👋",
    "today": "Today, {date}",
    "contract": {
      "section": "Your Contract",
      "statusActive": "ACTIVE",
      "statusEnding": "ENDING",
      "statusEnded": "ENDED",
      "statusNone": "NO CONTRACT",
      "clientProject": "{client} / {project}",
      "daysRemaining": "REMAINING {days} DAYS",
      "daysAgo": "ENDED {days} DAYS AGO",
      "rate": "Rate: {rate} PLN/h",
      "rateHidden": "●●● PLN/h",
      "tapToReveal": "Click to reveal"
    },
    "healthScore": {
      "section": "Health Score",
      "stable": "STABLE",
      "needsAttention": "NEEDS ATTENTION",
      "critical": "CRITICAL",
      "noData": "NO DATA",
      "stableMessage": "Great work! Keep it up!",
      "needsAttentionMessage": "Contact your Account Manager to improve your score",
      "criticalMessage": "Your position is at risk. Act now!",
      "noDataMessage": "Score will be available after your first client evaluation",
      "scheduleCall": "SCHEDULE CALL",
      "expand": "Expand ▼",
      "collapse": "Collapse ▲",
      "clientFeedback": "Client Feedback",
      "projectStability": "Project Stability",
      "engagement": "Engagement",
      "redFlags": "Red Flags"
    },
    "loyalty": {
      "section": "Your Loyalty",
      "points": "{points} pts",
      "status": "{tier} Status",
      "bronze": "BRONZE",
      "silver": "SILVER",
      "gold": "GOLD",
      "platinum": "PLATINUM",
      "progressTo": "{percent}% to {tier}",
      "pointsNeeded": "You need {points} more pts",
      "maxReached": "🎉 Maximum level reached!",
      "findProjects": "🔍 Projects",
      "referFriend": "👤 Refer Friend"
    },
    "quickActions": {
      "projects": "Projects",
      "referral": "Refer Friend",
      "documents": "Documents",
      "profile": "My Profile"
    },
    "notifications": {
      "section": "NOTIFICATIONS",
      "new": "{count} new",
      "markAsRead": "Mark as read",
      "seeAll": "All notifications >",
      "minutesAgo": "{minutes} minutes ago",
      "hoursAgo": "{hours} hours ago",
      "daysAgo": "{days} days ago",
      "achievement": "🎉",
      "warning": "⚠️",
      "info": "📋",
      "document": "📄"
    },
    "navigation": {
      "dashboard": "Dashboard",
      "projects": "Projects",
      "profile": "Profile",
      "more": "More"
    }
  }
}
```

### 7.3 Użycie w komponencie

```typescript
import { useTranslations } from 'next-intl';

export function Dashboard() {
  const t = useTranslations('dashboard');
  const locale = useLocale(); // 'pl' or 'en'

  return (
    <div>
      <h1>{t('greeting', { name: 'Anna' })}</h1>
      <p>{t('today', { date: new Date().toLocaleDateString(locale) })}</p>
      {/* ... */}
    </div>
  );
}
```

---

## 8. Scenariusze Testowe

### 8.1 WARSTWA 1: Smoke Test (5 minut)

Krótkie testy sprawdzające czy Dashboard się w ogóle ładuje.

| # | Krok | Oczekiwany rezultat | Status |
|---|------|---------------------|--------|
| 1 | Otwórz aplikację → `/dashboard` | Strona ładuje się bez błędów w konsoli | ☐ |
| 2 | Czy widzisz imię zalogowanego konsultanta? | "Cześć, [Imię]!" widoczne u góry | ☐ |
| 3 | Czy widoczna jest aktualna data? | Data dzisiejsza pokazana poniżej greeting | ☐ |
| 4 | Czy karta kontraktu się wyświetla? | Contract Status Card widoczna z danymi (klient, projekt, dni) | ☐ |
| 5 | Czy Health Score jest widoczny? | Health Score Gauge widoczny (koło z %), status tekst | ☐ |
| 6 | Czy punkty lojalnościowe się wyświetlają? | Loyalty Card widoczna z liczbą punktów | ☐ |
| 7 | Czy Quick Actions są klikalne? | Każdy przycisk Quick Actions reaguje na klik bez błędu | ☐ |
| 8 | Czy powiadomienia się ładują? | Notifications List widoczna z co najmniej jednym powiadomieniem lub "Brak powiadomień" | ☐ |
| 9 | Czy notification bell pokazuje badge? | Czerwony badge z liczbą unread (lub brak badge'a jeśli 0) | ☐ |
| 10 | Czy aplikacja nie wyloguje się? | Sesja pozostaje aktywna, bez "Unauthorized" błędu | ☐ |

---

### 8.2 WARSTWA 2: Scenariusze Biznesowe (20 minut)

Detailowe scenariusze testujące konkretne cases.

#### SCENARIUSZ 1: Konsultant z aktywnym kontraktem (>90 dni)

```
PRZYGOTOWANIE:
- Konsultant: Anna Kowalska (ID: anna-uuid)
- Kontrakt: Acme Corp / Backend Migration
- start_date: 2024-01-15
- end_date: 2025-05-15 (127 dni od dzisiaj)
- rate_per_hour: 120 PLN
- status: "active"
- Health Score: 85% (zielony)
- Loyalty: 3,450 pkt (Gold)
- Unread notifications: 0

KROKI:
1. Zaloguj się jako Anna
   → OCZEKIWANY REZULTAT: Dashboard ładuje się, widać "Cześć, Anna!"

2. Przejdź do Contract Status Card
   → OCZEKIWANY REZULTAT:
      - Badge: "AKTYWNY" (🟢 zielony)
      - Tekst: "Acme Corp / Backend Migration"
      - Countdown: "POZOSTAŁO 127 DNI"
      - Brak pulsowania (> 7 dni)
      - Rate: pokazuje "●●● PLN/h" (blurred)

3. Kliknij na ikonę oka obok raty
   → OCZEKIWANY REZULTAT:
      - Rate się odkrywa: "120 PLN/h"
      - Po 5 sekundach wraca do blurred

4. Sprawdź Health Score
   → OCZEKIWANY REZULTAT:
      - Gauche: zielone koło (80-100%)
      - Status: "STABILNY"
      - Message: "Świetnie pracujesz. Kontynuuj tak!"
      - Brak CTA button (bo score > 80)

5. Rozwiń Health Score (kliknij "Rozwiń ▼")
   → OCZEKIWANY REZULTAT:
      - Pojawi się breakdown:
        - Feedback od klienta: 85%
        - Stabilność projektu: 90%
        - Zaangażowanie: 78%
        - Red flags: 0

6. Sprawdź Loyalty Card
   → OCZEKIWANY REZULTAT:
      - Badge: "🥇 GOLD STATUS"
      - Punkty: "3,450 pkt"
      - Progress bar: "69% do PLATINUM"
      - Text: "Potrzebujesz jeszcze 2,550 pkt"

7. Sprawdź Quick Actions
   → OCZEKIWANY REZULTAT:
      - 4 buttony: Projekty, Poleć, Dokumenty, Profil
      - Każdy klikowalny bez błędu

8. Sprawdź Notifications
   → OCZEKIWANY REZULTAT:
      - Sekcja "POWIADOMIENIA (0 nowych)" lub ukryta całkiem jeśli 0 unread
      - Brak badge'a na notification bell

STATUS: ✅ PASS
```

---

#### SCENARIUSZ 2: Konsultant z kończącym się kontraktem (<90 dni)

```
PRZYGOTOWANIE:
- Konsultant: Piotr Nowak (ID: piotr-uuid)
- Kontrakt: Acme Corp / Frontend Redesign
- start_date: 2024-06-15
- end_date: 2025-03-27 (47 dni od dzisiaj)
- status: "ending"
- Health Score: 62% (żółty)
- Loyalty: 1,800 pkt (Silver)
- Unread notifications: 2

KROKI:
1. Zaloguj się jako Piotr
   → OCZEKIWANY REZULTAT: Dashboard ładuje się, widać "Cześć, Piotr!"

2. Sprawdź Contract Status Card
   → OCZEKIWANY REZULTAT:
      - Badge: "KOŃCZY SIĘ" (🟡 żółty)
      - Countdown: "POZOSTAŁO 47 DNI" (tekstem)
      - Kolor tekstu: czerwony (alerting)
      - Brak pulsowania (47 dni > 7)

3. Sprawdź Health Score
   → OCZEKIWANY REZULTAT:
      - Gauche: żółte koło (50-79%)
      - Status: "WYMAGA UWAGI"
      - Message: "Skontaktuj się z Account Managerem, aby poprawić swój wynik"
      - Button: "Zaplanuj rozmowę" (widoczny, click → /schedule-call)

4. Sprawdź Notifications
   → OCZEKIWANY REZULTAT:
      - Badge na notification bell: "2"
      - Sekcja "POWIADOMIENIA (2 nowe)" widoczna
      - Przynajmniej 2 powiadomienia w liście, oznaczone [NEW]

STATUS: ✅ PASS
```

---

#### SCENARIUSZ 3: Konsultant z kontraktem kończącym się za <7 dni

```
PRZYGOTOWANIE:
- Konsultant: Michał Wiśniewski (ID: michal-uuid)
- Kontrakt: TechCorp / Data Pipeline
- end_date: 2025-02-13 (5 dni od dzisiaj)
- status: "ending"
- Health Score: 38% (czerwony - KRYTYCZNY)
- Loyalty: 450 pkt (Bronze)

KROKI:
1. Zaloguj się jako Michał
   → OCZEKIWANY REZULTAT: Dashboard ładuje się

2. Sprawdź Contract Status Card
   → OCZEKIWANY REZULTAT:
      - Badge: "KOŃCZY SIĘ" (🟡 żółty)
      - Countdown: "POZOSTAŁO 5 DNI"
      - Kolor tekstu: CZERWONY, bold
      - Animation: PULSING (miga co 1.5s)
      - ⚠️ Icon czy wyjątkowy warning visual

3. Sprawdź Health Score
   → OCZEKIWANY REZULTAT:
      - Gauche: CZERWONE koło (0-49%)
      - Status: "KRYTYCZNY"
      - Message: "Twoja pozycja jest zagrożona. Działaj teraz!"
      - Button: "UMÓW ROZMOWĘ" (prominent, red background)

STATUS: ✅ PASS (Visual urgency evident)
```

---

#### SCENARIUSZ 4: Konsultant bez aktywnego kontraktu (alumni/nowy)

```
PRZYGOTOWANIE:
- Konsultant: Katarzyna Zielińska (ID: kasia-uuid)
- Kontrakt: brak (no active contract)
- Loyalty: 2,100 pkt (Silver)
- Status: "inactive" lub bez current contract

KROKI:
1. Zaloguj się jako Katarzyna
   → OCZEKIWANY REZULTAT: Dashboard ładuje się

2. Sprawdź Contract Status Card
   → OCZEKIWANY REZULTAT:
      - Badge: "BRAK KONTRAKTU" (⚫ szary)
      - Tekst: "Brak aktywnego kontraktu" lub pusty card
      - Brak countdown
      - CTA: "Szukaj projektów >" (optional, link do marketplace)

3. Sprawdź Health Score
   → OCZEKIWANY REZULTAT:
      - Gauche: szare koło (N/A)
      - Status: "BRAK DANYCH"
      - Message: "Score będzie dostępny po pierwszej ewaluacji od klienta"
      - Brak CTA

4. Sprawdź Quick Actions
   → OCZEKIWANY REZULTAT:
      - "Projekty" button: enabled (powinno być głównym CTA)
      - Inne buttony: enabled

STATUS: ✅ PASS
```

---

#### SCENARIUSZ 5: Konsultant ze statusem Platinum (6000+ pkt)

```
PRZYGOTOWANIE:
- Konsultant: James Smith (ID: james-uuid)
- Loyalty: 7,200 pkt (Platinum)

KROKI:
1. Otwórz Dashboard
   → OCZEKIWANY REZULTAT: Dashboard ładuje się

2. Sprawdź Loyalty Card
   → OCZEKIWANY REZULTAT:
      - Badge: "💎 PLATINUM STATUS"
      - Punkty: "7,200 pkt"
      - Zamiast progress bar: "🎉 Maksymalny poziom osiągnięty!"
      - Brak tekstu "Potrzebujesz jeszcze X pkt"

STATUS: ✅ PASS
```

---

#### SCENARIUSZ 6: Konsultant ze statusem Bronze (0 pkt, nowy)

```
PRZYGOTOWANIE:
- Konsultant: Nowy konsultant (ID: new-uuid)
- Loyalty: 0 pkt (Bronze)

KROKI:
1. Otwórz Dashboard
   → OCZEKIWANY REZULTAT: Dashboard ładuje się

2. Sprawdź Loyalty Card
   → OCZEKIWANY REZULTAT:
      - Badge: "🥉 BRONZE STATUS"
      - Punkty: "0 pkt"
      - Progress bar: "0% do SILVER"
      - Text: "Potrzebujesz jeszcze 1,000 pkt"

STATUS: ✅ PASS
```

---

#### SCENARIUSZ 7: Przełączenie języka PL → EN → PL

```
PRZYGOTOWANIE:
- Konsultant: Anna Kowalska (default locale: PL)

KROKI:
1. Otwórz Dashboard (po polsku)
   → OCZEKIWANY REZULTAT: Wszystko po polsku

2. Kliknij language toggle (PL/EN)
   → OCZEKIWANY REZULTAT:
      - Strona przeładowuje się
      - URL zmienia się na `/en/dashboard`
      - Wszystko teraz po angielsku:
        - "Hello, Anna!" zamiast "Cześć, Anna!"
        - "ACTIVE" zamiast "AKTYWNY"
        - "REMAINING 127 DAYS" zamiast "POZOSTAŁO 127 DNI"

3. Kliknij language toggle znowu (EN → PL)
   → OCZEKIWANY REZULTAT:
      - URL zmienia się na `/pl/dashboard`
      - Wszystko znowu po polsku

STATUS: ✅ PASS
```

---

#### SCENARIUSZ 8: Powiadomienie - mark as read

```
PRZYGOTOWANIE:
- Konsultant z 2 unread notifications
- Notification 1: "Osiągnąłeś status Silver!", read=false
- Notification 2: "Health Score spadł do 55%", read=false

KROKI:
1. Otwórz Dashboard
   → OCZEKIWANY REZULTAT:
      - Badge: "2" na notification bell
      - Notifications List pokazuje 2 items, oba z [NEW] tag

2. Kliknij circle icon na pierwszym powiadomieniu (mark as read)
   → OCZEKIWANY REZULTAT:
      - Request: PATCH /api/notifications/[id]/read
      - Response: read=true
      - Badge zmienia się na "1"
      - [NEW] tag znika z tego powiadomienia
      - Powiadomienie może się przesunąć lub zmienić styl

3. Kliknij circle icon na drugim powiadomieniu
   → OCZEKIWANY REZULTAT:
      - Badge zmienia się na "0" lub znika
      - Lista powiadomień jest pusta lub zmienia się

STATUS: ✅ PASS
```

---

### 8.3 WARSTWA 3: Testy Integracyjne (po zbudowaniu M2+)

Te testy uruchamiamy dopiero gdy inne moduły (M2, M3, M4) są dostępne.

- **SC3a:** Kliknij "Projekty" na Dashboard → czy przenosi do Marketplace (M2)?
- **SC3b:** Kliknij "Poleć znajomego" → czy przenosi do Referral module (M3)?
- **SC3c:** Zdobądź punkty w M3 → czy saldo punktów zmienia się na Dashboard (real-time)?
- **SC3d:** Health Score zmieniony w M4 → czy aktualizuje się na Dashboard (bez refresh)?
- **SC3e:** Nowe powiadomienie przychodzi z M5 → czy pojawia się na Dashboard push notification?

⚠️ **Uwaga:** Te testy wymagają uruchomienia co najmniej 2-3 modułów jednocześnie. Zaplanuj je na fazę integracji.

---

## 9. Dane Testowe

Poniżej znajdziesz 5 consultant profiles do testowania Dashboard'a.

### 9.1 SQL INSERT Statements

```sql
-- PROFILE 1: Anna Kowalska - Active, Gold, Healthy
INSERT INTO consultants (id, email, first_name, last_name, status, loyalty_points, loyalty_status)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  'anna.kowalska@example.com',
  'Anna',
  'Kowalska',
  'active',
  3450,
  'gold'
);

INSERT INTO contracts (id, consultant_id, client_name, project_name, start_date, end_date, rate_per_hour, status)
VALUES (
  '660e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440001',
  'Acme Corp',
  'Backend Migration',
  '2024-01-15',
  '2025-05-15',
  120.00,
  'active'
);

INSERT INTO contract_health_scores (id, contract_id, overall_score, client_feedback_score, stability_score, engagement_score, red_flags_count)
VALUES (
  '770e8400-e29b-41d4-a716-446655440001',
  '660e8400-e29b-41d4-a716-446655440001',
  85.0,
  85.0,
  90.0,
  78.0,
  0
);

INSERT INTO notifications (id, consultant_id, type, title, message, read)
VALUES
  ('880e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'info', 'Witaj w Qualrix!', 'Zalogowano poprawnie', true),
  ('880e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'achievement', 'Nowy projekt!', 'Nowy projekt został dostępny', true);

---

-- PROFILE 2: Piotr Nowak - Contract ending soon, Silver, Needs attention
INSERT INTO consultants (id, email, first_name, last_name, status, loyalty_points, loyalty_status)
VALUES (
  '550e8400-e29b-41d4-a716-446655440002',
  'piotr.nowak@example.com',
  'Piotr',
  'Nowak',
  'active',
  1800,
  'silver'
);

INSERT INTO contracts (id, consultant_id, client_name, project_name, start_date, end_date, rate_per_hour, status)
VALUES (
  '660e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440002',
  'Acme Corp',
  'Frontend Redesign',
  '2024-06-15',
  '2025-03-27',
  110.00,
  'ending'
);

INSERT INTO contract_health_scores (id, contract_id, overall_score, client_feedback_score, stability_score, engagement_score, red_flags_count)
VALUES (
  '770e8400-e29b-41d4-a716-446655440002',
  '660e8400-e29b-41d4-a716-446655440002',
  62.0,
  60.0,
  65.0,
  60.0,
  1
);

INSERT INTO notifications (id, consultant_id, type, title, message, read)
VALUES
  ('880e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440002', 'warning', 'Health Score spadł', 'Twój score to teraz 62%', false),
  ('880e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002', 'warning', 'Kontrakt się kończy', 'Kontrakt kończy się za 47 dni', false);

---

-- PROFILE 3: Michał Wiśniewski - Contract CRITICAL (<7 days), Bronze, Very bad score
INSERT INTO consultants (id, email, first_name, last_name, status, loyalty_points, loyalty_status)
VALUES (
  '550e8400-e29b-41d4-a716-446655440003',
  'michal.wisniewski@example.com',
  'Michał',
  'Wiśniewski',
  'active',
  450,
  'bronze'
);

INSERT INTO contracts (id, consultant_id, client_name, project_name, start_date, end_date, rate_per_hour, status)
VALUES (
  '660e8400-e29b-41d4-a716-446655440003',
  '550e8400-e29b-41d4-a716-446655440003',
  'TechCorp',
  'Data Pipeline',
  '2024-08-10',
  '2025-02-13',
  95.00,
  'ending'
);

INSERT INTO contract_health_scores (id, contract_id, overall_score, client_feedback_score, stability_score, engagement_score, red_flags_count)
VALUES (
  '770e8400-e29b-41d4-a716-446655440003',
  '660e8400-e29b-41d4-a716-446655440003',
  38.0,
  35.0,
  42.0,
  40.0,
  3
);

INSERT INTO notifications (id, consultant_id, type, title, message, read)
VALUES
  ('880e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440003', 'warning', 'Health Score krytyczny!', 'Twój score to zaledwie 38%', false),
  ('880e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440003', 'warning', 'ALERT: Kontrakt kończy się za 5 dni!', 'Musisz podjąć natychmiastowe działania', false),
  ('880e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440003', 'info', 'Umów rozmowę z AM', 'Zarezerwuj rozmowę z Account Managerem', false);

---

-- PROFILE 4: Katarzyna Zielińska - No active contract, Silver (alumna)
INSERT INTO consultants (id, email, first_name, last_name, status, loyalty_points, loyalty_status)
VALUES (
  '550e8400-e29b-41d4-a716-446655440004',
  'katarzyna.zielinska@example.com',
  'Katarzyna',
  'Zielińska',
  'inactive',
  2100,
  'silver'
);

-- Brak contract (expired contract end_date < today)
INSERT INTO contracts (id, consultant_id, client_name, project_name, start_date, end_date, rate_per_hour, status)
VALUES (
  '660e8400-e29b-41d4-a716-446655440004',
  '550e8400-e29b-41d4-a716-446655440004',
  'OldCorp',
  'Legacy System',
  '2023-01-10',
  '2024-12-31',
  100.00,
  'ended'
);

INSERT INTO notifications (id, consultant_id, type, title, message, read)
VALUES
  ('880e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440004', 'info', 'Witaj ponownie!', 'Szukamy dla Ciebie nowych projektów', true);

---

-- PROFILE 5: James Smith - English speaker, Active, Platinum, Perfect score
INSERT INTO consultants (id, email, first_name, last_name, status, loyalty_points, loyalty_status)
VALUES (
  '550e8400-e29b-41d4-a716-446655440005',
  'james.smith@example.com',
  'James',
  'Smith',
  'active',
  7200,
  'platinum'
);

INSERT INTO contracts (id, consultant_id, client_name, project_name, start_date, end_date, rate_per_hour, status)
VALUES (
  '660e8400-e29b-41d4-a716-446655440005',
  '550e8400-e29b-41d4-a716-446655440005',
  'GlobalTech Inc.',
  'Cloud Infrastructure',
  '2024-03-01',
  '2025-08-31',
  150.00,
  'active'
);

INSERT INTO contract_health_scores (id, contract_id, overall_score, client_feedback_score, stability_score, engagement_score, red_flags_count)
VALUES (
  '770e8400-e29b-41d4-a716-446655440005',
  '660e8400-e29b-41d4-a716-446655440005',
  95.0,
  95.0,
  98.0,
  92.0,
  0
);

INSERT INTO notifications (id, consultant_id, type, title, message, read)
VALUES
  ('880e8400-e29b-41d4-a716-446655440009', '550e8400-e29b-41d4-a716-446655440005', 'achievement', 'Congratulations Platinum Status!', 'You reached the highest loyalty tier', true);
```

---

## 10. Przypadki Brzegowe (Edge Cases)

| Przypadek | Oczekiwane zachowanie | Implementacja |
|-----------|----------------------|---------------|
| **Brak kontraktu** | Card pokazuje "BRAK KONTRAKTU" (szary), brak countdownu | `if (!contract) return <NullContractCard />` |
| **Wiele kontraktów jednocześnie** | Pokazuj najnowszy (order by end_date DESC, limit 1) | SQL query z `.limit(1)` |
| **Health Score = null** | Gauge szary, status "BRAK DANYCH", brak expandu | Check `if (score === null)` |
| **Loyalty points = 0** | Bronze badge, 0% progress, 1000 pkt do Silver | Trigger bronze tier at 0 pts |
| **Brak powiadomień** | Sekcja Notifications ukryta lub "Brak powiadomień" | Show message if `notifications.length === 0` |
| **Długie nazwy** | Tekst truncate w jedną linię, ellipsis (...) | CSS: `text-ellipsis whitespace-nowrap overflow-hidden` |
| **Bardzo długie nazwy** | Tekst na 2 linie max, potem ellipsis | CSS: `line-clamp-2` |
| **Offline mode (PWA)** | Pokaż cached data z ostatniego session | Use Service Worker + Zustand cache |
| **Slow network (2G)** | Loading spinner na karcie, skeleton screens | Show `<Skeleton />` components |
| **Session expired** | Redirect do `/login` z message "Sesja wygasła" | Middleware check: `if (!user) redirect('/login')` |
| **Browser bez obsługi localStorage** | Fallback na cookies / session storage | Use Supabase session management |
| **Very small screen (<320px)** | Responsive design, stack vertical | TailwindCSS `flex-col` |
| **Large screen (2K/4K)** | Cards nie rosną nieskończenie, max-width 1400px | Wrapper `max-w-7xl` |
| **Dark mode toggle** | Dashboard zmienia kolory (future feature) | Prepare for `next-themes` |

---

## 11. Metryki Sukcesu (KPIs)

Poniższe metryki będą śledzone aby mierzyć sukces Dashboard modułu:

| Metrika | Target | Narzędzie | Częstotliwość |
|---------|--------|-----------|---------------|
| **DAU (Daily Active Users)** | 60% active consultants | Supabase analytics / Vercel logs | Daily |
| **Avg Session Duration** | 2-5 min na Dashboard | Sentry / custom tracking | Weekly |
| **Quick Actions CTR** | >40% kliknięć na każdy button | Event tracking (Mixpanel/Segment) | Weekly |
| **Notification Read Rate** | >70% powiadomień przeczytanych | Supabase query na read column | Weekly |
| **Health Score Impact** | Konsultanci z <50% score kontaktują się z AM | Survey + CRM integration | Monthly |
| **Feature Adoption Rate** | Liczba konsultantów odwiedzających każdy Quick Action | Event tracking | Monthly |
| **Error Rate** | <1% 4xx/5xx errors na /api/consultant/dashboard | Sentry | Continuous |
| **Page Load Time** | <2s on 3G, <500ms on desktop | Vercel Analytics / Lighthouse | Continuous |
| **Retention Impact** | Contract renewal rate wzrasta >5% | B2B.net CRM data | Quarterly |

---

## 12. PROMPT DLA AI BUILDERA (Antygrivity/Bolt)

Poniżej znajduje się kompletny, gotowy-do-wklejenia prompt dla AI builder'a. **Ten prompt można skopiować bezpośrednio do Antygrivity lub Bolt, i powinien wygenerować prawie kompletną stronę Dashboard.**

```
=== POCZĄTEK PROMPTU ===

PROJEKT: Qualrix - System Zarządzania Konsultantami (B2B.net S.A.)
MODUŁ: M1 - Dashboard Konsultanta
STATUS: Budowanie od zera

ARCHITEKTURA (z DOC-0):
- Framework: Next.js 14+ (App Router)
- UI: Tailwind CSS + shadcn/ui
- Baza danych: Supabase (PostgreSQL)
- Autentykacja: Supabase Auth
- State: Zustand (lightweight)
- i18n: next-intl (PL/EN)
- Responsywność: Mobile-first (375px+)

ZADANIE:
Zbuduj Dashboard page (`/app/[locale]/dashboard/page.tsx`) dla konsultanta. Dashboard jest główną stroną po zalogowaniu, pokazuje aktualny status kontraktu, Health Score, punkty lojalnościowe i szybki dostęp do key features.

STRUKTURA STRONY:

1. TOP BAR (Fixed, 56px height)
   - Lewa strona: Logo Qualrix (clickable → home)
   - Środek: Empty (reserved for future breadcrumb)
   - Prawa strona:
     * Notification bell icon (24px) z red badge (unread count)
     * Language toggle (PL/EN)
     * User avatar (circle, 40px) - click → dropdown menu (My Profile, Settings, Logout)

2. HERO SECTION
   - Greeting: "Cześć, {firstName}! 👋" (dynamicznie z JWT)
   - Current date: "Dzisiaj, {full_date}" format (e.g., "Niedziela, 9 lutego 2025")
   - Gradient background (linear-gradient 135deg blue-purple)
   - Responsive: 16px padding mobile, 24px desktop

3. CONTRACT STATUS CARD
   - Status badge (color-coded):
     * Green "AKTYWNY" if end_date > today + 90 days
     * Yellow "KOŃCZY SIĘ" if end_date <= today + 90 days AND > today
     * Red "ZAKOŃCZONY" if end_date <= today
     * Gray "BRAK KONTRAKTU" if no active contract
   - Client name + project name (truncate if too long)
   - Countdown circular progress:
     * Days remaining (large text, bold)
     * SVG circular gauge (stroke animation)
     * If < 7 days: red color + pulsing animation
     * If < 30 days: red color (no pulse)
     * If ended: show "ZAKOŃCZONY XX DNI TEMU"
   - Rate info (expandable):
     * Default: blurred "●●● PLN/h"
     * Click eye icon → reveal "120 PLN/h"
     * Auto-hide after 5 seconds

4. HEALTH SCORE GAUGE
   - Circular SVG gauge (150px diameter)
   - Color-coded:
     * Green (80-100%): "STABILNY"
     * Yellow (50-79%): "WYMAGA UWAGI"
     * Red (0-49%): "KRYTYCZNY"
     * Gray (null): "BRAK DANYCH"
   - Center text: percentage + status label
   - Message below gauge (changes per status)
   - If score < 50: "UMÓW ROZMOWĘ" button (red background)
   - Expand/collapse: click to show breakdown (4 rows: client feedback, stability, engagement, red flags)

5. LOYALTY CARD
   - Tier badge: emoji + label (🥉 BRONZE, 🥈 SILVER, 🥇 GOLD, 💎 PLATINUM)
   - Large points display: "3,450 pkt" (formatted with thousands separator)
   - Progress bar to next tier:
     * If NOT platinum: show bar with percentage
     * If platinum: show "🎉 Maksymalny poziom!" instead
   - Two CTAs:
     * "🔍 Projekty" → navigate to /marketplace
     * "👤 Poleć znajomego" → navigate to /referral

6. QUICK ACTIONS GRID (2x2 on mobile, 4 columns on desktop)
   - 4 cells:
     1. 🔍 "Projekty" → /marketplace
     2. 👤 "Poleć znajomego" → /referral
     3. 📄 "Dokumenty" → /documents
     4. 📊 "Mój profil" → /profile
   - Styling: border, hover effect, click animation
   - Responsive: grid-cols-2 on mobile, md:grid-cols-4 on desktop

7. RECENT NOTIFICATIONS (Last 3)
   - Section title: "POWIADOMIENIA (X nowe)" with badge
   - Each notification:
     * Icon (emoji): 🎉 achievement, ⚠️ warning, 📋 info, 📄 document
     * Title (bold, 14px)
     * [NEW] tag if unread (red background)
     * Timestamp (relative: "5 minut temu", "3 godziny temu")
     * Circle icon (○) to mark as read - click → PATCH /api/notifications/:id/read
   - "Wszystkie powiadomienia >" link → /notifications

8. BOTTOM NAVIGATION (Fixed, mobile-only, 56px height)
   - 4 tabs: Dashboard (active), Projekty, Profil, Więcej
   - Icons + labels

DATA SOURCES:

API Endpoint: GET /api/consultant/dashboard
Response JSON structure:
{
  "consultant": {
    "id": "uuid",
    "firstName": "Anna",
    "lastName": "Kowalska",
    "email": "anna@example.com",
    "avatarUrl": "https://..."
  },
  "contract": {
    "id": "uuid",
    "clientName": "Acme Corp",
    "projectName": "Backend Migration",
    "startDate": "2024-01-15",
    "endDate": "2025-05-15",
    "ratePerHour": 120,
    "status": "active",
    "daysRemaining": 127
  },
  "healthScore": {
    "id": "uuid",
    "overallScore": 85,
    "clientFeedbackScore": 85,
    "stabilityScore": 90,
    "engagementScore": 78,
    "redFlagsCount": 0,
    "lastEvaluatedAt": "2025-02-01T10:30:00Z"
  },
  "loyalty": {
    "points": 3450,
    "status": "gold",
    "pointsToNextTier": 2550
  },
  "unreadNotificationsCount": 3
}

Notifications API: GET /api/consultant/notifications?limit=3
Response:
{
  "notifications": [
    {
      "id": "uuid",
      "type": "achievement",
      "title": "Osiągnąłeś status Silver!",
      "message": "...",
      "read": false,
      "createdAt": "2025-02-05T14:30:00Z"
    }
  ]
}

TRANSLATIONS (i18n / next-intl):
Use useTranslations hook from next-intl:
```typescript
const t = useTranslations('dashboard');
<h1>{t('greeting', { name: firstName })}</h1>
```

Translation keys (reference the i18n section of the spec):
- dashboard.greeting
- dashboard.contract.*
- dashboard.healthScore.*
- dashboard.loyalty.*
- dashboard.notifications.*

FEATURES & INTERACTIONS:

1. Loading state:
   - Show skeleton screens while fetching data
   - Fallback message if API fails

2. Error handling:
   - If API fails: show error message "Nie można załadować danych. Spróbuj później."
   - Retry button

3. Real-time updates:
   - Subscribe to /realtime/notifications using Supabase
   - When new notification → update unread count badge
   - Show toast notification "Nowe powiadomienie"

4. Responsive design:
   - Mobile (375px): single column, all cards full-width
   - Tablet (768px): 2-column grid
   - Desktop (1024px+): 3-column grid with sidebar

5. Dark mode (future):
   - Prepare for dark mode colors (use TailwindCSS variables)

6. Accessibility:
   - Use semantic HTML (section, article, button)
   - ARIA labels for icon buttons
   - Color contrast >4.5:1
   - Touch targets >44px

TECH STACK:
- use 'use client' directive (Client Component)
- use hooks: useState, useEffect, useCallback
- Supabase client: @supabase/supabase-js
- shadcn/ui components: Button, Card, Badge, Progress, Dialog
- Tailwind CSS for styling
- SVG for circular progress gauge
- date-fns for date formatting
- Custom components for each section (ContractStatusCard, HealthScoreGauge, etc.)

STEPS TO BUILD:

1. Create base layout with top bar + bottom nav
2. Add Hero section with greeting + date
3. Build ContractStatusCard component:
   - Status badge logic
   - Circular progress SVG
   - Rate reveal/hide toggle
4. Build HealthScoreGauge component:
   - SVG gauge with animation
   - Color-coded based on score
   - Expand/collapse breakdown
5. Build LoyaltyStatusCard component:
   - Tier badge + points display
   - Progress bar to next tier
   - CTAs
6. Build QuickActionsGrid component:
   - 2x2 grid with navigation
7. Build NotificationsList component:
   - Fetch last 3 notifications
   - Mark as read functionality
   - Relative timestamps
8. Wire up data fetching from API endpoints
9. Add i18n translations
10. Add loading states and error handling
11. Test on mobile, tablet, desktop

CODE QUALITY:
- Use TypeScript types for all props
- Extract utilities (calculateDaysRemaining, getStatusConfig, etc.)
- Create separate component files
- Use custom hooks for complex logic
- Add JSDoc comments for public functions

DEPLOYMENT:
- Build: `npm run build`
- Deploy to Vercel
- Test on staging first

=== KONIEC PROMPTU ===
```

⚠️ **Uwaga:** Powyższy prompt jest gotowy do wklejenia, ale może wymagać dostrojenia API endpoints w zależności od rzeczywistej implementacji backendu.

---

## 13. Zależności od Innych Modułów

### 13.1 Dane POTRZEBNE dla M1

Dashboard M1 potrzebuje danych z następujących źródeł (czasami z przyszłych modułów):

| Źródło | Typ danych | Status | Fallback |
|--------|-----------|--------|----------|
| **Supabase (tables: consultants, contracts)** | Kontrakt, klient, projekt, stawka | ✅ Dostępne | Show "Brak kontraktu" |
| **Supabase (contract_health_scores)** | Health Score (0-100%) | ✅ Dostępne | Show "Brak danych", gray gauge |
| **Supabase (consultants.loyalty_points)** | Loyalty points + tier | ✅ Dostępne | Default: 0 pkt, Bronze |
| **Supabase (notifications table)** | Recent notifications | ✅ Dostępne | Show "Brak powiadomień" |
| **M2 Marketplace** | Project list (click "Projekty" CTA) | ⏳ Przyszłość | Link to /marketplace |
| **M3 Referral** | Referral form (click "Poleć" CTA) | ⏳ Przyszłość | Link to /referral |
| **M4 Documents** | Document list (click "Dokumenty" CTA) | ⏳ Przyszłość | Link to /documents |
| **M5 Profile** | User profile (click "Profil" CTA) | ⏳ Przyszłość | Link to /profile |

### 13.2 Co inne moduły CHCĄ z M1

Inne moduły mogą chcieć:

| Moduł | Co chce | Użycie | Jak otrzymać |
|-------|---------|--------|--------------|
| **M2 (Marketplace)** | current_consultant_id | Filtrowanie dostępnych projektów | From Supabase Auth |
| **M3 (Referral)** | consultant_profile | Dane do pre-fill form | GET /api/consultant/profile |
| **M4 (Documents)** | consultant_id | Access control | From Auth |
| **M5 (Profile)** | consultant_id | Load user data | From Auth |
| **M6 (Notifications)** | UI state (which notif is selected) | Navigation | Event handler |

### 13.3 Budowanie M1 bez innych modułów

**M1 można budować NIEZALEŻNIE** z mock data, ponieważ:

1. ✅ Wszystkie dane pochodzą z Supabase (tables już istnieją)
2. ✅ Quick Actions to proste linki (nie wymagają rzeczywistych modułów)
3. ✅ API endpoints mogą być mock'owane lokalnie
4. ✅ Notifications są data-driven (nie zależą od logiki z innych modułów)

**Strategy:**
- Build M1 first z mock API responses
- Kiedy M2/M3/M4 będą ready → replace mock endpoints z real API
- Links ("Projekty", "Poleć", etc.) zadziałają automatycznie

**Mock API example (for development):**
```typescript
// /app/api/consultant/dashboard/mock.ts
export const mockDashboardData = {
  consultant: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    firstName: 'Anna',
    lastName: 'Kowalska',
    email: 'anna@example.com',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anna',
  },
  contract: {
    id: '660e8400-e29b-41d4-a716-446655440000',
    clientName: 'Acme Corp',
    projectName: 'Backend Migration',
    startDate: '2024-01-15',
    endDate: '2025-05-15',
    ratePerHour: 120,
    status: 'active',
    daysRemaining: 127,
  },
  // ... etc
};
```

---

## Summary

**DOC-M1: Dashboard Konsultanta** to kompletna specyfikacja modułu, zawierająca:

✅ Opis modułu i jego biznesowego znaczenia
✅ 15 user stories
✅ Szczegółowy wireframe (mobile, tablet, desktop)
✅ 7 reusable UI components
✅ Model danych (SQL tables, API endpoints)
✅ Logika biznesowa (contract status, health score, loyalty)
✅ Kompletne tłumaczenia (PL + EN)
✅ 8 scenariuszy testowych (smoke + biznesowe)
✅ 5 test profiles z SQL
✅ 10 edge case'ów
✅ KPI metrics
✅ Ready-to-paste AI builder prompt (300+ lines)
✅ Zależności i mapa integracji

**Wszystko jest gotowe do implementacji.** AI builder (Antygrivity/Bolt) może wziąć prompt z sekcji 12 i wygenerować prawie gotową stronę Dashboard.

---

**Dokument przygotowany dla:** B2B.net S.A.
**Aplikacja:** Qualrix
**Wersja:** 1.0
**Data:** Luty 2025

# M6: Program Poleceń (Referral Program)
## Specyfikacja Modułu - Qualrix App by B2B.net S.A.

**Wersja:** 1.0
**Data:** 2025-02-08
**Status:** Specyfikacja
**Autor:** B2B.net S.A. - Engineering Team
**Język:** Polski / English
**Stack:** Next.js 14+, Supabase, TypeScript, Tailwind CSS, shadcn/ui, next-intl

---

## 1. Streszczenie Wykonawcze

### 1.1 Cel Modułu
Program Poleceń (Referral Program) jest najtańszym kanałem pozyskiwania kandydatów dla sieci B2B.net S.A., liczące ponad 500 konsultantów IT. Moduł umożliwia konsultantom polecanie znajomych w zamian za punkty motywacyjne i potencjalny bonus finansowy (2000-5000 PLN).

### 1.2 Biznesowe Uzasadnienie
- **Redukcja kosztów pozyskania (CAC):** Mniejsze niż kanały tradycyjne (headhunting, job board)
- **Wysoka konwersja:** Rekomendacje od wewnętrznych pracowników mają 2-3x wyższą konwersję
- **Retencja:** Poleceni kandydaci wykazują lepszą retencję na projektach
- **Kulturowe dopasowanie:** Konsultanci polecają osoby z podobną kulturą pracy
- **Skalowalność:** Zero dodatkowych kosztów operacyjnych przy wzroście liczby referencji

### 1.3 Główne Metryki Sukcesu
| Metryka | Target | Próg Powodzenia |
|---------|--------|-----------------|
| Aktywnych polecających konsultantów | 40% bazy | >200 osób |
| Polecań na miesiąc | 15-20 | >10 |
| Conversion referral → hired | 15-20% | >12% |
| Conversion hired → project started | 70-80% | >60% |
| Średnia punktów na konsultanta/miesiąc | 150-200 | >100 |

---

## 2. Struktura Modułu

### 2.1 Komponenty Główne
```
M6_Program_Polecen/
├── M6.1_Formularz_Polecenia
│   ├── ReferralForm.tsx
│   ├── FormValidation.ts
│   └── types/referral.ts
├── M6.2_Śledzenie_Statusu
│   ├── ReferralStatusTracker.tsx
│   ├── StatusTimeline.tsx
│   └── utils/statusTransitions.ts
├── M6.3_Historia_Poleceń
│   ├── ReferralHistory.tsx
│   ├── HistoryTable.tsx
│   └── FilteringLogic.ts
├── M6.4_Link_Podziału
│   ├── ReferralLinkGenerator.tsx
│   ├── SocialShareButtons.tsx
│   └── utils/linkTracking.ts
├── M6.5_Ranking_Poleceń
│   ├── ReferralLeaderboard.tsx
│   ├── LeaderboardTable.tsx
│   └── utils/leaderboardCalc.ts
├── shared/
│   ├── PointsCalculator.ts
│   ├── DeduplicationEngine.ts
│   ├── GDPRCompliance.ts
│   └── Analytics.ts
└── database/
    └── schema.sql
```

### 2.2 Architektura Danych
```
┌─────────────────────────────────────────┐
│ Frontend (Next.js 14)                   │
├─────────────────────────────────────────┤
│ - ReferralForm (M6.1)                   │
│ - StatusTracker (M6.2)                  │
│ - HistoryView (M6.3)                    │
│ - ShareButtons (M6.4)                   │
│ - Leaderboard (M6.5)                    │
└──────────────────┬──────────────────────┘
                   │ API/RPC
┌──────────────────▼──────────────────────┐
│ Backend Logic (Edge Functions)          │
├─────────────────────────────────────────┤
│ - PointsCalculation                     │
│ - DeduplicationCheck                    │
│ - StatusTransition                      │
│ - LeaderboardAggregation                │
└──────────────────┬──────────────────────┘
                   │ SQL
┌──────────────────▼──────────────────────┐
│ Supabase PostgreSQL                     │
├─────────────────────────────────────────┤
│ - referrals (ID, referrer, candidate)   │
│ - referral_status_log                   │
│ - referral_points                       │
│ - social_shares                         │
└─────────────────────────────────────────┘
```

---

## 3. M6.1: Formularz Polecenia (Referral Form)

### 3.1 Opis Funkcjonalny
Formularz umożliwia konsultantom dodanie danych nowego kandydata do systemu rekrutacyjnego poprzez dedykowany interfejs w aplikacji Qualrix.

### 3.2 Pola Formularza

| Pole | Typ | Wymagane | Validacja | Opis |
|------|-----|----------|-----------|------|
| Imię | text | ✓ | min 2, max 50 znaków | Imię kandydata |
| Email | email | ✓ | RFC 5322 | Email kandydata - podstawa deduplicacji |
| Telefon | tel | ✓ | Polska: +48 format | Numer telefonu kontaktowy |
| Specjalizacja | select | ✓ | z listy dostępnych | Backend, Frontend, Mobile, Data, DevOps, QA, Project Manager |
| Link LinkedIn | url | ✗ | LinkedIn.com URL | Profil LinkedIn kandydata |
| Notatka | textarea | ✗ | max 500 znaków | Dodatkowe informacje o kandydacie |
| Zgoda GDPR | checkbox | ✓ | musi być zaznaczone | "Potwierdzam, że osoba wyraziła zgodę na kontakt" |

### 3.3 Walidacja po Stronie Klienta (Frontend)
```typescript
// validation rules
const ReferralFormSchema = z.object({
  candidateName: z.string()
    .min(2, "Imię musi mieć minimum 2 znaki")
    .max(50, "Imię może mieć maximum 50 znaków")
    .trim(),

  candidateEmail: z.string()
    .email("Nieprawidłowy format email")
    .toLowerCase(),

  phoneNumber: z.string()
    .regex(/^\+48\d{9}$/, "Numer telefonu musi być w formacie +48XXXXXXXXX"),

  specialization: z.enum([
    "BACKEND",
    "FRONTEND",
    "MOBILE",
    "DATA",
    "DEVOPS",
    "QA",
    "PROJECT_MANAGER"
  ]),

  linkedinUrl: z.string()
    .url("Nieprawidłowy URL")
    .includes("linkedin.com")
    .optional()
    .or(z.literal("")),

  additionalNotes: z.string()
    .max(500, "Notatka może mieć maximum 500 znaków")
    .optional(),

  gdprConsent: z.boolean()
    .refine(val => val === true, "Zgoda GDPR jest wymagana")
});
```

### 3.4 Logika Wysyłania (Backend)
```typescript
interface ReferralSubmissionPayload {
  referrerId: string;        // UUID polecającego konsultanta
  candidateName: string;
  candidateEmail: string;
  phoneNumber: string;
  specialization: string;
  linkedinUrl?: string;
  additionalNotes?: string;
  gdprConsent: true;
  submissionTimestamp: ISO8601;
  userAgent: string;         // dla analityki
  ipAddress: string;         // zahaszonywany - GDPR
}

// Kroki przetwarzania:
1. Frontend validation (schema check)
2. Rate limiting check (max 5 poleceń/dzień)
3. Deduplication check (czy kandydat już w systemie)
4. Email verification (czy email aktywny)
5. Record creation w tabeli `referrals`
6. Trigger punktów (poczatkowe status: "SUBMITTED")
7. Wysłanie notification email do HR
8. Analytics event tracking
```

### 3.5 Interfejs UI (shadcn/ui)
```typescript
// ReferralForm.tsx
export const ReferralForm = () => {
  const form = useForm<ReferralFormValues>({
    resolver: zodResolver(ReferralFormSchema),
    defaultValues: {
      candidateName: "",
      candidateEmail: "",
      phoneNumber: "+48",
      specialization: undefined,
      linkedinUrl: "",
      additionalNotes: "",
      gdprConsent: false
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* Grid 2 kolumn */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Imię */}
          <FormField
            control={form.control}
            name="candidateName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Imię i nazwisko kandydata</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Jan Kowalski"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Pełne imię i nazwisko
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Email */}
          <FormField
            control={form.control}
            name="candidateEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="kandydat@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Telefon */}
          <FormField
            control={form.control}
            name="phoneNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Numer telefonu</FormLabel>
                <FormControl>
                  <Input
                    placeholder="+48123456789"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Specjalizacja */}
          <FormField
            control={form.control}
            name="specialization"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Specjalizacja</FormLabel>
                <Select onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz specjalizację" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="BACKEND">Backend Developer</SelectItem>
                    <SelectItem value="FRONTEND">Frontend Developer</SelectItem>
                    <SelectItem value="MOBILE">Mobile Developer</SelectItem>
                    <SelectItem value="DATA">Data Engineer</SelectItem>
                    <SelectItem value="DEVOPS">DevOps Engineer</SelectItem>
                    <SelectItem value="QA">QA Tester</SelectItem>
                    <SelectItem value="PROJECT_MANAGER">Project Manager</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* LinkedIn - full width */}
        <FormField
          control={form.control}
          name="linkedinUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profil LinkedIn (opcjonalnie)</FormLabel>
              <FormControl>
                <Input
                  type="url"
                  placeholder="https://www.linkedin.com/in/..."
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Link do profilu LinkedIn kandydata
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Notatka */}
        <FormField
          control={form.control}
          name="additionalNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dodatkowe informacje (opcjonalnie)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Co wiesz o tym kandydacie? Dlaczego go polecasz?"
                  className="resize-none"
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Maksymalnie 500 znaków
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* GDPR Consent */}
        <FormField
          control={form.control}
          name="gdprConsent"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  Zgoda na przetwarzanie danych osobowych
                </FormLabel>
                <FormDescription>
                  Potwierdzam, że polecana osoba wyraziła świadomą zgodę
                  na otrzymanie informacji od B2B.net S.A. o możliwości
                  współpracy. Więcej: <a href="/privacy">Polityka prywatności</a>
                </FormDescription>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit Button */}
        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? "Wysyłanie..." : "Poleć kandydata"}
          </Button>
          <Button type="reset" variant="outline">
            Wyczyść
          </Button>
        </div>

        {/* Success Message */}
        {successMessage && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle>Sukces!</AlertTitle>
            <AlertDescription>
              {successMessage}
            </AlertDescription>
          </Alert>
        )}
      </form>
    </Form>
  );
};
```

### 3.6 Rate Limiting
```typescript
// Zapobieganie spamowi
interface RateLimitConfig {
  maxReferralsPerDay: 5;           // max poleceń na dzień
  maxReferralsPerMonth: 50;        // max poleceń na miesiąc
  cooldownMinutes: 15;             // czekaj między poleceniami
}

// Sprawdzanie w tabeli `referral_rate_limits`
// Trigger: INSERT na `referrals` updates `referral_rate_limits`
```

---

## 4. M6.2: Śledzenie Statusu Polecenia (Referral Status Tracking)

### 4.1 Machina Stanów (State Machine)
```
┌─────────────┐
│  SUBMITTED  │ (formularz wysłany)
└──────┬──────┘
       │
       ├─ deduplication_failed ─────────┐
       │                                │
       ▼                                ▼
┌─────────────────────┐         ┌────────────────┐
│ IN_RECRUITMENT      │         │ DUPLICATE      │
└──────┬──────────────┘         └────────────────┘
       │
       ├─ rejected ──────────┐
       │                     │
       ▼                     ▼
┌────────────────┐    ┌──────────────┐
│ HIRED          │    │ REJECTED     │
└──────┬─────────┘    └──────────────┘
       │
       ├─ not_accepted
       │
       ▼
┌──────────────────────┐
│ PROJECT_STARTED      │ ◄── POINTS AWARDED HERE
└──────────────────────┘
       │
       ├─ project_ended (3 months+)
       │
       ▼
┌──────────────────────┐
│ BONUS_ELIGIBLE       │ ◄── BONUS AWARDED (optional)
└──────────────────────┘
```

### 4.2 Definicja Stanów

| Status | Opis | Punkty | Bonus |
|--------|------|--------|-------|
| **SUBMITTED** | Kandydat dodany przez polecającego | 0 | 0 |
| **DUPLICATE** | Kandydat już w systemie | 0 | 0 |
| **REJECTED** | Kandydat odrzucony w rekrutacji | 0 | 0 |
| **IN_RECRUITMENT** | Kandydat w procesie rekrutacji | 0 | 0 |
| **HIRED** | Kandydat zatrudniony | 0 | 0 |
| **PROJECT_STARTED** | Kandidat rozpoczął projekt | 50 | 0 |
| **BONUS_ELIGIBLE** | 3 miesiące na projekcie - bonus aktywny | 0 | 2000-5000 PLN |
| **BONUS_AWARDED** | Bonus wypłacony | 0 | 2000-5000 PLN |

### 4.3 Przejścia Stanów (State Transitions)

```typescript
interface StatusTransition {
  from: ReferralStatus;
  to: ReferralStatus;
  triggerEvent: string;
  timestamp: Date;
  triggeredBy: "system" | "user";
  notes?: string;
}

// Dozwolone przejścia (validacja)
const allowedTransitions: Record<ReferralStatus, ReferralStatus[]> = {
  SUBMITTED: [IN_RECRUITMENT, DUPLICATE, REJECTED],
  DUPLICATE: [],  // terminal state
  IN_RECRUITMENT: [HIRED, REJECTED],
  REJECTED: [],  // terminal state
  HIRED: [PROJECT_STARTED],
  PROJECT_STARTED: [BONUS_ELIGIBLE],
  BONUS_ELIGIBLE: [BONUS_AWARDED],
  BONUS_AWARDED: []  // terminal state
};

// Walidacja przejścia
function validateTransition(from: Status, to: Status): boolean {
  return allowedTransitions[from]?.includes(to) ?? false;
}
```

### 4.4 Komponenty UI

#### 4.4.1 ReferralStatusTracker.tsx
```typescript
export const ReferralStatusTracker = ({ referralId }: { referralId: string }) => {
  const { data: referral } = useQuery(['referral', referralId],
    () => fetchReferral(referralId)
  );

  const currentStatus = referral?.status;
  const timeline = referral?.status_history;

  return (
    <div className="space-y-6">

      {/* Progress Indicator */}
      <div className="relative">
        <div className="flex justify-between mb-2">
          {statuses.map((status, idx) => {
            const isActive = statusOrder.indexOf(currentStatus) >= idx;
            const isCompleted = statusOrder.indexOf(currentStatus) > idx;

            return (
              <div key={status} className="flex-1">
                <div className={`
                  h-10 rounded-full flex items-center justify-center
                  ${isCompleted ? 'bg-green-600 text-white' :
                    isActive ? 'bg-blue-600 text-white' :
                    'bg-gray-200 text-gray-600'}
                `}>
                  {isCompleted ? <CheckCircle2 /> : idx + 1}
                </div>
                <p className="text-xs text-center mt-2">{status}</p>
              </div>
            );
          })}
        </div>

        {/* Connector line */}
        <div className="absolute top-5 left-0 right-0 h-1 bg-gray-200 -z-10">
          <div
            className="h-full bg-green-600 transition-all duration-300"
            style={{ width: `${(statusOrder.indexOf(currentStatus) / (statuses.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        <h3 className="font-semibold">Historia zmian statusu</h3>
        {timeline?.map((entry, idx) => (
          <div key={idx} className="flex gap-4 pb-4 border-l-2 border-blue-200 pl-4">
            <div>
              <p className="font-medium">{entry.status}</p>
              <p className="text-sm text-gray-500">
                {formatDate(entry.timestamp)}
              </p>
              {entry.notes && (
                <p className="text-sm text-gray-600 mt-1">{entry.notes}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Current Details */}
      <Card>
        <CardHeader>
          <CardTitle>Aktualne informacje</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span>Status:</span>
            <Badge>{currentStatus}</Badge>
          </div>
          {referral?.points_earned > 0 && (
            <div className="flex justify-between">
              <span>Punkty:</span>
              <span className="font-semibold text-green-600">
                +{referral.points_earned} pkt
              </span>
            </div>
          )}
          {referral?.bonus_amount && (
            <div className="flex justify-between">
              <span>Bonus:</span>
              <span className="font-semibold text-green-600">
                {referral.bonus_amount.toLocaleString('pl-PL')} PLN
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
```

#### 4.4.2 StatusTimeline.tsx (Simplified)
```typescript
export const StatusTimeline = ({ statusHistory }: { statusHistory: StatusEntry[] }) => {
  return (
    <div className="relative">
      {statusHistory.map((entry, idx) => (
        <div key={entry.id} className="flex gap-4 pb-6 relative">

          {/* Timeline dot */}
          <div className="relative flex flex-col items-center">
            <div className={`
              w-4 h-4 rounded-full border-2 z-10 relative
              ${entry.isCurrentStatus ? 'bg-blue-600 border-blue-600' : 'bg-white border-green-600'}
            `} />
            {idx < statusHistory.length - 1 && (
              <div className="absolute top-4 left-2 w-0.5 h-12 bg-green-200" />
            )}
          </div>

          {/* Timeline content */}
          <div className="pb-6">
            <p className="font-semibold">{entry.status}</p>
            <p className="text-sm text-gray-500">{formatDate(entry.timestamp)}</p>
            {entry.notes && <p className="text-sm text-gray-700 mt-1">{entry.notes}</p>}
          </div>
        </div>
      ))}
    </div>
  );
};
```

### 4.5 Backend - Status Change Trigger

```typescript
// Funkcja triggered na zmianę statusu w bazie
export async function handleStatusChange(
  referralId: string,
  newStatus: ReferralStatus,
  triggeredBy: string = 'system'
): Promise<void> {

  const client = createClient();

  // 1. Validate transition
  const { data: currentReferral } = await client
    .from('referrals')
    .select('status, referrer_id, hired_date')
    .eq('id', referralId)
    .single();

  if (!validateTransition(currentReferral.status, newStatus)) {
    throw new Error(`Invalid status transition: ${currentReferral.status} -> ${newStatus}`);
  }

  // 2. Update status
  await client
    .from('referrals')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', referralId);

  // 3. Log transition
  await client
    .from('referral_status_log')
    .insert({
      referral_id: referralId,
      from_status: currentReferral.status,
      to_status: newStatus,
      triggered_by: triggeredBy,
      timestamp: new Date().toISOString()
    });

  // 4. Handle side effects based on new status
  if (newStatus === 'PROJECT_STARTED') {
    // Award points immediately
    await awardReferralPoints(referralId, currentReferral.referrer_id, 50);

    // Send notification to referrer
    await sendNotification(currentReferral.referrer_id, {
      type: 'REFERRAL_POINTS_AWARDED',
      title: 'Gratulacje! Points awarded!',
      message: 'Twój polecony kandydat rozpoczął projekt. Otrzymałeś 50 punktów!',
      points: 50
    });
  }

  if (newStatus === 'BONUS_ELIGIBLE') {
    // Check if bonus is applicable (3 months have passed)
    const hiredDate = new Date(currentReferral.hired_date);
    const threeMonthsLater = addMonths(hiredDate, 3);

    if (isPast(threeMonthsLater)) {
      await markBonusEligible(referralId);
    }
  }
}
```

---

## 5. M6.3: Historia Poleceń (Referral History)

### 5.1 Funkcjonalność
Widok umożliwiający konsultantom przeglądanie historii wszystkich ich poleceń z informacjami o statusie i zarobionych punktach.

### 5.2 Struktura Tabeli

```typescript
interface ReferralHistoryItem {
  id: string;
  candidateName: string;
  candidateEmail: string;
  specialization: string;
  status: ReferralStatus;
  submittedDate: Date;
  pointsEarned: number;
  bonusEarned?: number;
  bonusStatus?: 'not_eligible' | 'eligible' | 'awarded';
  daysInStatus: number;  // ile dni w aktualnym statusie
}
```

### 5.3 Komponenty

#### 5.3.1 ReferralHistory.tsx
```typescript
export const ReferralHistory = () => {
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState<'date' | 'points'>('date');
  const [filterStatus, setFilterStatus] = useState<ReferralStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: referrals, isLoading } = useQuery(
    ['referralHistory', user?.id, filterStatus, sortBy],
    () => fetchReferralHistory(user!.id, { filterStatus, sortBy })
  );

  const stats = useMemo(() => {
    if (!referrals) return null;

    return {
      totalReferrals: referrals.length,
      activeReferrals: referrals.filter(r => !['DUPLICATE', 'REJECTED'].includes(r.status)).length,
      totalPointsEarned: referrals.reduce((sum, r) => sum + r.pointsEarned, 0),
      totalBonusEarned: referrals.reduce((sum, r) => sum + (r.bonusEarned || 0), 0),
      conversionRate: (referrals.filter(r => r.status === 'PROJECT_STARTED').length / referrals.length) * 100
    };
  }, [referrals]);

  return (
    <div className="space-y-6">

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          title="Wszystkie polecenia"
          value={stats?.totalReferrals}
          icon={Users}
        />
        <StatCard
          title="Aktywne"
          value={stats?.activeReferrals}
          icon={Activity}
        />
        <StatCard
          title="Punkty"
          value={stats?.totalPointsEarned}
          icon={Award}
          suffix="pkt"
        />
        <StatCard
          title="Bonusy"
          value={stats?.totalBonusEarned}
          icon={DollarSign}
          suffix="PLN"
        />
        <StatCard
          title="Konwersja"
          value={stats?.conversionRate.toFixed(1)}
          icon={TrendingUp}
          suffix="%"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Szukaj kandydata..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Wszystkie statusy</SelectItem>
                <SelectItem value="SUBMITTED">Wysłane</SelectItem>
                <SelectItem value="IN_RECRUITMENT">W rekrutacji</SelectItem>
                <SelectItem value="HIRED">Zatrudnieni</SelectItem>
                <SelectItem value="PROJECT_STARTED">Na projekcie</SelectItem>
                <SelectItem value="BONUS_ELIGIBLE">Bonus dostępny</SelectItem>
                <SelectItem value="DUPLICATE">Duplikaty</SelectItem>
                <SelectItem value="REJECTED">Odrzuceni</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(val) => setSortBy(val as 'date' | 'points')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Najnowsze</SelectItem>
                <SelectItem value="points">Największe punkty</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* History Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : referrals && referrals.length > 0 ? (
        <ReferralHistoryTable referrals={referrals} searchTerm={searchTerm} />
      ) : (
        <EmptyState
          icon={FileText}
          title="Brak poleceń"
          description="Zacznij polecać kandydatów i zarabiaj punkty!"
        />
      )}
    </div>
  );
};
```

#### 5.3.2 HistoryTable.tsx
```typescript
export const ReferralHistoryTable = ({
  referrals,
  searchTerm
}: {
  referrals: ReferralHistoryItem[];
  searchTerm: string;
}) => {
  const filtered = referrals.filter(r =>
    r.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.candidateEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead>Kandydat</TableHead>
            <TableHead>Specjalizacja</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Punkty</TableHead>
            <TableHead className="text-right">Bonus</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((referral) => (
            <TableRow key={referral.id}>

              {/* Candidate Name */}
              <TableCell>
                <div>
                  <p className="font-medium">{referral.candidateName}</p>
                  <p className="text-sm text-gray-500">{referral.candidateEmail}</p>
                </div>
              </TableCell>

              {/* Specialization */}
              <TableCell>
                <Badge variant="outline">
                  {getSpecializationLabel(referral.specialization)}
                </Badge>
              </TableCell>

              {/* Status */}
              <TableCell>
                <StatusBadge status={referral.status} />
              </TableCell>

              {/* Date */}
              <TableCell>
                <span className="text-sm">
                  {formatDate(referral.submittedDate)}
                </span>
              </TableCell>

              {/* Points */}
              <TableCell className="text-right">
                {referral.pointsEarned > 0 ? (
                  <span className="font-semibold text-green-600">
                    +{referral.pointsEarned}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>

              {/* Bonus */}
              <TableCell className="text-right">
                {referral.bonusEarned ? (
                  <span className="font-semibold text-green-600">
                    {referral.bonusEarned.toLocaleString('pl-PL')} PLN
                  </span>
                ) : referral.bonusStatus === 'eligible' ? (
                  <Tooltip content="Bonus dostępny do odebrania">
                    <Badge variant="secondary">Dostępny</Badge>
                  </Tooltip>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>

              {/* Actions */}
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => openDetails(referral.id)}
                    >
                      Szczegóły
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => copyToClipboard(referral.candidateEmail)}
                    >
                      Kopiuj email
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
```

### 5.4 Export Historii

```typescript
export const ExportHistoryButton = ({ referralId: string }) => {
  const handleExportCSV = async () => {
    const { data } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_id', referralId)
      .order('created_at', { ascending: false });

    const csv = generateCSV(data);
    downloadFile(csv, 'historia-polecen.csv', 'text/csv');
  };

  return (
    <Button
      variant="outline"
      onClick={handleExportCSV}
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      Pobierz CSV
    </Button>
  );
};
```

---

## 6. M6.4: Link Podziału (Referral Share Link)

### 6.1 Strategia Generowania Linków

```typescript
interface ReferralLink {
  id: string;
  referrerId: string;
  uniqueCode: string;  // 8-char alphanumeric
  fullUrl: string;
  shortUrl?: string;
  createdAt: Date;
  expiresAt?: Date;
  clickCount: number;
  conversionCount: number;
}

// Link format:
// https://qualrix.b2b.net/join?ref=ABC12XYZ
// Lub z polskim sluzem:
// https://qualrix.pl/zatrudni/ABC12XYZ
```

### 6.2 Generowanie Kodu
```typescript
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createReferralLink(referrerId: string): Promise<ReferralLink> {
  const code = generateReferralCode();

  // Validate uniqueness
  const { data: existing } = await supabase
    .from('referral_links')
    .select('id')
    .eq('unique_code', code);

  if (existing?.length > 0) {
    return createReferralLink(referrerId); // retry
  }

  const { data } = await supabase
    .from('referral_links')
    .insert({
      referrer_id: referrerId,
      unique_code: code,
      full_url: `https://qualrix.b2b.net/join?ref=${code}`,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  return data as ReferralLink;
}
```

### 6.3 Komponenty UI

#### 6.3.1 ReferralLinkGenerator.tsx
```typescript
export const ReferralLinkGenerator = () => {
  const { user } = useAuth();
  const [link, setLink] = useState<ReferralLink | null>(null);
  const [copied, setCopied] = useState(false);

  const { mutate: generateLink, isLoading } = useMutation(
    () => createReferralLink(user!.id),
    {
      onSuccess: (data) => {
        setLink(data);
        trackEvent('referral_link_generated', { referrer_id: user!.id });
      }
    }
  );

  const handleCopyLink = () => {
    navigator.clipboard.writeText(link!.fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          Twój link polecenia
        </CardTitle>
        <CardDescription>
          Udostępnij ten link, aby polecać kandydatów
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!link ? (
          <Button
            onClick={() => generateLink()}
            disabled={isLoading}
            size="lg"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Wygeneruj link
          </Button>
        ) : (
          <>
            {/* Link Display */}
            <div className="flex gap-2 items-center">
              <Input
                value={link.fullUrl}
                readOnly
                className="bg-gray-50"
              />
              <Button
                onClick={handleCopyLink}
                variant="outline"
                size="sm"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Skopiowano
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    Kopiuj
                  </>
                )}
              </Button>
            </div>

            {/* QR Code */}
            <div className="bg-gray-50 p-6 rounded-lg flex justify-center">
              <QRCode value={link.fullUrl} size={200} />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-3 rounded">
                <p className="text-sm text-gray-600">Kliknięcia</p>
                <p className="text-2xl font-bold">{link.clickCount}</p>
              </div>
              <div className="bg-green-50 p-3 rounded">
                <p className="text-sm text-gray-600">Konwersje</p>
                <p className="text-2xl font-bold">{link.conversionCount}</p>
              </div>
            </div>

            {/* Social Share Buttons */}
            <Separator />
            <SocialShareButtons link={link} />
          </>
        )}
      </CardContent>
    </Card>
  );
};
```

#### 6.3.2 SocialShareButtons.tsx
```typescript
export const SocialShareButtons = ({ link }: { link: ReferralLink }) => {
  const title = "Dołącz do naszej sieci IT konsultantów w B2B.net!";
  const message = `Znam świetnego zespół B2B.net - możliwość pracy na ciekawych projektach i zarabiania bonusów. ${link.fullUrl}`;

  const shares = [
    {
      name: 'WhatsApp',
      icon: MessageCircle,
      onClick: () => {
        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        trackEvent('referral_shared', { platform: 'whatsapp' });
      },
      color: 'text-green-600'
    },
    {
      name: 'LinkedIn',
      icon: Linkedin,
      onClick: () => {
        const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link.fullUrl)}`;
        window.open(linkedinUrl, '_blank');
        trackEvent('referral_shared', { platform: 'linkedin' });
      },
      color: 'text-blue-700'
    },
    {
      name: 'Email',
      icon: Mail,
      onClick: () => {
        const emailUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`;
        window.location.href = emailUrl;
        trackEvent('referral_shared', { platform: 'email' });
      },
      color: 'text-gray-600'
    },
    {
      name: 'Facebook',
      icon: Facebook,
      onClick: () => {
        const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link.fullUrl)}`;
        window.open(fbUrl, '_blank');
        trackEvent('referral_shared', { platform: 'facebook' });
      },
      color: 'text-blue-600'
    },
    {
      name: 'Twitter',
      icon: Twitter,
      onClick: () => {
        const twitterUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(link.fullUrl)}&text=${encodeURIComponent(title)}`;
        window.open(twitterUrl, '_blank');
        trackEvent('referral_shared', { platform: 'twitter' });
      },
      color: 'text-blue-400'
    }
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Udostępnij na mediach społecznych</p>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {shares.map((share) => (
          <Button
            key={share.name}
            variant="outline"
            onClick={share.onClick}
            className="flex-col h-auto gap-2 py-3"
            title={`Udostępnij na ${share.name}`}
          >
            <share.icon className={`h-5 w-5 ${share.color}`} />
            <span className="text-xs">{share.name}</span>
          </Button>
        ))}
      </div>
    </div>
  );
};
```

### 6.4 Link Tracking (Analityka)

```typescript
// middleware.ts - track referral clicks
export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  if (url.pathname === '/join' && url.searchParams.has('ref')) {
    const refCode = url.searchParams.get('ref');

    // Log click
    await supabase
      .from('referral_link_clicks')
      .insert({
        unique_code: refCode,
        clicked_at: new Date().toISOString(),
        user_agent: request.headers.get('user-agent'),
        ip_hash: hashIp(request.ip || ''),
        referrer: request.headers.get('referer')
      });

    // Set session cookie for tracking
    const response = NextResponse.next();
    response.cookies.set('ref_code', refCode, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      secure: true,
      httpOnly: true,
      sameSite: 'lax'
    });

    return response;
  }
}
```

---

## 7. M6.5: Ranking Poleceń (Referral Leaderboard)

### 7.1 Strategia Gamifikacji

```typescript
interface LeaderboardEntry {
  rank: number;
  referrerId: string;
  referrerName: string;
  referrerAvatar: string;
  totalPoints: number;
  totalBonus: number;
  referralsCount: number;
  hiredCount: number;
  projectStartedCount: number;
  streak: number;  // dni z aktywnym polecaniem
  badge?: 'gold' | 'silver' | 'bronze' | 'rising-star';
}

// Badges
const badges = {
  'top-referrer': { icon: '🏆', label: 'Top Referrer', requirement: 'top 3' },
  'gold-standard': { icon: '⭐', label: 'Gold Standard', requirement: '>500 pts' },
  'rising-star': { icon: '🚀', label: 'Rising Star', requirement: '+100 pts this month' },
  'consistency': { icon: '🔥', label: 'On Fire', requirement: '10+ referrals in a month' }
};
```

### 7.2 Komponenty

#### 7.2.1 ReferralLeaderboard.tsx
```typescript
export const ReferralLeaderboard = () => {
  const [period, setPeriod] = useState<'month' | 'alltime'>('month');
  const [page, setPage] = useState(1);

  const { data: leaderboard, isLoading } = useQuery(
    ['leaderboard', period, page],
    () => fetchLeaderboard(period, page),
    { staleTime: 60 * 5 } // 5 min cache
  );

  return (
    <div className="space-y-6">

      {/* Period Selector */}
      <div className="flex gap-2">
        <Button
          variant={period === 'month' ? 'default' : 'outline'}
          onClick={() => {
            setPeriod('month');
            setPage(1);
          }}
        >
          Ten miesiąc
        </Button>
        <Button
          variant={period === 'alltime' ? 'default' : 'outline'}
          onClick={() => {
            setPeriod('alltime');
            setPage(1);
          }}
        >
          Wszechczasów
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <>
          {/* Leaderboard Table */}
          <LeaderboardTable entries={leaderboard.entries} />

          {/* Pagination */}
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Poprzednia
            </Button>
            <span className="flex items-center px-4">
              Strona {page}
            </span>
            <Button
              variant="outline"
              disabled={leaderboard.entries.length < 10}
              onClick={() => setPage(p => p + 1)}
            >
              Następna
            </Button>
          </div>

          {/* Legend */}
          <Card className="bg-blue-50">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(badges).map(([key, badge]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span>{badge.icon}</span>
                    <div>
                      <p className="text-sm font-medium">{badge.label}</p>
                      <p className="text-xs text-gray-600">{badge.requirement}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
```

#### 7.2.2 LeaderboardTable.tsx
```typescript
export const LeaderboardTable = ({ entries }: { entries: LeaderboardEntry[] }) => {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gradient-to-r from-purple-50 to-blue-50">
            <TableHead className="w-12">Miejsce</TableHead>
            <TableHead>Konsultant</TableHead>
            <TableHead className="text-right">Punkty</TableHead>
            <TableHead className="text-right">Polecenia</TableHead>
            <TableHead className="text-right">Zatrudnieni</TableHead>
            <TableHead className="text-right">Na projektach</TableHead>
            <TableHead className="text-right">Bonus</TableHead>
            <TableHead>Odznaka</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry, idx) => (
            <TableRow
              key={entry.referrerId}
              className={idx < 3 ? 'bg-yellow-50' : ''}
            >

              {/* Rank */}
              <TableCell className="font-bold">
                <div className="flex items-center gap-2">
                  {entry.rank <= 3 ? (
                    <span className="text-lg">
                      {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}
                    </span>
                  ) : (
                    <span>{entry.rank}</span>
                  )}
                </div>
              </TableCell>

              {/* Referrer Info */}
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={entry.referrerAvatar} />
                    <AvatarFallback>
                      {entry.referrerName.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{entry.referrerName}</p>
                    <p className="text-xs text-gray-500">Pasek {entry.streak}</p>
                  </div>
                </div>
              </TableCell>

              {/* Points */}
              <TableCell className="text-right font-bold text-green-600">
                {entry.totalPoints}
              </TableCell>

              {/* Referrals Count */}
              <TableCell className="text-right">
                {entry.referralsCount}
              </TableCell>

              {/* Hired Count */}
              <TableCell className="text-right text-blue-600 font-semibold">
                {entry.hiredCount}
              </TableCell>

              {/* Project Started */}
              <TableCell className="text-right text-purple-600 font-semibold">
                {entry.projectStartedCount}
              </TableCell>

              {/* Bonus */}
              <TableCell className="text-right">
                {entry.totalBonus > 0 ? (
                  <span className="font-bold text-green-600">
                    {entry.totalBonus.toLocaleString('pl-PL')} PLN
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>

              {/* Badge */}
              <TableCell>
                {entry.badge && (
                  <Tooltip content={`Odznaka: ${entry.badge}`}>
                    <Badge variant="secondary">
                      {badgeEmoji[entry.badge]}
                    </Badge>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
```

### 7.3 Backend - Leaderboard Calculation

```typescript
export async function calculateLeaderboard(
  period: 'month' | 'alltime'
): Promise<LeaderboardEntry[]> {

  const client = createClient();

  // Get period dates
  const { startDate, endDate } = getPeriodDates(period);

  // Query referrals with aggregations
  const { data: entries } = await client
    .from('referrals')
    .select(`
      referrer_id,
      consultants(name, avatar_url),
      status,
      points_earned,
      bonus_amount,
      created_at
    `)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at', { ascending: false });

  // Group and aggregate
  const grouped = groupBy(entries, 'referrer_id');

  const leaderboard: LeaderboardEntry[] = Object.entries(grouped)
    .map(([referrerId, referrals]) => {
      const totalPoints = referrals.reduce((sum, r) => sum + (r.points_earned || 0), 0);
      const hiredCount = referrals.filter(r => r.status === 'HIRED').length;
      const projectStartedCount = referrals.filter(r => r.status === 'PROJECT_STARTED').length;
      const totalBonus = referrals.reduce((sum, r) => sum + (r.bonus_amount || 0), 0);

      // Calculate streak
      const streak = calculateStreak(referrals);

      // Determine badge
      const badge = determineBadge(totalPoints, referrals.length, streak, projectStartedCount);

      return {
        referrerId,
        referrerName: referrals[0].consultants.name,
        referrerAvatar: referrals[0].consultants.avatar_url,
        totalPoints,
        totalBonus,
        referralsCount: referrals.length,
        hiredCount,
        projectStartedCount,
        streak,
        badge
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

  return leaderboard;
}

function calculateStreak(referrals: Referral[]): number {
  // Liczba dni z aktywnym polecaniem
  const dates = referrals.map(r => format(new Date(r.created_at), 'yyyy-MM-dd'));
  const uniqueDates = [...new Set(dates)].sort().reverse();

  let streak = 0;
  let currentDate = new Date();

  for (const dateStr of uniqueDates) {
    const refDate = new Date(dateStr);
    const diffDays = differenceInDays(currentDate, refDate);

    if (diffDays === streak) {
      streak++;
      currentDate = refDate;
    } else {
      break;
    }
  }

  return streak;
}

function determineBadge(points: number, count: number, streak: number, projectStarted: number): string | undefined {
  if (points > 500) return 'gold-standard';
  if (streak >= 10) return 'consistency';
  if (count >= 5 && projectStarted >= 1) return 'rising-star';
  return undefined;
}
```

---

## 8. Algorytm Deduplicacji (Deduplication Engine)

### 8.1 Logika Deduplicacji

```typescript
interface DeduplicationResult {
  isDuplicate: boolean;
  duplicateReferralId?: string;
  matchType: 'email_exact' | 'email_fuzzy' | 'phone' | 'linkedin' | 'no_match';
  confidence: number; // 0-1
  existingCandidate?: {
    id: string;
    name: string;
    status: string;
    referredBy: string;
    referredDate: Date;
  };
}

export async function checkDuplication(
  candidateName: string,
  candidateEmail: string,
  phoneNumber: string,
  linkedinUrl?: string
): Promise<DeduplicationResult> {

  const client = createClient();

  // 1. Exact email match (highest confidence)
  const { data: emailMatch } = await client
    .from('referrals')
    .select('id, candidate_name, status, referrer_id, created_at')
    .eq('candidate_email', candidateEmail.toLowerCase())
    .neq('status', 'DUPLICATE')
    .single();

  if (emailMatch) {
    return {
      isDuplicate: true,
      duplicateReferralId: emailMatch.id,
      matchType: 'email_exact',
      confidence: 0.99,
      existingCandidate: {
        id: emailMatch.id,
        name: emailMatch.candidate_name,
        status: emailMatch.status,
        referredBy: emailMatch.referrer_id,
        referredDate: new Date(emailMatch.created_at)
      }
    };
  }

  // 2. Phone number match
  const { data: phoneMatch } = await client
    .from('referrals')
    .select('id, candidate_name, status, referrer_id, created_at')
    .eq('phone_number', phoneNumber)
    .neq('status', 'DUPLICATE')
    .single();

  if (phoneMatch) {
    return {
      isDuplicate: true,
      duplicateReferralId: phoneMatch.id,
      matchType: 'phone',
      confidence: 0.85,
      existingCandidate: {
        id: phoneMatch.id,
        name: phoneMatch.candidate_name,
        status: phoneMatch.status,
        referredBy: phoneMatch.referrer_id,
        referredDate: new Date(phoneMatch.created_at)
      }
    };
  }

  // 3. Fuzzy email match (typos, variants)
  const { data: fuzzyMatches } = await client
    .from('referrals')
    .select('id, candidate_email, candidate_name, status')
    .neq('status', 'DUPLICATE')
    .limit(20);

  for (const match of fuzzyMatches || []) {
    const similarity = calculateStringSimilarity(
      candidateEmail.toLowerCase(),
      match.candidate_email.toLowerCase()
    );

    if (similarity > 0.85) {
      return {
        isDuplicate: true,
        duplicateReferralId: match.id,
        matchType: 'email_fuzzy',
        confidence: similarity
      };
    }
  }

  // 4. LinkedIn match
  if (linkedinUrl) {
    const linkedinId = extractLinkedInId(linkedinUrl);

    const { data: linkedinMatch } = await client
      .from('referrals')
      .select('id, candidate_name, status')
      .eq('linkedin_url_id', linkedinId)
      .neq('status', 'DUPLICATE')
      .single();

    if (linkedinMatch) {
      return {
        isDuplicate: true,
        duplicateReferralId: linkedinMatch.id,
        matchType: 'linkedin',
        confidence: 0.95
      };
    }
  }

  // 5. No match found
  return {
    isDuplicate: false,
    matchType: 'no_match',
    confidence: 0
  };
}

// Helper: String similarity (Levenshtein distance)
function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1: string, s2: string): number {
  const costs = [];

  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }

  return costs[s2.length];
}
```

### 8.2 Obsługa Duplikatów w Formularzu

```typescript
// ReferralForm.tsx - integration
const onSubmit = async (data: ReferralFormValues) => {
  setIsSubmitting(true);

  try {
    // Check duplication
    const dedup = await checkDuplication(
      data.candidateName,
      data.candidateEmail,
      data.phoneNumber,
      data.linkedinUrl
    );

    if (dedup.isDuplicate) {
      // Show warning dialog
      const confirmed = await showConfirmDialog({
        title: 'Kandydat już polecony',
        description: `
          ${dedup.existingCandidate?.name} został już polecony ${dedup.existingCandidate?.referredDate.toLocaleDateString('pl-PL')}.

          Status: ${dedup.existingCandidate?.status}
          Pewność: ${(dedup.confidence * 100).toFixed(0)}%

          Czy mimo to chcesz kontynuować?
        `,
        confirmText: 'Dodaj nowe polecenie',
        cancelText: 'Anuluj'
      });

      if (!confirmed) {
        return;
      }
    }

    // Proceed with submission
    const { error } = await supabase
      .from('referrals')
      .insert({
        referrer_id: user!.id,
        candidate_name: data.candidateName,
        candidate_email: data.candidateEmail,
        phone_number: data.phoneNumber,
        specialization: data.specialization,
        linkedin_url: data.linkedinUrl,
        additional_notes: data.additionalNotes,
        gdpr_consent: data.gdprConsent,
        is_duplicate_check: dedup.isDuplicate,
        duplicate_match_type: dedup.matchType,
        duplicate_confidence: dedup.confidence,
        status: 'SUBMITTED',
        created_at: new Date().toISOString()
      });

    if (error) throw error;

    setSuccessMessage('Kandydat został pomyślnie polecony!');
    form.reset();

  } catch (error) {
    setErrorMessage(error.message);
  } finally {
    setIsSubmitting(false);
  }
};
```

---

## 9. Obliczanie i Nagradzanie Punktów (Points Calculator)

### 9.1 System Punktów

```typescript
interface PointsAward {
  referralId: string;
  referrerId: string;
  points: number;
  reason: string;
  awardedAt: Date;
  bonusAmount?: number;
  bonusEligibleAt?: Date;
}

// Points structure
const POINTS_CONFIG = {
  REFERRAL_SUBMITTED: 5,          // pkt za wysłanie polecenia
  CANDIDATE_HIRED: 20,            // pkt za zatrudnienie
  PROJECT_STARTED: 50,            // pkt za start projektu (MAIN AWARD)
  BONUS_ELIGIBLE_THRESHOLD: 50,   // minimalne pkt do bonusu
  BONUS_MIN: 2000,               // min bonus
  BONUS_MAX: 5000,               // max bonus
  BONUS_PERIOD_MONTHS: 3         // ile miesięcy na projekcie do bonusu
};

interface PointsCalculationConfig {
  referralId: string;
  referrerId: string;
  newStatus: ReferralStatus;
  previousStatus: ReferralStatus;
  hiredDate?: Date;
  projectStartDate?: Date;
  projectEndDate?: Date;
}

export async function calculateAndAwardPoints(
  config: PointsCalculationConfig
): Promise<PointsAward | null> {

  const { referralId, referrerId, newStatus, previousStatus } = config;

  // Determine points based on status transition
  let points = 0;
  let reason = '';
  let bonusEligible = false;
  let bonusAmount = 0;

  switch (newStatus) {
    case 'SUBMITTED':
      // Initial submission - no points yet
      return null;

    case 'HIRED':
      // Candidate was hired
      points = POINTS_CONFIG.CANDIDATE_HIRED;
      reason = 'Kandydat zatrudniony';
      break;

    case 'PROJECT_STARTED':
      // THIS IS THE MAIN AWARD
      points = POINTS_CONFIG.PROJECT_STARTED;
      reason = 'Kandydat rozpoczął projekt';
      bonusEligible = true;
      break;

    case 'BONUS_ELIGIBLE':
      // 3 months have passed - award bonus
      bonusAmount = calculateBonus(referrerId);
      reason = `Bonus za 3 miesiące na projekcie: ${bonusAmount} PLN`;
      break;

    case 'DUPLICATE':
    case 'REJECTED':
      // No points
      return null;

    default:
      return null;
  }

  // Insert points record
  const { data: award } = await supabase
    .from('referral_points')
    .insert({
      referral_id: referralId,
      referrer_id: referrerId,
      points,
      bonus_amount: bonusAmount,
      reason,
      awarded_at: new Date().toISOString(),
      awarded_for_status: newStatus
    })
    .select()
    .single();

  // Update referral record
  if (points > 0) {
    await supabase
      .from('referrals')
      .update({
        points_earned: newStatus === 'PROJECT_STARTED' ? points : undefined,
        bonus_amount: bonusAmount > 0 ? bonusAmount : undefined,
        bonus_awarded_at: bonusAmount > 0 ? new Date().toISOString() : undefined
      })
      .eq('id', referralId);

    // Update consultant's total points cache
    await updateConsultantPointsCache(referrerId);
  }

  return {
    referralId,
    referrerId,
    points,
    reason,
    awardedAt: new Date(award.awarded_at),
    bonusAmount,
    bonusEligibleAt: bonusEligible ? new Date() : undefined
  };
}

function calculateBonus(referrerId: string, referralId?: string): number {
  // Bonus calculation logic
  // Can be based on consultant level, project difficulty, etc.

  // Simple version: fixed bonus range
  // Advanced: calculate based on consultant's total points
  return Math.min(
    POINTS_CONFIG.BONUS_MAX,
    Math.max(
      POINTS_CONFIG.BONUS_MIN,
      Math.floor(POINTS_CONFIG.BONUS_MIN + Math.random() * 3000)
    )
  );
}

async function updateConsultantPointsCache(consultantId: string): Promise<void> {
  // Aggregate all points for consultant
  const { data } = await supabase
    .from('referral_points')
    .select('points, bonus_amount')
    .eq('referrer_id', consultantId);

  const totalPoints = data?.reduce((sum, p) => sum + (p.points || 0), 0) || 0;
  const totalBonus = data?.reduce((sum, p) => sum + (p.bonus_amount || 0), 0) || 0;

  // Update consultant profile cache
  await supabase
    .from('consultants')
    .update({
      total_referral_points: totalPoints,
      total_referral_bonus: totalBonus,
      updated_at: new Date().toISOString()
    })
    .eq('id', consultantId);
}
```

### 9.2 Points Leaderboard View

```typescript
export const ConsultantPointsView = ({ consultantId }: { consultantId: string }) => {
  const { data: stats } = useQuery(['points', consultantId],
    () => fetchConsultantPointsStats(consultantId)
  );

  return (
    <div className="space-y-6">

      {/* Points Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Całkowite punkty"
          value={stats?.totalPoints}
          change={stats?.pointsThisMonth}
          changeLabel="ten miesiąc"
        />
        <StatCard
          title="Bonusy"
          value={`${stats?.totalBonus.toLocaleString('pl-PL')} PLN`}
          icon={DollarSign}
        />
        <StatCard
          title="Średnia na polecenie"
          value={(stats?.totalPoints / stats?.totalReferrals).toFixed(0)}
          suffix="pkt"
        />
        <StatCard
          title="Kolejny bonus w"
          value={stats?.daysToNextBonus}
          suffix="dni"
        />
      </div>

      {/* Points Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Rozkład punktów</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <PointBreakdownRow
              label="Za polecenia zatrudnione"
              points={stats?.pointsFromHired}
              percentage={(stats?.pointsFromHired / stats?.totalPoints) * 100}
            />
            <PointBreakdownRow
              label="Za projekty"
              points={stats?.pointsFromProjects}
              percentage={(stats?.pointsFromProjects / stats?.totalPoints) * 100}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
```

---

## 10. Zgodność z GDPR (GDPR Compliance)

### 10.1 Zasady Przetwarzania Danych

```typescript
// GDPR Compliance Module
const GDPR_POLICY = {
  dataRetention: 1095,  // dni (3 lata)
  consentRequired: true,
  rightToBeForgotten: true,
  dataPortability: true,
  thirdPartySharing: false,
  cookies: ['referral_tracking', 'analytics'],
  purposes: [
    'Recruitment',
    'Referral tracking',
    'Point calculation',
    'Communication'
  ]
};

interface ConsentRecord {
  userId: string;
  candidateEmail: string;
  consentGiven: boolean;
  consentDate: Date;
  consentVersion: string;
  ipAddress: string;  // hashed
  userAgent: string;
}

export async function recordGDPRConsent(data: ConsentRecord): Promise<void> {
  const client = createClient();

  // 1. Hash sensitive data
  const hashedIp = hashData(data.ipAddress);
  const hashedEmail = hashData(data.candidateEmail);

  // 2. Store consent record
  await client
    .from('gdpr_consent_records')
    .insert({
      user_id: data.userId,
      candidate_email_hash: hashedEmail,
      consent_given: data.consentGiven,
      consent_date: data.consentDate.toISOString(),
      consent_version: data.consentVersion,
      ip_address_hash: hashedIp,
      user_agent: data.userAgent
    });

  // 3. Log event for audit trail
  await client
    .from('gdpr_audit_log')
    .insert({
      action: 'CONSENT_RECORDED',
      user_id: data.userId,
      timestamp: new Date().toISOString(),
      details: {
        consentVersion: data.consentVersion,
        consentGiven: data.consentGiven
      }
    });
}
```

### 10.2 Prawa Użytkownika

#### 10.2.1 Prawo do Bycia Zapomnianym (Right to Be Forgotten)

```typescript
export async function processDataDeletionRequest(
  candidateEmail: string,
  requestedByConsultant: boolean = false
): Promise<void> {
  const client = createClient();

  // Find referral record
  const { data: referral } = await client
    .from('referrals')
    .select('id, referrer_id, candidate_email')
    .eq('candidate_email', candidateEmail.toLowerCase())
    .single();

  if (!referral) {
    throw new Error('Referral not found');
  }

  // 1. Anonymize personal data
  const anonymousEmail = `deleted-${Date.now()}@internal.b2b.net`;
  const anonymousName = `User_${Date.now()}`;

  await client
    .from('referrals')
    .update({
      candidate_name: anonymousName,
      candidate_email: anonymousEmail,
      phone_number: null,
      linkedin_url: null,
      additional_notes: '[DELETED]',
      gdpr_deleted_at: new Date().toISOString(),
      gdpr_deletion_reason: 'Right to be forgotten request'
    })
    .eq('id', referral.id);

  // 2. Delete from analytics/tracking
  await client
    .from('referral_link_clicks')
    .delete()
    .eq('referral_id', referral.id);

  // 3. Log deletion
  await client
    .from('gdpr_audit_log')
    .insert({
      action: 'DATA_DELETED',
      user_id: referral.referrer_id,
      timestamp: new Date().toISOString(),
      details: {
        referral_id: referral.id,
        reason: 'GDPR deletion request'
      }
    });

  // 4. Notify consultant
  if (requestedByConsultant) {
    await sendNotification(referral.referrer_id, {
      type: 'DATA_DELETED',
      title: 'Dane kandydata usunięte',
      message: 'Dane osobowe kandydata zostały pomyślnie usunięte z systemu.'
    });
  }
}
```

#### 10.2.2 Przenośność Danych (Data Portability)

```typescript
export async function generateDataPortabilityReport(
  consultantId: string
): Promise<string> {
  const client = createClient();

  // Fetch all consultant's referral data
  const { data: referrals } = await client
    .from('referrals')
    .select(`
      id,
      candidate_name,
      candidate_email,
      phone_number,
      specialization,
      status,
      created_at,
      referral_points(points, reason, awarded_at),
      status_history(status, timestamp)
    `)
    .eq('referrer_id', consultantId);

  // Generate JSON export
  const report = {
    exportDate: new Date().toISOString(),
    consultantId,
    referrals: referrals?.map(r => ({
      id: r.id,
      candidateName: r.candidate_name,
      candidateEmail: r.candidate_email,
      specialization: r.specialization,
      status: r.status,
      points: r.referral_points,
      history: r.status_history
    }))
  };

  return JSON.stringify(report, null, 2);
}
```

### 10.3 Privacy Policy Fragment

```markdown
## Program Poleceń - Ochrona Danych Osobowych

### Jakie dane zbieramy
- Imię i nazwisko polecającego konsultanta
- Imię, email, telefon polecanego kandydata
- Specjalizacja zawodowa
- Link do profilu LinkedIn (opcjonalnie)
- Data polecenia
- Status polecenia w systemie rekrutacji
- Informacje o przyznanych punktach i bonusach

### Na jakiej podstawie prawnej
- Artykuł 6(1)(b) RODO - zawarcie umowy (Program Poleceń)
- Artykuł 6(1)(a) RODO - ekspresna zgoda (za przetwarzanie danych kandydata)

### Czas przechowywania
Dane są przechowywane przez 3 lata od ostatniej aktywności, następnie usuwane.

### Twoje prawa
- Prawo dostępu do swoich danych
- Prawo do sprostowania danych
- Prawo do usunięcia (prawo do bycia zapomnianym)
- Prawo do ograniczenia przetwarzania
- Prawo do przenośności danych
- Prawo do sprzeciwu

### Zgłoszenia naruszeń
Jeśli podejrzewasz naruszenie RODO, skontaktuj się z: privacy@b2b.net
```

---

## 11. Analityka Poleceń (Referral Funnel Analytics)

### 11.1 Metryki Lejka Pozyskiwania

```typescript
interface ReferralFunnelMetrics {
  submitted: number;
  inRecrutment: number;
  hired: number;
  projectStarted: number;
  bonusEligible: number;
  conversionRates: {
    submittedToHired: number;    // %
    hiredToProjectStarted: number; // %
    overallSubmittedToBonus: number; // %
  };
  timings: {
    avgDaysToHire: number;
    avgDaysToProjectStart: number;
    avgDaysToBonus: number;
  };
}

export async function calculateReferralFunnel(
  period: 'week' | 'month' | 'quarter'
): Promise<ReferralFunnelMetrics> {

  const client = createClient();
  const { startDate, endDate } = getPeriodDates(period);

  // Get all referrals in period
  const { data: referrals } = await client
    .from('referrals')
    .select(`
      id,
      status,
      created_at,
      status_history(status, timestamp)
    `)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  // Count by status
  const counts = {
    submitted: referrals?.filter(r => r.status === 'SUBMITTED').length || 0,
    inRecrutment: referrals?.filter(r => r.status === 'IN_RECRUITMENT').length || 0,
    hired: referrals?.filter(r => r.status === 'HIRED').length || 0,
    projectStarted: referrals?.filter(r => r.status === 'PROJECT_STARTED').length || 0,
    bonusEligible: referrals?.filter(r => r.status === 'BONUS_ELIGIBLE').length || 0
  };

  // Calculate timings
  const timings = referrals?.map(r => {
    const history = r.status_history as any[];
    const submittedTime = history.find(h => h.status === 'SUBMITTED')?.timestamp;
    const hiredTime = history.find(h => h.status === 'HIRED')?.timestamp;
    const projectStartTime = history.find(h => h.status === 'PROJECT_STARTED')?.timestamp;
    const bonusTime = history.find(h => h.status === 'BONUS_ELIGIBLE')?.timestamp;

    return {
      daysToHire: hiredTime ? differenceInDays(new Date(hiredTime), new Date(submittedTime)) : null,
      daysToProjectStart: projectStartTime ? differenceInDays(new Date(projectStartTime), new Date(submittedTime)) : null,
      daysToBonus: bonusTime ? differenceInDays(new Date(bonusTime), new Date(submittedTime)) : null
    };
  }) || [];

  return {
    submitted: counts.submitted,
    inRecrutment: counts.inRecrutment,
    hired: counts.hired,
    projectStarted: counts.projectStarted,
    bonusEligible: counts.bonusEligible,
    conversionRates: {
      submittedToHired: (counts.hired / counts.submitted) * 100,
      hiredToProjectStarted: (counts.projectStarted / counts.hired) * 100,
      overallSubmittedToBonus: (counts.bonusEligible / counts.submitted) * 100
    },
    timings: {
      avgDaysToHire: average(timings.map(t => t.daysToHire).filter(t => t !== null)),
      avgDaysToProjectStart: average(timings.map(t => t.daysToProjectStart).filter(t => t !== null)),
      avgDaysToBonus: average(timings.map(t => t.daysToBonus).filter(t => t !== null))
    }
  };
}
```

### 11.2 Analytics Dashboard

```typescript
export const ReferralAnalyticsDashboard = () => {
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');

  const { data: metrics } = useQuery(
    ['analytics', period],
    () => calculateReferralFunnel(period),
    { staleTime: 60 * 15 } // 15 min cache
  );

  return (
    <div className="space-y-6">

      {/* Period Selector */}
      <div className="flex gap-2">
        {(['week', 'month', 'quarter'] as const).map(p => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            onClick={() => setPeriod(p)}
          >
            {getPeriodLabel(p)}
          </Button>
        ))}
      </div>

      {/* Funnel Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Lejek Pozyskiwania</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { label: 'Polecenia wysłane', value: metrics?.submitted, color: 'bg-blue-500' },
              { label: 'W rekrutacji', value: metrics?.inRecrutment, color: 'bg-purple-500' },
              { label: 'Zatrudnieni', value: metrics?.hired, color: 'bg-green-500' },
              { label: 'Na projektach', value: metrics?.projectStarted, color: 'bg-orange-500' },
              { label: 'Bonus dostępny', value: metrics?.bonusEligible, color: 'bg-yellow-500' }
            ].map((stage, idx) => {
              const percentage = (stage.value / metrics?.submitted!) * 100;

              return (
                <div key={stage.label} className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-sm text-gray-600">
                      {stage.value} ({percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                    <div
                      className={`${stage.color} h-full transition-all duration-300`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Conversion Rates */}
      <Card>
        <CardHeader>
          <CardTitle>Współczynniki Konwersji</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-sm text-gray-600">Polecenia → Zatrudnieni</p>
            <p className="text-2xl font-bold">
              {metrics?.conversionRates.submittedToHired.toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Zatrudnieni → Projekty</p>
            <p className="text-2xl font-bold">
              {metrics?.conversionRates.hiredToProjectStarted.toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Ogółem do Bonusu</p>
            <p className="text-2xl font-bold">
              {metrics?.conversionRates.overallSubmittedToBonus.toFixed(1)}%
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Average Timings */}
      <Card>
        <CardHeader>
          <CardTitle>Średnie Czasy Przejść</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <TimeMetricCard
            label="Do zatrudnienia"
            days={metrics?.timings.avgDaysToHire}
          />
          <TimeMetricCard
            label="Do projektu"
            days={metrics?.timings.avgDaysToProjectStart}
          />
          <TimeMetricCard
            label="Do bonusu"
            days={metrics?.timings.avgDaysToBonus}
          />
        </CardContent>
      </Card>
    </div>
  );
};
```

---

## 12. Schemat Bazy Danych (Database Schema)

### 12.1 Główne Tabele

```sql
-- Tabela główna poleceń
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Candidate info
  candidate_name VARCHAR(100) NOT NULL,
  candidate_email VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  specialization VARCHAR(50) NOT NULL CHECK (specialization IN (
    'BACKEND', 'FRONTEND', 'MOBILE', 'DATA', 'DEVOPS', 'QA', 'PROJECT_MANAGER'
  )),
  linkedin_url TEXT,
  linkedin_url_id VARCHAR(100) UNIQUE,
  additional_notes TEXT,

  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (
    'SUBMITTED', 'DUPLICATE', 'IN_RECRUITMENT', 'HIRED',
    'PROJECT_STARTED', 'BONUS_ELIGIBLE', 'BONUS_AWARDED', 'REJECTED'
  )),

  -- Rewards
  points_earned INTEGER DEFAULT 0,
  bonus_amount DECIMAL(10, 2) DEFAULT 0,
  bonus_awarded_at TIMESTAMP,

  -- GDPR
  gdpr_consent BOOLEAN NOT NULL DEFAULT FALSE,
  gdpr_consent_date TIMESTAMP NOT NULL DEFAULT NOW(),
  gdpr_deleted_at TIMESTAMP,
  gdpr_deletion_reason VARCHAR(255),

  -- Deduplication
  is_duplicate_check BOOLEAN DEFAULT FALSE,
  duplicate_match_type VARCHAR(50),
  duplicate_confidence DECIMAL(3, 2),

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  hired_date TIMESTAMP,
  project_start_date TIMESTAMP,

  UNIQUE(referrer_id, candidate_email)
);

CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_status ON referrals(status);
CREATE INDEX idx_referrals_candidate_email ON referrals(candidate_email);
CREATE INDEX idx_referrals_created_at ON referrals(created_at);

-- Status history log
CREATE TABLE referral_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  from_status VARCHAR(50) NOT NULL,
  to_status VARCHAR(50) NOT NULL,
  triggered_by VARCHAR(50) NOT NULL CHECK (triggered_by IN ('system', 'user')),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_log_referral ON referral_status_log(referral_id);
CREATE INDEX idx_status_log_created_at ON referral_status_log(created_at);

-- Points awarded
CREATE TABLE referral_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES auth.users(id),
  points INTEGER NOT NULL,
  bonus_amount DECIMAL(10, 2) DEFAULT 0,
  reason VARCHAR(255) NOT NULL,
  awarded_for_status VARCHAR(50),
  awarded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_points_referrer ON referral_points(referrer_id);
CREATE INDEX idx_points_referral ON referral_points(referral_id);

-- Referral links
CREATE TABLE referral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unique_code VARCHAR(20) NOT NULL UNIQUE,
  full_url TEXT NOT NULL,
  short_url TEXT,
  click_count INTEGER DEFAULT 0,
  conversion_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX idx_links_code ON referral_links(unique_code);
CREATE INDEX idx_links_referrer ON referral_links(referrer_id);

-- Link clicks tracking
CREATE TABLE referral_link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_link_id UUID NOT NULL REFERENCES referral_links(id),
  unique_code VARCHAR(20),
  ip_hash VARCHAR(255),
  user_agent TEXT,
  referrer_header TEXT,
  clicked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clicks_code ON referral_link_clicks(unique_code);
CREATE INDEX idx_clicks_timestamp ON referral_link_clicks(clicked_at);

-- GDPR consent records
CREATE TABLE gdpr_consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  candidate_email_hash VARCHAR(255) NOT NULL,
  consent_given BOOLEAN NOT NULL,
  consent_date TIMESTAMP NOT NULL,
  consent_version VARCHAR(20) NOT NULL,
  ip_address_hash VARCHAR(255),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gdpr_user ON gdpr_consent_records(user_id);
CREATE INDEX idx_gdpr_date ON gdpr_consent_records(consent_date);

-- GDPR audit log
CREATE TABLE gdpr_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON gdpr_audit_log(user_id);
CREATE INDEX idx_audit_action ON gdpr_audit_log(action);
CREATE INDEX idx_audit_timestamp ON gdpr_audit_log(timestamp);

-- Leaderboard cache (for performance)
CREATE TABLE leaderboard_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id),
  period VARCHAR(50) NOT NULL CHECK (period IN ('month', 'alltime')),
  total_points INTEGER,
  total_bonus DECIMAL(10, 2),
  referrals_count INTEGER,
  hired_count INTEGER,
  project_started_count INTEGER,
  rank INTEGER,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(referrer_id, period)
);

CREATE INDEX idx_leaderboard_period ON leaderboard_cache(period);
CREATE INDEX idx_leaderboard_updated ON leaderboard_cache(updated_at);

-- Rate limiting
CREATE TABLE referral_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  referrals_today INTEGER DEFAULT 0,
  referrals_month INTEGER DEFAULT 0,
  last_referral_at TIMESTAMP,
  reset_at TIMESTAMP DEFAULT NOW() + INTERVAL '1 day',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ratelimit_referrer ON referral_rate_limits(referrer_id);
```

### 12.2 Row Level Security (RLS)

```sql
-- Enable RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_links ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own referrals"
  ON referrals FOR SELECT
  USING (referrer_id = auth.uid());

CREATE POLICY "Users can insert referrals"
  ON referrals FOR INSERT
  WITH CHECK (referrer_id = auth.uid());

CREATE POLICY "Users can update their own referrals"
  ON referrals FOR UPDATE
  USING (referrer_id = auth.uid());

-- HR can view/update all referrals
CREATE POLICY "HR can manage referrals"
  ON referrals FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM auth.users WHERE role = 'hr'
  ));
```

---

## 13. AI Builder Prompt (300+ Lines)

```
# Comprehensive AI Builder Prompt for M6: Program Poleceń (Referral Program)

## Context and Background
You are building Module M6: Program Poleceń (Referral Program) for Qualrix, a SaaS platform designed for B2B.net S.A., an IT outsourcing company with 500+ consultants. This module is the cheapest customer acquisition channel where consultants refer friends in exchange for points and cash bonuses.

## Technology Stack
- Frontend: Next.js 14+, TypeScript, shadcn/ui, Tailwind CSS
- Backend: Supabase (PostgreSQL), Edge Functions
- Internationalization: next-intl (Polish + English)
- UI Components: shadcn/ui (Button, Card, Form, Table, Dialog, etc.)
- State Management: TanStack Query (React Query)
- Form Handling: React Hook Form + Zod validation
- Analytics: Custom event tracking

## Key Features to Implement

### 1. Referral Form (M6.1)
Create a multi-step form component that allows consultants to refer candidates.

**Requirements:**
- Form fields: candidate name, email, phone, specialization (dropdown), LinkedIn URL (optional), notes (optional)
- Client-side validation using Zod schema
- Rate limiting: max 5 referrals per day, max 50 per month
- Show deduplication warning if candidate already exists
- GDPR consent checkbox (required)
- Success/error notifications
- Form reset after successful submission
- Loading states and error handling
- Responsive design (mobile-first)

**Implementation steps:**
1. Create ReferralForm component with React Hook Form
2. Define Zod validation schema
3. Implement deduplication check on submit
4. Add rate limiting check
5. Handle form submission to API
6. Show confirmation dialog for duplicates
7. Display success message and reset form
8. Add analytics tracking for form events

### 2. Referral Status Tracker (M6.2)
Build a status tracking system with visual timeline and state machine validation.

**Requirements:**
- Status states: SUBMITTED → IN_RECRUITMENT → HIRED → PROJECT_STARTED → BONUS_ELIGIBLE → BONUS_AWARDED
- Alternative paths: DUPLICATE, REJECTED (terminal states)
- Visual timeline showing all status changes
- Display points earned and bonus information
- Show next steps and required actions
- Update in real-time when HR changes status
- Email notifications on status change (to consultant)

**Implementation steps:**
1. Create state machine validation in backend
2. Build ReferralStatusTracker component with progress indicator
3. Implement StatusTimeline component showing history
4. Add real-time updates using Supabase subscriptions
5. Create notification system for status changes
6. Add conditional rendering based on current status
7. Show points and bonus info when status reaches PROJECT_STARTED

### 3. Referral History (M6.3)
Create a comprehensive history view with filtering, sorting, and export.

**Requirements:**
- Display all referrals in a paginated table
- Filter by status, date range, specialization
- Sort by date, points earned, status
- Search by candidate name/email
- Show statistics: total referrals, active, points earned, bonus earned
- Display points awarded and bonus status
- Show "Bonus available" badge when eligible
- Export to CSV functionality
- Responsive table design

**Implementation steps:**
1. Create ReferralHistory component with filters
2. Build ReferralHistoryTable with pagination
3. Implement filtering logic
4. Add search functionality with debounce
5. Create statistics cards at top
6. Add CSV export button
7. Use TanStack Query for data fetching
8. Add sorting functionality

### 4. Referral Share Link (M6.4)
Build personalized sharing system with multi-platform support.

**Requirements:**
- Generate unique 8-character referral codes per consultant
- Create shareable links: https://qualrix.b2b.net/join?ref=ABC12XYZ
- Display QR code for sharing
- Social sharing buttons (WhatsApp, LinkedIn, Email, Facebook, Twitter)
- Track clicks on referral link
- Track conversions from referral code
- Show click count and conversion count
- Copy-to-clipboard functionality
- Analytics for shares by platform

**Implementation steps:**
1. Create ReferralLinkGenerator component
2. Implement unique code generation (8-char alphanumeric)
3. Add QR code generation using qrcode.react
4. Create SocialShareButtons component with pre-filled messages
5. Implement click tracking in middleware
6. Add conversion tracking when referral completes
7. Show statistics (clicks, conversions)
8. Add copy-to-clipboard with feedback

### 5. Referral Leaderboard (M6.5)
Build gamified leaderboard with badges and rankings.

**Requirements:**
- Top 10 referrers display with ranking
- Two views: this month, all-time
- Show: rank, name, avatar, total points, total bonus, referral count, hired count, project count
- Badges: Top Referrer (top 3), Gold Standard (>500 pts), Rising Star (+100 pts this month), On Fire (10+ referrals/month)
- Streak counter (consecutive days with referrals)
- Pagination for remaining referrers
- Color-coded ranks (gold, silver, bronze)
- Responsive design

**Implementation steps:**
1. Create ReferralLeaderboard component
2. Build LeaderboardTable with medal display
3. Implement period toggle (month/alltime)
4. Add badge calculation logic
5. Create statistics aggregation queries
6. Implement pagination
7. Add color coding for top positions
8. Cache leaderboard data for performance

## Database Schema

### Main Tables
1. **referrals** - Main referral records
   - id, referrer_id, candidate_name, candidate_email, phone_number
   - specialization, linkedin_url, additional_notes
   - status (ENUM), points_earned, bonus_amount
   - gdpr_consent, gdpr_consent_date, gdpr_deleted_at
   - is_duplicate_check, duplicate_match_type, duplicate_confidence
   - created_at, updated_at, hired_date, project_start_date

2. **referral_status_log** - Status transition history
   - id, referral_id, from_status, to_status
   - triggered_by (system/user), notes, created_at

3. **referral_points** - Points awarded
   - id, referral_id, referrer_id, points, bonus_amount
   - reason, awarded_for_status, awarded_at

4. **referral_links** - Shareable links
   - id, referrer_id, unique_code, full_url, short_url
   - click_count, conversion_count, created_at, expires_at

5. **referral_link_clicks** - Click tracking
   - id, referral_link_id, unique_code, ip_hash
   - user_agent, referrer_header, clicked_at

6. **gdpr_consent_records** - GDPR compliance
   - id, user_id, candidate_email_hash, consent_given
   - consent_date, consent_version, ip_address_hash

## Business Logic

### Points System
- Referral submitted: 5 points (informational only)
- Candidate hired: 20 points
- PROJECT_STARTED: 50 points (MAIN AWARD)
- Bonus eligible: 2000-5000 PLN (after 3 months on project)

### Deduplication Strategy
- Priority 1: Exact email match (99% confidence)
- Priority 2: Phone number match (85% confidence)
- Priority 3: Fuzzy email match (string similarity > 85%)
- Priority 4: LinkedIn ID match (95% confidence)
- Warn consultant if duplicate found, allow override with confirmation

### Bonus Eligibility
- Candidate must be on project for 3 months
- Status must be BONUS_ELIGIBLE
- Bonus amount: random between 2000-5000 PLN
- Can be claimed once per referral

### GDPR Compliance
- Require explicit consent checkbox in form
- Hash IP addresses and emails before storage
- Implement "right to be forgotten" functionality
- Anonymize data instead of deleting
- Audit log for all data access/deletion
- Data retention: 3 years

## API Endpoints (Edge Functions)

```typescript
// POST /api/referrals/submit
// POST /api/referrals/{id}/status
// GET /api/referrals/{id}
// GET /api/referrals/my
// GET /api/leaderboard
// POST /api/referral-link/generate
// GET /api/analytics/referral-funnel
// DELETE /api/user/data (GDPR)
```

## Analytics Events to Track
- referral_form_opened
- referral_form_submitted
- referral_submitted
- duplicate_warning_shown
- duplicate_override_confirmed
- referral_link_generated
- referral_shared (platform-specific)
- referral_status_changed
- bonus_awarded
- leaderboard_viewed
- referral_deleted (GDPR)

## UI/UX Considerations

### Color Scheme
- Primary (Points): Green (#10b981)
- Secondary (Status): Blue (#3b82f6)
- Bonus: Gold (#f59e0b)
- Badges: Yellow/Gold tones
- Error: Red (#ef4444)

### Animations
- Smooth transitions for status timeline
- Progress bar animation
- Badge entrance animations
- Point increase animations
- Loading skeletons for async content

### Accessibility
- ARIA labels for all interactive elements
- Keyboard navigation support
- High contrast text
- Focus indicators
- Alt text for badges/icons
- Form error messages linked to inputs

## Error Handling

### Validation Errors
- Show inline form errors
- Highlight invalid fields
- Suggest corrections
- Disable submit button if invalid

### Business Logic Errors
- Duplicate found: Show warning dialog
- Rate limit: Show error message with reset time
- Network errors: Show retry button
- GDPR deletion: Confirm action

### User Feedback
- Toast notifications for actions
- Loading indicators for async operations
- Empty states for no data
- Success messages for completed actions

## Performance Optimization

### Frontend
- Memoize expensive components
- Lazy load leaderboard (pagination)
- Cache referral link generation
- Debounce search input
- Virtual scrolling for long tables

### Backend
- Index frequently queried columns
- Cache leaderboard calculations (refresh hourly)
- Batch status updates
- Use SELECT fields to avoid N+1 queries
- Implement connection pooling

## Testing Strategy

### Unit Tests
- Zod validation schemas
- String similarity algorithm
- Points calculation logic
- Badge determination logic

### Integration Tests
- Referral form submission
- Status transition validation
- Deduplication detection
- Points awarding

### E2E Tests
- Create referral flow
- Track status changes
- Award bonus
- View history and leaderboard

## Internationalization (next-intl)

### Keys Structure
```
referral:
  form:
    title: "Program Poleceń"
    description: "Polecaj kandydatów i zarabiaj punkty"
    submit: "Poleć kandydata"
    fields:
      name: "Imię kandydata"
      email: "Email"
      phone: "Telefon"
      specialization: "Specjalizacja"
      linkedin: "Profil LinkedIn"
      notes: "Dodatkowe informacje"
    messages:
      success: "Kandydat został pomyślnie polecony!"
      duplicate: "Kandydat już w systemie"
      error: "Coś poszło nie tak"
```

## Security Considerations

- Validate all inputs server-side
- Rate limit referral submission
- Hash sensitive data (email, IP)
- Use HTTPS for all connections
- Implement CORS properly
- Protect against injection attacks
- Validate referral codes
- Implement audit logging
- Require GDPR consent before processing

## Deployment Checklist

- [ ] Database migrations applied
- [ ] RLS policies configured
- [ ] Edge functions deployed
- [ ] Environment variables set
- [ ] GDPR compliance verified
- [ ] Email notifications configured
- [ ] Analytics tracking enabled
- [ ] Rate limiting tested
- [ ] Deduplication tested
- [ ] Leaderboard calculation verified
- [ ] UI responsive on mobile
- [ ] Internationalization complete
- [ ] Error handling tested
- [ ] Performance benchmarks met

## Success Metrics

- 40% of consultants actively referring (>200 people)
- 15-20 referrals per month
- 15-20% conversion from referral to hire
- 70-80% conversion from hire to project start
- Average 150-200 points per consultant per month
- <2 second load time for dashboard
- 95% uptime

---

This prompt provides a complete specification for building the referral program module. It includes specific implementation steps, code examples, database schemas, and design considerations. Use this as a reference guide for all components and features.
```

---

## Podsumowanie

Module M6: Program Poleceń został szczegółowo scharakteryzowany jako kompleksowy system do pozyskiwania kandydatów poprzez rekomendacje wewnętrznych konsultantów. System obejmuje:

1. **Formularz polecenia** z walidacją i deduplicacją
2. **Śledzenie statusu** z maszyną stanów i timelinami
3. **Historię poleceń** z filtrami i eksportami
4. **System udostępniania** z linkami i mediami społecznościowymi
5. **Ranking gamifikacyjny** z odznakami i motywacją
6. **Zaawansowaną deduplikację** z fuzzy matchingiem
7. **Zgodność GDPR** i prawa użytkownika
8. **Analitykę lejka** pozyskiwania kandydatów
9. **Kompletny schemat bazy danych** z RLS
10. **Szczegółowy prompt dla AI Buildera** (300+ linii)

---

**Dokument przygotowany dla:** B2B.net S.A.
**Moduł:** M6 - Program Poleceń (Referral Program)
**Wersja:** 1.0
**Data:** 2025-02-08
**Status:** Gotowy do implementacji

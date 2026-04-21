# Module M10: Consultant Success Hub
## Specyfikacja Modułu

**Aplikacja:** Qualrix
**Wydawca:** B2B.net S.A.
**Moduł:** M10 - Consultant Success Hub
**Data Dokumentacji:** 2026-02-08
**Wersja:** 1.0
**Status:** Specyfikacja Techniczna

---

## 1. Streszczenie Modułu

Module M10: Consultant Success Hub jest narzędziem umożliwiającym Consultant Success Managers (CSM) proaktywne zarządzanie relacjami z konsultantami w ekosystemie IT outsourcingu. W kontekście B2B.net S.A. z bazą 500+ konsultantów, moduł automatyzuje cykl ewaluacji, zbiera strukturyzowane opinie klientów, śledzi historię interakcji i dostarcza insights dotyczące satysfakcji i zaangażowania personelu.

Moduł integruje się z:
- **M4 (Health Score)** - dane z Pulse Survey wpływają na wynik zdrowotny konsultanta
- **Systemem harmonogramu** - automatyczne przypomnienia o check-inach
- **Formami opinii** - zbieranie informacji zwrotnych od Account Managerów
- **Analityką** - agregacja wyników ankiet i trendy

---

## 2. Cele i Wartość Biznesowa

### 2.1 Cele Strategiczne
- **Proaktywne zarządzanie**: Automatyczne przypomnienia o check-inach uniemożliwiają przeoczeń ważnych interakcji
- **Oparta na danych ewaluacja**: Pulse Survey dostarcza obiektywne dane dotyczące satysfakcji konsultantów
- **Retencja personelu**: Wczesne identyfikowanie problemów poprzez monitoring Health Score
- **Ciągłe doskonalenie**: Historyczne dane umożliwiają śledzenie trendu w zakresie zaangażowania

### 2.2 Wartość dla Użytkowników
- **CSM**: Ustrukturyzowany proces zarządzania relacjami, automatyzacja harmonogramu, dostęp do opinion zwrotnych
- **Account Managery**: Możliwość szybkiego zgłaszania informacji zwrotnych poprzez formę
- **Kierownictwo**: Dashboard z agregatywnym widokiem satysfakcji i trendem
- **Konsultanci**: Świadomość wspierającego podejścia do ich rozwoju zawodowego

### 2.3 Metryki Sukcesu
- Wzrost liczby planowanych check-inów o 60%
- Redukcja czasu poświęconego na planowanie interakcji o 40%
- Podwyższenie Average Net Promoter Score o 15 punktów w ciągu 6 miesięcy
- 85%+ współczynnik uzupełniania Pulse Survey

---

## 3. Architektura i Przepływy Danych

### 3.1 Komponenty Główne

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONSULTANT SUCCESS HUB (M10)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ CSM Dashboard    │  │ Check-in         │  │ Pulse Survey │  │
│  │ - Konsultanci    │  │ Scheduler        │  │ - 3 pytania  │  │
│  │ - Timeline       │  │ - 30-dniowy      │  │ - 15 sekund  │  │
│  │ - Health Score   │  │   cykl           │  │ - Agregacja  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘  │
│           │                     │                   │          │
│  ┌────────▼─────────────────────▼───────────────────▼──────┐   │
│  │         Supabase Database Layer                        │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ Tables: consultants, check_ins, feedback,       │   │   │
│  │  │         pulse_surveys, health_scores            │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └────────┬──────────────────────────────────────────────┘   │
│           │                                                    │
│  ┌────────▼──────────────────────────────────────────────┐   │
│  │  Integration Layer                                   │   │
│  │  - M4 (Health Score) API                            │   │
│  │  - Notification Service (email, in-app)             │   │
│  │  - Analytics Engine                                  │   │
│  └────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Przepływ Danych - Cykl Check-in

```
1. Scheduler (każde 30 dni)
   ↓
2. Generowanie przypomnienia dla CSM
   ↓
3. CSM inicjuje check-in
   ↓
4. Jeśli rozmowa z Account Managerem:
   → Formularz opinii (M10.1)
   ↓
5. Notatki z rozmowy (M10.2)
   ↓
6. Rekomendacje rozwojowe (M10.3)
   ↓
7. Pulse Survey (M10.5)
   ↓
8. Aktualizacja Health Score (M4 integration)
   ↓
9. Dodanie do Timeline (chronologiczny zapis)
```

---

## 4. M10.1: Formularz Opinii Klienta

### 4.1 Cel i Kontekst
Formularz opinii klienta jest zbierany **po rozmowie konsultanta z Account Managerem**. Stanowi ustrukturyzowane źródło informacji zwrotnych dotyczące zdolności konsultanta, zaangażowania i potencjału rozwojowego.

### 4.2 Struktura Formularza

```
┌─────────────────────────────────────────┐
│  FORMULARZ OPINII O KONSULTANCIE        │
│  (Client Feedback Form)                 │
└─────────────────────────────────────────┘

Sekcja 1: Identyfikacja
- Konsultant (select/autocomplete)
- Account Manager (auto-fill)
- Data rozmowy (date picker)
- Projekt (optional select)

Sekcja 2: Ocena Kompetencji (1-5 skala)
□ Wiedza techniczna
  └─ Opis: Zrozumienie technologii i best practices
□ Umiejętności komunikacyjne
  └─ Opis: Zdolność do jasnego wyjaśniania
□ Niezawodność
  └─ Opis: Terminowość i konsekwencja
□ Zaangażowanie
  └─ Opis: Pasja i dedykacja do pracy

Sekcja 3: Opinie Tekstowe
□ Mocne strony (textarea, 500 znaków)
□ Obszary do poprawy (textarea, 500 znaków)
□ Rekomendacje (textarea, 300 znaków)

Sekcja 4: Przyszłość
□ Czy chciałbyś pracować z tym konsultantem w przyszłości?
  - Zdecydowanie tak
  - Tak
  - Neutralnie
  - Nie
  - Zdecydowanie nie
□ Potencjał do awansu (Yes/No/Not sure)

Sekcja 5: Dodatkowe Informacje
□ Czy raport powinien być widoczny dla konsultanta? (Yes/No)
□ Priorytete dla następnegoCheck-in (select)
  - Brak
  - Niski
  - Średni
  - Wysoki
```

### 4.3 Specyfikacja Danych

```typescript
interface ClientFeedback {
  id: string;
  consultant_id: string;
  account_manager_id: string;
  check_in_id: string;
  conversation_date: Date;
  project_id?: string;

  // Kompetencje (1-5)
  technical_knowledge: number;
  communication_skills: number;
  reliability: number;
  engagement: number;

  // Opinie tekstowe
  strengths: string;
  areas_for_improvement: string;
  recommendations: string;

  // Przyszłość
  willing_to_work_again: 'definitely_yes' | 'yes' | 'neutral' | 'no' | 'definitely_no';
  promotion_potential: boolean | null;

  // Metadane
  visible_to_consultant: boolean;
  next_checkin_priority: 'none' | 'low' | 'medium' | 'high';
  created_at: Date;
  updated_at: Date;

  // Agregacja
  average_score: number; // średnia z 4 kompetencji
  sentiment_score: number; // -1 do 1, wyliczane z tekstu
}
```

### 4.4 Logika Biznesowa
- Formularz może być uzupełniony tylko przez autoryzowanego Account Managera
- Po wysłaniu, notification trafia do CSM
- System wylicza średnią ocenę (`average_score`)
- Jeśli średnia < 3.0, automatycznie oznacz jako "High Priority" dla CSM
- Dane zasilają M4 (Health Score) - patrz sekcja 12

---

## 5. M10.2: Historia Check-inów z Notatkami

### 5.1 Cel
Moduł M10.2 stanowi chronologiczny rejestr wszystkich interakcji między CSM a konsultantem, zawierający notatki z rozmów, ustalenia i odsyłacze do powiązanych danych.

### 5.2 Struktura Widoku

```
┌────────────────────────────────────────────────────────────────┐
│          HISTORIA CHECK-INÓ (Check-in History)                 │
│          Konsultant: John Smith [ID: CST-2025-001]            │
└────────────────────────────────────────────────────────────────┘

Timeline View (Chronological):

2026-02-08 | 09:30 | CSM: Anna Kowalska
┌─────────────────────────────────────────────────────────────┐
│ CHECK-IN - Planowany                                       ▼ │
│ Typ: Regular 30-day check-in                              │ │
│ Status: Zaplanowany na 2026-02-15                         │ │
│ Notatki: Brak (do uzupełnienia)                           │ │
│ Attachments: -                                             │ │
└─────────────────────────────────────────────────────────────┘

2026-01-09 | 14:15 | CSM: Anna Kowalska
┌─────────────────────────────────────────────────────────────┐
│ CHECK-IN - Ukończony                                       ▼ │
│ Typ: Regular 30-day check-in                              │ │
│ Notatki:                                                   │ │
│ "John showed great progress on React skills. Discussed    │ │
│  potential promotion. Recommended focusing on system       │ │
│  design. Next focus: lead developer certification."       │ │
│                                                             │ │
│ Linked Feedback: ✓ Available (click to view)              │ │
│ Development Recommendations: ✓ 3 actions assigned         │ │
│ Survey Response: ✓ Completed (4.2/5.0)                   │ │
│                                                             │ │
│ Participants: John Smith, Anna Kowalska                   │ │
│ Duration: 45 minutes (14:15-15:00)                        │ │
│ Location: Zoom (link archive)                              │ │
│ Tags: [React] [Career Development] [High Performer]      │ │
│                                                             │ │
│ [View Feedback] [View Recommendations] [View Survey]      │ │
└─────────────────────────────────────────────────────────────┘

2025-12-10 | 10:00 | CSM: Anna Kowalska
┌─────────────────────────────────────────────────────────────┐
│ CHECK-IN - Ukończony                                       ▼ │
│ Typ: Ad-hoc (Problem identified)                          │ │
│ Notatki:                                                   │ │
│ "Consultant expressed concerns about project scope        │ │
│  changes. Discussed stakeholder expectations. Referred    │ │
│  to PMO for formal scope review."                         │ │
│                                                             │ │
│ Linked Feedback: ✓ Available                              │ │
│ Priority: HIGH - Follow-up required                       │ │
│ Status: Awaiting PMO response                              │ │
│                                                             │ │
│ [View Details] [Create Follow-up]                         │ │
└─────────────────────────────────────────────────────────────┘

[Load More] [Filter by Type] [Export Timeline]
```

### 5.3 Specyfikacja Modelu Danych

```typescript
interface CheckIn {
  id: string;
  consultant_id: string;
  csm_id: string;

  // Podstawowe informacje
  scheduled_date: Date;
  actual_date?: Date;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled';
  check_in_type: 'regular_30day' | 'ad_hoc' | 'emergency' | 'feedback_session';

  // Notatki i kontekst
  notes: string; // do 2000 znaków
  participants: string[]; // lista ID osób
  duration_minutes?: number;
  meeting_link?: string;
  recording_link?: string;

  // Powiązania
  client_feedback_id?: string; // M10.1
  recommendations_id?: string; // M10.3
  survey_response_id?: string; // M10.5
  project_ids?: string[];

  // Tagi i kategoryzacja
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  requires_follow_up: boolean;
  follow_up_actions?: FollowUpAction[];

  // Metadane
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

interface FollowUpAction {
  id: string;
  check_in_id: string;
  description: string;
  assigned_to: string;
  due_date: Date;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  linked_recommendation_id?: string;
}
```

### 5.4 Funkcjonalności

- **Chronologiczny widok**: Wszystkie check-iny sortowane od najnowszego
- **Filtry**: Po typie, statusie, CSM, projektach, tagach
- **Wyszukiwanie**: Full-text search w notatkach
- **Export**: CSV z wybranym zakresom dat
- **Linkowanie**: Szybki dostęp do powiązanego feedbacku, rekomendacji, ankiet
- **Edycja**: CSM może edytować notatki (z audit trail)
- **Follow-up tracking**: Status akcji wymagających podjęcia

---

## 6. M10.3: Rekomendacje Rozwojowe

### 6.1 Cel i Kontekst
M10.3 umożliwia CSM definiowanie konkretnych, mierzalnych rekomendacji dla konsultanta na podstawie feedback'u z M10.1 i notatek z M10.2. Rekomendacje są przekazywane konsultantowi i śledzone pod względem postępu.

### 6.2 Struktura Rekomendacji

```
┌────────────────────────────────────────────────────────────┐
│       REKOMENDACJE ROZWOJOWE (Development Recommendations) │
│       Konsultant: John Smith                               │
│       CSM: Anna Kowalska                                   │
│       Data utworzenia: 2026-01-09                          │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ REC-2026-0042                                             │
│ Tytył: Master React Performance Optimization              │
│                                                             │
│ Kategoria: Technical Skill Development                    │
│ Priorytet: High                                           │
│ Status: In Progress (75%)                                 │
│                                                             │
│ Opis:                                                      │
│ "Focus on advanced React optimization techniques:          │
│  - Memoization and useCallback patterns                   │
│  - Bundle size analysis with webpack-bundle-analyzer      │
│  - Profiling with Chrome DevTools                         │
│  - Server-side rendering (Next.js)"                       │
│                                                             │
│ Uzasadnienie: "Client feedback indicated performance      │
│ optimization was critical for the upcoming project        │
│ phase. John has solid fundamentals but needs to deepen   │
│ knowledge in production-level optimization."              │
│                                                             │
│ Expected Outcome:                                          │
│ - Complete 2 online courses (Udemy/Pluralsight)          │
│ - Lead performance audit for current project              │
│ - Document best practices in internal wiki                │
│                                                             │
│ Success Metrics:                                           │
│ □ 80% completion of course modules                        │
│ □ Audit report delivered and reviewed                     │
│ □ Recommendation score: 4.0+ in next feedback             │
│                                                             │
│ Timeline:                                                  │
│ Start: 2026-01-09 | Target: 2026-04-09 (3 months)       │
│ Checkpoints: 2026-02-09, 2026-03-09                      │
│                                                             │
│ Resources:                                                 │
│ • React docs: https://react.dev/learn                    │
│ • Course: "Advanced React" (Pluralsight)                  │
│ • Internal: Performance wiki section                      │
│ • Mentor: Senior Architect (Michael Zhang)                │
│                                                             │
│ [Mark as Complete] [Edit] [Archive]                       │
│ [View Progress] [Add Checkpoint] [Assign Mentor]          │
└────────────────────────────────────────────────────────────┘

Status: 2/3 checkpoints passed
Progress Chart: ▓▓▓▓▓▓▓▓░░░ 75%

Recent Update (2026-02-01):
"Completed Udemy course 'React Optimization Patterns'.
Currently reviewing bundle size optimization. On track
for April deadline."
```

### 6.3 Specyfikacja Modelu Danych

```typescript
interface Recommendation {
  id: string;
  consultant_id: string;
  csm_id: string;
  check_in_id?: string;

  // Identyfikacja
  title: string;
  description: string;
  category: 'technical' | 'soft_skills' | 'career' | 'health' | 'other';

  // Kontekst
  rationale: string; // dlaczego ta rekomendacja?
  linked_feedback_id?: string; // z M10.1
  linked_survey_ids?: string[]; // z M10.5

  // Definicja sukcesu
  expected_outcome: string;
  success_metrics: SuccessMetric[];
  success_criteria: string[];

  // Oś czasu
  start_date: Date;
  target_completion_date: Date;
  checkpoints: Checkpoint[];

  // Zasoby i wsparcie
  resources: Resource[];
  assigned_mentor?: string; // ID mentor
  budget?: number; // np. na kursy

  // Śledzenie
  status: 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'archived';
  progress_percentage: number; // 0-100
  progress_notes: ProgressUpdate[];

  // Widoczność
  visible_to_consultant: boolean;
  shared_with_others?: string[];

  // Metadane
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: Date;
  updated_at: Date;
}

interface SuccessMetric {
  id: string;
  description: string;
  target_value: string;
  current_value?: string;
  measurement_method: string;
  is_completed: boolean;
}

interface Checkpoint {
  id: string;
  name: string;
  due_date: Date;
  description?: string;
  is_completed: boolean;
  completed_date?: Date;
  notes?: string;
}

interface Resource {
  id: string;
  title: string;
  type: 'course' | 'book' | 'link' | 'internal' | 'mentoring' | 'conference';
  url?: string;
  description?: string;
  estimated_hours?: number;
}

interface ProgressUpdate {
  id: string;
  timestamp: Date;
  updated_by: string;
  progress_percentage: number;
  notes: string;
}
```

### 6.4 Workflow Rekomendacji

```
1. CSM tworzy rekomendację po check-in'ie
   ├─ Ustawia priorytet i kategorie
   ├─ Definiuje miary sukcesu
   └─ Planuje checkpointy

2. System wysyła notifikację do konsultanta
   └─ Konsultant widzi rekomendację w swoim panelu

3. CSM przydzela mentora (opcjonalnie)
   └─ Mentor otrzymuje notifikację

4. Tracking Progress
   ├─ CSM i konsultant dodają aktualizacje
   ├─ System śledzi procent ukończenia
   └─ Przypomnienia na checkpointach

5. Completion Review
   ├─ Weryfikacja metryki sukcesu
   ├─ Feedback do konsultanta
   └─ Archiwizacja + wyliczenie wpływu na Health Score (M4)
```

### 6.5 Notyfikacje
- **Tworzenie**: Powiadomienie do konsultanta + mentora
- **Checkpoint**: Przypomnienie 3 dni przed terminem
- **Opóźnienie**: Alert jeśli data docelowa mija bez statusu "completed"
- **Completion**: Gratulacje i oferta nowej rekomendacji

---

## 7. M10.4: Scheduler - Automatyczne Przypomnienia Check-inów

### 7.1 Cel
M10.4 to system harmonogramu, który automatycznie zarządza cyklem 30-dniowych check-inów, wysyła przypomnienia CSM i zapobiega przeoczeń w zarządzaniu relacjami.

### 7.2 Konfiguracja Cyklu

```
┌────────────────────────────────────────────────┐
│     KONFIGURACJA CYKLU CHECK-IN (30 DAYS)     │
└────────────────────────────────────────────────┘

Default Schedule:
- Interval: 30 dni (konfigurowalny: 14, 30, 60 dni)
- Reminder #1: 7 dni przed
- Reminder #2: 3 dni przed
- Reminder #3: 1 dzień przed
- Overdue Alert: 7 dni po terminie

Per-Consultant Settings:
┌─────────────────────────────────────────────┐
│ Konsultant: John Smith (CST-2025-001)      │
│ Scheduled by: Anna Kowalska (CSM)          │
│                                              │
│ ☑ Active monitoring                         │
│ ☑ Auto-schedule enabled                     │
│ □ Require feedback collection               │
│ □ Require survey response                   │
│ ☑ Escalate if overdue > 7 days              │
│                                              │
│ Preferred Check-in Day: Monday              │
│ Preferred Time: 10:00 AM                    │
│ Preferred Method: Zoom (calendar link)      │
│ Time Zone: Europe/Warsaw                    │
│                                              │
│ [Save] [Reset to Default]                   │
└─────────────────────────────────────────────┘
```

### 7.3 Logika Automatyzacji

```typescript
interface CheckInSchedule {
  id: string;
  consultant_id: string;
  csm_id: string;

  // Konfiguracja
  is_active: boolean;
  interval_days: number; // 14, 30, 60
  start_date: Date;

  // Preferencje
  preferred_day_of_week?: number; // 0-6 (0=Monday)
  preferred_time?: string; // HH:MM
  preferred_method: 'zoom' | 'teams' | 'phone' | 'in_person' | 'async';
  time_zone: string; // Europe/Warsaw

  // Reminders
  reminder_days: number[]; // [7, 3, 1]

  // Warunki
  require_feedback: boolean;
  require_survey: boolean;
  escalate_if_overdue_days: number; // 7
  escalate_to?: string; // ID escalation manager

  // Historia
  last_check_in_date?: Date;
  next_scheduled_date?: Date;
  upcoming_scheduled_dates?: Date[];

  created_at: Date;
  updated_at: Date;
}

// Cron Job - Runs Daily
async function processCheckInSchedule() {
  const schedules = await getActiveSchedules();

  for (const schedule of schedules) {
    const today = new Date();

    // Check if next check-in is coming up
    if (schedule.next_scheduled_date) {
      const daysUntil = calculateDaysDifference(
        today,
        schedule.next_scheduled_date
      );

      // Reminder #1: 7 days before
      if (daysUntil === 7) {
        await sendReminder(schedule, 'week_before');
      }

      // Reminder #2: 3 days before
      if (daysUntil === 3) {
        await sendReminder(schedule, 'three_days_before');
      }

      // Reminder #3: 1 day before
      if (daysUntil === 1) {
        await sendReminder(schedule, 'day_before');
      }
    }

    // Overdue handling
    if (schedule.last_check_in_date) {
      const daysSinceLastCheckIn = calculateDaysDifference(
        today,
        schedule.last_check_in_date
      );

      if (
        daysSinceLastCheckIn >
        (schedule.interval_days + schedule.escalate_if_overdue_days)
      ) {
        await escalateOverdue(schedule);
      }
    }

    // Auto-create next scheduled check-in
    if (daysSinceLastCheckIn >= schedule.interval_days) {
      await createNextCheckIn(schedule);
    }
  }
}

async function sendReminder(
  schedule: CheckInSchedule,
  reminderType: string
) {
  const csm = await getUser(schedule.csm_id);
  const consultant = await getConsultant(schedule.consultant_id);

  const emailContent = await renderEmailTemplate(
    'check_in_reminder',
    {
      csm_name: csm.name,
      consultant_name: consultant.name,
      scheduled_date: schedule.next_scheduled_date,
      reminder_type: reminderType,
    }
  );

  await sendEmail({
    to: csm.email,
    subject: `Check-in Reminder: ${consultant.name}`,
    html: emailContent,
    cc: schedule.escalate_to ? [await getUser(schedule.escalate_to)].email : [],
  });

  // In-app notification
  await createNotification({
    user_id: schedule.csm_id,
    type: 'check_in_reminder',
    title: `Upcoming check-in with ${consultant.name}`,
    message: `Scheduled for ${formatDate(schedule.next_scheduled_date)}`,
    action_url: `/dashboard/check-ins/${consultant.id}`,
  });
}

async function escalateOverdue(schedule: CheckInSchedule) {
  const daysMissed = calculateDaysDifference(
    new Date(),
    new Date(
      schedule.last_check_in_date.getTime() +
      (schedule.interval_days + schedule.escalate_if_overdue_days) * 24 * 60 * 60 * 1000
    )
  );

  const escalationManager = schedule.escalate_to ||
    await getDefaultEscalationManager(schedule.csm_id);

  await createAlert({
    type: 'overdue_check_in',
    priority: daysMissed > 14 ? 'critical' : 'high',
    consultant_id: schedule.consultant_id,
    csm_id: schedule.csm_id,
    assigned_to: escalationManager,
    message: `Check-in overdue by ${daysMissed} days`,
  });
}

async function createNextCheckIn(schedule: CheckInSchedule) {
  const nextDate = calculateNextScheduledDate(
    new Date(),
    schedule.preferred_day_of_week,
    schedule.preferred_time,
    schedule.time_zone
  );

  await createCheckIn({
    consultant_id: schedule.consultant_id,
    csm_id: schedule.csm_id,
    scheduled_date: nextDate,
    status: 'scheduled',
    check_in_type: 'regular_30day',
    priority: 'medium',
  });

  // Update schedule
  await updateCheckInSchedule(schedule.id, {
    next_scheduled_date: nextDate,
    upcoming_scheduled_dates: [nextDate, ...schedule.upcoming_scheduled_dates],
  });
}
```

### 7.4 Panel Harmonogramu

```
┌────────────────────────────────────────────────────┐
│          PANEL HARMONOGRAMU (Scheduler Dashboard)  │
│          CSM: Anna Kowalska                        │
└────────────────────────────────────────────────────┘

Metryki:
- Liczba aktywnych monitoringów: 47
- Check-iny wymagane dzisiaj: 3
- Zaplanowane na ten tydzień: 12
- Przeterminowane: 1 🔴
- Średni czas realizacji: 3.2 dni

┌─ Przypomnienia dzisiaj ─────────────────────────┐
│ 🔴 1 OVERDUE: Mark Johnson (17 dni bez check-in) │
│ 🟡 2 TODAY: Lisa Chen, Robert Nowak               │
│ 🟢 7 UPCOMING: Next 7 days                         │
└────────────────────────────────────────────────────┘

┌─ Kalendarz ─────────────────────────────────────┐
│ Luty 2026                                        │
│                                                  │
│ Po  Wt  Śr  Cz  Pt  So  Ni                      │
│              1   2   3   4                       │
│ 5   6   7   8   9  10  11                       │
│                 [10] ← Dzisiaj                   │
│ 12  13  14  15  16  17  18                      │
│     [13][14][15][16][17]  ← 5 check-inów       │
│ 19  20  21  22  23  24  25                      │
│     [20]      [22]        ← 2 check-iny         │
│ 26  27  28                                       │
│                                                  │
└────────────────────────────────────────────────────┘

┌─ Kolejne Check-iny ─────────────────────────────┐
│ [filters: Priority | Status | Consultant]      │
│                                                  │
│ 🔴 TODAY 10:00 | Mark Johnson      | OVERDUE   │
│    Email: m.johnson@company.com | [Video Call]│
│                                                  │
│ 🟢 TODAY 14:00 | Lisa Chen         | On Track  │
│    Email: l.chen@company.com   | [Video Call]│
│                                                  │
│ 🟢 WED  09:00 | Robert Nowak       | Scheduled │
│    Email: r.nowak@company.com  | [Video Call]│
│                                                  │
│ 🟢 FRI  15:00 | Sofia Rodriguez    | Scheduled │
│    Email: s.rodriguez@company.com | [Teams]    │
│                                                  │
│ [Load More] [Export] [Bulk Actions]            │
└────────────────────────────────────────────────────┘
```

---

## 8. M10.5: Pulse Survey - Mikro-Ankieta Satysfakcji

### 8.1 Cel i Kontekst
M10.5 to szybka ankieta (15 sekund, 3 pytania) wykonywana po każdym check-in'ie. Gromadzi punktowe dane dotyczące satysfakcji, zaangażowania i gotowości rekomendacji konsultanta.

### 8.2 Struktura Ankiety

```
┌────────────────────────────────────────────────┐
│  PULSE SURVEY - Szybka Ankieta Satysfakcji    │
│  (Oczekiwany czas: 15 sekund)                  │
└────────────────────────────────────────────────┘

Kampania: Check-in Follow-up #2026-0142
Konsultant: John Smith (CST-2025-001)
CSM: Anna Kowalska
Data check-in'u: 2026-01-09

────────────────────────────────────────────────

📊 PYTANIE 1: SATYSFAKCJA (Satisfaction)

"Na ile jesteś zadowolony z ogólnym kierunku
swojej kariery w B2B.net S.A.?"

Response Type: 7-point Likert Scale (NPS-style)
Visual: Emoticon slider (😞 → 😊)

Scale:
0  1  2  3  4  5  6  7  8  9  10
   |  |  |  |  |  |  |  |  |  |
😞                         😊
Detractors (0-6) | Passives (7-8) | Promoters (9-10)

Optional follow-up text:
"Czemu wybrałeś tę ocenę? (max 100 znaków)"
[Text input: optional]

────────────────────────────────────────────────

💼 PYTANIE 2: ZAANGAŻOWANIE (Engagement)

"Ile energii i zaangażowania wkładasz
w swoją pracę każdego dnia?"

Response Type: 5-point Likert Scale

Scale:
○ Bardzo mało (Very Low)
○ Mało (Low)
○ Średnio (Moderate)
○ Dużo (High)
○ Bardzo dużo (Very High)

Optional follow-up text:
"Co mogłoby poprawić Twoje zaangażowanie?"
[Text input: optional]

────────────────────────────────────────────────

🤝 PYTANIE 3: REKOMENDACJA (NPS-style)

"Jak chętnie poleciłbyś pracę w B2B.net S.A.
swoim koleżankom/kolegom?"

Response Type: 10-point NPS Scale

Scale:
0   1   2   3   4   5   6   7   8   9   10
Niechętnie                       Chętnie
(Not Likely)                   (Very Likely)

Bucket:
- 0-6: Detractor
- 7-8: Passive
- 9-10: Promoter

Conditional follow-up:
IF score <= 6:
  "Co mogliśmy zrobić lepiej?"
  [Text input: open-ended]

IF score >= 9:
  "Co Ci się najbardziej podoba?"
  [Text input: positive feedback]

────────────────────────────────────────────────

⏱️ Timing & Delivery

Distribution Method:
- Email link (primary) - wysłane 2h po check-in'ie
- In-app notification (secondary)
- SMS reminder (if no response after 3 days)

Deadline: 7 days from distribution
Auto-reminder: Day 3, Day 5

────────────────────────────────────────────────
```

### 8.3 Specyfikacja Modelu Danych

```typescript
interface PulseSurvey {
  id: string;
  check_in_id: string;
  consultant_id: string;
  csm_id: string;

  // Metadane kampanii
  campaign_id: string;
  campaign_date: Date;
  distribution_date: Date;
  response_date?: Date;

  // Status
  status: 'pending' | 'sent' | 'in_progress' | 'completed' | 'expired';
  is_completed: boolean;
  completion_time_seconds?: number;

  // Odpowiedzi
  responses: SurveyResponse[];

  // Agregacja
  satisfaction_score: number; // 0-10
  satisfaction_verbatim?: string;

  engagement_score: number; // 1-5
  engagement_verbatim?: string;

  nps_score: number; // 0-10
  nps_bucket: 'detractor' | 'passive' | 'promoter';
  nps_verbatim?: string;

  // Wyliczone metryki
  overall_health_score: number; // weighted average
  sentiment_indicator: 'negative' | 'neutral' | 'positive';

  // Śledzenie
  reminders_sent: number;
  last_reminder_date?: Date;

  created_at: Date;
  updated_at: Date;
}

interface SurveyResponse {
  question_id: string;
  question_text: string;
  question_type: 'satisfaction' | 'engagement' | 'nps';
  response_type: 'likert_7' | 'likert_5' | 'nps_10';
  score?: number; // 0-10 lub 1-5
  verbatim?: string;
  response_time_seconds?: number;
}

// Scoring Logic
function calculateOverallHealthScore(survey: PulseSurvey): number {
  // Normalizacja do 0-100
  const satisfactionNorm = (survey.satisfaction_score / 10) * 100;
  const engagementNorm = (survey.engagement_score / 5) * 100;
  const npsNorm = survey.nps_bucket === 'promoter' ? 100 :
                  survey.nps_bucket === 'passive' ? 50 : 0;

  // Weighted average
  const weights = {
    satisfaction: 0.4,
    engagement: 0.35,
    nps: 0.25,
  };

  return (
    (satisfactionNorm * weights.satisfaction) +
    (engagementNorm * weights.engagement) +
    (npsNorm * weights.nps)
  );
}

function calculateSentiment(survey: PulseSurvey): 'negative' | 'neutral' | 'positive' {
  const score = calculateOverallHealthScore(survey);

  if (score < 33) return 'negative';
  if (score < 66) return 'neutral';
  return 'positive';
}

// Distribution Trigger
async function triggerPulseSurvey(checkInId: string) {
  const checkIn = await getCheckIn(checkInId);

  if (checkIn.status !== 'completed') {
    throw new Error('Can only trigger survey for completed check-ins');
  }

  const survey = await createPulseSurvey({
    check_in_id: checkInId,
    consultant_id: checkIn.consultant_id,
    csm_id: checkIn.csm_id,
    status: 'pending',
    distribution_date: new Date(),
  });

  // Send email after 2 hours
  await scheduleEmail({
    delay_ms: 2 * 60 * 60 * 1000,
    recipient: await getConsultantEmail(checkIn.consultant_id),
    template: 'pulse_survey_email',
    data: {
      survey_id: survey.id,
      survey_link: `/surveys/pulse/${survey.id}/respond`,
      consultant_name: checkIn.consultant_name,
    },
  });

  // Send in-app notification immediately
  await createNotification({
    user_id: checkIn.consultant_id,
    type: 'pulse_survey',
    title: 'Szybka ankieta (15 sekund)',
    message: 'Podziel się swoją opinią o ostatnim check-in'ie',
    action_url: `/surveys/pulse/${survey.id}/respond`,
    expires_at: addDays(new Date(), 7),
  });
}
```

### 8.4 Zarządzanie Odpowiedziami

```typescript
async function submitSurveyResponse(
  surveyId: string,
  responses: SurveyResponse[]
) {
  const survey = await getPulseSurvey(surveyId);

  // Update survey
  await updatePulseSurvey(surveyId, {
    responses: responses,
    response_date: new Date(),
    status: 'completed',
    is_completed: true,
  });

  // Calculate scores
  const survey_updated = await calculateSurveyScores(surveyId);

  // Update consultant health score (M4 integration)
  await updateConsultantHealthScore(
    survey.consultant_id,
    {
      pulse_survey_score: survey_updated.overall_health_score,
      last_survey_date: new Date(),
    }
  );

  // Send confirmation to consultant
  await sendEmail({
    recipient: await getConsultantEmail(survey.consultant_id),
    template: 'survey_response_thank_you',
    data: {
      consultant_name: survey.consultant_name,
    },
  });

  // Notify CSM of low scores
  if (survey_updated.overall_health_score < 40) {
    await createAlert({
      type: 'low_pulse_score',
      priority: 'high',
      consultant_id: survey.consultant_id,
      csm_id: survey.csm_id,
      message: `${survey.consultant_name}: Low health score (${survey_updated.overall_health_score})`,
      action_url: `/dashboard/consultants/${survey.consultant_id}`,
    });
  }
}
```

---

## 9. M10.6: Agregowane Wyniki Pulse Survey

### 9.1 Cel
M10.6 agreguje wyniki z M10.5 (Pulse Survey) w celu:
- Śledzenia trendu satysfakcji w czasie
- Identyfikacji zbiorcze wzorów (np. problemy dotyczące konkretnego projektu)
- Generowania raportów dla kierownictwa
- Wspierania decyzji dotyczących zasoby ludzkie

### 9.2 Widoki Analityczne

```
┌──────────────────────────────────────────────────────────┐
│     AGREGOWANE WYNIKI PULSE SURVEY (Analytics)          │
│     Zakres: Ostatnie 90 dni | Wszyscy konsultanci       │
└──────────────────────────────────────────────────────────┘

┌─ KPI DASHBOARD ─────────────────────────────────────────┐
│                                                          │
│  Overall Health Score       Trend (30 dni)              │
│  ┌──────────┐               📈 72.4 → 74.1 (+1.7)       │
│  │  73.2    │               Status: ✅ IMPROVING        │
│  │   /100   │                                           │
│  └──────────┘                                           │
│                                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │ Rozkład NPS (Net Promoter Score)            │        │
│  │                                             │        │
│  │ Promoters (9-10):  52% [████████████  ]   │        │
│  │ Passives (7-8):    32% [████████      ]   │        │
│  │ Detractors (0-6):  16% [████          ]   │        │
│  │                                             │        │
│  │ NPS Score: +36                              │        │
│  │ (52% - 16% = 36%)                          │        │
│  └─────────────────────────────────────────────┘        │
│                                                          │
│  Average Satisfaction    Average Engagement             │
│  7.8 / 10               4.2 / 5                         │
│  📊 Trend: ↗ 0.3        📊 Trend: ↗ 0.1                │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌─ Trend Chart (Ostatnie 12 tygodni) ────────────────────┐
│                                                          │
│ Overall Health Score Trend:                            │
│ 100 │                                                  │
│  90 │                          ╱─────╲               │
│  80 │          ╱──────────────╱         ╲─────╲      │
│  70 │──────────╱                              ╲──── │
│  60 │                                              │
│  50 │                                              │
│ ────┼──────────────────────────────────────────────│
│     w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12       │
│                                                          │
│ Legenda: — = Satisfaction | — = Engagement | — = NPS   │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌─ Top Issues (Verbatim Analysis) ────────────────────────┐
│                                                          │
│ 🔴 Top Detractor Themes:                               │
│                                                          │
│ 1. Scope Creep (25% of detractors)                     │
│    "Project requirements keep changing without notice"  │
│    Sentiment: Negative | Frequency: 12 mentions        │
│                                                          │
│ 2. Work-Life Balance (18% of detractors)               │
│    "Working too many hours, no flexibility"            │
│    Sentiment: Negative | Frequency: 9 mentions         │
│                                                          │
│ 3. Lack of Growth Opportunities (15%)                  │
│    "Feel stuck, no clear path forward"                 │
│    Sentiment: Negative | Frequency: 8 mentions         │
│                                                          │
│ 🟢 Top Promoter Themes:                                │
│                                                          │
│ 1. Strong Team Support (28% of promoters)             │
│    "Great colleagues and supportive environment"       │
│    Sentiment: Positive | Frequency: 18 mentions        │
│                                                          │
│ 2. Interesting Technical Work (24%)                    │
│    "Love the challenging projects and tech stack"      │
│    Sentiment: Positive | Frequency: 15 mentions        │
│                                                          │
│ 3. Professional Development (20%)                      │
│    "Good opportunities to learn and grow"              │
│    Sentiment: Positive | Frequency: 13 mentions        │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌─ Breakdown by Segment ─────────────────────────────────┐
│ [Filter] [All] | [By Project] | [By Team] | [By CSM]  │
│                                                          │
│ BY PROJECT:                                             │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Project: FinTech Mobile App (PRJ-2025-0042)    │   │
│ │ Respondents: 24 | Response Rate: 92%           │   │
│ │ Health Score: 68.5 | Status: ⚠️ NEEDS ATTENTION│   │
│ │                                                  │   │
│ │ Main Issues:                                     │   │
│ │ - Deadline pressure (scope creep)               │   │
│ │ - Communication gaps with client                │   │
│ │ Recommended Action: CSM check-in required       │   │
│ └─────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Project: Enterprise Data Pipeline (PRJ-2025-51)│   │
│ │ Respondents: 18 | Response Rate: 85%           │   │
│ │ Health Score: 81.2 | Status: ✅ HEALTHY        │   │
│ │                                                  │   │
│ │ Highlights:                                      │   │
│ │ - Strong technical engagement                    │   │
│ │ - Clear project objectives                       │   │
│ │ - Positive team dynamics                         │   │
│ └─────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌─ Comparative Analysis ─────────────────────────────────┐
│                                                          │
│ vs. Last Quarter:     Health Score ↑ 2.8 points       │
│ vs. Last Year (same Q): Health Score ↑ 8.4 points      │
│                                                          │
│ vs. Industry Benchmark: NPS +36 vs Industry +22 ✅     │
│                                                          │
└──────────────────────────────────────────────────────────┘

[Download Report] [Export to PDF] [Schedule Email Report]
```

### 9.3 Specyfikacja Modelu Agregacji

```typescript
interface PulseSurveyAggregation {
  aggregation_id: string;

  // Zakres agregacji
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  period_start_date: Date;
  period_end_date: Date;

  // Filtry
  filters: {
    consultant_ids?: string[];
    project_ids?: string[];
    team_ids?: string[];
    csm_ids?: string[];
    client_ids?: string[];
  };

  // Metryki główne
  total_surveys_sent: number;
  total_surveys_completed: number;
  response_rate: number; // 0-100
  average_completion_time_seconds: number;

  // Scores
  overall_health_score: number; // weighted average
  average_satisfaction: number; // 0-10
  average_engagement: number; // 1-5

  // NPS Distribution
  nps_promoter_count: number;
  nps_passive_count: number;
  nps_detractor_count: number;
  nps_score: number; // -100 to 100

  // Trend
  comparison_to_previous_period: {
    health_score_change: number;
    satisfaction_change: number;
    nps_change: number;
    direction: 'improving' | 'stable' | 'declining';
  };

  // Analiza tekstu (Sentiment Analysis)
  top_themes: Theme[];
  verbatim_examples: VerbatimExample[];

  // Segmentacja
  by_project: ProjectBreakdown[];
  by_team: TeamBreakdown[];
  by_csm: CSMBreakdown[];

  // Alerts
  high_risk_areas: RiskArea[];

  created_at: Date;
}

interface Theme {
  id: string;
  name: string;
  category: 'detractor' | 'promoter' | 'neutral';
  frequency: number;
  percentage: number;
  related_verbatims: string[];
}

interface VerbatimExample {
  id: string;
  survey_id: string;
  consultant_id: string;
  text: string;
  theme_id: string;
  sentiment: 'negative' | 'neutral' | 'positive';
  source_question: string;
}

interface ProjectBreakdown {
  project_id: string;
  project_name: string;
  respondent_count: number;
  response_rate: number;
  health_score: number;
  main_issues: string[];
  recommended_actions: string[];
}

interface RiskArea {
  id: string;
  type: 'project' | 'team' | 'individual';
  entity_id: string;
  entity_name: string;
  health_score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  contributing_factors: string[];
  recommended_action: string;
}
```

### 9.4 Sentiment Analysis Engine

```typescript
// Natural Language Processing for verbatims
async function analyzeVerbatimSentiment(
  text: string
): Promise<{
  sentiment: 'negative' | 'neutral' | 'positive';
  score: number; // -1 to 1
  themes: string[];
  keywords: string[];
}> {
  // Wykorzystanie biblioteki do NLP (np. compromise, natural)

  const sentimentScore = await nlpEngine.analyzeSentiment(text);
  const themes = await themeClassifier.classify(text);
  const keywords = await keywordExtractor.extract(text);

  return {
    sentiment:
      sentimentScore < -0.2 ? 'negative' :
      sentimentScore > 0.2 ? 'positive' :
      'neutral',
    score: sentimentScore,
    themes: themes,
    keywords: keywords,
  };
}

// Trend Detection
async function detectTrendInHealthScore(
  consultantId: string,
  period_days: number = 90
): Promise<TrendAnalysis> {
  const surveys = await getPulseSurveysForConsultant(
    consultantId,
    period_days
  );

  const scores = surveys.map(s => s.overall_health_score);
  const trend = calculateLinearRegression(scores);

  return {
    slope: trend.slope,
    direction: trend.slope > 0.5 ? 'improving' :
              trend.slope < -0.5 ? 'declining' : 'stable',
    volatility: calculateStandardDeviation(scores),
    recent_average: calculateAverage(scores.slice(-4)),
    forecast_next_month: trend.slope * 30 + scores[scores.length - 1],
  };
}
```

### 9.5 Report Generation

```typescript
async function generatePulseSurveyReport(
  aggregationId: string,
  format: 'pdf' | 'excel' | 'email' = 'pdf'
) {
  const aggregation = await getPulseSurveyAggregation(aggregationId);

  const reportContent = {
    title: 'Pulse Survey Analytics Report',
    period: `${aggregation.period_start_date} - ${aggregation.period_end_date}`,
    executive_summary: generateExecutiveSummary(aggregation),
    detailed_metrics: generateDetailedMetrics(aggregation),
    trends: generateTrendCharts(aggregation),
    risk_analysis: generateRiskAnalysis(aggregation),
    recommendations: generateRecommendations(aggregation),
    verbatims: aggregation.top_themes.map(theme => ({
      theme: theme.name,
      examples: aggregation.verbatim_examples
        .filter(v => v.theme_id === theme.id)
        .slice(0, 3),
    })),
  };

  if (format === 'pdf') {
    return await generatePDF(reportContent);
  } else if (format === 'excel') {
    return await generateExcel(reportContent);
  } else if (format === 'email') {
    return await sendEmailReport(reportContent);
  }
}
```

---

## 10. Workflow CSM - Kompletny Cykl

### 10.1 Sekwencja Procesów

```
TYDZIEŃ -1: PLANOWANIE
├─ Scheduler generuje przypomnienie
├─ CSM widzi w dashboardzie "Check-in required"
└─ CSM sprawdza ostatni Health Score konsultanta

DZIEŃ 0 (DZIEŃ CHECK-IN'U):
├─ CSM wysyła zaproszenie (calendar invite)
├─ Rozmowa z konsultantem (Zoom/Teams)
├─ CSM robi notatki w trakcie rozmowy
└─ CSM dokumentuje uczestników i czas trwania

DZIEŃ +1: FEEDBACK & RECOMMENDATIONS
├─ Account Manager (o ile nie uczestniczył)
│  otrzymuje formularz opinii (M10.1)
├─ CSM uzupełnia Client Feedback (jeśli brakuje)
├─ System wylicza average_score
├─ CSM definiuje Rekomendacje (M10.3)
│  ├─ Tytół, opis, kategoria
│  ├─ Success metrics
│  └─ Timeline z checkpointami
└─ System wysyła notifikacje do konsultanta + mentora

DZIEŃ +2: PULSE SURVEY TRIGGERED
├─ System (po delay 2h od check-in'u) wysyła
│  link do ankiety konsultantowi
├─ Consultant wypełnia 3-pytaniową ankietę
├─ System oblicza overall_health_score
└─ Low score (<40) → Alert do CSM

DZIEŃ +7: FOLLOW-UP IF NEEDED
├─ CSM analizuje feedback
├─ Jeśli średnia < 3.0 → Escalation do HR/Management
├─ CSM sprawdza postęp recommendations
└─ Update Timeline z notatkami follow-up

DZIEŃ +30: NASTĘPNY CYKL
├─ Scheduler generuje nowy check-in
└─ Cykl się powtarza...

MONTHLY AGGREGATION (Background):
├─ System agreguje wyniki z M10.5
├─ Generuje Pulse Survey Analytics (M10.6)
├─ Wylicza trendy per projekt, per team
├─ Wysyła raport kierownictwu
└─ Identyfikuje Risk Areas
```

### 10.2 CSM Dashboard Layout

```
┌──────────────────────────────────────────────────────────┐
│               CONSULTANT SUCCESS HUB - DASHBOARD         │
│               CSM: Anna Kowalska (CSM-001)               │
└──────────────────────────────────────────────────────────┘

┌─ Status Szybki ────────────────────────────────────────┐
│ Check-iny dzisiaj: 3    Zaplanowane: 12              │
│ Przeterminowane: 1 🔴   Rekomendacje do śledzenia: 8   │
│ Pulse surveys oczekujące: 5                             │
└────────────────────────────────────────────────────────┘

┌─ Kolejne Działania (Priority Queue) ──────────────────┐
│ [Filter: All | High | Medium | Low] [Sort by Date]  │
│                                                         │
│ 🔴 TODAY 10:00 - Check-in OVERDUE                      │
│    Mark Johnson | Last check-in: 17 days ago           │
│    [Schedule Now] [Escalate]                           │
│                                                         │
│ 🟢 TODAY 14:00 - Check-in Scheduled                    │
│    Lisa Chen | Check-in reason: Regular 30-day         │
│    [Prepare] [Send Agenda] [Join Virtual Room]         │
│                                                         │
│ 🟡 TOMORROW - Feedback Review Needed                   │
│    Sofia Rodriguez | Account Manager submitted feedback│
│    Avg Score: 2.8 ⚠️ | [Review Feedback]              │
│                                                         │
│ 🟢 FRI - Recommendation Follow-up                      │
│    Robert Nowak | Rec: AWS Certification Training     │
│    Progress: 65% | Checkpoint due: 2026-02-20          │
│    [Check Progress] [Add Notes]                        │
│                                                         │
└────────────────────────────────────────────────────────┘

┌─ Konsultanci pod Obserwacją ───────────────────────────┐
│ [Health Score: All | < 50 | 50-70 | > 70]            │
│                                                         │
│ Health Score Trend (ostatnie 90 dni):                  │
│ ▁▂▃▃▃▂▂▃▂▂▂▁▁ (zooming in for this week)              │
│ ConsultantA (CST-001): 68 ↗ +2  [Details]            │
│ ConsultantB (CST-002): 52 ↘ -3  [Details] 🔴         │
│ ConsultantC (CST-003): 75 → +0  [Details]            │
│ ConsultantD (CST-004): 41 ↘ -5  [Details] 🔴🔴      │
│                                                         │
└────────────────────────────────────────────────────────┘

┌─ Pulse Survey Response Rate ───────────────────────────┐
│ Week Overview:                                          │
│ Surveys sent: 23 | Completed: 19 | Pending: 4        │
│ Response rate: 82.6% ✅ (Target: 80%)                  │
│                                                         │
│ Recent Low Scorers (require follow-up):                │
│ • John Smith: 4.2/10 satisfaction | 2/5 engagement   │
│   [View Survey] [Schedule Follow-up Call]             │
│                                                         │
│ • Maria Garcia: 6.1/10 satisfaction | 3/5 engagement  │
│   [View Survey] [Check Recommendations]               │
│                                                         │
└────────────────────────────────────────────────────────┘

┌─ My Team Statistics ───────────────────────────────────┐
│ Number of consultants managed: 47                      │
│ Average health score: 71.3                             │
│ NPS: +38 (52% promoters, 32% passives, 16% detractors)│
│ Average recommendations active: 2.1 per consultant    │
│ Avg time to close recommendation: 52 days             │
│                                                         │
│ [View Full Team Report] [Download Analytics]          │
└────────────────────────────────────────────────────────┘

┌─ Calendar View ────────────────────────────────────────┐
│ February 2026                                           │
│                                                         │
│ Mo  Tu  We  Th  Fr  Sa  Su                            │
│                      1   2   3                         │
│ 4   5   6   7   8   9  10                             │
│     [3] [3] [4] [2] [2]  ← Check-ins scheduled       │
│ 11  12  13  14  15  16  17                           │
│ [5] [4] [3] [3] [2] [1]  ← Count per day            │
│ 18  19  20  21  22  23  24                           │
│ [2] [2] [3] [4] [3] [2] [1]                          │
│ 25  26  27  28                                         │
│ [1] [2] [1]                                            │
│                                                         │
│ [Sync with Outlook] [Print]                           │
└────────────────────────────────────────────────────────┘
```

---

## 11. Integracja z M4 (Health Score)

### 11.1 Wpływ Danych M10 na Health Score

```
CONSULTANT HEALTH SCORE FORMULA:

Health Score = (0.30 × Feedback Score) +
               (0.35 × Pulse Survey Score) +
               (0.20 × Recommendation Progress) +
               (0.15 × Check-in Consistency)

┌─────────────────────────────────────────┐
│ Component 1: Feedback Score (30%)       │
├─────────────────────────────────────────┤
│ Source: M10.1 (Client Feedback Form)   │
│                                         │
│ Formula:                                │
│ (Avg of 4 competency scores / 5) × 100│
│                                         │
│ Min: 0 (no feedback)                   │
│ Max: 100                                │
│ Decay: -1 point per week without data  │
│                                         │
│ Example:                                │
│ Technical: 4, Communication: 5,        │
│ Reliability: 4, Engagement: 3          │
│ Avg = (4+5+4+3)/4 = 4.0                │
│ Score = (4.0/5) × 100 = 80 points     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Component 2: Pulse Survey Score (35%)   │
├─────────────────────────────────────────┤
│ Source: M10.5 (Pulse Survey Results)   │
│                                         │
│ Formula:                                │
│ overall_health_score (calculated in M10│
│                                         │
│ (0.40 × (satisfaction/10×100)) +       │
│ (0.35 × (engagement/5×100)) +          │
│ (0.25 × NPS_bucket_score)              │
│                                         │
│ NPS_bucket_score:                       │
│ - Promoter (9-10): 100                  │
│ - Passive (7-8): 50                     │
│ - Detractor (0-6): 0                    │
│                                         │
│ Recency weight: Latest 3 surveys count │
│ more (60%), older surveys (40%)        │
│                                         │
│ Example:                                │
│ Satisfaction: 7.8/10 → 78 points       │
│ Engagement: 4.2/5 → 84 points          │
│ NPS: Promoter → 100 points             │
│ Weighted: (78×0.4) + (84×0.35) + (100×0.25)
│        = 31.2 + 29.4 + 25 = 85.6      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Component 3: Recommendation Progress    │
│                          (20%)          │
├─────────────────────────────────────────┤
│ Source: M10.3 (Development Recs)       │
│                                         │
│ Formula:                                │
│ (Completed Recs / Total Active Recs) × │
│ 100                                     │
│                                         │
│ Bonus: +5 points per completed rec    │
│ Penalty: -2 points per overdue rec    │
│                                         │
│ Example:                                │
│ Active recommendations: 3              │
│ Completed this period: 1               │
│ On-time completed: 1 (no penalty)      │
│ Score: (1/3)×100 + 5 = 38 points      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Component 4: Check-in Consistency       │
│                          (15%)          │
├─────────────────────────────────────────┤
│ Source: M10.2 + M10.4 (Check-in data)  │
│                                         │
│ Formula:                                │
│ (Check-ins in last 90 days / Expected) │
│ × 100                                   │
│                                         │
│ Expected: 3 check-ins in 90 days       │
│ (every 30 days)                        │
│                                         │
│ Bonus: +5 if all on schedule          │
│ Penalty: -10 per month overdue        │
│                                         │
│ Example:                                │
│ Check-ins in last 90 days: 3           │
│ All on schedule: Yes (+5)              │
│ Score: (3/3)×100 + 5 = 105 → capped @100
└─────────────────────────────────────────┘

FINAL HEALTH SCORE CALCULATION:

Components:
├─ Feedback Score: 80 (×0.30) = 24.0
├─ Pulse Survey Score: 85.6 (×0.35) = 29.96
├─ Recommendation Progress: 38 (×0.20) = 7.6
└─ Check-in Consistency: 100 (×0.15) = 15.0

TOTAL: 24.0 + 29.96 + 7.6 + 15.0 = 76.56 → 76.6

Health Score Interpretation:
- 80-100: ✅ Excellent (Promoter track)
- 60-79:  🟢 Good (Stable performer)
- 40-59:  🟡 At Risk (Needs attention)
- 20-39:  🔴 Critical (Immediate action)
- 0-19:   ⛔ Severe (Escalation required)
```

### 11.2 Feedback Loop do M4

```
When Health Score Updates:
├─ Consultant view (M7 Personal Dashboard):
│  "Your health score: 76.6/100 (+2.3 from last month)"
│
├─ CSM notification:
│  "John Smith's health declined by 5 points - review feedback"
│
├─ Trend tracking:
│  Health score history chart with contributing factors
│
└─ Recommendation trigger:
   If score < 60: Auto-trigger CSM alert to create recommendations

Integration Points:
├─ M10.1 feedback updates → M4 recalculation (immediate)
├─ M10.5 survey responses → M4 recalculation (within 1 hour)
├─ M10.3 recommendation completion → M4 bonus points
└─ M10.4 check-in consistency → M4 component update
```

---

## 12. Interfejs Użytkownika i UX

### 12.1 Główne Widoki

**1. Dashboard CSM (Główny widok)**
- Metryki szybkie (check-iny, ankiety, recommendations)
- Timeline konsultanta z latest interakcji
- Health Score trend chart
- Priority queue (overdue items)
- Calendar view z scheduled check-ins

**2. Consultant Profile**
- Pełna historia check-inów (M10.2 Timeline)
- Current recommendations (M10.3 active)
- Latest feedback (M10.1)
- Health Score breakdown
- Contact info + preferences

**3. Check-in Workflow**
- Tworzenie/edycja check-in
- Note-taking interface z real-time saving
- Link to feedback form
- Pulse Survey trigger
- Follow-up actions management

**4. Analytics & Reporting**
- Pulse Survey aggregates (M10.6)
- Trends by project/team/individual
- NPS distribution
- Theme analysis (verbatims)
- Risk area identification

### 12.2 Responsywność i Dostępność
- Mobile-friendly: Check-ins możliwe do uzupełniania z telefonu
- Dark mode support
- Accessibility: WCAG 2.1 AA compliance
- Polish + English UI (next-intl)
- Print-friendly reports

---

## 13. AI Builder Prompt - Pełna Specyfikacja

```
===================================================================
AI BUILDER PROMPT: CONSULTANT SUCCESS HUB (MODULE M10)
===================================================================

PROJECT CONTEXT:
- Application: Qualrix (B2B.net S.A.)
- Technology Stack: Next.js 14+, Supabase, TypeScript, Tailwind CSS,
  shadcn/ui, next-intl
- Domain: IT Outsourcing (500+ consultants)
- Module: M10 - Consultant Success Hub

OBJECTIVE:
Build a comprehensive consultant relationship management system that
enables Consultant Success Managers (CSMs) to proactively manage
consultant satisfaction, engagement, and development while tracking
impact on Health Scores (M4 integration).

===================================================================
COMPONENT 1: DATA MODELS & SCHEMA
===================================================================

Create Supabase tables with full TypeScript interfaces:

1. check_ins table
   - id (UUID, PK)
   - consultant_id (FK)
   - csm_id (FK)
   - scheduled_date, actual_date (Date)
   - status (enum: scheduled|in_progress|completed|cancelled)
   - check_in_type (enum: regular_30day|ad_hoc|emergency)
   - notes (text, max 2000 chars)
   - participants (text[], JSON)
   - duration_minutes (int)
   - meeting_link (string)
   - tags (text[])
   - priority (enum: low|medium|high|critical)
   - requires_follow_up (boolean)
   - created_at, updated_at (timestamp)
   - RLS: CSM can view/edit own; Admin views all

2. client_feedback table
   - id (UUID, PK)
   - consultant_id (FK)
   - account_manager_id (FK)
   - check_in_id (FK)
   - conversation_date (Date)
   - project_id (FK, optional)
   - technical_knowledge (int 1-5)
   - communication_skills (int 1-5)
   - reliability (int 1-5)
   - engagement (int 1-5)
   - strengths (text, max 500)
   - areas_for_improvement (text, max 500)
   - recommendations (text, max 300)
   - willing_to_work_again (enum: definitely_yes|yes|neutral|no|definitely_no)
   - promotion_potential (boolean, nullable)
   - visible_to_consultant (boolean, default false)
   - next_checkin_priority (enum: none|low|medium|high)
   - average_score (computed: avg of 4 competencies)
   - sentiment_score (computed: NLP analysis, -1 to 1)
   - created_at, updated_at (timestamp)
   - RLS: Created by AM, visible to CSM+AM+Admin

3. development_recommendations table
   - id (UUID, PK)
   - consultant_id (FK)
   - csm_id (FK)
   - check_in_id (FK, optional)
   - title (string, max 200)
   - description (text)
   - category (enum: technical|soft_skills|career|health|other)
   - rationale (text)
   - linked_feedback_id (FK, optional)
   - expected_outcome (text)
   - success_criteria (text[])
   - start_date (Date)
   - target_completion_date (Date)
   - checkpoints (JSON array)
   - resources (JSON array)
   - assigned_mentor_id (FK, optional)
   - budget (decimal, nullable)
   - status (enum: not_started|in_progress|on_hold|completed|archived)
   - progress_percentage (int 0-100)
   - progress_notes (JSONB array of {timestamp, note, progress_pct})
   - priority (enum: low|medium|high|critical)
   - visible_to_consultant (boolean)
   - created_at, updated_at (timestamp)
   - RLS: CSM owns, consultant can view

4. pulse_surveys table
   - id (UUID, PK)
   - check_in_id (FK)
   - consultant_id (FK)
   - csm_id (FK)
   - campaign_id (FK, optional)
   - distribution_date (Date)
   - response_date (Date, nullable)
   - status (enum: pending|sent|in_progress|completed|expired)
   - is_completed (boolean)
   - completion_time_seconds (int, nullable)
   - responses (JSONB: SurveyResponse[])
   - satisfaction_score (int 0-10, nullable)
   - satisfaction_verbatim (text, nullable)
   - engagement_score (int 1-5, nullable)
   - engagement_verbatim (text, nullable)
   - nps_score (int 0-10, nullable)
   - nps_bucket (enum: detractor|passive|promoter, nullable)
   - nps_verbatim (text, nullable)
   - overall_health_score (float 0-100, computed)
   - sentiment_indicator (enum: negative|neutral|positive, computed)
   - reminders_sent (int, default 0)
   - last_reminder_date (timestamp, nullable)
   - created_at, updated_at (timestamp)
   - RLS: Consultant completes, CSM views

5. check_in_schedules table
   - id (UUID, PK)
   - consultant_id (FK)
   - csm_id (FK)
   - is_active (boolean)
   - interval_days (int: 14|30|60)
   - start_date (Date)
   - preferred_day_of_week (int 0-6, nullable)
   - preferred_time (time, nullable)
   - preferred_method (enum: zoom|teams|phone|in_person|async)
   - time_zone (string)
   - reminder_days (int[])
   - require_feedback (boolean)
   - require_survey (boolean)
   - escalate_if_overdue_days (int, default 7)
   - escalate_to_id (FK, nullable)
   - last_check_in_date (timestamp, nullable)
   - next_scheduled_date (timestamp, nullable)
   - upcoming_scheduled_dates (date[], nullable)
   - created_at, updated_at (timestamp)
   - RLS: CSM owns

6. pulse_survey_aggregations table
   - id (UUID, PK)
   - period (enum: daily|weekly|monthly|quarterly)
   - period_start_date (Date)
   - period_end_date (Date)
   - filters (JSONB: {consultant_ids?, project_ids?, team_ids?, csm_ids?})
   - total_surveys_sent (int)
   - total_surveys_completed (int)
   - response_rate (float 0-100)
   - average_completion_time (int)
   - overall_health_score (float)
   - average_satisfaction (float 0-10)
   - average_engagement (float 1-5)
   - nps_promoter_count, nps_passive_count, nps_detractor_count (int)
   - nps_score (int -100 to 100)
   - comparison_to_previous (JSONB)
   - top_themes (JSONB array)
   - by_project (JSONB array)
   - by_team (JSONB array)
   - by_csm (JSONB array)
   - high_risk_areas (JSONB array)
   - created_at (timestamp)
   - RLS: Admin views

CREATE INDEX idx_check_ins_consultant_csm
  ON check_ins(consultant_id, csm_id);
CREATE INDEX idx_feedback_consultant
  ON client_feedback(consultant_id);
CREATE INDEX idx_recommendations_consultant_status
  ON development_recommendations(consultant_id, status);
CREATE INDEX idx_surveys_consultant_date
  ON pulse_surveys(consultant_id, response_date DESC);
CREATE INDEX idx_schedules_consultant_active
  ON check_in_schedules(consultant_id, is_active);

===================================================================
COMPONENT 2: PAGE & COMPONENT STRUCTURE
===================================================================

App Router Structure (Next.js 14):

/app
├── (dashboard)
│   ├── consultant-success-hub/
│   │   ├── page.tsx (M10 Main Dashboard)
│   │   ├── layout.tsx
│   │   ├── consultant/
│   │   │   └── [id]/
│   │   │       ├── page.tsx (Consultant Profile)
│   │   │       ├── timeline/page.tsx (M10.2)
│   │   │       ├── feedback/page.tsx (M10.1)
│   │   │       ├── recommendations/page.tsx (M10.3)
│   │   │       └── health-score/page.tsx
│   │   ├── check-in/
│   │   │   ├── [id]/page.tsx (Check-in Detail)
│   │   │   ├── [id]/edit/page.tsx
│   │   │   └── new/page.tsx
│   │   ├── scheduler/page.tsx (M10.4)
│   │   ├── surveys/
│   │   │   ├── [id]/page.tsx (Pulse Survey Detail)
│   │   │   ├── [id]/respond/page.tsx (Survey Response Form)
│   │   │   └── analytics/page.tsx (M10.6)
│   │   └── analytics/
│   │       ├── page.tsx (Analytics Dashboard)
│   │       ├── pulse/page.tsx (M10.6 Detail)
│   │       └── reports/page.tsx
│   └── ...
├── api/
│   └── consultant-success-hub/
│       ├── check-ins/route.ts
│       ├── check-ins/[id]/route.ts
│       ├── feedback/route.ts
│       ├── recommendations/route.ts
│       ├── surveys/route.ts
│       ├── surveys/[id]/respond/route.ts
│       ├── schedules/route.ts
│       ├── analytics/pulse/route.ts
│       └── health-score/update/route.ts
└── ...

Components (/components/consultant-success-hub/):

├── Dashboard/
│   ├── CSMDashboard.tsx (main dashboard)
│   ├── QuickMetrics.tsx
│   ├── PriorityQueue.tsx
│   ├── CheckInCalendar.tsx
│   ├── ConsultantList.tsx
│   └── HealthScoreTrend.tsx
├── CheckIn/
│   ├── CheckInForm.tsx
│   ├── CheckInTimeline.tsx
│   ├── CheckInDetail.tsx
│   ├── NoteEditor.tsx (with markdown support)
│   └── FollowUpActions.tsx
├── Feedback/
│   ├── ClientFeedbackForm.tsx (M10.1)
│   ├── FeedbackDisplay.tsx
│   ├── CompetencyRating.tsx
│   └── FeedbackHistory.tsx
├── Recommendations/
│   ├── RecommendationForm.tsx (M10.3)
│   ├── RecommendationCard.tsx
│   ├── RecommendationList.tsx
│   ├── CheckpointTracker.tsx
│   ├── ResourceList.tsx
│   └── ProgressChart.tsx
├── Scheduler/
│   ├── SchedulerDashboard.tsx (M10.4)
│   ├── CheckInScheduleForm.tsx
│   ├── SchedulePreferences.tsx
│   └── UpcomingSchedule.tsx
├── Survey/
│   ├── PulseSurveyForm.tsx (M10.5)
│   ├── SurveyQuestion.tsx
│   ├── SurveyResponse.tsx
│   └── SurveyThankYou.tsx
├── Analytics/
│   ├── PulseSurveyAnalytics.tsx (M10.6)
│   ├── HealthScoreBreakdown.tsx
│   ├── NPSDistribution.tsx
│   ├── TrendChart.tsx
│   ├── ProjectBreakdown.tsx
│   ├── TopicsCloud.tsx
│   └── RiskAreasList.tsx
└── Shared/
    ├── ConsultantSelector.tsx
    ├── DateRangePicker.tsx
    ├── FilterPanel.tsx
    ├── ExportButton.tsx
    └── NotificationBell.tsx

===================================================================
COMPONENT 3: KEY FEATURES & FUNCTIONALITY
===================================================================

3.1 CHECK-IN MANAGEMENT (M10.2, M10.4)
- Create/Edit/View check-ins
- Automatic scheduling based on 30-day interval
- Rich text editor for notes (markdown support)
- Participant tracking
- Meeting link integration (auto-generate Zoom link)
- Tag system for categorization
- Reminder system:
  * Email reminders: 7, 3, 1 days before
  * In-app notifications
  * SMS fallback if no response after 3 days
- Overdue tracking & escalation
- Check-in history timeline (chronological view)

3.2 CLIENT FEEDBACK COLLECTION (M10.1)
- Structured feedback form with:
  * 4-point competency rating (1-5 scale)
  * Open-ended text fields (strengths, improvements, recommendations)
  * Future engagement assessment
  * Promotion potential indicator
- Role-based form distribution (Account Managers)
- Privacy controls (visible_to_consultant toggle)
- Auto-calculation of average_score
- Sentiment analysis on verbatim text (using natural-language library)
- Integration with check-in workflow

3.3 DEVELOPMENT RECOMMENDATIONS (M10.3)
- Comprehensive recommendation creation form:
  * Title, description, category selection
  * Success metrics definition (min 1, max 5)
  * Checkpoint scheduling (min 1, max 12)
  * Resource linking (courses, books, mentors)
  * Budget allocation
- Progress tracking:
  * Visual progress bar (0-100%)
  * Milestone/checkpoint tracking
  * Progress notes with timestamps
  * Completion verification
- Mentor assignment & notification
- Recommendation status workflow
- Visibility controls
- Integration with Health Score (M4):
  * Bonus points on completion
  * Penalty points if overdue
  * Track impact on overall score

3.4 PULSE SURVEY SYSTEM (M10.5, M10.6)
- 3-question micro-survey:
  * Q1: Satisfaction (7-point scale with emoji slider)
  * Q2: Engagement (5-point Likert)
  * Q3: NPS (10-point scale)
- Conditional follow-up questions based on responses
- Optional verbatim text for each question
- Auto-trigger 2 hours after check-in completion
- Expiration (7 days) with reminders
- Response analytics:
  * Score calculation
  * NPS distribution
  * Overall health score computation
- Integration with M4 health score update

3.5 ANALYTICS & AGGREGATION (M10.6)
- Pulse Survey Analytics Dashboard:
  * KPI cards (overall score, NPS, response rate)
  * 12-week trend chart
  * NPS distribution chart (promoter/passive/detractor)
  * Sentiment analysis from verbatims
  * Top themes extraction (NLP)
  * Verbatim examples per theme
- Segmentation views:
  * By project
  * By team
  * By CSM
  * By time period
- Risk area identification:
  * Automatic flagging of scores < 40
  * Project-level risk assessment
  * Recommended actions
- Report generation:
  * PDF export
  * Excel export
  * Scheduled email reports

3.6 CSM DASHBOARD (M10 Main Page)
- KPI cards:
  * Check-ins this week/month
  * Overdue items count
  * Pending survey responses
  * Active recommendations
- Priority queue (sorted by priority & due date)
- Calendar view with check-in scheduling
- Consultant health score grid
- Quick action buttons
- Filter & search capabilities
- Mobile-responsive layout

===================================================================
COMPONENT 4: API ROUTES & BUSINESS LOGIC
===================================================================

4.1 CHECK-IN ENDPOINTS

POST /api/consultant-success-hub/check-ins
- Create new check-in
- Auto-assign consultant ID from request user
- Validate scheduled_date not in past
- Return: CheckIn object with ID
- Trigger: Scheduler if status='scheduled'

GET /api/consultant-success-hub/check-ins
- List check-ins with filters
- Params: consultant_id, csm_id, status, date_range, tags
- Pagination: limit, offset
- Return: CheckIn[], total count
- Order by: scheduled_date DESC

GET /api/consultant-success-hub/check-ins/[id]
- Retrieve single check-in with related data
- Include: feedback, recommendations, survey
- Return: Full CheckIn object

PUT /api/consultant-success-hub/check-ins/[id]
- Update check-in
- Allowed fields: notes, status, participants, tags, priority
- If status changed to 'completed':
  * Trigger pulse survey auto-distribution
  * Update schedule.last_check_in_date
  * Create next scheduled check-in
- Return: Updated CheckIn

DELETE /api/consultant-success-hub/check-ins/[id]
- Soft delete check-in (set status='cancelled')
- Preserve history for audit trail
- Return: Success confirmation

4.2 FEEDBACK ENDPOINTS

POST /api/consultant-success-hub/feedback
- Create client feedback
- Required: consultant_id, account_manager_id, scores
- Calculate: average_score, sentiment_score
- If average_score < 3.0: Set priority='high'
- Trigger: Notification to CSM
- Return: ClientFeedback object

GET /api/consultant-success-hub/feedback
- List feedback with filters
- Params: consultant_id, date_range, account_manager_id
- Return: ClientFeedback[], sorted by date DESC

GET /api/consultant-success-hub/feedback/[id]
- Retrieve single feedback
- Return: Full ClientFeedback with sentiment analysis

PUT /api/consultant-success-hub/feedback/[id]
- Update feedback (mostly for correction)
- Recalculate scores if competency fields changed
- Trigger M4 health score update
- Return: Updated ClientFeedback

4.3 RECOMMENDATIONS ENDPOINTS

POST /api/consultant-success-hub/recommendations
- Create recommendation
- Validate: title, description, dates, success_criteria
- If assigned_mentor_id: Send notification to mentor
- Return: Recommendation object

GET /api/consultant-success-hub/recommendations
- List recommendations with filters
- Params: consultant_id, status, priority, date_range
- Return: Recommendation[], grouped by status

GET /api/consultant-success-hub/recommendations/[id]
- Retrieve recommendation with full details
- Include: checkpoints, resources, progress history
- Return: Full Recommendation object

PUT /api/consultant-success-hub/recommendations/[id]
- Update recommendation
- If progress_percentage increased: Record in progress_notes
- If status='completed':
  * Verify all success_metrics
  * Calculate completion impact on M4 health score
  * Archive recommendation
  * Trigger success notification to consultant
- Return: Updated Recommendation

POST /api/consultant-success-hub/recommendations/[id]/checkpoint
- Mark checkpoint as completed
- Update progress_percentage based on completed checkpoints
- Return: Updated Recommendation

4.4 SCHEDULE ENDPOINTS

POST /api/consultant-success-hub/schedules
- Create check-in schedule
- Calculate next_scheduled_date based on preferences
- Activate scheduled job for reminder distribution
- Return: CheckInSchedule object

GET /api/consultant-success-hub/schedules
- List all active schedules
- Params: csm_id, consultant_id, is_active
- Return: CheckInSchedule[]

PUT /api/consultant-success-hub/schedules/[id]
- Update schedule (preferences, interval, etc)
- Recalculate next_scheduled_date if interval changed
- Return: Updated CheckInSchedule

POST /api/consultant-success-hub/schedules/[id]/send-reminder
- Manually trigger reminder for schedule
- Send email to CSM
- Return: Success confirmation

4.5 SURVEY ENDPOINTS

POST /api/consultant-success-hub/surveys
- Create pulse survey (internal trigger, not public)
- Set distribution_date to now
- Schedule email delivery in 2 hours
- Return: PulseSurvey object

GET /api/consultant-success-hub/surveys/[id]/respond
- Public survey response form (no auth required, token-based)
- Prevent duplicate submissions via unique token
- Return: Survey form UI

POST /api/consultant-success-hub/surveys/[id]/respond
- Submit survey responses
- Parse SurveyResponse[] array
- Calculate: satisfaction_score, engagement_score, nps_score
- Call calculateOverallHealthScore()
- Update M4 health score via integration
- Send confirmation email to consultant
- If overall_health_score < 40: Alert CSM
- Return: Confirmation response

GET /api/consultant-success-hub/surveys
- List surveys with filters
- Params: consultant_id, csm_id, status, date_range
- Return: PulseSurvey[]

4.6 ANALYTICS ENDPOINTS

POST /api/consultant-success-hub/analytics/pulse/aggregate
- Trigger pulse survey aggregation
- Params: period (day|week|month|quarter), filters
- Aggregate surveys from period
- Calculate: scores, NPS, themes, risk areas
- Store in pulse_survey_aggregations table
- Return: PulseSurveyAggregation object

GET /api/consultant-success-hub/analytics/pulse
- Retrieve latest aggregation
- Params: period, filters
- Return: Full PulseSurveyAggregation with charts data

POST /api/consultant-success-hub/analytics/health-score/update
- Manual trigger to recalculate consultant health score (M4)
- Called from:
  * Feedback submission
  * Survey response submission
  * Recommendation completion
- Formula: See section 11.1
- Update consultant.health_score in M4
- Return: Updated health score

4.7 CRON JOBS (Background Tasks)

Daily Job: ProcessCheckInSchedule()
- Run at 02:00 AM UTC
- For each active schedule:
  * If today = reminder day: sendReminder()
  * If overdue: escalateOverdue()
  * If time for new check-in: createNextCheckIn()

Weekly Job: AggregateWeeklyPulseSurveys()
- Run every Monday at 06:00 AM UTC
- Aggregate surveys from past week
- Generate analytics
- Send report email to admins

Monthly Job: AggregateMonthlyPulseSurveys()
- Run on 1st of month at 06:00 AM UTC
- Comprehensive monthly aggregation
- Identify trends, risk areas
- Generate full analytics report

Daily Job: ExpirePendingSurveys()
- Run at 03:00 AM UTC
- Find surveys older than 7 days, status='pending'
- Set status='expired'
- Send final reminder email to consultant

===================================================================
COMPONENT 5: NOTIFICATIONS & EMAILS
===================================================================

Email Templates (using handlebars/ejs):

1. check_in_reminder.hbs
   Subject: "Check-in Reminder: {{consultant_name}}"
   From: no-reply@qualrix.b2bnet.pl
   To: {{csm_email}}
   CC: {{escalation_manager_email}} (if applicable)
   Content:
   - Greeting
   - Consultant name
   - Scheduled date & time
   - Link to "Prepare Check-in" button
   - Last check-in summary
   - Reminders sent count

2. check_in_completed.hbs
   Subject: "Check-in Completed: {{consultant_name}}"
   To: {{consultant_email}}
   Content:
   - Greeting
   - Check-in summary (date, CSM, duration)
   - Next steps (recommendations, if any)
   - Link to view recommendations
   - Survey request (see #5)

3. pulse_survey_email.hbs
   Subject: "Szybka ankieta (15 sekund) - Twoja opinia nas ważna"
   To: {{consultant_email}}
   Content:
   - Greeting
   - "Help us improve by sharing your feedback"
   - Button: "Start Survey" (with unique token link)
   - Estimated time: 15 seconds
   - Deadline: {{expiry_date}}

4. survey_response_thank_you.hbs
   Subject: "Dziękujemy za odpowiedź!"
   To: {{consultant_email}}
   Content:
   - Thank you message
   - Response summary (scores)
   - Link to view health score
   - Motivation message

5. feedback_submitted.hbs
   Subject: "Feedback Received: {{consultant_name}}"
   To: {{csm_email}}
   Content:
   - New feedback summary
   - Average score
   - Key themes from verbatim
   - Link to view full feedback
   - "Create Recommendation" button

6. recommendation_assigned.hbs
   Subject: "New Recommendation: {{recommendation_title}}"
   To: {{consultant_email}}
   CC: {{mentor_email}} (if assigned)
   Content:
   - Greeting
   - Recommendation overview
   - Success criteria
   - Timeline & checkpoints
   - Resources
   - Mentor contact (if assigned)
   - Link to view recommendation

7. low_health_score_alert.hbs
   Subject: "⚠️ Low Health Score Alert: {{consultant_name}}"
   To: {{csm_email}}
   Content:
   - Alert header
   - Current score vs. previous
   - Contributing factors
   - Recent feedback/survey
   - Recommended actions
   - Link to view consultant profile

In-App Notifications (use notification queue):
- Check-in scheduled
- Feedback submitted
- Recommendation created
- Survey response reminder (Day 3, 5)
- Low score alert
- Overdue check-in alert

SMS Notifications (optional, for critical alerts):
- Overdue check-in (after 7 days)
- Critical health score alert (< 30)
- Survey expiry reminder (1 day before)

===================================================================
COMPONENT 6: SECURITY & AUTHORIZATION
===================================================================

Row Level Security (RLS) Policies:

1. check_ins table:
   - CSM can view/edit own check-ins (csm_id = auth.uid)
   - Consultant can view own check-ins
   - Admin (is_admin role) views all
   - Insert: CSM only
   - Update: CSM + record creator only
   - Delete: Soft delete only

2. client_feedback table:
   - Created by Account Manager
   - Visible to: CSM, Account Manager, Admin
   - Consultant visibility: Only if visible_to_consultant=true
   - Insert: Account Manager only
   - Update: Creator or CSM only
   - Delete: Soft delete

3. development_recommendations table:
   - CSM creates for consultant
   - Consultant can view (if visible_to_consultant=true)
   - Mentor can view/update progress notes
   - Insert: CSM only
   - Update: CSM + Mentor (progress only)
   - Delete: Soft delete

4. pulse_surveys table:
   - Consultant completes response
   - CSM views results
   - Admin views all
   - Insert: System only (no direct insert)
   - Update: Consultant (responses only)
   - Delete: Admin only

5. check_in_schedules table:
   - CSM manages own schedules
   - Insert/Update/Delete: CSM only

Data Encryption:
- Verbatim text (feedback, survey) encrypted at rest (PG crypto)
- Email addresses hashed in audit logs
- HTTPS only (enforced)

API Authentication:
- All endpoints require valid JWT token (from Supabase)
- Role-based access control (CSM, Consultant, Account Manager, Admin)
- Rate limiting: 100 requests/minute per user
- Request validation with Zod schema

===================================================================
COMPONENT 7: INTEGRATION WITH M4 (HEALTH SCORE)
===================================================================

Health Score Update Flow:

1. When triggered:
   - Feedback submission (M10.1)
   - Survey response submission (M10.5)
   - Recommendation completion (M10.3)
   - Check-in consistency update (M10.4)

2. Call M4 API:
   POST /api/health-score/calculate
   Body: {
     consultant_id: UUID,
     trigger_source: 'M10_feedback' | 'M10_survey' | 'M10_recommendation' | 'M10_checkin',
     component_scores?: {
       feedback_score?: number,
       pulse_survey_score?: number,
       recommendation_progress?: number,
       checkin_consistency?: number
     }
   }

3. M4 recalculates using formula from section 11.1
4. Update consultant table in M4:
   - health_score (overall)
   - last_health_score_update
   - health_score_components (JSON)
   - health_score_history (append)

5. Return: Updated health_score to M10
6. If health_score < 60:
   - Alert CSM
   - Recommend creating recommendations
   - Flag in dashboard

===================================================================
COMPONENT 8: TESTING REQUIREMENTS
===================================================================

Unit Tests:
- Health score calculation formula
- Sentiment analysis function
- NPS bucket classification
- Date scheduling logic
- RLS policy enforcement

Integration Tests:
- Check-in CRUD with M4 integration
- Feedback submission → Health score update
- Survey submission → Health score update
- Schedule reminder distribution
- Email generation & sending

E2E Tests:
- CSM full workflow: create check-in → collect feedback → generate recommendations
- Consultant survey response flow
- Analytics dashboard data population
- Scheduler reminder delivery

Test Coverage Target: 80%+

===================================================================
COMPONENT 9: PERFORMANCE REQUIREMENTS
===================================================================

Database:
- Query response time < 200ms (95th percentile)
- Bulk operations (500+ records) < 5 seconds
- Real-time updates via Supabase subscriptions
- Caching: Redis for analytics results (24-hour TTL)

UI/UX:
- Page load time < 3 seconds
- Dashboard render < 1 second
- Search results < 500ms
- Mobile-responsive on screens 320px+ width

API:
- Response time < 500ms (95th percentile)
- Concurrent user support: 1000+
- Rate limiting: 100 req/min per user
- Auto-retry on transient failures (max 3 attempts)

===================================================================
COMPONENT 10: DEPLOYMENT & CONFIGURATION
===================================================================

Environment Variables:
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
DATABASE_URL=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://qualrix.b2bnet.pl

Redis Configuration:
REDIS_URL=redis://...
CACHE_TTL_ANALYTICS=86400 (24 hours)
CACHE_TTL_SCHEDULES=3600 (1 hour)

Email Configuration:
SMTP_HOST=mail.b2bnet.pl
SMTP_PORT=587
SMTP_USER=noreply@qualrix.b2bnet.pl
SMTP_PASSWORD=...
SMTP_FROM="Qualrix Notifications"

Deployment:
- Build command: npm run build
- Start command: npm run start
- Docker: Provide Dockerfile with Node 18+ LTS
- Vercel deployment with automatic CI/CD
- Environment staging: dev, staging, production

===================================================================
COMPONENT 11: INTERNATIONALIZATION
===================================================================

Language Support: Polish (pl) + English (en)

Translation Keys (next-intl):
- Module titles, buttons, labels
- Email templates
- Chart labels
- Error messages
- Help text

Example:
m10.check_in_reminder.title = "Check-in Reminder: {name}"
m10.pulse_survey.question_1.label = "Satysfakcja zawodowa"
m10.health_score.label = "Wskaźnik Zdrowotności"

Pluralization: Handle Polish cases (1 check-in, 2-4 check-iny, 5+ check-inów)

Date Formatting:
- Locale: pl-PL (Europe/Warsaw timezone)
- Format: "2 lutego 2026" (vs. "February 2, 2026" for en)

===================================================================
COMPONENT 12: DOCUMENTATION REQUIREMENTS
===================================================================

Internal Documentation:
- API endpoint reference (Swagger/OpenAPI)
- Database schema documentation
- Component usage guide
- Configuration guide
- Deployment runbook

User Documentation:
- CSM User Guide (Polish & English)
- Consultant Quick Start
- Account Manager Feedback Form Guide
- Video tutorials (YouTube playlist)

Code Documentation:
- JSDoc comments for all functions
- README.md with setup instructions
- Architecture diagram (Miro/Lucidchart)
- Data flow diagram
- Component hierarchy diagram

===================================================================
COMPONENT 13: ACCESSIBILITY & COMPLIANCE
===================================================================

Accessibility (WCAG 2.1 AA):
- Color contrast ratio ≥ 4.5:1
- Keyboard navigation for all features
- Screen reader compatibility (ARIA labels)
- Form input labels + error messages
- Skip navigation link

GDPR Compliance:
- Data retention policy (7 years for consultants)
- Right to be forgotten: delete consultant data (soft delete)
- Data export: CSV export of personal data
- Consent tracking for communications
- Privacy policy link in footer

Data Privacy:
- Sensitive data encrypted at rest
- HTTPS enforced
- No sensitive data in URLs
- Session timeout (30 minutes inactivity)
- Audit logging of data access

===================================================================
IMPLEMENTATION PRIORITY
===================================================================

Phase 1 (MVP - Week 1-3):
✓ Check-in management (M10.2, M10.4)
✓ Client feedback form (M10.1)
✓ CSM dashboard with basic metrics
✓ Pulse survey (M10.5)

Phase 2 (Enhancement - Week 4-5):
✓ Development recommendations (M10.3)
✓ Health score integration (M4)
✓ Analytics dashboard (M10.6)
✓ Scheduler automation

Phase 3 (Polish - Week 6):
✓ Email templates & notifications
✓ Mobile responsiveness
✓ Performance optimization
✓ Testing & QA

===================================================================
SUCCESS CRITERIA
===================================================================

✓ All 6 sub-modules (M10.1-M10.6) fully functional
✓ 85%+ test coverage
✓ < 3 second dashboard load time
✓ Zero data loss in production
✓ 99.9% uptime during beta
✓ User feedback score > 4.0/5.0
✓ Adoption rate > 80% of CSMs within 3 months

===================================================================
```

---

## Podsumowanie

**Module M10: Consultant Success Hub** to kompleksowy system zarządzania relacjami z konsultantami w ekosystemie IT outsourcingu B2B.net S.A. Moduł łączy:

1. **M10.1** - Strukturyzowane opinie klientów (4 kompetencje + tekst)
2. **M10.2** - Historię check-inów (timeline chronologiczny)
3. **M10.3** - Rekomendacje rozwojowe (z metrykami i checkpoint'ami)
4. **M10.4** - Automatyzację harmonogramu (30-dniowe cykle)
5. **M10.5** - Mikro-ankietę satysfakcji (3 pytania w 15 sekund)
6. **M10.6** - Agregowaną analitykę (trendy, NPS, tematyka)

Całość integruje się z **M4 (Health Score)**, gdzie feedback i wyniki ankiet bezpośrednio wpływają na wskaźnik zdrowotności konsultanta. Stack techniczny: Next.js 14+, Supabase, TypeScript, Tailwind, shadcn/ui z pełną lokalizacją (PL+EN).

---

**Dokument został zapisany pod adresem:**
```
/sessions/beautiful-gifted-meitner/mnt/aplikacja zbyszka/DOC-M10_Consultant_Success_Hub.md
```

**Rozmiar: 600+ linii | Sekcji: 13 | Kod: 300+ linii AI Builder Prompt**
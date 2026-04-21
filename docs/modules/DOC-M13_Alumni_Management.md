# Moduł M13: Zarządzanie Alumni

**Wersja:** 1.0
**Data:** Luty 2025
**Autor:** B2B.net S.A. - Zespół Produktu
**Status:** Specification
**Stack:** Next.js 14+, Supabase, TypeScript, Tailwind, shadcn/ui, next-intl (PL+EN)

---

## Spis Treści

1. [Przegląd Modułu](#1-przegląd-modułu)
2. [Kontekst Biznesowy](#2-kontekst-biznesowy)
3. [Profil Alumni](#3-profil-alumni)
4. [Uprawnienia i Dostęp](#4-uprawnienia-i-dostęp)
5. [Zarządzanie Kampaniami Re-engagement](#5-zarządzanie-kampaniami-re-engagement)
6. [Ścieżka Re-engagement](#6-ścieżka-re-engagement)
7. [System Rekomendacji Alumni](#7-system-rekomendacji-alumni)
8. [Przepływ Offboardingu](#8-przepływ-offboardingu)
9. [Analityka Alumni](#9-analityka-alumni)
10. [Zdarzenia i Biuletyn Alumni](#10-zdarzenia-i-biuletyn-alumni)
11. [Architektura Techniczna](#11-architektura-techniczna)
12. [Plany Implementacji](#12-plany-implementacji)
13. [Prompt AI Builder](#13-prompt-ai-builder)

---

## 1. Przegląd Modułu

### 1.1 Cel i Zakres

Moduł M13: Zarządzanie Alumni to kluczowy system do utrzymywania relacji z byłymi konsultantami B2B.net S.A. W kontekście IT outsourcingu z ponad 500 konsultantami, alumni są cennym źródłem nowych zleceń (powroty) oraz rekomendacji talentów nowych projektów.

**Główne cele:**
- Digitalizacja bazy danych alumni z pełną historią współpracy
- Utrzymanie zaangażowania poprzednich konsultantów poprzez ograniczony dostęp do platformy
- Automatyzacja kampanii "Wróć do B2B.net" z personalizacją
- Śledzenie i motywacja rekomendacji ze strony alumni
- Analityka zwrotu alumni oraz ROI programu

### 1.2 Rola w Ekosystemie

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLATFORMA B2B.net 14+                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ M01:Auth │  │ M02:Jobs │  │ M03:Proj │  │ M13:Alum │       │
│  │          │  │          │  │          │  │          │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│       ▲            │             │              │               │
│       │            │             │              │               │
│       └────────────┴─────────────┴──────────────┘               │
│              Integracja z bazą konsultantów                     │
│                   i historią projektów                          │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │ M04:CRM  │  │ M05:Mail │  │ M08:Anal │                     │
│  │          │  │          │  │          │                     │
│  └──────────┘  └──────────┘  └──────────┘                     │
│       ▲            │              │                             │
│       └────────────┴──────────────┘                             │
│       Kampanie, Komunikacja, Metryki                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Definicje Kluczowych Pojęć

| Termin | Definicja |
|--------|-----------|
| **Alumni** | Konsultant, który zakończył współpracę z B2B.net S.A. (voluntarnie lub dzięki ukończeniu projektu) |
| **Re-engagement** | Kampania mająca na celu ponowne zaangażowanie alumni w nowe projekty |
| **Offboarding** | Proces przejścia konsultanta ze statusu aktywnego na alumni |
| **Referral Alumni** | Zalecenie nowego kandydata przez byłego konsultanta |
| **Marketplace Alumni** | Ograniczony widok dostępnych zleceń bez dostępu do wewnętrznych dokumentów |

---

## 2. Kontekst Biznesowy

### 2.1 Problem Biznesowy

**Wyzwanie:**
- 500+ konsultantów przechodzących przez platformę rocznie
- Utrata relacji z byłymi specjalistami po zakończeniu projektów
- Brak strukturalnego podejścia do re-engagement alumni
- Niedokumentowana historia współpracy utrudnia personalizację

**Szansa:**
- Alumni mogą powrócić do nowych projektów (oszczędność na rekrutacji: ~40%)
- Alumni mogą polecać nowych talentów (zwiększenie bazy kandydatów o ~30%)
- Pozytywne doświadczenie wzbudza lojalność marca (rekomendacje ustne)

### 2.2 Metryki Sukcesu

| Metryka | Cel | Progres |
|---------|-----|---------|
| **Return Rate** | % alumni wracających do projektów | 15-20% w ciągu roku |
| **Referral Rate** | % alumni który polecili kandydatów | 25-30% |
| **Time to Re-engagement** | Dni od offboardingu do ponownego zaangażowania | < 180 dni |
| **Campaign Open Rate** | % otwartych wiadomości e-mail | > 35% |
| **Campaign Click Rate** | % kliknięć na linki w kampaniach | > 8% |
| **ROI Programu Alumni** | Koszt kampanii vs wartość zwróconych kontraktów | > 4:1 |

### 2.3 Persona Alumni

**Profil Główny:**
- Doświadczony konsultant IT (mid-level do senior)
- Wyspecjalizowany w konkretnym tech stacku (Java, .NET, Python, DevOps)
- Została tym czasem nowych wyzwań na rynku
- Chciałby wrócić za lepszych warunków lub mniej obciążającego harmonogramu
- Ceni relacje i wiedzi o nowych projektach wcześnie

**Motywatory do powrotu:**
- Znana i zaufana firma
- Elastyczne warunki współpracy
- Dostęp do premium kontraktów
- Nagrody za rekomendacje

---

## 3. Profil Alumni

### 3.1 Struktura Danych Alumni

```typescript
// supabase schema
interface AlumniProfile {
  id: uuid;
  userId: uuid; // referencja do głównego profilu użytkownika
  alumniSince: timestamp; // kiedy został alumni
  status: 'active' | 'alumni' | 'dormant' | 'inactive';

  // Sekcja Historii Współpracy
  projectHistory: {
    projectId: uuid;
    projectName: string;
    role: string;
    department: string;
    startDate: date;
    endDate: date;
    status: 'completed' | 'ongoing' | 'terminated';
    clientName: string;
    successMetrics?: string;
    reasonForEnd?: 'project_ended' | 'consultant_left' | 'performance' | 'other';
  }[];

  // Sekcja Umiejętności
  skills: {
    skillId: uuid;
    skillName: string;
    proficiencyLevel: 1 | 2 | 3 | 4 | 5; // 1=basic, 5=expert
    yearsOfExperience: number;
    lastUsed: date;
    verified: boolean;
  }[];

  // Ostatni Projekt
  lastProject: {
    projectId: uuid;
    projectName: string;
    endDate: date;
    clientFeedback?: number; // 1-5 stars
    performanceRating?: number; // 1-5
  };

  // Powód Odejścia
  reasonForLeaving: {
    category: 'voluntary' | 'project_ended' | 'relocation' | 'career_change' | 'other';
    description?: string;
    recordedAt: timestamp;
    recordedBy: uuid; // HR manager
  };

  // Dane Kontaktowe
  contact: {
    email: string;
    phone?: string;
    linkedin?: string;
    github?: string;
    website?: string;
  };

  // Preferencje Komunikacji
  communicationPreferences: {
    emailFrequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'none';
    preferredChannels: ('email' | 'sms' | 'linkedin' | 'push')[];
    newsletter: boolean;
    eventInvitations: boolean;
    jobAlerts: boolean;
  };

  // Status Re-engagement
  reEngagementStatus: {
    lastContactDate: timestamp;
    lastCampaignId?: uuid;
    campaignInteractions: number;
    mostRecentInteraction: timestamp;
    engagementScore: 0..100; // system punktów
    isTargetedForCampaign: boolean;
  };

  // Preferencje Projektów
  projectPreferences: {
    preferredSkills: uuid[];
    availableFrom?: date;
    maxHoursPerWeek?: number;
    minRate?: number;
    minContractLength?: string; // np. "3 months"
    geographicPreferences: string[];
    remotePreference: 'full' | 'hybrid' | 'onsite' | 'flexible';
  };

  metadata: {
    createdAt: timestamp;
    updatedAt: timestamp;
    deletedAt?: timestamp;
  };
}
```

### 3.2 Pola Rozszerzone Alumni

#### 3.2.1 Historia Współpracy
Każdy alumni ma dostęp do zaszeregowanej historii wszystkich projektów:
- Nazwy projektów i klientów
- Okresy współpracy
- Role i odpowiedzialności
- Oceny wydajności (jeśli dostępne)
- Feedback klientów
- Powody zakończenia projektu

#### 3.2.2 Umiejętności i Doświadczenie
- Lista technologii z poziomem biegłości (1-5)
- Weryfikacja poprzez certyfikaty lub testy
- Data ostatniego użycia (dla świeżości umiejętności)
- Zalecane szkolenia na podstawie trendu rynku

#### 3.2.3 Analiza Powodu Odejścia
Struktura zawiera:
- **Voluntary**: Konsultant sam chciał odejść
  - Career change (zmiana branży)
  - Relocation (przeprowadzka)
  - Personal reasons (powody osobiste)
  - Better opportunity elsewhere (lepsza oferta)

- **Involuntary**: Umowa wygasła naturalnie
  - Project ended (projekt się skończył)
  - Restructuring (reorganizacja)
  - Performance issues (problemy z wydajnością)

- **Text Description**: Dodatkowe notatki od HR-u

#### 3.2.4 Zaangażowanie Alumni
System punktowy (0-100):
- +10 pkt: Otwarcie emaila kampanii
- +15 pkt: Klik na link w emailu
- +25 pkt: Przeglądanie ofert pracy
- +30 pkt: Złożenie aplikacji
- +20 pkt: Polecenie kandydata
- -5 pkt: Brak aktywności przez 30 dni
- -10 pkt: Rezygnacja z kampanii

### 3.3 UI/UX Profilu Alumni (Dashboard Alumni)

```
┌─────────────────────────────────────────────────────────────┐
│  PROFIL ALUMNI - Jan Kowalski                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Status: Alumni | Od: 15.11.2024 | Engagement: 65/100   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ OSTATNI PROJEKT ────────────────────────────────────┐  │
│  │ Client X - Senior Java Developer (2024-10-2024)      │  │
│  │ ⭐ 4.8/5 | Realizacja: Sukces | Feedback pozytywny  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ UMIEJĘTNOŚCI ──────────────────────────────────────┐   │
│  │ ▓▓▓▓▓ Java (Expert)      ▓▓▓▓░ Spring (Advanced)    │   │
│  │ ▓▓▓▓░ Kubernetes (4/5)   ▓▓▓░░ Docker (3/5)        │   │
│  │ [+ 7 more skills]                                   │   │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ POWÓD ODEJŚCIA ────────────────────────────────────┐   │
│  │ Projekt się zakończył (Naturalny koniec umowy)      │   │
│  │ "Jan chciałby wróć za 3 miesiące"                  │   │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ PREFERENCJE PROJEKTÓW ────────────────────────────┐   │
│  │ ✓ Java/Spring Stack  | Dostępny od: 01.03.2025    │   │
│  │ ✓ Remote (pełny)     | Max 40h/tydzień            │   │
│  │ ✓ Min 3 miesiące     | Min stawka: 150 PLN/h      │   │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  [Edytuj Preferencje] [Historia Kampanii] [Aktywność]     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Uprawnienia i Dostęp

### 4.1 Macierz Uprawnień Alumni

| Funkcjonalność | Alumni | Aktywny Konsultant | Admin |
|---|---|---|---|
| **Widok Marketplace** | ✓ Ograniczony | ✓ Pełny | ✓ Pełny |
| **Aplikacja na Projekty** | ✓ | ✓ | ✓ |
| **Widok Historii Projektów** | ✓ | ✓ | ✓ |
| **Edycja Profilu** | ✓ | ✓ | ✓ (All) |
| **Widok Dokumentów Wewnętrznych** | ✗ | ✓ | ✓ |
| **Dostęp do Community** | ✓ Limited | ✓ Pełny | ✓ |
| **Udostępnianie Rekomendacji** | ✓ | ✓ | ✓ |
| **Widok Analityki Osobistej** | ✓ | ✓ | ✓ (All) |
| **Edycja Danych HR** | ✗ | ✗ | ✓ |

### 4.2 Role i Uprawnienia Szczegółowe

#### 4.2.1 Alumni Role

```typescript
interface AlumniPermissions {
  // Marketplace Access
  marketplace: {
    viewOpenJobs: true;
    viewJobDetails: true;
    viewClientInfo: false; // ograniczenie
    viewInternalDocuments: false;
    viewCompensationRange: true; // widoczne stawki
    applyForJobs: true;
    viewApplicationStatus: true;
    getNotificationsAboutJobs: true;
  };

  // Profile Management
  profile: {
    viewOwnProfile: true;
    editOwnProfile: true;
    editSkills: true;
    editProjectPreferences: true;
    editContactInfo: true;
    viewFullHistoryOfProjects: true;
    downloadProofOfWork: true; // certyfikat pracowania
  };

  // Referral Program
  referrals: {
    sendReferrals: true;
    viewReferralStatus: true;
    trackReferralRewards: true;
    viewReferralHistory: true;
  };

  // Campaign Interactions
  campaigns: {
    viewCampaignContent: true;
    clickOnLinks: true;
    unsubscribeFromCampaign: true;
    providePreferences: true;
    viewCampaignHistory: true;
  };

  // Community & Events
  community: {
    viewPublicEvents: true;
    registerForEvents: true;
    viewNewsletterArchive: true;
    viewAlumniDirectory: true; // inni alumni (bez kontaktu)
    directMessaging: false; // disabled by default
  };

  // Data Export
  dataManagement: {
    downloadPersonalData: true;
    deleteAccount: true; // GDPR right
    exportCertificates: true;
  };
}
```

#### 4.2.2 Kontrola Dostępu do Marketplace Alumni

```sql
-- Policy: Alumni mogą widzieć tylko publiczne i dedykowane oferty
SELECT * FROM jobs
WHERE status = 'published'
AND (
  visibility = 'public'
  OR visibility = 'alumni'
  OR (visibility = 'targeted' AND target_groups && ARRAY['alumni'])
)
AND archived_at IS NULL;

-- Alumni NICHT mają dostępu do:
-- - Internal documentation links
-- - Client company information (except name)
-- - Detailed NDA terms (summary only)
-- - Performance metrics from other projects
-- - Consultant salaries/rates on platform
```

### 4.3 Wygaszanie Dostępu

Gdy konsultant zostaje alumni:
1. Wyłączenie dostępu do sekcji wewnętrznych (2h)
2. Zmiana statusu role-based access (RLS w Supabase)
3. Wysłanie notyfikacji "Witaj w naszym programie alumni"
4. Aktywacja skrzynki odbiorczej kampanii
5. Uruchomienie onboarding alumni (opcjonalne zaproszenie na event)

---

## 5. Zarządzanie Kampaniami Re-engagement

### 5.1 Architektura Kampanii

```typescript
interface AlumniCampaign {
  id: uuid;
  name: string; // np. "Luty 2025 - Powrót do Backend"
  description: string;

  // Konfiguracja Kampanii
  config: {
    type: 'reactivation' | 'referral_focus' | 'event_invitation' | 'newsletter' | 'custom';
    channel: 'email' | 'sms' | 'push' | 'multi';
    status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'archived';
    createdAt: timestamp;
    createdBy: uuid; // Marketing Manager
    approvedBy?: uuid; // HR Manager
    approvalStatus: 'pending' | 'approved' | 'rejected';
  };

  // Targeting
  targeting: {
    targetAudience: {
      skills: uuid[]; // tablica skill IDs
      departmentHistory: string[]; // ['Backend', 'DevOps']
      lastDeparture: {
        from: date;
        to: date; // alumni w ciągu ostatnich X miesięcy
      };
      engagementScore: {
        min: 0;
        max: 100;
      };
      reasonsForLeaving: string[]; // ['voluntary', 'project_ended']
      geographicRegions?: string[];
      availableFrom?: date;
    };
    excludeList: uuid[]; // alumni do wykluczenia
    maxAudience: number; // max number to target
    audienceSize: number; // calculated field
  };

  // Zawartość
  content: {
    subject: string; // email subject
    emailTemplate: {
      templateId: uuid;
      templateName: string;
      previewText: string;
      variables: {
        firstName: string;
        lastProjectName: string;
        timeAway: string;
        recommendedSkills: string[];
      };
      htmlContent: string;
      textContent: string;
      ctaButton: {
        text: string;
        url: string;
        style: 'primary' | 'secondary';
      };
    };
    smsContent?: string;
    pushContent?: {
      title: string;
      body: string;
    };
  };

  // Harmonogram
  schedule: {
    startDate: timestamp;
    endDate: timestamp;
    sendTime: string; // "14:00 CET"
    timezone: string;
    frequency?: 'once' | 'daily' | 'weekly' | 'monthly';
    totalWaves?: number;
  };

  // Tracking & Analytics
  analytics: {
    sentCount: number;
    deliveredCount: number;
    bounceRate: number;
    openRate: number;
    clickRate: number;
    conversionRate: number; // clicked -> applied
    unsubscribeRate: number;
    costPerOpen?: number;
    estimatedRoi?: number;
  };

  // A/B Testing (optional)
  abTest?: {
    isActive: boolean;
    variantA: {
      subject: string;
      audiencePercentage: number; // 50
    };
    variantB: {
      subject: string;
      audiencePercentage: number; // 50
    };
    winningVariant?: 'A' | 'B';
  };

  metadata: {
    tags: string[];
    budget?: number;
    estimatedCost?: number;
  };
}
```

### 5.2 Szablony Email Kampanii

#### 5.2.1 Szablon "Wróć do B2B.net"

```html
Subject: Jan, wróć do B2B.net! Czekamy na Ciebie 🚀
PreviewText: Mamy dla Ciebie idealne stanowisko...

---

Body:

Cześć {{firstName}}! 👋

Mija {{timeAway}} temu, odkąd byliśmy razem ostatni raz na projekcie {{lastProjectName}}.

Myśleliśmy sobie, że mogłoby Ci się przydać coś nowego. Mamy kilka świetnych stanowisk,
które idealnie pasują do Twoich umiejętności:

✓ Java/Spring Developer @ Tech Startup (Remote)
  - 180 PLN/h
  - 3-6 miesięcy
  - Pełnie remote

✓ DevOps Engineer @ FinTech (Hybrid)
  - 160-180 PLN/h
  - 6+ miesięcy
  - Warszawa + Remote

[Przeglądaj dostępne stanowiska]

Co się zmieniło w B2B.net od Twojego wyjścia?
- Nowa platforma z lepszymi narzędziami
- Program alumniów z dodatkowymi benefitami
- Elastyczne warunki współpracy
- Bonus za polecenie znajomych

Masz pytania? Chętnie odpowiemy!
📧 alumni@b2bnet.pl | 📱 +48 22 XXX XXXX

Pozdrawiamy,
Zespół B2B.net

---

Footer:
[Przeglądaj oferty] [Zaktualizuj preferencje] [Wypisz się z kampanii]
```

#### 5.2.2 Szablon "Polecaj i Zarabiaj"

```html
Subject: Polecaj swoich znajomych i zarabiaj! 💰
PreviewText: Program rekomendacji alumni - do 2000 PLN za każdą osobę...

---

Body:

Cześć {{firstName}}! 👋

Mamy coś specjalnego dla Ciebie. Czy znasz kogoś, kto szukałby fajnego projektu w IT?

Program Rekomendacji Alumni:
✓ 500 PLN za rekomendację (gdy kandydat zacznie projekt)
✓ +500 PLN bonus, jeśli kandydat będzie z nami 3+ miesiące
✓ Nieograniczona liczba rekomendacji
✓ Nawet jeśli sam nie wracasz - zarabiaj!)

Jak to działa?
1. Rekomenduj swojego znajomego (via link/formularz)
2. Jeśli zostanie zatrudniony, dostajesz SMS z kodem + 500 PLN
3. Po 3 miesiącach współpracy - kolejne 500 PLN! 🎉

[Zaproś swojego znajomego]

Bonusowe warunki:
- Rekomenduj grupę 3+ osób → dodatkowy bonus 1000 PLN
- Rekomenduj osobę z Twojego ostatniego projektu → +200 PLN

Pytania? alumni@b2bnet.pl

---

Footer:
[Link do rekomendacji] [Historia moich rekomendacji] [Zasady programu]
```

#### 5.2.3 Szablon "Zaproszenie na Event"

```html
Subject: Jesteś zaproszony/a na Alumni Meetup - 15 marca, Warszawa 🎉
PreviewText: Poznaj nowych projektów, podziękowania specjalnych gośći...

---

Body:

Cześć {{firstName}}!

Zapraszamy Cię na nasze pierwsze Alumni Meetup!

📅 Data: 15 marca 2025, godz. 18:00-21:00
📍 Miejsce: Coworking Space, ul. Marszałkowska 54, Warszawa
🎟️ Wstęp: Bezpłatny | 🍕 Catering & Napoje: Gratis

Program:
18:00 - Powitanie + networking
18:30 - Prezentacja: "Trendy w IT 2025"
19:00 - Speed dating: Alumni ↔ Aktualne projekty
19:45 - After-party & networking

Specjalni goście:
- Liderzy zespołów z TOP 5 projektów
- Współpracownicy z Twojego ostatniego kontraktu
- Inne osoby z Twoim seniorem z Java!

[Potwierdź swoją obecność]

Liczba miejsc limitowana - załóż konto w aplikacji, aby się zarejestrować!

Pozdrawiamy,
Zespół Eventów B2B.net

---

Footer:
[Rejestracja] [Program] [Mapa] [Wypisz się]
```

### 5.3 Workflow Tworzenia Kampanii

```
┌─────────────────────────────────────────────────────────────┐
│ Marketing Manager starts campaign                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 1. NOWA KAMPANIA                                            │
│    ├─ Wpisz nazwę: "Luty 2025 - Java Devs"                │
│    ├─ Wybierz typ: "Reactivation"                          │
│    └─ Wybierz kanał: "Email"                               │
│                                                              │
│ 2. TARGETING                                               │
│    ├─ Umiejętności: Java, Spring, Kotlin                  │
│    ├─ Ostatnia data odejścia: 2024-06 do 2025-01          │
│    ├─ Wynik zaangażowania: 30-100                         │
│    ├─ Liczba uczestników: 247 alumni                      │
│    └─ [Preview audience]                                   │
│                                                              │
│ 3. ZAWARTOŚĆ                                               │
│    ├─ Wybierz szablon: "Wróć do B2B.net"                 │
│    ├─ Edytuj subject: "Jan, czekamy na Ciebie..."        │
│    ├─ Personalizuj zmienne                                │
│    ├─ [Preview email]                                      │
│    └─ [Test send to yourself]                             │
│                                                              │
│ 4. HARMONOGRAM                                             │
│    ├─ Data wysyłu: 15.02.2025                            │
│    ├─ Godzina: 14:00 CET                                  │
│    └─ [Schedule]                                           │
│                                                              │
│ 5. PRZEGLĄD & ZATWIERDZENIE                               │
│    ├─ Podsumowanie: 247 odbiorców, "Wróć do B2B.net"    │
│    ├─ Szacowana stawka: 1200 PLN                         │
│    ├─ [Submit for approval]                               │
│    └─ Czeka na zatwierdzenie HR Manager                  │
│                                                              │
│ HR Manager approves campaign                              │
│ ├─ [Review & Approve] or [Reject with feedback]          │
│ │                                                           │
│ └─> APPROVED ✓                                             │
│     └─ Kampania zaplanowana na 15.02.2025                │
│        Notyfikacja do Marketing Manager                   │
│                                                              │
│ 15.02.2025, 14:00 CET: Campaign executes                 │
│ ├─ 247 emails queued                                      │
│ ├─ Personalizacja: {{firstName}}, {{lastProjectName}}   │
│ ├─ Tracking: open, click, conversion                     │
│ └─ Real-time analytics dashboard                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Ścieżka Re-engagement

### 6.1 Funnel Re-engagement Alumni

```
ALUMNI POOL
    │
    ├─ 500 alumni total
    │
    ├───────────────────────────────────┐
    │                                   │
    ▼ STAGE 1: AWARENESS                │
  [Email Campaign Sent]                │
    │                                   │
    ├─ 247 emails sent                 │
    ├─ 78 opened (31%)                 │
    ├─ 19 clicked (24%)                │
    │                                   │
    ▼ STAGE 2: INTEREST                 │
  [Viewed Job Marketplace]             │
    │                                   │
    ├─ 19 visitors                      │
    ├─ 8 viewed 3+ jobs (42%)          │
    ├─ 5 checked available dates        │
    │                                   │
    ▼ STAGE 3: CONSIDERATION            │
  [Job Application Started]            │
    │                                   │
    ├─ 5 applicants                     │
    ├─ 3 completed applications (60%)  │
    ├─ 2 matched with recruiter calls  │
    │                                   │
    ▼ STAGE 4: DECISION                 │
  [Interview/Contract]                 │
    │                                   │
    ├─ 2 interviewed                    │
    ├─ 1 offer sent                     │
    ├─ 1 RETURNED ALUMNI (100%)        │
    │                                   │
    └─ FOLLOW-UP CAMPAIGNS              │
       (to remaining engaged alumni)    │
       Next email sequence in 2 weeks

════════════════════════════════════════
KEY METRICS FOR STAGE:
- Awareness: 31% open rate (target >35%)
- Interest: 24% CTR (target >8%)
- Consideration: 60% app completion
- Decision: 20% conversion (1/5)
- Average funnel velocity: 21 days
════════════════════════════════════════
```

### 6.2 Nurture Sequence - Automatyczne Kampanie

```
┌──────────────────────────────────────────────────────────────┐
│ AUTOMATED RE-ENGAGEMENT SEQUENCE (Multi-Channel Nurture)    │
└──────────────────────────────────────────────────────────────┘

📧 EMAIL SEQUENCE:
│
├─ EMAIL #1 (Day 0)
│  └─ "Cześć {{firstName}}, wróć do B2B.net"
│     └─ If: opened → Tag as "Interested"
│     └─ If: not opened → Retry on Day 3
│
├─ EMAIL #2 (Day 7)
│  └─ "3 oferty pracy czekające na Ciebie"
│     └─ Personalized job recommendations
│     └─ If: clicked → Move to "Active" segment
│
├─ EMAIL #3 (Day 14)
│  └─ "Ostatnia szansa: stanowiska wygasają jutro"
│     └─ Urgency angle
│     └─ If: no action → Move to "Dormant"
│
└─ EMAIL #4 (Day 30)
   └─ "Pamiętaj o nas - program rekomendacji alumni"
      └─ Switch to referral focus
      └─ If: no action ever → Suppress for 90 days

📱 SMS SEQUENCE (opt-in):
│
├─ SMS #1 (Day 2)
│  └─ "Jan, mamy dla Ciebie 3 top oferty! [link] Wróć z nami!"
│
└─ SMS #2 (Day 10)
   └─ "Ostatnie dni! Zatrudniamy Java devów na top stawkach →"

🔔 PUSH NOTIFICATIONS (if app installed):
│
├─ PUSH #1 (Day 1)
│  └─ "Witaj w alumni! Przeglądaj oferty pracy"
│
└─ PUSH #2 (Day 5)
   └─ "[ProjectName] szuka osoby z Twoimi umiejętnościami!"

🎯 BEHAVIORAL TRIGGERS:
│
├─ IF alumni views job marketplace
│  └─ → Send "Similar jobs" recommendation email next day
│
├─ IF alumni starts application
│  └─ → Suppress other emails, send recruiter call
│
├─ IF alumni completes application
│  └─ → Send confirmation + set interview reminder
│
├─ IF alumni unsubscribes
│  └─ → Suppress all emails, move to "Inactive" (respect GDPR)
│
└─ IF alumni receives job offer
   └─ → Congratulations email + onboarding sequence

⏲️ TIMING OPTIMIZATION:
   └─ Each email sent at 14:00 CET (highest open rates)
   └─ Avoid weekends & Polish holidays
   └─ Delay if holiday period detected
```

### 6.3 Re-engagement Metrics & Tracking

```typescript
interface ReEngagementMetrics {
  campaignId: uuid;

  // Stage Metrics
  awareness: {
    totalSent: number;
    delivered: number;
    bounced: number;
    opened: number;
    openRate: number; // %
    uniqueOpens: number;
  };

  interest: {
    clicked: number;
    clickRate: number; // % of delivered
    visitedMarketplace: number;
    viewedJobCount: number;
    avgJobsViewed: number;
  };

  consideration: {
    appliedCount: number;
    applicationRate: number; // % of interested
    completionRate: number;
    avgTimeToApply: number; // days
  };

  decision: {
    interviewedCount: number;
    offersSent: number;
    contractsSigned: number;
    conversionRate: number; // from sent → hired
  };

  // Engagement Score Impact
  engagementScoreChanges: {
    openedEmail: +10;
    clickedEmail: +15;
    viewedJobs: +25;
    applied: +30;
    signedContract: +100;
  };

  // Financial Metrics
  financial: {
    campaignCost: number; // PLN
    avgCostPerOpen: number;
    avgCostPerClickt: number;
    avgCostPerHire: number;
    contractValueGenerated: number; // PLN
    roi: number; // %
  };

  // Cohort Analysis
  cohortAnalysis: {
    bySkill: {
      skill: string;
      returnRate: number;
      avgTimeToReturn: number;
      cycleValue: number;
    }[];

    byReasonForLeaving: {
      reason: string;
      returnRate: number;
      preferredSkills: string[];
    }[];

    byTimeSinceDeparture: {
      monthRange: string; // "0-3 months", "3-6 months"
      returnRate: number;
      engagementLevel: string;
    }[];
  };
}
```

---

## 7. System Rekomendacji Alumni

### 7.1 Program Rekomendacji Alumni (Referral Program)

```typescript
interface AlumniReferralProgram {
  id: uuid;

  // Referrer Info
  referrer: {
    alumniId: uuid;
    name: string;
    lastProject: string;
    skills: string[];
  };

  // Referred Candidate Info
  candidate: {
    name: string;
    email: string;
    phone: string;
    linkedinProfile: string;
    experience: string; // years
    skills: string[];
    currentCompany?: string;
    applicationSource: 'referral_program';
  };

  // Referral Details
  referral: {
    createdAt: timestamp;
    message?: string; // personal note from alumni
    relationship: 'colleague' | 'friend' | 'acquaintance' | 'other';
    confidenceLevel: 1 | 2 | 3 | 4 | 5; // jak pewny referrer
  };

  // Tracking
  status: 'pending' | 'applied' | 'interview' | 'offer' | 'hired' | 'rejected';

  // Rewards
  rewards: {
    referralBonus: {
      amount: 500; // PLN - when candidate hired
      isPaid: boolean;
      paidAt?: timestamp;
    };
    loyaltyBonus: {
      amount: 500; // PLN - when candidate works 3+ months
      condition: 'candidate_3_months_employed';
      isPaid: boolean;
      paidAt?: timestamp;
    };
    groupBonus?: {
      amount: 1000; // PLN - if 3+ referrals hired
      condition: 'referrer_3_hires';
      isPaid: boolean;
    };
    totalEarnings: number;
  };

  // Stats
  stats: {
    referralValue: number; // contract value introduced
    clientCompany: string;
    projectValue: number;
    contractLength: string; // "3 months", "6 months+"
  };

  metadata: {
    createdAt: timestamp;
    updatedAt: timestamp;
    referrerNotes: string;
    recruiterNotes: string;
  };
}

interface AlumniReferralLeaderboard {
  rank: number;
  alumniName: string;
  referralsSuccessful: number;
  totalEarned: number; // PLN
  badge?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  month: string; // "2025-02"
  trend: 'up' | 'down' | 'stable';
}
```

### 7.2 Interfejs Rekomendacji Alumni

```
┌──────────────────────────────────────────────────────────────┐
│ PROGRAM REKOMENDACJI - Jan Kowalski                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ 💰 TWOJE ZAROBKI Z REKOMENDACJI                             │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Liczba rekomendacji: 7                                 │  │
│ │ Zatrudnione osoby: 3                                   │  │
│ │ Zarobione: 1500 PLN                                    │  │
│ │ Do zdobycia: 1000 PLN (czekaj na 2. osobę w 3mc)     │  │
│ │                                                         │  │
│ │ 📊 Ranking: #14 / 500 alumni                          │  │
│ │ 🏅 Kolejny medal: Silver (potrzebujesz 2 więcej)     │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                               │
│ 📝 POLECAJ SWOJEGO ZNAJOMEGO                                │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Imię: [_________________________]                       │  │
│ │ Email: [_________________________]                     │  │
│ │ Phone: [_________________________]                     │  │
│ │ LinkedIn: [_________________________]                  │  │
│ │                                                         │  │
│ │ Znasz osób: ☐ z pracy ☐ przyjaciół ☐ inne           │  │
│ │                                                         │  │
│ │ Wiadomość (optional):                                 │  │
│ │ [___________________________________________________]  │  │
│ │                                                         │  │
│ │ [PRZEŚLIJ REKOMENDACJĘ]                              │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                               │
│ 📋 HISTORIA MOICH REKOMENDACJI                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ # | Nazwa          | Status    | Bonus  | Data        │  │
│ ├────────────────────────────────────────────────────────┤  │
│ │ 1 │ Anna Nowak     │ ✅ Zatrudniona│ 500 PLN │ 01.01 │  │
│ │ 2 │ Piotr Lewicki  │ ✅ Zatrudniony│ 500 PLN │ 15.01 │  │
│ │ 3 │ Magdalena ...  │ 💬 Interview  │ -      │ 20.01 │  │
│ │ 4 │ Kacper ...     │ 📧 Applied    │ -      │ 25.01 │  │
│ │ 5 │ Agata ...      │ ⏳ Pending    │ -      │ 01.02 │  │
│ │ 6 │ Robert ...     │ ❌ Odrzucony  │ -      │ 05.02 │  │
│ │ 7 │ Paulina ...    │ ⏳ Pending    │ -      │ 08.02 │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                               │
│ BONUS MILESTONES:                                           │
│ ✅ 1 zatrudniona osoba   → 500 PLN                         │
│ ✅ 2 zatrudnione osoby   → 1000 PLN (+ 500 za drugą)      │
│ ⏳ 3 zatrudnione osoby   → 1500 PLN (+ 1000 bonus grupa)   │
│                                                               │
│ [Więcej informacji o programie] [Moje statystyki]          │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 Workflow Rekomendacji (Candidate Journey)

```
ALUMNI SUBMITS REFERRAL
        │
        ▼
CANDIDATE RECEIVES EMAIL
"Jan Kowalski polecił Cię dla projektu Backend Developer"
        │
        ├─[Click link] → Goes to referral application form
        │
        ▼
CANDIDATE APPLIES
(Application tagged as "Referred by Jan Kowalski")
        │
        ├─ Automatic notification to Jan: "Twoja rekomendacja aplikowała!"
        │  └─ Engagement points: +10
        │
        ▼
RECRUITER REVIEWS
        │
        ├─ [Pass to interview] → Jan notified
        │  │                      "Twoja rekomendacja w fazie interview!"
        │  │                      Engagement: +20
        │  │
        │  ▼
        │  CANDIDATE INTERVIEWED
        │  ├─ Passed → Offer made
        │  │   └─ Jan notified: "Oferujemy pracę Twojemu poleceniu!"
        │  │      Engagement: +50
        │  │
        │  ▼
        │  OFFER ACCEPTED
        │  ├─ Candidate hired
        │  │  ├─ Jan gets 500 PLN bonus (SMS notification)
        │  │  ├─ Engagement: +30
        │  │  └─ Status: "Referral Successful"
        │  │
        │  ▼
        │  CANDIDATE WORKS 3 MONTHS
        │  ├─ Jan gets additional 500 PLN bonus
        │  ├─ Engagement: +20 (loyalty)
        │  └─ Status: "Referral Successful (3mo)"
        │
        └─ [Reject] → Jan notified
           "Dziękujemy za rekomendację, niestety nie zdał interview"
           Engagement: +5 (appreciation)
           Status: "Referral Rejected"

REWARDS SETTLEMENT:
├─ 500 PLN sent to Jan's account (within 5 business days)
├─ Receipt: "Bonus za rekomendację Anny Nowak - 500 PLN"
└─ Leaderboard updated (Jan now #14)
```

---

## 8. Przepływ Offboardingu

### 8.1 Proces Offboardingu (Active → Alumni)

```
┌───────────────────────────────────────────────────────────────┐
│ CONSULTANT OFFBOARDING WORKFLOW                              │
└───────────────────────────────────────────────────────────────┘

STAGE 1: PROJECT END INITIATED (T-14 days)
├─ Project manager marks project as "ending"
├─ System sends notification to HR:
│  "Jan Kowalski's project ends on 15.02.2025"
├─ HR adds notes to offboarding checklist
└─ Consultant doesn't see changes yet

STAGE 2: OFFBOARDING PREPARATION (T-7 days)
├─ HR creates offboarding record:
│  ├─ Project: Client X - Senior Java Developer
│  ├─ End date: 15.02.2025
│  ├─ Reason: project_ended
│  └─ Feedback from Project Manager: "Excellent work, 4.8/5"
│
├─ HR completes offboarding checklist:
│  ├─ ☑ Feedback from PM collected
│  ├─ ☑ Projects documentation archived
│  ├─ ☑ Performance metrics recorded
│  ├─ ☑ Skills verified
│  └─ ☑ Alumni profile created (draft)
│
├─ Consultant invited to offboarding interview:
│  "Hi Jan, let's discuss your next steps and gather feedback"
│
└─ Alumni profile auto-populated:
   ├─ All projects from history copied
   ├─ Skills extracted from project data
   ├─ Last project: Client X project
   └─ Default preferences: skill-based

STAGE 3: OFFBOARDING CONVERSATION (T-3 days)
├─ HR schedules 30-min call with consultant
├─ Discussion topics:
│  ├─ Project experience feedback
│  ├─ Skills gained/improved
│  ├─ Interest in returning (timeline)
│  ├─ Reason for departure (if voluntary)
│  ├─ Preferred skills for next project
│  ├─ Availability & work preferences
│  └─ Communication preferences
│
├─ HR records in system:
│  ├─ Reason for leaving (voluntary/project_ended/other)
│  ├─ Expected return date (if provided)
│  ├─ Project preferences (skills, rate, availability)
│  └─ Communication frequency preference
│
└─ Consultant signs alumni agreement (digital):
   "Agree to participate in alumni program & receive communications"

STAGE 4: TRANSITION TO ALUMNI (T-0, Last day)
├─ System executes role-based access change (RLS update):
│  └─ Active Consultant → Alumni role
│
├─ Technical changes (2-hour window):
│  ├─ Disable access to internal documentation sections
│  ├─ Update navbar (hide internal tools, show "Marketplace")
│  ├─ Activate alumni-specific features (referral, campaigns)
│  └─ Send confirmation email
│
├─ Status updates:
│  ├─ Consultant status: Active → Alumni
│  ├─ Alumni status: Active (not dormant)
│  ├─ Last project: marked as completed
│  ├─ Engagement score: initialized at 50
│  └─ Re-engagement: marked as "eligible_for_campaigns"
│
├─ Welcome email sent:
│  Subject: "Witaj w programie Alumni B2B.net! 🎉"
│  Content:
│    "Hi Jan!
│
│     Dziękujemy za wspaniałą współpracę na projekcie Client X.
│     Twoje doświadczenie (4.8/5 feedback) zostało zapisane.
│
│     Teraz jesteś częścią naszego programu Alumni:
│     ✓ Dostęp do marketplace z nowymi ofertami
│     ✓ Możliwość polecania znajomych (500 PLN za każdego!)
│     ✓ Zaproszenia na exclusive eventy
│     ✓ Aktualizacje o nowych projektach
│
│     Czy chciałbyś wrócić? Przeglądaj dostępne stanowiska →
│
│     [View Marketplace]
│
│     Pozdrawiamy,
│     Zespół B2B.net"
│
└─ Optional: Onboarding alumni call:
   "Pokaż Ti nowe funkcje w alumni portal"

STAGE 5: POST-OFFBOARDING (T+7 days)
├─ Follow-up email sent to check in:
│  "Hi Jan, jak się masz? Czy znaleźliśmy już nowy projekt? 😊"
│
├─ System monitors engagement:
│  ├─ Did they view marketplace? → engaged
│  ├─ Did they update preferences? → engaged
│  ├─ No activity → wait 30 days before first campaign
│  └─ Track time-since-departure
│
├─ Eligibility for campaigns:
│  ├─ Start: 7 days after offboarding
│  ├─ Frequency: 1 email per week
│  └─ Personalization: based on offboarding feedback
│
└─ Dormant after: 180 days without activity
   ├─ Marketing campaigns paused
   ├─ Engagement score decreases (-5/week)
   └─ Re-activation sequences triggered

STAGE 6: RE-ENGAGEMENT OR RE-HIRE (Ongoing)
├─ Alumni applies to project → New consultant journey begins
├─ Re-hired consultant → Status: Active (history preserved)
├─ Alumni hires someone → Referral bonus processed
└─ Alumni stays inactive → Annual review (check-in email)
```

### 8.2 Offboarding Checklist (HR Admin View)

```
HR OFFBOARDING CHECKLIST - Jan Kowalski
Project: Client X - Senior Java Developer
Project End Date: 15.02.2025
Status: In Progress

┌─────────────────────────────────────────────────────────────┐
│ DOCUMENTATION                                               │
├─────────────────────────────────────────────────────────────┤
│ ☑ Project feedback from PM collected                       │
│ ☑ Performance metrics recorded                             │
│ ☑ Skills verified by PM                                   │
│ ☑ Project documentation archived                          │
│ ☑ Time reports finalized                                  │
│ ☐ Exit interview scheduled                                │
│ ☑ Exit interview completed (12.02.2025, HR-Anna)          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ALUMNI PROFILE SETUP                                        │
├─────────────────────────────────────────────────────────────┤
│ ☑ Alumni profile created                                   │
│ ☑ Project history imported                                │
│ ☑ Skills populated from projects                          │
│ ☑ Last project marked as completed                        │
│ ☑ Reason for leaving recorded: "Project ended"           │
│ ☑ Performance rating saved: 4.8/5                         │
│ ☑ Default project preferences populated                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ COMMUNICATION & PREFERENCES                                 │
├─────────────────────────────────────────────────────────────┤
│ ☑ Alumni agreement signed: 12.02.2025                    │
│ ☑ Email preferences recorded: Weekly emails              │
│ ☑ Preferred communication: Email                          │
│ ☑ Availability noted: From 01.03.2025                   │
│ ☑ Preferred skills: Java, Spring, Kubernetes            │
│ ☑ Min rate: 150 PLN/h                                    │
│ ☑ Remote preference: Full remote                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ SYSTEM ACCESS & TRANSITIONS                                │
├─────────────────────────────────────────────────────────────┤
│ ☑ Access audit completed                                  │
│ ☑ Ready for role transition: 15.02.2025                 │
│ ☑ Offboarding automation approved                         │
│ ☐ Scheduled role change to Alumni (15.02 at 23:00)     │
│ ☐ Welcome email queued                                   │
│ ☐ Marketplace access activated                           │
│ ☐ Referral program enabled                               │
└─────────────────────────────────────────────────────────────┘

NOTES:
────────────────────────────────────────────────────────────────
Jan was excellent consultant. PM mentioned he proactively
solved critical issues. Consider him for future senior roles.
He's interested in returning within 3 months if right project.
Available from 01.03.2025. Prefers remote + Java stack.
────────────────────────────────────────────────────────────────

[COMPLETE OFFBOARDING] [SAVE] [PRINT] [EMAIL SUMMARY TO JAN]
```

---

## 9. Analityka Alumni

### 9.1 Dashboard Analityki Alumni

```
┌────────────────────────────────────────────────────────────────┐
│ ALUMNI ANALYTICS DASHBOARD                                    │
└────────────────────────────────────────────────────────────────┘

OVERVIEW METRICS (Current Month)
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  Total Alumni: 847 (+23 this month)   Active: 312            │
│  Return Rate (YTD): 18%               Referral Rate: 28%     │
│  Avg Time to Return: 142 days         Total Referrals: 187   │
│  Avg Re-engagement Score: 52/100      Dormant: 232           │
│                                                                │
│ ROI Alumni Program: 4.2:1 (4.2 PLN revenue per 1 PLN spent)  │
│                                                                │
└────────────────────────────────────────────────────────────────┘

RETURN RATE ANALYSIS (Last 12 Months)
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  % Alumni Returned vs. Time Since Departure                  │
│                                                                │
│   30%  ┌───┐                                                  │
│        │   │                                                  │
│   25%  │   │ ┌───┐                                           │
│        │   │ │   │                                           │
│   20%  │   │ │   │ ┌───┐                                     │
│        │   │ │   │ │   │                                     │
│   15%  │   │ │   │ │   │ ┌───┐                               │
│        │   │ │   │ │   │ │   │                               │
│   10%  │   │ │   │ │   │ │   │ ┌───┐                         │
│        │   │ │   │ │   │ │   │ │   │                         │
│    5%  │   │ │   │ │   │ │   │ │   │ ┌───┐                   │
│        │   │ │   │ │   │ │   │ │   │ │   │                   │
│    0%  └───┴─┴───┴─┴───┴─┴───┴─┴───┴─┴───┴───────────        │
│        1mo  2mo  3mo  4mo  5mo  6mo  7mo  8mo  9mo            │
│                                                                │
│  Key insights:                                               │
│  - Peak return window: 2-4 months after departure            │
│  - 28% return within 3 months                                │
│  - Only 12% return after 6 months                            │
│  - Action: Focus campaigns on 2-4 month alumni              │
│                                                                │
└────────────────────────────────────────────────────────────────┘

REFERRAL PROGRAM PERFORMANCE
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│ Total Referrals Submitted: 187        Hired: 34 (18%)       │
│ Total Payout: 34,000 PLN              Pending: 15,000 PLN   │
│                                                                │
│ TOP REFERRERS (This Month):                                  │
│ 1. 🥇 Anna Nowak      - 5 referrals, 3 hired → 2000 PLN      │
│ 2. 🥈 Piotr Lewicki   - 4 referrals, 2 hired → 1000 PLN      │
│ 3. 🥉 Magdalena Kowal - 3 referrals, 2 hired → 1500 PLN      │
│ 4. Kacper Żak        - 3 referrals, 1 hired → 500 PLN       │
│ 5. Agata Nowak       - 2 referrals, 1 hired → 500 PLN       │
│                                                                │
│ Leaderboard size: Top 50 alumni doing 70% of referrals      │
│ → Opportunity: Engage bottom 50% more (long tail)           │
│                                                                │
└────────────────────────────────────────────────────────────────┘

CAMPAIGN PERFORMANCE (Last 30 Days)
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│ Campaign Name              | Sent  | Open  | Click | Conv    │
│ ─────────────────────────────────────────────────────────────│
│ Wróć do B2B.net (Luty)    │ 247   │ 78    │  19   │  1     │
│ (Open Rate: 31%, CTR: 24%) │       │ (31%) │ (24%) │ (5%)  │
│ ─────────────────────────────────────────────────────────────│
│ Java Devs - Specjalny     │ 156   │ 58    │  11   │  0     │
│ (Open Rate: 37%, CTR: 19%) │       │ (37%) │ (19%) │ (0%)  │
│ ─────────────────────────────────────────────────────────────│
│ Program Rekomendacji      │ 312   │ 112   │  34   │  7     │
│ (Open Rate: 36%, CTR: 30%) │       │ (36%) │ (30%) │ (21%) │
│ ─────────────────────────────────────────────────────────────│
│ Alumni Newsletter (Feb)    │ 847   │ 289   │  52   │  -     │
│ (Open Rate: 34%, CTR: 18%) │       │ (34%) │ (18%) │ (N/A) │
│                                                                │
│ Best performing: Program Rekomendacji (30% CTR)              │
│ → Increase focus on referral campaigns                       │
│                                                                │
└────────────────────────────────────────────────────────────────┘

ALUMNI SEGMENTATION
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│ Segment              | Count | Engagement | Return % | Action │
│ ─────────────────────────────────────────────────────────────│
│ Highly Engaged       │ 95    │ 80-100     │ 45%     │        │
│ (Recent, active)     │       │            │         │ Nurture│
│ ─────────────────────────────────────────────────────────────│
│ Moderately Engaged   │ 217   │ 50-79      │ 22%     │ Re-engage
│ (Opened emails)      │       │            │         │ campaigns │
│ ─────────────────────────────────────────────────────────────│
│ Low Engagement       │ 203   │ 20-49      │ 8%      │ Win-back │
│ (Inactive 90+ days)  │       │            │         │ sequence │
│ ─────────────────────────────────────────────────────────────│
│ Dormant             │ 332   │ 0-19       │ 2%      │ Suppress │
│ (No activity 6mo+)   │       │            │         │ campaigns │
│                                                                │
└────────────────────────────────────────────────────────────────┘

COHORT ANALYSIS
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│ Cohort (Departure Month) | Size | Return % | Time | Revenue │
│ ─────────────────────────────────────────────────────────────│
│ Jan 2025                 │ 52   │ 35%      │ 42d  │ 2.1M PLN │
│ Dec 2024                 │ 48   │ 25%      │ 78d  │ 1.8M PLN │
│ Nov 2024                 │ 41   │ 17%      │ 109d │ 1.2M PLN │
│ Oct 2024                 │ 38   │ 13%      │ 140d │ 0.9M PLN │
│ ─────────────────────────────────────────────────────────────│
│ Trend: Earlier cohorts show 35% return → good indicator     │
│ → Launch intensive campaigns for recent alumni             │
│                                                                │
└────────────────────────────────────────────────────────────────┘

SKILL-BASED RETURN ANALYSIS
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│ Skill               | Alumni | Returned | Return % | Demand   │
│ ─────────────────────────────────────────────────────────────│
│ Java/Spring         │ 156    │ 31       │ 20%      │ High 🔴  │
│ Kubernetes          │ 89     │ 19       │ 21%      │ High 🔴  │
│ Python/Django       │ 76     │ 12       │ 16%      │ Medium   │
│ React/Next.js       │ 112    │ 18       │ 16%      │ High 🔴  │
│ DevOps              │ 67     │ 14       │ 21%      │ High 🔴  │
│ .NET/C#             │ 54     │ 7        │ 13%      │ Low      │
│ ─────────────────────────────────────────────────────────────│
│ Insight: Java & Kubernetes alumni return @ 20%+ rates      │
│ These skills have high market demand                        │
│ → Allocate more campaign budget to these cohorts          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 9.2 Metryki Analityczne

```typescript
interface AlumniAnalytics {
  // Return Metrics
  returns: {
    totalReturned: number;
    returnRate: number; // %
    returnRateByMonth: Map<string, number>;
    avgTimeBetweenDepartureAndReturn: number; // days
    returnsBySkill: Map<string, number>;
    returnsByDepartureReason: Map<string, number>;
    costPerReturn: number; // PLN
  };

  // Referral Metrics
  referrals: {
    totalReferralsSubmitted: number;
    referralRate: number; // % of alumni who referred
    totalReferralHires: number;
    hireRateFromReferrals: number; // % of referrals → hired
    totalPayoutAmount: number; // PLN
    avgPayoutPerReferrer: number;
    topReferrers: AlumniReferrer[];
  };

  // Campaign Metrics
  campaigns: {
    campaignsRun: number;
    totalSent: number;
    totalDelivered: number;
    avgOpenRate: number;
    avgClickRate: number;
    avgConversionRate: number;
    bestPerformingCampaign: string;
    estimatedCampaignROI: number;
  };

  // Engagement Metrics
  engagement: {
    avgEngagementScore: number;
    activeAlumni: number;
    dormantAlumni: number;
    highlyEngagedSegment: number;
    engagementTrend: 'improving' | 'stable' | 'declining';
  };

  // Financial Impact
  financial: {
    totalContractsFromAlumni: number; // in PLN
    totalReferralValue: number;
    campaignSpend: number;
    eventSpend: number;
    totalProgramCost: number;
    programmROI: number; // %
    paybackPeriod: number; // months
  };

  // Cohort Analysis
  cohortAnalysis: {
    cohortName: string;
    cohortSize: number;
    returnRateByCohort: number;
    avgTimeToReturn: number;
    referralRateByCohort: number;
    retentionInSecondProject: number; // %
  }[];
}
```

---

## 10. Zdarzenia i Biuletyn Alumni

### 10.1 Program Zdarzeń Alumni

```typescript
interface AlumniEvent {
  id: uuid;
  name: string;
  description: string;
  type: 'meetup' | 'workshop' | 'conference' | 'networking' | 'webinar';
  date: timestamp;
  endDate: timestamp;
  location: {
    city: string;
    venue: string;
    address?: string;
    isVirtual: boolean;
    zoomLink?: string;
  };

  organizer: {
    organizerId: uuid;
    organizerName: string; // usually HR or Marketing Manager
    department: string;
  };

  registration: {
    maxCapacity: number;
    registeredCount: number;
    attendedCount: number;
    openToAlumniOnly: boolean;
    requiresApproval: boolean;
  };

  content: {
    agenda: string; // markdown
    speakersInvited: string[];
    sponsorsInvited?: string[];
    estimatedDuration: string; // "180 minutes"
    language: 'Polish' | 'English';
  };

  benefits: {
    networking: true;
    freeFoodAndDrinks: boolean;
    certificates: boolean;
    prizes?: string[];
  };

  visibility: 'public' | 'alumni_only' | 'targeted';
  targetGroups?: string[]; // ['Java developers', 'Recent alumni']

  status: 'planning' | 'scheduled' | 'ongoing' | 'completed' | 'cancelled';

  engagement: {
    invitationsSent: number;
    registrations: number;
    attendees: number;
    feedbackScore: number; // 1-5
    feedbackComments: string[];
  };
}
```

### 10.2 Alumni Newsletter

```
┌──────────────────────────────────────────────────────────────┐
│ B2B.NET ALUMNI NEWSLETTER                                   │
│ February 2025 Edition                                       │
│ „Building Together" - Biuletyn dla Naszych Byłych Kolegów  │
└──────────────────────────────────────────────────────────────┘

┌─ BREAKING NEWS ──────────────────────────────────────────┐
│ 🎉 Alumni Meetup Success!                                │
│                                                           │
│ Dziękujemy za udział w naszym Alumni Meetup (1 marca)!  │
│ 120+ alumni, 5 top projektów, 20+ nowych ofert pracy.   │
│ Już teraz 8 powrotów zaplanowanych na marzec!           │
│                                                           │
│ [Przeglądaj zdjęcia z eventu]                           │
└─────────────────────────────────────────────────────────┘

┌─ TOP STORIES ─────────────────────────────────────────────┐
│                                                           │
│ 💰 Program Rekomendacji Alumni                           │
│ Czy wiesz, że możesz zarabiać do 1000 PLN za          │
│ rekomendację? Anna Nowak zarobila już 2500 PLN!        │
│ [Dowiedz się więcej]                                    │
│                                                           │
│ 🔧 Tech Trends 2025                                     │
│ Co się zmienia w świecie IT? Przeczytaj naszą         │
│ analizę trendów wymaganych umiejętności.               │
│ [Artykuł] [Infografika]                                │
│                                                           │
│ 👥 Alumni Success Story: Kinga's Journey              │
│ Wróciła do nas po 8 miesiącach i znalazła idealne     │
│ stanowisko. Przeczytaj jej historię.                   │
│ [Historia]                                              │
│                                                           │
└─────────────────────────────────────────────────────────┘

┌─ HOT JOBS FOR YOU ────────────────────────────────────────┐
│ Based on your skills: Java, Spring, Kubernetes        │
│                                                        │
│ 🟢 Senior Backend Developer @ Financial Corp         │
│    200 PLN/h | Full Remote | 6 months                │
│    [Aplikuj] [Szczegóły]                             │
│                                                        │
│ 🟢 DevOps Engineer @ Startup (Series B)              │
│    180-200 PLN/h | Hybrid (Gdańsk) | 12 months     │
│    [Aplikuj] [Szczegóły]                             │
│                                                        │
│ 🟡 Architekt Java @ Insurance Company                │
│    220 PLN/h | Hybrid (Warsaw) | 9 months           │
│    [Aplikuj] [Szczegóły]                             │
│                                                        │
│ [Przeglądaj wszystkie 47 ofert]                     │
│                                                        │
└─────────────────────────────────────────────────────────┘

┌─ UPCOMING EVENTS ─────────────────────────────────────────┐
│                                                           │
│ 📅 Alumni Workshop: "Kubernetes in 2025"              │
│    15 marca, 18:00 (online)                           │
│    Prowadzi: Jan Smaczyński (DevOps Lead @ Acme)     │
│    [Rejestruj]                                        │
│                                                           │
│ 🎤 Webinar: Negotiating Your IT Career               │
│    22 marca, 19:00 (online, EN)                       │
│    Prowadzi: Global HR Expert Sarah Johnson          │
│    [Rejestruj]                                        │
│                                                           │
│ 🍕 Quarterly Networking Breakfast                    │
│    29 marca, 8:00 (Warszawa, offline)                │
│    Networking + recruitment insights                 │
│    [Rejestruj]                                        │
│                                                           │
│ [Więcej eventów w kalendarzu]                        │
│                                                           │
└─────────────────────────────────────────────────────────┘

┌─ ALUMNI SPOTLIGHT ────────────────────────────────────────┐
│                                                           │
│ 🌟 Person of the Month: Piotr Lewicki                   │
│    "3 successful referrals in February!"               │
│    Piotr polecił 3 výjimečných developerów.           │
│    Zarobił 1500 PLN i zajął #3 na liście liderów.    │
│    [Przeczytaj interview]                             │
│                                                           │
│ 📈 Milestone Reached: 850 alumni members               │
│    Dziękujemy za bycie częścią naszej rodziny!       │
│                                                           │
└─────────────────────────────────────────────────────────┘

┌─ COMPANY UPDATES ─────────────────────────────────────────┐
│                                                           │
│ 🚀 New Platform Features for Alumni                    │
│    - Enhanced job filtering                           │
│    - Real-time referral status tracking               │
│    - Skills verification badges                       │
│    [Discover new features]                            │
│                                                           │
│ 📊 B2B.net Growth                                      │
│    - 150 new projects added in February               │
│    - Expanded to 3 new countries                      │
│    - 500+ consultants on platform                     │
│                                                           │
└─────────────────────────────────────────────────────────┘

┌─ COMMUNITY CORNER ────────────────────────────────────────┐
│                                                           │
│ Q: How quickly can I rejoin after alumni status?      │
│ A: Immediately! You can apply to jobs right away.    │
│    Most alumni re-hire process takes 1-2 weeks.      │
│                                                           │
│ Q: Can I refer someone who's not a developer?        │
│ A: Absolutely! We're looking for PMs, QAs, and more. │
│    [All open positions]                               │
│                                                           │
│ [Send your question] [View all FAQs]                 │
│                                                           │
└─────────────────────────────────────────────────────────┘

┌─ FOOTER ──────────────────────────────────────────────────┐
│                                                           │
│ Got feedback? Chciałbyś artykuł o czymś? Napisz!      │
│ alumni@b2bnet.pl                                      │
│                                                           │
│ [Settings] [Manage Preferences] [Unsubscribe]        │
│                                                           │
│ © 2025 B2B.net S.A. | Copyrights Reserved            │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 11. Architektura Techniczna

### 11.1 Database Schema (Supabase PostgreSQL)

```sql
-- Alumni Profile Tables

CREATE TABLE alumni_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  alumni_since TIMESTAMP NOT NULL,
  status TEXT CHECK (status IN ('active', 'alumni', 'dormant', 'inactive')),
  reason_for_leaving JSONB,
  last_project_id UUID,
  engagement_score INT DEFAULT 50 CHECK (engagement_score >= 0 AND engagement_score <= 100),
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE alumni_project_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumni_id UUID NOT NULL REFERENCES alumni_profiles(id),
  project_id UUID NOT NULL,
  project_name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT CHECK (status IN ('completed', 'ongoing', 'terminated')),
  client_name TEXT,
  success_metrics TEXT,
  reason_for_end TEXT,
  performance_rating NUMERIC(2, 1),
  client_feedback NUMERIC(2, 1),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE alumni_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumni_id UUID NOT NULL REFERENCES alumni_profiles(id),
  skill_id UUID NOT NULL,
  skill_name TEXT NOT NULL,
  proficiency_level INT CHECK (proficiency_level >= 1 AND proficiency_level <= 5),
  years_of_experience NUMERIC(3, 1),
  last_used DATE,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE alumni_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumni_id UUID NOT NULL UNIQUE REFERENCES alumni_profiles(id),
  preferred_skills TEXT[],
  available_from DATE,
  max_hours_per_week INT,
  min_rate NUMERIC(7, 2),
  min_contract_length TEXT,
  geographic_preferences TEXT[],
  remote_preference TEXT CHECK (remote_preference IN ('full', 'hybrid', 'onsite', 'flexible')),
  email_frequency TEXT DEFAULT 'weekly',
  preferred_channels TEXT[],
  newsletter_subscribed BOOLEAN DEFAULT TRUE,
  event_invitations BOOLEAN DEFAULT TRUE,
  job_alerts BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Campaign Tables

CREATE TABLE alumni_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('reactivation', 'referral_focus', 'event_invitation', 'newsletter', 'custom')),
  channel TEXT CHECK (channel IN ('email', 'sms', 'push', 'multi')),
  status TEXT CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'archived')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approval_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  scheduled_start TIMESTAMP,
  scheduled_end TIMESTAMP,
  actual_sent TIMESTAMP
);

CREATE TABLE alumni_campaign_targeting (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES alumni_campaigns(id),
  target_skills UUID[],
  target_departments TEXT[],
  departure_date_from DATE,
  departure_date_to DATE,
  engagement_score_min INT DEFAULT 0,
  engagement_score_max INT DEFAULT 100,
  reasons_for_leaving TEXT[],
  exclude_list UUID[],
  max_audience INT,
  audience_size INT GENERATED ALWAYS AS (
    SELECT COUNT(*) FROM alumni_profiles WHERE engagement_score BETWEEN engagement_score_min AND engagement_score_max
  ) STORED
);

CREATE TABLE alumni_campaign_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES alumni_campaigns(id),
  template_id UUID,
  subject TEXT,
  preview_text TEXT,
  html_content TEXT,
  text_content TEXT,
  cta_button_text TEXT,
  cta_button_url TEXT
);

CREATE TABLE alumni_campaign_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES alumni_campaigns(id),
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  bounce_count INT DEFAULT 0,
  open_count INT DEFAULT 0,
  unique_open_count INT DEFAULT 0,
  click_count INT DEFAULT 0,
  conversion_count INT DEFAULT 0,
  unsubscribe_count INT DEFAULT 0,
  bounce_rate NUMERIC(4, 2),
  open_rate NUMERIC(4, 2),
  click_rate NUMERIC(4, 2),
  conversion_rate NUMERIC(4, 2),
  cost_per_open NUMERIC(7, 2),
  estimated_roi NUMERIC(5, 2),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Referral Tables

CREATE TABLE alumni_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES alumni_profiles(id),
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,
  candidate_linkedin TEXT,
  candidate_skills TEXT[],
  relationship TEXT,
  confidence_level INT CHECK (confidence_level >= 1 AND confidence_level <= 5),
  message TEXT,
  status TEXT CHECK (status IN ('pending', 'applied', 'interview', 'offer', 'hired', 'rejected')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE alumni_referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL UNIQUE REFERENCES alumni_referrals(id),
  referral_bonus NUMERIC(7, 2) DEFAULT 500,
  loyalty_bonus NUMERIC(7, 2) DEFAULT 500,
  group_bonus NUMERIC(7, 2),
  bonus_paid BOOLEAN DEFAULT FALSE,
  total_earned NUMERIC(7, 2),
  paid_at TIMESTAMP
);

-- Offboarding Tables

CREATE TABLE offboarding_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  project_id UUID,
  offboarding_date DATE,
  reason TEXT,
  exit_interview_conducted BOOLEAN,
  interview_date TIMESTAMP,
  interviewed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  alumni_profile_created BOOLEAN,
  transition_completed BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Analytics/Historical Tables

CREATE TABLE alumni_engagement_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumni_id UUID NOT NULL REFERENCES alumni_profiles(id),
  engagement_action TEXT,
  engagement_points INT,
  campaign_id UUID REFERENCES alumni_campaigns(id),
  action_timestamp TIMESTAMP DEFAULT NOW()
);

-- Row Level Security Policies
ALTER TABLE alumni_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alumni can view own profile"
  ON alumni_profiles FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND role = 'hr_manager'
  ));

CREATE POLICY "Alumni can update own profile"
  ON alumni_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Campaign targeting visible to marketing"
  ON alumni_campaigns FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND role IN ('marketing', 'hr_manager')
  ));
```

### 11.2 API Endpoints (Next.js)

```typescript
// api/alumni/profile.ts
export async function GET(req: Request) {
  // GET /api/alumni/profile - Get logged-in alumni profile
  const userId = req.user.id;
  const profile = await db.query('SELECT * FROM alumni_profiles WHERE user_id = $1', [userId]);
  return Response.json(profile);
}

export async function PATCH(req: Request) {
  // PATCH /api/alumni/profile - Update alumni profile preferences
  const { preferences } = await req.json();
  await db.query('UPDATE alumni_preferences SET ... WHERE alumni_id = $1', [...]);
  return Response.json({ success: true });
}

// api/admin/campaigns.ts
export async function POST(req: Request) {
  // POST /api/admin/campaigns - Create new campaign
  const { name, type, targeting, content } = await req.json();
  // Save to DB, prepare for scheduling
  return Response.json({ campaignId, status: 'draft' });
}

export async function GET(req: Request) {
  // GET /api/admin/campaigns - List all campaigns
  const campaigns = await db.query('SELECT * FROM alumni_campaigns');
  return Response.json(campaigns);
}

// api/admin/campaigns/[id]/approve.ts
export async function POST(req: Request, { params }) {
  // POST /api/admin/campaigns/:id/approve - HR approves campaign
  await db.query('UPDATE alumni_campaigns SET approval_status = $1, approved_by = $2 WHERE id = $3',
    ['approved', req.user.id, params.id]);
  // Trigger scheduling if needed
  return Response.json({ success: true });
}

// api/admin/campaigns/[id]/execute.ts
export async function POST(req: Request, { params }) {
  // POST /api/admin/campaigns/:id/execute - Send campaign
  const campaign = await db.query('SELECT * FROM alumni_campaigns WHERE id = $1', [params.id]);
  // Call Supabase functions or email service
  // Update analytics in real-time
  return Response.json({ sent: 247, queued: true });
}

// api/alumni/referrals.ts
export async function POST(req: Request) {
  // POST /api/alumni/referrals - Submit new referral
  const { candidateName, candidateEmail, ...data } = await req.json();
  const referral = await db.query(
    'INSERT INTO alumni_referrals (...) VALUES (...) RETURNING *',
    [...]
  );
  // Send thank you email
  // Update engagement score
  return Response.json(referral);
}

export async function GET(req: Request) {
  // GET /api/alumni/referrals - Get my referrals
  const userId = req.user.id;
  const referrals = await db.query(
    'SELECT * FROM alumni_referrals WHERE referrer_id = (SELECT id FROM alumni_profiles WHERE user_id = $1)',
    [userId]
  );
  return Response.json(referrals);
}

// api/admin/offboarding.ts
export async function POST(req: Request) {
  // POST /api/admin/offboarding - Create offboarding record
  const { userId, projectId, reason } = await req.json();
  const record = await db.query('INSERT INTO offboarding_records (...) VALUES (...)', [...]);
  // Create alumni profile
  // Schedule transition
  return Response.json(record);
}

export async function GET(req: Request) {
  // GET /api/admin/offboarding - List pending offboardings
  const pending = await db.query('SELECT * FROM offboarding_records WHERE transition_completed = FALSE');
  return Response.json(pending);
}

// api/analytics/alumni.ts
export async function GET(req: Request) {
  // GET /api/analytics/alumni - Get alumni program analytics
  const metrics = {
    totalAlumni: await countAlumni(),
    returnRate: await calculateReturnRate(),
    referralStats: await getReferralStats(),
    campaignPerformance: await getCampaignMetrics(),
    engagement: await getEngagementMetrics()
  };
  return Response.json(metrics);
}
```

### 11.3 Integracje Systemowe

```
┌─────────────────────────────────────────────────────────┐
│ ALUMNI MODULE - SYSTEM INTEGRATIONS                    │
└─────────────────────────────────────────────────────────┘

┌── M01: AUTHENTICATION ──────────────────────────────────┐
│ ├─ Role assignment: Active Consultant → Alumni        │
│ ├─ RLS Policy updates: Disable internal doc access    │
│ ├─ Session management: Alumni can stay logged in      │
│ └─ SSO: LinkedIn/GitHub connect for alumni profile    │
└─────────────────────────────────────────────────────────┘

┌── M02: JOB MARKETPLACE ─────────────────────────────────┐
│ ├─ Alumni see limited job list (no internal jobs)    │
│ ├─ Apply to jobs: Alumni applications tagged         │
│ ├─ Job recommendations: Based on skills & history   │
│ └─ Visibility: Alumni projects shown in UI           │
└─────────────────────────────────────────────────────────┘

┌── M03: PROJECT MANAGEMENT ──────────────────────────────┐
│ ├─ Project end trigger: Offboarding initiation       │
│ ├─ History sync: Alumni see all past projects        │
│ ├─ Metrics import: PM feedback → Alumni profile      │
│ └─ Re-hire: Alumni project → Regular consultant     │
└─────────────────────────────────────────────────────────┘

┌── M04: CRM ─────────────────────────────────────────────┐
│ ├─ Contact sync: Alumni email & phone synced         │
│ ├─ Contact history: View all interactions            │
│ ├─ Engagement tracking: Campaign opens/clicks logged │
│ └─ Notes: HR can add notes to alumni record         │
└─────────────────────────────────────────────────────────┘

┌── M05: EMAIL SERVICE ───────────────────────────────────┐
│ ├─ Campaign sends: Supabase functions → SendGrid    │
│ ├─ Templates: Jinja2 variables for personalization  │
│ ├─ Tracking: Open/click webhooks from SendGrid      │
│ ├─ Unsubscribe: Respect GDPR preferences           │
│ └─ Deliverability: Monitor bounce & complaint rates │
└─────────────────────────────────────────────────────────┘

┌── M08: ANALYTICS ───────────────────────────────────────┐
│ ├─ Event tracking: Campaign interactions logged      │
│ ├─ Cohort analysis: Alumni by departure date        │
│ ├─ Funnel tracking: Awareness → Interest → Decision │
│ ├─ ROI calculation: Contract value vs spend         │
│ └─ Dashboard: Real-time metrics updates            │
└─────────────────────────────────────────────────────────┘

┌── EXTERNAL SERVICES ────────────────────────────────────┐
│ ├─ SendGrid: Email campaign execution & tracking   │
│ ├─ Stripe: Payment processing for referral bonuses │
│ ├─ Slack: Notifications for new referrals/returns  │
│ ├─ Zapier: Automate workflows (if needed)          │
│ └─ Calendar: Event management integration          │
└─────────────────────────────────────────────────────────┘
```

---

## 12. Plany Implementacji

### 12.1 Fazy Wdrażania

```
PHASE 1: MVP (Miesiące 1-2)
─────────────────────────────────────────────
✓ Alumni profile & history schema
✓ Offboarding workflow (basic)
✓ Email campaigns (basic template)
✓ Dashboard analytics (core metrics)
Resources: 2 Backend + 1 Frontend + 1 PM
Timeline: 8 tygodni

PHASE 2: Optimization (Miesiące 3-4)
──────────────────────────────────────────
✓ Campaign segmentation & A/B testing
✓ Referral program with rewards
✓ Re-engagement funnel automation
✓ Advanced analytics & cohorts
Resources: 2 Backend + 2 Frontend + 1 PM
Timeline: 8 tygodni

PHASE 3: Expansion (Miesiące 5-6)
──────────────────────────────────────────
✓ Alumni events management
✓ Newsletter automation
✓ Alumni community features
✓ Mobile app support
Resources: 2 Backend + 2 Frontend + 1 PM
Timeline: 8 tygodni

PHASE 4: Excellence (Ongoing)
──────────────────────────────────────────
✓ AI-powered recommendations
✓ Predictive analytics
✓ Advanced personalization
✓ Integration with external platforms
Resources: 1-2 Backend + 1 Frontend (part-time)
Timeline: Iteracyjnie
```

### 12.2 Success Criteria

```
MEASURABLE GOALS (12-month horizon):

1. Return Rate
   Baseline: 0% (new program)
   3-month target: 10%
   6-month target: 15%
   12-month target: 20%

2. Referral Program
   Baseline: 0 referrals
   3-month target: 50 referrals
   6-month target: 150 referrals
   12-month target: 300+ referrals
   Hire rate: 20%+ of referrals

3. Campaign Engagement
   Email open rate: >35%
   Email click rate: >8%
   Campaign ROI: >4:1

4. Alumni Retention
   Active alumni: 75%+
   Dormant reduction: <15%
   Newsletter open rate: >30%

5. Cost Metrics
   Cost per return: <5000 PLN
   Payback period: <12 months
   Program ROI: >300%
```

---

## 13. Prompt AI Builder

### 13.1 Complete AI Builder Prompt (300+ lines)

```
YOU ARE AN EXPERT AI BUILDER FOR "ALUMNI MANAGEMENT MODULE" (M13)
Application: Qualrix Platform (B2B.net S.A.)
Stack: Next.js 14+, Supabase, TypeScript, Tailwind CSS, shadcn/ui

YOUR MISSION:
Generate production-ready code for the Alumni Management Module (M13),
maintaining the highest standards of code quality, security, and UX/DX.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTEXT & REQUIREMENTS:

1. BUSINESS CONTEXT:
   - IT outsourcing company with 500+ consultants
   - Alumni (former consultants) are key source of returns & referrals
   - Program goal: Increase return rate from 0% to 20% in 12 months
   - Secondary goal: Generate 300+ referrals yielding 60 new hires
   - Budget: ~500k PLN/year (campaigns, events, infrastructure)

2. CORE FEATURES TO BUILD:
   a) Alumni Profile Management
      - View personal project history
      - Edit project preferences
      - Display skills with proficiency levels
      - Show engagement score & status
      - Integration with offboarding workflow

   b) Email Campaign System
      - Create/manage email campaigns (marketing team)
      - Target alumni by skills, department, time since departure
      - A/B testing support
      - Real-time analytics (open, click, conversion rates)
      - Scheduling & automation

   c) Referral Program
      - Referral submission form
      - Referral status tracking (pending → hired)
      - Reward management (500 PLN + loyalty bonus)
      - Leaderboard
      - Integration with candidate tracking

   d) Re-engagement Funnel
      - Automated nurture sequences
      - Trigger-based emails
      - Multi-channel support (email, SMS, push)
      - Behavioral tracking

   e) Analytics & Reporting
      - Alumni metrics (total, active, dormant)
      - Return rate analysis by cohort
      - Referral program ROI
      - Campaign performance dashboard
      - Engagement score calculations

   f) Offboarding Workflow
      - HR-initiated offboarding checklist
      - Exit interview recording
      - Alumni profile creation
      - Automated access role change

3. DATABASE SCHEMA (Supabase PostgreSQL):
   - alumni_profiles (main alumni record)
   - alumni_project_history (past projects & feedback)
   - alumni_skills (skills with proficiency levels)
   - alumni_preferences (job preferences, communication)
   - alumni_campaigns (email campaigns)
   - alumni_campaign_targeting (audience segmentation)
   - alumni_campaign_analytics (performance metrics)
   - alumni_referrals (referral submissions & tracking)
   - alumni_referral_rewards (bonus calculation & payout)
   - offboarding_records (HR offboarding process)
   - alumni_engagement_history (event log for analytics)

4. API DESIGN (Next.js App Router):
   GET/POST /api/alumni/profile - Personal alumni profile
   GET /api/alumni/projects - Project history
   GET/PATCH /api/alumni/preferences - Work preferences
   GET /api/alumni/referrals - My referrals & rewards
   POST /api/alumni/referrals - Submit new referral

   GET /api/admin/campaigns - List campaigns
   POST /api/admin/campaigns - Create campaign
   PATCH /api/admin/campaigns/[id] - Edit campaign
   POST /api/admin/campaigns/[id]/approve - Approve campaign
   POST /api/admin/campaigns/[id]/execute - Send campaign
   GET /api/admin/campaigns/[id]/analytics - Campaign metrics

   GET /api/admin/offboarding - Pending offboardings
   POST /api/admin/offboarding - Create offboarding
   PATCH /api/admin/offboarding/[id] - Complete offboarding

   GET /api/analytics/alumni - Program-wide metrics

5. SECURITY & PERMISSIONS:
   - Alumni can only view their own profile
   - HR/Marketing can view all alumni (with filters)
   - Campaign approval workflow: Marketing → HR approval
   - RLS policies: Enforce at database level
   - Sensitive data: encrypted in transit & at rest
   - GDPR compliance: Right to deletion, data export

6. UI/UX SPECIFICATIONS:
   - Language: Polish (with next-intl support for English)
   - Component library: shadcn/ui (use pre-built components)
   - Design system: Tailwind CSS (follow Qualrix design tokens)
   - Responsive: Mobile-first (works on all screen sizes)
   - Accessibility: WCAG 2.1 AA compliance
   - Dark mode: Full support with system preference detection

   Key pages/components:
   - /alumni/dashboard - Alumni profile & overview
   - /alumni/marketplace - Job listings (filtered for alumni)
   - /alumni/referrals - Referral program interface
   - /admin/campaigns - Campaign management (CRUD)
   - /admin/offboarding - Offboarding workflow
   - /admin/analytics - Alumni metrics dashboard

7. PERFORMANCE REQUIREMENTS:
   - Page load: <3 seconds (Core Web Vitals)
   - API response: <500ms (p95)
   - Database: Indexed on common queries
   - Caching: Implement Redis for frequently accessed data
   - Pagination: Alumni lists with >100 records
   - Real-time: Update analytics every 5 minutes

8. TESTING STRATEGY:
   - Unit tests: API endpoints & business logic (Jest)
   - Integration tests: Database operations (Supabase)
   - E2E tests: Critical user flows (Playwright)
   - Performance: Lighthouse & Core Web Vitals
   - Security: OWASP Top 10 coverage

9. DEPLOYMENT & MONITORING:
   - Hosting: Vercel (Next.js native)
   - Database: Supabase (managed PostgreSQL)
   - Email service: SendGrid (campaign execution)
   - Monitoring: Sentry (error tracking)
   - Logging: Structured logging to ELK stack
   - Analytics: PostHog (product analytics)

10. CODE QUALITY STANDARDS:
    - TypeScript: Strict mode enabled
    - Linting: ESLint + Prettier
    - Type safety: 100% type coverage
    - Comments: JSDoc for public APIs
    - Error handling: Graceful fallbacks & user feedback
    - Logging: Meaningful logs at key points

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPLEMENTATION GUIDELINES:

When generating code:

1. ALWAYS use TypeScript interfaces for all data structures
2. ALWAYS validate input at API boundaries (Zod schemas)
3. ALWAYS use prepared statements to prevent SQL injection
4. ALWAYS implement error handling with try-catch blocks
5. ALWAYS add loading states & optimistic updates in UI
6. ALWAYS use React hooks (useState, useEffect, useCallback)
7. ALWAYS leverage next-intl for i18n (Polish/English)
8. ALWAYS use shadcn/ui components (Button, Card, Dialog, etc.)
9. ALWAYS add Tailwind classes for styling (no custom CSS)
10. ALWAYS follow RESTful API conventions (GET, POST, PATCH, DELETE)

Code structure:
```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── alumni/
│   │   │   ├── page.tsx (alumni dashboard)
│   │   │   ├── referrals/page.tsx (referral program)
│   │   │   └── preferences/page.tsx (job preferences)
│   │   └── admin/
│   │       ├── campaigns/page.tsx (campaign management)
│   │       ├── offboarding/page.tsx (offboarding workflow)
│   │       └── analytics/page.tsx (alumni metrics)
│   └── api/
│       ├── alumni/[...routes].ts
│       ├── admin/[...routes].ts
│       └── analytics/[...routes].ts
├── components/
│   ├── alumni/
│   │   ├── AlumniProfile.tsx
│   │   ├── ReferralForm.tsx
│   │   └── EngagementMetrics.tsx
│   ├── campaigns/
│   │   ├── CampaignEditor.tsx
│   │   ├── TargetingPanel.tsx
│   │   └── AnalyticsChart.tsx
│   └── shared/
│       └── [shared components]
├── lib/
│   ├── supabase.ts (client setup)
│   ├── api.ts (API client)
│   ├── utils.ts (helpers)
│   └── schemas.ts (Zod validation)
└── types/
    └── alumni.ts (TypeScript interfaces)
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY FEATURES (MVP Phase 1):

1. Alumni Profile Display (read-only initially)
   - Show project history with dates, roles, feedback
   - Display skills learned from projects
   - Show last project details & engagement score

2. Basic Email Campaign System
   - Create campaign with subject, template, schedule
   - Target alumni by specific criteria (skills, date range)
   - Send campaigns (integrate with SendGrid)
   - Basic open/click tracking

3. Offboarding Workflow
   - HR-initiated offboarding checklist
   - Record exit interview notes
   - Automatic alumni profile creation
   - Send welcome email to alumni

4. Referral Program (Basic)
   - Form to submit referral (name, email, skills)
   - View my referrals list
   - Track referral status (pending → hired)

5. Basic Analytics Dashboard
   - Total alumni count
   - Return rate calculation
   - Referral count & success rate
   - Campaign open/click rates

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXAMPLE OUTPUTS:

When asked to generate code, provide:

1. TypeScript component/API route with:
   - Proper imports & dependencies
   - Type definitions (interfaces)
   - Error handling
   - Loading states
   - Comments explaining logic

2. Database migrations if needed:
   - SQL CREATE TABLE statements
   - Indexes for performance
   - RLS policies for security

3. API endpoint with:
   - Request/response types
   - Input validation (Zod)
   - Error responses (with codes)
   - Database queries with parameters
   - Logging/monitoring hooks

4. UI component with:
   - Form fields with labels
   - Button states (loading, disabled, error)
   - Conditional rendering
   - Accessibility attributes (aria-*)
   - Responsive layout (mobile-first)

5. Test file with:
   - Unit tests for functions
   - API endpoint tests
   - Component render tests
   - Edge cases & error scenarios

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

QUALITY CHECKLIST (before submitting code):

□ TypeScript: No `any` types, strict mode
□ Validation: All inputs validated with Zod
□ Error handling: Try-catch blocks, meaningful error messages
□ Security: No SQL injection, XSS prevention, CSRF tokens
□ Performance: Optimized queries, lazy loading, pagination
□ Accessibility: ARIA labels, keyboard navigation, color contrast
□ Testing: Unit & integration test coverage >80%
□ Documentation: Comments on complex logic, README updates
□ Dependencies: Minimal, well-maintained, security audited
□ Logging: Structured logs for debugging & monitoring
□ User feedback: Loading states, success/error notifications

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONVERSATION FLOW:

User may ask:
1. "Generate component for [feature]"
   → Provide complete, production-ready React component

2. "Create API endpoint for [functionality]"
   → Provide Next.js API route with validation, error handling

3. "Design database schema for [entity]"
   → Provide SQL statements with constraints, indexes, RLS

4. "Explain how [feature] works"
   → Explain architecture, data flow, integration points

5. "Fix issue in [code]"
   → Debug and provide corrected code with explanation

Always maintain context from previous requests and build upon
previous work. Suggest improvements and best practices.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

READY TO BUILD!

What would you like to implement first?
```

---

## Zakończenie

Moduł M13: Zarządzanie Alumni stanowi kluczowy element strategii retencji talentów i wzrostu biznesu B2B.net S.A. Dzięki strukturalnemu podejściu do zarządzania relacjami z byłymi konsultantami, platforma może:

✓ Zwiększyć wskaźnik powrotów alumni z 0% do 20% w rok
✓ Wygenerować 300+ rekomendacji nowych talentów
✓ Osiągnąć ROI 4:1 na kampaniach re-engagement
✓ Budować lojalność długoterminową i brand advocacy

Specyfikacja ta zawiera wszystkie niezbędne elementy do wdrożenia kompleksowego programu alumni, od infrastruktury danych po doświadczenie użytkownika.

---

**Dokument:** DOC-M13_Alumni_Management.md
**Rozmiar:** 600+ linii
**Status:** Gotowy do wdrażania
**Wersja:** 1.0 (Luty 2025)

```


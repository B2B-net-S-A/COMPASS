# QUALRIX — MASTER LISTA PROMPTÓW DLA ANTYGRIVITY

**Data:** 2026-02-08
**Aplikacja:** Qualrix - System zarządzania konsultantami (B2B.net S.A.)
**Przeznaczenie:** CEO Zbigniew
**Status:** Gotowy do implementacji

---

## Jak korzystać z tego dokumentu

1. **Otwórz Antygrivity/Bolt** w przeglądarce
2. **Wklej PROMPT 0** (Setup projektu) - czekaj na wygenerowanie
3. **Przetestuj** poprzedni moduł przed przejściem do następnego
4. Jeśli coś nie działa: opisz problem w Antygrivity i poproś o naprawę
5. Każdy prompt jest **self-contained** ale buduje na poprzednich

**Ważne:** Między promptami zawsze testuj poprzedni moduł w aplikacji. Jeśli tabele Supabase nie zostały wygenerowane, wklej SQL ręcznie.

---

## Kolejność budowy (Roadmap)

```
FAZA 1: Fundament (Tydzień 1-2)
├── PROMPT 0: Setup projektu
└── PROMPT 0.5: Import danych z Excela

FAZA 2: Core Front (Tydzień 3-6)
├── PROMPT M1: Dashboard Konsultanta
├── PROMPT M7: Dokumenty i Finanse
├── PROMPT M3: Program Lojalnościowy
└── PROMPT M2: Marketplace Projektów

FAZA 3: Zaawansowany Front (Tydzień 7-10)
├── PROMPT M4: Contract Health Score
├── PROMPT M5: Skill Development
└── PROMPT M6: Program Poleceń

FAZA 4: Panel Zarządczy (Tydzień 11-14)
├── PROMPT M8: Dashboard Zarządczy (Risk Monitor)
├── PROMPT M9: Pipeline Matching Engine
└── PROMPT M10: Consultant Success Hub

FAZA 5: Analytics i Extras (Tydzień 15-16)
├── PROMPT M11: Analytics & Reporting
├── PROMPT M12: Right to Hire (Monetyzacja)
└── PROMPT M13: Alumni Management
```

---

## Checklist przed każdym promptem

```
[ ] Poprzedni moduł działa poprawnie w aplikacji?
[ ] Supabase tabele dla tego modułu istnieją?
[ ] Dane testowe załadowane?
[ ] Nie ma błędów w konsoli przeglądarki?
```

---

# PROMPTY DO WKLEJANIA

## PROMPT 0: Setup projektu (Fundament)

**Faza:** 1 | **Czas:** ~8 godzin | **Zależności:** Brak
**Co powstanie:** Cały projekt Next.js 14, Supabase konfiguracja, layout, routing, i18n setup

```
=== QUALRIX - PROMPT BAZOWY DLA ANTYGRIVITY/BOLT ===

Będziemy budować aplikację webową PWA o nazwie QUALRIX dla B2B.net S.A.

## KONTEKST
- Typ: System zarządzania konsultantami IT (500+ użytkowników)
- Tech Stack: Next.js 14+ App Router, React 18, TypeScript, Tailwind CSS, shadcn/ui, Supabase
- Database: PostgreSQL via Supabase
- Hosting: Vercel + Supabase
- i18n: Polski (domyślnie) + Angielski via next-intl
- Przeznaczenie: PWA, potem native mobile

## KROK 1: SETUP PROJEKTU

Stwórz projekt Next.js 14 z następującą konfiguracją:

```bash
npx create-next-app@latest qualrix \
  --typescript \
  --tailwind \
  --app \
  --no-eslint \
  --no-src-dir
```

## KROK 2: ZAINSTALUJ DEPENDENCJE

```bash
npm install \
  @supabase/supabase-js \
  @supabase/ssr \
  next-intl \
  next-pwa \
  zustand \
  recharts \
  papaparse \
  xlsx \
  resend \
  clsx \
  tailwind-merge \
  class-variance-authority \
  @radix-ui/react-slot \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-dialog \
  @radix-ui/react-tabs \
  @radix-ui/react-alert-dialog \
  date-fns

npm install --save-dev shadcn-ui
```

## KROK 3: SHADCN/UI SETUP

```bash
npx shadcn-ui@latest init

# Zainstaluj komponenty:
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add form
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add table
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add alert
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add select
npx shadcn-ui@latest add checkbox
npx shadcn-ui@latest add textarea
```

## KROK 4: KONFIGURACJA TAILWIND

Plik: tailwind.config.ts

```typescript
import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#E3000F',    // B2B.net Red
        secondary: '#1F3A70',  // Dark Blue
        success: '#10B981',    // Green
        warning: '#F59E0B',    // Yellow
        danger: '#EF4444',     // Red
      },
      fontFamily: {
        inter: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
```

## KROK 5: STRUKTURA KATALOGÓW

Stwórz strukturę:

```
app/
  [locale]/
    consultant/
      dashboard/page.tsx
      marketplace/page.tsx
      loyalty/page.tsx
      health-score/page.tsx
      development/page.tsx
      referral/page.tsx
      documents/page.tsx
      profile/page.tsx
    admin/
      dashboard/page.tsx
      team/page.tsx
      contracts/page.tsx
      projects/page.tsx
      import/page.tsx
      reports/page.tsx
    auth/
      login/page.tsx
      signup/page.tsx
    layout.tsx
  api/
    auth/callback/route.ts
    upload/route.ts
    import/route.ts
  layout.tsx
  page.tsx

components/
  shared/Header.tsx
  shared/Sidebar.tsx
  shared/MobileNav.tsx
  shared/LanguageSwitcher.tsx
  shared/HealthScore.tsx

lib/
  supabase.ts
  auth.ts
  types.ts
  utils.ts

messages/
  pl.json
  en.json

store/
  authStore.ts
  consultantStore.ts
```

## KROK 6: SUPABASE KONFIGURACJA

Zaloguj się do https://supabase.com, stwórz projekt "qualrix"

Pobierz:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

## KROK 7: ENVIRONMENT VARIABLES

Plik: .env.local

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## KROK 8: i18n SETUP

Plik: i18n.ts

```typescript
import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';

const locales = ['pl', 'en'];
const defaultLocale = 'pl';

export default getRequestConfig(async ({ locale }) => {
  if (!locales.includes(locale as any)) notFound();

  return {
    messages: (
      await import(`../../messages/${locale}.json`)
    ).default
  };
});
```

Plik: middleware.ts

```typescript
import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['pl', 'en'],
  defaultLocale: 'pl',
  localePrefix: 'always'
});

export const config = {
  matcher: ['/((?!_next|_vercel|.*\\..*).*)']
};
```

## KROK 9: MESSAGES (TRANSLATIONS)

Plik: messages/pl.json (KOMPLETNY)

```json
{
  "navigation": {
    "dashboard": "Dashboard",
    "marketplace": "Marketplace",
    "loyalty": "Program Lojalności",
    "documents": "Dokumenty",
    "development": "Rozwój",
    "referral": "Polecenia",
    "health": "Zdrowotność",
    "profile": "Profil",
    "team": "Zespół",
    "contracts": "Kontrakty",
    "projects": "Projekty",
    "import": "Import",
    "reports": "Raporty",
    "settings": "Ustawienia",
    "logout": "Wyloguj się"
  },
  "common": {
    "save": "Zapisz",
    "cancel": "Anuluj",
    "delete": "Usuń",
    "edit": "Edytuj",
    "loading": "Ładowanie...",
    "error": "Błąd",
    "success": "Sukces",
    "back": "Wróć",
    "next": "Dalej",
    "previous": "Poprzedni",
    "search": "Szukaj",
    "filter": "Filtruj",
    "export": "Eksportuj",
    "import": "Importuj"
  },
  "consultant": {
    "current_status": "Obecny Status",
    "specialization": "Specjalizacja",
    "seniority_level": "Poziom Seniority",
    "years_experience": "Lata Doświadczenia",
    "current_rate": "Obecna Stawka",
    "technologies": "Technologie",
    "preferred_location": "Preferowana Lokalizacja",
    "active": "Aktywny",
    "ending": "Kończący",
    "ended": "Zakończony",
    "alumni": "Alumni"
  },
  "loyalty": {
    "bronze": "Brąz",
    "silver": "Srebro",
    "gold": "Złoto",
    "platinum": "Platyna",
    "points": "Punkty",
    "monthly_active": "Aktywny w systemie",
    "contract_extension": "Przedłużenie umowy",
    "referral_hired": "Polecenie zatrudnione",
    "smooth_transition": "Gładkie przejście",
    "positive_feedback": "Pozytywny feedback",
    "certification": "Nowa certyfikacja",
    "anniversary": "Rocznica"
  }
}
```

Plik: messages/en.json (tę samą strukturę z angielskimi tłumaczeniami)

## KROK 10: SUPABASE TYPES

Plik: lib/types.ts

```typescript
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: 'consultant' | 'delivery_lead' | 'account_manager' | 'csm' | 'admin';
  avatar_url?: string;
  preferred_language: 'pl' | 'en';
  created_at: string;
  updated_at: string;
}

export interface Consultant {
  id: string;
  profile_id: string;
  current_status: 'active' | 'ending' | 'ended' | 'alumni';
  specialization?: string;
  seniority_level?: string;
  technologies?: string[];
  years_experience?: number;
  current_rate?: number;
  preferred_location?: string;
  loyalty_points: number;
  loyalty_status: 'bronze' | 'silver' | 'gold' | 'platinum';
  health_score: number;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: string;
  consultant_id: string;
  client_name: string;
  project_name: string;
  start_date: string;
  end_date?: string;
  rate_per_hour: number;
  work_mode?: string;
  location?: string;
  status: 'active' | 'ending' | 'ended' | 'terminated';
  created_at: string;
}
```

## KROK 11: SUPABASE CLIENT

Plik: lib/supabase.ts

```typescript
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
```

## KROK 12: ROOT LAYOUT

Plik: app/layout.tsx

```typescript
import type { Metadata } from 'next'
import { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Qualrix',
  description: 'System zarządzania konsultantami',
  manifest: '/manifest.json',
  themeColor: '#E3000F',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.png'
  }
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Qualrix" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

## KROK 13: LOCALE LAYOUT

Plik: app/[locale]/layout.tsx

```typescript
'use client'

import { ReactNode } from 'react'
import { useLocale } from 'next-intl'
import Sidebar from '@/components/shared/Sidebar'
import Header from '@/components/shared/Header'
import MobileNav from '@/components/shared/MobileNav'

export default function LocaleLayout({
  children,
}: {
  children: ReactNode
}) {
  const locale = useLocale()

  return (
    <html lang={locale}>
      <body className="bg-gray-50">
        <div className="hidden md:block">
          <Sidebar />
        </div>

        <main className="md:ml-64">
          <Header />
          {children}
        </main>

        <div className="md:hidden">
          <MobileNav />
        </div>
      </body>
    </html>
  )
}
```

## KROK 14: HOME PAGE

Plik: app/[locale]/page.tsx

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/pl/auth/login')
      } else {
        router.push('/pl/consultant/dashboard')
      }
    }

    checkAuth()
  }, [router])

  return <div>Redirecting...</div>
}
```

## KROK 15: LOGIN PAGE (SIMPLE)

Plik: app/[locale]/auth/login/page.tsx

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error

      router.push('/pl/consultant/dashboard')
    } catch (error) {
      console.error(error)
      alert('Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold mb-6 text-center">Qualrix</h1>

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Hasło"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            {loading ? 'Logowanie...' : 'Zaloguj się'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
```

## KROK 16: PWA MANIFEST

Plik: public/manifest.json

```json
{
  "name": "Qualrix",
  "short_name": "Qualrix",
  "description": "System zarządzania konsultantami",
  "start_url": "/pl",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#E3000F",
  "background_color": "#ffffff",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

## KROK 17: SHARED COMPONENTS (BASIC)

Plik: components/shared/Sidebar.tsx

```typescript
'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

export default function Sidebar() {
  const t = useTranslations('navigation')
  const locale = useLocale()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-gray-900 text-white p-4">
      <h1 className="text-2xl font-bold mb-8">Qualrix</h1>

      <nav className="space-y-2">
        <Link href={`/${locale}/consultant/dashboard`} className="block p-2 rounded hover:bg-gray-800">
          {t('dashboard')}
        </Link>
        <Link href={`/${locale}/consultant/marketplace`} className="block p-2 rounded hover:bg-gray-800">
          {t('marketplace')}
        </Link>
        <Link href={`/${locale}/consultant/loyalty`} className="block p-2 rounded hover:bg-gray-800">
          {t('loyalty')}
        </Link>
        <Link href={`/${locale}/consultant/documents`} className="block p-2 rounded hover:bg-gray-800">
          {t('documents')}
        </Link>
        <Link href={`/${locale}/consultant/profile`} className="block p-2 rounded hover:bg-gray-800">
          {t('profile')}
        </Link>
      </nav>
    </aside>
  )
}
```

Plik: components/shared/Header.tsx

```typescript
'use client'

import { useLocale, useTranslations } from 'next-intl'

export default function Header() {
  const t = useTranslations()

  return (
    <header className="bg-white border-b border-gray-200 p-4">
      <h2 className="text-lg font-semibold">{t('common.welcome')}</h2>
    </header>
  )
}
```

Plik: components/shared/MobileNav.tsx

```typescript
'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

export default function MobileNav() {
  const t = useTranslations('navigation')
  const locale = useLocale()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-2 flex justify-around">
      <Link href={`/${locale}/consultant/dashboard`} className="p-2 text-center">{t('dashboard')}</Link>
      <Link href={`/${locale}/consultant/marketplace`} className="p-2 text-center">{t('marketplace')}</Link>
      <Link href={`/${locale}/consultant/profile`} className="p-2 text-center">{t('profile')}</Link>
    </nav>
  )
}
```

---

**Kiedy skończysz ten prompt:**
- [ ] Aplikacja się builduje (`npm run build`)
- [ ] Localhost:3000 otwiera się bez błędów
- [ ] Login page wyświetla się poprawnie
- [ ] Sidebar i header działają na desktop
- [ ] Mobile nav działa na urządzeniach mobilnych

**Następnie:** Przejdź do PROMPT 0.5 (Import danych)
```

---

✅ **Checkpoint po PROMPT 0:**
- Aplikacja Next.js 14 stworzona i builduje się
- Supabase konfiguracja complete
- i18n (PL/EN) działa
- Login page gotowa
- Sidebar i Header działają

⚠️ **Jeśli coś nie działa:** Wklej błąd do Antygrivity i poproś o naprawę.

---

## PROMPT 0.5: Import danych z Excela

**Faza:** 1 | **Czas:** ~4 godziny | **Zależności:** PROMPT 0 complete
**Co powstanie:** Import API, Excel parser, Supabase data loader

```
Zbuduj moduł importu danych z Excela do Supabase dla aplikacji Qualrix.

KONTEKST:
- Mamy pliki Excel z danymi konsultantów, projektów, umów
- Chcemy załadować dane do Supabase PostgreSQL
- Import page: /admin/import
- Upload page do wyboru pliku
- Parser do czytania Excel (xlsx library)
- Mapping fields
- Validacja danych
- Bulk insert do Supabase

WYMAGANIA:
1. UI do uploadowania pliku Excel (.xlsx, .xls)
2. Preview danych przed importem
3. Mapping kolumn (Excel col → Supabase field)
4. Validacja rows
5. Progress bar podczas importu
6. Raport z wynikami (X załadowane, Y błędy)
7. Rollback jeśli błąd

TABELE DO ZAŁADOWANIA:
- profiles (id, email, full_name, role)
- consultants (profile_id, current_status, years_experience, technologies)
- contracts (consultant_id, client_name, project_name, start_date, end_date, rate_per_hour)
- projects (title, description, required_technologies, rate_min, rate_max)

STRUKTURA KODU:
/app/admin/import/page.tsx
/components/ImportForm.tsx
/components/FileUpload.tsx
/components/DataPreview.tsx
/lib/excelParser.ts
/api/import/route.ts

Stwórz pełen workflow z validacją, error handling, i progress tracking.
```

---

## PROMPT M1: Dashboard Konsultanta

**Faza:** 2 | **Czas:** ~6 godzin | **Zależności:** PROMPT 0, 0.5
**Co powstanie:** Dashboard page, Contract Status Card, Health Score Gauge, Loyalty Card, Quick Actions, Notifications

Wklej promptem z sekcji **12. PROMPT DLA AI BUILDERA** z pliku `/DOC-M1_Dashboard_Konsultanta.md` (linia 2378-2621).

---

## PROMPT M2: Marketplace Projektów

**Faza:** 2 | **Czas:** ~8 godzin | **Zależności:** PROMPT M1
**Co powstanie:** Project list, Matching score calculator, Filters, Application tracking, Exclusive projects

Wklej promptem z sekcji **12. PROMPT DLA AI BUILDERA** z pliku `/DOC-M2_Marketplace_Projektow.md` (linia 1547-1945).

---

## PROMPT M3: Program Lojalnościowy

**Faza:** 2 | **Czas:** ~6 godzin | **Zależności:** PROMPT M1
**Co powstanie:** Loyalty overview, Points history, Tier badges, Privilege list, Admin dashboard

Wklej promptem z sekcji **12. PROMPT DLA AI BUILDERA** z pliku `/DOC-M3_Program_Lojalnosciowy.md` (linia 1539-1736).

---

## PROMPT M4: Contract Health Score

**Faza:** 3 | **Czas:** ~7 godzin | **Zależności:** PROMPT M1
**Co powstanie:** Health gauge, Score breakdown, Trend chart, Recommendations, Schedule call modal

Wklej promptem z sekcji **12. PROMPT DLA AI BUILDERA** z pliku `/DOC-M4_Contract_Health_Score.md` (linia 1177-1381).

---

## PROMPT M5: Skill Development

**Faza:** 3 | **Czas:** ~8 godzin | **Zależności:** PROMPT M1
**Co powstanie:** Skill profile, Gap alerts, Course recommendations, Certificate upload, Market insights

Wklej promptem z sekcji **12. PROMPT DLA AI BUILDERA** z pliku `/DOC-M5_Skill_Development.md` (linia 1249-1674).

---

## PROMPT M6: Program Poleceń

**Faza:** 3 | **Czas:** ~8 godzin | **Zależności:** PROMPT M1
**Co powstanie:** Referral form, Status tracker, History, Share link, Leaderboard

Wklej promptem z sekcji **13. AI Builder Prompt** z pliku `/DOC-M6_Program_Polecen.md` (linia 2683-3046).

---

## PROMPT M7: Dokumenty i Finanse

**Faza:** 2 | **Czas:** ~8 godzin | **Zależności:** PROMPT 0
**Co powstanie:** Contract view, Financial conditions, Invoice management, Payment status, Report generator

Wklej promptem z sekcji **13.1 Comprehensive AI Builder Prompt** z pliku `/DOC-M7_Dokumenty_i_Finanse.md` (linia 2209-2605).

---

## PROMPT M8: Dashboard Zarządczy (Risk Monitor)

**Faza:** 4 | **Czas:** ~10 godzin | **Zależności:** PROMPT M1, M4, M7
**Co powstanie:** KPI cards, Red flag list, Contract timeline, Exit risk gauge, Gap analysis, Rotation heatmap, Alert system

Wklej promptem z sekcji **## PROMPT DLA AI BUILDERA** z pliku `/DOC-M8_Dashboard_Zarzadczy.md` (linia 2232-2522).

---

## PROMPT M9: Pipeline Matching Engine

**Faza:** 4 | **Czas:** ~9 godzin | **Zależności:** PROMPT M1, M2
**Co powstanie:** Auto-matching, Reverse matching, Matching score, Bulk assign, Kanban board

Wklej promptem z sekcji **12.1 Master Prompt dla Antygrivity/Bolt** z pliku `/DOC-M9_Pipeline_Matching.md` (linia 1657-1877).

---

## PROMPT M10: Consultant Success Hub

**Faza:** 4 | **Czas:** ~9 godzin | **Zależności:** PROMPT M1, M4
**Co powstanie:** Check-in management, Client feedback, Development recommendations, Scheduler, Pulse surveys, Analytics

Wklej promptem z sekcji **13. AI Builder Prompt** z pliku `/DOC-M10_Consultant_Success_Hub.md` (linia 1717-2014).

---

## PROMPT M11: Analytics & Reporting

**Faza:** 5 | **Czas:** ~8 godzin | **Zależności:** Wszystkie M1-M10
**Co powstanie:** 7 raportów, Dashboard, Export (PDF/Excel), Scheduled emails, KPI cards, Recharts wizualizacje

Wklej promptem z sekcji **## 13. AI Builder Prompt** z pliku `/DOC-M11_Analytics_Reporting.md` (linia 2265-2557).

---

## PROMPT M12: Right to Hire (Monetyzacja)

**Faza:** 5 | **Czas:** ~7 godzin | **Zależności:** PROMPT M1, M8
**Co powstanie:** Signal detection, Fee calculator, Negotiation workflow, Revenue tracker, Legal compliance

Wklej prompt z sekcji **## 2. Architektura Modułu** z pliku `/DOC-M12_Right_to_Hire.md` (początek dokumentu - szczegółowa specyfikacja).

---

## PROMPT M13: Alumni Management

**Faza:** 5 | **Czas:** ~8 godzin | **Zależności:** PROMPT M1, M6
**Co powstanie:** Alumni profiles, Email campaigns, Referral program, Offboarding, Re-engagement, Analytics

Wklej promptem z sekcji **## 13. Prompt AI Builder** z pliku `/DOC-M13_Alumni_Management.md` (linia 2191-2464).

---

# INSTRUKCJE GLOBALNE

## Jeśli Antygrivity nie wygenerował tabeli Supabase

Wklej ten SQL ręcznie w SQL Editor (Supabase Dashboard → SQL Editor):

```sql
-- Podstawowe tabele (dla M1, M2, M3, M4)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email VARCHAR(255) UNIQUE,
  full_name VARCHAR(255),
  phone VARCHAR(20),
  role VARCHAR(50) DEFAULT 'consultant',
  avatar_url TEXT,
  preferred_language VARCHAR(5) DEFAULT 'pl',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  current_status VARCHAR(50) DEFAULT 'active',
  specialization TEXT,
  seniority_level VARCHAR(50),
  technologies TEXT[],
  years_experience INT,
  current_rate DECIMAL(10, 2),
  preferred_location VARCHAR(255),
  loyalty_points INT DEFAULT 0,
  loyalty_status VARCHAR(50) DEFAULT 'bronze',
  health_score INT DEFAULT 50,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id),
  client_name VARCHAR(255),
  project_name VARCHAR(255),
  start_date DATE,
  end_date DATE,
  rate_per_hour DECIMAL(10, 2),
  work_mode VARCHAR(50),
  location VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255),
  description TEXT,
  client_name VARCHAR(255),
  required_technologies TEXT[],
  nice_to_have_technologies TEXT[],
  rate_min DECIMAL(10, 2),
  rate_max DECIMAL(10, 2),
  location VARCHAR(255),
  work_modes TEXT[],
  status VARCHAR(50) DEFAULT 'OPEN',
  is_exclusive BOOLEAN DEFAULT FALSE,
  exclusive_tier VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id),
  points INT,
  event_type VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultants ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
```

## Jeśli coś nie działa

1. **Opisz problem** w Antygrivity dokładnie:
   - Co robiłeś
   - Co się stało
   - Jaki błąd widisz
   - W którego browser console (jeśli JS error)

2. **Poproś Antygrivity:**
   - "Fix this error in the [Component/API route]"
   - "The [feature] doesn't work because..."

3. **Testuj w stages:**
   - Najpierw UI renders
   - Potem API route responds
   - Na koniec integracja z Supabase

---

# PO ZBUDOWANIU WSZYSTKICH MODUŁÓW

## Checklist finalny

```
[ ] Wszystkie 13 modułów zbudowane i testowane
[ ] Dane płyną między modułami (M1 → M2, M2 → M9, itd.)
[ ] UI responsive na mobile, tablet, desktop
[ ] Polskie (PL) i angielskie (EN) tłumaczenia complete
[ ] Alle errors obsługiwane gracefully
[ ] Loading states pokazywane wszędzie
[ ] Dark mode działa (jeśli implementowany)
[ ] PWA zainstalowalna na mobile
[ ] Performance: LCP < 3s, FID < 100ms
[ ] Security: no XSS, no SQL injection, RLS policies active
[ ] Tests pisane (unit + integration + e2e)
```

## Deployment Checklist (Vercel + Supabase)

```
[ ] .env.local zmienne settings w Vercel
[ ] Database migrations run in Supabase production
[ ] RLS policies enabled na wszystkich tabelach
[ ] Supabase backups configured
[ ] Email service (Resend/SendGrid) configured
[ ] Scheduled jobs setup (pg_cron for cron tasks)
[ ] Monitoring enabled (Sentry/LogRocket)
[ ] Analytics setup (Google Analytics/PostHog)
[ ] SSL/TLS certificates active
[ ] Custom domain configured (qualrix.pl or your domain)
[ ] DNS records pointing to Vercel
```

## Co robić jeśli coś się połamie

1. **Check Vercel logs** - Deploy logs mogą pokazać błędy
2. **Check Supabase logs** - Database errors w Supabase Dashboard
3. **Check browser console** - Frontend errors w DevTools
4. **Check Network tab** - API responses czy działają
5. **Rollback** - Git revert do ostatniej working version
6. **Debug** - Dodaj console.logs/logging i redeploy

---

# WAŻNE WSKAZÓWKI

💡 **Jak komunikować się z Antygrivity/Bolt:**

Zamiast: "Add a button"
Pisz: "In the ProductCard component, add a blue 'Apply' button next to the matching score badge that calls submitApplication() on click"

Zamiast: "The page is slow"
Pisz: "The /marketplace page takes 5+ seconds to load. Optimize the project list query - it's fetching all 500 projects every time."

Zamiast: "Fix this"
Pisz: "The PaymentTimeline component doesn't show status changes. The issue is in the usePayments hook - it's not subscribing to real-time updates."

🚀 **Performance Tips:**

- Lazy load heavy components (Recharts charts, modals)
- Use React.memo() for expensive re-renders
- Implement pagination for lists > 50 items
- Cache API responses with TanStack Query
- Use Supabase materialized views for aggregations
- Compress images sent to S3

🔒 **Security Tips:**

- Never store secrets in code - use .env variables
- Always validate inputs server-side (not just client)
- Use parameterized queries (Supabase does this automatically)
- Enable RLS policies on all tables
- Hash sensitive data before logging
- Sanitize user inputs before displaying

---

**Dokument przygotowany:** 2026-02-08
**Wersja:** 1.0
**Status:** Gotowy do użytku
**Autor:** AI Builder Guide for Qualrix

Powodzenia przy budowie aplikacji! 🚀

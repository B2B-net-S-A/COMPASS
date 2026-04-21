# Specyfikacja Modułu M5: Rozwój kompetencji (Skill Development)
**Aplikacja:** Qualrix
**Organizacja:** B2B.net S.A.
**Wersja:** 1.0
**Data:** 2026-02-08
**Stack:** Next.js 14+, Supabase, TypeScript, Tailwind CSS, shadcn/ui, next-intl (PL+EN)

---

## 1. Opis Modułu

### Cel
Moduł M5 wspiera rozwój kompetencji konsultantów poprzez:
- **Mapowanie umiejętności** - Konsolidacja profilu technicznego (technologie, certyfikaty, lata doświadczenia)
- **Alerty luk kompetencyjnych** - Proaktywne powiadomienia o brakujących certyfikatach/technologiach wymaganych w projektach
- **Rekomendacje szkoleń** - Spersonalizowane kursy i certyfikacje dopasowane do bieżących projektów i trendów rynkowych
- **Zarządzanie certyfikatami** - Upload certyfikatów z przyznawaniem punktów lojalności
- **Analizy rynkowe** - Przejrzystość zmian stawek dla różnych technologii (np. "Stawki dla Java Devów z AWS wzrosły o 15% w Q4")
- **Benchmark stawek** (OPCJONALNIE/KONTROWERSYJNIE) - Porównanie osobistej stawki z rynkiem (wymaga oddzielnego toggle)

### Wartość biznesowa
- **Zatrzymanie talentów** - Konsultanci widzą perspektywy rozwoju, mniej odejść
- **Zmniejszenie ryzyka** - Mniej "low performance" pracowników, lepsze dopasowanie do projektów
- **Przejrzystość wynagrodzeń** - Konsultanci rozumieją rynek, zmniejsza się zgryzota
- **Budowanie zaangażowania** - Gamifikacja (punkty lojalności), jasne ścieżki kariery

---

## 2. User Stories

### Konsultant (Główny aktor)
1. **M5.1.US1** Jako konsultant chcę **zobaczyć swój profil kompetencji** (technologie, lata doświadczenia, certyfikaty) aby wiedzieć jak się reklamuje na rynku
2. **M5.1.US2** Jako konsultant chcę **edytować moje technologie** (dodać Java, usunąć PHP) aby profil był aktualny
3. **M5.1.US3** Jako konsultant chcę **zobaczyć alerty o lukach kompetencyjnych** (np. "Projekt wymaga AWS – nie masz AWS certification") aby wiedzieć co szkolić się pilnie
4. **M5.1.US4** Jako konsultant chcę **zobaczyć rekomendacje kursów** (np. "Polecamy kurs AWS Solutions Architect") aby znaleźć dobrą ścieżkę nauki
5. **M5.1.US5** Jako konsultant chcę **uploadować certyfikaty** (PDF: CKA, AWS SAA) aby mój profil miał wymierną wartość
6. **M5.1.US6** Jako konsultant chcę **zarabiać punkty lojalności** po uploadzie certyfikatu aby czuć się doceniony
7. **M5.1.US7** Jako konsultant chcę **przejrzeć analizy rynkowe** (np. stawki Kubernetes vs Docker) aby wiedzieć czy moja specjalizacja robi się cenniejsza
8. **M5.1.US8** Jako konsultant chcę **opcjonalnie zobaczyć mój benchmark stawek vs rynek** (TOGGLE) aby wiedzieć czy zarabiam fair
9. **M5.1.US9** Jako konsultant chcę **filtrować alerty** (wg technologii, wg projektów) aby fokus na najważniejsze

### Admin (Drugie aktorzy)
10. **M5.2.US1** Jako admin chcę **przeglądać profile wszystkich konsultantów** (filtry: certyfikaty, tech stack) aby robić insightsy na temat zespołu
11. **M5.2.US2** Jako admin chcę **dodawać dane rynkowe** (technika X: stawka $Y, zmiana +Z%) aby insights były aktualne
12. **M5.2.US3** Jako admin chcę **konfigurować źródła kursów** (Udemy, A Cloud Guru, Coursera) aby recommendations były relevantne
13. **M5.2.US4** Jako admin chcę **moderować uploady certyfikatów** aby nie było fake'ów
14. **M5.2.US5** Jako admin chcę **raportować** na temat: (1) średnia liczba certyfikatów/konsultanta, (2) coverage tech stacku, (3) trend uplift'u kompetencji
15. **M5.2.US6** Jako admin chcę **włączać/wyłączać benchmark stawek** (feature toggle) aby móc zarządzać kontrowersją

---

## 3. Wireframe (Mockup)

### Ekran 3.1: Profil kompetencji (Consultant View)
```
┌─────────────────────────────────────────────────────────────────┐
│  QUALRIX - Mój Profil Kompetencji                      [Settings]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  👤 Jan Kowalski | Lata doświadczenia: 8 lat                    │
│  Loyalty Points: 2,450 ⭐                                        │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ TECHNOLOGIE (6)                              [+ Dodaj]          │
├─────────────────────────────────────────────────────────────────┤
│  Java  ████████░ (8 lat)        [Edit] [Remove]                │
│  Spring Boot ██████░░ (5 lat)    [Edit] [Remove]               │
│  AWS   ██████░░ (4 lat)          [Edit] [Remove]               │
│  Docker ████░░░░ (2 lat)         [Edit] [Remove]               │
│  Kubernetes ███░░░░░ (1.5 lat)   [Edit] [Remove]               │
│  PostgreSQL ██████░░ (6 lat)     [Edit] [Remove]               │
├─────────────────────────────────────────────────────────────────┤
│ CERTYFIKATY (3)                    [+ Upload nowy]              │
├─────────────────────────────────────────────────────────────────┤
│  ✓ AWS Solutions Architect Associate (2024-2027)  +250 pts      │
│  ✓ CKA - Certified Kubernetes Administrator (2023-2025)  +300   │
│  ✓ Oracle Java Programmer (2022-perpetual)        +200 pts      │
├─────────────────────────────────────────────────────────────────┤
│ ALERTY LUK KOMPETENCYJNYCH (2)        [Filtruj] [Zamknij]      │
├─────────────────────────────────────────────────────────────────┤
│  ⚠️  Projekt "Google Cloud Migration" wymaga:                   │
│      ❌ Google Cloud Professional Architect - MISSING           │
│      ✓ Java (masz)                                              │
│      [Szukaj kursu] [Dodaj do learning planu]                   │
│                                                                  │
│  ⚠️  Projekt "Kubernetes Ops" wymaga:                           │
│      ✓ Kubernetes (masz, ale expire: 2025-06-15)               │
│      ⏱️  ODNOWIĆ ZA 4 MIESIĄCE!                                │
│      ❌ Terraform - MISSING                                     │
│      [Szukaj kursu] [Dodaj do learning planu]                  │
├─────────────────────────────────────────────────────────────────┤
│ REKOMENDACJE KURSÓW (4)           [Wszystkie] [Po kategorii]   │
├─────────────────────────────────────────────────────────────────┤
│  📚 AWS Solutions Architect - Associate (Udemy)                 │
│     Pasuje do: Google Cloud Migration, Cloud Ops               │
│     ⭐ 4.8/5 | 45h | $15 | [Przejdź]                           │
│                                                                  │
│  📚 Terraform Deep Dive (A Cloud Guru)                          │
│     Pasuje do: Kubernetes Ops, IaC projects                    │
│     ⭐ 4.9/5 | 32h | $20 | [Przejdź]                           │
│                                                                  │
│  📚 Advanced Spring Boot (Pluralsight)                          │
│     Pasuje do: Current skills, Java path                        │
│     ⭐ 4.7/5 | 28h | $25 | [Przejdź]                           │
│                                                                  │
│  📚 Docker & Kubernetes Masterclass (Udemy)                     │
│     Pasuje do: Kubernetes Ops, DevOps track                    │
│     ⭐ 4.8/5 | 48h | $13 | [Przejdź]                           │
├─────────────────────────────────────────────────────────────────┤
│ ANALIZY RYNKOWE (Market Insights)    [Więcej analiz]            │
├─────────────────────────────────────────────────────────────────┤
│  📊 Q4 2025 - Trendy stawek                                      │
│                                                                  │
│  Java + AWS:              $95-120/h  ↑ +8% Q.o.Q               │
│  Kubernetes Specialist:   $110-140/h ↑ +15% Q.o.Q              │
│  React/TypeScript:        $85-110/h  ↓ -3% Q.o.Q               │
│  Python/ML:               $120-150/h ↑ +12% Q.o.Q              │
│  Azure DevOps:            $100-130/h ↑ +10% Q.o.Q              │
│  GCP Cloud Architect:     $130-160/h ↑ +5% Q.o.Q               │
│                                                                  │
│  [Włączenie benchmark stawek] ⬜ Pokaż mój rate vs market      │
│                            (OPCJONALNIE - wymagaToggleLu)       │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│               [Zapisz zmiany] [Anuluj]                           │
└─────────────────────────────────────────────────────────────────┘
```

### Ekran 3.2: Lista certyfikatów + Upload
```
┌─────────────────────────────────────────────────────────────────┐
│  QUALRIX - Moje Certyfikaty                          [← Powrót] │
├─────────────────────────────────────────────────────────────────┤
│  Dodane: 3  | Pending review: 1  | Expired: 0                   │
│                                                                  │
│  [+ Dodaj nowy certyfikat]                                      │
├─────────────────────────────────────────────────────────────────┤
│ CERTYFIKATY ZATWIERDZONE                                        │
├─────────────────────────────────────────────────────────────────┤
│  Cert ID: AWS-SAA-001                                           │
│  Nazwa: AWS Solutions Architect Associate                       │
│  Wystawca: Amazon Web Services                                  │
│  Data wydania: 2024-03-15 | Ważny do: 2027-03-15              │
│  File: AWS_SAA_2024.pdf (2.3 MB)  [Pobierz] [Usuń]            │
│  Status: ✓ Zatwierdzone | Punkty: +250                        │
│                                                                  │
│  Cert ID: CKA-2023-001                                          │
│  Nazwa: Certified Kubernetes Administrator                      │
│  Wystawca: Linux Foundation                                     │
│  Data wydania: 2023-07-20 | Ważny do: 2025-07-20              │
│  File: CKA_2023.pdf (1.8 MB)  [Pobierz] [Usuń]                │
│  Status: ✓ Zatwierdzone | Punkty: +300 | ⏱️ Expire soon!      │
├─────────────────────────────────────────────────────────────────┤
│ OCZEKUJĄCE NA WERYFIKACJĘ                                       │
├─────────────────────────────────────────────────────────────────┤
│  Cert ID: GCP-PCA-2025-PENDING                                  │
│  Nazwa: Google Cloud Professional Cloud Architect               │
│  Data uploadowania: 2025-12-10                                  │
│  File: GCP_PCA_2025.pdf (1.5 MB)  [Pobierz] [Cofnij upload]  │
│  Status: ⏳ Oczekuje na weryfikację (admin review)             │
│  Szacunkowe punkty: +350                                        │
│                                                                  │
│  Notatka: Dokumentacja musi zawierać numer certyfikatu         │
│           i datę wydania. Czekaj wynik weryfikacji w ciągu 3 dni│
└─────────────────────────────────────────────────────────────────┘
```

### Ekran 3.3: Panel Administratora - Market Insights
```
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN - Market Insights Manager                     [+ Dodaj]  │
├─────────────────────────────────────────────────────────────────┤
│  Filter: [Q4 2025 ▼] [Polska ▼] [Zaawansowany ▼]  [Eksportuj]  │
├─────────────────────────────────────────────────────────────────┤
│ Tech Stack        Rate Range (PLN/h)  Change Q.o.Q  Updated     │
├─────────────────────────────────────────────────────────────────┤
│ Java              450-580 PLN         ↑ +8%         2025-12-01  │
│ Java + AWS        480-620 PLN         ↑ +12%        2025-12-01  │
│ Kubernetes Spec.  550-700 PLN         ↑ +15%        2025-12-01  │
│ Python/ML         600-750 PLN         ↑ +10%        2025-12-01  │
│ React/TypeScript  420-550 PLN         ↓ -3%         2025-12-01  │
│ Azure DevOps      500-650 PLN         ↑ +8%         2025-11-25  │
│ GCP Cloud Arch.   650-800 PLN         ↑ +5%         2025-11-25  │
│ Go/Rust           600-750 PLN         ↑ +18%        2025-12-01  │
│                                                                  │
│ [Edytuj] [Archiwizuj] [Pokaż historię]                        │
├─────────────────────────────────────────────────────────────────┤
│ DODAJ NOWY INSIGHT                                              │
├─────────────────────────────────────────────────────────────────┤
│ Tech Stack: [Java + AWS ▼]                                      │
│ Rate (min): [480 PLN/h]     Rate (max): [620 PLN/h]           │
│ Change: [+12%]   Period: [Q4 2025 ▼]  Source: [LinkedIn ▼]    │
│ Description: [Java developers with AWS certification...]        │
│ [Dodaj] [Anuluj]                                                │
│                                                                  │
│ TOGGLE BENCHMARK STAWEK:  ⬜ ▼ DISABLED (Security/Privacy)    │
│ ⚠️  Uwaga: Feature toggle dla benchmark - aktualnie wyłączony  │
│     ze względów bezpieczeństwa i prywatności. Włączenie        │
│     umożliwi konsultantom porównywanie swoich stawek z rynkiem.│
│                                                                  │
│     [⊗ Włącz toggle] [Dokumentacja]                            │
└─────────────────────────────────────────────────────────────────┘
```

### Ekran 3.4: Panel Admin - Certyfikaty do moderacji
```
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN - Certyfikat Review Queue              [Filtruj] [Sort]  │
├─────────────────────────────────────────────────────────────────┤
│  Pending: 4 | Approved this week: 18 | Rejected: 2             │
├─────────────────────────────────────────────────────────────────┤
│  1. Jan Kowalski - GCP Professional Cloud Architect             │
│     Uploaded: 2025-12-10 | File: GCP_PCA_2025.pdf             │
│     [Przejrzyj PDF]  [Zatwierdź] [Odrzuć] [Poproś o poprawę]  │
│                                                                  │
│  2. Maria Nowak - Terraform Associate                           │
│     Uploaded: 2025-12-10 | File: Terraform_Assoc_2025.pdf     │
│     [Przejrzyj PDF]  [Zatwierdź] [Odrzuć] [Poproś o poprawę]  │
│                                                                  │
│  3. Piotr Lewandowski - Databricks Lakehouse Engineer           │
│     Uploaded: 2025-12-09 | File: Databricks_Badge_2025.pdf    │
│     [Przejrzyj PDF]  [Zatwierdź] [Odrzuć] [Poproś o poprawę]  │
│                                                                  │
│  4. Anna Wisniewski - AWS Solution Architect Professional       │
│     Uploaded: 2025-12-09 | File: AWS_SAP_2025.pdf             │
│     [Przejrzyj PDF]  [Zatwierdź] [Odrzuć] [Poproś o poprawę]  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Komponenty UI (React/Next.js)

### Komponent 4.1: SkillProfileEditor
```typescript
// Plik: /components/m5/SkillProfileEditor.tsx

interface Skill {
  id: string;
  name: string;
  yearsOfExperience: number;
  proficiency: "beginner" | "intermediate" | "advanced" | "expert";
  endorsements?: number;
}

interface SkillProfileEditorProps {
  consultantId: string;
  initialSkills: Skill[];
  onSave: (skills: Skill[]) => Promise<void>;
}

export const SkillProfileEditor: React.FC<SkillProfileEditorProps> = ({
  consultantId,
  initialSkills,
  onSave,
}) => {
  // State: lista umiejętności
  // Funkcje: addSkill, removeSkill, updateSkill, calculateProficiency
  // Przycisk: Zapisz - zapisuje do Supabase
};
```

**Technologie obsługiwane:** Java, Python, C#, Go, Rust, JavaScript, TypeScript, SQL, PostgreSQL, MySQL, MongoDB, AWS, Azure, GCP, Docker, Kubernetes, Jenkins, GitLab CI/CD, Terraform, Spring Boot, Django, .NET Core, React, Angular, Vue.js, Node.js, itp.

### Komponent 4.2: SkillGapAlert
```typescript
// Plik: /components/m5/SkillGapAlert.tsx

interface GapAlert {
  id: string;
  projectName: string;
  requiredSkill: string;
  gap: "missing" | "expiring_soon" | "outdated";
  urgency: "low" | "medium" | "high";
  daysUntilExpire?: number;
  recommendedCourse?: CourseReference;
}

export const SkillGapAlert: React.FC<{ alert: GapAlert }> = ({ alert }) => {
  // Wyświetl alert w postaci warning bandu
  // Kolory: #FF6B6B (high), #FFA500 (medium), #FFD700 (low)
  // Akcje: Szukaj kursu, Dodaj do learning planu, Zamknij alert
};
```

### Komponent 4.3: CourseRecommendation
```typescript
// Plik: /components/m5/CourseRecommendation.tsx

interface Course {
  id: string;
  title: string;
  provider: "udemy" | "coursera" | "pluralsight" | "a_cloud_guru";
  duration: number; // hours
  rating: number; // 1-5
  price: number; // USD
  relevanceTags: string[];
}

export const CourseRecommendation: React.FC<{
  course: Course;
  matchScore: number; // 0-100
}> = ({ course, matchScore }) => {
  // Card: tytuł, provider, rating, duration, cena
  // Relevance bar: "Pasuje do: Java, Cloud, Security"
  // Button: [Przejdź]
};
```

### Komponent 4.4: CertificationUpload
```typescript
// Plik: /components/m5/CertificationUpload.tsx

interface CertUploadForm {
  certName: string;
  issuer: string;
  issueDate: Date;
  expiryDate?: Date;
  certificateFile: File; // PDF/JPG max 5MB
}

export const CertificationUpload: React.FC<{
  consultantId: string;
  onSuccess: () => void;
}> = ({ consultantId, onSuccess }) => {
  // Drag-and-drop upload
  // Walidacja: PDF/JPG, max 5MB, EXIF/metadata check
  // Submit: POST /api/m5/certifications/upload
  // Na sukces: +250 loyalty points
};
```

### Komponent 4.5: MarketInsightDashboard
```typescript
// Plik: /components/m5/MarketInsightDashboard.tsx

interface MarketInsight {
  id: string;
  techStack: string; // np. "Java + AWS"
  rateRange: { min: number; max: number }; // PLN/hour
  change: number; // % Q.o.Q
  period: string; // "Q4 2025"
  source: string;
  updatedAt: Date;
}

export const MarketInsightDashboard: React.FC<{
  insights: MarketInsight[];
  consultantSkills?: string[];
}> = ({ insights, consultantSkills }) => {
  // Tabela: Tech Stack | Rate Range | Change | Updated
  // Highlight: umiejętności konsultanta
  // Trend arrows: ↑ ↓ →
};
```

### Komponent 4.6: RateBenchmark (OPCJONALNIE)
```typescript
// Plik: /components/m5/RateBenchmark.tsx
// ⚠️  FEATURE TOGGLE REQUIRED

interface RateBenchmarkProps {
  consultantId: string;
  consultantRate: number; // PLN/hour
  marketRate: { min: number; max: number };
  enabled: boolean; // Feature toggle
}

export const RateBenchmark: React.FC<RateBenchmarkProps> = ({
  consultantId,
  consultantRate,
  marketRate,
  enabled,
}) => {
  if (!enabled) {
    return <div>Benchmark stawek jest wyłączony.</div>;
  }

  const percentile = calculatePercentile(consultantRate, marketRate);

  return (
    <div className="rate-benchmark">
      <h3>Moja stawka vs rynek</h3>
      <p>Twoja stawka: {consultantRate} PLN/h</p>
      <p>Market range: {marketRate.min} - {marketRate.max} PLN/h</p>
      <ProgressBar value={percentile} />
      <p className={percentile > 75 ? "text-green" : "text-yellow"}>
        {percentile > 50 ? "Zarabiasz powyżej mediany" : "Poniżej mediany"}
      </p>
    </div>
  );
};
```

---

## 5. Model Danych (Supabase Schema)

### Tabela 5.1: consultant_skills
```sql
CREATE TABLE consultant_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  skill_name VARCHAR(255) NOT NULL,
  years_of_experience DECIMAL(3,1) NOT NULL CHECK (years_of_experience >= 0),
  proficiency_level VARCHAR(50) NOT NULL
    CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  endorsements INT DEFAULT 0,
  last_used_date DATE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(consultant_id, skill_name)
);

CREATE INDEX idx_consultant_skills_consultant_id ON consultant_skills(consultant_id);
CREATE INDEX idx_consultant_skills_skill_name ON consultant_skills(skill_name);
```

### Tabela 5.2: skill_gap_alerts
```sql
CREATE TABLE skill_gap_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  required_skill VARCHAR(255) NOT NULL,
  gap_type VARCHAR(50) NOT NULL
    CHECK (gap_type IN ('missing', 'expiring_soon', 'outdated')),
  urgency VARCHAR(20) NOT NULL
    CHECK (urgency IN ('low', 'medium', 'high')),
  days_until_expire INT,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  recommended_course_id UUID REFERENCES courses(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_skill_gap_alerts_consultant_id ON skill_gap_alerts(consultant_id);
CREATE INDEX idx_skill_gap_alerts_project_id ON skill_gap_alerts(project_id);
CREATE INDEX idx_skill_gap_alerts_urgency ON skill_gap_alerts(urgency);
```

### Tabela 5.3: consultant_certifications
```sql
CREATE TABLE consultant_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  cert_name VARCHAR(255) NOT NULL,
  issuer VARCHAR(255) NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE,
  credential_id VARCHAR(255),
  credential_url VARCHAR(500),
  file_path VARCHAR(500) NOT NULL, -- S3 path
  file_mime_type VARCHAR(50),
  file_size_bytes INT,
  status VARCHAR(50) NOT NULL
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'expired')),
  verification_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  loyalty_points_awarded INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_consultant_certifications_consultant_id
  ON consultant_certifications(consultant_id);
CREATE INDEX idx_consultant_certifications_status
  ON consultant_certifications(status);
CREATE INDEX idx_consultant_certifications_expiry_date
  ON consultant_certifications(expiry_date);
```

### Tabela 5.4: market_insights
```sql
CREATE TABLE market_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_stack VARCHAR(255) NOT NULL, -- "Java + AWS", "Kubernetes Specialist"
  rate_min DECIMAL(10,2) NOT NULL, -- PLN/hour
  rate_max DECIMAL(10,2) NOT NULL,
  rate_currency VARCHAR(3) DEFAULT 'PLN',
  change_percent DECIMAL(5,2), -- Q.o.Q change
  change_period VARCHAR(50), -- "Q4 2025", "M.o.M"
  source VARCHAR(255), -- "LinkedIn", "Glassdoor", "Internal Survey"
  description TEXT,
  country_code VARCHAR(2) DEFAULT 'PL',
  tags JSONB, -- ["java", "aws", "backend"]
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tech_stack, change_period, country_code)
);

CREATE INDEX idx_market_insights_tech_stack ON market_insights(tech_stack);
CREATE INDEX idx_market_insights_updated_at ON market_insights(updated_at);
```

### Tabela 5.5: courses (Reference Data)
```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  provider VARCHAR(100) NOT NULL
    CHECK (provider IN ('udemy', 'coursera', 'pluralsight', 'a_cloud_guru', 'other')),
  provider_course_id VARCHAR(255),
  provider_url VARCHAR(500),
  duration_hours INT,
  rating DECIMAL(2,1), -- 1-5
  price_usd DECIMAL(10,2),
  description TEXT,
  target_skills JSONB, -- ["Java", "Spring Boot"]
  difficulty VARCHAR(50) CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_courses_provider ON courses(provider);
CREATE INDEX idx_courses_target_skills ON courses USING GIN(target_skills);
```

### Tabela 5.6: loyalty_points_log
```sql
CREATE TABLE loyalty_points_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  -- action_type: "certification_approved", "skill_endorsed", "course_completed"
  points INT NOT NULL,
  related_resource_id UUID,
  related_resource_type VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_loyalty_points_log_consultant_id
  ON loyalty_points_log(consultant_id);
```

### Tabela 5.7: feature_flags
```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT FALSE,
  affected_modules VARCHAR(500), -- "m5_rate_benchmark"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Przykład: INSERT INTO feature_flags (flag_name, is_enabled)
-- VALUES ('m5_rate_benchmark', FALSE);
```

---

## 6. Logika Biznesowa

### 6.1 Algorytm Detekcji Luk Kompetencyjnych (Gap Detection)
```typescript
// Plik: /lib/m5/gapDetectionEngine.ts

interface GapDetectionInput {
  consultantId: string;
  assignedProjects: Project[];
}

export async function detectSkillGaps(
  input: GapDetectionInput
): Promise<SkillGapAlert[]> {
  const consultant = await getConsultantWithSkills(input.consultantId);
  const alerts: SkillGapAlert[] = [];

  for (const project of input.assignedProjects) {
    const requiredSkills = project.required_skills; // ["Java", "AWS", "Kubernetes"]

    for (const reqSkill of requiredSkills) {
      const consultantSkill = consultant.skills.find(
        (s) => s.skill_name === reqSkill
      );

      if (!consultantSkill) {
        // Skill is MISSING
        alerts.push({
          projectName: project.name,
          requiredSkill: reqSkill,
          gap: "missing",
          urgency: calculateUrgency("missing", project.start_date),
        });
      } else if (consultantSkill.expiry_date) {
        const daysUntilExpire = calculateDaysUntil(
          consultantSkill.expiry_date
        );

        if (daysUntilExpire < 0) {
          // Skill EXPIRED
          alerts.push({
            projectName: project.name,
            requiredSkill: reqSkill,
            gap: "outdated",
            urgency: "high",
          });
        } else if (daysUntilExpire < 120) {
          // Expires in < 4 months = URGENT
          alerts.push({
            projectName: project.name,
            requiredSkill: reqSkill,
            gap: "expiring_soon",
            urgency: "high",
            daysUntilExpire,
          });
        } else if (daysUntilExpire < 180) {
          // Expires in 4-6 months = MEDIUM
          alerts.push({
            projectName: project.name,
            requiredSkill: reqSkill,
            gap: "expiring_soon",
            urgency: "medium",
            daysUntilExpire,
          });
        }
      }
    }
  }

  // Zapisz alerty do BD
  for (const alert of alerts) {
    await insertSkillGapAlert(alert);
  }

  return alerts;
}

function calculateUrgency(
  gapType: string,
  projectStartDate: Date
): "low" | "medium" | "high" {
  const daysUntilStart = calculateDaysUntil(projectStartDate);

  if (daysUntilStart < 14) return "high"; // < 2 tygodnie
  if (daysUntilStart < 30) return "medium"; // < 1 miesiąc
  return "low";
}
```

### 6.2 Algorytm Matchowania Kursów (Course Matching)
```typescript
// Plik: /lib/m5/courseMatchingEngine.ts

interface CourseMatchingInput {
  consultantSkills: string[];
  skillGaps: string[];
  relevantProjects: Project[];
}

export async function recommendCourses(
  input: CourseMatchingInput
): Promise<{ course: Course; matchScore: number }[]> {
  const allCourses = await getActiveCourses();
  const recommendations: { course: Course; matchScore: number }[] = [];

  for (const course of allCourses) {
    let score = 0;

    // 1. Pokrycie skill gapów (50 pkt)
    const gapCoverage = course.target_skills.filter((skill) =>
      input.skillGaps.includes(skill)
    ).length;
    score += (gapCoverage / input.skillGaps.length) * 50;

    // 2. Relewantność do projektów (30 pkt)
    const projectRelevance = input.relevantProjects.filter((project) =>
      course.target_skills.some((skill) =>
        project.required_skills.includes(skill)
      )
    ).length;
    score += (projectRelevance / input.relevantProjects.length) * 30;

    // 3. Rating kursu (15 pkt)
    score += (course.rating / 5) * 15;

    // 4. Koszt / dostępność (5 pkt)
    if (course.price_usd < 30) score += 5;

    if (score > 30) {
      recommendations.push({
        course,
        matchScore: Math.round(score),
      });
    }
  }

  return recommendations.sort((a, b) => b.matchScore - a.matchScore).slice(0, 10);
}
```

### 6.3 Integracja Market Insights
```typescript
// Plik: /lib/m5/marketInsightsService.ts

export async function getMarketInsights(): Promise<MarketInsight[]> {
  // Źródła danych:
  // 1. LinkedIn Salary Data (API/Web scraping - compliance pending)
  // 2. Glassdoor (public data)
  // 3. Stack Overflow Developer Survey
  // 4. Internal Qualrix survey (consultants, historical data)
  // 5. Contractor platforms (Upwork, Toptal historical rates)

  const insights = await supabase
    .from("market_insights")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(50);

  return insights.data || [];
}

export async function syncMarketInsights(): Promise<void> {
  // Cron job: runs weekly (Monday 9 AM UTC+1)
  // Updates market_insights table with latest data
  console.log("Syncing market insights...");

  // TODO: Implement connectors to external data sources
  // For now, manual admin input via dashboard
}

// Expected data format:
const sampleInsights: MarketInsight[] = [
  {
    tech_stack: "Java",
    rate_min: 450,
    rate_max: 580,
    change_percent: 8,
    change_period: "Q4 2025",
    source: "LinkedIn + Internal Survey",
  },
  {
    tech_stack: "Java + AWS",
    rate_min: 480,
    rate_max: 620,
    change_percent: 12,
    change_period: "Q4 2025",
    source: "LinkedIn + Internal Survey",
  },
  {
    tech_stack: "Kubernetes Specialist",
    rate_min: 550,
    rate_max: 700,
    change_percent: 15,
    change_period: "Q4 2025",
    source: "Stack Overflow Survey",
  },
  {
    tech_stack: "Python/ML",
    rate_min: 600,
    rate_max: 750,
    change_percent: 10,
    change_period: "Q4 2025",
    source: "LinkedIn + Internal Survey",
  },
];
```

### 6.4 Kalkulacja Rate Benchmark (OPCJONALNIE - Feature Toggle)
```typescript
// Plik: /lib/m5/rateBenchmarkCalculator.ts

interface RateBenchmarkCalc {
  consultantRate: number; // PLN/hour
  marketInsight: MarketInsight;
}

export function calculateRateBenchmark(
  input: RateBenchmarkCalc
): {
  percentile: number;
  status: "below_market" | "fair" | "above_market";
  recommendation: string;
} {
  const { consultantRate, marketInsight } = input;
  const { rate_min, rate_max } = marketInsight;
  const marketMedian = (rate_min + rate_max) / 2;

  // Percentile calculation: (consultantRate - min) / (max - min) * 100
  const percentile = ((consultantRate - rate_min) / (rate_max - rate_min)) * 100;

  let status: "below_market" | "fair" | "above_market" = "fair";
  let recommendation = "Twoja stawka jest wyrównana z rynkiem.";

  if (percentile < 25) {
    status = "below_market";
    recommendation =
      "Rozważ negocjacje - zarabiasz poniżej 25 percentyla rynku.";
  } else if (percentile > 75) {
    status = "above_market";
    recommendation =
      "Zarabiasz powyżej 75 percentyla - świetnie! Czuwa nad konkurencyjnością.";
  }

  return {
    percentile: Math.round(percentile),
    status,
    recommendation,
  };
}

// ⚠️  FEATURE TOGGLE USAGE:
export async function shouldShowRateBenchmark(): Promise<boolean> {
  const flag = await getFeatureFlag("m5_rate_benchmark");
  return flag?.is_enabled || false;
}
```

### 6.5 Integracja Loyalty Points
```typescript
// Plik: /lib/m5/loyaltyPointsService.ts

export async function awardCertificationPoints(
  consultantId: string,
  certification: CertificationApproved
): Promise<void> {
  // Points calculation:
  // - Entry-level cert (AWS Associate, CKA): +250 pkt
  // - Professional cert (AWS Pro, Kubernetes Advanced): +300 pkt
  // - Specialized cert (ML, Advanced Arch): +350 pkt

  const pointsTable: Record<string, number> = {
    "AWS Solutions Architect Associate": 250,
    "AWS Solutions Architect Professional": 300,
    "AWS DevOps Engineer Professional": 300,
    "CKA - Certified Kubernetes Administrator": 300,
    "CKAD - Certified Kubernetes Application Developer": 250,
    "Google Cloud Professional Cloud Architect": 350,
    "Azure Administrator Associated": 250,
    "Azure Solutions Architect Expert": 350,
    "Oracle Java Programmer": 250,
    "Certified Kubernetes Security Specialist": 350,
    "Terraform Associate": 250,
  };

  const points = pointsTable[certification.cert_name] || 200; // Default: 200

  // Dodaj do loyalty_points_log
  await insertLoyaltyLog({
    consultant_id: consultantId,
    action_type: "certification_approved",
    points,
    related_resource_id: certification.id,
    related_resource_type: "certification",
    description: `Approved: ${certification.cert_name}`,
  });

  // Aktualizuj sumę punktów w consultants tabeli
  await updateConsultantLoyaltyPoints(consultantId, points);
}
```

---

## 7. Internationalizacja (i18n)

### Plik 7.1: /translations/m5.en.json
```json
{
  "m5": {
    "title": "Skill Development",
    "myProfile": "My Skill Profile",
    "mySkills": "My Skills",
    "addSkill": "Add Skill",
    "editSkill": "Edit Skill",
    "removeSkill": "Remove Skill",
    "yearsOfExperience": "Years of Experience",
    "proficiencyLevel": "Proficiency Level",
    "proficiency": {
      "beginner": "Beginner",
      "intermediate": "Intermediate",
      "advanced": "Advanced",
      "expert": "Expert"
    },
    "certifications": "Certifications",
    "uploadCertification": "Upload Certification",
    "certDetails": "Certificate Details",
    "issuer": "Issuer",
    "issueDate": "Issue Date",
    "expiryDate": "Expiry Date",
    "status": "Status",
    "pending": "Pending Review",
    "approved": "Approved",
    "rejected": "Rejected",
    "expired": "Expired",
    "statusPendingReview": "Pending Review",
    "statusApproved": "Approved",
    "statusRejected": "Rejected",
    "skillGaps": "Skill Gaps",
    "gapAlerts": "Gap Alerts",
    "noGaps": "No skill gaps detected",
    "courseRecommendations": "Course Recommendations",
    "noCourseRecommendations": "No courses available for your skills",
    "recommendedFor": "Recommended For",
    "provider": "Provider",
    "duration": "Duration",
    "rating": "Rating",
    "price": "Price",
    "viewCourse": "View Course",
    "marketInsights": "Market Insights",
    "techStack": "Tech Stack",
    "rateRange": "Rate Range",
    "change": "Change (Q.o.Q)",
    "source": "Source",
    "lastUpdated": "Last Updated",
    "rateBenchmark": "Rate Benchmark (Optional)",
    "yourRate": "Your Rate",
    "marketRate": "Market Rate",
    "percentile": "Percentile",
    "belowMarket": "Below Market",
    "fair": "Fair",
    "aboveMarket": "Above Market",
    "loyaltyPoints": "Loyalty Points",
    "pointsAwarded": "Points Awarded",
    "errors": {
      "invalidFile": "Invalid file format. Please upload PDF or JPG.",
      "fileTooLarge": "File is too large. Maximum 5MB allowed.",
      "certificateExpired": "Certificate has expired.",
      "missingRequiredField": "Missing required field"
    },
    "admin": {
      "title": "Admin Panel - Skill Management",
      "manageCertifications": "Manage Certifications",
      "reviewQueue": "Review Queue",
      "marketInsightsManager": "Market Insights Manager",
      "addInsight": "Add Market Insight",
      "editInsight": "Edit Insight",
      "approveBtn": "Approve",
      "rejectBtn": "Reject",
      "requestChanges": "Request Changes",
      "rateBenchmarkToggle": "Rate Benchmark Feature Toggle",
      "enableRateBenchmark": "Enable Rate Benchmark",
      "disableRateBenchmark": "Disable Rate Benchmark",
      "warning": "Warning: This feature may cause controversy. Use with caution."
    },
    "messages": {
      "savingChanges": "Saving changes...",
      "changesSuccess": "Changes saved successfully",
      "uploadingCert": "Uploading certificate...",
      "certUploadSuccess": "Certificate uploaded. Awaiting review.",
      "pointsAwarded": "Points awarded: {{points}}"
    }
  }
}
```

### Plik 7.2: /translations/m5.pl.json
```json
{
  "m5": {
    "title": "Rozwój kompetencji",
    "myProfile": "Mój profil kompetencji",
    "mySkills": "Moje umiejętności",
    "addSkill": "Dodaj umiejętność",
    "editSkill": "Edytuj umiejętność",
    "removeSkill": "Usuń umiejętność",
    "yearsOfExperience": "Lata doświadczenia",
    "proficiencyLevel": "Poziom zaawansowania",
    "proficiency": {
      "beginner": "Początkujący",
      "intermediate": "Średniozaawansowany",
      "advanced": "Zaawansowany",
      "expert": "Ekspert"
    },
    "certifications": "Certyfikaty",
    "uploadCertification": "Uploaduj certyfikat",
    "certDetails": "Szczegóły certyfikatu",
    "issuer": "Wystawca",
    "issueDate": "Data wydania",
    "expiryDate": "Data wygaśnięcia",
    "status": "Status",
    "statusPendingReview": "Oczekuje weryfikacji",
    "statusApproved": "Zatwierdzone",
    "statusRejected": "Odrzucone",
    "statusExpired": "Wygasłe",
    "skillGaps": "Luki w umiejętnościach",
    "gapAlerts": "Alerty o lukach",
    "noGaps": "Brak zidentyfikowanych luk w umiejętnościach",
    "courseRecommendations": "Rekomendacje kursów",
    "noCourseRecommendations": "Brak dostępnych kursów dla Twoich umiejętności",
    "recommendedFor": "Polecane dla",
    "provider": "Dostawca",
    "duration": "Czas trwania",
    "rating": "Ocena",
    "price": "Cena",
    "viewCourse": "Przejdź do kursu",
    "marketInsights": "Analizy rynkowe",
    "techStack": "Stos technologii",
    "rateRange": "Zakres stawek",
    "change": "Zmiana (Q.o.Q)",
    "source": "Źródło",
    "lastUpdated": "Ostatnia aktualizacja",
    "rateBenchmark": "Benchmark stawek (Opcjonalnie)",
    "yourRate": "Twoja stawka",
    "marketRate": "Stawka rynkowa",
    "percentile": "Percentyl",
    "belowMarket": "Poniżej rynku",
    "fair": "Wyrównana",
    "aboveMarket": "Powyżej rynku",
    "loyaltyPoints": "Punkty lojalności",
    "pointsAwarded": "Przyznane punkty",
    "errors": {
      "invalidFile": "Nieprawidłowy format pliku. Proszę uploaduj PDF lub JPG.",
      "fileTooLarge": "Plik jest zbyt duży. Maksymalnie 5 MB.",
      "certificateExpired": "Certyfikat wygasł.",
      "missingRequiredField": "Brakuje wymaganego pola"
    },
    "admin": {
      "title": "Panel administratora - Zarządzanie umiejętnościami",
      "manageCertifications": "Zarządzaj certyfikatami",
      "reviewQueue": "Kolejka do weryfikacji",
      "marketInsightsManager": "Menadżer analiz rynkowych",
      "addInsight": "Dodaj analizę rynkową",
      "editInsight": "Edytuj analizę",
      "approveBtn": "Zatwierdź",
      "rejectBtn": "Odrzuć",
      "requestChanges": "Poproś o poprawę",
      "rateBenchmarkToggle": "Toggle funkcji benchmark stawek",
      "enableRateBenchmark": "Włącz benchmark stawek",
      "disableRateBenchmark": "Wyłącz benchmark stawek",
      "warning": "Ostrzeżenie: Ta funkcja może być kontrowersyjna. Używaj ostrożnie."
    },
    "messages": {
      "savingChanges": "Zapisywanie zmian...",
      "changesSuccess": "Zmiany zapisane pomyślnie",
      "uploadingCert": "Uploadowanie certyfikatu...",
      "certUploadSuccess": "Certyfikat uploadowany. Oczekuje weryfikacji.",
      "pointsAwarded": "Przyznane punkty: {{points}}"
    }
  }
}
```

---

## 8. Scenariusze Testowe

### Scenario 8.1: Dodanie nowej umiejętności
**Given:** Konsultant zalogowany w aplikacji
**When:** Kliknie przycisk "Dodaj umiejętność", wypełni formularz (Java, 8 lat, Expert)
**Then:** Umiejętność pojawi się na liście, zostanie zapisana w BD, będzie dostępna dla job matching

### Scenario 8.2: Detekcja luki kompetencyjnej
**Given:** Konsultant przypisany do projektu wymagającego AWS + CKA
**When:** Konsultant ma Java, ale nie AWS ani CKA
**Then:** System wyświetli 2 alerty: "AWS - MISSING (high)" i "CKA - MISSING (high)"
**And:** Suggeruje kursy AWS i CKA

### Scenario 8.3: Alert o wygasającym certyfikacie
**Given:** Konsultant ma CKA ważny do 2025-06-15, dziś 2025-02-08
**When:** System sprawdza daty wygaśnięcia co dzień (cron job)
**Then:** Alert "CKA expires in 4 months - RENEW SOON (medium urgency)"

### Scenario 8.4: Upload certyfikatu
**Given:** Konsultant chce dodać AWS SAA cert
**When:** Kliknie "Upload", wyśle PDF (AWS_SAA_2024.pdf), wypełni issuer/dates
**Then:** File trafia do S3, status = "pending_review", admin dostaje notyfikację
**And:** Po zatwierdzeniu admin przyznaje +250 loyalty points

### Scenario 8.5: Rekomendacja kursu
**Given:** Konsultant ma lukę w "Kubernetes" i pracuje na projekcie "K8s Migration"
**When:** System analizuje dostępne kursy
**Then:** Rekomenduje "CKA prep course" (match score 95), "Docker to K8s" (85), itp.

### Scenario 8.6: Market Insights - trendy stawek
**Given:** Admin dodał insights: "Java+AWS: 480-620 PLN/h, +12% Q.o.Q"
**When:** Konsultant z Java+AWS przegląda Dashboard
**Then:** Widzi swoją tech stack na liście, zielona strzałka (↑ +12%)

### Scenario 8.7: Rate Benchmark - Disabled (Default)
**Given:** Rate benchmark toggle = FALSE (default)
**When:** Konsultant przegląda market insights
**Then:** Rate benchmark section NIE widoczny, zamiast tego "Benchark stawek jest wyłączony"

### Scenario 8.8: Rate Benchmark - Enabled (Admin toggle)
**Given:** Admin włączy toggle "m5_rate_benchmark" na TRUE
**When:** Konsultant ma stawkę 550 PLN/h, rynek: 480-620
**Then:** Widzi: "Percentile: 74% (Powyżej mediany)" + rekomendacja

### Scenario 8.9: Moderation workflow - Certificate rejection
**Given:** Konsultant uploaduje certyfikat bez numeru (invalid)
**When:** Admin przegląda w review queue, kliknie "Odrzuć"
**Then:** Konsultant dostaje notif + email z instrukcją "Brakuje numeru cert", może reupload

### Scenario 8.10: Loyalty points - cumulative rewards
**Given:** Konsultant ma: AWS cert (+250), CKA cert (+300), Terraform (+250)
**When:** System sumarycznie liczy punkty
**Then:** Loyalty balance: 800 pkt (redemable za kursy, dni wolne, itp. - out of scope M5)

---

## 9. Dane Testowe (SQL Fixtures)

```sql
-- INSERT Consultant Skills
INSERT INTO consultant_skills
  (consultant_id, skill_name, years_of_experience, proficiency_level, is_primary)
VALUES
  ('{jan-kowalski-id}', 'Java', 8, 'expert', TRUE),
  ('{jan-kowalski-id}', 'Spring Boot', 5, 'advanced', TRUE),
  ('{jan-kowalski-id}', 'AWS', 4, 'advanced', FALSE),
  ('{jan-kowalski-id}', 'Docker', 2, 'intermediate', FALSE),
  ('{jan-kowalski-id}', 'PostgreSQL', 6, 'advanced', FALSE),
  ('{maria-nowak-id}', 'Python', 7, 'expert', TRUE),
  ('{maria-nowak-id}', 'Django', 5, 'advanced', TRUE),
  ('{maria-nowak-id}', 'AWS', 3, 'intermediate', FALSE);

-- INSERT Certifications
INSERT INTO consultant_certifications
  (consultant_id, cert_name, issuer, issue_date, expiry_date, status, loyalty_points_awarded)
VALUES
  ('{jan-kowalski-id}', 'AWS Solutions Architect Associate', 'Amazon Web Services',
   '2024-03-15', '2027-03-15', 'approved', 250),
  ('{jan-kowalski-id}', 'CKA - Certified Kubernetes Administrator', 'Linux Foundation',
   '2023-07-20', '2025-07-20', 'approved', 300),
  ('{maria-nowak-id}', 'Google Cloud Professional Cloud Architect', 'Google Cloud',
   '2025-12-10', '2027-12-10', 'pending_review', 0);

-- INSERT Projects
INSERT INTO projects (id, name, required_skills, start_date, end_date)
VALUES
  ('{project-gcp-migration-id}', 'Google Cloud Migration',
   '["Java", "GCP", "Terraform"]', '2026-02-15', '2026-08-15'),
  ('{project-k8s-ops-id}', 'Kubernetes Ops Platform',
   '["Kubernetes", "Docker", "Terraform", "AWS"]', '2026-03-01', '2026-12-31');

-- INSERT Market Insights
INSERT INTO market_insights
  (tech_stack, rate_min, rate_max, change_percent, change_period, source, tags)
VALUES
  ('Java', 450, 580, 8, 'Q4 2025', 'LinkedIn + Internal Survey', '["java", "backend"]'),
  ('Java + AWS', 480, 620, 12, 'Q4 2025', 'LinkedIn + Internal Survey', '["java", "aws", "backend", "cloud"]'),
  ('Kubernetes Specialist', 550, 700, 15, 'Q4 2025', 'Stack Overflow Survey', '["kubernetes", "devops", "cloud"]'),
  ('Python/ML', 600, 750, 10, 'Q4 2025', 'LinkedIn + Internal Survey', '["python", "ml", "data"]'),
  ('React/TypeScript', 420, 550, -3, 'Q4 2025', 'LinkedIn + Internal Survey', '["react", "typescript", "frontend"]'),
  ('Azure DevOps', 500, 650, 8, 'Q4 2025', 'LinkedIn + Internal Survey', '["azure", "devops", "ci-cd"]'),
  ('GCP Cloud Architect', 650, 800, 5, 'Q4 2025', 'LinkedIn + Internal Survey', '["gcp", "cloud", "architecture"]');

-- INSERT Courses
INSERT INTO courses
  (title, provider, duration_hours, rating, price_usd, target_skills, difficulty)
VALUES
  ('AWS Solutions Architect - Associate', 'udemy', 24, 4.8, 15, '["AWS", "Cloud Architecture"]', 'intermediate'),
  ('Certified Kubernetes Administrator (CKA) Prep', 'a_cloud_guru', 45, 4.9, 25, '["Kubernetes", "Docker", "DevOps"]', 'advanced'),
  ('Terraform Deep Dive', 'a_cloud_guru', 32, 4.9, 20, '["Terraform", "IaC", "Cloud"]', 'intermediate'),
  ('GCP Professional Cloud Architect', 'coursera', 50, 4.7, 39, '["GCP", "Cloud Architecture", "Google Cloud"]', 'advanced'),
  ('Python for Data Science', 'udemy', 40, 4.7, 12, '["Python", "ML", "Data"]', 'intermediate'),
  ('React & TypeScript Masterclass', 'udemy', 48, 4.8, 14, '["React", "TypeScript", "JavaScript"]', 'intermediate');

-- INSERT Loyalty Points Log
INSERT INTO loyalty_points_log
  (consultant_id, action_type, points, related_resource_type, description)
VALUES
  ('{jan-kowalski-id}', 'certification_approved', 250, 'certification', 'AWS SAA'),
  ('{jan-kowalski-id}', 'certification_approved', 300, 'certification', 'CKA'),
  ('{maria-nowak-id}', 'skill_endorsed', 50, 'skill', 'Python endorsed by team lead');

-- INSERT Feature Flags
INSERT INTO feature_flags (flag_name, is_enabled, affected_modules, description)
VALUES
  ('m5_rate_benchmark', FALSE, 'm5_skill_development',
   'Feature toggle for rate benchmark. Disabled by default due to privacy/controversy concerns.');
```

---

## 10. Przypadki Brzegowe

1. **Certyfikat bez daty wygaśnięcia (perpetual)**
   - Oracle Java Programmer, Cisco CCNA lifetime certs
   - Brak alartu "expires soon"

2. **Upload certyfikatu z błędnym formatem**
   - Użytkownik uploaduje .txt zamiast PDF
   - Walidacja: file type check, reject + msg "Use PDF or JPG"

3. **Dwa identyczne certyfikaty**
   - Konsultant uploaduje CKA dwa razy
   - System: warn "This certification already exists" ale zezwoli (dla renew)

4. **Umiejętność bez żadnej daty (no years_of_experience)**
   - Konsultant dodaje "Hobby Skill" bez lat doświadczenia
   - Logika: Akceptuj 0 lat, ale oznacz jako "experimental" w profilu

5. **Projekt wymagający "machine learning" - consultant ma "ML"**
   - Fuzzy matching: sprawdź czy "ML" ≈ "Machine Learning"
   - Regex or keyword expansion

6. **Market Insights - brak danych dla niszowej technologii (Elixir, Clojure)**
   - System: "Brak danych rynkowych dla tej technologii"
   - Pokaż most recent data dostępne lub "N/A"

7. **Consultant z stawką 400 PLN/h vs market range 500-700**
   - Percentile: -33% (poniżej minimum)
   - Status: "Znacznie poniżej mediany - czekają negocjacje"

8. **Rate benchmark disabled vs enabled toggle switch**
   - Default: disabled
   - Jeśli disabled: component NIE renderuje się w UI
   - Jeśli enabled: pokaż wszystko (bez warningów)

9. **File size limit 5MB - upload 6MB**
   - Error: "File exceeds 5MB limit. Current: 6.2 MB"

10. **Concurrent certificate uploads from same consultant**
    - Queue uploads w order, każdy dostaje unique ID
    - Brak race conditions

---

## 11. Metryki

### Metryki czasu rzeczywistego (Dashboard)
- **Total Consultants with Profile Completion**: 480/500 (96%)
- **Average Certifications per Consultant**: 2.3
- **Tech Stack Coverage**: 87% (wszystkie 500+ mają co najmniej 1 tech)
- **Average Match Score (Recommendations)**: 72/100
- **Pending Certificate Reviews**: 4
- **Active Gap Alerts**: 127 (26% consultantów)
- **Rate Benchmark Toggle Status**: DISABLED

### Metryki biznesowe
- **Certificate Approval Rate**: 98% (2 rejected out of 100 last week)
- **Certification → Rate Increase**: +12% konsultantów podwyższyło stawkę po cert
- **Course Recommendation Click-Through**: 34%
- **Skill Gap Alert Response Time**: Avg 3.2 days (time to fill gap)
- **Loyalty Points Per Consultant/Month**: Avg 45 pkt
- **Consultant Retention (12-month)**: 92% (pre-M5: 87%)

### Metryki techniczne
- **Certificate Upload Success Rate**: 99.2%
- **Gap Detection Latency**: <500ms (async job)
- **Course Matching P95**: <200ms
- **Market Insights Sync Uptime**: 99.8% (weekly cron)
- **API Endpoint P99**: <300ms

---

## 12. PROMPT DLA AI BUILDERA (300+ lines, Polish)

```
SYSTEM PROMPT - QUALRIX M5 SKILL DEVELOPMENT MODULE

Jesteś AI code generator dla modułu M5 (Skill Development) aplikacji Qualrix.
Aplikacja: B2B IT Outsourcing Platform
Tech Stack: Next.js 14+, Supabase, TypeScript, Tailwind CSS, shadcn/ui, next-intl

ZADANIE GŁÓWNE:
Generować production-ready kod React/Next.js dla modułu M5 zgodnie ze specyfikacją.
Kod musi być:
1. Type-safe (TS strict mode)
2. i18n-ready (PL + EN)
3. Accessible (WCAG 2.1 AA)
4. Performance-optimized (React.memo, useMemo, lazy load)
5. Security-hardened (input validation, SQL injection prevention)

ARCHITEKTURA PLIKÓW:

/app/m5/ - Main routes
  /skill-profile/ - GET /skill-profile
  /certifications/ - GET /certifications
  /gap-alerts/ - GET /gap-alerts
  /courses/ - GET /courses
  /market-insights/ - GET /market-insights
  /admin/ - GET /admin/m5 (require role: "admin")
  /admin/certifications/ - GET /admin/m5/certifications

/components/m5/ - Reusable React components
  SkillProfileEditor.tsx
  SkillGapAlert.tsx
  CourseRecommendation.tsx
  CertificationUpload.tsx
  MarketInsightDashboard.tsx
  RateBenchmark.tsx (CONDITIONAL - feature toggle)

/lib/m5/ - Business logic
  gapDetectionEngine.ts
  courseMatchingEngine.ts
  marketInsightsService.ts
  rateBenchmarkCalculator.ts (CONDITIONAL)
  loyaltyPointsService.ts
  certificationValidator.ts

/api/m5/ - API Routes
  GET /api/m5/skills - get consultant skills
  POST /api/m5/skills - create/update skill
  DELETE /api/m5/skills/:id - remove skill
  GET /api/m5/gap-alerts - list gap alerts for consultant
  GET /api/m5/courses - recommendations
  POST /api/m5/certifications/upload - file upload endpoint
  GET /api/m5/certifications - list consultant certs
  PATCH /api/m5/certifications/:id/status - update cert status (admin)
  GET /api/m5/market-insights - get market data
  POST /api/m5/market-insights - add insight (admin)
  GET /api/m5/admin/reports - team reports (admin)
  PATCH /api/m5/admin/feature-flags - toggle rate benchmark (admin)

/db/schema/ - Database migrations
  m5_tables.sql - all M5 tables
  m5_seed.sql - test data

KOMPONENTY - SZCZEGÓŁOWA SPECYFIKACJA:

1. SkillProfileEditor
   Props:
     - consultantId: string (required)
     - initialSkills: Skill[] (required)
     - onSave: (skills: Skill[]) => Promise<void> (required)

   Funkcjonalność:
     - Edytuj skill: input fields (name, years, proficiency)
     - Add button: opens modal with skill list dropdown (taxonomy below)
     - Remove button: confirm dialog before delete
     - Save button: POST /api/m5/skills
     - Loading state during save
     - Error handling with toast notifications

   Skill Taxonomy (required options):
     Languages: Java, Python, C#, C++, Go, Rust, JavaScript, TypeScript, PHP, Ruby, Scala
     Databases: PostgreSQL, MySQL, MongoDB, Redis, DynamoDB, Elasticsearch, Oracle, SQL Server
     Cloud Platforms: AWS, Azure, GCP, Kubernetes, Docker
     Frameworks: Spring Boot, Django, FastAPI, .NET Core, React, Angular, Vue.js, Node.js
     Tools: Jenkins, GitLab CI/CD, GitHub Actions, Terraform, Ansible, Linux, Git
     Specializations: DevOps, ML/AI, Data Engineering, Cloud Architecture, Security, Blockchain

2. SkillGapAlert
   Props:
     - alert: GapAlert (required)

   Styling: Card with alert icon, color-coded urgency
     - High: #FF6B6B (red) - "MISSING" label
     - Medium: #FFA500 (orange) - "EXPIRING SOON" label
     - Low: #FFD700 (yellow)

   Actions:
     - "Szukaj kursu" button → navigates to course recommendations
     - "Dodaj do learning planu" button → integrates with learning management (future module)
     - Close/dismiss → POST /api/m5/gap-alerts/:id/acknowledge

3. CourseRecommendation
   Props:
     - course: Course (required)
     - matchScore: number (0-100, required)

   Display:
     - Match score as % bar + color (0-50: red, 50-75: yellow, 75-100: green)
     - Provider badge (Udemy, Coursera, etc.)
     - Rating stars (1-5)
     - Duration in hours
     - Price in USD
     - "Przejdź" link → external course URL
     - Relevance tags: "Pasuje do: Java, AWS, Cloud"

4. CertificationUpload
   Props:
     - consultantId: string
     - onSuccess: () => void

   Flow:
     - Drag-and-drop zone (or click to select file)
     - File validation: PDF/JPG only, <5MB
     - Form fields: certName, issuer, issueDate, expiryDate (optional)
     - Submit button → POST /api/m5/certifications/upload
     - Response handling: show success message + points awarded

   Security:
     - Scan file for malware (ClamAV or similar)
     - Check metadata (prevent renamed .exe files)
     - Store in S3 with restricted ACL
     - Generate signed URL for retrieval

5. MarketInsightDashboard
   Props:
     - insights: MarketInsight[]
     - consultantSkills?: string[]

   Table columns: Tech Stack | Rate Range (PLN) | Change (%) | Source | Updated
   Features:
     - Highlight rows matching consultant's skills (light blue bg)
     - Sort by: rate, change, date updated
     - Filter by: skill name, rate range, source
     - Trend indicators: ↑ green, ↓ red, → gray

6. RateBenchmark (CONDITIONAL)
   Props:
     - consultantId: string
     - consultantRate: number (PLN/hour)
     - marketRate: { min, max }
     - enabled: boolean (feature toggle)

   UI:
     - Only render if enabled === true
     - Show percentile bar (0-100%)
     - Color code: <25: red, 25-50: orange, 50-75: yellow, 75-100: green
     - Display recommendation text based on percentile
     - Warning: "Ta funkcja jest kontrowersyjna i opcjonalna"

   Data retrieval:
     - GET /api/m5/market-insights (filtered by consultant's primary tech)
     - Use calculateRateBenchmark() from lib/m5/rateBenchmarkCalculator.ts

API ROUTES - SZCZEGÓŁOWA SPECYFIKACJA:

POST /api/m5/skills
  Request:
    {
      "skill_name": "AWS",
      "years_of_experience": 4,
      "proficiency_level": "advanced"
    }
  Response: 201 Created
    {
      "id": "uuid",
      "consultant_id": "uuid",
      "skill_name": "AWS",
      "years_of_experience": 4,
      "proficiency_level": "advanced"
    }
  Validation:
    - skill_name: required, max 255 chars
    - years_of_experience: 0-50, numeric
    - proficiency_level: one of [beginner, intermediate, advanced, expert]
  Error handling:
    - 400 Bad Request: validation error
    - 409 Conflict: skill already exists
    - 500 Internal Server Error: database error

POST /api/m5/certifications/upload
  Request: FormData
    - consultant_id: string (from session)
    - cert_name: string
    - issuer: string
    - issue_date: ISO date
    - expiry_date: ISO date (optional)
    - certificate_file: File (PDF/JPG, <5MB)
  Response: 202 Accepted
    {
      "id": "uuid",
      "status": "pending_review",
      "message": "Certyfikat uploadowany. Oczekuje weryfikacji.",
      "loyalty_points": "Pending"
    }
  Security:
    - File size validation: <5MB
    - File type validation: image/jpeg, application/pdf only
    - Virus scan before S3 upload
    - Store with consultant_id in S3 path: s3://qualrix-certs/m5/{consultant_id}/{filename}
  Flow:
    1. Validate file
    2. Scan for viruses
    3. Upload to S3
    4. Create DB record with status="pending_review"
    5. Send email to admin: "New certification for review"
    6. Return 202

PATCH /api/m5/certifications/:id/status (ADMIN ONLY)
  Request:
    {
      "status": "approved",
      "verification_notes": "Valid AWS credential number detected"
    }
  Response: 200 OK
    {
      "id": "uuid",
      "status": "approved",
      "loyalty_points_awarded": 250
    }
  Side effects:
    - If status = "approved":
      1. Award loyalty points based on cert type
      2. Send email to consultant: "Your certificate has been approved!"
      3. Update consultant.loyalty_points balance
      4. Trigger gap alert update (some gaps may now be filled)

GET /api/m5/gap-alerts?consultant_id=:id&project_id=:id
  Response: 200 OK
    {
      "gaps": [
        {
          "id": "uuid",
          "project_name": "Kubernetes Ops",
          "required_skill": "Terraform",
          "gap": "missing",
          "urgency": "high",
          "recommended_course": {
            "id": "uuid",
            "title": "Terraform Deep Dive",
            "provider": "a_cloud_guru",
            "price_usd": 20
          }
        }
      ]
    }
  Logic:
    - Call detectSkillGaps() from lib
    - Filter by consultant_id + optional project_id
    - Return sorted by urgency (high > medium > low)

GET /api/m5/courses?consultant_id=:id&skill_gap=:skill
  Response: 200 OK
    {
      "recommendations": [
        {
          "course": {...},
          "match_score": 95
        },
        {
          "course": {...},
          "match_score": 82
        }
      ]
    }
  Logic:
    - Call recommendCourses() from lib
    - Sort by match_score descending
    - Limit to 10 results

GET /api/m5/market-insights?tech_stack=Java&country=PL
  Response: 200 OK
    {
      "insights": [
        {
          "tech_stack": "Java",
          "rate_min": 450,
          "rate_max": 580,
          "change_percent": 8,
          "change_period": "Q4 2025",
          "source": "LinkedIn + Internal Survey"
        }
      ]
    }

AUTHENTICATION & AUTHORIZATION:

All endpoints require:
  - Header: Authorization: Bearer {token}
  - Supabase RLS policies enforced

Routes by role:
  - Consultant: GET /api/m5/skills, GET /api/m5/gap-alerts, GET /api/m5/courses,
                POST /api/m5/certifications/upload, GET /api/m5/market-insights,
                PATCH /api/m5/certifications/:id (own cert only)
  - Admin: all routes + POST /api/m5/certifications/upload, PATCH /api/m5/certifications/:id/status

i18n INTEGRATION:

Use next-intl for all UI strings:
  - import { useTranslations } from 'next-intl';
  - const t = useTranslations('m5');
  - Access strings via: t('title'), t('myProfile'), t('admin.title')

Message patterns:
  - Validation errors: t('errors.invalidFile')
  - Success messages: t('messages.changesSuccess')
  - Action labels: t('addSkill'), t('editSkill')

TESTING CHECKLIST:

Unit Tests:
  [ ] gapDetectionEngine.detectSkillGaps()
  [ ] courseMatchingEngine.recommendCourses()
  [ ] rateBenchmarkCalculator.calculateRateBenchmark()
  [ ] loyaltyPointsService.awardCertificationPoints()

Integration Tests:
  [ ] POST /api/m5/skills → SkillProfileEditor
  [ ] POST /api/m5/certifications/upload → CertificationUpload
  [ ] PATCH /api/m5/certifications/:id/status → loyalty points awarded
  [ ] GET /api/m5/gap-alerts → SkillGapAlert display

E2E Tests:
  [ ] Consultant: add skill → save → reload page → skill persists
  [ ] Consultant: upload cert → admin approves → points awarded + email sent
  [ ] Admin: toggle rate benchmark → consultant sees/doesn't see RateBenchmark
  [ ] Gap alert created → course recommendation shown → click through works

DEPLOYMENT & FEATURE FLAGS:

Feature flags in Supabase:
  INSERT INTO feature_flags (flag_name, is_enabled)
  VALUES ('m5_rate_benchmark', FALSE);

RateBenchmark component:
  const shouldShowBenchmark = await getFeatureFlag('m5_rate_benchmark');
  return shouldShowBenchmark ? <RateBenchmark /> : null;

Admin toggle:
  PATCH /api/m5/admin/feature-flags
  Body: { "flag_name": "m5_rate_benchmark", "is_enabled": true }

LOCALIZATION FILES:
  - /translations/m5.en.json (English)
  - /translations/m5.pl.json (Polish)

Both files should contain identical keys with translated values.
Keys follow pattern: m5.section.subsection.key

PERFORMANCE REQUIREMENTS:

  - Initial page load: <2s (LCP)
  - Skill profile edit: <500ms (input to save)
  - Gap alert generation: async, <30s (cron job)
  - Market insights sync: weekly cron, <5 min
  - Course recommendations: <200ms P95
  - Certificate upload: <30s (including virus scan)

SECURITY REQUIREMENTS:

  - All inputs validated server-side
  - XSS prevention: sanitize all user inputs
  - CSRF protection: SameSite=Lax cookies
  - Rate limiting: 100 req/min per user
  - File upload: virus scan + MIME type validation
  - Database: parameterized queries, RLS policies
  - Passwords: never transmitted in logs

ACCESSIBILITY (WCAG 2.1 AA):

  - All form inputs have labels + aria-label
  - Color not sole indicator (use icons + text)
  - Keyboard navigation: Tab through all interactive elements
  - Focus management: announce changes to screen readers
  - Language attribute: <html lang="en"> / lang="pl"
  - Alt text: all images have meaningful alt

DELIVERABLES:

1. All components in /components/m5/ (6 total)
2. All API routes in /api/m5/ (8-10 endpoints)
3. All business logic in /lib/m5/ (5 files)
4. Database schema: /db/schema/m5_tables.sql
5. Test fixtures: /db/seed/m5_seed.sql
6. i18n files: /translations/m5.{en,pl}.json
7. All code must pass:
   - TypeScript strict mode
   - ESLint with Next.js config
   - Prettier formatting
   - Unit test coverage >80%

IMPORTANT NOTES:

1. Rate benchmark is OPTIONAL and CONTROVERSIAL.
   - Default: DISABLED (toggle = FALSE)
   - Reason: Can cause anxiety, privacy concerns, resentment
   - Admin must explicitly enable via feature flag
   - Component should NOT render if disabled

2. Skill gap detection must run ASYNC (cron job, not on-demand)
   - Trigger: weekly, or on project assignment
   - Prevents system overload

3. Certificate moderation is HUMAN-INTENSIVE
   - No automatic approval
   - Admin must manually verify each cert
   - Email notifications for all actions

4. Market insights should be MANUALLY CURATED by admin
   - Not auto-scraped (legal/compliance issues)
   - Admin inputs data via dashboard
   - Sources: LinkedIn, Glassdoor, Stack Overflow, internal survey

5. Loyalty points MUST be PERSISTENT
   - Log all transactions in loyalty_points_log
   - Never subtract points (only add)
   - Audit trail for compliance

END OF PROMPT
```

---

## 13. Zależności (Dependencies)

### Backend Dependencies
- **@supabase/supabase-js** - ORM + auth
- **zod** - Input validation
- **clamscan** - Malware scanning for file uploads
- **aws-sdk** - S3 file storage
- **node-cron** - Scheduling gap detection & market insights sync
- **resend** - Email notifications

### Frontend Dependencies
- **next** - Framework (14+)
- **react** - UI library
- **typescript** - Type safety
- **tailwind-css** - Styling
- **shadcn/ui** - Component library
- **next-intl** - i18n support
- **react-hook-form** - Form management
- **zustand** - State management (optional)
- **axios** - HTTP client
- **react-hot-toast** - Toast notifications
- **recharts** - Market insights charts (optional)

### Dev Dependencies
- **@types/node** - Node.js types
- **@types/react** - React types
- **eslint** - Code linting
- **prettier** - Code formatting
- **jest** - Unit testing
- **@testing-library/react** - React testing
- **@testing-library/jest-dom** - Jest matchers
- **playwright** - E2E testing

### Optional (Future)
- **stripe** - Loyalty points redemption
- **sendgrid** - Enterprise email
- **datadog** - Monitoring & observability
- **sentry** - Error tracking

---

## Podsumowanie

Moduł M5 (Skill Development) stanowi kluczowy element systemu Qualrix, wspierający:
- **Windykację talentów** poprzez mapowanie i wsparcie rozwoju kompetencji
- **Przejrzystość rynku** poprzez market insights i (opcjonalnie) benchmark stawek
- **Zaangażowanie konsultantów** poprzez gamifikację (loyalty points) i jasne ścieżki kariery

Kluczowe cechy:
1. ✅ Type-safe architektura (TypeScript strict mode)
2. ✅ i18n support (PL + EN)
3. ✅ Feature toggle dla kontrowersyjnego rate benchmark
4. ✅ Human-in-the-loop certyfikat moderation
5. ✅ Async gap detection (cron job)
6. ✅ Comprehensive test coverage
7. ✅ Security hardened (file uploads, XSS prevention)
8. ✅ Accessibility compliant (WCAG 2.1 AA)

---

**Dokument przygotowany:** 2026-02-08
**Wersja:** 1.0
**Status:** Gotowy do implementacji

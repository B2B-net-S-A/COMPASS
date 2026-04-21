# PROMPT: ULUBIONE PROJEKTY (Favorite Projects)

**Faza:** Rozszerzenie istniejących modułów | **Czas:** ~6 godzin | **Zależności:** Moduł Projects, Profile, Candidates (admin)
**Co powstanie:** System ulubionych projektów — konsultant może oznaczyć projekt jako ulubiony (⭐), informacja o ulubionych widoczna w wielu miejscach aplikacji.

```
=== QUALRIX - ULUBIONE PROJEKTY (FAVORITE PROJECTS) ===

Rozbudowujemy aplikację Qualrix o funkcjonalność "Ulubione Projekty".
Konsultant może oznaczyć dowolny projekt z listy Marketplace jako ulubiony.
Informacja o ulubionych projektach musi być widoczna w wielu kluczowych miejscach.

## KONTEKST TECHNICZNY

- Aplikacja: Qualrix / ComPass by B2B.net S.A.
- Stack: Next.js 14+ App Router, React 18, TypeScript, Tailwind CSS, shadcn/ui, Supabase
- Database: PostgreSQL via Supabase (z pgvector)
- Auth: Supabase Auth
- Istniejące typy (lib/types.ts):
  - Project: { id, title, description, required_skills[], budget_range, file_url?, position?, max_rate?, location?, work_type?, required_languages?[], start_date?, recommendation_deadline?, manager_name?, description_pl? }
  - ProjectMatch: { id, full_name, avatar_url, job_title, similarity, ai_recommendation?, ai_reasoning? }

---

## KROK 1: NOWA TABELA SUPABASE

Wykonaj w Supabase SQL Editor:

```sql
-- Tabela ulubionych projektów
CREATE TABLE favorite_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  note TEXT DEFAULT NULL,           -- opcjonalna notatka konsultanta (np. "ciekawy stack", "zapytać o stawkę")
  UNIQUE(user_id, project_id)       -- jeden user może oznaczyć dany projekt tylko raz
);

-- Indeksy dla performance
CREATE INDEX idx_favorite_projects_user ON favorite_projects(user_id);
CREATE INDEX idx_favorite_projects_project ON favorite_projects(project_id);
CREATE INDEX idx_favorite_projects_created ON favorite_projects(created_at DESC);

-- RLS (Row Level Security)
ALTER TABLE favorite_projects ENABLE ROW LEVEL SECURITY;

-- Konsultant widzi TYLKO swoje ulubione
CREATE POLICY "Users can view own favorites"
  ON favorite_projects FOR SELECT
  USING (auth.uid() = user_id);

-- Konsultant może dodawać TYLKO swoje ulubione
CREATE POLICY "Users can insert own favorites"
  ON favorite_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Konsultant może usuwać TYLKO swoje ulubione
CREATE POLICY "Users can delete own favorites"
  ON favorite_projects FOR DELETE
  USING (auth.uid() = user_id);

-- Konsultant może aktualizować notatkę TYLKO swoich ulubionych
CREATE POLICY "Users can update own favorites"
  ON favorite_projects FOR UPDATE
  USING (auth.uid() = user_id);

-- Admin widzi WSZYSTKIE ulubione (do celów analitycznych i widoku konsultanta)
CREATE POLICY "Admins can view all favorites"
  ON favorite_projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
```

---

## KROK 2: NOWE TYPY TypeScript

W pliku `lib/types.ts` DODAJ (nie usuwaj istniejących typów):

```typescript
export type FavoriteProject = {
  id: string
  user_id: string
  project_id: string
  created_at: string
  note: string | null
}

// Rozszerzony typ Project z informacją o ulubionym
export type ProjectWithFavorite = Project & {
  is_favorite: boolean
  favorite_id?: string
  favorite_note?: string
  favorite_date?: string
}
```

---

## KROK 3: NOWE SERVER ACTIONS

Stwórz nowy plik: `lib/actions/favorites.ts`

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { FavoriteProject } from '@/lib/types'

// Dodaj projekt do ulubionych
export async function addFavoriteProject(projectId: string, note?: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data, error } = await supabase
    .from('favorite_projects')
    .insert({
      user_id: user.id,
      project_id: projectId,
      note: note || null
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      // Already favorited — ignore duplicate
      return { success: true, already_exists: true }
    }
    throw new Error(`Failed to add favorite: ${error.message}`)
  }

  revalidatePath('/projects')
  revalidatePath('/profile')
  revalidatePath('/admin/projects')
  return { success: true, data }
}

// Usuń projekt z ulubionych
export async function removeFavoriteProject(projectId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('favorite_projects')
    .delete()
    .eq('user_id', user.id)
    .eq('project_id', projectId)

  if (error) throw new Error(`Failed to remove favorite: ${error.message}`)

  revalidatePath('/projects')
  revalidatePath('/profile')
  revalidatePath('/admin/projects')
  return { success: true }
}

// Toggle ulubiony (add/remove jednym kliknięciem)
export async function toggleFavoriteProject(projectId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Sprawdź czy już jest ulubiony
  const { data: existing } = await supabase
    .from('favorite_projects')
    .select('id')
    .eq('user_id', user.id)
    .eq('project_id', projectId)
    .single()

  if (existing) {
    // Usuń z ulubionych
    await supabase.from('favorite_projects').delete().eq('id', existing.id)
    revalidatePath('/projects')
    revalidatePath('/profile')
    return { success: true, is_favorite: false }
  } else {
    // Dodaj do ulubionych
    await supabase.from('favorite_projects').insert({
      user_id: user.id,
      project_id: projectId
    })
    revalidatePath('/projects')
    revalidatePath('/profile')
    return { success: true, is_favorite: true }
  }
}

// Pobierz ulubione projekty aktualnie zalogowanego usera
export async function getMyFavoriteProjects(): Promise<(FavoriteProject & { project: any })[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('favorite_projects')
    .select(`
      *,
      project:projects(*)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to get favorites:', error)
    return []
  }

  return data || []
}

// Pobierz ulubione projekty konkretnego usera (dla admina — widok konsultanta)
export async function getUserFavoriteProjects(userId: string): Promise<(FavoriteProject & { project: any })[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('favorite_projects')
    .select(`
      *,
      project:projects(*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to get user favorites:', error)
    return []
  }

  return data || []
}

// Pobierz IDs ulubionych projektów aktualnego usera (lekkie query do oznaczania gwiazdek)
export async function getMyFavoriteProjectIds(): Promise<string[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('favorite_projects')
    .select('project_id')
    .eq('user_id', user.id)

  if (error) return []
  return (data || []).map(d => d.project_id)
}

// Aktualizuj notatkę przy ulubionym projekcie
export async function updateFavoriteNote(projectId: string, note: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('favorite_projects')
    .update({ note })
    .eq('user_id', user.id)
    .eq('project_id', projectId)

  if (error) throw new Error(`Failed to update note: ${error.message}`)
  return { success: true }
}

// Statystyki ulubionych dla projektu (ile osób oznaczyło — dla admina)
export async function getProjectFavoriteCount(projectId: string): Promise<number> {
  const supabase = createClient()

  const { count, error } = await supabase
    .from('favorite_projects')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (error) return 0
  return count || 0
}
```

---

## KROK 4: KOMPONENT FavoriteButton (GWIAZDKA)

**UWAGA:** Katalog `components/shared/` jeszcze NIE ISTNIEJE — musisz go najpierw utworzyć!

Stwórz: `components/shared/FavoriteButton.tsx`

```typescript
'use client'

import { useState, useTransition } from 'react'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toggleFavoriteProject } from '@/lib/actions/favorites'
import { cn } from '@/lib/utils'

interface FavoriteButtonProps {
  projectId: string
  isFavorite: boolean
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
  onToggle?: (newState: boolean) => void
}

export function FavoriteButton({
  projectId,
  isFavorite,
  size = 'md',
  showLabel = false,
  className,
  onToggle
}: FavoriteButtonProps) {
  const [optimisticFavorite, setOptimisticFavorite] = useState(isFavorite)
  const [isPending, startTransition] = useTransition()

  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'
  const buttonSize = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-10 w-10' : 'h-9 w-9'

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()  // Żeby nie triggerować kliknięcia w parent (np. ProjectCard)
    e.preventDefault()

    const newState = !optimisticFavorite
    setOptimisticFavorite(newState) // Optimistic update

    startTransition(async () => {
      try {
        const result = await toggleFavoriteProject(projectId)
        setOptimisticFavorite(result.is_favorite)
        onToggle?.(result.is_favorite)
      } catch {
        setOptimisticFavorite(!newState) // Rollback on error
      }
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        showLabel ? 'w-auto px-3 gap-2' : buttonSize,
        'transition-all duration-200',
        optimisticFavorite
          ? 'text-yellow-400 hover:text-yellow-500'
          : 'text-muted-foreground hover:text-yellow-400',
        className
      )}
      title={optimisticFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
    >
      <Star
        className={cn(
          iconSize,
          'transition-all duration-200',
          optimisticFavorite && 'fill-yellow-400',
          isPending && 'animate-pulse'
        )}
      />
      {showLabel && (
        <span className="text-sm">
          {optimisticFavorite ? 'W ulubionych' : 'Dodaj do ulubionych'}
        </span>
      )}
    </Button>
  )
}
```

---

## KROK 5: KOMPONENT FavoriteProjectsSection (LISTA ULUBIONYCH)

Stwórz: `components/shared/FavoriteProjectsSection.tsx`

To jest reusable komponent wyświetlający listę ulubionych projektów — używany zarówno w Profilu jak i w widoku Konsultanta (admin).

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Star, Briefcase, MapPin, DollarSign, ExternalLink, StickyNote, X } from 'lucide-react'
import { FavoriteButton } from '@/components/shared/FavoriteButton'
import Link from 'next/link'

interface FavoriteProjectData {
  id: string
  project_id: string
  created_at: string
  note: string | null
  project: {
    id: string
    title: string
    description?: string
    description_pl?: string
    position?: string
    max_rate?: string
    location?: string
    work_type?: string
    required_skills?: string[]
    start_date?: string
  }
}

interface FavoriteProjectsSectionProps {
  favorites: FavoriteProjectData[]
  title?: string
  emptyMessage?: string
  showRemoveButton?: boolean
  maxItems?: number
  compact?: boolean
  onFavoriteRemoved?: (projectId: string) => void
}

const WORK_TYPE_LABELS: Record<string, string> = {
  hybrid: 'Hybryda',
  remote: 'Zdalnie',
  onsite: 'Stacjonarnie',
}

export function FavoriteProjectsSection({
  favorites,
  title = '⭐ Ulubione Projekty',
  emptyMessage = 'Nie masz jeszcze ulubionych projektów. Przejdź do Marketplace i oznacz projekty gwiazdką!',
  showRemoveButton = true,
  maxItems = 0,  // 0 = pokaż wszystkie
  compact = false,
  onFavoriteRemoved
}: FavoriteProjectsSectionProps) {
  const displayFavorites = maxItems > 0 ? favorites.slice(0, maxItems) : favorites

  if (favorites.length === 0) {
    return (
      <Card className="bg-card border-white/10">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-400" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground rounded-lg border border-dashed border-white/10">
            {emptyMessage}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-white/10">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
          {title}
          <Badge variant="secondary" className="ml-2 bg-yellow-400/10 text-yellow-400 border-yellow-400/20">
            {favorites.length}
          </Badge>
        </CardTitle>
        {maxItems > 0 && favorites.length > maxItems && (
          <Link href="/projects?tab=favorites">
            <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300">
              Zobacz wszystkie ({favorites.length})
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {displayFavorites.map((fav) => (
          <div
            key={fav.id}
            className="group flex items-start gap-3 p-3 rounded-lg border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">
                  {fav.project.title}
                </h4>
              </div>

              {!compact && (
                <>
                  {fav.project.position && (
                    <p className="text-sm text-muted-foreground mb-1">
                      <Briefcase className="w-3 h-3 inline mr-1" />
                      {fav.project.position}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                    {fav.project.location && (
                      <span><MapPin className="w-3 h-3 inline mr-0.5" />{fav.project.location}</span>
                    )}
                    {fav.project.max_rate && (
                      <span><DollarSign className="w-3 h-3 inline mr-0.5" />{fav.project.max_rate}</span>
                    )}
                    {fav.project.work_type && (
                      <Badge variant="outline" className="text-xs border-white/10">
                        {WORK_TYPE_LABELS[fav.project.work_type] || fav.project.work_type}
                      </Badge>
                    )}
                  </div>

                  {fav.project.required_skills && fav.project.required_skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {fav.project.required_skills.slice(0, 4).map((skill, i) => (
                        <Badge key={i} variant="secondary" className="text-xs bg-black/40 text-gray-300 border border-white/5">
                          {skill}
                        </Badge>
                      ))}
                      {fav.project.required_skills.length > 4 && (
                        <Badge variant="secondary" className="text-xs bg-black/40 text-gray-500 border border-white/5">
                          +{fav.project.required_skills.length - 4}
                        </Badge>
                      )}
                    </div>
                  )}

                  {fav.note && (
                    <div className="flex items-start gap-1 text-xs text-yellow-400/70 bg-yellow-400/5 rounded px-2 py-1 mt-1">
                      <StickyNote className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="italic">{fav.note}</span>
                    </div>
                  )}
                </>
              )}

              <div className="text-xs text-muted-foreground/50 mt-1">
                Dodano: {new Date(fav.created_at).toLocaleDateString('pl-PL')}
              </div>
            </div>

            {showRemoveButton && (
              <FavoriteButton
                projectId={fav.project_id}
                isFavorite={true}
                size="sm"
                onToggle={(newState) => {
                  if (!newState) onFavoriteRemoved?.(fav.project_id)
                }}
              />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
```

---

## KROK 6: INTEGRACJA — MARKETPLACE PROJEKTÓW (lista projektów)

### 6A. Modyfikacja ProjectCard.tsx

W istniejącym pliku `components/admin/ProjectCard.tsx`:

1. Dodaj import na górze:
```typescript
import { FavoriteButton } from '@/components/shared/FavoriteButton'
```

2. Dodaj nowe props do interfejsu ProjectCardProps:
```typescript
interface ProjectCardProps {
    project: Project
    isSelected: boolean
    onToggleSelect: (id: string) => void
    onDelete: (id: string) => void
    onUpdate: (updatedProject: Project) => void
    initialMatches?: ProjectMatch[]
    isFavorite?: boolean              // NOWE
    onFavoriteToggle?: (projectId: string, newState: boolean) => void  // NOWE
    showFavoriteButton?: boolean      // NOWE — domyślnie true
    favoriteCount?: number            // NOWE — ile osób oznaczyło (admin)
}
```

3. W komponencie ProjectCard, w headerze karty (CardHeader), obok tytułu projektu, DODAJ FavoriteButton:
```tsx
<div className="flex items-center gap-2">
  <CardTitle className="text-xl">{project.title}</CardTitle>
  {showFavoriteButton !== false && (
    <FavoriteButton
      projectId={project.id}
      isFavorite={isFavorite || false}
      size="sm"
      onToggle={(newState) => onFavoriteToggle?.(project.id, newState)}
    />
  )}
  {typeof favoriteCount === 'number' && favoriteCount > 0 && (
    <Badge variant="secondary" className="text-xs bg-yellow-400/10 text-yellow-400 border-yellow-400/20">
      ⭐ {favoriteCount}
    </Badge>
  )}
</div>
```

### 6B. Modyfikacja ProjectsListClient.tsx

W istniejącym pliku `components/admin/ProjectsListClient.tsx`:

1. Dodaj importy:
```typescript
import { getMyFavoriteProjectIds } from '@/lib/actions/favorites'
```

2. Dodaj state:
```typescript
const [favoriteIds, setFavoriteIds] = useState<string[]>([])

// W useEffect przy ładowaniu danych:
useEffect(() => {
  const loadFavorites = async () => {
    const ids = await getMyFavoriteProjectIds()
    setFavoriteIds(ids)
  }
  loadFavorites()
}, [])
```

3. Dodaj filtr „Tylko ulubione":
```tsx
// W sekcji filtrów dodaj przycisk/toggle:
<Button
  variant={showOnlyFavorites ? "default" : "outline"}
  size="sm"
  onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
  className={showOnlyFavorites ? "bg-yellow-500 hover:bg-yellow-600" : ""}
>
  <Star className={cn("w-4 h-4 mr-1", showOnlyFavorites && "fill-white")} />
  Ulubione ({favoriteIds.length})
</Button>
```

4. W filtracji projektów:
```typescript
const filteredProjects = projects.filter(p => {
  // ...istniejące filtry...
  if (showOnlyFavorites && !favoriteIds.includes(p.id)) return false
  return true
})
```

5. W mapowaniu ProjectCard, przekaż nowe props:
```tsx
<ProjectCard
  key={project.id}
  project={project}
  // ... istniejące props ...
  isFavorite={favoriteIds.includes(project.id)}
  onFavoriteToggle={(id, newState) => {
    setFavoriteIds(prev =>
      newState ? [...prev, id] : prev.filter(fid => fid !== id)
    )
  }}
/>
```

---

## KROK 7: INTEGRACJA — MÓJ PROFIL (Twój Profil)

W istniejącym pliku `app/(protected)/profile/page.tsx`:

1. Dodaj importy:
```typescript
import { getMyFavoriteProjects } from '@/lib/actions/favorites'
import { FavoriteProjectsSection } from '@/components/shared/FavoriteProjectsSection'
```

2. Dodaj state i ładowanie danych:
```typescript
const [favorites, setFavorites] = useState<any[]>([])

// W istniejącym useEffect loadProfile() LUB dodaj nowy useEffect:
useEffect(() => {
  const loadFavorites = async () => {
    const favs = await getMyFavoriteProjects()
    setFavorites(favs)
  }
  loadFavorites()
}, [])
```

3. DODAJ sekcję Ulubionych Projektów w profilu, umieść ją PO sekcji z Bio/Previous Clients, ale PRZED sekcją Delete Account:
```tsx
{/* === ULUBIONE PROJEKTY === */}
<div className="mt-6">
  <FavoriteProjectsSection
    favorites={favorites}
    title="⭐ Twoje Ulubione Projekty"
    emptyMessage="Nie masz jeszcze ulubionych projektów. Przejdź do zakładki Projekty i oznacz interesujące Cię projekty gwiazdką!"
    showRemoveButton={true}
    maxItems={5}
    onFavoriteRemoved={(projectId) => {
      setFavorites(prev => prev.filter(f => f.project_id !== projectId))
    }}
  />
</div>
```

---

## KROK 8: INTEGRACJA — PODSTRONA KONSULTANTA (Admin → Konsultanci → [id])

W istniejącym pliku `app/(protected)/admin/candidates/[id]/page.tsx`:

1. Dodaj importy na górze:
```typescript
import { getUserFavoriteProjects } from '@/lib/actions/favorites'
import { FavoriteProjectsSection } from '@/components/shared/FavoriteProjectsSection'
```

2. W funkcji CandidateDetailPage, po pobraniu danych kandydata, dodaj:
```typescript
// Fetch favorite projects for this candidate
// Potrzebujemy user_id kandydata (z tabeli candidates kolumna user_id)
const favoriteProjects = candidate.user_id
  ? await getUserFavoriteProjects(candidate.user_id)
  : []
```

3. W sekcji Tabs, DODAJ nowy TabsTrigger:
```tsx
<TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
  <TabsTrigger value="profile">Profil</TabsTrigger>
  <TabsTrigger value="cv">CV</TabsTrigger>
  <TabsTrigger value="projects">Projekty ({matches.length})</TabsTrigger>
  <TabsTrigger value="favorites">
    ⭐ Ulubione ({favoriteProjects.length})
  </TabsTrigger>
</TabsList>
```

4. Dodaj nowy TabsContent:
```tsx
{/* FAVORITES TAB */}
<TabsContent value="favorites" className="space-y-4 mt-4">
  <FavoriteProjectsSection
    favorites={favoriteProjects}
    title={`Ulubione Projekty — ${candidate.full_name}`}
    emptyMessage="Ten konsultant nie oznaczył jeszcze żadnych projektów jako ulubione."
    showRemoveButton={false}
    compact={false}
  />
</TabsContent>
```

---

## KROK 9: INTEGRACJA — DASHBOARD KONSULTANTA

W istniejącym pliku widoku Dashboard (np. `components/dashboard/DashboardMockup.tsx` lub `app/(protected)/dashboard/page.tsx`):

Dodaj mini-widget „Ulubione Projekty" jako szybki podgląd:

```tsx
import { getMyFavoriteProjects } from '@/lib/actions/favorites'
import { FavoriteProjectsSection } from '@/components/shared/FavoriteProjectsSection'

// W komponencie:
const [favorites, setFavorites] = useState<any[]>([])

useEffect(() => {
  getMyFavoriteProjects().then(setFavorites)
}, [])

// W renderze, dodaj widget:
<FavoriteProjectsSection
  favorites={favorites}
  title="⭐ Ulubione Projekty"
  maxItems={3}
  compact={true}
  showRemoveButton={false}
/>
```

---

## KROK 10: INTEGRACJA — ADMIN LISTA PROJEKTÓW

W widoku admina listy projektów (`components/admin/ProjectsListClient.tsx`), przy każdym projekcie pokaż ile osób go oznaczyło jako ulubiony.

Dodaj w getProjectMatches lub osobno:
```typescript
import { getProjectFavoriteCount } from '@/lib/actions/favorites'
```

W ProjectCard (widok admin), obok Match Score wyświetl:
```tsx
{favoriteCount > 0 && (
  <div className="flex items-center gap-1 text-xs text-yellow-400/70">
    <Star className="w-3 h-3 fill-yellow-400" />
    {favoriteCount} zainteresowanych
  </div>
)}
```

To daje adminowi/delivery leadowi cenną informację — który projekt generuje największe zainteresowanie konsultantów.

---

## KROK 11: AKTUALIZACJA CandidateProjectList.tsx

W istniejącym `components/admin/CandidateProjectList.tsx`, przy dopasowanych projektach pokaż czy konsultant je polubił:

```typescript
interface CandidateProjectListProps {
  matches: MatchedProject[]
  candidateId: string
  candidateName?: string
  favoriteProjectIds?: string[]  // NOWE
}
```

Przy każdym projekcie na liście:
```tsx
{favoriteProjectIds?.includes(project.id) && (
  <Badge className="bg-yellow-400/10 text-yellow-400 border-yellow-400/20 text-xs">
    ⭐ Ulubiony
  </Badge>
)}
```

---

## KROK 12: i18n — TŁUMACZENIA

**UWAGA:** Aplikacja używa TypeScript dictionary (NIE JSON message files).
Plik do edycji: `lib/i18n/dictionary.ts`

Dodaj nowe klucze do istniejącego obiektu `dictionary`:

```typescript
export const dictionary = {
    pl: {
        // ... istniejące klucze (dashboard, projects, profile, etc.) — NIE USUWAJ ICH ...
        dashboard: 'Dashboard',
        projects: 'Projekty',
        profile: 'Profil',
        documents: 'Dokumenty',
        more: 'Więcej',
        consultants: 'Konsultanci',
        reports: 'Raporty',
        settings: 'Ustawienia',
        logout: 'Wyloguj się',
        welcome: 'Witaj',
        panel: 'To jest Twój panel główny w aplikacji APK ComPass.',
        notifications: 'Powiadomienia',
        // NOWE — Favorites:
        favorites_title: 'Ulubione Projekty',
        favorites_add: 'Dodaj do ulubionych',
        favorites_remove: 'Usuń z ulubionych',
        favorites_in_favorites: 'W ulubionych',
        favorites_empty: 'Nie masz jeszcze ulubionych projektów',
        favorites_empty_consultant: 'Ten konsultant nie oznaczył jeszcze żadnych projektów jako ulubione',
        favorites_show_only: 'Tylko ulubione',
        favorites_interested_count: 'zainteresowanych',
        favorites_added_on: 'Dodano',
        favorites_note_placeholder: 'Dodaj notatkę...',
        favorites_your: 'Twoje Ulubione Projekty',
        favorites_see_all: 'Zobacz wszystkie',
    },
    en: {
        // ... istniejące klucze — NIE USUWAJ ICH ...
        dashboard: 'Dashboard',
        projects: 'Projects',
        profile: 'Profile',
        documents: 'Documents',
        more: 'More',
        consultants: 'Consultants',
        reports: 'Reports',
        settings: 'Settings',
        logout: 'Log out',
        welcome: 'Welcome',
        panel: 'This is your main dashboard in APK ComPass application.',
        notifications: 'Notifications',
        // NEW — Favorites:
        favorites_title: 'Favorite Projects',
        favorites_add: 'Add to favorites',
        favorites_remove: 'Remove from favorites',
        favorites_in_favorites: 'In favorites',
        favorites_empty: 'You don\'t have any favorite projects yet',
        favorites_empty_consultant: 'This consultant hasn\'t marked any favorite projects yet',
        favorites_show_only: 'Favorites only',
        favorites_interested_count: 'interested',
        favorites_added_on: 'Added',
        favorites_note_placeholder: 'Add a note...',
        favorites_your: 'Your Favorite Projects',
        favorites_see_all: 'See all',
    }
}
```

---

## PODSUMOWANIE — GDZIE POJAWIAJĄ SIĘ ULUBIONE

| Lokalizacja | Co widać | Kto widzi |
|---|---|---|
| **Marketplace / Lista Projektów** (`/projects`) | Gwiazdka ⭐ przy każdym projekcie + filtr "Tylko ulubione" | Konsultant |
| **Mój Profil** (`/profile`) | Sekcja "Twoje Ulubione Projekty" (max 5 z linkiem "zobacz wszystkie") | Konsultant |
| **Dashboard** (`/dashboard`) | Mini-widget z 3 najnowszymi ulubionymi (compact) | Konsultant |
| **Admin → Konsultant** (`/admin/candidates/[id]`) | Nowy tab "⭐ Ulubione" z pełną listą | Admin |
| **Admin → Projekty** (`/admin/projects`) | Badge "⭐ X zainteresowanych" przy każdym projekcie | Admin |
| **Admin → Konsultant → Projekty** (tab Projekty) | Badge "⭐ Ulubiony" przy dopasowanych projektach które konsultant oznaczył | Admin |

---

## SCENARIUSZE TESTOWE

### SMOKE TEST
1. Zaloguj się jako konsultant
2. Przejdź do /projects → kliknij gwiazdkę przy projekcie → gwiazdka zmienia kolor na żółty (fill)
3. Kliknij ponownie → gwiazdka wraca do szarego (unfill)
4. Oznacz 3 projekty → przejdź do /profile → sekcja "Ulubione Projekty" pokazuje 3 pozycje
5. Przejdź do /dashboard → mini-widget pokazuje 3 ulubione

### ADMIN VIEW
1. Zaloguj się jako admin
2. Przejdź do /admin/candidates/[id] → tab "⭐ Ulubione" → powinny być widoczne ulubione tego konsultanta
3. Przejdź do /admin/projects → przy popularnych projektach badge "⭐ X zainteresowanych"

### EDGE CASES
1. Usunięcie projektu → jego wpis w favorite_projects zniknie (CASCADE)
2. Usunięcie konta usera → jego ulubione znikną (CASCADE)
3. Dwukrotne kliknięcie gwiazdki szybko → nie tworzy duplikatów (UNIQUE constraint + optimistic UI)
4. Nowy user bez ulubionych → empty state z zachętą
5. Projekt bez description_pl → fallback na description

---

## DEPENDENCIES (MODUŁY KTÓRE MUSZĄ DZIAŁAĆ)

- ✅ Moduł Projects (tabela `projects`, typy, ProjectCard)
- ✅ Moduł Profile (strona /profile, ProfileMockup)
- ✅ Moduł Candidates (admin, strona /admin/candidates/[id])
- ✅ Supabase Auth (auth.uid())
- ✅ shadcn/ui: Button, Card, Badge, Tabs
- ✅ lucide-react: Star, Briefcase, MapPin, DollarSign, ExternalLink, StickyNote

---

## WAŻNE UWAGI IMPLEMENTACYJNE

1. **Katalog `components/shared/` NIE ISTNIEJE** — musisz go utworzyć przed stworzeniem FavoriteButton.tsx i FavoriteProjectsSection.tsx

2. **i18n korzysta z TypeScript dictionary** (plik `lib/i18n/dictionary.ts`) — NIE z plików JSON `/messages/pl.json`. W kodzie tłumaczenia używane są przez hook `useTranslation()` z `@/lib/i18n/context`:
   ```typescript
   import { useTranslation } from '@/lib/i18n/context'
   const { t } = useTranslation()
   // Użycie: t('favorites_title')
   ```

3. **Tabela `candidates` ma pole `user_id`** — potwierdzone w kodzie (`lib/actions/matching.ts`). To pole łączy zaimportowanego kandydata z kontem użytkownika (auth.users).

4. **Strona admin/candidates/[id]** — aktualnie ma 3 taby (Profil, CV, Projekty). Prompt dodaje 4. tab "Ulubione". Zmień `grid-cols-3` na `grid-cols-4` i `lg:w-[400px]` na `lg:w-[500px]`.

5. **Supabase Client** — do server actions importuj z `@/lib/supabase/server`, do komponentów client-side z `@/lib/supabase/client`.

6. **Istniejący ProjectCardProps** (w pliku `components/admin/ProjectCard.tsx`) ma następujące pola:
   ```typescript
   interface ProjectCardProps {
       project: Project
       isSelected: boolean
       onToggleSelect: (id: string) => void
       onDelete: (id: string) => void
       onUpdate: (updatedProject: Project) => void
       initialMatches?: ProjectMatch[]
   }
   ```
   Dodaj nowe pola (isFavorite, onFavoriteToggle, showFavoriteButton, favoriteCount) NIE USUWAJĄC istniejących.

7. **Nazewnictwo aplikacji**: Aplikacja nosi nazwę "APK ComPass" (nie "Qualrix") w aktualnej wersji UI — widoczne w Sidebar.tsx.
```

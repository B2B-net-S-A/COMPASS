# ComPass Animation System

System mikro-animacji dla ComPass. Pure CSS, zero JS runtime, GPU-accelerated.

---

## Quick Start — 3 zasady dla dewelopera

### 1. Toast — importuj z `@/lib/toast`

```tsx
// ✅ NOWY STANDARD — toast.success() automatycznie animowany
import { toast } from '@/lib/toast'

toast.success('Zapisano!')   // → animowany checkmark SVG
toast.error('Błąd')          // → standardowy sonner
toast.warning('Uwaga')       // → standardowy sonner
```

```tsx
// ⚠️ STARY IMPORT — działa, ale bez animacji success
import { toast } from 'sonner'
toast.success('Zapisano')  // → zwykły toast bez checkmark
```

### 2. Card Hover — dodaj prop `hoverable`

```tsx
// ✅ Nowa karta interaktywna
<Card hoverable>
  <CardContent>Kliknij mnie</CardContent>
</Card>

// ✅ Też działa — manual className
<Card className="card-hover">...</Card>

// ❌ Nie dodawaj hover do kart statycznych (formularze, sekcje z tekstem)
<Card>
  <CardContent>Formularz edycji</CardContent>
</Card>
```

**Kiedy używać `hoverable`?**
- Karty KPI / statystyki (Konsultanci, Projekty, Faktury)
- Widgety dashboard (Health Score, Contract Status, Loyalty)
- Karty z linkami / nawigacją
- Karty powiadomień

**Kiedy NIE używać?**
- Formularze i sekcje edycji
- Duże kontenery (Panel Administratora, Widok Centrali)
- Karty disabled / placeholder

### 3. Loading Skeleton — twórz `loading.tsx`

Każdy nowy route powinien mieć `loading.tsx` z shimmer skeleton.

```tsx
// app/(protected)/nowy-route/loading.tsx
import { CardShimmer, ListSkeleton } from '@/components/ui/shimmer-skeleton'

export default function Loading() {
    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <CardShimmer lines={4} />
            <ListSkeleton rows={5} />
        </div>
    )
}
```

**Dostępne komponenty skeleton:**

| Komponent | Użycie |
|---|---|
| `Shimmer` | Bazowy blok — prostokąt z shimmer wave |
| `WelcomeSkeleton` | Panel powitalny z avatarem |
| `StatCardSkeleton` | Karta KPI (liczba + opis) |
| `DashboardStatsSkeleton` | Grid 4 kart KPI |
| `CardShimmer` | Karta z konfigurowalnymi liniami tekstu |
| `ListSkeleton` | Lista z avatarami i akcjami |
| `ProjectsListSkeleton` | Grid kart projektów |
| `MessagesSkeleton` | Lista wiadomości |
| `NotificationsSkeleton` | Lista powiadomień |
| `AdminPanelSkeleton` | Panel admin z tabami |
| `DashboardSkeleton` | Pełny dashboard (welcome + stats + cards) |

**Catch-all:** Route'y BEZ własnego `loading.tsx` automatycznie używają
generycznego skeletonu z `app/(protected)/loading.tsx`.

---

## Architektura

```
globals.css                        ← CSS keyframes i utility classes
├── .card-hover                    ← translateY(-2px) scale(1.015) na hover
├── .shimmer-wave                  ← gradient sweep animation (1.2s)
├── .success-check-*               ← SVG stroke-draw animations

components/ui/card.tsx             ← prop `hoverable` → auto card-hover
components/ui/shimmer-skeleton.tsx ← library gotowych skeleton komponentów
components/ui/success-animation.tsx ← AnimatedCheckmark SVG component
lib/toast.tsx                      ← centralny moduł toast (auto-animated success)
lib/toast-success.tsx              ← backward compat re-export (@deprecated)
```

## Parametry animacji

| Animacja | Czas | Easing | GPU |
|---|---|---|---|
| Card hover | 180ms | cubic-bezier(0.4, 0, 0.2, 1) | ✅ will-change: transform |
| Shimmer wave | 1.2s | ease-in-out | ✅ transform: translateX |
| Check circle | 400ms | cubic-bezier(0.4, 0, 0.2, 1) | ✅ stroke-dashoffset |
| Check mark | 300ms | cubic-bezier(0.4, 0, 0.2, 1) | ✅ stroke-dashoffset |
| Check scale | 350ms | cubic-bezier(0.4, 0, 0.2, 1) | ✅ transform: scale |

Wszystkie animacje są **pure CSS** — zero framer-motion, zero JS runtime.

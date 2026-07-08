'use client'

// People Ops — cienkie klientowe wrappery wokół istniejących paneli kontraktorskich,
// które wymagają callbacku `onSaved`. Reużywamy 1:1 paneli z Kontraktorzy hub (Phase 33/38),
// dostarczając onSaved = router.refresh(). Zero duplikacji logiki.

import { useRouter } from 'next/navigation'
import { OnboardingEntriesPanel } from '@/components/internal/kontraktorzy/panels/OnboardingEntriesPanel'
import { ExitPanel } from '@/components/internal/kontraktorzy/panels/ExitPanel'
import type {
    OnboardingEntryItem,
    ExitDepartureItem,
    BenchItem,
} from '@/lib/types/contractor'

export function OnboardingEntriesSection({ entries }: { entries: OnboardingEntryItem[] }) {
    const router = useRouter()
    return <OnboardingEntriesPanel entries={entries} onSaved={() => router.refresh()} />
}

export function ExitSection({ bench, departures }: { bench: BenchItem[]; departures: ExitDepartureItem[] }) {
    const router = useRouter()
    return <ExitPanel bench={bench} departures={departures} onSaved={() => router.refresh()} />
}

'use client'

// Phase 17b R11 (PR-D follow-up) — toggle dla daily clock summary email.
// User-only preference, opt-out anytime. Default TRUE for internal/admin.

import { useState, useTransition } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { setMyClockSummaryEmailPreference } from '@/lib/actions/internal-clock'

interface Props {
    initialEnabled: boolean
}

export function ClockSummaryEmailToggle({ initialEnabled }: Props) {
    const [enabled, setEnabled] = useState(initialEnabled)
    const [pending, startTransition] = useTransition()

    const handleToggle = (next: boolean) => {
        const prev = enabled
        setEnabled(next) // optimistic
        startTransition(async () => {
            try {
                await setMyClockSummaryEmailPreference(next)
                toast.success(
                    next
                        ? 'Daily summary włączony — będziesz dostawać podsumowanie każdego ranka'
                        : 'Daily summary wyłączony',
                )
            } catch (e: unknown) {
                setEnabled(prev) // rollback
                toast.error(e instanceof Error ? e.message : 'Błąd zapisu preferencji')
            }
        })
    }

    return (
        <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
                <Label htmlFor="clock-summary-email" className="text-sm font-medium">
                    Daily summary email
                </Label>
                <p className="text-xs text-muted-foreground">
                    Otrzymuj codziennie rano (Mon-Fri) podsumowanie wczorajszego dnia pracy:
                    godziny, peak hour, pauzy. Dane prywatne — admin nie widzi.
                </p>
            </div>
            <Switch
                id="clock-summary-email"
                checked={enabled}
                onCheckedChange={handleToggle}
                disabled={pending}
            />
        </div>
    )
}

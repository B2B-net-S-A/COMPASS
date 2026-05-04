'use client'

import { QuickActionsGrid } from './QuickActionsGrid'
import { QuickAction } from '@/lib/types'

interface DashboardQuickActionsProps {
    actions: QuickAction[]
    locale: 'pl' | 'en'
}

// Phase 1.0 (2026-05-04): removed ReferralWizard integration (legacy ATS feature).
// Quick actions now route via QuickActionsGrid only — referral flow deleted.
export function DashboardQuickActions({ actions, locale }: DashboardQuickActionsProps) {
    return (
        <QuickActionsGrid actions={actions} locale={locale} />
    )
}

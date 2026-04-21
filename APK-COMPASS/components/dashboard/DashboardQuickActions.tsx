'use client'

import { useState } from 'react'
import { QuickActionsGrid } from './QuickActionsGrid'
import { ReferralWizard } from '@/components/referrals/ReferralWizard'
import { QuickAction } from '@/lib/types'

interface DashboardQuickActionsProps {
    actions: QuickAction[]
    locale: 'pl' | 'en'
}

export function DashboardQuickActions({ actions, locale }: DashboardQuickActionsProps) {
    const [isReferralOpen, setIsReferralOpen] = useState(false)

    const handleActionClick = (id: string) => {
        if (id === 'recommend_friend') {
            setIsReferralOpen(true)
        }
    }

    return (
        <>
            <QuickActionsGrid
                actions={actions}
                locale={locale}
                onActionClick={handleActionClick}
            />

            <ReferralWizard
                isOpen={isReferralOpen}
                onOpenChange={setIsReferralOpen}
            />
        </>
    )
}

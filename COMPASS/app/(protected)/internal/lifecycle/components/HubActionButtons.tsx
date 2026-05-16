'use client'

import { useState } from 'react'
import { LogOut, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StartOnboardingDialog } from './StartOnboardingDialog'
import { ScheduleExitDialog } from './ScheduleExitDialog'

export function HubActionButtons() {
    const [onboardingOpen, setOnboardingOpen] = useState(false)
    const [exitOpen, setExitOpen] = useState(false)

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setOnboardingOpen(true)} className="bg-cyan-500 hover:bg-cyan-600">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Nowy onboarding
                </Button>
                <Button onClick={() => setExitOpen(true)} variant="outline" className="border-amber-400/50 text-amber-400 hover:bg-amber-400/10">
                    <LogOut className="h-4 w-4 mr-2" />
                    Zaplanuj exit interview
                </Button>
            </div>

            <StartOnboardingDialog open={onboardingOpen} onOpenChange={setOnboardingOpen} />
            <ScheduleExitDialog open={exitOpen} onOpenChange={setExitOpen} />
        </>
    )
}

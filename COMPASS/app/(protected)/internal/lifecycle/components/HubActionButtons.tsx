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
                <Button onClick={() => setOnboardingOpen(true)} className="bg-primary hover:bg-primary/90">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Nowy onboarding
                </Button>
                <Button onClick={() => setExitOpen(true)} variant="outline" className="border-warning/50 text-warning hover:bg-warning/10">
                    <LogOut className="h-4 w-4 mr-2" />
                    Zaplanuj exit interview
                </Button>
            </div>

            <StartOnboardingDialog open={onboardingOpen} onOpenChange={setOnboardingOpen} />
            <ScheduleExitDialog open={exitOpen} onOpenChange={setExitOpen} />
        </>
    )
}

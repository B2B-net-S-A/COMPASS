'use client'

import { useState } from 'react'
import { UserCheck, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BuddyAssignmentDialog } from './BuddyAssignmentDialog'

interface Props {
    employeeId: string
    employeeName: string
    buddyId: string | null
    buddyName: string | null
    canEdit: boolean
}

export function BuddyCard({ employeeId, employeeName, buddyId, buddyName, canEdit }: Props) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <div className="rounded-lg border bg-card p-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="text-xs uppercase text-muted-foreground">Buddy</div>
                    <div className="font-medium truncate">{buddyName ?? '— (nie przypisany)'}</div>
                </div>
                {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
                        {buddyId ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                    </Button>
                )}
            </div>

            {canEdit && (
                <BuddyAssignmentDialog
                    open={open}
                    onOpenChange={setOpen}
                    employeeId={employeeId}
                    employeeName={employeeName}
                    currentBuddyId={buddyId}
                    currentBuddyName={buddyName}
                />
            )}
        </>
    )
}

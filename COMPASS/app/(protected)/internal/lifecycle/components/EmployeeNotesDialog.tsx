'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LifecycleNotesPanel } from './LifecycleNotesPanel'
import type { EligibleEmployee } from '@/lib/actions/lifecycle'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    employee: EligibleEmployee
}

export function EmployeeNotesDialog({ open, onOpenChange, employee }: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Notatki TCM</DialogTitle>
                    <DialogDescription>
                        Pracownik: <strong>{employee.full_name ?? employee.email}</strong>
                        {employee.is_external && (
                            <span className="ml-2 inline-block px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs">
                                external
                            </span>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <LifecycleNotesPanel userId={employee.id} defaultCategory="general" />
            </DialogContent>
        </Dialog>
    )
}

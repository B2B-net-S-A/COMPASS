// „Ludzie w NEXUSIE” — baner na ekranach przeniesionego modułu.
//
// Komponent SERWEROWY: przełącznik to zmienna runtime (`HR_MOVED_TO_NEXUS`), której
// przeglądarka nie widzi. Wstawiony do komponentu klienckiego nigdy by się nie pokazał.
// Moduł spoza listy = nic nie renderuje, więc ekran wygląda jak dotąd.

import { ArrowUpRight, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    HR_MODULE_LABELS,
    isMovedToNexus,
    nexusModuleUrl,
    type HrModule,
} from '@/lib/hr/moved-to-nexus'

export function MovedToNexusBanner({ module, className }: { module: HrModule; className?: string }) {
    if (!isMovedToNexus(module)) return null
    const href = nexusModuleUrl(module)

    return (
        <div
            role="status"
            data-testid={`moved-to-nexus-${module}`}
            className={cn('rounded-lg border border-info/30 bg-info/5 p-4 text-sm', className)}
        >
            <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
                <div className="space-y-1">
                    <p className="font-medium text-foreground">Ten moduł działa teraz w NEXUSIE</p>
                    <p className="text-muted-foreground">
                        {HR_MODULE_LABELS[module]}: dane w Compassie zostały jako archiwum tylko do odczytu.
                        Nowe wnioski, zmiany i decyzje wprowadzaj w NEXUSIE.
                    </p>
                    {href && (
                        <a
                            href={href}
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                            Otwórz w NEXUSIE
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                    )}
                </div>
            </div>
        </div>
    )
}

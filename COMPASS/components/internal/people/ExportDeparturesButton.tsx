'use client'

import { useTransition } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { exportDeparturesCsv, type DepartureAnalyticsInput } from '@/lib/actions/contractors'

/** Eksport zejść z aktualnym filtrem widoku. BOM na początku pliku, żeby Excel wziął UTF-8. */
export function ExportDeparturesButton({ filters }: { filters: DepartureAnalyticsInput }) {
    const [isPending, startTransition] = useTransition()

    function handleExport() {
        startTransition(async () => {
            try {
                const csv = await exportDeparturesCsv(filters)
                const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `zejscia-${new Date().toISOString().split('T')[0]}.csv`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
                toastSuccess('Eksport gotowy — sprawdź pobrany plik.')
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd eksportu.')
            }
        })
    }

    return (
        <Button variant="outline" size="sm" onClick={handleExport} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export CSV
        </Button>
    )
}

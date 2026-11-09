'use client'

import { useState, useTransition } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { exportEditionReportCsv } from '@/lib/actions/academy-edition-report'

export function EditionReportCsvButton({ runId }: { runId: string }) {
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useTransition()
    function exportCsv() {
        setError(null)
        start(async () => {
            try {
                const result = await exportEditionReportCsv(runId)
                if (!result?.success) { setError(result?.error ?? 'Nie udało się przygotować eksportu. Odśwież stronę i spróbuj ponownie.'); return }
                const url = URL.createObjectURL(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }))
                const link = document.createElement('a')
                link.href = url
                link.download = result.data.filename
                link.click()
                URL.revokeObjectURL(url)
            } catch {
                setError('Nie udało się przygotować eksportu. Odśwież stronę i spróbuj ponownie.')
            }
        })
    }
    return <div className="flex flex-col items-start gap-1 sm:items-end">
        <Button type="button" onClick={exportCsv} disabled={pending}><Download aria-hidden="true" />{pending ? 'Przygotowuję…' : 'Eksportuj CSV'}</Button>
        <span className="text-xs text-muted-foreground">wpis w dzienniku audytu</span>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
}

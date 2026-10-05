'use client'

import { Button } from '@/components/ui/button'

export function EditionSummaryDownload({ text, runId }: { text: string; runId: string }) {
    function download() {
        const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url
        link.download = `podsumowanie-szkolenia-${runId}.txt`
        link.click()
        URL.revokeObjectURL(url)
    }
    return <Button type="button" variant="outline" onClick={download}>Pobierz podsumowanie (.txt)</Button>
}

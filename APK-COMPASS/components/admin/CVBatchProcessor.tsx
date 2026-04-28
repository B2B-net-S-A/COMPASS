'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useRouter } from 'next/navigation'

interface BatchResult {
    processed: number
    succeeded: number
    failed: number
    errors?: Array<{ id: string; error: string }>
}

/**
 * Admin button — triggers POST /api/admin/process-cv-batch.
 * Useful when CVs were uploaded via storage but not yet parsed/embedded.
 *
 * The endpoint processes up to BATCH_SIZE (default 10) candidates per call,
 * extracting structured data via Claude + generating embeddings via Voyage AI.
 *
 * UX:
 *   - Confirms before triggering (this calls real Anthropic + Voyage APIs — costs money)
 *   - Shows progress + result counts
 *   - Calls router.refresh() on success to reflect parsed candidates in the list
 */
export function CVBatchProcessor() {
    const [isOpen, setIsOpen] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [result, setResult] = useState<BatchResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    const handleProcess = async () => {
        setIsProcessing(true)
        setError(null)
        setResult(null)
        try {
            const response = await fetch('/api/admin/process-cv-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            })
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`)
            }
            const data = await response.json() as BatchResult
            setResult(data)
            if (data.succeeded > 0) {
                router.refresh()
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Nieznany błąd'
            setError(msg)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleClose = () => {
        if (isProcessing) return
        setIsOpen(false)
        setResult(null)
        setError(null)
    }

    return (
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
            <AlertDialogTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="bg-background/50 backdrop-blur-sm border-white/10 text-white hover:border-foreground/40"
                    data-testid="cv-batch-processor-trigger"
                >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Przetwórz CV w batch&apos;u
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#1a1a2e] border-white/10 text-white">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Przetwarzanie CV w batch&apos;u</AlertDialogTitle>
                    <AlertDialogDescription className="text-gray-400">
                        {!result && !error && !isProcessing && (
                            <>Endpoint przetworzy do 10 niezparsowanych CV-ek w jednej operacji. Każdy plik:
                                <ul className="list-disc list-inside mt-2 space-y-1 text-xs">
                                    <li>Zostanie sparsowany (PDF / DOCX)</li>
                                    <li>Dane wyekstraktowane przez Claude (skills, experience, bio)</li>
                                    <li>Wygenerowany embedding przez Voyage AI</li>
                                </ul>
                                <p className="mt-3 text-yellow-400 text-xs">⚠️ Wywołanie używa realnych API (Anthropic + Voyage) — wiąże się z kosztami.</p>
                            </>
                        )}
                        {isProcessing && <span className="text-foreground">Przetwarzanie w toku — proszę nie zamykać tego okna...</span>}
                        {result && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-green-400">
                                    <CheckCircle2 className="w-5 h-5" />
                                    <span>Przetworzono {result.processed} CV-ek ({result.succeeded} sukcesów, {result.failed} błędów)</span>
                                </div>
                                {result.errors && result.errors.length > 0 && (
                                    <div className="mt-2 text-xs text-red-300 max-h-40 overflow-y-auto">
                                        <p className="font-semibold">Błędy:</p>
                                        <ul className="list-disc list-inside">
                                            {result.errors.slice(0, 10).map((err, i) => (
                                                <li key={i}>{err.id}: {err.error}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                        {error && (
                            <div className="flex items-center gap-2 text-red-400">
                                <XCircle className="w-5 h-5" />
                                <span>{error}</span>
                            </div>
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    {!result && !error && (
                        <>
                            <AlertDialogCancel
                                onClick={handleClose}
                                disabled={isProcessing}
                                className="border-white/20 text-gray-300 hover:bg-white/5 hover:text-white bg-transparent"
                            >
                                Anuluj
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleProcess}
                                disabled={isProcessing}
                                className="bg-primary hover:bg-primary/90 text-white"
                            >
                                {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Przetwarzam...</> : 'Uruchom batch'}
                            </AlertDialogAction>
                        </>
                    )}
                    {(result || error) && (
                        <AlertDialogAction
                            onClick={handleClose}
                            className="bg-primary hover:bg-primary/90 text-white"
                        >
                            Zamknij
                        </AlertDialogAction>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

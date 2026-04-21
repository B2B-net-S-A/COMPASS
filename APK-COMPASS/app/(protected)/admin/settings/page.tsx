'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cleanDuplicateCandidates } from '@/lib/actions/maintenance'
import { Trash2, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { useConfirm } from '@/components/shared/ConfirmDialog'

export default function AdminSettingsPage() {
    const [cleaning, setCleaning] = useState(false)
    const [result, setResult] = useState<{ count: number, message: string } | null>(null)
    const [confirm, ConfirmUI] = useConfirm()

    const handleCleanup = async () => {
        const ok = await confirm({
            title: 'Czyszczenie duplikatów',
            description: 'Czy na pewno chcesz usunąć zduplikowanych kandydatów? Ta operacja jest nieodwracalna.',
            confirmLabel: 'Usuń duplikaty',
            variant: 'destructive',
        })
        if (!ok) return

        setCleaning(true)
        setResult(null)

        try {
            const res = await cleanDuplicateCandidates()
            setResult(res)
        } catch (error) {
            console.error(error)
            setResult({ count: 0, message: `Błąd krytyczny: ${(error as Error).message}` })
        } finally {
            setCleaning(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h3 className="text-lg font-medium">Konserwacja Systemu</h3>
                <p className="text-sm text-muted-foreground">
                    Narzędzia administracyjne do zarządzania systemem.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-card border-white/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-400">
                            <Trash2 className="w-5 h-5" />
                            Czyszczenie Duplikatów
                        </CardTitle>
                        <CardDescription>
                            Automatycznie scala zduplikowane konta (po emailu).
                            Zachowuje najstarszy profil, ale aktualizuje go o najnowsze dane: umiejętności, certyfikaty, doświadczenie (bio) i nowe CV.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg text-sm text-red-300">
                            ⚠️ Uwaga: Ta operacja usunie trwale nadmiarowe rekordy z bazy danych.
                        </div>

                        <Button
                            variant="destructive"
                            onClick={handleCleanup}
                            disabled={cleaning}
                            className="w-full"
                        >
                            {cleaning ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Czyszczenie...
                                </>
                            ) : (
                                'Uruchom Czyszczenie'
                            )}
                        </Button>

                        {result && (
                            <div className={`flex items-center gap-2 text-sm p-2 rounded ${result.count > 0 ? 'text-green-400 bg-green-500/10' : 'text-gray-400 bg-secondary/20'}`}>
                                {result.count > 0 ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                {result.message}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <ConfirmUI />
        </div>
    )
}

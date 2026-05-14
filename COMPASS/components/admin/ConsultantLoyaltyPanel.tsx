'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Download, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { MyPointsTab } from '@/components/dashboard/loyalty/MyPointsTab'
import { addLoyaltyPoints, exportLoyaltyCsv } from '@/lib/actions/loyalty'

interface Props {
    consultantId: string
    consultantName: string
}

const QUICK_ACTIONS = [
    { label: 'Ambasador +200', sourceType: 'role_ambassador', points: 200, desc: 'Rola Compass: Ambasador' },
    { label: 'Weryfikator +100', sourceType: 'role_verifier', points: 100, desc: 'Rola Compass: Weryfikator' },
    { label: 'Sprzedaż +300', sourceType: 'role_sales', points: 300, desc: 'Rola Compass: Wsparcie Sprzedaży' },
]

export function ConsultantLoyaltyPanel({ consultantId, consultantName }: Props) {
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [exporting, setExporting] = useState(false)
    const [addingPoints, setAddingPoints] = useState(false)
    const [customPoints, setCustomPoints] = useState('')
    const [customDesc, setCustomDesc] = useState('')

    const handleExport = async () => {
        setExporting(true)
        try {
            const result = await exportLoyaltyCsv(
                consultantId,
                dateFrom || undefined,
                dateTo || undefined,
            )
            if (result.success && result.csv) {
                const blob = new Blob(['\uFEFF' + result.csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `loyalty_${consultantName.replace(/\s+/g, '_')}_${dateFrom || 'all'}_${dateTo || 'now'}.csv`
                a.click()
                URL.revokeObjectURL(url)
                toast.success('Eksport CSV gotowy')
            } else {
                toast.error(result.error || 'Błąd eksportu')
            }
        } catch {
            toast.error('Błąd podczas eksportu')
        } finally {
            setExporting(false)
        }
    }

    const handleQuickAdd = async (sourceType: string, points: number, desc: string) => {
        setAddingPoints(true)
        try {
            const result = await addLoyaltyPoints(consultantId, points, sourceType, desc)
            if (result.success) {
                toast.success(`Dodano ${points} pkt: ${desc}`)
                window.location.reload()
            } else {
                toast.error(result.error || 'Błąd')
            }
        } catch {
            toast.error('Błąd dodawania punktów')
        } finally {
            setAddingPoints(false)
        }
    }

    const handleCustomAdd = async () => {
        const pts = parseInt(customPoints)
        if (!pts || !customDesc.trim()) {
            toast.error('Podaj punkty i opis')
            return
        }
        setAddingPoints(true)
        try {
            const result = await addLoyaltyPoints(consultantId, pts, 'manual_bonus', customDesc.trim())
            if (result.success) {
                toast.success(`Dodano ${pts} pkt`)
                setCustomPoints('')
                setCustomDesc('')
                window.location.reload()
            } else {
                toast.error(result.error || 'Błąd')
            }
        } catch {
            toast.error('Błąd dodawania punktów')
        } finally {
            setAddingPoints(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Admin Actions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Akcje Centrali</CardTitle>
                    <CardDescription>Zarządzaj punktami konsultanta {consultantName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Quick Add Buttons */}
                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Szybkie naliczenie</p>
                        <div className="flex flex-wrap gap-2">
                            {QUICK_ACTIONS.map(action => (
                                <Button
                                    key={action.sourceType}
                                    variant="outline"
                                    size="sm"
                                    disabled={addingPoints}
                                    onClick={() => handleQuickAdd(action.sourceType, action.points, action.desc)}
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    {action.label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Custom Add */}
                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Dodaj ręcznie</p>
                        <div className="flex gap-2">
                            <Input
                                type="number"
                                placeholder="Punkty"
                                value={customPoints}
                                onChange={e => setCustomPoints(e.target.value)}
                                className="w-24"
                            />
                            <Input
                                placeholder="Opis (np. Bonus za projekt X)"
                                value={customDesc}
                                onChange={e => setCustomDesc(e.target.value)}
                                className="flex-1"
                            />
                            <Button onClick={handleCustomAdd} disabled={addingPoints} size="default">
                                {addingPoints ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>

                    {/* Export CSV */}
                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Eksport CSV</p>
                        <div className="flex gap-2 items-end">
                            <div>
                                <label className="text-xs text-muted-foreground">Od</label>
                                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground">Do</label>
                                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
                            </div>
                            <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-1">
                                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                Eksportuj
                            </Button>
                            {!dateFrom && !dateTo && (
                                <Badge variant="secondary" className="text-[10px]">Cała historia</Badge>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Reuse MyPointsTab in "centrala" mode */}
            <MyPointsTab targetUserId={consultantId} showUnearned={false} />
        </div>
    )
}

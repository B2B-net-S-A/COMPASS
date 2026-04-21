'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    FileText, Save, Plus, Trash2, GripVertical, Coins,
    ArrowUp, ArrowDown, Loader2, CheckCircle2, AlertCircle
} from 'lucide-react'
import {
    type ReferralSettings,
    type ReferralRewardTier,
    type ReferralRewardAction,
    getReferralSettings,
    saveReferralRules,
    saveReferralRewardTiers,
    saveReferralRewardActions,
} from '@/lib/actions/referral-settings'

export function ReferralSettingsEditor() {
    const [settings, setSettings] = useState<ReferralSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState<string | null>(null)
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    // Editable state
    const [rules, setRules] = useState('')
    const [effectiveDate, setEffectiveDate] = useState('')
    const [contactEmail, setContactEmail] = useState('')
    const [tiers, setTiers] = useState<ReferralRewardTier[]>([])
    const [actions, setActions] = useState<ReferralRewardAction[]>([])

    useEffect(() => {
        loadSettings()
    }, [])

    async function loadSettings() {
        try {
            const data = await getReferralSettings()
            setSettings(data)
            setRules(data.rules)
            setEffectiveDate(data.rulesEffectiveDate)
            setContactEmail(data.rulesContactEmail)
            setTiers(data.rewardTiers)
            setActions(data.rewardActions)
        } catch (e) {
            console.error('Failed to load referral settings:', e)
        } finally {
            setLoading(false)
        }
    }

    function showStatus(type: 'success' | 'error', message: string) {
        setStatus({ type, message })
        setTimeout(() => setStatus(null), 3000)
    }

    // ---- Rules handlers ----
    async function handleSaveRules() {
        setSaving('rules')
        try {
            await saveReferralRules(rules, effectiveDate, contactEmail)
            showStatus('success', 'Regulamin zapisany')
        } catch (e: any) {
            showStatus('error', e.message || 'Błąd zapisu')
        } finally {
            setSaving(null)
        }
    }

    // ---- Tiers handlers ----
    function updateTier(id: string, field: keyof ReferralRewardTier, value: string | number) {
        setTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
    }

    function addTier() {
        const newId = String(Date.now())
        setTiers(prev => [...prev, { id: newId, level: '', description: '', bonusAmount: 0, loyaltyPoints: 0 }])
    }

    function removeTier(id: string) {
        setTiers(prev => prev.filter(t => t.id !== id))
    }

    async function handleSaveTiers() {
        setSaving('tiers')
        try {
            await saveReferralRewardTiers(tiers)
            showStatus('success', 'Tabela bonusów zapisana')
        } catch (e: any) {
            showStatus('error', e.message || 'Błąd zapisu')
        } finally {
            setSaving(null)
        }
    }

    // ---- Actions handlers ----
    function updateAction(id: string, field: keyof ReferralRewardAction, value: string | number) {
        setActions(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))
    }

    function addAction() {
        const newId = String(Date.now())
        const maxOrder = actions.reduce((max, a) => Math.max(max, a.order), 0)
        setActions(prev => [...prev, { id: newId, action: '', description: '', points: '0 pkt', order: maxOrder + 1 }])
    }

    function removeAction(id: string) {
        setActions(prev => prev.filter(a => a.id !== id))
    }

    function moveAction(id: string, direction: 'up' | 'down') {
        setActions(prev => {
            const sorted = [...prev].sort((a, b) => a.order - b.order)
            const idx = sorted.findIndex(a => a.id === id)
            if (direction === 'up' && idx > 0) {
                const temp = sorted[idx].order
                sorted[idx].order = sorted[idx - 1].order
                sorted[idx - 1].order = temp
            } else if (direction === 'down' && idx < sorted.length - 1) {
                const temp = sorted[idx].order
                sorted[idx].order = sorted[idx + 1].order
                sorted[idx + 1].order = temp
            }
            return sorted.sort((a, b) => a.order - b.order)
        })
    }

    async function handleSaveActions() {
        setSaving('actions')
        try {
            await saveReferralRewardActions(actions)
            showStatus('success', 'Zasady i nagrody zapisane')
        } catch (e: any) {
            showStatus('error', e.message || 'Błąd zapisu')
        } finally {
            setSaving(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Status banner */}
            {status && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${status.type === 'success' ? 'bg-primary/10 border border-primary/20 text-primary' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                    {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {status.message}
                </div>
            )}

            <Tabs defaultValue="rules" className="w-full">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:w-[500px]">
                    <TabsTrigger value="rules">Regulamin</TabsTrigger>
                    <TabsTrigger value="tiers">Tabela Bonusów</TabsTrigger>
                    <TabsTrigger value="actions">Zasady i Nagrody</TabsTrigger>
                </TabsList>

                {/* ======== TAB: REGULAMIN ======== */}
                <TabsContent value="rules" className="mt-6">
                    <Card className="bg-white/5 border-white/10">
                        <CardHeader className="border-b border-white/5">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <FileText className="w-4 h-4 text-foreground" />
                                Regulamin Programu Rekomendacji
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Data wejścia w życie</label>
                                    <Input
                                        type="date"
                                        value={effectiveDate}
                                        onChange={e => setEffectiveDate(e.target.value)}
                                        className="bg-black/20 border-white/10"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Email kontaktowy</label>
                                    <Input
                                        type="email"
                                        value={contactEmail}
                                        onChange={e => setContactEmail(e.target.value)}
                                        className="bg-black/20 border-white/10"
                                        placeholder="rekrutacja@b2bnetwork.pl"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                                    Treść regulaminu
                                    <span className="text-muted-foreground/50 ml-2">(paragraf po paragrafie, użyj §X jako nagłówka sekcji)</span>
                                </label>
                                <textarea
                                    value={rules}
                                    onChange={e => setRules(e.target.value)}
                                    rows={20}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-4 text-sm text-slate-200 resize-y focus:outline-none focus:ring-2 focus:ring-burgundy/50 font-mono leading-relaxed"
                                    placeholder="§1 Postanowienia ogólne&#10;1. Program Rekomendacji..."
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    {rules.length} znaków • Linie zaczynające się od §X będą wyświetlane jako nagłówki sekcji
                                </p>
                            </div>

                            <div className="flex justify-end">
                                <Button
                                    onClick={handleSaveRules}
                                    disabled={saving === 'rules'}
                                    className="bg-burgundy hover:bg-burgundy gap-2"
                                >
                                    {saving === 'rules' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Zapisz regulamin
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ======== TAB: TABELA BONUSÓW ======== */}
                <TabsContent value="tiers" className="mt-6">
                    <Card className="bg-white/5 border-white/10">
                        <CardHeader className="border-b border-white/5">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Coins className="w-4 h-4 text-primary" />
                                Tabela bonusów za rekomendację
                                <Badge variant="outline" className="ml-auto text-xs">{tiers.length} poziomów</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="rounded-lg border border-white/10 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
                                            <th className="text-left p-3 font-semibold">Poziom</th>
                                            <th className="text-left p-3 font-semibold">Opis</th>
                                            <th className="text-right p-3 font-semibold">Bonus (PLN)</th>
                                            <th className="text-right p-3 font-semibold">Punkty</th>
                                            <th className="w-10 p-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tiers.map(tier => (
                                            <tr key={tier.id} className="border-t border-white/5">
                                                <td className="p-2">
                                                    <Input
                                                        value={tier.level}
                                                        onChange={e => updateTier(tier.id, 'level', e.target.value)}
                                                        className="bg-black/20 border-white/10 h-9 text-sm"
                                                        placeholder="np. Junior"
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <Input
                                                        value={tier.description}
                                                        onChange={e => updateTier(tier.id, 'description', e.target.value)}
                                                        className="bg-black/20 border-white/10 h-9 text-sm"
                                                        placeholder="np. 0-2 lata"
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <Input
                                                        type="number"
                                                        value={tier.bonusAmount}
                                                        onChange={e => updateTier(tier.id, 'bonusAmount', Number(e.target.value))}
                                                        className="bg-black/20 border-white/10 h-9 text-sm text-right"
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <Input
                                                        type="number"
                                                        value={tier.loyaltyPoints}
                                                        onChange={e => updateTier(tier.id, 'loyaltyPoints', Number(e.target.value))}
                                                        className="bg-black/20 border-white/10 h-9 text-sm text-right"
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <Button variant="ghost" size="sm" onClick={() => removeTier(tier.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-between">
                                <Button variant="outline" size="sm" onClick={addTier} className="gap-2 border-white/10 hover:bg-white/5">
                                    <Plus className="w-4 h-4" /> Dodaj poziom
                                </Button>
                                <Button
                                    onClick={handleSaveTiers}
                                    disabled={saving === 'tiers'}
                                    className="bg-burgundy hover:bg-burgundy gap-2"
                                >
                                    {saving === 'tiers' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Zapisz tabelę bonusów
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ======== TAB: ZASADY I NAGRODY ======== */}
                <TabsContent value="actions" className="mt-6">
                    <Card className="bg-white/5 border-white/10">
                        <CardHeader className="border-b border-white/5">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <GripVertical className="w-4 h-4 text-yellow-400" />
                                Zasady i Nagrody — kroki wyświetlane konsultantom
                                <Badge variant="outline" className="ml-auto text-xs">{actions.length} kroków</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-3">
                            {actions.sort((a, b) => a.order - b.order).map((action, idx) => (
                                <div key={action.id} className="flex items-start gap-3 p-4 rounded-lg bg-black/20 border border-white/5">
                                    <div className="flex flex-col gap-1 mt-1">
                                        <Button variant="ghost" size="sm" onClick={() => moveAction(action.id, 'up')} disabled={idx === 0} className="h-6 w-6 p-0 text-muted-foreground hover:text-white">
                                            <ArrowUp className="w-3 h-3" />
                                        </Button>
                                        <div className="h-6 w-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-xs">
                                            {idx + 1}
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => moveAction(action.id, 'down')} disabled={idx === actions.length - 1} className="h-6 w-6 p-0 text-muted-foreground hover:text-white">
                                            <ArrowDown className="w-3 h-3" />
                                        </Button>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="flex gap-2">
                                            <Input
                                                value={action.action}
                                                onChange={e => updateAction(action.id, 'action', e.target.value)}
                                                className="bg-black/30 border-white/10 h-9 text-sm font-medium"
                                                placeholder="Nazwa kroku"
                                            />
                                            <Input
                                                value={action.points}
                                                onChange={e => updateAction(action.id, 'points', e.target.value)}
                                                className="bg-black/30 border-white/10 h-9 text-sm w-40 text-right"
                                                placeholder="np. 25 pkt"
                                            />
                                        </div>
                                        <Input
                                            value={action.description}
                                            onChange={e => updateAction(action.id, 'description', e.target.value)}
                                            className="bg-black/30 border-white/10 h-9 text-sm text-muted-foreground"
                                            placeholder="Opis kroku widoczny dla konsultanta"
                                        />
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => removeAction(action.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0 mt-1">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            ))}

                            <div className="flex justify-between pt-2">
                                <Button variant="outline" size="sm" onClick={addAction} className="gap-2 border-white/10 hover:bg-white/5">
                                    <Plus className="w-4 h-4" /> Dodaj krok
                                </Button>
                                <Button
                                    onClick={handleSaveActions}
                                    disabled={saving === 'actions'}
                                    className="bg-yellow-600 hover:bg-yellow-700 gap-2"
                                >
                                    {saving === 'actions' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Zapisz zasady i nagrody
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

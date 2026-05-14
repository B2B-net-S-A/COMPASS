'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MapPin, Briefcase, DollarSign, Building2, Clock, Save } from "lucide-react"
import { toast } from "sonner"

interface WorkPreferences {
    preferred_locations: string[]
    work_mode: 'remote' | 'hybrid' | 'onsite' | 'flexible' | ''
    min_rate: number | null
    max_rate: number | null
    preferred_industries: string[]
    notice_period: string
    preferred_contract_type: 'b2b' | 'uop' | 'both' | ''
}

const WORK_MODES = [
    { value: 'remote', label: 'Zdalnie' },
    { value: 'hybrid', label: 'Hybrydowo' },
    { value: 'onsite', label: 'Stacjonarnie' },
    { value: 'flexible', label: 'Elastycznie' },
]

const INDUSTRIES = [
    'Bankowość', 'Fintech', 'E-commerce', 'Healthcare', 'Telekomunikacja',
    'Automotive', 'Logistyka', 'Ubezpieczenia', 'Energia', 'Retail', 'IT/Software', 'Inne'
]

const LOCATIONS = [
    'Warszawa', 'Kraków', 'Wrocław', 'Gdańsk', 'Poznań', 'Łódź',
    'Katowice', 'Szczecin', 'Remote (EU)', 'Remote (PL)'
]

interface WorkPreferencesSectionProps {
    preferences: WorkPreferences
    onSave: (prefs: WorkPreferences) => Promise<void>
    readOnly?: boolean
}

export type { WorkPreferences }

export function WorkPreferencesSection({ preferences: initial, onSave, readOnly = false }: WorkPreferencesSectionProps) {
    const [prefs, setPrefs] = useState<WorkPreferences>({
        preferred_locations: initial?.preferred_locations || [],
        work_mode: initial?.work_mode || '',
        min_rate: initial?.min_rate ?? null,
        max_rate: initial?.max_rate ?? null,
        preferred_industries: initial?.preferred_industries || [],
        notice_period: initial?.notice_period || '',
        preferred_contract_type: initial?.preferred_contract_type || '',
    })
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)

    const update = (partial: Partial<WorkPreferences>) => {
        setPrefs(prev => ({ ...prev, ...partial }))
        setDirty(true)
    }

    const toggleArrayItem = (field: 'preferred_locations' | 'preferred_industries', value: string) => {
        const current = prefs[field]
        const updated = current.includes(value)
            ? current.filter(v => v !== value)
            : [...current, value]
        update({ [field]: updated })
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await onSave(prefs)
            setDirty(false)
            toast.success('Preferencje zapisane')
        } catch {
            toast.error('Nie udało się zapisać preferencji')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Briefcase className="h-5 w-5 text-primary" />
                        Preferencje pracy
                    </CardTitle>
                    {!readOnly && dirty && (
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                            <Save className="h-4 w-4 mr-1" />
                            {saving ? 'Zapisuję...' : 'Zapisz'}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                {/* Work mode */}
                <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" /> Tryb pracy
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {WORK_MODES.map(mode => (
                            <Badge
                                key={mode.value}
                                variant="outline"
                                className={`cursor-pointer transition-all ${
                                    prefs.work_mode === mode.value
                                        ? 'bg-primary/20 text-primary border-primary/40'
                                        : 'hover:bg-white/5'
                                } ${readOnly ? 'pointer-events-none' : ''}`}
                                onClick={() => !readOnly && update({ work_mode: mode.value as WorkPreferences['work_mode'] })}
                            >
                                {mode.label}
                            </Badge>
                        ))}
                    </div>
                </div>

                {/* Preferred locations */}
                <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> Preferowane lokalizacje
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {LOCATIONS.map(loc => (
                            <Badge
                                key={loc}
                                variant="outline"
                                className={`cursor-pointer text-xs transition-all ${
                                    prefs.preferred_locations.includes(loc)
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                        : 'opacity-50 hover:opacity-100'
                                } ${readOnly ? 'pointer-events-none' : ''}`}
                                onClick={() => !readOnly && toggleArrayItem('preferred_locations', loc)}
                            >
                                {loc}
                            </Badge>
                        ))}
                    </div>
                </div>

                {/* Rate range */}
                <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5" /> Oczekiwana stawka (PLN/h netto)
                    </p>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            placeholder="Od"
                            value={prefs.min_rate ?? ''}
                            onChange={e => update({ min_rate: e.target.value ? Number(e.target.value) : null })}
                            className="w-24 bg-transparent border border-white/10 rounded-md px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground"
                            disabled={readOnly}
                        />
                        <span className="text-muted-foreground">—</span>
                        <input
                            type="number"
                            placeholder="Do"
                            value={prefs.max_rate ?? ''}
                            onChange={e => update({ max_rate: e.target.value ? Number(e.target.value) : null })}
                            className="w-24 bg-transparent border border-white/10 rounded-md px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground"
                            disabled={readOnly}
                        />
                        <span className="text-xs text-muted-foreground">PLN/h</span>
                    </div>
                </div>

                {/* Preferred industries */}
                <div>
                    <p className="text-xs text-muted-foreground mb-2">Preferowane branże</p>
                    <div className="flex flex-wrap gap-1.5">
                        {INDUSTRIES.map(ind => (
                            <Badge
                                key={ind}
                                variant="outline"
                                className={`cursor-pointer text-xs transition-all ${
                                    prefs.preferred_industries.includes(ind)
                                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                        : 'opacity-50 hover:opacity-100'
                                } ${readOnly ? 'pointer-events-none' : ''}`}
                                onClick={() => !readOnly && toggleArrayItem('preferred_industries', ind)}
                            >
                                {ind}
                            </Badge>
                        ))}
                    </div>
                </div>

                {/* Notice period */}
                <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> Okres wypowiedzenia
                    </p>
                    <select
                        value={prefs.notice_period}
                        onChange={e => update({ notice_period: e.target.value })}
                        className="bg-card border border-white/10 rounded-md px-3 py-1.5 text-sm text-white"
                        disabled={readOnly}
                    >
                        <option value="">Nie określono</option>
                        <option value="immediately">Natychmiast</option>
                        <option value="1_week">1 tydzień</option>
                        <option value="2_weeks">2 tygodnie</option>
                        <option value="1_month">1 miesiąc</option>
                        <option value="2_months">2 miesiące</option>
                        <option value="3_months">3 miesiące</option>
                    </select>
                </div>

                {/* Contract type */}
                <div>
                    <p className="text-xs text-muted-foreground mb-2">Preferowana forma współpracy</p>
                    <div className="flex gap-2">
                        {[
                            { value: 'b2b', label: 'B2B' },
                            { value: 'uop', label: 'UoP' },
                            { value: 'both', label: 'Obie formy' },
                        ].map(opt => (
                            <Badge
                                key={opt.value}
                                variant="outline"
                                className={`cursor-pointer transition-all ${
                                    prefs.preferred_contract_type === opt.value
                                        ? 'bg-primary/20 text-primary border-primary/40'
                                        : 'hover:bg-white/5'
                                } ${readOnly ? 'pointer-events-none' : ''}`}
                                onClick={() => !readOnly && update({ preferred_contract_type: opt.value as WorkPreferences['preferred_contract_type'] })}
                            >
                                {opt.label}
                            </Badge>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Save, ShieldCheck, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import {
    type PermissionsMap,
    type PermissionRole,
    type PermissionFeature,
    type PermissionValue,
    type PermissionUpdate,
} from '@/lib/types/permissions'
import { updatePermissions } from '@/lib/actions/permissions'

// ─── Feature definitions ──────────────────────────────────────────────────────

const FEATURES: { key: PermissionFeature; label: string; allowedValues: PermissionValue[] }[] = [
    { key: 'dashboard', label: 'Dashboard (Mój Panel)', allowedValues: ['true', 'false'] },
    { key: 'projects', label: 'Projekty', allowedValues: ['false', 'portfolio', 'full'] },
    { key: 'candidates', label: 'Baza Kandydatów', allowedValues: ['false', 'portfolio', 'full', 'readonly'] },
    { key: 'service_hub', label: 'Service Hub', allowedValues: ['true', 'false'] },
    { key: 'messages', label: 'Wiadomości', allowedValues: ['true', 'false'] },
    { key: 'documents', label: 'Dokumenty', allowedValues: ['true', 'false'] },
    { key: 'loyalty', label: 'Program Lojalnościowy', allowedValues: ['true', 'false'] },
    { key: 'development', label: 'Strefa Rozwoju', allowedValues: ['true', 'false'] },
    { key: 'import', label: 'Import Danych', allowedValues: ['true', 'false'] },
    { key: 'referrals', label: 'Polecenia', allowedValues: ['true', 'false'] },
    { key: 'ai_assistant', label: 'Asystent AI', allowedValues: ['false', 'portfolio', 'full'] },
    { key: 'settings', label: 'Ustawienia Systemu', allowedValues: ['true', 'false'] },
    { key: 'rates', label: 'Stawki', allowedValues: ['true', 'false'] },
]

const ROLES: { key: PermissionRole; label: string; color: string }[] = [
    { key: 'recruiter', label: 'Centrala – Rekruter', color: 'text-slate-200' },
    { key: 'delivery_lead', label: 'Centrala – Delivery Lead', color: 'text-primary' },
    { key: 'finance', label: 'Centrala – Finanse', color: 'text-green-400' },
    { key: 'consultant', label: 'Konsultant', color: 'text-orange-400' },
]

const VALUE_CONFIG: Record<PermissionValue, { label: string; bg: string; text: string }> = {
    'true': { label: 'Tak', bg: 'bg-green-500/10', text: 'text-green-400 border-green-500/30' },
    'false': { label: 'Nie', bg: 'bg-red-500/10', text: 'text-red-400 border-red-500/30' },
    'portfolio': { label: 'Portfel', bg: 'bg-primary/10', text: 'text-slate-200 border-primary/30' },
    'full': { label: 'Pełny', bg: 'bg-slate-200/10', text: 'text-slate-200 border-slate-200/30' },
    'readonly': { label: 'Tylko odczyt', bg: 'bg-yellow-500/10', text: 'text-yellow-400 border-yellow-500/30' },
}

interface PermissionsTableProps {
    initialPermissions: PermissionsMap
}

export function PermissionsTable({ initialPermissions }: PermissionsTableProps) {
    const [permissions, setPermissions] = useState<PermissionsMap>(initialPermissions)
    const [dirty, setDirty] = useState<PermissionUpdate[]>([])
    const [saving, setSaving] = useState(false)

    const handleChange = useCallback((role: PermissionRole, feature: PermissionFeature, value: PermissionValue) => {
        setPermissions(prev => ({
            ...prev,
            [role]: { ...prev[role], [feature]: value },
        }))
        setDirty(prev => {
            const filtered = prev.filter(d => !(d.role === role && d.feature === feature))
            return [...filtered, { role, feature, value }]
        })
    }, [])

    const handleSave = async () => {
        if (!dirty.length) return
        setSaving(true)
        try {
            await updatePermissions(dirty)
            toastSuccess(`Zapisano ${dirty.length} zmian uprawnień`)
            setDirty([])
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Błąd zapisu'
            toast.error(msg)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-4">
            {/* Header with save button */}
            <div className="flex items-center justify-between">
                <div>
                    {dirty.length > 0 ? (
                        <p className="text-sm text-yellow-400">
                            {dirty.length} niezapisanych zmian
                        </p>
                    ) : (
                        <p className="text-sm text-muted-foreground">Wszystkie zmiany zapisane</p>
                    )}
                </div>
                <Button onClick={handleSave} disabled={saving || dirty.length === 0} size="sm">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Zapisz zmiany
                </Button>
            </div>

            {/* Permissions table */}
            <div className="rounded-lg border border-white/10 overflow-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-white/10 bg-muted/30">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-48">
                                Funkcja
                            </th>
                            {/* Administrator – locked column */}
                            <th className="px-4 py-3 text-center min-w-[130px]">
                                <div className="flex flex-col items-center gap-1">
                                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs font-semibold text-muted-foreground">Administrator</span>
                                </div>
                            </th>
                            {ROLES.map(r => (
                                <th key={r.key} className="px-4 py-3 text-center min-w-[140px]">
                                    <span className={`text-xs font-semibold ${r.color}`}>{r.label}</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {FEATURES.map((feature, i) => (
                            <tr
                                key={feature.key}
                                className={`border-b border-white/5 last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}
                            >
                                <td className="px-4 py-3 font-medium text-sm">{feature.label}</td>

                                {/* Administrator – always full, locked */}
                                <td className="px-4 py-3 text-center">
                                    <div className="flex justify-center">
                                        <Badge variant="outline" className={`text-xs ${VALUE_CONFIG['full'].text} ${VALUE_CONFIG['full'].bg} pointer-events-none`}>
                                            <ShieldCheck className="h-3 w-3 mr-1" />
                                            Pełny
                                        </Badge>
                                    </div>
                                </td>

                                {/* Editable role columns */}
                                {ROLES.map(role => {
                                    const rawValue = permissions[role.key][feature.key]
                                    const currentValue = (VALUE_CONFIG[rawValue] ? rawValue : feature.allowedValues[0]) as PermissionValue
                                    const conf = VALUE_CONFIG[currentValue]
                                    const changed = dirty.some(d => d.role === role.key && d.feature === feature.key)

                                    return (
                                        <td key={role.key} className="px-4 py-3 text-center">
                                            <div className="flex justify-center">
                                                {feature.allowedValues.length <= 2 ? (
                                                    // Simple toggle for boolean features
                                                    <button
                                                        onClick={() => {
                                                            const next = currentValue === 'true' ? 'false' : 'true'
                                                            handleChange(role.key, feature.key, next as PermissionValue)
                                                        }}
                                                        className={`px-3 py-1 rounded-full border text-xs font-medium transition-all ${conf.bg} ${conf.text} ${changed ? 'ring-1 ring-yellow-400/50' : ''}`}
                                                    >
                                                        {conf.label}
                                                    </button>
                                                ) : (
                                                    // Select for multi-value features
                                                    <Select
                                                        value={currentValue}
                                                        onValueChange={(v) => handleChange(role.key, feature.key, v as PermissionValue)}
                                                    >
                                                        <SelectTrigger className={`h-7 text-xs w-28 border ${conf.text} ${conf.bg} ${changed ? 'ring-1 ring-yellow-400/50' : ''}`}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {feature.allowedValues.map(v => (
                                                                <SelectItem key={v} value={v} className="text-xs">
                                                                    {VALUE_CONFIG[v].label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </div>
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 pt-2 text-xs text-muted-foreground">
                <span className="font-medium">Legenda:</span>
                {Object.entries(VALUE_CONFIG).map(([key, c]) => (
                    <span key={key} className={`px-2 py-0.5 rounded border ${c.text} ${c.bg}`}>
                        {c.label}
                    </span>
                ))}
                <span className="ml-2">| <span className="text-yellow-400/80">żółta obwódka</span> = niezapisana zmiana</span>
            </div>

            {/* Detailed explanations */}
            <div className="rounded-lg border border-white/10 bg-muted/10 p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Objaśnienie poziomów uprawnień</h4>
                <div className="grid gap-2.5 text-xs text-muted-foreground">
                    <div className="flex items-start gap-3">
                        <span className={`shrink-0 px-2.5 py-0.5 rounded border ${VALUE_CONFIG['true'].text} ${VALUE_CONFIG['true'].bg} font-medium`}>Tak</span>
                        <span>Pełny dostęp do funkcji — użytkownik widzi wszystkie dane i może je edytować, dodawać oraz usuwać.</span>
                    </div>
                    <div className="flex items-start gap-3">
                        <span className={`shrink-0 px-2.5 py-0.5 rounded border ${VALUE_CONFIG['full'].text} ${VALUE_CONFIG['full'].bg} font-medium`}>Pełny</span>
                        <span>Pełny dostęp do wszystkich danych w danym module (np. wszystkie projekty, wszyscy konsultanci). Użytkownik może przeglądać i edytować.</span>
                    </div>
                    <div className="flex items-start gap-3">
                        <span className={`shrink-0 px-2.5 py-0.5 rounded border ${VALUE_CONFIG['portfolio'].text} ${VALUE_CONFIG['portfolio'].bg} font-medium`}>Portfel</span>
                        <span>Użytkownik widzi <strong>tylko tych konsultantów i projekty, którzy są do niego przypisani</strong>. Np. Rekruter z „Portfelem" w Projektach widzi tylko projekty swoich konsultantów, a nie wszystkie w systemie. Asystent AI z „Portfelem" odpowiada tylko na pytania dotyczące danych z portfela użytkownika.</span>
                    </div>
                    <div className="flex items-start gap-3">
                        <span className={`shrink-0 px-2.5 py-0.5 rounded border ${VALUE_CONFIG['readonly'].text} ${VALUE_CONFIG['readonly'].bg} font-medium`}>Tylko odczyt</span>
                        <span>Użytkownik widzi <strong>wszystkie dane</strong>, ale <strong>nie może ich edytować, dodawać ani usuwać</strong>. Przydatne np. dla Finansów, które muszą widzieć wszystkich konsultantów do rozliczeń, ale nie powinny zmieniać ich profili.</span>
                    </div>
                    <div className="flex items-start gap-3">
                        <span className={`shrink-0 px-2.5 py-0.5 rounded border ${VALUE_CONFIG['false'].text} ${VALUE_CONFIG['false'].bg} font-medium`}>Nie</span>
                        <span>Brak dostępu — funkcja jest ukryta dla użytkownika z tą rolą. Nie widzi jej w menu ani nie ma do niej dostępu.</span>
                    </div>
                </div>
            </div>

            {/* Note about Administrator */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-white/5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                    Rola <strong>Administrator</strong> zawsze ma pełny dostęp do wszystkich funkcji i nie może być ograniczana przez ten panel. Zarządzanie administratorami odbywa się wyłącznie przez panel Supabase.
                </span>
            </div>
        </div>
    )
}

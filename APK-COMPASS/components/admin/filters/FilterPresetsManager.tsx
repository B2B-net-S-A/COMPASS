'use client'

import React, { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bookmark, Plus, Trash2, Save } from "lucide-react"
import { toast } from "sonner"

export interface FilterPreset {
    id: string
    name: string
    filters: Record<string, any>
    createdAt: string
}

interface FilterPresetsManagerProps {
    currentFilters: Record<string, any>
    onApplyPreset: (filters: Record<string, any>) => void
    storageKey?: string
}

const STORAGE_PREFIX = 'compass-filter-presets-'

export function FilterPresetsManager({ currentFilters, onApplyPreset, storageKey = 'consultants' }: FilterPresetsManagerProps) {
    const fullKey = STORAGE_PREFIX + storageKey
    const [presets, setPresets] = useState<FilterPreset[]>(() => {
        try {
            return JSON.parse(localStorage.getItem(fullKey) || '[]')
        } catch { return [] }
    })
    const [showSave, setShowSave] = useState(false)
    const [presetName, setPresetName] = useState('')

    const savePresets = (updated: FilterPreset[]) => {
        setPresets(updated)
        try { localStorage.setItem(fullKey, JSON.stringify(updated)) } catch {}
    }

    const handleSave = () => {
        if (!presetName.trim()) return
        const newPreset: FilterPreset = {
            id: Date.now().toString(),
            name: presetName.trim(),
            filters: { ...currentFilters },
            createdAt: new Date().toISOString(),
        }
        savePresets([...presets, newPreset])
        setPresetName('')
        setShowSave(false)
        toast.success(`Zapisano preset: ${newPreset.name}`)
    }

    const handleDelete = (id: string) => {
        savePresets(presets.filter(p => p.id !== id))
        toast.success('Preset usunięty')
    }

    const hasActiveFilters = Object.values(currentFilters).some(v =>
        Array.isArray(v) ? v.length > 0 : v !== 'all' && v !== '' && v !== 'name'
    )

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
            {presets.map(preset => (
                <div key={preset.id} className="flex items-center gap-0.5">
                    <button
                        onClick={() => onApplyPreset(preset.filters)}
                        className="px-2.5 py-1 rounded-l-md text-[11px] font-medium bg-card/80 border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-white transition-all"
                    >
                        {preset.name}
                    </button>
                    <button
                        onClick={() => handleDelete(preset.id)}
                        className="px-1.5 py-1 rounded-r-md text-[11px] bg-card/80 border border-l-0 border-white/10 text-muted-foreground hover:text-red-400 transition-all"
                    >
                        <Trash2 className="h-3 w-3" />
                    </button>
                </div>
            ))}
            {hasActiveFilters && !showSave && (
                <button
                    onClick={() => setShowSave(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-dashed border-primary/30 text-primary/70 hover:bg-primary/5 transition-all"
                >
                    <Plus className="h-3 w-3" />
                    Zapisz widok
                </button>
            )}
            {showSave && (
                <div className="flex items-center gap-1.5">
                    <input
                        type="text"
                        value={presetName}
                        onChange={e => setPresetName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                        placeholder="Nazwa presetu..."
                        className="h-7 px-2 text-xs rounded-md border border-white/10 bg-card/50 text-white placeholder:text-muted-foreground w-32"
                        autoFocus
                    />
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleSave} disabled={!presetName.trim()}>
                        <Save className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setShowSave(false); setPresetName('') }}>
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            )}
        </div>
    )
}

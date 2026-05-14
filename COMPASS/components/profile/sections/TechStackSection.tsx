'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus, X, Code2, Database, Cloud, Wrench } from "lucide-react"
import { toast } from "sonner"

export interface TechItem {
    name: string
    level: 'junior' | 'mid' | 'senior' | 'expert'
    category: 'language' | 'framework' | 'database' | 'cloud' | 'tool' | 'other'
}

const LEVEL_COLORS: Record<string, string> = {
    junior: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    mid: 'bg-green-500/20 text-green-300 border-green-500/30',
    senior: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    expert: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
}

const LEVEL_LABELS: Record<string, string> = {
    junior: 'Junior',
    mid: 'Mid',
    senior: 'Senior',
    expert: 'Expert',
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    language: <Code2 className="h-3.5 w-3.5" />,
    framework: <Code2 className="h-3.5 w-3.5" />,
    database: <Database className="h-3.5 w-3.5" />,
    cloud: <Cloud className="h-3.5 w-3.5" />,
    tool: <Wrench className="h-3.5 w-3.5" />,
    other: <Code2 className="h-3.5 w-3.5" />,
}

const CATEGORY_LABELS: Record<string, string> = {
    language: 'Języki programowania',
    framework: 'Frameworki',
    database: 'Bazy danych',
    cloud: 'Chmura & DevOps',
    tool: 'Narzędzia',
    other: 'Inne',
}

interface TechStackSectionProps {
    techStack: TechItem[]
    skills: string[]
    onSave: (techStack: TechItem[]) => Promise<void>
    readOnly?: boolean
}

export function TechStackSection({ techStack: initialStack, skills, onSave, readOnly = false }: TechStackSectionProps) {
    const [techStack, setTechStack] = useState<TechItem[]>(initialStack || [])
    const [isAdding, setIsAdding] = useState(false)
    const [newItem, setNewItem] = useState<Partial<TechItem>>({ category: 'language', level: 'mid' })
    const [saving, setSaving] = useState(false)

    const handleAdd = () => {
        if (!newItem.name?.trim()) {
            toast.error('Wpisz nazwę technologii')
            return
        }
        const item: TechItem = {
            name: newItem.name.trim(),
            level: (newItem.level as TechItem['level']) || 'mid',
            category: (newItem.category as TechItem['category']) || 'other',
        }
        const updated = [...techStack, item]
        setTechStack(updated)
        setNewItem({ category: 'language', level: 'mid' })
        setIsAdding(false)
        handleSave(updated)
    }

    const handleRemove = (index: number) => {
        const updated = techStack.filter((_, i) => i !== index)
        setTechStack(updated)
        handleSave(updated)
    }

    const handleSave = async (items: TechItem[]) => {
        setSaving(true)
        try {
            await onSave(items)
            toast.success('Tech stack zaktualizowany')
        } catch {
            toast.error('Nie udało się zapisać')
        } finally {
            setSaving(false)
        }
    }

    const grouped = techStack.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = []
        acc[item.category].push(item)
        return acc
    }, {} as Record<string, TechItem[]>)

    const techNames = new Set(techStack.map(t => t.name.toLowerCase()))
    const unmappedSkills = skills.filter(s => !techNames.has(s.toLowerCase()))

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Code2 className="h-5 w-5 text-primary" />
                        Tech Stack
                    </CardTitle>
                    {!readOnly && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsAdding(!isAdding)}
                            disabled={saving}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Dodaj
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {isAdding && (
                    <div className="p-3 rounded-lg bg-card/80 border border-white/10 space-y-3">
                        <input
                            type="text"
                            placeholder="Nazwa technologii..."
                            value={newItem.name || ''}
                            onChange={e => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                            autoFocus
                        />
                        <div className="flex gap-2 flex-wrap">
                            <select
                                value={newItem.category}
                                onChange={e => setNewItem(prev => ({ ...prev, category: e.target.value as TechItem['category'] }))}
                                className="bg-card border border-white/10 rounded-md px-3 py-1.5 text-sm text-white"
                            >
                                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                            <select
                                value={newItem.level}
                                onChange={e => setNewItem(prev => ({ ...prev, level: e.target.value as TechItem['level'] }))}
                                className="bg-card border border-white/10 rounded-md px-3 py-1.5 text-sm text-white"
                            >
                                {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                            <Button size="sm" onClick={handleAdd}>Zapisz</Button>
                            <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>Anuluj</Button>
                        </div>
                    </div>
                )}

                {Object.entries(grouped).map(([category, items]) => (
                    <div key={category}>
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                            {CATEGORY_ICONS[category]}
                            {CATEGORY_LABELS[category] || category}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {items.map((item, idx) => (
                                <Badge
                                    key={`${item.name}-${idx}`}
                                    variant="outline"
                                    className={`${LEVEL_COLORS[item.level]} text-xs px-2.5 py-1 gap-1`}
                                >
                                    {item.name}
                                    <span className="opacity-60 text-[10px]">{LEVEL_LABELS[item.level]}</span>
                                    {!readOnly && (
                                        <button
                                            onClick={() => handleRemove(techStack.indexOf(item))}
                                            className="ml-1 hover:text-red-400"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </Badge>
                            ))}
                        </div>
                    </div>
                ))}

                {techStack.length === 0 && !isAdding && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        Brak technologii. Dodaj swój tech stack.
                    </p>
                )}

                {unmappedSkills.length > 0 && (
                    <div className="pt-3 border-t border-white/5">
                        <p className="text-xs text-muted-foreground mb-2">Umiejętności z CV (nie przypisane):</p>
                        <div className="flex flex-wrap gap-1.5">
                            {unmappedSkills.map(skill => (
                                <Badge key={skill} variant="outline" className="text-xs opacity-60">
                                    {skill}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

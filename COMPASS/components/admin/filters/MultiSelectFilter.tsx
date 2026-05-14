'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronDown, X, Check } from "lucide-react"

interface Option {
    value: string
    label: string
    count?: number
}

interface MultiSelectFilterProps {
    label: string
    options: Option[]
    selected: string[]
    onChange: (selected: string[]) => void
    placeholder?: string
}

export function MultiSelectFilter({ label, options, selected, onChange, placeholder = 'Wybierz...' }: MultiSelectFilterProps) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const toggle = (value: string) => {
        onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
    }

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    selected.length > 0
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-card/80 border-white/10 text-muted-foreground hover:bg-white/5'
                }`}
            >
                <span className="font-medium">{label}</span>
                {selected.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-primary/20">
                        {selected.length}
                    </Badge>
                )}
                <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-50 mt-1 w-56 rounded-lg border border-white/10 bg-card shadow-xl overflow-hidden">
                    <div className="max-h-60 overflow-y-auto p-1">
                        {options.map(opt => {
                            const isSelected = selected.includes(opt.value)
                            return (
                                <button
                                    key={opt.value}
                                    onClick={() => toggle(opt.value)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-all ${
                                        isSelected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-white/5'
                                    }`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                        isSelected ? 'bg-primary border-primary' : 'border-white/20'
                                    }`}>
                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <span className="flex-1 text-left truncate">{opt.label}</span>
                                    {opt.count !== undefined && (
                                        <span className="text-[10px] text-muted-foreground">{opt.count}</span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                    {selected.length > 0 && (
                        <div className="border-t border-white/5 p-1">
                            <button
                                onClick={() => onChange([])}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-white/5"
                            >
                                <X className="h-3 w-3" />
                                Wyczyść ({selected.length})
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

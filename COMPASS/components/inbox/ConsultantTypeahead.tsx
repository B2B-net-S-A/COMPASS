'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, User, UserPlus, Building2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { searchConsultants } from '@/lib/actions/support-inbox'
import type { ConsultantSearchResult } from '@/lib/types/support'

/**
 * Selected consultant for a ticket. `id` is the contractors-directory id when the
 * consultant was matched, or `null` for a manual free-text entry (`manual: true`).
 */
export interface ConsultantSelection {
    id: string | null
    full_name: string
    phone: string | null
    current_client: string | null
    current_position: string | null
    manual?: boolean
}

interface ConsultantTypeaheadProps {
    value: ConsultantSelection | null
    onChange: (option: ConsultantSelection | null) => void
    placeholder?: string
}

export function ConsultantTypeahead({
    value,
    onChange,
    placeholder = 'Szukaj konsultanta lub wpisz ręcznie...',
}: ConsultantTypeaheadProps) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<ConsultantSearchResult[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    // Debounce search query (300ms)
    useEffect(() => {
        if (value) return // already selected, skip search
        if (query.trim().length < 2) {
            setResults([])
            return
        }
        let cancelled = false
        const timer = setTimeout(async () => {
            setIsLoading(true)
            // Audyt 2026-08 (UI): bez try/finally rzut z akcji zostawiał wieczne
            // „Wyszukiwanie...". Rzuca realnie w dwóch sytuacjach: zerwana sieć
            // oraz rozjazd deployu (stara karta woła nieistniejącą już akcję —
            // wtedy `res` bywa `undefined`, a `res.success` samo w sobie rzuca).
            try {
                const res = await searchConsultants(query)
                if (cancelled) return
                if (res?.success) setResults(res.data)
                else setResults([])
            } catch {
                if (!cancelled) setResults([])
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }, 300)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [query, value])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const selectResult = (r: ConsultantSearchResult) => {
        onChange({
            id: r.id,
            full_name: r.full_name,
            phone: r.phone,
            current_client: r.current_client,
            current_position: r.current_position,
            manual: false,
        })
        setIsOpen(false)
        setQuery('')
    }

    const selectManual = () => {
        const name = query.trim()
        if (name.length < 2) return
        onChange({
            id: null,
            full_name: name,
            phone: null,
            current_client: null,
            current_position: null,
            manual: true,
        })
        setIsOpen(false)
        setQuery('')
    }

    if (value) {
        return (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-input bg-background text-sm">
                <div className="flex items-center gap-2 min-w-0">
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{value.full_name}</span>
                    {value.current_client && (
                        <span className="text-xs text-muted-foreground truncate">· {value.current_client}</span>
                    )}
                    {value.manual && (
                        <span className="text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5 shrink-0">
                            wpisany ręcznie
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => {
                        onChange(null)
                        setQuery('')
                    }}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="Usuń konsultanta"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        )
    }

    const canAddManual = query.trim().length >= 2
    const exactMatch = results.some(
        (r) => r.full_name.trim().toLowerCase() === query.trim().toLowerCase(),
    )

    return (
        <div ref={containerRef} className="relative">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value)
                        setIsOpen(true)
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                    className="pl-9"
                />
            </div>

            {isOpen && query.trim().length >= 2 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-lg max-h-72 overflow-auto">
                    {isLoading && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Wyszukiwanie...</div>
                    )}
                    {!isLoading && results.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Brak dopasowań w bazie konsultantów</div>
                    )}
                    {results.map((r) => (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => selectResult(r)}
                            className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex flex-col gap-0.5 border-b border-border last:border-0"
                        >
                            <span className="flex items-center gap-2">
                                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="font-medium">{r.full_name}</span>
                            </span>
                            {(r.current_client || r.current_position) && (
                                <span className="flex items-center gap-1.5 pl-6 text-xs text-muted-foreground">
                                    <Building2 className="w-3 h-3 shrink-0" />
                                    <span className="truncate">
                                        {[r.current_client, r.current_position].filter(Boolean).join(' · ')}
                                    </span>
                                </span>
                            )}
                        </button>
                    ))}
                    {canAddManual && !exactMatch && (
                        <button
                            type="button"
                            onClick={selectManual}
                            className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2 border-t border-border text-primary"
                        >
                            <UserPlus className="w-3.5 h-3.5 shrink-0" />
                            <span>
                                Dodaj ręcznie: <span className="font-medium">„{query.trim()}”</span>
                            </span>
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

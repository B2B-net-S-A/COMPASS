'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { searchConsultants } from '@/lib/actions/support-inbox'

interface ConsultantOption {
    id: string
    full_name: string | null
    email: string
}

interface ConsultantTypeaheadProps {
    value: ConsultantOption | null
    onChange: (option: ConsultantOption | null) => void
    placeholder?: string
}

export function ConsultantTypeahead({
    value,
    onChange,
    placeholder = 'Szukaj konsultanta...',
}: ConsultantTypeaheadProps) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<ConsultantOption[]>([])
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
            const res = await searchConsultants(query)
            if (cancelled) return
            setIsLoading(false)
            if (res.success) setResults(res.data)
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

    if (value) {
        return (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-input bg-background text-sm">
                <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span>{value.full_name ?? value.email}</span>
                    <span className="text-xs text-muted-foreground">{value.email}</span>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        onChange(null)
                        setQuery('')
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Usuń konsultanta"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        )
    }

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
                <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-lg max-h-60 overflow-auto">
                    {isLoading && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Wyszukiwanie...</div>
                    )}
                    {!isLoading && results.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Brak wyników</div>
                    )}
                    {results.map((r) => (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                                onChange(r)
                                setIsOpen(false)
                                setQuery('')
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-white/5 text-sm flex items-center gap-2 border-b border-white/5 last:border-0"
                        >
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="font-medium">{r.full_name ?? '(bez nazwy)'}</span>
                            <span className="text-xs text-muted-foreground">{r.email}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

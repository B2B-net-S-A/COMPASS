'use client'

// Phase 46 — generyczny tag-picker z autocomplete i „Dodaj: X".
// W repo nie było żadnego multi-selecta (brak cmdk/react-select) — to jest
// pierwszy, zbudowany z Input + Badge + filtrowanej listy (wzorzec wyszukiwarki
// osób ze StartOnboardingDialog). Nowa pozycja (onCreate) trafia do słownika
// jako niezweryfikowana i jest od razu wybrana.

import { useMemo, useRef, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'

export interface TagOption {
    id: string
    label: string
    /** Drobny dopisek przy opcji (np. kategoria technologii). */
    hint?: string
    /** Aliasy do wyszukiwania (np. k8s → Kubernetes). */
    aliases?: string[]
    unverified?: boolean
}

interface Props {
    options: TagOption[]
    selectedIds: string[]
    onChange: (ids: string[]) => void
    placeholder?: string
    /** Gdy podane — pozwala dodać nową pozycję do słownika (zwraca utworzoną/kanoniczną opcję). */
    onCreate?: (name: string) => Promise<TagOption>
    disabled?: boolean
}

export function TagMultiSelect({ options, selectedIds, onChange, placeholder, onCreate, disabled }: Props) {
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [extraOptions, setExtraOptions] = useState<TagOption[]>([])
    const inputRef = useRef<HTMLInputElement>(null)

    const allOptions = useMemo(() => {
        const seen = new Set(options.map((o) => o.id))
        return [...options, ...extraOptions.filter((o) => !seen.has(o.id))]
    }, [options, extraOptions])

    const byId = useMemo(() => new Map(allOptions.map((o) => [o.id, o])), [allOptions])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        const available = allOptions.filter((o) => !selectedIds.includes(o.id))
        if (!q) return available.slice(0, 8)
        return available
            .filter(
                (o) =>
                    o.label.toLowerCase().includes(q) ||
                    (o.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
            )
            .slice(0, 8)
    }, [allOptions, selectedIds, query])

    const exactMatch = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return true
        return allOptions.some((o) => o.label.toLowerCase() === q)
    }, [allOptions, query])

    function add(id: string) {
        if (!selectedIds.includes(id)) onChange([...selectedIds, id])
        setQuery('')
        inputRef.current?.focus()
    }

    function remove(id: string) {
        onChange(selectedIds.filter((s) => s !== id))
    }

    async function create() {
        const name = query.trim()
        if (!onCreate || name.length < 2 || creating) return
        setCreating(true)
        try {
            const created = await onCreate(name)
            setExtraOptions((prev) => [...prev, created])
            add(created.id)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się dodać pozycji.')
        } finally {
            setCreating(false)
        }
    }

    return (
        <div className="space-y-2">
            {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selectedIds.map((id) => {
                        const opt = byId.get(id)
                        return (
                            <Badge key={id} variant={opt?.unverified ? 'warning' : 'soft'} size="sm">
                                {opt?.label ?? id}
                                {!disabled && (
                                    <button
                                        type="button"
                                        onClick={() => remove(id)}
                                        className="ml-1 opacity-60 hover:opacity-100"
                                        aria-label={`Usuń ${opt?.label ?? id}`}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </Badge>
                        )
                    })}
                </div>
            )}

            <div className="relative">
                <Input
                    ref={inputRef}
                    value={query}
                    disabled={disabled}
                    placeholder={placeholder ?? 'Szukaj…'}
                    onChange={(e) => {
                        setQuery(e.target.value)
                        setOpen(true)
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            if (filtered.length > 0) add(filtered[0].id)
                            else if (!exactMatch) void create()
                        }
                        if (e.key === 'Escape') setOpen(false)
                    }}
                />
                {open && (filtered.length > 0 || (!exactMatch && onCreate)) && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-56 overflow-y-auto">
                        {filtered.map((o) => (
                            <button
                                key={o.id}
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    add(o.id)
                                }}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                                <span>
                                    {o.label}
                                    {o.unverified && (
                                        <span className="ml-2 text-xs text-amber-600">niezweryfikowana</span>
                                    )}
                                </span>
                                {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                            </button>
                        ))}
                        {!exactMatch && onCreate && query.trim().length >= 2 && (
                            <button
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    void create()
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-muted border-t border-border"
                            >
                                {creating ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Plus className="h-3.5 w-3.5" />
                                )}
                                Dodaj „{query.trim()}”
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

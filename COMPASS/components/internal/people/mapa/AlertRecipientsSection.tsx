'use client'

// Phase 46c — konfiguracja odbiorców alertów (admin only).
// Dwie listy: sygnał popytu (do sprzedaży) i koniec projektu (do właściciela
// benchu). Puste = fallback na owner_tcm_id kontraktora, potem admin+TCM.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { setAlertRecipients } from '@/lib/actions/tech-map'
import type { AlertRecipientsConfig } from '@/lib/actions/tech-map'

interface Candidate {
    id: string
    fullName: string
    role: string
}

const ROLE_PL: Record<string, string> = {
    admin: 'Admin',
    talent_community: 'TCM',
    finanse: 'Finanse',
    manager: 'Manager',
}

function RecipientPicker({
    title,
    hint,
    candidates,
    initialCsv,
    kind,
}: {
    title: string
    hint: string
    candidates: Candidate[]
    initialCsv: string
    kind: 'demand' | 'project_end'
}) {
    const router = useRouter()
    const [selected, setSelected] = useState<Set<string>>(
        () => new Set(initialCsv.split(',').map((s) => s.trim()).filter(Boolean)),
    )
    const [search, setSearch] = useState('')
    const [saving, setSaving] = useState(false)

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return candidates
        return candidates.filter((c) => c.fullName.toLowerCase().includes(q))
    }, [candidates, search])

    function toggle(id: string) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    async function save() {
        setSaving(true)
        try {
            await setAlertRecipients(kind, Array.from(selected))
            toast.success('Zapisano odbiorców.')
            router.refresh()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="rounded-lg border border-border">
            <div className="border-b border-border px-3 py-2">
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <div className="p-3 space-y-2">
                <Input
                    className="h-8 text-sm"
                    placeholder="Szukaj…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <ul className="max-h-56 overflow-y-auto divide-y divide-border">
                    {filtered.map((c) => (
                        <li key={c.id}>
                            <label className="flex items-center gap-2 px-1 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
                                <input
                                    type="checkbox"
                                    checked={selected.has(c.id)}
                                    onChange={() => toggle(c.id)}
                                />
                                <span className="flex-1">{c.fullName}</span>
                                <span className="text-xs text-muted-foreground">{ROLE_PL[c.role] ?? c.role}</span>
                            </label>
                        </li>
                    ))}
                    {filtered.length === 0 && (
                        <li className="px-1 py-3 text-center text-xs text-muted-foreground">Brak wyników.</li>
                    )}
                </ul>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        {selected.size === 0 ? 'Puste → fallback (opiekun, potem admin+TCM)' : `${selected.size} wybranych`}
                    </span>
                    <Button size="sm" onClick={save} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Zapisz
                    </Button>
                </div>
            </div>
        </div>
    )
}

export function AlertRecipientsSection({
    config,
    candidates,
}: {
    config: AlertRecipientsConfig
    candidates: Candidate[]
}) {
    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-lg font-semibold">Odbiorcy alertów (admin)</h2>
                <p className="text-sm text-muted-foreground">
                    Kto dostaje powiadomienia. Puste = fallback na opiekuna kontraktora, a jak brak — na
                    wszystkich admin+TCM.
                </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <RecipientPicker
                    title="Sygnał popytu → sprzedaż"
                    hint="Klient szuka ludzi (alert przy finalizacji karty)."
                    candidates={candidates}
                    initialCsv={config.demandCsv}
                    kind="demand"
                />
                <RecipientPicker
                    title="Koniec projektu → bench"
                    hint="Koniec projektu konsultanta <60 dni (dzienny cron)."
                    candidates={candidates}
                    initialCsv={config.projectEndCsv}
                    kind="project_end"
                />
            </div>
        </section>
    )
}

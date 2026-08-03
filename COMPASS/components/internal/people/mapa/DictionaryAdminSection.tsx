'use client'

// Phase 46 — zarządzanie słownikami (admin only): weryfikacja pozycji z tag-pickera,
// rename, kategoria/aliasy technologii, usuwanie (RESTRICT gdy użyta na kartach —
// akcja zwraca polski komunikat). Niezweryfikowane u góry — to kolejka do przejrzenia.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { toast } from '@/lib/toast'
import {
    createTechnologyUnverified,
    createVendorUnverified,
    deleteTechnology,
    deleteVendor,
    updateTechnology,
    updateVendor,
} from '@/lib/actions/tech-map'
import {
    TECH_CATEGORIES,
    TECH_CATEGORY_PL,
    type TechCategory,
    type TechnologyRow,
    type VendorRow,
} from '@/lib/types/tech-map'

const selectCls = 'flex h-8 rounded-md border border-input bg-background px-2 py-0.5 text-xs'

function sortDict<T extends { name: string; is_verified: boolean }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
        if (a.is_verified !== b.is_verified) return a.is_verified ? 1 : -1
        return a.name.localeCompare(b.name, 'pl')
    })
}

export function DictionaryAdminSection({
    technologies,
    vendors,
}: {
    technologies: TechnologyRow[]
    vendors: VendorRow[]
}) {
    const router = useRouter()
    const [confirm, ConfirmUI] = useConfirm()
    const [busy, setBusy] = useState<string | null>(null)
    const [editing, setEditing] = useState<{ kind: 'tech' | 'vendor'; id: string; name: string; aliases: string } | null>(null)
    const [newTech, setNewTech] = useState('')
    const [newTechCategory, setNewTechCategory] = useState<TechCategory>('inne')
    const [newVendor, setNewVendor] = useState('')

    const techSorted = useMemo(() => sortDict(technologies), [technologies])
    const vendorSorted = useMemo(() => sortDict(vendors), [vendors])

    async function run(key: string, fn: () => Promise<unknown>, okMsg: string) {
        setBusy(key)
        try {
            await fn()
            toast.success(okMsg)
            router.refresh()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Operacja nie powiodła się.')
        } finally {
            setBusy(null)
        }
    }

    async function saveEdit() {
        if (!editing) return
        const aliases = editing.aliases.split(',').map((a) => a.trim()).filter(Boolean)
        const payload = editing
        await run(
            `edit-${payload.id}`,
            () =>
                payload.kind === 'tech'
                    ? updateTechnology({ id: payload.id, name: payload.name, aliases })
                    : updateVendor({ id: payload.id, name: payload.name }),
            'Zapisano.',
        )
        setEditing(null)
    }

    async function removeItem(kind: 'tech' | 'vendor', id: string, name: string) {
        const ok = await confirm({
            title: `Usunąć „${name}"?`,
            description: 'Pozycja użyta na kartach wywiadów nie zostanie usunięta (dostaniesz komunikat).',
            confirmLabel: 'Usuń',
            cancelLabel: 'Anuluj',
        })
        if (!ok) return
        await run(
            `del-${id}`,
            () => (kind === 'tech' ? deleteTechnology(id) : deleteVendor(id)),
            'Usunięto.',
        )
    }

    function renderRow(kind: 'tech' | 'vendor', row: TechnologyRow | VendorRow) {
        const isTech = kind === 'tech'
        const tech = isTech ? (row as TechnologyRow) : null
        const isEditing = editing?.id === row.id

        return (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                {isEditing ? (
                    <>
                        <Input
                            className="h-8 w-44 text-sm"
                            value={editing!.name}
                            onChange={(e) => setEditing({ ...editing!, name: e.target.value })}
                        />
                        {isTech && (
                            <Input
                                className="h-8 flex-1 min-w-[160px] text-xs"
                                placeholder="aliasy po przecinku (np. k8s, kube)"
                                value={editing!.aliases}
                                onChange={(e) => setEditing({ ...editing!, aliases: e.target.value })}
                            />
                        )}
                        <Button size="sm" variant="ghost" onClick={saveEdit} disabled={busy !== null}>
                            <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </>
                ) : (
                    <>
                        <span className="min-w-0 flex-1 truncate text-sm">
                            {row.name}
                            {tech && tech.aliases.length > 0 && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                    ({tech.aliases.join(', ')})
                                </span>
                            )}
                        </span>
                        {tech && (
                            <select
                                className={selectCls}
                                value={tech.category}
                                disabled={busy !== null}
                                onChange={(e) =>
                                    void run(
                                        `cat-${row.id}`,
                                        () =>
                                            updateTechnology({
                                                id: row.id,
                                                category: e.target.value as TechCategory,
                                            }),
                                        'Zmieniono kategorię.',
                                    )
                                }
                            >
                                {TECH_CATEGORIES.map((c) => (
                                    <option key={c} value={c}>{TECH_CATEGORY_PL[c]}</option>
                                ))}
                            </select>
                        )}
                        {row.is_verified ? (
                            <Badge variant="success" size="sm">zweryfikowana</Badge>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy !== null}
                                onClick={() =>
                                    void run(
                                        `ver-${row.id}`,
                                        () =>
                                            isTech
                                                ? updateTechnology({ id: row.id, isVerified: true })
                                                : updateVendor({ id: row.id, isVerified: true }),
                                        'Zweryfikowano.',
                                    )
                                }
                            >
                                {busy === `ver-${row.id}` ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    'Zweryfikuj'
                                )}
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                                setEditing({
                                    kind,
                                    id: row.id,
                                    name: row.name,
                                    aliases: tech ? tech.aliases.join(', ') : '',
                                })
                            }
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={busy !== null}
                            onClick={() => void removeItem(kind, row.id, row.name)}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </>
                )}
            </li>
        )
    }

    return (
        <section className="space-y-4">
            <ConfirmUI />
            <h2 className="text-lg font-semibold">Słowniki (admin)</h2>
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                        <h3 className="text-sm font-semibold flex-1">
                            Technologie ({technologies.length})
                        </h3>
                        <Input
                            className="h-8 w-36 text-sm"
                            placeholder="Nowa technologia"
                            value={newTech}
                            onChange={(e) => setNewTech(e.target.value)}
                        />
                        <select
                            className={selectCls}
                            value={newTechCategory}
                            onChange={(e) => setNewTechCategory(e.target.value as TechCategory)}
                        >
                            {TECH_CATEGORIES.map((c) => (
                                <option key={c} value={c}>{TECH_CATEGORY_PL[c]}</option>
                            ))}
                        </select>
                        <Button
                            size="sm"
                            disabled={busy !== null || newTech.trim().length < 2}
                            onClick={() =>
                                void run(
                                    'add-tech',
                                    async () => {
                                        const row = await createTechnologyUnverified(newTech)
                                        await updateTechnology({
                                            id: row.id,
                                            category: newTechCategory,
                                            isVerified: true,
                                        })
                                        setNewTech('')
                                    },
                                    'Dodano technologię.',
                                )
                            }
                        >
                            Dodaj
                        </Button>
                    </div>
                    <ul className="divide-y divide-border max-h-96 overflow-y-auto">
                        {techSorted.map((t) => renderRow('tech', t))}
                    </ul>
                </div>

                <div className="rounded-lg border border-border">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                        <h3 className="text-sm font-semibold flex-1">Dostawcy ({vendors.length})</h3>
                        <Input
                            className="h-8 w-40 text-sm"
                            placeholder="Nowy dostawca"
                            value={newVendor}
                            onChange={(e) => setNewVendor(e.target.value)}
                        />
                        <Button
                            size="sm"
                            disabled={busy !== null || newVendor.trim().length < 2}
                            onClick={() =>
                                void run(
                                    'add-vendor',
                                    async () => {
                                        const row = await createVendorUnverified(newVendor)
                                        await updateVendor({ id: row.id, isVerified: true })
                                        setNewVendor('')
                                    },
                                    'Dodano dostawcę.',
                                )
                            }
                        >
                            Dodaj
                        </Button>
                    </div>
                    <ul className="divide-y divide-border max-h-96 overflow-y-auto">
                        {vendorSorted.map((v) => renderRow('vendor', v))}
                    </ul>
                </div>
            </div>
        </section>
    )
}

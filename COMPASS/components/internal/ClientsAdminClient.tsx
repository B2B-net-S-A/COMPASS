'use client'

// Phase 27d — Clients admin client. Add / rename / toggle active / delete.

import { useMemo, useState, useTransition } from 'react'
import { Plus, Check, X, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    createClient_,
    renameClient,
    toggleClientActive,
    deleteClient,
    type ClientRow,
} from '@/lib/actions/internal-clients'

interface Props {
    initialClients: ClientRow[]
}

export function ClientsAdminClient({ initialClients }: Props) {
    const [clients, setClients] = useState<ClientRow[]>(initialClients)
    const [newName, setNewName] = useState('')
    const [search, setSearch] = useState('')
    const [editId, setEditId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [pending, startTransition] = useTransition()

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return clients
        return clients.filter((c) => c.name.toLowerCase().includes(q))
    }, [clients, search])

    const activeCount = clients.filter((c) => c.is_active).length

    function handleAdd(e: React.FormEvent) {
        e.preventDefault()
        const name = newName.trim()
        if (name.length < 1) {
            toast.error('Podaj nazwę klienta.')
            return
        }
        startTransition(async () => {
            try {
                const created = await createClient_(name)
                setClients((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
                setNewName('')
                toastSuccess(`Dodano klienta "${created.name}".`)
            } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Błąd dodawania.')
            }
        })
    }

    function handleToggle(client: ClientRow) {
        startTransition(async () => {
            try {
                await toggleClientActive(client.id, !client.is_active)
                setClients((prev) =>
                    prev.map((c) => (c.id === client.id ? { ...c, is_active: !c.is_active } : c)),
                )
            } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Błąd aktualizacji.')
            }
        })
    }

    function handleRename(client: ClientRow) {
        const name = editName.trim()
        if (name.length < 1) {
            toast.error('Nazwa nie może być pusta.')
            return
        }
        startTransition(async () => {
            try {
                await renameClient(client.id, name)
                setClients((prev) =>
                    prev
                        .map((c) => (c.id === client.id ? { ...c, name } : c))
                        .sort((a, b) => a.name.localeCompare(b.name)),
                )
                setEditId(null)
                setEditName('')
                toastSuccess('Zmieniono nazwę.')
            } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Błąd zmiany nazwy.')
            }
        })
    }

    function handleDelete(client: ClientRow) {
        if (!window.confirm(`Usunąć klienta "${client.name}"? Historia premii zachowa nazwę jako tekst.`)) {
            return
        }
        startTransition(async () => {
            try {
                await deleteClient(client.id)
                setClients((prev) => prev.filter((c) => c.id !== client.id))
                toastSuccess('Klient usunięty.')
            } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Błąd usuwania.')
            }
        })
    }

    return (
        <div className="space-y-4">
            {/* Add form */}
            <form onSubmit={handleAdd} className="flex items-center gap-2">
                <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nazwa nowego klienta"
                    disabled={pending}
                    maxLength={120}
                />
                <Button type="submit" disabled={pending || newName.trim().length < 1}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                    Dodaj
                </Button>
            </form>

            <div className="flex items-center justify-between gap-2">
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Szukaj…"
                    className="max-w-xs"
                />
                <span className="text-xs text-muted-foreground">
                    {activeCount} aktywnych · {clients.length} wszystkich
                </span>
            </div>

            {/* List */}
            <div className="rounded-lg border border-white/10 divide-y divide-border/30">
                {filtered.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">Brak klientów.</p>
                ) : (
                    filtered.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 p-2.5">
                            {editId === c.id ? (
                                <>
                                    <Input
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="flex-1"
                                        autoFocus
                                        disabled={pending}
                                        maxLength={120}
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleRename(c)}
                                        disabled={pending}
                                    >
                                        <Check className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setEditId(null)
                                            setEditName('')
                                        }}
                                        disabled={pending}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <span
                                        className={`flex-1 text-sm ${
                                            c.is_active ? '' : 'text-muted-foreground line-through'
                                        }`}
                                    >
                                        {c.name}
                                    </span>
                                    {!c.is_active && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-500/30 bg-gray-500/10 text-gray-400">
                                            nieaktywny
                                        </span>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => handleToggle(c)}
                                        disabled={pending}
                                    >
                                        {c.is_active ? 'Dezaktywuj' : 'Aktywuj'}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0"
                                        onClick={() => {
                                            setEditId(c.id)
                                            setEditName(c.name)
                                        }}
                                        disabled={pending}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                                        onClick={() => handleDelete(c)}
                                        disabled={pending}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

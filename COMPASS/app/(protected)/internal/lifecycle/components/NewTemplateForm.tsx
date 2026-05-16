'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { createTemplate } from '@/lib/actions/lifecycle'
import type { DbRole } from '@/lib/types/role'

const ROLE_OPTIONS: Array<{ value: DbRole; label: string }> = [
    { value: 'consultant', label: 'Konsultant IT' },
    { value: 'internal', label: 'Konsultant wewnętrzny' },
    { value: 'finanse', label: 'Finanse' },
    { value: 'manager', label: 'Manager' },
    { value: 'talent_community', label: 'Talent Community Manager' },
]

export function NewTemplateForm() {
    const router = useRouter()
    const [name, setName] = useState('')
    const [targetRole, setTargetRole] = useState<DbRole>('consultant')
    const [description, setDescription] = useState('')
    const [isDefault, setIsDefault] = useState(false)
    const [isPending, startTransition] = useTransition()

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!name.trim()) {
            toast.error('Nazwa jest wymagana.')
            return
        }
        startTransition(async () => {
            try {
                const id = await createTemplate({
                    name: name.trim(),
                    targetRole,
                    description: description.trim() || null,
                    isDefault,
                    items: [],
                })
                toastSuccess('Szablon utworzony. Dodaj items w edytorze.')
                router.push(`/internal/lifecycle/templates/${id}`)
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd tworzenia szablonu.')
            }
        })
    }

    return (
        <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6 space-y-4">
            <div>
                <label className="text-sm font-medium">Nazwa szablonu *</label>
                <input
                    type="text"
                    className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="np. Konsultant IT — Wersja 2026"
                    autoFocus
                    required
                />
            </div>

            <div>
                <label className="text-sm font-medium">Rola docelowa</label>
                <select
                    className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as DbRole)}
                >
                    {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                </select>
            </div>

            <div>
                <label className="text-sm font-medium">Opis (opcjonalnie)</label>
                <textarea
                    className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Krótki opis kiedy używać tego szablonu."
                />
            </div>

            <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3">
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={isDefault}
                        onChange={(e) => setIsDefault(e.target.checked)}
                        className="h-4 w-4"
                    />
                    <span><strong>Domyślny szablon</strong> dla tej roli</span>
                </label>
                <p className="text-xs text-muted-foreground pl-6 mt-1">
                    Tylko jeden szablon może być domyślny per rola. Zaznaczenie odznaczy poprzedni default i ten szablon będzie używany przy auto-starcie onboardingu nowych pracowników.
                </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button type="submit" disabled={isPending}>
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Utwórz szablon
                </Button>
            </div>
        </form>
    )
}

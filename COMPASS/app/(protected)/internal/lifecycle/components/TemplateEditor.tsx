'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    addTemplateItem,
    deleteTemplate,
    deleteTemplateItem,
    reorderTemplateItems,
    updateTemplate,
    updateTemplateItem,
    type TemplateItemInput,
} from '@/lib/actions/lifecycle'
import type { OnboardingTemplate, OnboardingTemplateItem, ResponsibleRole } from '@/lib/types/lifecycle'

const CATEGORIES: TemplateItemInput['category'][] = ['docs', 'access', 'training', 'meeting', 'equipment', 'other']
const CATEGORY_LABEL: Record<TemplateItemInput['category'], string> = {
    docs: 'Dokumenty',
    access: 'Dostępy',
    training: 'Szkolenie',
    meeting: 'Spotkanie',
    equipment: 'Sprzęt',
    other: 'Inne',
}

const RESPONSIBLE: ResponsibleRole[] = ['employee', 'manager', 'buddy', 'tcm', 'admin']
const RESPONSIBLE_LABEL: Record<ResponsibleRole, string> = {
    employee: 'Pracownik',
    manager: 'Manager',
    buddy: 'Buddy',
    tcm: 'TCM',
    admin: 'Admin',
}

interface Props {
    template: OnboardingTemplate
    items: OnboardingTemplateItem[]
}

export function TemplateEditor({ template, items: initialItems }: Props) {
    const router = useRouter()
    const [items, setItems] = useState<OnboardingTemplateItem[]>(initialItems)
    const [editingItemId, setEditingItemId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState(template.name)
    const [editingDesc, setEditingDesc] = useState(template.description ?? '')
    const [isDefault, setIsDefault] = useState(template.is_default)
    const [showAddForm, setShowAddForm] = useState(false)
    const [isPending, startTransition] = useTransition()

    function refresh() {
        router.refresh()
    }

    function handleSaveMeta() {
        startTransition(async () => {
            try {
                await updateTemplate(template.id, {
                    name: editingName.trim(),
                    description: editingDesc.trim() || null,
                    isDefault,
                })
                toastSuccess('Metadane szablonu zapisane.')
                refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd zapisu.')
            }
        })
    }

    function handleDeleteTemplate() {
        if (!confirm(`Usunąć szablon "${template.name}"? Jeśli ktokolwiek go używał, zostanie zarchiwizowany. W przeciwnym razie — usunięty trwale.`)) return
        startTransition(async () => {
            try {
                await deleteTemplate(template.id)
                toastSuccess('Szablon usunięty.')
                router.push('/internal/lifecycle/templates')
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd usuwania.')
            }
        })
    }

    function handleAddItem(input: TemplateItemInput) {
        startTransition(async () => {
            try {
                await addTemplateItem(template.id, input)
                toastSuccess(`Item "${input.title}" dodany.`)
                setShowAddForm(false)
                refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd dodania.')
            }
        })
    }

    function handleUpdateItem(itemId: string, updates: Partial<TemplateItemInput>) {
        startTransition(async () => {
            try {
                await updateTemplateItem(itemId, updates)
                toastSuccess('Item zaktualizowany.')
                setEditingItemId(null)
                refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd zapisu.')
            }
        })
    }

    function handleDeleteItem(itemId: string, title: string) {
        if (!confirm(`Usunąć item "${title}"?`)) return
        startTransition(async () => {
            try {
                await deleteTemplateItem(itemId)
                toastSuccess('Item usunięty.')
                refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd usuwania.')
            }
        })
    }

    function handleMove(index: number, direction: -1 | 1) {
        const newIndex = index + direction
        if (newIndex < 0 || newIndex >= items.length) return
        const reordered = [...items]
        const [moved] = reordered.splice(index, 1)
        reordered.splice(newIndex, 0, moved)
        // Optimistic UI
        setItems(reordered)
        startTransition(async () => {
            try {
                await reorderTemplateItems(template.id, reordered.map((i) => i.id))
                refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd reorder.')
                setItems(initialItems)
            }
        })
    }

    return (
        <div className="space-y-6">
            {/* Metadata */}
            <section className="rounded-lg border bg-card p-4 space-y-3">
                <h2 className="font-semibold">Metadane szablonu</h2>
                <div>
                    <label className="text-xs text-muted-foreground">Nazwa</label>
                    <input
                        type="text"
                        className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-xs text-muted-foreground">Opis</label>
                    <textarea
                        className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                        rows={2}
                        value={editingDesc}
                        onChange={(e) => setEditingDesc(e.target.value)}
                    />
                </div>
                <div>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={isDefault}
                            onChange={(e) => setIsDefault(e.target.checked)}
                            className="h-4 w-4"
                        />
                        <span>Domyślny szablon dla roli <strong>{template.target_role}</strong></span>
                    </label>
                    <p className="text-xs text-muted-foreground pl-6 mt-1">
                        Tylko jeden szablon może być domyślny per rola. Zaznaczenie odznaczy poprzedni default.
                    </p>
                </div>
                <div className="flex gap-2 justify-between">
                    <Button onClick={handleSaveMeta} disabled={isPending} size="sm">
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Zapisz metadane
                    </Button>
                    <Button onClick={handleDeleteTemplate} disabled={isPending} variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Usuń szablon
                    </Button>
                </div>
            </section>

            {/* Items */}
            <section className="rounded-lg border bg-card overflow-hidden">
                <div className="bg-muted/50 p-3 border-b flex items-center justify-between">
                    <h2 className="font-semibold">Items ({items.length})</h2>
                    <Button size="sm" onClick={() => setShowAddForm(true)} disabled={isPending}>
                        <Plus className="h-4 w-4 mr-1" />
                        Dodaj item
                    </Button>
                </div>

                {showAddForm && (
                    <ItemForm
                        onSave={(input) => handleAddItem(input)}
                        onCancel={() => setShowAddForm(false)}
                        isPending={isPending}
                    />
                )}

                <ul className="divide-y">
                    {items.map((item, idx) => (
                        <li key={item.id} className="p-4">
                            {editingItemId === item.id ? (
                                <ItemForm
                                    initial={item}
                                    onSave={(input) => handleUpdateItem(item.id, input)}
                                    onCancel={() => setEditingItemId(null)}
                                    isPending={isPending}
                                />
                            ) : (
                                <div className="flex items-start gap-3">
                                    <div className="flex flex-col gap-0.5">
                                        <button
                                            type="button"
                                            onClick={() => handleMove(idx, -1)}
                                            disabled={idx === 0 || isPending}
                                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                                            title="Przesuń wyżej"
                                        >
                                            <ArrowUp className="h-3 w-3" />
                                        </button>
                                        <span className="text-xs text-muted-foreground font-mono w-5 text-center">{idx + 1}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleMove(idx, 1)}
                                            disabled={idx === items.length - 1 || isPending}
                                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                                            title="Przesuń niżej"
                                        >
                                            <ArrowDown className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-medium">
                                            {item.title}
                                            {!item.is_required && (
                                                <span className="text-xs text-muted-foreground ml-2">(opcjonalne)</span>
                                            )}
                                        </div>
                                        {item.description && (
                                            <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                                            <span className="px-2 py-0.5 rounded bg-muted">{CATEGORY_LABEL[item.category]}</span>
                                            <span className="text-muted-foreground">
                                                {RESPONSIBLE_LABEL[item.responsible_role]} • +{item.due_offset_days}d
                                            </span>
                                            {item.requires_file && <span className="text-info">📎 plik</span>}
                                            {item.course_slug && (
                                                <Link href={`/learning/${item.course_slug}`} className="text-info hover:underline">
                                                    🎓 {item.course_slug}
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => setEditingItemId(item.id)} disabled={isPending}>
                                            Edytuj
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleDeleteItem(item.id, item.title)}
                                            disabled={isPending}
                                            className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>

                {items.length === 0 && !showAddForm && (
                    <p className="p-8 text-sm text-muted-foreground text-center">
                        Brak items. Kliknij "Dodaj item" by zacząć budowanie checklist'a.
                    </p>
                )}
            </section>
        </div>
    )
}

interface ItemFormProps {
    initial?: OnboardingTemplateItem
    onSave: (input: TemplateItemInput) => void
    onCancel: () => void
    isPending: boolean
}

function ItemForm({ initial, onSave, onCancel, isPending }: ItemFormProps) {
    const [title, setTitle] = useState(initial?.title ?? '')
    const [description, setDescription] = useState(initial?.description ?? '')
    const [category, setCategory] = useState<TemplateItemInput['category']>(initial?.category ?? 'other')
    const [responsibleRole, setResponsibleRole] = useState<ResponsibleRole>(initial?.responsible_role ?? 'employee')
    const [dueOffsetDays, setDueOffsetDays] = useState<number>(initial?.due_offset_days ?? 7)
    const [requiresFile, setRequiresFile] = useState(initial?.requires_file ?? false)
    const [courseSlug, setCourseSlug] = useState(initial?.course_slug ?? '')
    const [isRequired, setIsRequired] = useState(initial?.is_required ?? true)

    function handleSubmit() {
        if (!title.trim()) {
            toast.error('Tytuł jest wymagany.')
            return
        }
        onSave({
            category,
            title: title.trim(),
            description: description.trim() || null,
            due_offset_days: dueOffsetDays,
            requires_file: requiresFile,
            course_slug: courseSlug.trim() || null,
            responsible_role: responsibleRole,
            is_required: isRequired,
        })
    }

    return (
        <div className="rounded border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{initial ? 'Edytuj item' : 'Nowy item'}</h3>
                <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div>
                <label className="text-xs text-muted-foreground">Tytuł *</label>
                <input
                    type="text"
                    className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="np. Podpisz kontrakt B2B"
                />
            </div>

            <div>
                <label className="text-xs text-muted-foreground">Opis</label>
                <textarea
                    className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-muted-foreground">Kategoria</label>
                    <select
                        className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                        value={category}
                        onChange={(e) => setCategory(e.target.value as TemplateItemInput['category'])}
                    >
                        {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-muted-foreground">Odpowiedzialny</label>
                    <select
                        className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                        value={responsibleRole}
                        onChange={(e) => setResponsibleRole(e.target.value as ResponsibleRole)}
                    >
                        {RESPONSIBLE.map((r) => (
                            <option key={r} value={r}>{RESPONSIBLE_LABEL[r]}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-muted-foreground">Termin (dni od hire_date)</label>
                    <input
                        type="number"
                        min="0"
                        className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                        value={dueOffsetDays}
                        onChange={(e) => setDueOffsetDays(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                </div>
                <div>
                    <label className="text-xs text-muted-foreground">Course slug (Akademia, opcjonalnie)</label>
                    <input
                        type="text"
                        className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                        value={courseSlug}
                        onChange={(e) => setCourseSlug(e.target.value)}
                        placeholder="onboarding-b2b-network"
                    />
                </div>
            </div>

            <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={requiresFile} onChange={(e) => setRequiresFile(e.target.checked)} className="h-4 w-4" />
                    Wymaga wgrania pliku
                </label>
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="h-4 w-4" />
                    Wymagane do zakończenia onboardingu
                </label>
            </div>

            <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
                    Anuluj
                </Button>
                <Button size="sm" onClick={handleSubmit} disabled={isPending}>
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    {initial ? 'Zapisz zmiany' : 'Dodaj item'}
                </Button>
            </div>
        </div>
    )
}

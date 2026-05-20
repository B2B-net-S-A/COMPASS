'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    ArrowDown,
    ArrowUp,
    Eye,
    EyeOff,
    FileUp,
    Loader2,
    Pencil,
    Plus,
    Save,
    Trash2,
    X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
    createCategory,
    deleteCategory,
    reorderCategories,
    updateCategory,
} from '@/lib/actions/support-categories-admin'
import {
    deleteCategoryMaterial,
    listCategoryMaterials,
    uploadCategoryMaterialForm,
} from '@/lib/actions/support-materials'
import type { CategoryMaterial, SupportCategory } from '@/lib/types/support'

interface CategoryWithMaterials extends SupportCategory {
    materials?: CategoryMaterial[]
    articleCount?: number
}

interface Props {
    initialCategories: SupportCategory[]
    articleCounts: Record<string, number>
    materialsByCategory: Record<string, CategoryMaterial[]>
}

export function CategoryManager({ initialCategories, articleCounts, materialsByCategory }: Props) {
    const router = useRouter()
    const [categories, setCategories] = useState<CategoryWithMaterials[]>(
        initialCategories.map((c) => ({
            ...c,
            articleCount: articleCounts[c.id] ?? 0,
            materials: materialsByCategory[c.id] ?? [],
        })),
    )
    const [editingId, setEditingId] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [showCreate, setShowCreate] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const refresh = () => router.refresh()

    const handleToggleActive = (cat: CategoryWithMaterials) => {
        setError(null)
        startTransition(async () => {
            const res = await updateCategory(cat.id, { is_active: !cat.is_active })
            if (!res.success) { setError(res.error); return }
            setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, is_active: res.data.is_active } : c)))
        })
    }

    const handleMove = (index: number, direction: -1 | 1) => {
        const newIndex = index + direction
        if (newIndex < 0 || newIndex >= categories.length) return
        const next = [...categories]
        const [moved] = next.splice(index, 1)
        next.splice(newIndex, 0, moved)
        setCategories(next)
        setError(null)
        startTransition(async () => {
            const res = await reorderCategories(next.map((c) => c.id))
            if (!res.success) {
                setError(res.error)
                setCategories(categories) // revert
            }
        })
    }

    const handleDelete = (cat: CategoryWithMaterials) => {
        const hasContent = (cat.articleCount ?? 0) > 0 || (cat.materials?.length ?? 0) > 0
        const msg = hasContent
            ? `Kategoria "${cat.name_pl}" zawiera ${cat.articleCount ?? 0} artykułów i ${cat.materials?.length ?? 0} materiałów. Zostanie ukryta (soft-delete). Kontynuować?`
            : `Usunąć kategorię "${cat.name_pl}" trwale?`
        if (!confirm(msg)) return

        setError(null)
        startTransition(async () => {
            const res = await deleteCategory(cat.id)
            if (!res.success) { setError(res.error); return }
            if (res.data.softDeleted) {
                setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, is_active: false } : c)))
            } else {
                setCategories((prev) => prev.filter((c) => c.id !== cat.id))
            }
            refresh()
        })
    }

    return (
        <div className="space-y-4">
            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
            )}

            <div className="flex justify-end">
                <Button onClick={() => setShowCreate(true)} className="gap-2" disabled={showCreate}>
                    <Plus className="w-4 h-4" /> Nowa kategoria
                </Button>
            </div>

            {showCreate && (
                <CategoryCreateForm
                    nextSortOrder={(categories.at(-1)?.sort_order ?? 0) + 10}
                    onCancel={() => setShowCreate(false)}
                    onCreated={(cat) => {
                        setCategories((prev) => [...prev, { ...cat, articleCount: 0, materials: [] }])
                        setShowCreate(false)
                        refresh()
                    }}
                />
            )}

            <div className="space-y-2">
                {categories.map((cat, index) => (
                    <Card key={cat.id} className={`bg-white/5 border-white/10 ${!cat.is_active ? 'opacity-60' : ''}`}>
                        <CardContent className="p-4">
                            {editingId === cat.id ? (
                                <CategoryEditForm
                                    category={cat}
                                    onCancel={() => setEditingId(null)}
                                    onSaved={(updated) => {
                                        setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, ...updated } : c)))
                                        setEditingId(null)
                                    }}
                                />
                            ) : (
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-semibold">{cat.name_pl}</h3>
                                            <Badge variant="outline" className="text-[10px]">{cat.slug}</Badge>
                                            {!cat.is_active && (
                                                <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                                                    Ukryta
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {cat.articleCount ?? 0} {cat.articleCount === 1 ? 'artykuł' : 'artykułów'}
                                            {' · '}
                                            {cat.materials?.length ?? 0} {cat.materials?.length === 1 ? 'materiał' : 'materiałów'}
                                            {' · ikona: '}{cat.icon}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleMove(index, -1)}
                                            disabled={isPending || index === 0}
                                            title="W górę"
                                        >
                                            <ArrowUp className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleMove(index, 1)}
                                            disabled={isPending || index === categories.length - 1}
                                            title="W dół"
                                        >
                                            <ArrowDown className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleToggleActive(cat)}
                                            disabled={isPending}
                                            title={cat.is_active ? 'Ukryj' : 'Pokaż'}
                                        >
                                            {cat.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setExpandedId(expandedId === cat.id ? null : cat.id)}
                                            title="Materiały"
                                            className="gap-1"
                                        >
                                            <FileUp className="w-4 h-4" />
                                            <span className="text-xs">{cat.materials?.length ?? 0}</span>
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingId(cat.id)} title="Edytuj">
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleDelete(cat)}
                                            disabled={isPending}
                                            className="text-red-400 hover:text-red-300"
                                            title="Usuń"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {expandedId === cat.id && editingId !== cat.id && (
                                <MaterialsPanel
                                    categoryId={cat.id}
                                    initialMaterials={cat.materials ?? []}
                                    onChange={(materials) =>
                                        setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, materials } : c)))
                                    }
                                />
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {categories.length === 0 && (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-12 text-center text-muted-foreground">
                        Brak kategorii.
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

function CategoryEditForm({
    category,
    onCancel,
    onSaved,
}: {
    category: SupportCategory
    onCancel: () => void
    onSaved: (updated: SupportCategory) => void
}) {
    const [namePl, setNamePl] = useState(category.name_pl)
    const [nameEn, setNameEn] = useState(category.name_en)
    const [icon, setIcon] = useState(category.icon)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const save = () => {
        setError(null)
        startTransition(async () => {
            const res = await updateCategory(category.id, { name_pl: namePl, name_en: nameEn, icon })
            if (!res.success) { setError(res.error); return }
            onSaved(res.data)
        })
    }

    return (
        <div className="space-y-3">
            {error && <div className="text-xs text-red-400">{error}</div>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nazwa PL *</label>
                    <Input value={namePl} onChange={(e) => setNamePl(e.target.value)} disabled={isPending} />
                </div>
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nazwa EN</label>
                    <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} disabled={isPending} />
                </div>
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Ikona (lucide)</label>
                    <Input value={icon} onChange={(e) => setIcon(e.target.value)} disabled={isPending} placeholder="HelpCircle" />
                </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Slug ({category.slug}) jest niezmienialny — chroni linki i odwołania.</p>
            <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending} className="gap-2">
                    <X className="w-4 h-4" /> Anuluj
                </Button>
                <Button size="sm" onClick={save} disabled={isPending} className="gap-2">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Zapisz
                </Button>
            </div>
        </div>
    )
}

function CategoryCreateForm({
    nextSortOrder,
    onCancel,
    onCreated,
}: {
    nextSortOrder: number
    onCancel: () => void
    onCreated: (cat: SupportCategory) => void
}) {
    const [slug, setSlug] = useState('')
    const [namePl, setNamePl] = useState('')
    const [icon, setIcon] = useState('HelpCircle')
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const create = () => {
        setError(null)
        startTransition(async () => {
            const res = await createCategory({ slug, name_pl: namePl, icon, sort_order: nextSortOrder })
            if (!res.success) { setError(res.error); return }
            onCreated(res.data)
        })
    }

    return (
        <Card className="bg-primary/5 border-primary/30">
            <CardContent className="p-4 space-y-3">
                {error && <div className="text-xs text-red-400">{error}</div>}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Slug *</label>
                        <Input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={isPending} placeholder="np. dokumenty_prawne" />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Nazwa PL *</label>
                        <Input value={namePl} onChange={(e) => setNamePl(e.target.value)} disabled={isPending} placeholder="np. Dokumenty prawne" />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Ikona (lucide)</label>
                        <Input value={icon} onChange={(e) => setIcon(e.target.value)} disabled={isPending} />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending} className="gap-2">
                        <X className="w-4 h-4" /> Anuluj
                    </Button>
                    <Button size="sm" onClick={create} disabled={isPending || !slug || !namePl} className="gap-2">
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Utwórz
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

function MaterialsPanel({
    categoryId,
    initialMaterials,
    onChange,
}: {
    categoryId: string
    initialMaterials: CategoryMaterial[]
    onChange: (materials: CategoryMaterial[]) => void
}) {
    const [materials, setMaterials] = useState<CategoryMaterial[]>(initialMaterials)
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const update = (next: CategoryMaterial[]) => {
        setMaterials(next)
        onChange(next)
    }

    const upload = () => {
        if (!file) { setError('Wybierz plik.'); return }
        if (!title.trim()) { setError('Podaj tytuł materiału.'); return }
        setError(null)
        startTransition(async () => {
            const fd = new FormData()
            fd.set('category_id', categoryId)
            fd.set('title', title.trim())
            if (description.trim()) fd.set('description', description.trim())
            fd.set('file', file)
            const res = await uploadCategoryMaterialForm(fd)
            if (!res.success) { setError(res.error); return }
            update([...materials, res.data])
            setTitle('')
            setDescription('')
            setFile(null)
            // Reset native file input
            const input = document.getElementById(`file-input-${categoryId}`) as HTMLInputElement | null
            if (input) input.value = ''
        })
    }

    const remove = (id: string) => {
        if (!confirm('Usunąć materiał?')) return
        setError(null)
        startTransition(async () => {
            const res = await deleteCategoryMaterial(id)
            if (!res.success) { setError(res.error); return }
            update(materials.filter((m) => m.id !== id))
        })
    }

    const refreshList = async () => {
        const res = await listCategoryMaterials(categoryId)
        if (res.success) update(res.data)
    }
    void refreshList // for future use

    return (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
                <FileUp className="w-4 h-4 text-primary" /> Materiały do pobrania
            </h4>

            {error && <div className="text-xs text-red-400">{error}</div>}

            {materials.length > 0 ? (
                <div className="space-y-1">
                    {materials.map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-white/5 border border-white/10">
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{m.title}</div>
                                <div className="text-[10px] text-muted-foreground">
                                    {m.file_name} · {(m.file_size / 1024).toFixed(0)} KB · {m.mime_type}
                                </div>
                            </div>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => remove(m.id)}
                                disabled={isPending}
                                className="text-red-400 hover:text-red-300"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">Brak materiałów. Dodaj pierwszy poniżej.</p>
            )}

            <div className="space-y-2 p-3 rounded-md bg-white/5 border border-dashed border-white/10">
                <Input
                    placeholder="Tytuł materiału (np. Regulamin Multisport)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={isPending}
                />
                <Textarea
                    placeholder="Opis (opcjonalnie)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    disabled={isPending}
                />
                <input
                    id={`file-input-${categoryId}`}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    disabled={isPending}
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
                <Button size="sm" onClick={upload} disabled={isPending || !file || !title.trim()} className="gap-2">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                    Wgraj materiał
                </Button>
            </div>
        </div>
    )
}

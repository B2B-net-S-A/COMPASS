'use client'

// Phase 24c — per-user snippets manager. Pracownik tworzy/edytuje/usuwa swoje
// szablony opisu usług. RLS w DB zapewnia że widzi tylko swoje.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import {
    createTemplate,
    deleteTemplate,
    updateTemplate,
    type TimesheetUserTemplate,
} from '@/lib/actions/internal-timesheet-templates'

interface Props {
    initialTemplates: TimesheetUserTemplate[]
}

interface FormState {
    id?: string
    name: string
    description: string
    project: string
    sortOrder: number
}

const EMPTY_FORM: FormState = {
    name: '',
    description: '',
    project: '',
    sortOrder: 0,
}

export function TimesheetTemplatesManager({ initialTemplates }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [confirm, ConfirmUI] = useConfirm()

    function openCreate() {
        setForm(EMPTY_FORM)
        setDialogOpen(true)
    }

    function openEdit(t: TimesheetUserTemplate) {
        setForm({
            id: t.id,
            name: t.name,
            description: t.description,
            project: t.project ?? '',
            sortOrder: t.sort_order,
        })
        setDialogOpen(true)
    }

    function handleSave() {
        startTransition(async () => {
            try {
                if (form.id) {
                    await updateTemplate({
                        id: form.id,
                        name: form.name,
                        description: form.description,
                        project: form.project || null,
                        sortOrder: form.sortOrder,
                    })
                    toastSuccess('Zaktualizowano')
                } else {
                    await createTemplate({
                        name: form.name,
                        description: form.description,
                        project: form.project || null,
                        sortOrder: form.sortOrder,
                    })
                    toastSuccess('Snippet utworzony')
                }
                setDialogOpen(false)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    async function handleDelete(t: TimesheetUserTemplate) {
        const ok = await confirm({
            title: 'Usunąć snippet?',
            description: `„${t.name}” zostanie trwale usunięty.`,
            confirmLabel: 'Usuń',
            variant: 'destructive',
        })
        if (!ok) return
        startTransition(async () => {
            try {
                await deleteTemplate(t.id)
                toastSuccess('Usunięto')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">
                        Snippety ({initialTemplates.length})
                    </CardTitle>
                    <Button size="sm" onClick={openCreate} disabled={pending}>
                        <Plus className="h-4 w-4 mr-1" />
                        Nowy snippet
                    </Button>
                </CardHeader>
                <CardContent>
                    {initialTemplates.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            Brak snippetów. Kliknij „Nowy snippet”, aby utworzyć pierwszy.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {initialTemplates.map((t) => (
                                <div
                                    key={t.id}
                                    className="border rounded-md p-3 flex flex-wrap items-start gap-3 justify-between"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-sm">{t.name}</span>
                                            {t.project && (
                                                <span className="text-[11px] text-muted-foreground">
                                                    · {t.project}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                                            {t.description.slice(0, 200)}
                                            {t.description.length > 200 ? '…' : ''}
                                        </p>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            aria-label={`Edytuj szablon „${t.name}”`}
                                            title="Edytuj szablon"
                                            onClick={() => openEdit(t)}
                                            disabled={pending}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            aria-label={`Usuń szablon „${t.name}”`}
                                            title="Usuń szablon"
                                            onClick={() => handleDelete(t)}
                                            disabled={pending}
                                            className="text-muted-foreground hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{form.id ? 'Edytuj snippet' : 'Nowy snippet'}</DialogTitle>
                        <DialogDescription className="text-xs">
                            Snippet wstawisz do timesheet jednym klikiem (dropdown „Wstaw snippet” w
                            oknie wpisu).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs" htmlFor="tpl_name">
                                Nazwa snippetu
                            </Label>
                            <Input
                                id="tpl_name"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="np. Konsultacje SAP"
                                maxLength={80}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs" htmlFor="tpl_project">
                                Projekt domyślny (opcjonalny)
                            </Label>
                            <Input
                                id="tpl_project"
                                value={form.project}
                                onChange={(e) => setForm({ ...form, project: e.target.value })}
                                placeholder="np. B2B Network"
                                maxLength={100}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs" htmlFor="tpl_desc">
                                Treść opisu usług
                            </Label>
                            <Textarea
                                id="tpl_desc"
                                rows={4}
                                value={form.description}
                                onChange={(e) =>
                                    setForm({ ...form, description: e.target.value })
                                }
                                placeholder="np. Konsultacje techniczne SAP S/4HANA — moduł FI/CO"
                                maxLength={2000}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs" htmlFor="tpl_sort">
                                Sortowanie (niższe = wyżej)
                            </Label>
                            <Input
                                id="tpl_sort"
                                type="number"
                                value={form.sortOrder}
                                onChange={(e) =>
                                    setForm({ ...form, sortOrder: Number(e.target.value) || 0 })
                                }
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Anuluj
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={
                                pending ||
                                !form.name.trim() ||
                                !form.description.trim()
                            }
                        >
                            {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                            {form.id ? 'Zapisz zmiany' : 'Utwórz snippet'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ConfirmUI />
        </>
    )
}

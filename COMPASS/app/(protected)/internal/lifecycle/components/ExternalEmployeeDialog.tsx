'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ExternalLink, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { createExternalEmployee, listBuddyCandidates, listTemplateChoices, type TemplateChoice } from '@/lib/actions/lifecycle'
import { roleLabelPl, type DbRole } from '@/lib/types/role'

const ROLE_OPTIONS: Array<{ value: DbRole; label: string }> = [
    { value: 'consultant', label: 'Konsultant IT' },
    { value: 'internal', label: 'Konsultant wewnętrzny' },
    { value: 'manager', label: 'Manager' },
    { value: 'finanse', label: 'Finanse' },
    { value: 'talent_community', label: 'Talent Community Manager' },
]

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ExternalEmployeeDialog({ open, onOpenChange }: Props) {
    const router = useRouter()
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<DbRole>('consultant')
    const [hiredAt, setHiredAt] = useState(new Date().toISOString().split('T')[0])
    const [managerId, setManagerId] = useState('')
    const [buddyId, setBuddyId] = useState('')
    const [externalNotes, setExternalNotes] = useState('')
    const [templateId, setTemplateId] = useState('')
    const [autoStart, setAutoStart] = useState(true)
    const [managers, setManagers] = useState<Array<{ id: string; full_name: string | null; email: string; role: DbRole }>>([])
    const [buddies, setBuddies] = useState<Array<{ id: string; full_name: string | null; email: string; role: DbRole }>>([])
    const [templates, setTemplates] = useState<TemplateChoice[]>([])
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        if (!open) return
        // Use a dummy UUID for buddy lookup (we don't have user yet); just fetch all candidates
        Promise.all([
            listBuddyCandidates('00000000-0000-0000-0000-000000000000'),
            listTemplateChoices(),
        ])
            .then(([cands, tpls]) => {
                setManagers(cands.filter((c) => c.role === 'admin' || c.role === 'manager'))
                setBuddies(cands)
                setTemplates(tpls)
            })
            .catch(() => undefined)
    }, [open])

    useEffect(() => {
        if (!templateId && templates.length > 0) {
            const def = templates.find((t) => t.target_role === role && t.is_default)
            if (def) setTemplateId(def.id)
        }
    }, [role, templates, templateId])

    function reset() {
        setFullName('')
        setEmail('')
        setRole('consultant')
        setHiredAt(new Date().toISOString().split('T')[0])
        setManagerId('')
        setBuddyId('')
        setExternalNotes('')
        setTemplateId('')
        setAutoStart(true)
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!fullName.trim()) { toast.error('Imię i nazwisko są wymagane.'); return }
        if (!email.trim()) { toast.error('Email jest wymagany.'); return }
        if (!hiredAt) { toast.error('Data zatrudnienia jest wymagana.'); return }
        startTransition(async () => {
            try {
                const result = await createExternalEmployee({
                    fullName: fullName.trim(),
                    email: email.trim().toLowerCase(),
                    role,
                    hiredAt,
                    managerId: managerId || null,
                    buddyId: buddyId || null,
                    externalNotes: externalNotes.trim() || null,
                    templateId: templateId || null,
                    autoStartOnboarding: autoStart,
                })
                toastSuccess(`External pracownik utworzony: ${fullName}.`)
                reset()
                onOpenChange(false)
                if (result.progressId) {
                    router.push(`/internal/lifecycle/onboarding/${result.progressId}`)
                } else {
                    router.refresh()
                }
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Nie udało się utworzyć external pracownika.')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ExternalLink className="h-5 w-5 text-amber-400" />
                        Dodaj external pracownika
                    </DialogTitle>
                    <DialogDescription>
                        Dla osoby która <strong>nie korzysta z Compass</strong> (brak konta, brak loginu).
                        TCM zarządza onboardingiem ręcznie (oznacza taski w jej imieniu).
                        Wszystkie email-powiadomienia wysyłane są na podany adres (poza systemem).
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5 col-span-2">
                            <Label htmlFor="ext-fullname">Imię i nazwisko *</Label>
                            <Input
                                id="ext-fullname"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <Label htmlFor="ext-email">Email kontaktowy *</Label>
                            <Input
                                id="ext-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="zewnetrzny@firma.pl"
                                required
                            />
                            <p className="text-xs text-muted-foreground">
                                Domena może być dowolna (nie tylko @b2bnetwork.pl) bo ta osoba nie loguje się do Compass.
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ext-role">Rola</Label>
                            <select
                                id="ext-role"
                                className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                                value={role}
                                onChange={(e) => setRole(e.target.value as DbRole)}
                            >
                                {ROLE_OPTIONS.map((r) => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ext-hired">Data zatrudnienia *</Label>
                            <Input
                                id="ext-hired"
                                type="date"
                                value={hiredAt}
                                onChange={(e) => setHiredAt(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="ext-manager">Manager (opcjonalnie)</Label>
                        <select
                            id="ext-manager"
                            className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={managerId}
                            onChange={(e) => setManagerId(e.target.value)}
                        >
                            <option value="">Brak (akceptacje admin)</option>
                            {managers.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.full_name ?? m.email} ({roleLabelPl(m.role as DbRole)})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="ext-buddy">Buddy (opcjonalnie)</Label>
                        <select
                            id="ext-buddy"
                            className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={buddyId}
                            onChange={(e) => setBuddyId(e.target.value)}
                        >
                            <option value="">Brak</option>
                            {buddies.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.full_name ?? b.email}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="ext-notes">Notatka kontekstowa (opcjonalnie)</Label>
                        <textarea
                            id="ext-notes"
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            rows={2}
                            placeholder="np. Zewnętrzny developer kontraktowy, nie ma dostępu do M365"
                            value={externalNotes}
                            onChange={(e) => setExternalNotes(e.target.value)}
                        />
                    </div>

                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={autoStart}
                                onChange={(e) => setAutoStart(e.target.checked)}
                                className="h-4 w-4"
                            />
                            <span>Uruchom onboarding od razu</span>
                        </label>
                        {autoStart && (
                            <div className="pl-6 space-y-1.5">
                                <Label htmlFor="ext-template" className="text-xs">Szablon onboardingu</Label>
                                <select
                                    id="ext-template"
                                    className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={templateId}
                                    onChange={(e) => setTemplateId(e.target.value)}
                                >
                                    <option value="">Auto (default dla roli)</option>
                                    {templates.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name} ({t.items_count} items)
                                            {t.is_default ? ' ★' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="rounded border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-muted-foreground">
                        <strong>Uwaga:</strong> external pracownik nie loguje się do Compass.
                        Nie dostanie push-notifikacji ani nie zobaczy swojej checklist'a.
                        TCM oznacza taski w jego imieniu. Email-powiadomienia są wysyłane na podany adres.
                    </div>

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                            Utwórz external
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

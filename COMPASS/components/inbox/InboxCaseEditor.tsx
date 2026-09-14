'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { updateInboxWorkspace } from '@/lib/actions/support-inbox'
import { AREA_LABELS, getInboxArea } from '@/lib/inbox/workspace'
import { inboxEditSchema, type InboxEditInput } from '@/lib/inbox/validation'
import type { InboxTicketWithMeta } from '@/lib/types/support'

export interface InboxOptions {
    categories: Array<{ id: string; slug: string; name_pl: string }>
    handlers: Array<{ id: string; full_name: string | null; email: string }>
}
function draftFrom(ticket: InboxTicketWithMeta): InboxEditInput {
    return {
        subject: ticket.subject, body_md: ticket.body_md, category_id: ticket.category_id,
        assignee_id: ticket.assignee_id, work_area: getInboxArea(ticket), priority_level: ticket.meta.priority_level,
        planned_due_date: ticket.meta.planned_due_date ?? null, waiting_for: ticket.meta.waiting_for ?? null,
        follow_up_date: ticket.meta.follow_up_date ?? null, checklist: ticket.meta.checklist ?? [], materials: ticket.meta.materials ?? [],
    }
}
export const fieldClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground'

export function InboxCaseEditor({ ticket, categories, handlers, onSaved, onDirtyChange }: InboxOptions & {
    ticket: InboxTicketWithMeta
    onSaved: () => void
    onDirtyChange?: (dirty: boolean) => void
}) {
    const [draft, setDraft] = useState(() => draftFrom(ticket))
    const [baseline, setBaseline] = useState(() => draftFrom(ticket))
    const [version, setVersion] = useState(ticket.updated_at)
    const [error, setError] = useState<string | null>(null)
    const [pending, setPending] = useState(false)
    const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)
    useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
    useEffect(() => {
        if (!dirty) {
            const next = draftFrom(ticket)
            setDraft(next); setBaseline(next); setVersion(ticket.updated_at)
        }
        // Preserve local changes when a realtime update arrives.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticket])
    function change<K extends keyof InboxEditInput>(key: K, value: InboxEditInput[K]) {
        setDraft((current) => ({ ...current, [key]: value }))
    }
    function reset() {
        const next = draftFrom(ticket)
        setDraft(next); setBaseline(next); setVersion(ticket.updated_at); setError(null)
    }
    function save(event: React.FormEvent) {
        event.preventDefault()
        const parsed = inboxEditSchema.safeParse(draft)
        if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Sprawdź dane formularza'); return }
        setError(null)
        setPending(true)
        void (async () => {
            try {
            const result = await updateInboxWorkspace(ticket.id, version, parsed.data)
            if (!result.success) { setError(result.error); onSaved(); return }
            setBaseline(draft)
            toast.success('Zmiany zapisane')
            onSaved()
            } catch { setError('Nie udało się zapisać zmian. Spróbuj ponownie.') }
            finally { setPending(false) }
        })()
    }
    return <form onSubmit={save} className="space-y-4">
        <fieldset disabled={pending} className="space-y-4">
            <label className="block space-y-1 text-sm font-medium">Tytuł sprawy<Input value={draft.subject} onChange={(e) => change('subject', e.target.value)} maxLength={200} required /></label>
            <label className="block space-y-1 text-sm font-medium">Opis<Textarea value={draft.body_md} onChange={(e) => change('body_md', e.target.value)} rows={4} maxLength={20000} required /></label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium">Obszar<select className={fieldClass} value={draft.work_area} onChange={(e) => change('work_area', e.target.value as InboxEditInput['work_area'])}>{Object.entries(AREA_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label className="space-y-1 text-sm font-medium">Typ sprawy<select className={fieldClass} value={draft.category_id} onChange={(e) => change('category_id', e.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name_pl}</option>)}</select></label>
                <label className="space-y-1 text-sm font-medium">Osoba odpowiedzialna<select className={fieldClass} value={draft.assignee_id ?? ''} onChange={(e) => change('assignee_id', e.target.value || null)}>
                    <option value="">Nieprzypisana</option>
                    {ticket.assignee_id && !handlers.some((handler) => handler.id === ticket.assignee_id) && <option value={ticket.assignee_id}>{ticket.assignee_name ?? 'Dotychczasowa osoba'}</option>}
                    {handlers.map((handler) => <option key={handler.id} value={handler.id}>{handler.full_name ?? handler.email}</option>)}
                </select></label>
                <label className="space-y-1 text-sm font-medium">Priorytet<select className={fieldClass} value={draft.priority_level} onChange={(e) => change('priority_level', e.target.value as InboxEditInput['priority_level'])}><option value="P1">P1 · Pilny</option><option value="P2">P2 · Wysoki</option><option value="P3">P3 · Zwykły</option></select></label>
                <label className="space-y-1 text-sm font-medium">Termin realizacji<Input type="date" min="2000-01-01" max="2100-12-31" value={draft.planned_due_date ?? ''} onChange={(e) => change('planned_due_date', e.target.value || null)} /></label>
                <label className="space-y-1 text-sm font-medium">Data ponownego kontaktu<Input type="date" min="2000-01-01" max="2100-12-31" value={draft.follow_up_date ?? ''} onChange={(e) => change('follow_up_date', e.target.value || null)} /></label>
            </div>
            <p className="text-xs text-muted-foreground">Termin realizacji ma pierwszeństwo na tablicy. {draft.work_area === 'marketing' ? 'W Marketingu ustal go zgodnie z datą publikacji lub kampanii.' : 'Bez niego tablica korzysta z dotychczasowego SLA.'} Zmiana priorytetu nie przesuwa istniejącego terminu.</p>
            <label className="block space-y-1 text-sm font-medium">Na kogo / na co czekamy<Input value={draft.waiting_for ?? ''} onChange={(e) => change('waiting_for', e.target.value || null)} maxLength={300} placeholder="np. akceptacja grafiki przez klienta" /></label>
            <section className="space-y-2 rounded-lg border p-3" aria-label="Checklista">
                <h3 className="font-semibold text-sm">Checklista ({draft.checklist.filter((item) => item.done).length}/{draft.checklist.length})</h3>
                {draft.checklist.map((item, index) => <div className="flex items-center gap-2" key={item.id}>
                    <input type="checkbox" checked={item.done} aria-label={`Wykonano: ${item.text || `punkt ${index + 1}`}`} onChange={(e) => change('checklist', draft.checklist.map((entry) => entry.id === item.id ? { ...entry, done: e.target.checked } : entry))} />
                    <Input aria-label={`Punkt ${index + 1}`} value={item.text} maxLength={300} onChange={(e) => change('checklist', draft.checklist.map((entry) => entry.id === item.id ? { ...entry, text: e.target.value } : entry))} />
                    <Button type="button" variant="ghost" size="sm" aria-label={`Usuń punkt ${index + 1}`} onClick={() => change('checklist', draft.checklist.filter((entry) => entry.id !== item.id))}>Usuń</Button>
                </div>)}
                <Button type="button" variant="outline" size="sm" disabled={draft.checklist.length >= 50} onClick={() => change('checklist', [...draft.checklist, { id: crypto.randomUUID(), text: '', done: false }])}>Dodaj punkt</Button>
            </section>
            <section className="space-y-3 rounded-lg border p-3" aria-label="Materiały">
                <h3 className="font-semibold text-sm">Materiały i linki</h3>
                {draft.materials.map((item, index) => <div key={item.id} className="space-y-2 border-b pb-3 last:border-0">
                    <Input aria-label={`Nazwa materiału ${index + 1}`} placeholder="Nazwa materiału" value={item.label} maxLength={150} onChange={(e) => change('materials', draft.materials.map((entry) => entry.id === item.id ? { ...entry, label: e.target.value } : entry))} />
                    <Input aria-label={`Link do materiału ${index + 1}`} placeholder="https://..." type="url" value={item.url} maxLength={2000} onChange={(e) => change('materials', draft.materials.map((entry) => entry.id === item.id ? { ...entry, url: e.target.value } : entry))} />
                    <div className="flex items-center justify-between">
                        {/^https?:\/\//i.test(item.url) && <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Otwórz materiał</a>}
                        <Button type="button" variant="ghost" size="sm" aria-label={`Usuń materiał ${index + 1}`} onClick={() => change('materials', draft.materials.filter((entry) => entry.id !== item.id))}>Usuń</Button>
                    </div>
                </div>)}
                <Button type="button" variant="outline" size="sm" disabled={draft.materials.length >= 30} onClick={() => change('materials', [...draft.materials, { id: crypto.randomUUID(), label: '', url: '' }])}>Dodaj materiał</Button>
            </section>
        </fieldset>
        {version !== ticket.updated_at && dirty && <p role="status" className="text-sm text-warning">Sprawa ma nowszą wersję. Wczytaj aktualną wersję przed zapisem.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background py-3">
            <Button type="submit" disabled={!dirty || pending}>{pending ? 'Zapisywanie…' : 'Zapisz zmiany'}</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => { if (!dirty || window.confirm('Porzucić niezapisane zmiany i wczytać aktualną wersję?')) reset() }}>Wczytaj aktualną wersję</Button>
            {dirty && <span className="text-xs text-muted-foreground">Niezapisane zmiany</span>}
        </div>
    </form>
}

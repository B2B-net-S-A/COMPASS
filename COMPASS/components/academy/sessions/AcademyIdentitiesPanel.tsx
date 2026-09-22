'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Search, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAcademyAction } from '../useAcademyAction'
import { listAcademyOrganizerCandidates, removeAcademyM365Identity, saveAcademyM365Identity } from '@/lib/actions/academy-sessions'
import type { AcademyM365IdentityDTO } from '@/lib/types/academy-sessions'
import { SESSION_SELECT_CLASS, sessionDate } from './session-format'

interface Candidate { id: string; fullName: string | null; email: string }
interface Props { identities: AcademyM365IdentityDTO[]; initialCandidates: Candidate[]; search: string }
const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

export function AcademyIdentitiesPanel({ identities, initialCandidates, search }: Props) {
    const router = useRouter()
    const [editing, setEditing] = useState<AcademyM365IdentityDTO | null | undefined>(undefined)
    const [removing, setRemoving] = useState<AcademyM365IdentityDTO | null>(null)
    const [formPending, setFormPending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pending, remove] = useAcademyAction()

    function revoke(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!removing) return
        const identityId = removing.id
        const note = String(new FormData(event.currentTarget).get('note') ?? '').trim()
        setError(null)
        remove(async () => {
            try {
                const result = await removeAcademyM365Identity({ identityId, note })
                if (!result.success) { setError(result.error); return }
                setRemoving(null)
                router.refresh()
            } catch { setError('Nie udało się usunąć powiązania konta.') }
        })
    }

    return <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1"><h2 className="text-lg font-semibold">Konta uczestników w Teams</h2><p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Powiązania służą do przypisywania raportów obecności do właściwej osoby. Zapisuj wyłącznie tożsamość sprawdzoną w Microsoft 365.</p></div><Button variant="outline" onClick={() => setEditing(null)}><Plus aria-hidden="true" />Powiąż konto</Button></div>
        <form method="get" action="/admin/learning/integrations" className="flex max-w-xl flex-wrap items-end gap-2"><div className="min-w-0 flex-1 space-y-2"><label htmlFor="identity-filter" className="text-sm font-medium">Znajdź powiązanie</label><Input key={search} id="identity-filter" name="identity" defaultValue={search} maxLength={100} placeholder="Imię lub e-mail" /></div><Button type="submit" variant="outline"><Search aria-hidden="true" />Szukaj</Button></form>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">{identities.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nie znaleziono powiązań kont dla tych kryteriów.</p> : identities.map(identity => <div key={identity.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><div className="min-w-0 space-y-1"><p className="break-words font-medium">{identity.fullName || identity.email}</p><p className="break-all text-sm text-muted-foreground">Compass: {identity.email}</p><p className="break-all text-sm text-muted-foreground">Teams: {identity.verifiedEmail || 'Identyfikator Microsoft 365'}</p><p className="break-all text-xs text-muted-foreground">Tenant: {identity.tenantId} · Object: {identity.objectId}</p><p className="text-xs text-muted-foreground">Potwierdzono {sessionDate(identity.verifiedAt)}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(identity)}>Zmień adres Teams</Button><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setError(null); setRemoving(identity) }}><Unlink aria-hidden="true" />Usuń powiązanie</Button></div></div>)}</div>
        <Dialog open={editing !== undefined} onOpenChange={open => { if (!open && !formPending) setEditing(undefined) }}><DialogContent><DialogHeader><DialogTitle>{editing ? 'Zmień potwierdzony adres Teams' : 'Powiąż konto Microsoft 365'}</DialogTitle><DialogDescription>Wybierz uczestnika i podaj sprawdzone dane jego konta Teams. Nie przypisujemy osób automatycznie na podstawie podobnej nazwy.</DialogDescription></DialogHeader>{editing !== undefined && <IdentityForm key={editing?.id ?? 'new'} initial={editing} initialCandidates={initialCandidates} onPendingChange={setFormPending} onSaved={() => { setEditing(undefined); router.refresh() }} />}</DialogContent></Dialog>
        <Dialog open={Boolean(removing)} onOpenChange={open => { if (!open && !pending) setRemoving(null) }}><DialogContent><DialogHeader><DialogTitle>Usuń powiązanie konta</DialogTitle><DialogDescription>Nowe raporty nie będą już dopasowywane przez to powiązanie. Usunięcie nie cofa zapisanych wcześniej decyzji o obecności.</DialogDescription></DialogHeader><form onSubmit={revoke} className="space-y-4"><p className="break-all text-sm">{removing?.fullName || removing?.email} · {removing?.verifiedEmail || removing?.objectId}</p><div className="space-y-2"><label htmlFor="identity-remove-note" className="text-sm font-medium">Uzasadnienie</label><Textarea id="identity-remove-note" name="note" required minLength={5} maxLength={2000} disabled={pending} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRemoving(null)} disabled={pending}>Anuluj</Button><Button type="submit" variant="destructive" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />}Usuń powiązanie</Button></div></form></DialogContent></Dialog>
    </section>
}

function IdentityForm({ initial, initialCandidates, onSaved, onPendingChange }: { initial: AcademyM365IdentityDTO | null; initialCandidates: Candidate[]; onSaved: () => void; onPendingChange: (pending: boolean) => void }) {
    const [candidates, setCandidates] = useState(initialCandidates)
    const [search, setSearch] = useState('')
    const [userId, setUserId] = useState(initial?.userId ?? '')
    const [error, setError] = useState<string | null>(null)
    const [pending, run] = useAcademyAction(onPendingChange)
    const [searching, find] = useAcademyAction()
    const options = initial && !candidates.some(person => person.id === initial.userId) ? [{ id: initial.userId, fullName: initial.fullName, email: initial.email }, ...candidates] : candidates
    function searchPeople() {
        setError(null)
        find(async () => { try { const result = await listAcademyOrganizerCandidates(search); if (!result.success) { setError(result.error); return } setCandidates(result.data); setUserId('') } catch { setError('Nie udało się wyszukać uczestnika.') } })
    }
    function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setError(null)
        run(async () => { try {
            const verifiedEmail = String(data.get('verifiedEmail') ?? '').trim()
            const result = await saveAcademyM365Identity({ userId, tenantId: initial?.tenantId ?? String(data.get('tenantId') ?? '').trim(), objectId: initial?.objectId ?? String(data.get('objectId') ?? '').trim(), verifiedEmail: verifiedEmail || undefined })
            if (!result.success) { setError(result.error); return }
            onSaved()
        } catch { setError('Nie udało się zapisać powiązania.') } })
    }
    return <form onSubmit={save} className="space-y-4"><fieldset disabled={pending} className="space-y-4">
        {!initial && <div className="space-y-2"><label htmlFor="identity-person-search" className="text-sm font-medium">Znajdź uczestnika</label><div className="flex gap-2"><Input id="identity-person-search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); searchPeople() } }} /><Button type="button" variant="outline" aria-label="Szukaj uczestnika" disabled={searching} onClick={searchPeople}>{searching ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}</Button></div></div>}
        <div className="space-y-2"><label htmlFor="identity-user" className="text-sm font-medium">Konto Compass</label><select id="identity-user" className={SESSION_SELECT_CLASS} required disabled={Boolean(initial) || searching} value={userId} onChange={event => setUserId(event.target.value)}><option value="" disabled>Wybierz uczestnika</option>{options.map(person => <option key={person.id} value={person.id}>{person.fullName || person.email} · {person.email}</option>)}</select></div>
        <div className="space-y-2"><label htmlFor="identity-tenant" className="text-sm font-medium">Tenant ID konta Teams</label><Input id="identity-tenant" name="tenantId" required pattern={UUID_PATTERN} maxLength={36} defaultValue={initial?.tenantId} readOnly={Boolean(initial)} /></div>
        <div className="space-y-2"><label htmlFor="identity-object" className="text-sm font-medium">Object ID konta Teams</label><Input id="identity-object" name="objectId" required pattern={UUID_PATTERN} maxLength={36} defaultValue={initial?.objectId} readOnly={Boolean(initial)} /></div>
        <div className="space-y-2"><label htmlFor="identity-email" className="text-sm font-medium">Potwierdzony adres konta uczestnika w Teams (opcjonalnie)</label><Input id="identity-email" name="verifiedEmail" type="email" maxLength={254} defaultValue={initial?.verifiedEmail ?? ''} /><p className="text-xs text-muted-foreground">Ten adres będzie używany do dopasowywania obecności. Pozostaw puste, jeśli potwierdzono tylko Tenant ID i Object ID.</p></div>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-primary" /><span>Sprawdziłem, że to konto Teams należy do wskazanego uczestnika.</span></label>
    </fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={pending || searching || !userId}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />}Zapisz potwierdzone powiązanie</Button></form>
}

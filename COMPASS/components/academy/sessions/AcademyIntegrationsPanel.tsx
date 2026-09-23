'use client'

import { useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Pencil, Plus, Search, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { listAcademyOrganizerCandidates, saveAcademyOrganizer } from '@/lib/actions/academy-sessions'
import type { AcademyIntegrationIssuesPageDTO, AcademyOrganizerDTO } from '@/lib/types/academy-sessions'
import { AcademyIntegrationIssuesQueue } from './AcademyIntegrationIssuesQueue'
import { SESSION_SELECT_CLASS } from './session-format'

interface Candidate { id: string; fullName: string | null; email: string }
interface Props {
    organizers: AcademyOrganizerDTO[]
    candidates: Candidate[]
    issuesPage: AcademyIntegrationIssuesPageDTO
    managedTeamsAvailable: boolean
    reason?: string
    rawAttendanceRetentionDays?: number | null
    retentionWarning?: string
}
export function AcademyIntegrationsPanel({ organizers, candidates, issuesPage, managedTeamsAvailable, reason, rawAttendanceRetentionDays, retentionWarning }: Props) {
    const router = useRouter()
    const [editing, setEditing] = useState<AcademyOrganizerDTO | null | undefined>(undefined)
    const [formPending, setFormPending] = useState(false)
    return <div className="space-y-6">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-start"><span className="rounded-xl bg-primary/10 p-3 text-primary"><Video aria-hidden="true" className="size-5" /></span><div className="space-y-2"><h2 className="font-semibold">{managedTeamsAvailable ? 'Firmowe spotkania Teams są dostępne' : 'Automatyczne spotkania Teams nie są włączone'}</h2><p className="text-sm leading-relaxed text-muted-foreground">{reason || (managedTeamsAvailable ? 'Wybierz gospodarzy, na których kontach mogą być tworzone spotkania. Uprawnienie trenera i konto gospodarza są od siebie niezależne.' : 'Szkolenia nadal mogą korzystać z własnego linku Teams oraz ręcznego potwierdzenia obecności.')}</p></div></section>
        <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">{rawAttendanceRetentionDays ? `Surowe raporty obecności Teams są przechowywane przez ${rawAttendanceRetentionDays} dni. Decyzje o ukończeniu i audyt pozostają zachowane.` : retentionWarning || 'Automatyczne usuwanie surowych raportów obecności nie jest skonfigurowane.'}</p>
        <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Gospodarze firmowych spotkań</h2><Button onClick={() => setEditing(null)}><Plus aria-hidden="true" />Dodaj gospodarza</Button></div><div className="divide-y divide-border rounded-2xl border border-border bg-card">{organizers.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nie skonfigurowano gospodarzy. Dodaj konto, zanim trenerzy zaczną tworzyć firmowe spotkania.</p> : organizers.map((organizer) => <div key={organizer.id} className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center"><div className="min-w-0 space-y-1"><p className="break-words font-medium">{organizer.fullName || organizer.email}</p><p className="break-all text-sm text-muted-foreground">{organizer.email}</p><p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">{organizer.enabled && <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />}{organizer.enabled ? 'Aktywny gospodarz' : 'Wyłączony dla nowych spotkań'}</p></div><Button variant="outline" size="sm" onClick={() => setEditing(organizer)}><Pencil aria-hidden="true" />Edytuj gospodarza</Button></div>)}</div></section>
        <AcademyIntegrationIssuesQueue initialPage={issuesPage} />
        <Dialog open={editing !== undefined} onOpenChange={(open) => { if (!open && !formPending) setEditing(undefined) }}><DialogContent><DialogHeader><DialogTitle>{editing ? 'Edytuj gospodarza' : 'Dodaj gospodarza Teams'}</DialogTitle><DialogDescription>Powiąż konto Compass z właściwym kontem Microsoft 365. Podane identyfikatory znajdziesz w Microsoft Entra.</DialogDescription></DialogHeader>{editing !== undefined && <OrganizerForm key={editing?.id ?? 'new'} initial={editing} initialCandidates={candidates} onPendingChange={setFormPending} onSaved={() => { setEditing(undefined); router.refresh() }} />}</DialogContent></Dialog>
    </div>
}

function OrganizerForm({ initial, initialCandidates, onSaved, onPendingChange }: { initial: AcademyOrganizerDTO | null; initialCandidates: Candidate[]; onSaved: () => void; onPendingChange: (pending: boolean) => void }) {
    const [candidates, setCandidates] = useState(initialCandidates)
    const [search, setSearch] = useState('')
    const [profileId, setProfileId] = useState(initial?.profileId ?? '')
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useAcademyAction(onPendingChange)
    const [isSearching, startSearch] = useAcademyAction()
    function searchPeople() {
        setError(null)
        startSearch(async () => { try { const result = await listAcademyOrganizerCandidates(search); if (!result.success) { setError(result.error); return } setCandidates(result.data); setProfileId('') } catch { setError('Nie udało się wyszukać kont.') } })
    }
    function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setError(null)
        startTransition(async () => { try { const result = await saveAcademyOrganizer({ id: initial?.id, profileId, tenantId: String(data.get('tenantId') ?? '').trim(), objectId: String(data.get('objectId') ?? '').trim(), enabled: data.get('enabled') === 'on' }); if (!result.success) { setError(result.error); return } onSaved() } catch { setError('Nie udało się zapisać gospodarza.') } })
    }
    const options = initial && !candidates.some((person) => person.id === initial.profileId) ? [{ id: initial.profileId, fullName: initial.fullName, email: initial.email }, ...candidates] : candidates
    return <form onSubmit={save} className="space-y-4"><fieldset disabled={isPending} className="space-y-4">
        {!initial && <div className="space-y-2"><label htmlFor="organizer-search" className="text-sm font-medium">Znajdź konto Compass</label><div className="flex gap-2"><Input id="organizer-search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); searchPeople() } }} maxLength={100} placeholder="Imię lub e-mail" /><Button type="button" variant="outline" aria-label="Szukaj konta gospodarza" onClick={searchPeople} disabled={isSearching}>{isSearching ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Search aria-hidden="true" />}</Button></div></div>}
        <div className="space-y-2"><label htmlFor="organizer-profile" className="text-sm font-medium">Konto Compass gospodarza</label><select id="organizer-profile" value={profileId} onChange={(event) => setProfileId(event.target.value)} required disabled={Boolean(initial) || isSearching} className={SESSION_SELECT_CLASS}><option value="" disabled>Wybierz osobę</option>{options.map((person) => <option key={person.id} value={person.id}>{person.fullName || person.email} · {person.email}</option>)}</select></div>
        <div className="space-y-2"><label htmlFor="organizer-tenant" className="text-sm font-medium">Identyfikator organizacji Microsoft (Tenant ID)</label><Input id="organizer-tenant" name="tenantId" defaultValue={initial?.tenantId} required maxLength={36} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></div>
        <div className="space-y-2"><label htmlFor="organizer-object" className="text-sm font-medium">Identyfikator użytkownika Microsoft (Object ID)</label><Input id="organizer-object" name="objectId" defaultValue={initial?.objectId} required maxLength={36} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></div>
        <label className="flex items-start gap-3 text-sm"><input name="enabled" type="checkbox" defaultChecked={initial?.enabled ?? true} className="mt-0.5 size-4 accent-primary" /><span>Udostępnij tego gospodarza dla nowych spotkań</span></label>
    </fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end"><Button type="submit" disabled={isPending || isSearching || !profileId}>{isPending && <Loader2 aria-hidden="true" className="animate-spin" />}Zapisz gospodarza</Button></div></form>
}

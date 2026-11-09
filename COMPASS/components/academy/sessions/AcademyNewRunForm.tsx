'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { createAcademyRunWithFirstSession } from '@/lib/actions/academy-sessions'
import type { AcademyMeetingMode, AcademyOrganizerDTO } from '@/lib/types/academy-sessions'
import type { AcademyStaffPerson } from '@/lib/types/academy-staff'
import { SESSION_SELECT_CLASS, zonedDateTimeToIso } from './session-format'

const TIME_ZONE = 'Europe/Warsaw'

export interface AcademyNewRunFormProps {
    courseId: string
    versionId: string
    defaultCapacity: number
    trainers: AcademyStaffPerson[]
    organizers: AcademyOrganizerDTO[]
    managedTeamsAvailable: boolean
    managedTeamsReason?: string
    onCancel: () => void
    onPendingChange?: (pending: boolean) => void
}

/** One submit for a next edition of an approved programme; it stays a draft until approved. */
export function AcademyNewRunForm({ courseId, versionId, defaultCapacity, trainers, organizers, managedTeamsAvailable, managedTeamsReason, onCancel, onPendingChange }: AcademyNewRunFormProps) {
    const router = useRouter()
    const [mode, setMode] = useState<AcademyMeetingMode>('external_link')
    const [error, setError] = useState<string | null>(null)
    const [incomplete, setIncomplete] = useState<{ runId: string; message: string } | null>(null)
    const [isPending, startTransition] = useAcademyAction(onPendingChange)
    const enabledOrganizers = organizers.filter(organizer => organizer.enabled)
    const managedBlocked = !managedTeamsAvailable || enabledOrganizers.length === 0

    function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setError(null)
        let startsAt: string
        let endsAt: string
        try {
            startsAt = zonedDateTimeToIso(String(data.get('startsAt') ?? ''), TIME_ZONE)
            endsAt = zonedDateTimeToIso(String(data.get('endsAt') ?? ''), TIME_ZONE)
            if (endsAt <= startsAt) throw new Error('Koniec spotkania musi wypadać po jego rozpoczęciu.')
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sprawdź daty spotkania.'); return }
        const trainerId = String(data.get('trainerId') ?? '')
        startTransition(async () => {
            try {
                const result = await createAcademyRunWithFirstSession({
                    courseId, versionId, title: String(data.get('title') ?? '').trim(), capacity: Number(data.get('capacity')), trainerId: trainerId || undefined,
                    session: { startsAt, endsAt, timeZone: TIME_ZONE, mode, organizerId: mode === 'managed_teams' ? String(data.get('organizerId') ?? '') : null, externalJoinUrl: mode === 'external_link' ? String(data.get('externalJoinUrl') ?? '').trim() : null },
                })
                if (!result.success) { setError(result.error); return }
                if (result.data.incomplete) { setIncomplete({ runId: result.data.runId, message: result.data.incomplete }); return }
                router.push(`/learning/edycje/${result.data.runId}`)
            } catch { setError('Nie udało się utworzyć edycji. Spróbuj ponownie.') }
        })
    }

    if (incomplete) return <div className="space-y-4"><p role="alert" className="rounded-lg bg-warning/10 p-3 text-sm">{incomplete.message}</p><Button asChild className="w-full"><Link href={`/learning/edycje/${incomplete.runId}`}>Przejdź do edycji</Link></Button></div>

    return <form onSubmit={submit} className="space-y-4"><fieldset disabled={isPending} className="min-w-0 space-y-4">
        <div className="space-y-2"><label htmlFor="academy-run-title" className="text-sm font-medium">Nazwa edycji</label><Input id="academy-run-title" name="title" required minLength={3} maxLength={200} placeholder="np. Grupa październikowa" /></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="academy-run-start" className="text-sm font-medium">Początek (czas polski)</label><Input id="academy-run-start" name="startsAt" type="datetime-local" required /></div><div className="space-y-2"><label htmlFor="academy-run-end" className="text-sm font-medium">Koniec (czas polski)</label><Input id="academy-run-end" name="endsAt" type="datetime-local" required /></div></div>
        <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><label htmlFor="academy-run-capacity" className="text-sm font-medium">Liczba miejsc</label><Input id="academy-run-capacity" name="capacity" type="number" required min={1} max={mode === 'managed_teams' ? 499 : 500} step={1} defaultValue={defaultCapacity} /></div>
            <div className="space-y-2"><label htmlFor="academy-run-trainer" className="text-sm font-medium">Dodatkowy prowadzący</label><select id="academy-run-trainer" name="trainerId" defaultValue="" className={SESSION_SELECT_CLASS}><option value="">Bez dodatkowego prowadzącego</option>{trainers.map(person => <option key={person.userId} value={person.userId}>{person.fullName || person.email}</option>)}</select></div>
        </div>
        <div className="space-y-2"><label htmlFor="academy-run-mode" className="text-sm font-medium">Sposób spotkania</label><select id="academy-run-mode" value={mode} onChange={event => setMode(event.target.value as AcademyMeetingMode)} className={SESSION_SELECT_CLASS}><option value="external_link">Mam własny link Teams</option><option value="managed_teams" disabled={managedBlocked}>Utwórz spotkanie w firmowym Teams{managedBlocked ? ' (niedostępne)' : ''}</option></select>{managedBlocked && managedTeamsReason && <p className="text-xs text-muted-foreground">{managedTeamsReason}</p>}</div>
        {mode === 'external_link'
            ? <div className="space-y-2"><label htmlFor="academy-run-link" className="text-sm font-medium">Link do spotkania Teams</label><Input id="academy-run-link" name="externalJoinUrl" type="url" required maxLength={4000} placeholder="https://teams.microsoft.com/…" /></div>
            : <div className="space-y-2"><label htmlFor="academy-run-organizer" className="text-sm font-medium">Gospodarz spotkania</label><select id="academy-run-organizer" name="organizerId" required defaultValue="" className={SESSION_SELECT_CLASS}><option value="" disabled>Wybierz gospodarza</option>{enabledOrganizers.map(organizer => <option key={organizer.id} value={organizer.id}>{organizer.fullName || organizer.email}</option>)}</select></div>}
        <p className="text-xs text-muted-foreground">Kolejne spotkania dodasz na ekranie edycji. Poprzednie edycje pozostają bez zmian.</p>
    </fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>Anuluj</Button><Button type="submit" disabled={isPending || (mode === 'managed_teams' && managedBlocked)}>{isPending && <Loader2 className="animate-spin" aria-hidden="true" />}Utwórz edycję</Button></div></form>
}

'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { createLiveTraining } from '@/lib/actions/academy-organize'
import type { LiveTrainer } from '@/lib/actions/academy-organize'
import { warsawIso } from '@/lib/academy/organize-board'

interface NewLiveTrainingFormProps {
    trainers: LiveTrainer[]
    /** Aktywny organizator Teams: spotkanie tworzy się samo. Bez niego potrzebny jest link. */
    teamsOrganizerId: string | null
}

const field = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'

/** „Nowe szkolenie na żywo”: tytuł, trener, data, kogo zaprosić. Teams tworzy się sam. */
export function NewLiveTrainingForm({ trainers, teamsOrganizerId }: NewLiveTrainingFormProps) {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<string | null>(null)
    const [pending, startTransition] = useAcademyAction()

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const form = event.currentTarget
        setError(null)
        setResult(null)
        startTransition(async () => {
            try {
                const outcome = await createLiveTraining({
                    title: String(data.get('title') ?? ''), trainerId: String(data.get('trainerId') ?? ''),
                    startsAt: warsawIso(String(data.get('startsAt') ?? '')), durationMinutes: Number(data.get('duration') ?? 60), timeZone: 'Europe/Warsaw',
                    mode: teamsOrganizerId ? 'managed_teams' : 'external_link', organizerId: teamsOrganizerId, externalJoinUrl: teamsOrganizerId ? null : String(data.get('joinUrl') ?? ''),
                    audience: { includeNexus: data.get('nexus') === 'on', includeOffice: data.get('office') === 'on', clients: [] },
                })
                if (!outcome?.success) return setError(outcome?.error ?? 'Nie udało się zapisać szkolenia.')
                if (outcome.data.incomplete) return setError(outcome.data.incomplete)
                setResult(outcome.data.invitationsHeld ? `Zapisy otwarte. ${outcome.data.invitationsHeld} zaproszeń czeka w kolejce wstrzymanych wiadomości.` : 'Zapisy otwarte.')
                form.reset()
                router.refresh()
            } catch {
                setError('Nie udało się zapisać szkolenia. Sprawdź połączenie i spróbuj ponownie.')
            }
        })
    }

    return <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Plus aria-hidden="true" className="size-5 text-primary" />Nowe szkolenie na żywo</h2>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Tytuł</span><input name="title" required minLength={3} maxLength={200} className={field} disabled={pending} placeholder="np. DORA: rejestr incydentów w praktyce" /></label>
        <div className="grid gap-4">
            <label className="block space-y-1.5"><span className="text-sm font-medium">Trener</span><select name="trainerId" required className={field} disabled={pending} defaultValue=""><option value="" disabled>Wybierz</option>{trainers.map(trainer => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}</select></label>
            <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                <label className="block space-y-1.5"><span className="text-sm font-medium">Data i godzina</span><input name="startsAt" type="datetime-local" required className={field} disabled={pending} /></label>
                <label className="block space-y-1.5"><span className="text-sm font-medium">Minuty</span><input name="duration" type="number" min={15} max={480} step={15} defaultValue={60} required className={field} disabled={pending} /></label>
            </div>
        </div>
        {teamsOrganizerId
            ? <p className="text-sm text-muted-foreground">Spotkanie Teams utworzy się samo po zapisaniu.</p>
            : <label className="block space-y-1.5"><span className="text-sm font-medium">Link do spotkania Teams</span><input name="joinUrl" type="url" required className={field} disabled={pending} placeholder="https://teams.microsoft.com/…" /></label>}
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Kogo zaprosić</legend>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="nexus" className="size-4 accent-primary" disabled={pending} />Konsultanci z NEXUSA</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="office" className="size-4 accent-primary" disabled={pending} />Zespół biurowy</label>
            <p className="text-xs text-muted-foreground">Zaproszenia czekają w kolejce wstrzymanych wiadomości. Nic nie wychodzi bez zatwierdzenia wysyłki.</p>
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {result && <p role="status" className="text-sm text-success">{result}</p>}
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">{pending && <Loader2 aria-hidden="true" className="animate-spin" />}Opublikuj zapowiedź</Button>
    </form>
}

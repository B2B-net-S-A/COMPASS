'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { previewAcademyRunAudience, saveAcademyRunAudience, type AudiencePreview, type AudienceState } from '@/lib/actions/academy-run-audience'
import { SESSION_SELECT_CLASS } from './session-format'

function parseExcluded(value: string): string[] {
    return value.split(/[\s,;]+/).map(item => item.trim().toLowerCase()).filter(Boolean)
}

export function AcademyRunAudiencePanel({ runId, state, error, open }: { runId: string; state?: AudienceState; error?: string; open: boolean }) {
    const router = useRouter()
    const [pending, start] = useAcademyAction()
    const [confirm, ConfirmUI] = useConfirm()
    const [includeNexus, setIncludeNexus] = useState(state?.choice?.filter.includeNexus ?? true)
    const [includeOffice, setIncludeOffice] = useState(state?.choice?.filter.includeOffice ?? false)
    const [client, setClient] = useState(state?.choice?.filter.clients[0] ?? '')
    const [excluded, setExcluded] = useState((state?.choice?.excluded ?? []).join('\n'))
    const [preview, setPreview] = useState<AudiencePreview | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [failure, setFailure] = useState<string | null>(null)

    if (error) return <section aria-label="Adresaci" className="rounded-2xl border border-border bg-card p-5"><p role="alert" className="text-sm text-destructive">{error}</p></section>
    if (!state) return null
    if (!state.available) return <section aria-label="Adresaci" className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Wybór adresatów zacznie działać po zastosowaniu migracji bazy danych.</section>

    const filter = { includeNexus, includeOffice, clients: client ? [client] : [] }
    const emails = parseExcluded(excluded)
    const chosenAt = state.choice ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(state.choice.chosenAt)) : null

    function changed<T>(setter: (value: T) => void, value: T) { setter(value); setPreview(null); setMessage(null) }
    function calculate() {
        setFailure(null)
        start(async () => {
            try {
                const result = await previewAcademyRunAudience({ runId, filter, excluded: emails })
                if (!result.success) { setFailure(result.error); return }
                setPreview(result.data)
            } catch { setFailure('Nie udało się policzyć adresatów. Spróbuj ponownie.') }
        })
    }
    async function save() {
        if (!preview) return
        if (!await confirm({ title: 'Zapisać adresatów?', description: `Do kolejki trafi ${preview.count} wstrzymanych zaproszeń. Nikt nie dostanie wiadomości: wysyłka jest wyłączona, a paczkę zatwierdza człowiek.`, confirmLabel: 'Zapisz adresatów' })) return
        setFailure(null)
        start(async () => {
            try {
                const result = await saveAcademyRunAudience({ runId, filter, excluded: emails })
                if (!result.success) { setFailure(result.error); return }
                setMessage(`Zapisano adresatów: ${result.data.count}. W kolejce przybyło ${result.data.held}, już było ${result.data.duplicates}, wycofano ${result.data.withdrawn}.`)
                setPreview(null)
                router.refresh()
            } catch { setFailure('Nie udało się zapisać adresatów. Nic nie zostało wysłane.') }
        })
    }

    return <section aria-label="Adresaci" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="space-y-1"><h2 className="text-lg font-semibold">Adresaci</h2><p className="text-sm text-muted-foreground">Filtry wskazują, kto dostanie zaproszenie. Zapis tworzy wyłącznie wiadomości wstrzymane.</p></div>
        <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">W kolejce, wstrzymane</dt><dd className="text-xl font-semibold">{state.held}</dd></div>{state.choice && <div><dt className="text-xs text-muted-foreground">Ostatni wybór</dt><dd>{state.choice.count} osób · {state.choice.chosenBy ?? 'osoba spoza listy'}, {chosenAt}</dd></div>}</dl>
        {!open && <p className="rounded-xl bg-muted p-3 text-sm">Adresatów wybiera się dla opublikowanej edycji, przed jej pierwszym spotkaniem.</p>}
        <fieldset disabled={pending || !open} className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={includeNexus} onChange={event => changed(setIncludeNexus, event.target.checked)} className="size-4 accent-primary" />Konsultanci z migawki NEXUS</label><label className="flex items-center gap-2"><input type="checkbox" checked={includeOffice} onChange={event => changed(setIncludeOffice, event.target.checked)} className="size-4 accent-primary" />Pracownicy biura</label></div>
            <label className="block space-y-1 text-sm">Klient<select value={client} onChange={event => changed(setClient, event.target.value)} className={SESSION_SELECT_CLASS}><option value="">Wszyscy klienci</option>{state.clients.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
            <label className="block space-y-1 text-sm">Wyklucz adresy (każdy w nowym wierszu)<Textarea value={excluded} onChange={event => changed(setExcluded, event.target.value)} rows={3} /></label>
        </fieldset>
        {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}{message && <p role="status" className="text-sm">{message}</p>}
        {preview && <div className="space-y-2 rounded-xl border border-border p-4 text-sm"><p className="font-medium">{preview.count} osób{preview.excludedCount ? `, wykluczono ${preview.excludedCount}` : ''}</p>{preview.sample.length > 0 && <ul className="space-y-0.5 text-muted-foreground">{preview.sample.map(person => <li key={person.email}>{person.fullName} · {person.email}</li>)}</ul>}</div>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending || !open} onClick={calculate}>Policz adresatów</Button><Button disabled={pending || !open || !preview || preview.count === 0} onClick={save}>Zapisz adresatów</Button></div>
        <ConfirmUI />
    </section>
}

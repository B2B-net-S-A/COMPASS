'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setProgrammeValidity, type ProgrammeValidity } from '@/lib/actions/academy-programme-validity'

function ProgrammeRow({ programme }: { programme: ProgrammeValidity }) {
    const router = useRouter()
    const [value, setValue] = useState(programme.validity_months?.toString() ?? '')
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useTransition()
    const months = value.trim() === '' ? null : Number(value)
    const save = () => start(async () => {
        setError(null)
        const result = await setProgrammeValidity(programme.id, months).catch(() => null)
        if (!result?.success) { setError(result?.error ?? 'Nie udało się zapisać. Spróbuj ponownie.'); return }
        router.refresh()
    })
    return <li className="flex flex-col gap-2 border-t border-border p-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-medium">{programme.title}</span>
        <span className="flex items-center gap-2">
            <Input aria-label={`Ważność programu ${programme.title} w miesiącach`} type="number" min={1} max={120} className="w-32" placeholder="bez terminu" value={value} onChange={event => setValue(event.target.value)} />
            <span className="text-sm text-muted-foreground">mies.</span>
            <Button type="button" variant="outline" size="sm" disabled={pending || months === programme.validity_months} onClick={save}>Zapisz</Button>
        </span>
        {error && <p role="alert" className="text-sm text-destructive sm:basis-full">{error}</p>}
    </li>
}

/** Zmiana dotyczy tylko przyszłych certyfikatów: wystawione mają datę zamrożoną w migawce. */
export function ProgrammeValidityPanel({ migrated, programmes }: { migrated: boolean; programmes: ProgrammeValidity[] }) {
    return <section aria-labelledby="programme-validity-title" className="rounded-xl border border-border bg-card">
        <div className="p-4"><h2 id="programme-validity-title" className="font-semibold">Ważność certyfikatów według programu</h2>
            <p className="text-sm text-muted-foreground">Zmiana dotyczy certyfikatów wystawionych od teraz. Puste pole oznacza dokument bezterminowy.</p></div>
        {!migrated ? <p className="border-t border-border p-4 text-sm text-muted-foreground">Ta funkcja czeka na migrację bazy danych.</p>
            : programmes.length === 0 ? <p className="border-t border-border p-4 text-sm text-muted-foreground">Nie ma jeszcze żadnego programu.</p>
            : <ul className="border-t border-border">{programmes.map(programme => <ProgrammeRow key={programme.id} programme={programme} />)}</ul>}
    </section>
}

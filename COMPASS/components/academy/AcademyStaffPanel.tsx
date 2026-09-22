'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { setAcademyStaff } from '@/lib/actions/academy-staff'
import type { AcademyStaffRole, AcademyStaffState } from '@/lib/types/academy-staff'
import { useAcademyAction } from './useAcademyAction'

export function AcademyStaffPanel({ courseId, runId, state }: { courseId: string; runId?: string; state: AcademyStaffState }) {
    const router = useRouter()
    const [userId, setUserId] = useState('')
    const [role, setRole] = useState<AcademyStaffRole>('facilitator')
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useAcademyAction()
    function change(target: string, targetRole: AcademyStaffRole, enabled: boolean) {
        setError(null)
        start(async () => {
            const result = await setAcademyStaff({ courseId, runId, userId: target, role: targetRole, enabled })
            if (!result.success) { setError(result.error); return }
            setUserId(''); router.refresh()
        })
    }
    return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div><h2 className="text-lg font-semibold">{runId ? 'Dodatkowi prowadzący edycji' : 'Zespół szkolenia'}</h2><p className="mt-1 text-sm text-muted-foreground">{runId ? 'Przypisanie dotyczy wyłącznie tej grupy. Prowadzący całego szkolenia zachowują dostęp do wszystkich edycji.' : 'Redaktor przygotowuje program i materiały. Prowadzący zarządza edycjami, spotkaniami i obecnością. Akceptację wykonuje niezależny administrator.'}</p></div>
        {state.members.length ? <ul className="divide-y divide-border">{state.members.map(person => <li key={`${person.userId}:${person.role}`} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{person.fullName || person.email}</p><p className="text-xs text-muted-foreground">{person.role === 'editor' ? 'Redaktor programu' : 'Prowadzący'}{!person.eligible && ' · uprawnienia trenera nieaktywne'}</p></div><Button variant="outline" size="sm" disabled={pending} onClick={() => change(person.userId, person.role, false)} aria-label={`Usuń przypisanie: ${person.fullName || person.email}`}>Usuń przypisanie</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">Brak dodatkowych przypisań.</p>}
        <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); if (userId) change(userId, role, true) }}>
            <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">Trener<select value={userId} onChange={event => setUserId(event.target.value)} disabled={pending} required className="h-10 rounded-md border border-input bg-background px-3"><option value="">Wybierz uprawnionego trenera</option>{state.candidates.map(person => <option value={person.userId} key={person.userId}>{person.fullName || person.email}</option>)}</select></label>
            {!runId && <label className="flex flex-col gap-1 text-sm">Zakres<select value={role} onChange={event => setRole(event.target.value as AcademyStaffRole)} disabled={pending} className="h-10 rounded-md border border-input bg-background px-3"><option value="facilitator">Prowadzenie edycji</option><option value="editor">Edycja programu</option></select></label>}
            <Button disabled={pending || !userId} type="submit">Dodaj przypisanie</Button>
        </form>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
}

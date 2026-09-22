'use client'

import { useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { recordAcademyAttendance } from '@/lib/actions/academy-sessions'
import type { AcademyRunParticipantDTO, AcademySessionDTO } from '@/lib/types/academy-sessions'
import { ATTENDANCE_LABEL, REGISTRATION_LABEL, SESSION_SELECT_CLASS } from './session-format'

export function AcademyAttendancePanel({ participants, sessions, userId, readOnly = false }: { participants: AcademyRunParticipantDTO[]; sessions: AcademySessionDTO[]; userId: string; readOnly?: boolean }) {
    const router = useRouter()
    const available = sessions.filter((session) => session.status !== 'cancelled')
    const [sessionId, setSessionId] = useState(available[0]?.id ?? '')
    const session = available.find((item) => item.id === sessionId) ?? available[0]
    const [selected, setSelected] = useState<AcademyRunParticipantDTO | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useAcademyAction()
    function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (readOnly || !selected?.enrollmentId || !session) return
        const data = new FormData(event.currentTarget)
        const minutes = String(data.get('minutes') ?? '').trim()
        setError(null)
        if (!minutes || !Number.isInteger(Number(minutes)) || Number(minutes) < 0 || Number(minutes) > 1440) {
            setError('Podaj potwierdzony czas obecności w pełnych minutach. Jeśli go nie znasz, pozostaw obecność do weryfikacji.')
            return
        }
        const target = selected
        const enrollmentId = target.enrollmentId!
        startTransition(async () => { try {
            const result = await recordAcademyAttendance({ sessionId: session.id, enrollmentId, status: data.get('status') === 'present' ? 'present' : 'insufficient', attendedSeconds: Number(minutes) * 60, note: String(data.get('note') ?? '').trim() })
            if (!result.success) { setError(result.error); return }
            setSelected(null)
            router.refresh()
        } catch { setError('Nie udało się zapisać obecności. Spróbuj ponownie.') } })
    }
    return <section className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="space-y-1"><h2 className="flex items-center gap-2 text-lg font-semibold"><UserCheck aria-hidden="true" className="size-5 text-primary" />Uczestnicy i obecność</h2><p className="text-sm text-muted-foreground">Zapis i obecność są osobnymi stanami. Każda ręczna decyzja zostaje zapisana z uzasadnieniem.</p></div>
        {available.length > 0 && <div className="max-w-xl space-y-2"><label htmlFor="attendance-session" className="text-sm font-medium">Spotkanie</label><select id="attendance-session" value={session?.id ?? ''} onChange={(event) => setSessionId(event.target.value)} className={SESSION_SELECT_CLASS}>{available.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>}
        {session && !session.attendanceWindowConfirmed && <p className="rounded-lg bg-warning/5 p-3 text-sm text-warning">Najpierw potwierdź rzeczywisty czas zakończonego spotkania powyżej, aby rozliczyć obecność.</p>}
        {participants.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Na tę edycję nikt się jeszcze nie zapisał.</p> : <div className="divide-y divide-border">{participants.map((participant) => {
            const attendance = participant.attendance.find((item) => item.sessionId === session?.id)
            return <div key={participant.registrationId} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"><div className="min-w-0 space-y-1"><p className="break-words text-sm font-medium">{participant.fullName || participant.email}</p><p className="break-all text-xs text-muted-foreground">{participant.email}</p><div className="flex flex-wrap gap-x-3 gap-y-1 text-xs"><span className="text-muted-foreground">{REGISTRATION_LABEL[participant.status]}</span>{participant.completedAt && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 aria-hidden="true" className="size-3" />Edycja ukończona</span>}</div>{attendance?.source === 'manual' && attendance.note && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">Uzasadnienie decyzji: {attendance.note}</p>}</div><div className="flex flex-wrap items-center gap-3"><span className="text-xs text-muted-foreground">{attendance ? `${ATTENDANCE_LABEL[attendance.status]} · ${Math.round(attendance.attendedSeconds / 60)} min · ${attendance.source === 'teams' ? 'Teams' : 'ręcznie'}` : 'Obecność niepotwierdzona'}</span>{participant.status === 'confirmed' && participant.enrollmentId && participant.userId !== userId && <Button variant="outline" size="sm" disabled={readOnly || !session?.attendanceWindowConfirmed} onClick={() => { setSelected(participant); setError(null) }}>Potwierdź / skoryguj</Button>}{participant.userId === userId && <span className="text-xs text-muted-foreground">Twoją obecność potwierdza inny prowadzący.</span>}</div></div>
        })}</div>}
        <Dialog open={Boolean(selected)} onOpenChange={(value) => { if (!value && !isPending) setSelected(null) }}><DialogContent><DialogHeader><DialogTitle>Potwierdź obecność</DialogTitle><DialogDescription>{selected?.fullName || selected?.email} · {session?.title}</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><fieldset disabled={isPending} className="space-y-4"><div className="space-y-2"><label htmlFor="attendance-status" className="text-sm font-medium">Decyzja</label><select id="attendance-status" name="status" defaultValue="present" className={SESSION_SELECT_CLASS}><option value="present">Obecność spełnia wymagania</option><option value="insufficient">Obecność nie spełnia wymagań</option></select></div><div className="space-y-2"><label htmlFor="attendance-minutes" className="text-sm font-medium">Potwierdzony czas obecności w minutach</label><Input id="attendance-minutes" name="minutes" type="number" required min={0} max={1440} step={1} aria-describedby="attendance-time-help" /><p id="attendance-time-help" className="text-xs text-muted-foreground">Jeśli czas jest nieznany, pozostaw obecność do weryfikacji. Brak danych nie oznacza pełnej obecności.</p></div><div className="space-y-2"><label htmlFor="attendance-note" className="text-sm font-medium">Uzasadnienie decyzji</label><Textarea id="attendance-note" name="note" required minLength={5} maxLength={2000} placeholder="Opisz, na jakiej podstawie potwierdzasz lub korygujesz obecność." /></div></fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSelected(null)} disabled={isPending}>Anuluj</Button><Button type="submit" disabled={isPending}>{isPending && <Loader2 className="animate-spin" aria-hidden="true" />}Zapisz decyzję</Button></div></form></DialogContent></Dialog>
    </section>
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { cancelAcademyWebinarRegistration, commitAcademyWebinarImport, exportAcademyWebinarMailingList, listAcademyWebinarRoster, previewAcademyWebinarImport, verifyAcademyWebinarContractEmail } from '@/lib/actions/academy-webinar-import'
import type { AcademySessionDTO } from '@/lib/types/academy-sessions'
import type { WebinarImportKind, WebinarImportPreview, WebinarRosterRow } from '@/lib/academy/webinar-import'

export function AcademyWebinarImportPanel({ runId, sessions, readOnly }: { runId: string; sessions: AcademySessionDTO[]; readOnly: boolean }) {
    const router = useRouter()
    const [pending, start] = useAcademyAction()
    const [confirm, ConfirmUI] = useConfirm()
    const [kind, setKind] = useState<WebinarImportKind>('registrations')
    const [sessionId, setSessionId] = useState('')
    const [dateOrder, setDateOrder] = useState<'dmy' | 'mdy'>('dmy')
    const [preview, setPreview] = useState<WebinarImportPreview | null>(null)
    const [resolutions, setResolutions] = useState<Record<string, string | null>>({})
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [roster, setRoster] = useState<WebinarRosterRow[] | null>(null)
    const [cancelling, setCancelling] = useState<WebinarRosterRow | null>(null)
    const [editing, setEditing] = useState<WebinarRosterRow | null>(null)
    const fieldClass = 'w-full rounded-md border border-input bg-background p-2 text-sm'
    const available = sessions.filter(s => s.mode === 'external_link' && s.status !== 'cancelled')
    function runAction(action: () => Promise<void>) {
        setError(null)
        start(async () => { try { await action() } catch { setError('Operacja nie powiodła się. Spróbuj ponownie.') } })
    }
    function refreshRoster() {
        setError(null)
        runAction(async () => {
            const result = await listAcademyWebinarRoster(runId)
            if (!result.success) { setError(result.error); return }
            setRoster(result.data)
        })
    }
    function fileSelected(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]; event.target.value = ''
        if (!file) return
        setPreview(null); setResolutions({}); setError(null); setMessage(null)
        if (file.size > 2_000_000) { setError('Plik może mieć maksymalnie 2 MB.'); return }
        runAction(async () => {
            try {
                const bytes = await file.arrayBuffer()
                const header = new Uint8Array(bytes)
                const encoding = header[0] === 0xff && header[1] === 0xfe ? 'utf-16le' : header[0] === 0xfe && header[1] === 0xff ? 'utf-16be' : 'utf-8'
                const text = new TextDecoder(encoding, { fatal: true }).decode(bytes)
                const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
                const result = await previewAcademyWebinarImport({ runId, kind, text, sourceHash: hash, sessionId: kind === 'attendance' ? sessionId : undefined, dateOrder })
                if (!result.success) { setError(result.error); return }
                setPreview(result.data)
            } catch { setError('Nie można odczytać pliku. Zapisz CSV/TSV w UTF-8 lub UTF-16 z BOM.') }
        })
    }
    async function approve() {
        if (!preview) return
        if (!await confirm({ title: 'Zatwierdzić cały import?', description: `Zapisz ${preview.rows.length} osób z podglądu w jednej operacji. Osoby bez jednoznacznego konta pozostaną na prywatnej liście webinaru. Dotychczasowa korespondencja i webinar Teams pozostają u organizatora.`, confirmLabel: 'Zatwierdź import' })) return
        runAction(async () => {
            const result = await commitAcademyWebinarImport(preview.id, resolutions)
            if (!result.success) { setError(result.error); return }
            setMessage(result.data.alreadyCommitted ? 'Ten import został już zapisany. Nie dodano duplikatów.' : `Zapisano import: nowe osoby ${result.data.created}, powiązane zapisy Compass ${result.data.linked}, obecność ${result.data.attendance}. Zachowano istniejące decyzje i certyfikaty: ${result.data.preserved}.`)
            setPreview(null)
            const list = await listAcademyWebinarRoster(runId)
            if (list.success) setRoster(list.data)
            router.refresh()
        })
    }
    async function exportList() {
        if (!await confirm({ title: 'Wyeksportować adresy z umów?', description: 'Pobierzesz prywatną listę do korespondencji seryjnej w Wordzie. Eksport obejmuje wyłącznie potwierdzone adresy z ewidencji umów lub zweryfikowane przez administratora; brakujące adresy zostaną pominięte. Pobranie jest zapisywane w audycie.', confirmLabel: 'Pobierz CSV' })) return
        runAction(async () => {
            const result = await exportAcademyWebinarMailingList(runId)
            if (!result.success) { setError(result.error); return }
            if (result.data.count) {
                const url = URL.createObjectURL(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }))
                const link = document.createElement('a'); link.href = url; link.download = `akademia-korespondencja-${runId}.csv`; link.click(); URL.revokeObjectURL(url)
            }
            setMessage(`Eksport: ${result.data.count} adresów. Pominięto osoby bez potwierdzonego adresu z umowy: ${result.data.excludedMissingEmail}.`)
        })
    }
    function verify(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault(); if (!editing) return
        const data = new FormData(event.currentTarget)
        runAction(async () => {
            const result = await verifyAcademyWebinarContractEmail({ rosterId: editing.id, email: String(data.get('email') ?? '').trim(), note: String(data.get('note') ?? '').trim() })
            if (!result.success) { setError(result.error); return }
            setEditing(null); setMessage('Adres z umowy zweryfikowany.'); const list = await listAcademyWebinarRoster(runId); if (list.success) setRoster(list.data)
        })
    }
    function cancelRow(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault(); if (!cancelling) return
        const note = String(new FormData(event.currentTarget).get('note') ?? '').trim()
        runAction(async () => {
            const result = await cancelAcademyWebinarRegistration(cancelling.id, note)
            if (!result.success) { setError(result.error); return }
            setCancelling(null); setMessage('Anulowano miejsce w Compass. Organizator musi zaktualizować zapis w zewnętrznym Teams i korespondencję.')
            const list = await listAcademyWebinarRoster(runId); if (list.success) setRoster(list.data)
            router.refresh()
        })
    }
    return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Lista istniejącego webinaru Teams</h2>
        <p className="text-sm text-muted-foreground">Wczytaj raport zapisów lub frekwencji organizatora. Podgląd wymaga zatwierdzenia administratora. Dopasowujemy wyłącznie zweryfikowane adresy i powiązania z ewidencją umów. Nie dopasowujemy po nazwisku i nie tworzymy kont. Lista webinaru zajmuje miejsca w tej edycji; uczestnicy nie muszą zapisywać się ponownie.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
        {!readOnly && <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Rodzaj raportu<select className={fieldClass} disabled={pending} value={kind} onChange={e => { setKind(e.target.value as WebinarImportKind); setPreview(null) }}><option value="registrations">Zapisy na webinar</option><option value="attendance">Obecność z Teams</option></select></label>
            {kind === 'attendance' && <><label className="space-y-1 text-sm">Spotkanie<select className={fieldClass} value={sessionId} disabled={pending} onChange={e => { setSessionId(e.target.value); setPreview(null) }}><option value="">Wybierz zakończone spotkanie</option>{available.filter(s => s.attendanceWindowConfirmed && s.actualEndsAt && Date.parse(s.actualEndsAt) <= Date.now()).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label><label className="space-y-1 text-sm">Kolejność dat raportu (Europe/Warsaw)<select className={fieldClass} value={dateOrder} disabled={pending} onChange={e => { setDateOrder(e.target.value as 'dmy' | 'mdy'); setPreview(null) }}><option value="dmy">Dzień / miesiąc / rok</option><option value="mdy">Miesiąc / dzień / rok (raport angielski US)</option></select></label></>}
            <label className="space-y-1 text-sm">Plik CSV lub TSV<Input aria-label="Plik raportu Teams" type="file" accept=".csv,.tsv,.txt" disabled={pending || (kind === 'attendance' && !sessionId)} onChange={fileSelected} /></label>
        </div>}
        {preview && <div className="space-y-3"><p className="font-medium">Podgląd: {preview.rows.length} osób · dopasowane {preview.rows.filter(r => r.match === 'matched').length} · bez konta {preview.rows.filter(r => r.match === 'unmatched').length} · niejednoznaczne {preview.rows.filter(r => r.match === 'ambiguous').length}</p><div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Osoba i email</th><th className="p-2">Dopasowanie Compass</th>{kind === 'attendance' && <th className="p-2">Minuty w oknie zajęć</th>}</tr></thead><tbody>{preview.rows.map(row => <tr key={row.email} className="border-t border-border"><td className="p-2">{row.fullName}<br /><span className="text-muted-foreground">{row.email}{row.existing ? ' · już na liście' : ''}</span></td><td className="p-2">{row.match === 'ambiguous' ? <select aria-label={`Dopasowanie ${row.email}`} className={fieldClass} disabled={pending} value={resolutions[row.email] === null ? 'external' : resolutions[row.email] ?? ''} onChange={e => setResolutions(values => ({ ...values, [row.email]: e.target.value === 'external' ? null : e.target.value }))}><option value="" disabled>Wybierz decyzję</option><option value="external">Zachowaj na prywatnej liście webinaru</option>{row.candidates.map(c => <option key={c.userId} value={c.userId}>{c.fullName || c.userId}</option>)}</select> : row.match === 'matched' ? row.candidates[0]?.fullName || 'Konto zweryfikowane' : 'Prywatna lista webinaru, bez konta'}</td>{kind === 'attendance' && <td className="p-2">{Math.floor((row.attendedSeconds ?? 0) / 60)}<br /><span className="text-xs text-muted-foreground">{row.evidence === 'summary' ? 'Czas trwania z podsumowania Teams' : 'Suma przedziałów połączeń'}</span></td>}</tr>)}</tbody></table></div><p className="text-xs text-muted-foreground">Podgląd wygasa po 30 minutach. Szczegółowy raport zsumuje połączenia bez podwójnego naliczania i ograniczy je do czasu zajęć. Podsumowanie używa rzeczywistego In-meeting duration i wymaga, aby wszystkie połączenia mieściły się w potwierdzonym oknie zajęć. Import zachowuje ręczne decyzje, własną obecność administratora i wydane certyfikaty.</p><Button disabled={pending || preview.rows.some(r => r.match === 'ambiguous' && !(r.email in resolutions))} onClick={approve}>Zatwierdź import</Button><Button variant="ghost" disabled={pending} onClick={() => setPreview(null)}>Odrzuć podgląd</Button></div>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending} onClick={refreshRoster}>Pokaż listę webinaru</Button><Button variant="outline" disabled={pending || readOnly} onClick={exportList}>CSV do korespondencji seryjnej</Button></div>
        {roster && <div className="space-y-2"><p className="text-sm">Lista webinaru: {roster.filter(r => r.status === 'confirmed').length} aktywnych osób; bez potwierdzonego adresu z umowy: {roster.filter(r => r.status === 'confirmed' && !r.contractualEmail).length}.</p><div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Uczestnik</th><th className="p-2">Konto / zapis Compass</th><th className="p-2">Adres z umowy</th><th className="p-2">Obecność</th></tr></thead><tbody>{roster.map(r => <tr key={r.id} className="border-t border-border"><td className="p-2">{r.fullName}<br /><span className="text-muted-foreground">{r.email} · {r.status === 'cancelled' ? 'anulowano' : 'zapis webinaru'}</span>{!readOnly && r.status === 'confirmed' && <Button variant="ghost" size="sm" disabled={pending} onClick={() => setCancelling(r)}>Anuluj miejsce</Button>}</td><td className="p-2">{r.userId ? r.registrationStatus === 'confirmed' ? 'Potwierdzony Compass' : 'Powiązane konto; dostęp zależy od pilota i wymagań' : 'Bez konta Compass'}</td><td className="p-2">{r.contractualEmail || 'Wymaga weryfikacji'}{!readOnly && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(r)}>Zweryfikuj</Button>}</td><td className="p-2">{r.attendance.length ? r.attendance.map(a => `${Math.floor(a.attendedSeconds / 60)} min`).join(', ') : 'Brak raportu'}</td></tr>)}</tbody></table></div></div>}
        {editing && <form onSubmit={verify} className="space-y-2 rounded-xl border border-border p-4"><p className="font-medium">Adres z umowy: {editing.fullName}</p><label className="block text-sm">Email<Input name="email" type="email" required maxLength={254} defaultValue={editing.contractualEmail || ''} disabled={pending} /></label><label className="block text-sm">Podstawa weryfikacji (dokument umowy / potwierdzenie tożsamości)<Textarea name="note" required minLength={10} maxLength={2000} disabled={pending} /></label><Button type="submit" disabled={pending}>Zapisz weryfikację</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => setEditing(null)}>Anuluj</Button></form>}
        {cancelling && <form onSubmit={cancelRow} className="space-y-2 rounded-xl border border-border p-4"><p className="font-medium">Anuluj miejsce: {cancelling.fullName}</p><p className="text-sm text-muted-foreground">Zwolnisz miejsce w Compass. Zapis w zewnętrznym Teams i korespondencję aktualizuje organizator.</p><label className="block text-sm">Uzasadnienie<Textarea name="note" required minLength={10} maxLength={2000} disabled={pending} /></label><Button type="submit" variant="destructive" disabled={pending}>Potwierdź anulowanie</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => setCancelling(null)}>Wróć</Button></form>}
        <ConfirmUI />
    </section>
}

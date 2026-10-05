'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAcademyHandover, saveAcademyHandover, reviewAcademyHandover } from '@/lib/actions/academy-handover'
import { HANDOVER_CATEGORIES, type HandoverCategory, type AcademyHandoverState } from '@/lib/types/academy-handover'

const labels = { draft: 'Szkic', submitted: 'Oczekuje na odbiór', rejected: 'Do poprawy', accepted: 'Odebrany przez administratora' }
export function AcademyHandoverPanel({ versionId, runId }: { versionId: string; runId?: string }) {
    const [state, setState] = useState<AcademyHandoverState | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [newPackage, setNewPackage] = useState(false)
    const [revision, setRevision] = useState(0)
    useEffect(() => {
        let active = true
        void getAcademyHandover({ versionId, runId }).then(result => { if (!active) return; if (result.success) { setState(result.data); setError(null) } else setError(result.error) }).catch(() => { if (active) setError('Nie udało się pobrać pakietu.') })
        return () => { active = false }
    }, [versionId, runId, revision])
    const h = newPackage ? null : state?.handover
    const editable = !h || ['draft', 'rejected'].includes(h.status)
    async function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const submit = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'submit'
        const items = Object.fromEntries(Object.keys(HANDOVER_CATEGORIES).map(key => [key, form.getAll(key).map(String)])) as Record<HandoverCategory, string[]>
        setBusy(true); setError(null)
        try {
            const result = await saveAcademyHandover({ versionId, runId, id: h?.id ?? null, items, sourceUrl: String(form.get('source') ?? '').trim() || null, rightsUrl: String(form.get('rights') ?? '').trim() || null, rightsSignedOn: String(form.get('signed') ?? '') || null, submit })
            if (!result.success) setError(result.error); else { setNewPackage(false); setRevision(value => value + 1) }
        } catch { setError('Nie udało się zapisać pakietu.') } finally { setBusy(false) }
    }
    async function review(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!h) return
        const note = String(new FormData(event.currentTarget).get('note') ?? '').trim()
        const accept = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'accept'
        setBusy(true); setError(null)
        try { const result = await reviewAcademyHandover({ id: h.id, accept, note }); if (!result.success) setError(result.error); else { setNewPackage(false); setRevision(value => value + 1) } } catch { setError('Nie udało się odebrać pakietu.') } finally { setBusy(false) }
    }
    return <section aria-label="Odbiór pakietu szkoleniowego" className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div><h2 className="text-lg font-semibold">Odbiór pakietu szkoleniowego</h2><p className="text-sm text-muted-foreground">Lista materiałów, pliki montażowe i przekazanie praw. Linki są dostępne wyłącznie obsłudze szkolenia. Odbiór pakietu nie zastępuje zatwierdzenia publikacji szkolenia ani materiałów edycji.</p></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!state ? <p role="status">Wczytywanie pakietu…</p> : <>
            <p role="status" className="text-sm font-medium">{h ? labels[h.status] : 'Nowy pakiet'}{h?.reviewed_at && ` · ${new Date(h.reviewed_at).toLocaleDateString('pl-PL')}`}</p>
            {h?.status === 'accepted' && <Button type="button" variant="outline" disabled={busy} onClick={() => setNewPackage(true)}>Utwórz kolejny pakiet (zachowaj odbiór poprzedniego)</Button>}
            {h?.review_note && <p className="text-sm">Uwagi administratora: {h.review_note}</p>}
            <form key={`${revision}-${newPackage}`} onSubmit={save} className="space-y-4">
                <fieldset disabled={busy || !editable} className="space-y-4">
                    {(Object.entries(HANDOVER_CATEGORIES) as [HandoverCategory, string][]).map(([category, label]) => {
                        const files = state.files.filter(file => category === 'audio' ? file.mime_type.startsWith('audio/') : category === 'modular_video' ? file.mime_type === 'video/mp4' : ['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mime_type))
                        return <fieldset key={category} className="space-y-2"><legend className="text-sm font-medium">{label}</legend>{files.length ? files.map(file => <label key={file.id} className="flex items-start gap-2 text-sm"><input type="checkbox" name={category} value={file.id} defaultChecked={h?.material_ids[category]?.includes(file.id)} className="mt-1 accent-primary" />{file.filename}</label>) : <p className="text-xs text-muted-foreground">Najpierw dodaj pliki w materiałach {runId ? 'edycji' : 'lekcji'} i zaczekaj na skanowanie.</p>}</fieldset>
                    })}
                    <label className="block text-sm">Źródła montażowe na wspólnym dysku<Input name="source" type="url" defaultValue={h?.source_url ?? ''} maxLength={2048} placeholder="https://firma.sharepoint.com/sites/..." /></label>
                    <label className="block text-sm">Dowód przekazania praw<Input name="rights" type="url" defaultValue={h?.rights_url ?? ''} maxLength={2048} /></label>
                    <label className="block text-sm">Data podpisania przekazania praw<Input name="signed" type="date" defaultValue={h?.rights_signed_on ?? ''} /></label>
                    <p className="text-xs text-muted-foreground">Użyj firmowych adresów SharePoint, OneDrive lub Google Drive bez parametrów i fragmentu. Dostęp do źródeł oraz podpisanego dokumentu kontroluje istniejący wspólny dysk.</p>
                    {editable && <div className="flex flex-wrap gap-2"><Button type="submit" value="draft" variant="outline">Zapisz szkic pakietu</Button><Button type="submit" value="submit">Przekaż kompletny pakiet do odbioru</Button></div>}
                </fieldset>
            </form>
            {!editable && <div className="flex flex-wrap gap-3 text-sm">{h?.source_url && <a className="text-primary underline" href={h.source_url} target="_blank" rel="noopener noreferrer">Źródła montażowe (nowa karta)</a>}{h?.rights_url && <a className="text-primary underline" href={h.rights_url} target="_blank" rel="noopener noreferrer">Dokument przekazania praw (nowa karta)</a>}</div>}
            {h?.status === 'submitted' && (state.canReview ? <form onSubmit={review} className="space-y-3 border-t border-border pt-4"><label className="block text-sm">Uwagi do odbioru<Input name="note" maxLength={2000} disabled={busy} /></label><div className="flex gap-2"><Button type="submit" value="accept" disabled={busy}>Potwierdź odbiór pakietu</Button><Button type="submit" value="reject" variant="outline" disabled={busy}>Zwróć do poprawy</Button></div></form> : <p className="text-sm text-muted-foreground">Pakiet musi odebrać niezależny administrator, który nie tworzył materiałów ani programu.</p>)}
        </>}
    </section>
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAcademyAction } from './useAcademyAction'
import { revokeAcademyCertificate, type AcademyCertificateRecord } from '@/lib/actions/academy-certificates'

function CertificateDecision({ item, viewerId }: { item: AcademyCertificateRecord; viewerId: string }) {
    const router = useRouter()
    const [reason, setReason] = useState('')
    const [expanded, setExpanded] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pending, run] = useAcademyAction()
    const snapshot = item.certificate_snapshot
    return <article className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div><h2 className="font-semibold">{snapshot.course_title} · v{snapshot.version_number}</h2><p>{snapshot.participant_name}</p><p className="text-sm text-muted-foreground">Ukończenie: {new Date(item.completed_at).toLocaleString('pl-PL')} · {item.id}</p></div>
        {item.revoked_at ? <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-semibold">Unieważniono {new Date(item.revoked_at).toLocaleString('pl-PL')}</p><p>{item.revoked_reason}</p>
            {item.decision?.rewards_state === 'retained_valid_completion' && <p>Punkty zachowano: uczestnik ma inne ważne ukończenie tego szkolenia.</p>}
            {!!item.decision?.reversed_transactions && <p>Cofnięte powiązane nagrody: {item.decision.reversed_transactions}.</p>}
            {item.decision?.manual_reward_review_required && <p className="font-semibold">Starsze nagrody wymagają ręcznego rozliczenia. Brak pewnego powiązania z tym ukończeniem; nie zostały automatycznie cofnięte.</p>}
        </div> : item.user_id === viewerId ? <p className="text-sm text-muted-foreground">Decyzję dotyczącą Twojego ukończenia musi podjąć inny administrator.</p> : <>
            {!expanded ? <Button variant="outline" onClick={() => setExpanded(true)}>Unieważnij ukończenie i certyfikat</Button> : <form className="space-y-3" onSubmit={event => { event.preventDefault(); setError(null); run(async () => {
                try { const result = await revokeAcademyCertificate(item.id, reason); if (!result.success) { setError(result.error); return } router.refresh(); setExpanded(false) }
                catch { setError('Nie udało się zapisać decyzji. Spróbuj ponownie.') }
            }) }}>
                <p className="text-sm text-muted-foreground">Decyzja jest trwała. Historia nauki zostanie zachowana, certyfikat utraci ważność. Powiązane punkty zostaną cofnięte, jeśli nie uzasadnia ich inne ważne ukończenie. Wcześniejsze zapisy na inne szkolenia pozostaną bez zmian.</p>
                <label className="block text-sm font-medium" htmlFor={`reason-${item.id}`}>Powód unieważnienia (widoczny dla uczestnika)</label>
                <Textarea id={`reason-${item.id}`} required minLength={10} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} />
                <div className="flex gap-2"><Button variant="destructive" disabled={pending || reason.trim().length < 10} type="submit">{pending ? 'Zapisywanie…' : 'Potwierdź unieważnienie'}</Button><Button variant="ghost" type="button" disabled={pending} onClick={() => setExpanded(false)}>Anuluj</Button></div>
            </form>}
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </article>
}

export function AcademyCertificatesPanel({ items, viewerId, search }: { items: AcademyCertificateRecord[]; viewerId: string; search: string }) {
    return <div className="space-y-4"><form className="flex gap-2" action="/admin/learning/certificates"><Input aria-label="Szukaj uczestnika lub szkolenia" name="q" placeholder="Uczestnik lub szkolenie" defaultValue={search} maxLength={100} /><Button type="submit">Szukaj</Button></form>
        {items.length ? items.map(item => <CertificateDecision key={`${item.id}:${item.revoked_at ?? 'valid'}`} item={item} viewerId={viewerId} />) : <p className="rounded-xl border border-border p-6 text-muted-foreground">Brak ukończeń spełniających wybrane warunki.</p>}
    </div>
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { MarkdownView } from '@/components/learning/MarkdownView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createQuestionDrafts, decideQuestionDraft, type QuestionDraftRow } from '@/lib/actions/academy-question-drafts'
import { MATERIAL_MAX_CHARS } from '@/lib/academy/question-draft'
import { cn } from '@/lib/utils'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function QuestionDraftsPanel({ courseId, enabled, drafts, reviewerName }: { courseId: string; enabled: boolean; drafts: QuestionDraftRow[]; reviewerName: string }) {
    const router = useRouter()
    const pending = drafts.filter(draft => draft.status === 'pending').sort((a, b) => Number(!!b.critique.risk) - Number(!!a.critique.risk))
    const [selectedId, setSelectedId] = useState<string | null>(pending[0]?.id ?? null)
    const [sourceLabel, setSourceLabel] = useState('')
    const [material, setMaterial] = useState('')
    const [count, setCount] = useState('5')
    const [confirmed, setConfirmed] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editedText, setEditedText] = useState('')
    const [editedOptions, setEditedOptions] = useState<QuestionDraftRow['options']>([])
    const [rejecting, setRejecting] = useState(false)
    const [reason, setReason] = useState('')
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isPending, run] = useAcademyAction()
    const draft = pending.find(item => item.id === selectedId) ?? pending[0]

    const startEdit = () => { if (draft) { setEditedText(draft.question_text); setEditedOptions(draft.options); setEditing(true) } }
    const generate = () => run(async () => {
        setError(null)
        const result = await createQuestionDrafts(courseId, { sourceLabel, material, count: Number.parseInt(count, 10), confirmedNoParticipantVoices: confirmed })
        if (result.success) { setMessage(`Powstało szkiców: ${result.data.saved}. Odrzucone automatycznie: ${result.data.rejected}.`); setMaterial(''); router.refresh() } else setError(result.error)
    })
    const decide = (approve: boolean) => run(async () => {
        if (!draft) return
        setError(null)
        const result = await decideQuestionDraft(courseId, draft.id, approve, { reason: approve ? undefined : reason, edited: approve && editing ? { question_text: editedText, options: editedOptions } : undefined })
        if (result.success) { setEditing(false); setRejecting(false); setReason(''); setMessage(approve ? 'Pytanie trafiło do puli.' : 'Szkic odrzucony.'); setSelectedId(null); router.refresh() } else setError(result.error)
    })

    return (
        <div className="space-y-5">
            {message && <p role="status" className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">{message}</p>}
            {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{error}</p>}
            <p className="text-sm text-muted-foreground">Pytanie trafia do puli dopiero po zatwierdzeniu przez człowieka. AI nie ocenia uczestników.</p>

            {!enabled ? (
                <p role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">Generowanie szkiców jest wyłączone do decyzji właściciela o przekazaniu treści do modelu. Istniejące szkice można przejrzeć i rozstrzygnąć.</p>
            ) : (
                <section aria-label="Nowe szkice" className="space-y-3 rounded-2xl border border-border bg-card p-5">
                    <h2 className="text-lg font-semibold">Źródło</h2>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                        <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Nazwa materiału</span><Input value={sourceLabel} onChange={event => setSourceLabel(event.target.value)} placeholder="Moduł 3, slajdy" /></label>
                        <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Liczba pytań</span><Input inputMode="numeric" value={count} onChange={event => setCount(event.target.value)} /></label>
                    </div>
                    <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Treść slajdów i materiału prowadzącego</span><Textarea rows={8} maxLength={MATERIAL_MAX_CHARS} value={material} onChange={event => setMaterial(event.target.value)} /></label>
                    <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Materiał nie zawiera głosów ani danych uczestników.</label>
                    <Button className="gap-2" disabled={isPending || !confirmed || material.trim().length < 50 || !sourceLabel.trim()} onClick={() => void generate()}>{isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}Przygotuj szkice</Button>
                </section>
            )}

            <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{drafts.length} szkiców, {drafts.filter(item => item.status === 'approved').length} zatwierdzonych, {drafts.filter(item => item.status === 'rejected').length} odrzuconych</span><Badge variant="outline" className="border-warning/30 text-warning">{pending.length} czeka na decyzję</Badge></div>

            {draft ? (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                    <section aria-label="Do decyzji" className="space-y-2 rounded-2xl border border-border bg-card p-4">
                        <h2 className="font-semibold">Do decyzji <span className="text-muted-foreground">{pending.length}</span></h2>
                        <p className="text-xs text-muted-foreground">Najpierw szkice z uwagami krytyka</p>
                        <ul className="space-y-2">{pending.map(item => <li key={item.id}><button type="button" aria-current={item.id === draft.id} onClick={() => { setSelectedId(item.id); setEditing(false); setRejecting(false) }} className={cn('w-full rounded-lg border p-3 text-left text-sm', item.id === draft.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}><span className="line-clamp-2 block">{item.question_text.split('\n')[0]}</span><span className="block text-xs text-muted-foreground">{item.source_label}, {item.critique.level ?? 'brak oceny'}</span></button></li>)}</ul>
                    </section>
                    <section aria-label="Szkic" className="space-y-4 rounded-2xl border border-border bg-card p-5">
                        <h2 className="font-semibold">Szkic {pending.indexOf(draft) + 1} z {pending.length} do decyzji <Badge variant="outline" className="ml-2 text-[10px]">Szkic AI</Badge></h2>
                        {editing ? <Textarea rows={5} aria-label="Treść pytania" value={editedText} onChange={event => setEditedText(event.target.value)} /> : <MarkdownView content={draft.question_text} className="break-words" />}
                        <ul className="space-y-2">{(editing ? editedOptions : draft.options).map((option, index) => (
                            <li key={index} className={cn('flex items-start gap-3 rounded-lg border p-3 text-sm', option.is_correct ? 'border-success/40 bg-success/5' : 'border-border')}>
                                <span className="font-semibold">{LETTERS[index]}</span>
                                <div className="min-w-0 flex-1">{editing ? <Input aria-label={`Odpowiedź ${LETTERS[index]}`} value={option.option_text} onChange={event => setEditedOptions(list => list.map((item, position) => position === index ? { ...item, option_text: event.target.value } : item))} /> : <p className="break-words">{option.option_text}</p>}{option.is_correct && <p className="text-xs font-medium text-success">Wskazana jako poprawna</p>}{option.explanation && <p className="break-words text-xs text-muted-foreground">{option.explanation}</p>}</div>
                            </li>
                        ))}</ul>
                        <blockquote className="border-l-2 border-primary pl-3 text-sm text-muted-foreground"><span className="block text-xs font-medium">{draft.source_label}</span>„{draft.source_excerpt}”</blockquote>
                        <div className="rounded-lg bg-muted/50 p-3 text-sm"><p className="font-medium">Ocena krytyka</p><p>Poziom: {draft.critique.level ?? 'brak'} · Jednoznaczność: {draft.critique.clarity ?? 'brak'}{draft.critique.risk ? ` · Ryzyko: ${draft.critique.risk}` : ''}</p>{draft.critique.note && <p className="text-muted-foreground">{draft.critique.note}</p>}</div>
                        {rejecting && <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Powód odrzucenia</span><Textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label>}
                        <div className="flex flex-wrap items-center gap-2">
                            {!rejecting && <Button disabled={isPending} onClick={() => void decide(true)}>Zatwierdź do puli</Button>}
                            {!rejecting && !editing && <Button variant="outline" onClick={startEdit}>Popraw</Button>}
                            {rejecting ? <><Button variant="destructive" disabled={isPending || reason.trim().length < 3} onClick={() => void decide(false)}>Odrzuć szkic</Button><Button variant="outline" onClick={() => setRejecting(false)}>Anuluj</Button></> : <Button variant="outline" onClick={() => setRejecting(true)}>Odrzuć</Button>}
                            <span className="text-xs text-muted-foreground">Zatwierdza: {reviewerName}, zapisywane w audycie</span>
                        </div>
                    </section>
                </div>
            ) : <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nie ma szkiców do decyzji.</p>}
        </div>
    )
}

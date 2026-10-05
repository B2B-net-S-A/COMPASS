'use client'

import { useState } from 'react'
import { useAcademyAction } from './useAcademyAction'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { submitEditionSurvey, saveEditionSurveySettings } from '@/lib/actions/academy-surveys'
import { editionSurveyLabels, type EditionSurveyAnswers, type EditionSurveyState } from '@/lib/types/academy-surveys'

const selectClass = 'w-full rounded-md border border-input bg-background p-2 text-sm'
export function EditionSurveyForm({ runId, state }: { runId: string; state: EditionSurveyState }) {
    const [pending, start] = useAcademyAction()
    const [submitted, setSubmitted] = useState(state.submitted)
    const [values, setValues] = useState<Record<string, string>>({ materials: '', nps: '', willingToTeach: 'no', contactPreference: 'none' })
    const labels = { ...editionSurveyLabels, ...state.settings.labels }
    const set = (key: string, value: string) => setValues(old => ({ ...old, [key]: value }))
    if (submitted) return <p role="status" className="rounded-lg border p-4">Dziękujemy — ankieta tej edycji została zapisana.</p>
    if (!state.eligible) return <p className="text-sm text-muted-foreground">Ankieta będzie dostępna po potwierdzeniu Twojej obecności na tej edycji. Nie wymaga ukończenia później udostępnianych nagrań.</p>
    const rating = (key: 'overall' | 'trainer' | 'materials', required: boolean) => <div className="space-y-1" key={key}>
        <Label htmlFor={'edition-' + key}>{labels[key]}</Label>
        <select id={'edition-' + key} className={selectClass} required={required} disabled={pending} value={values[key] ?? ''} onChange={e => set(key, e.target.value)}>
            <option value="">{required ? 'Wybierz ocenę' : 'Jeszcze nie otrzymałem/am materiałów / nie oceniam'}</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}
        </select>
    </div>
    return <form className="space-y-4 rounded-lg border p-5" onSubmit={e => {
        e.preventDefault()
        const answers: EditionSurveyAnswers = {
            overall: Number(values.overall), trainer: Number(values.trainer), materials: values.materials ? Number(values.materials) : null,
            difficulty: values.difficulty as EditionSurveyAnswers['difficulty'], futureTopics: values.futureTopics ?? '',
            willingToTeach: values.willingToTeach === 'yes', proposedTopic: values.proposedTopic ?? '',
            contactPreference: values.contactPreference as EditionSurveyAnswers['contactPreference'], nps: values.nps ? Number(values.nps) : null,
        }
        start(async () => {
            const result = await submitEditionSurvey(runId, answers)
            if (!result.success) { toast.error(result.error); return }
            setSubmitted(true)
        })
    }}>
        <h3 className="font-semibold">Ankieta po tej edycji szkolenia</h3>
        <p className="text-sm text-muted-foreground">{state.settings.introduction}</p>
        {rating('overall', true)}{rating('trainer', true)}{rating('materials', false)}
        <div className="space-y-1"><Label htmlFor="edition-difficulty">{labels.difficulty}</Label>
            <select id="edition-difficulty" className={selectClass} required disabled={pending} value={values.difficulty ?? ''} onChange={e => set('difficulty', e.target.value)}>
                <option value="">Wybierz odpowiedź</option><option value="too_easy">Zbyt łatwy</option><option value="appropriate">Odpowiedni</option><option value="too_hard">Zbyt trudny</option>
            </select></div>
        <div className="space-y-1"><Label htmlFor="edition-topics">{labels.futureTopics}</Label><Textarea id="edition-topics" maxLength={2000} disabled={pending} value={values.futureTopics ?? ''} onChange={e => set('futureTopics', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="edition-teach">{labels.willingToTeach}</Label>
            <select id="edition-teach" className={selectClass} disabled={pending} value={values.willingToTeach} onChange={e => set('willingToTeach', e.target.value)}><option value="no">Nie</option><option value="yes">Tak</option></select></div>
        {values.willingToTeach === 'yes' && <>
            <div className="space-y-1"><Label htmlFor="edition-proposed">Proponowany temat (opcjonalnie)</Label><Textarea id="edition-proposed" maxLength={2000} disabled={pending} value={values.proposedTopic ?? ''} onChange={e => set('proposedTopic', e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="edition-contact">Preferencja kontaktu w sprawie prowadzenia</Label><select id="edition-contact" className={selectClass} disabled={pending} value={values.contactPreference} onChange={e => set('contactPreference', e.target.value)}><option value="none">Bez kontaktu na tym etapie</option><option value="compass">W Compass</option><option value="contract_email">Na adres z umowy B2B</option></select></div>
            <p className="text-xs text-muted-foreground">Deklaracja nie nadaje uprawnień prowadzącego i nie wysyła wiadomości automatycznie.</p>
        </>}
        <div className="space-y-1"><Label htmlFor="edition-nps">Czy polecisz szkolenie? 0–10 (opcjonalnie)</Label><select id="edition-nps" className={selectClass} disabled={pending} value={values.nps} onChange={e => set('nps', e.target.value)}><option value="">Nie oceniam</option>{Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <Button type="submit" disabled={pending}>{pending ? 'Zapisywanie…' : 'Wyślij ankietę tej edycji'}</Button>
    </form>
}

export function EditionSurveySettings({ runId, state }: { runId: string; state: EditionSurveyState }) {
    const [pending, start] = useAcademyAction()
    const [introduction, setIntroduction] = useState(state.settings.introduction)
    const [labels, setLabels] = useState({ ...editionSurveyLabels, ...state.settings.labels })
    return <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Dostosuj ankietę tej edycji</summary>
        <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); start(async () => {
            const result = await saveEditionSurveySettings(runId, introduction, labels)
            if (!result.success) toast.error(result.error); else toast.success('Zapisano ankietę edycji.')
        }) }}>
            <p className="text-xs text-muted-foreground">Zmiany dotyczą kolejnych odpowiedzi. Wcześniejsze zachowują treść pytań z chwili wysłania. Oceny są zbiorcze; deklaracje prowadzenia widzi tylko administrator.</p>
            <Label htmlFor="edition-introduction">Wprowadzenie</Label><Textarea id="edition-introduction" required maxLength={2000} disabled={pending} value={introduction} onChange={e => setIntroduction(e.target.value)} />
            {Object.entries(labels).map(([key, label]) => <div key={key}><Label htmlFor={'edition-label-' + key}>{editionSurveyLabels[key as keyof typeof editionSurveyLabels]}</Label><Textarea id={'edition-label-' + key} required rows={1} maxLength={250} disabled={pending} value={label} onChange={e => setLabels(old => ({ ...old, [key]: e.target.value }))} /></div>)}
            <Button type="submit" disabled={pending}>Zapisz pytania edycji</Button>
        </form>
    </details>
}

'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Plus, Shuffle, Upload } from 'lucide-react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { MarkdownView } from '@/components/learning/MarkdownView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { previewVoidQuestion, saveQuizBank, saveQuizSettings, voidQuestion, type QuizBank, type VoidImpact } from '@/lib/actions/academy-quiz-bank'
import { difficultyBand, isActive, questionState, questionsFromCsv, sampleSet, topicDistribution, type BankQuestion, type QuestionState } from '@/lib/academy/quiz-bank'
import { cn } from '@/lib/utils'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const STATE_LABEL: Record<QuestionState, string> = { draft: 'Szkic', approved: 'Zatwierdzone', voided: 'Unieważnione' }
const STATE_CLASS: Record<QuestionState, string> = { draft: 'border-border text-muted-foreground', approved: 'border-success/30 text-success', voided: 'border-destructive/30 text-destructive' }
const emptyQuestion = (): BankQuestion => ({ question_text: '', topic_tag: null, pool_status: 'draft', options: Array.from({ length: 4 }, () => ({ option_text: '', is_correct: false, explanation: null })) })
const hasCode = (text: string) => text.includes('```')
const toInt = (value: string) => { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? parsed : null }

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
    return <label className="flex flex-col gap-1 text-sm"><span className="font-medium">{label}</span>{children}<span className="text-xs text-muted-foreground">{hint}</span></label>
}
function Toggle({ label, hint, checked, disabled, onChange }: { label: string; hint: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
    return <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span><span className="font-medium">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span></label>
}

export function QuizBankEditor({ bank }: { bank: QuizBank }) {
    const router = useRouter()
    const [questions, setQuestions] = useState<BankQuestion[]>(bank.questions)
    const [selected, setSelected] = useState(0)
    const [dirty, setDirty] = useState(false)
    const [search, setSearch] = useState('')
    const [topicFilter, setTopicFilter] = useState('')
    const [stateFilter, setStateFilter] = useState<'' | QuestionState>('')
    const [draw, setDraw] = useState(bank.rules.draw_count?.toString() ?? '')
    const [pass, setPass] = useState(String(bank.rules.quiz_pass_percent))
    const [attemptLimit, setAttemptLimit] = useState(String(bank.attemptLimit ?? 3))
    const [attemptWindow, setAttemptWindow] = useState(String(bank.attemptWindowHours ?? 24))
    const [timeLimit, setTimeLimit] = useState(bank.rules.time_limit_minutes?.toString() ?? '')
    const [preTest, setPreTest] = useState(bank.rules.pre_test_count?.toString() ?? '')
    const [random, setRandom] = useState(bank.rules.draw_random ?? true)
    const [shuffle, setShuffle] = useState(bank.rules.shuffle_options ?? true)
    const [explanations, setExplanations] = useState(bank.rules.show_explanations ?? false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [sample, setSample] = useState<BankQuestion[] | null>(null)
    const [impact, setImpact] = useState<VoidImpact | null>(null)
    const [voidReason, setVoidReason] = useState('')
    const fileRef = useRef<HTMLInputElement>(null)
    const [isPending, run] = useAcademyAction()

    const active = useMemo(() => questions.filter(isActive), [questions])
    const topics = useMemo(() => topicDistribution(questions), [questions])
    const analysisById = useMemo(() => new Map(bank.analysis.map(row => [row.question_id, row])), [bank.analysis])
    const bands = useMemo(() => {
        const counts = { hard: 0, medium: 0, easy: 0, unknown: 0 }
        for (const question of active) counts[difficultyBand(analysisById.get(question.id ?? '')?.correct_percent)]++
        return counts
    }, [active, analysisById])
    const counts = useMemo(() => ({ draft: questions.filter(q => questionState(q) === 'draft').length, approved: questions.filter(q => questionState(q) === 'approved').length, voided: questions.filter(q => questionState(q) === 'voided').length }), [questions])
    const visible = questions.map((question, index) => ({ question, index })).filter(({ question }) =>
        (!search || question.question_text.toLowerCase().includes(search.toLowerCase()))
        && (!topicFilter || (question.topic_tag ?? 'Bez tematu') === topicFilter)
        && (!stateFilter || questionState(question) === stateFilter))
        .sort((a, b) => (analysisById.get(a.question.id ?? '')?.correct_percent ?? 101) - (analysisById.get(b.question.id ?? '')?.correct_percent ?? 101))
    const current = questions[selected] as BankQuestion | undefined
    const currentAnalysis = current?.id ? analysisById.get(current.id) : undefined
    const responses = currentAnalysis?.responses ?? 0
    const editable = bank.editable

    const patch = (index: number, change: Partial<BankQuestion>) => { setQuestions(list => list.map((item, position) => position === index ? { ...item, ...change } : item)); setDirty(true) }
    const patchOption = (optionIndex: number, change: Partial<BankQuestion['options'][number]>) => current && patch(selected, { options: current.options.map((option, position) => position === optionIndex ? { ...option, ...change } : option) })
    const markCorrect = (optionIndex: number) => current && patch(selected, { options: current.options.map((option, position) => ({ ...option, is_correct: position === optionIndex })) })
    const addQuestion = () => { setQuestions(list => [...list, emptyQuestion()]); setSelected(questions.length); setDirty(true) }

    const feedback = (result: { success: true } | { success: false; error: string }, ok: string) => {
        if (result.success) { setError(null); setMessage(ok); router.refresh() } else { setMessage(null); setError(result.error) }
    }
    const saveSettings = () => run(async () => {
        feedback(await saveQuizSettings(bank.courseId, {
            draw_count: draw ? toInt(draw) : null, quiz_pass_percent: toInt(pass) ?? 0, time_limit_minutes: timeLimit ? toInt(timeLimit) : null, pre_test_count: preTest ? toInt(preTest) : null,
            draw_random: random, shuffle_options: shuffle, show_explanations: explanations, attempt_limit: toInt(attemptLimit) ?? 0, attempt_window_hours: toInt(attemptWindow) ?? 0,
        }), 'Ustawienia zapisane. Obowiązują od następnej próby.')
    })
    const savePool = () => run(async () => {
        const result = await saveQuizBank(bank.courseId, questions.map(({ question_text, topic_tag, pool_status, options }) => ({ question_text, topic_tag, pool_status, options })))
        if (result.success) setDirty(false)
        feedback(result, 'Pula zapisana.')
    })
    const importCsv = async (file: File) => {
        const { questions: imported, errors } = questionsFromCsv(await file.text())
        setQuestions(list => [...list, ...imported])
        if (imported.length) setDirty(true)
        setError(errors.length ? errors.join(' ') : null)
        setMessage(imported.length ? `Dodano z pliku: ${imported.length}. Sprawdź i zapisz pulę.` : null)
    }
    const openVoid = () => run(async () => {
        if (!current?.id) return
        const result = await previewVoidQuestion(current.id)
        if (result.success) { setImpact(result.data); setVoidReason(''); setError(null) } else setError(result.error)
    })
    const confirmVoid = () => run(async () => {
        if (!current?.id) return
        const result = await voidQuestion(bank.courseId, current.id, voidReason)
        if (result.success) setImpact(null)
        feedback(result, result.success ? `Unieważniono. Przeliczono prób: ${result.data.recalculated}, nowe ukończenia: ${result.data.completions_closed}.` : '')
    })

    return (
        <div className="space-y-5">
            {message && <p role="status" className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">{message}</p>}
            {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{error}</p>}
            {!editable && <p role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">Wersja {bank.versionNumber} jest opublikowana i zamrożona. Pytanie można unieważnić; pozostałe zmiany wymagają nowego szkicu.</p>}

            <section className="space-y-4 rounded-2xl border border-border bg-card p-5" aria-label="Ustawienia testu">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><h2 className="text-lg font-semibold">Ustawienia testu</h2><p className="text-xs text-muted-foreground">Zmiany obowiązują od następnej próby.</p></div>
                    {editable && <Button variant="outline" size="sm" disabled={isPending} onClick={() => void saveSettings()}>Zapisz ustawienia</Button>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Pytań w teście" hint={`z puli ${active.length}`}><Input inputMode="numeric" value={draw} disabled={!editable} placeholder="Cała pula" onChange={event => setDraw(event.target.value)} /></Field>
                    <Field label="Próg zaliczenia" hint="% poprawnych"><Input inputMode="numeric" value={pass} disabled={!editable} onChange={event => setPass(event.target.value)} /></Field>
                    <Field label="Limit prób" hint={`na ${attemptWindow || '?'} h`}><div className="flex gap-2"><Input inputMode="numeric" aria-label="Liczba prób" value={attemptLimit} disabled={!editable} onChange={event => setAttemptLimit(event.target.value)} /><Input inputMode="numeric" aria-label="Okno w godzinach" value={attemptWindow} disabled={!editable} onChange={event => setAttemptWindow(event.target.value)} /></div></Field>
                    <Field label="Limit czasu" hint="minut na próbę"><Input inputMode="numeric" value={timeLimit} disabled={!editable} placeholder="Bez limitu" onChange={event => setTimeLimit(event.target.value)} /></Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Toggle label="Losuj pytania" hint={`Każda próba dostaje inne ${draw || active.length} z ${active.length}.`} checked={random} disabled={!editable} onChange={setRandom} />
                    <Toggle label="Losuj kolejność odpowiedzi" hint="Litery układają się na nowo." checked={shuffle} disabled={!editable} onChange={setShuffle} />
                    <Toggle label="Wyjaśnienia po teście" hint="Wymaga puli co najmniej dwukrotnie większej od zestawu." checked={explanations} disabled={!editable} onChange={setExplanations} />
                    <Field label="Test wstępny" hint="Pytań przed pierwszą lekcją, bez wpływu na zaliczenie."><Input inputMode="numeric" value={preTest} disabled={!editable} placeholder="Wyłączony" onChange={event => setPreTest(event.target.value)} /></Field>
                </div>
                <div className="grid gap-3 border-t border-border pt-4 text-sm md:grid-cols-2">
                    <p><span className="font-medium">Tematy: </span><span className="text-muted-foreground">{topics.map(topic => `${topic.topic} (${topic.count})`).join(', ') || 'brak'}</span></p>
                    <p><span className="font-medium">Trudność: </span><span className="text-muted-foreground">trudne {bands.hard}, średnie {bands.medium}, łatwe {bands.easy}, bez danych {bands.unknown}</span></p>
                </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <section className="space-y-3 rounded-2xl border border-border bg-card p-5" aria-label="Pula pytań">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-lg font-semibold">Pula pytań</h2>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSample(sampleSet(questions, draw ? toInt(draw) : null))}><Shuffle className="size-4" aria-hidden="true" />Przykładowy zestaw</Button>
                            {editable && <><input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="Plik CSV z pytaniami" onChange={event => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.target.value = '' }} />
                                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}><Upload className="size-4" aria-hidden="true" />Import z CSV</Button>
                                <Button size="sm" className="gap-1.5" onClick={addQuestion}><Plus className="size-4" aria-hidden="true" />Nowe pytanie</Button></>}
                        </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                        <Input placeholder="Szukaj w treści pytań" aria-label="Szukaj w treści pytań" value={search} onChange={event => setSearch(event.target.value)} />
                        <select aria-label="Temat" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={topicFilter} onChange={event => setTopicFilter(event.target.value)}><option value="">Temat: wszystkie</option>{topics.map(topic => <option key={topic.topic} value={topic.topic}>{topic.topic}</option>)}</select>
                        <select aria-label="Stan" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={stateFilter} onChange={event => setStateFilter(event.target.value as '' | QuestionState)}><option value="">Stan: wszystkie ({questions.length})</option><option value="draft">Szkic ({counts.draft})</option><option value="approved">Zatwierdzone ({counts.approved})</option><option value="voided">Unieważnione ({counts.voided})</option></select>
                    </div>
                    <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                        {visible.map(({ question, index }) => {
                            const state = questionState(question)
                            const stats = question.id ? analysisById.get(question.id) : undefined
                            const worst = stats?.options.filter(option => !option.is_correct).sort((a, b) => b.count - a.count)[0]
                            const worstIndex = worst ? stats!.options.indexOf(worst) : -1
                            return (
                                <li key={question.id ?? `new-${index}`}>
                                    <button type="button" aria-current={selected === index} onClick={() => setSelected(index)} className={cn('w-full space-y-1 rounded-lg border p-3 text-left text-sm', selected === index ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
                                        <span className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">P-{index + 1}</span><Badge variant="outline" className={cn('text-[10px]', STATE_CLASS[state])}>{STATE_LABEL[state]}</Badge></span>
                                        <span className="line-clamp-2 block">{question.question_text.split('\n')[0] || 'Nowe pytanie'}</span>
                                        <span className="block text-xs text-muted-foreground">{hasCode(question.question_text) ? 'Scenariusz z kodem' : 'Jednokrotny wybór'} · {question.topic_tag ?? 'Bez tematu'}</span>
                                        <span className="block text-xs text-muted-foreground">{state === 'voided' ? question.void_reason : stats && stats.responses > 0 ? `${stats.correct_percent}% poprawnych${worst && worst.count ? `, najczęstsza zła: ${LETTERS[worstIndex]}, ${Math.round(worst.count * 100 / stats.responses)}%` : ''}` : state === 'draft' ? 'Poza losowaniem' : 'Bez odpowiedzi'}</span>
                                    </button>
                                </li>
                            )
                        })}
                        {visible.length === 0 && <li className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Brak pytań dla tych filtrów.</li>}
                    </ul>
                    {editable && <Button className="w-full" disabled={isPending || !dirty} onClick={() => void savePool()}>{dirty ? 'Zapisz pulę' : 'Pula zapisana'}</Button>}
                </section>

                {current ? (
                    <section className="space-y-4 rounded-2xl border border-border bg-card p-5" aria-label={`Pytanie P-${selected + 1}`}>
                        <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Pytanie P-{selected + 1}</h2><Badge variant="outline" className={cn('text-[10px]', STATE_CLASS[questionState(current)])}>{STATE_LABEL[questionState(current)]}</Badge><span className="text-xs text-muted-foreground">Wersja {bank.versionNumber}</span></div>
                        {editable ? <>
                            <Field label="Scenariusz i pytanie" hint="Markdown; blok kodu w potrójnych odwrotnych apostrofach."><Textarea rows={6} value={current.question_text} onChange={event => patch(selected, { question_text: event.target.value })} /></Field>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Temat" hint="Do filtrów i wyniku uczestnika."><Input value={current.topic_tag ?? ''} onChange={event => patch(selected, { topic_tag: event.target.value.trim() ? event.target.value : null })} /></Field>
                                <Field label="Stan" hint="Szkic nie wchodzi do losowania."><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={current.pool_status} onChange={event => patch(selected, { pool_status: event.target.value as 'draft' | 'approved' })}><option value="approved">Zatwierdzone</option><option value="draft">Szkic</option></select></Field>
                            </div>
                        </> : <MarkdownView content={current.question_text} className="break-words prose-pre:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0" />}
                        <div className="space-y-2">
                            <p className="text-sm font-medium">Odpowiedzi{editable ? '. Kliknij literę, aby oznaczyć poprawną.' : ''}{responses > 0 && <span className="ml-2 font-normal text-muted-foreground">{responses} odpowiedzi</span>}</p>
                            {!bank.keyVisible && <p className="text-sm text-muted-foreground">Klucz opublikowanej wersji widzą tylko autor i recenzent.</p>}
                            {current.options.map((option, optionIndex) => {
                                const stat = currentAnalysis?.options[optionIndex]
                                return (
                                    <div key={optionIndex} className={cn('flex items-start gap-3 rounded-lg border p-3', option.is_correct ? 'border-success/40 bg-success/5' : 'border-border')}>
                                        <button type="button" disabled={!editable} aria-label={`Oznacz odpowiedź ${LETTERS[optionIndex]} jako poprawną`} aria-pressed={option.is_correct} onClick={() => markCorrect(optionIndex)} className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold', option.is_correct ? 'border-success bg-success text-success-foreground' : 'border-border')}>{LETTERS[optionIndex]}</button>
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            {editable ? <><Input aria-label={`Treść odpowiedzi ${LETTERS[optionIndex]}`} value={option.option_text} onChange={event => patchOption(optionIndex, { option_text: event.target.value })} /><Input aria-label={`Wyjaśnienie odpowiedzi ${LETTERS[optionIndex]}`} placeholder="Wyjaśnienie (opcjonalne)" value={option.explanation ?? ''} onChange={event => patchOption(optionIndex, { explanation: event.target.value || null })} /></> : <><p className="break-words text-sm">{option.option_text}</p>{option.explanation && <p className="break-words text-xs text-muted-foreground">{option.explanation}</p>}</>}
                                        </div>
                                        {stat && responses > 0 && <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">{Math.round(stat.count * 100 / responses)}%<br />{stat.count} os.</span>}
                                    </div>
                                )
                            })}
                        </div>
                        {!editable && current.id && !current.voided_at && (
                            <div className="space-y-3 border-t border-border pt-4">
                                <p className="text-sm text-muted-foreground">Pytanie zostanie uznane za poprawne w każdej próbie, w której padło, i wypadnie z losowania.</p>
                                {!impact ? <Button variant="outline" disabled={isPending} onClick={() => void openVoid()}>Unieważnij w opublikowanym teście</Button> : (
                                    <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
                                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                            <div><dt className="text-xs text-muted-foreground">Próby z pytaniem</dt><dd className="font-semibold">{impact.attempts}</dd></div>
                                            <div><dt className="text-xs text-muted-foreground">Zyskają punkt</dt><dd className="font-semibold">{impact.gain_point}</dd></div>
                                            <div><dt className="text-xs text-muted-foreground">Przekroczą próg</dt><dd className="font-semibold">{impact.cross_threshold}</dd></div>
                                            <div><dt className="text-xs text-muted-foreground">Stracą zaliczenie</dt><dd className="font-semibold">{impact.lose_pass}</dd></div>
                                        </dl>
                                        <p>{impact.cross_threshold} prób przekroczy próg, co daje {impact.new_passes} nowych zaliczeń. W puli zostanie {impact.pool_after} zatwierdzonych pytań.</p>
                                        <Field label="Powód unieważnienia" hint="Trafia do audytu."><Textarea rows={2} value={voidReason} onChange={event => setVoidReason(event.target.value)} /></Field>
                                        <div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={isPending || voidReason.trim().length < 5} onClick={() => void confirmVoid()}>Unieważnij w opublikowanym teście</Button><Button variant="outline" onClick={() => setImpact(null)}>Anuluj</Button></div>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                ) : <section className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Pula jest pusta. Dodaj pytanie albo zaimportuj plik CSV.</section>}
            </div>

            {sample && (
                <section className="space-y-2 rounded-2xl border border-border bg-card p-5" aria-label="Przykładowy zestaw">
                    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Przykładowy zestaw ({sample.length})</h2><Button variant="outline" size="sm" onClick={() => setSample(null)}>Zamknij</Button></div>
                    <ol className="list-inside list-decimal space-y-1 text-sm">{sample.map((question, index) => <li key={index} className="break-words">{question.question_text.split('\n')[0]} <span className="text-xs text-muted-foreground">({question.topic_tag ?? 'Bez tematu'})</span></li>)}</ol>
                </section>
            )}
        </div>
    )
}

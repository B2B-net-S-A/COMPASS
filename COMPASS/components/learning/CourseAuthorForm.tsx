'use client'

import { useId, useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { CoursePrerequisitesEditor } from '@/components/academy/CoursePrerequisitesEditor'
import { BookOpen, CheckCircle2, Layers, Loader2, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createCourse, updateCourse } from '@/lib/actions/courses'
import { cn } from '@/lib/utils'
import type { Course, CourseCompletionRules, CourseDeliveryMode, CourseLevel, CourseType } from '@/lib/types/learning'

interface CourseAuthorFormProps {
    initial?: Course
    onSuccess?: (courseId: string, slug: string) => void
    submitLabel?: string
    /** Only administrators may create company/official courses; the action enforces this. */
    allowCompanyType?: boolean
    defaultCourseType?: CourseType
}

const CATEGORIES = ['Frontend', 'Backend', 'Cloud', 'DevOps', 'Data', 'Mobile', 'Soft Skills', 'Architektura', 'Bezpieczeństwo', 'AI/ML', 'Inne']
const FORMATS: { value: CourseDeliveryMode; label: string; description: string; icon: typeof BookOpen }[] = [
    { value: 'self_paced', label: 'Samodzielna nauka', description: 'Lekcje i materiały dostępne we własnym tempie.', icon: BookOpen },
    { value: 'live', label: 'Na żywo w Teams', description: 'Spotkania z prowadzącym w ustalonych terminach.', icon: Video },
    { value: 'blended', label: 'Kurs mieszany', description: 'Materiały do nauki połączone ze spotkaniami.', icon: Layers },
]
const SELECT_CLASS = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export function CourseAuthorForm({ initial, onSuccess, submitLabel, allowCompanyType = false, defaultCourseType = 'consultant' }: CourseAuthorFormProps) {
    const formId = useId()
    const [title, setTitle] = useState(initial?.title ?? '')
    const [description, setDescription] = useState(initial?.description ?? '')
    const [category, setCategory] = useState(initial?.category ?? '')
    const [level, setLevel] = useState<CourseLevel>(initial?.level ?? 'beginner')
    const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
    const [prerequisites, setPrerequisites] = useState<string[]>(initial?.prerequisite_course_ids ?? [])
    const [tagInput, setTagInput] = useState('')
    const [duration, setDuration] = useState(initial?.duration_minutes?.toString() ?? '')
    const [courseType, setCourseType] = useState<CourseType>(initial?.course_type ?? defaultCourseType)
    const [isOfficial, setIsOfficial] = useState(initial?.is_official ?? false)
    const [mode, setMode] = useState<CourseDeliveryMode>(initial?.delivery_mode ?? 'self_paced')
    const [quizRequired, setQuizRequired] = useState(initial?.completion_rules?.quiz_required ?? true)
    const [requireLessons, setRequireLessons] = useState(initial?.completion_rules?.require_all_lessons ?? true)
    const [quizPercent, setQuizPercent] = useState(String(initial?.completion_rules?.quiz_pass_percent ?? (initial ? 70 : 80)))
    const [attendancePercent, setAttendancePercent] = useState(String(initial?.completion_rules?.attendance_percent ?? 80))
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [isPending, startTransition] = useAcademyAction()
    const needsAttendance = mode !== 'self_paced'

    function addTag() {
        const tag = tagInput.trim().toLowerCase()
        if (!tag) return
        if (tags.includes(tag)) { setTagInput(''); return }
        if (tags.length >= 20) { setError('Możesz dodać maksymalnie 20 tagów.'); return }
        setTags([...tags, tag.slice(0, 60)])
        setTagInput('')
        setSaved(false)
    }

    function changeMode(value: CourseDeliveryMode) {
        setMode(value)
        setRequireLessons(value !== 'live')
        if (value === 'live') setQuizRequired(false)
        setSaved(false)
    }

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        setError(null)
        setSaved(false)
        const durationMinutes = duration === '' ? undefined : Number(duration)
        const rules: CourseCompletionRules = {
            quiz_required: quizRequired,
            quiz_pass_percent: quizRequired ? Number(quizPercent) : (initial?.completion_rules?.quiz_pass_percent ?? 80),
            require_all_lessons: requireLessons,
            attendance_percent: needsAttendance ? Number(attendancePercent) : (initial?.completion_rules?.attendance_percent ?? 80),
        }
        if (durationMinutes !== undefined && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 60000)) {
            setError('Czas szkolenia musi wynosić od 1 do 60 000 minut. Możesz też pozostawić pole puste.')
            return
        }
        if (![rules.quiz_pass_percent, rules.attendance_percent].every((value) => Number.isInteger(value) && value >= 1 && value <= 100)) {
            setError('Progi zaliczenia muszą być liczbami całkowitymi od 1 do 100%.')
            return
        }
        if (mode === 'self_paced' && !quizRequired && !requireLessons) {
            setError('Kurs samodzielny musi wymagać ukończenia lekcji lub zaliczenia quizu.')
            return
        }
        startTransition(async () => {
            try {
                const metadata = { title: title.trim(), description: description.trim(), category, tags, level, delivery_mode: mode, completion_rules: rules, prerequisite_course_ids: prerequisites }
                if (initial) {
                    const result = await updateCourse(initial.id, { ...metadata, description: metadata.description || null, duration_minutes: durationMinutes ?? null })
                    if (!result.success) { setError(result.error); return }
                    setSaved(true)
                    onSuccess?.(initial.id, result.data.slug)
                } else {
                    const result = await createCourse({ ...metadata, duration_minutes: durationMinutes, course_type: allowCompanyType ? courseType : 'consultant', is_official: allowCompanyType && courseType === 'company' && isOfficial })
                    if (!result.success) { setError(result.error); return }
                    onSuccess?.(result.data.courseId, result.data.slug)
                }
            } catch {
                setError('Nie udało się zapisać szkolenia. Spróbuj ponownie.')
            }
        })
    }

    return (
        <form onSubmit={handleSubmit} onChange={() => setSaved(false)} className="space-y-6">
            {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

            <fieldset disabled={isPending} className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
                <legend className="px-2 text-base font-semibold">Informacje o szkoleniu</legend>
                <p className="text-sm text-muted-foreground">Opisz, czego uczestnik się nauczy i dla kogo przygotowujesz program.</p>
                {allowCompanyType && !initial && (
                    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
                        <label htmlFor={`${formId}-source`} className="block text-sm font-medium">Rodzaj szkolenia</label>
                        <select id={`${formId}-source`} value={courseType} onChange={(event) => setCourseType(event.target.value as CourseType)} className={SELECT_CLASS}>
                            <option value="consultant">Autorskie szkolenie konsultanta</option>
                            <option value="company">Szkolenie firmowe</option>
                        </select>
                        {courseType === 'company' && <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={isOfficial} onChange={(event) => setIsOfficial(event.target.checked)} className="mt-0.5 size-4 accent-primary" /><span>Oznacz jako oficjalne szkolenie firmy</span></label>}
                    </div>
                )}
                <div className="space-y-2">
                    <label htmlFor={`${formId}-title`} className="block text-sm font-medium">Tytuł szkolenia <span className="text-muted-foreground">(wymagany)</span></label>
                    <Input id={`${formId}-title`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="np. Praktyczne podstawy TypeScript" required minLength={3} maxLength={200} className="h-11 rounded-lg" />
                </div>
                <div className="space-y-2">
                    <label htmlFor={`${formId}-description`} className="block text-sm font-medium">Opis i cel szkolenia</label>
                    <Textarea id={`${formId}-description`} value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={12000} placeholder="Dla kogo jest szkolenie? Jakie umiejętności uczestnik wykorzysta po jego ukończeniu?" className="rounded-lg" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <label htmlFor={`${formId}-category`} className="block text-sm font-medium">Kategoria</label>
                        <select id={`${formId}-category`} value={category} onChange={(event) => setCategory(event.target.value)} required className={SELECT_CLASS}>
                            <option value="" disabled>Wybierz kategorię</option>
                            {category && !CATEGORIES.includes(category) && <option value={category}>{category}</option>}
                            {CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor={`${formId}-level`} className="block text-sm font-medium">Poziom</label>
                        <select id={`${formId}-level`} value={level} onChange={(event) => setLevel(event.target.value as CourseLevel)} className={SELECT_CLASS}>
                            <option value="beginner">Podstawowy</option><option value="intermediate">Średniozaawansowany</option><option value="advanced">Zaawansowany</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor={`${formId}-duration`} className="block text-sm font-medium">Czas nauki w minutach</label>
                        <Input id={`${formId}-duration`} type="number" min={1} max={60000} step={1} value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="np. 90" className="h-10 rounded-lg" />
                    </div>
                </div>
                <div className="space-y-2">
                    <label htmlFor={`${formId}-tags`} className="block text-sm font-medium">Tagi <span className="font-normal text-muted-foreground">({tags.length}/20)</span></label>
                    <div className="flex gap-2">
                        <Input id={`${formId}-tags`} value={tagInput} maxLength={60} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} placeholder="np. typescript" aria-describedby={`${formId}-tags-hint`} className="h-10 rounded-lg" />
                        <Button type="button" onClick={addTag} variant="outline" className="h-10 rounded-lg" disabled={!tagInput.trim() || tags.length >= 20}>Dodaj</Button>
                    </div>
                    <p id={`${formId}-tags-hint`} className="text-xs text-muted-foreground">Dodaj słowa kluczowe przyciskiem lub klawiszem Enter.</p>
                    {tags.length > 0 && <ul className="flex flex-wrap gap-2 pt-1">{tags.map((tag) => <li key={tag} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-1 pl-3 pr-1 text-xs"><span>{tag}</span><button type="button" onClick={() => { setTags(tags.filter((item) => item !== tag)); setSaved(false) }} aria-label={`Usuń tag ${tag}`} className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-3.5" aria-hidden="true" /></button></li>)}</ul>}
                </div>
            </fieldset>

            <fieldset disabled={isPending} className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
                <legend className="px-2 text-base font-semibold">Forma szkolenia</legend>
                <div className="grid gap-3 md:grid-cols-3">
                    {FORMATS.map(({ value, label, description: hint, icon: Icon }) => (
                        <label key={value} className={cn('relative flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring', mode === value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40', isPending && 'cursor-wait opacity-60')}>
                            <div className="flex items-center justify-between"><Icon aria-hidden="true" className={cn('size-5', mode === value ? 'text-primary' : 'text-muted-foreground')} /><input type="radio" name={`${formId}-mode`} value={value} checked={mode === value} onChange={() => changeMode(value)} className="size-4 accent-primary" /></div>
                            <span className="text-sm font-semibold">{label}</span><span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>
                        </label>
                    ))}
                </div>
                {needsAttendance && <p className="text-sm text-muted-foreground">Terminy i spotkania Teams ustawisz w edycjach szkolenia. Materiały i warunki ukończenia najpierw zatwierdza administrator.</p>}
            </fieldset>

            <fieldset disabled={isPending} className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
                <legend className="px-2 text-base font-semibold">Warunki ukończenia</legend>
                <p className="text-sm text-muted-foreground">Uczestnik zobaczy te zasady przed zapisem. Zmiany opublikowanych zasad wymagają nowej wersji i akceptacji.</p>
                <label className="flex items-start gap-3"><input type="checkbox" checked={requireLessons} onChange={(event) => setRequireLessons(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary" /><span className="space-y-1"><span className="block text-sm font-medium">Wymagaj ukończenia wszystkich lekcji</span><span className="block text-xs leading-relaxed text-muted-foreground">Uczestnik oznacza przeczytane materiały jako ukończone.</span></span></label>
                <div className="space-y-3 border-t border-border pt-5">
                    <label className="flex items-start gap-3"><input type="checkbox" checked={quizRequired} onChange={(event) => setQuizRequired(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary" /><span className="space-y-1"><span className="block text-sm font-medium">Wymagaj zaliczenia quizu</span><span className="block text-xs leading-relaxed text-muted-foreground">Pytania i odpowiedzi przygotujesz w zakładce „Quiz”.</span></span></label>
                    {quizRequired && <div className="max-w-xs space-y-2 pl-7"><label htmlFor={`${formId}-quiz`} className="block text-sm font-medium">Próg zaliczenia quizu (%)</label><Input id={`${formId}-quiz`} type="number" required min={1} max={100} step={1} value={quizPercent} onChange={(event) => setQuizPercent(event.target.value)} className="h-10 rounded-lg" /></div>}
                </div>
                {needsAttendance && <div className="space-y-2 border-t border-border pt-5"><label htmlFor={`${formId}-attendance`} className="block text-sm font-medium">Wymagana obecność na każdej obowiązkowej sesji (%)</label><Input id={`${formId}-attendance`} type="number" required min={1} max={100} step={1} value={attendancePercent} onChange={(event) => setAttendancePercent(event.target.value)} className="h-10 max-w-xs rounded-lg" /><p className="text-xs leading-relaxed text-muted-foreground">Obecność potwierdza raport Teams lub prowadzący. Samo kliknięcie linku nie zalicza spotkania.</p></div>}
            </fieldset>
            <CoursePrerequisitesEditor value={prerequisites} onChange={(ids) => { setPrerequisites(ids); setSaved(false) }} courseId={initial?.id} disabled={isPending} />
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground" role="status">{saved ? <span className="inline-flex items-center gap-2 text-success"><CheckCircle2 className="size-4" aria-hidden="true" /> Zmiany zapisane</span> : 'Zapis tworzony jest jako szkic. Publikację zatwierdza administrator.'}</p>
                <Button type="submit" disabled={isPending || title.trim().length < 3 || !category} className="h-11 rounded-lg px-5">{isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{submitLabel ?? (initial ? 'Zapisz zmiany' : 'Utwórz szkic szkolenia')}</Button>
            </div>
        </form>
    )
}

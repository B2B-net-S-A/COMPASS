'use client'

import { useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { CourseLearnerPreview } from '@/components/academy/CourseLearnerPreview'
import { AcademyReviewHistory } from '@/components/academy/AcademyReviewHistory'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, BookOpen, CalendarDays, CheckCircle2, CopyPlus, Eye, FileText, ListChecks, Loader2, LockKeyhole, Send } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { CourseAuthorForm } from './CourseAuthorForm'
import { LessonsEditor } from './LessonsEditor'
import { QuizEditor } from './QuizEditor'
import { beginCourseDraft, submitForReview } from '@/lib/actions/courses'
import { QUIZ_MIN_QUESTIONS, QUIZ_MAX_QUESTIONS, QUIZ_OPTIONS_PER_QUESTION, type CourseDetail, type CourseLesson, type CourseQuizQuestionAuthor } from '@/lib/types/learning'

interface CourseEditWizardProps {
    course: CourseDetail
    initialLessons: CourseLesson[]
    initialQuiz: CourseQuizQuestionAuthor[]
}

export function CourseEditWizard({ course, initialLessons, initialQuiz }: CourseEditWizardProps) {
    const router = useRouter()
    const [activeTab, setActiveTab] = useState('meta')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isPending, startTransition] = useAcademyAction()
    const [confirm, ConfirmUI] = useConfirm()
    const versionStatus = course.version_status ?? course.status
    const archived = course.status === 'archived'
    const editable = !archived && (versionStatus === 'draft' || versionStatus === 'rejected')
    const mode = course.delivery_mode ?? 'self_paced'
    const quizRequired = course.completion_rules?.quiz_required ?? true
    const lessonsRequired = mode !== 'live' || course.completion_rules?.require_all_lessons === true
    const metadataReady = course.title.trim().length >= 3 && Boolean(course.category.trim())
    const lessonsReady = !lessonsRequired || initialLessons.length >= 1
    const quizReady = !quizRequired || (
        initialQuiz.length >= QUIZ_MIN_QUESTIONS && initialQuiz.length <= QUIZ_MAX_QUESTIONS &&
        initialQuiz.every((question) => question.question_text.trim() && question.options.length === QUIZ_OPTIONS_PER_QUESTION && question.options.every((option) => option.option_text.trim()) && question.options.filter((option) => option.is_correct).length === 1)
    )
    const canSubmit = editable && metadataReady && lessonsReady && quizReady
    const versionLabel = course.version_number ? `Wersja ${course.version_number}` : 'Bieżąca wersja'
    const hasPublishedVersion = Boolean(course.published_version_id)

    async function handleSubmit() {
        if (!canSubmit || isPending) return
        const accepted = await confirm({ description: 'Przesłać tę wersję do akceptacji? Materiały i zasady ukończenia zostaną zablokowane do czasu decyzji administratora.' })
        if (!accepted) return
        setError(null)
        setSuccess(null)
        startTransition(async () => {
            try {
                const result = await submitForReview(course.id)
                if (!result.success) { setError(result.error); return }
                setSuccess('Wersja została przesłana do akceptacji administratora.')
                router.refresh()
            } catch { setError('Nie udało się przesłać szkolenia do akceptacji. Spróbuj ponownie.') }
        })
    }

    function handleNewVersion() {
        if (archived || versionStatus !== 'published' || isPending) return
        setError(null)
        setSuccess(null)
        startTransition(async () => {
            try {
                const result = await beginCourseDraft(course.id)
                if (!result.success) { setError(result.error); return }
                setSuccess('Utworzono nową wersję roboczą. Opublikowane materiały pozostają bez zmian.')
                setActiveTab('meta')
                router.refresh()
            } catch { setError('Nie udało się utworzyć nowej wersji. Spróbuj ponownie.') }
        })
    }

    const lockedMessage = archived
        ? 'To szkolenie zostało zarchiwizowane. Materiały i historia uczestników pozostają zachowane.'
        : versionStatus === 'published'
        ? 'Ta wersja jest opublikowana. Aby zmienić treści lub zasady ukończenia, utwórz nową wersję roboczą.'
        : versionStatus === 'pending_review'
            ? 'Ta wersja czeka na decyzję administratora. Edycja będzie możliwa, jeśli otrzymasz prośbę o poprawki.'
            : 'To szkolenie zostało zarchiwizowane. Materiały i historia uczestników pozostają zachowane.'

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
                <div className="space-y-1"><p className="text-sm font-semibold">{versionLabel}</p><p className="text-xs leading-relaxed text-muted-foreground">{editable ? hasPublishedVersion ? 'Edytujesz nowy szkic. Uczestnicy nadal korzystają ze swojej zatwierdzonej wersji.' : 'Przygotuj program, a następnie prześlij szkolenie do akceptacji.' : lockedMessage}</p></div>
                <div className="flex flex-wrap gap-2">
                    {mode !== 'self_paced' && <Button asChild variant="outline" size="sm"><Link href={`/learning/tworze/${course.id}/edycje`}><CalendarDays aria-hidden="true" />Edycje i terminy</Link></Button>}
                    {hasPublishedVersion && <Button asChild variant="outline" size="sm"><Link href={`/learning/${course.slug}`}><Eye aria-hidden="true" /> Wersja opublikowana</Link></Button>}
                    {!archived && versionStatus === 'published' && <Button onClick={handleNewVersion} disabled={isPending} size="sm">{isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CopyPlus aria-hidden="true" />}Utwórz nową wersję</Button>}
                </div>
            </div>
            {versionStatus === 'rejected' && course.rejection_reason && <div role="note" className="space-y-1 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm"><p className="font-semibold text-foreground">Poprawki od administratora</p><p className="whitespace-pre-wrap text-muted-foreground">{course.rejection_reason}</p></div>}
            {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{error}</div>}
            {success && <div role="status" className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-4 text-sm text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{success}</div>}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList aria-label="Edycja szkolenia" className="grid h-auto grid-cols-2 gap-1 rounded-xl border border-border bg-muted/50 p-1 sm:grid-cols-3 xl:grid-cols-5">
                    <TabsTrigger value="meta" className="gap-2 rounded-lg py-3"><FileText className="size-4" aria-hidden="true" />Informacje</TabsTrigger>
                    <TabsTrigger value="lessons" className="gap-2 rounded-lg py-3"><BookOpen className="size-4" aria-hidden="true" />Lekcje ({initialLessons.length})</TabsTrigger>
                    <TabsTrigger value="quiz" className="gap-2 rounded-lg py-3"><ListChecks className="size-4" aria-hidden="true" />Quiz{quizRequired ? ` (${initialQuiz.length})` : ' · opcjonalny'}</TabsTrigger>
                    <TabsTrigger value="preview" className="gap-2 rounded-lg py-3"><Eye className="size-4" aria-hidden="true" />Podgląd uczestnika</TabsTrigger>
                    <TabsTrigger value="publish" className="gap-2 rounded-lg py-3"><Send className="size-4" aria-hidden="true" />Akceptacja</TabsTrigger>
                </TabsList>

                <TabsContent value="meta" className="mt-6">
                    {editable ? <CourseAuthorForm key={course.version_id ?? course.id} initial={course} onSuccess={() => router.refresh()} /> : <LockedPanel message={lockedMessage} />}
                </TabsContent>
                <TabsContent value="lessons" className="mt-6 space-y-4">
                    {!lessonsRequired && <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">Materiały są opcjonalne dla tego szkolenia na żywo. Możesz przygotować lekcje przed spotkaniem lub po nim.</p>}
                    {editable ? <LessonsEditor key={course.version_id ?? course.id} courseId={course.id} initialLessons={initialLessons} onChanged={() => router.refresh()} /> : <LockedPanel message={lockedMessage} />}
                </TabsContent>
                <TabsContent value="quiz" className="mt-6 space-y-4">
                    {!quizRequired && <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">Quiz nie jest warunkiem ukończenia tego szkolenia. Możesz przygotować pytania lub włączyć wymaganie quizu w zakładce „Informacje”.</p>}
                    {editable ? <QuizEditor key={course.version_id ?? course.id} courseId={course.id} initialQuestions={initialQuiz} onChanged={() => router.refresh()} /> : <LockedPanel message={lockedMessage} />}
                </TabsContent>
                <TabsContent value="preview" className="mt-6"><CourseLearnerPreview key={`${course.version_id ?? course.id}-${course.updated_at}`} course={course} lessons={initialLessons} quiz={initialQuiz} /></TabsContent>
                <TabsContent value="publish" className="mt-6 space-y-5">
                    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
                        <div className="space-y-1"><h2 className="text-lg font-semibold">Gotowość do akceptacji</h2><p className="text-sm text-muted-foreground">Administrator sprawdzi tę wersję programu i warunki ukończenia.</p></div>
                        <ul className="space-y-3">
                            <ChecklistItem done={metadataReady} label="Uzupełniony tytuł i kategoria szkolenia" />
                            <ChecklistItem done={lessonsReady} label={lessonsRequired ? `Przynajmniej jedna lekcja · dodano ${initialLessons.length}` : 'Materiały opcjonalne dla szkolenia na żywo'} />
                            <ChecklistItem done={quizReady} label={quizRequired ? `Quiz: ${QUIZ_MIN_QUESTIONS}–${QUIZ_MAX_QUESTIONS} kompletnych pytań · dodano ${initialQuiz.length}` : 'Zaliczenie bez obowiązkowego quizu'} />
                        </ul>
                        <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm"><p className="font-medium">Warunki ukończenia tej wersji</p><ul className="list-inside list-disc space-y-1 text-muted-foreground">{course.completion_rules?.require_all_lessons !== false && <li>Ukończenie wszystkich lekcji</li>}{mode !== 'self_paced' && <li>Obecność przez co najmniej {course.completion_rules?.attendance_percent ?? 80}% każdej wymaganej sesji</li>}{quizRequired && <li>Co najmniej {course.completion_rules?.quiz_pass_percent ?? 70}% poprawnych odpowiedzi w quizie</li>}</ul></div>
                        {editable ? <div className="space-y-2 border-t border-border pt-5"><Button onClick={handleSubmit} disabled={!canSubmit || isPending} className="h-11 w-full rounded-lg sm:w-auto">{isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}Prześlij do akceptacji</Button>{!canSubmit && <p className="text-sm text-muted-foreground">Uzupełnij elementy oznaczone jako brakujące.</p>}</div> : <LockedPanel message={lockedMessage} />}
                    </section>
                    <aside className="space-y-2 rounded-xl border border-primary/15 bg-primary/5 p-5 text-sm"><p className="font-semibold">Co nastąpi po akceptacji?</p><p className="leading-relaxed text-muted-foreground">Szkolenie będzie dostępne w katalogu. Kolejne zmiany przygotujesz jako nową wersję, bez zmiany materiałów osób już zapisanych.{mode !== 'self_paced' && ' Terminy spotkań przygotujesz osobno w edycjach szkolenia. Administrator zatwierdzi je przed otwarciem zapisów.'}</p></aside>
                </TabsContent>
            </Tabs>
            <AcademyReviewHistory courseId={course.id} refreshKey={`${course.updated_at}-${course.submission_id ?? ''}-${course.version_status ?? course.status}`} />
            <ConfirmUI />
        </div>
    )
}

function LockedPanel({ message }: { message: string }) {
    return <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-5 text-sm leading-relaxed text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><p>{message}</p></div>
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
    return <li className="flex items-start gap-3 text-sm"><span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${done ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning'}`}>{done ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <AlertCircle className="size-3.5" aria-hidden="true" />}</span><span><span className="sr-only">{done ? 'Gotowe: ' : 'Brakuje: '}</span>{label}</span></li>
}

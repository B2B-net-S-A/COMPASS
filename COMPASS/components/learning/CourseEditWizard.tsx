'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, BookOpen, ListChecks, Upload, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { CourseAuthorForm } from './CourseAuthorForm'
import { LessonsEditor } from './LessonsEditor'
import { QuizEditor } from './QuizEditor'
import { submitForReview } from '@/lib/actions/courses'
import { QUIZ_MIN_QUESTIONS, type CourseDetail, type CourseLesson, type CourseQuizQuestionAuthor } from '@/lib/types/learning'

interface CourseEditWizardProps {
    course: CourseDetail
    initialLessons: CourseLesson[]
    initialQuiz: CourseQuizQuestionAuthor[]
}

export function CourseEditWizard({ course, initialLessons, initialQuiz }: CourseEditWizardProps) {
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<'meta' | 'lessons' | 'quiz' | 'publish'>('meta')
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const isLocked = course.status === 'pending_review' || course.status === 'archived'

    const lessonsCount = initialLessons.length
    const quizCount = initialQuiz.length
    const canSubmit =
        (course.status === 'draft' || course.status === 'rejected') &&
        lessonsCount >= 1 &&
        quizCount >= QUIZ_MIN_QUESTIONS

    const [confirm, ConfirmUI] = useConfirm()

    const handleSubmit = async () => {
        const ok = await confirm({
            description: 'Wysłać szkolenie do moderacji? Po wysłaniu nie będzie można edytować dopóki moderator nie odpowie.',
        })
        if (!ok) return
        setSubmitError(null)
        setSubmitSuccess(null)
        startTransition(async () => {
            const res = await submitForReview(course.id)
            if (!res.success) {
                setSubmitError(res.error)
                return
            }
            setSubmitSuccess('Szkolenie wysłane do moderacji ✓')
            setTimeout(() => router.push('/learning/tworze'), 1500)
        })
    }

    return (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="grid grid-cols-4 bg-muted border border-border p-1 rounded-xl h-auto">
                <TabsTrigger value="meta" className="data-[state=active]:bg-burgundy data-[state=active]:text-white text-xs sm:text-sm py-2.5 rounded-lg gap-1.5">
                    <FileText className="w-4 h-4 hidden sm:block" /> 1. Meta
                </TabsTrigger>
                <TabsTrigger value="lessons" className="data-[state=active]:bg-burgundy data-[state=active]:text-white text-xs sm:text-sm py-2.5 rounded-lg gap-1.5">
                    <BookOpen className="w-4 h-4 hidden sm:block" /> 2. Lekcje ({lessonsCount})
                </TabsTrigger>
                <TabsTrigger value="quiz" className="data-[state=active]:bg-burgundy data-[state=active]:text-white text-xs sm:text-sm py-2.5 rounded-lg gap-1.5">
                    <ListChecks className="w-4 h-4 hidden sm:block" /> 3. Quiz ({quizCount})
                </TabsTrigger>
                <TabsTrigger value="publish" className="data-[state=active]:bg-success data-[state=active]:text-white text-xs sm:text-sm py-2.5 rounded-lg gap-1.5">
                    <Upload className="w-4 h-4 hidden sm:block" /> 4. Publikacja
                </TabsTrigger>
            </TabsList>

            <TabsContent value="meta" className="mt-6">
                {isLocked ? (
                    <Card className="bg-warning/5 border-warning/20">
                        <CardContent className="p-6 text-sm text-warning flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            Edycja meta jest zablokowana w aktualnym statusie ({course.status}).
                        </CardContent>
                    </Card>
                ) : (
                    <CourseAuthorForm
                        initial={course}
                        onSuccess={() => router.refresh()}
                        submitLabel="Zapisz zmiany"
                    />
                )}
            </TabsContent>

            <TabsContent value="lessons" className="mt-6">
                {isLocked ? (
                    <Card className="bg-warning/5 border-warning/20">
                        <CardContent className="p-6 text-sm text-warning flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            Edycja lekcji zablokowana ({course.status}).
                        </CardContent>
                    </Card>
                ) : (
                    <LessonsEditor
                        courseId={course.id}
                        initialLessons={initialLessons}
                        onChanged={() => router.refresh()}
                    />
                )}
            </TabsContent>

            <TabsContent value="quiz" className="mt-6">
                {isLocked ? (
                    <Card className="bg-warning/5 border-warning/20">
                        <CardContent className="p-6 text-sm text-warning flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            Edycja quizu zablokowana ({course.status}).
                        </CardContent>
                    </Card>
                ) : (
                    <QuizEditor
                        courseId={course.id}
                        initialQuestions={initialQuiz}
                        onChanged={() => router.refresh()}
                    />
                )}
            </TabsContent>

            <TabsContent value="publish" className="mt-6 space-y-4">
                <Card className="bg-card border-border">
                    <CardContent className="p-6 space-y-4">
                        <h3 className="text-lg font-semibold">Lista kontrolna przed publikacją</h3>
                        <ul className="space-y-2 text-sm">
                            <ChecklistItem
                                done={course.title.length >= 3 && !!course.category}
                                label="Tytuł, opis, kategoria, poziom uzupełnione"
                            />
                            <ChecklistItem
                                done={lessonsCount >= 1}
                                label={`Co najmniej jedna lekcja (${lessonsCount}/1+)`}
                            />
                            <ChecklistItem
                                done={quizCount >= QUIZ_MIN_QUESTIONS}
                                label={`Quiz końcowy: ${QUIZ_MIN_QUESTIONS}–10 pytań ABCD (${quizCount}/${QUIZ_MIN_QUESTIONS}+)`}
                            />
                        </ul>

                        {course.status === 'pending_review' && (
                            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                Szkolenie czeka na moderację. Edycja zablokowana do czasu odpowiedzi moderatora.
                            </div>
                        )}
                        {course.status === 'rejected' && course.rejection_reason && (
                            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                                <strong>Powód odrzucenia:</strong> {course.rejection_reason}
                                <br />
                                Wprowadź zmiany i wyślij ponownie.
                            </div>
                        )}
                        {course.status === 'published' && (
                            <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success">
                                Szkolenie jest opublikowane i widoczne w katalogu.
                            </div>
                        )}

                        {submitError && (
                            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                {submitError}
                            </div>
                        )}
                        {submitSuccess && (
                            <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" /> {submitSuccess}
                            </div>
                        )}

                        {(course.status === 'draft' || course.status === 'rejected') && (
                            <div className="pt-2">
                                <Button onClick={handleSubmit} disabled={!canSubmit || isPending} size="lg" className="w-full gap-2">
                                    {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Wyślij do moderacji
                                </Button>
                                {!canSubmit && (
                                    <p className="text-xs text-muted-foreground text-center mt-2">
                                        Uzupełnij brakujące elementy z listy powyżej.
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-burgundy/5 border-burgundy/20">
                    <CardContent className="p-5 text-sm">
                        <p className="font-medium mb-2">Co się stanie po publikacji?</p>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                            <li>• Konsultanci znajdą Twój kurs w katalogu Akademii</li>
                            <li>• Za każdego konsultanta, który zda quiz końcowy → otrzymujesz <strong className="text-primary">+50 pkt × ★ rating</strong></li>
                            <li>• Pierwsza publikacja = jednorazowy bonus <strong className="text-primary">+100 pkt</strong></li>
                            <li>• Możesz dalej edytować i publikować poprawki</li>
                        </ul>
                    </CardContent>
                </Card>
            </TabsContent>
            <ConfirmUI />
        </Tabs>
    )
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
    return (
        <li className="flex items-center gap-2">
            <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    done ? 'bg-success/20 border border-success/40' : 'bg-muted border border-border'
                }`}
            >
                {done && <CheckCircle2 className="w-3 h-3 text-success" />}
            </span>
            <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
        </li>
    )
}

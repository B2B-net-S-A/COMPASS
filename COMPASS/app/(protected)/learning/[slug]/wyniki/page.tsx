import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Trophy, X, Sparkles, ArrowLeft, RefreshCw, Award } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RatingWidget } from '@/components/learning/RatingWidget'
import { LinkedInShareButton } from '@/components/learning/LinkedInShareButton'
import { CourseSurveyForm } from '@/components/learning/CourseSurveyForm'
import { getCourseDetail } from '@/lib/actions/courses'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string }
    searchParams: { score?: string; passed?: string; already?: string; award?: string }
}

export default async function QuizResultsPage({ params, searchParams }: PageProps) {
    const detailResult = await getCourseDetail(params.slug)
    if (!detailResult.success) notFound()
    const course = detailResult.data

    const score = parseInt(searchParams.score ?? '0', 10)
    const passed = searchParams.passed === 'true'
    const alreadyAwarded = searchParams.already === 'true'
    const awardStatus = searchParams.award || ''

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <Link href={`/learning/${course.slug}`} className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                ← {course.title}
            </Link>

            <Card
                className={
                    passed
                        ? 'bg-gradient-to-br from-success/10 to-primary/10 border-success/30'
                        : 'bg-gradient-to-br from-destructive/10 to-warning/10 border-destructive/30'
                }
            >
                <CardContent className="p-8 text-center space-y-4">
                    {passed ? (
                        <Trophy className="w-20 h-20 text-success mx-auto" />
                    ) : (
                        <X className="w-20 h-20 text-destructive mx-auto" />
                    )}
                    <h1 className="text-3xl font-bold">
                        {passed ? 'Gratulacje, zdane!' : 'Nie tym razem'}
                    </h1>
                    <div className="text-6xl font-bold">
                        <span className={passed ? 'text-success' : 'text-destructive'}>{score}%</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Próg zaliczenia: 70%
                    </p>

                    {passed && !alreadyAwarded && awardStatus === 'awarded' && (
                        <div className="p-4 rounded-lg bg-success/10 border border-success/20 text-sm">
                            <Sparkles className="w-5 h-5 text-warning mx-auto mb-2" />
                            <p className="font-semibold text-success">+20 pkt za ukończenie szkolenia!</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Autor szkolenia również otrzymał punkty za Twoje ukończenie.
                            </p>
                        </div>
                    )}

                    {passed && alreadyAwarded && (
                        <div className="p-4 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning">
                            Punkty za to szkolenie zostały przyznane wcześniej (anti-cheat).
                        </div>
                    )}

                    {passed && awardStatus === 'self_study_no_points' && (
                        <div className="p-4 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning">
                            Jesteś autorem tego szkolenia — punktów się nie przyznaje (oczywiste).
                        </div>
                    )}

                    <div className="flex flex-wrap justify-center gap-2 pt-2">
                        {!passed && (
                            <Link href={`/learning/${course.slug}/quiz`}>
                                <Button className="gap-2">
                                    <RefreshCw className="w-4 h-4" /> Spróbuj ponownie
                                </Button>
                            </Link>
                        )}
                        {passed && (
                            <a href={`/api/akademia/certificate?courseId=${course.id}`}>
                                <Button className="gap-2 bg-warning hover:bg-warning/90 text-warning-foreground">
                                    <Award className="w-4 h-4" /> Pobierz certyfikat
                                </Button>
                            </a>
                        )}
                        <Link href={`/learning/${course.slug}`}>
                            <Button variant="outline" className="gap-2">
                                <ArrowLeft className="w-4 h-4" /> Wróć do kursu
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {passed && (
                <>
                    <LinkedInShareButton courseTitle={course.title} courseId={course.id} />
                    <RatingWidget
                        courseId={course.id}
                        initialRating={course.user_rating?.rating}
                        initialComment={course.user_rating?.comment}
                    />
                    <CourseSurveyForm courseId={course.id} />
                </>
            )}
        </div>
    )
}

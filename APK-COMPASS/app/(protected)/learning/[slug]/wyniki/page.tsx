import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Trophy, X, Sparkles, ArrowLeft, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RatingWidget } from '@/components/learning/RatingWidget'
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
                        ? 'bg-gradient-to-br from-green-500/10 to-primary/10 border-green-500/30'
                        : 'bg-gradient-to-br from-red-500/10 to-amber-500/10 border-red-500/30'
                }
            >
                <CardContent className="p-8 text-center space-y-4">
                    {passed ? (
                        <Trophy className="w-20 h-20 text-green-400 mx-auto" />
                    ) : (
                        <X className="w-20 h-20 text-red-400 mx-auto" />
                    )}
                    <h1 className="text-3xl font-bold">
                        {passed ? 'Gratulacje, zdane!' : 'Nie tym razem'}
                    </h1>
                    <div className="text-6xl font-bold">
                        <span className={passed ? 'text-green-400' : 'text-red-400'}>{score}%</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Próg zaliczenia: 70%
                    </p>

                    {passed && !alreadyAwarded && awardStatus === 'awarded' && (
                        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-sm">
                            <Sparkles className="w-5 h-5 text-amber-400 mx-auto mb-2" />
                            <p className="font-semibold text-green-400">+20 pkt za ukończenie szkolenia!</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Autor szkolenia również otrzymał punkty za Twoje ukończenie.
                            </p>
                        </div>
                    )}

                    {passed && alreadyAwarded && (
                        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
                            Punkty za to szkolenie zostały przyznane wcześniej (anti-cheat).
                        </div>
                    )}

                    {passed && awardStatus === 'self_study_no_points' && (
                        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
                            Jesteś autorem tego szkolenia — punktów się nie przyznaje (oczywiste).
                        </div>
                    )}

                    <div className="flex justify-center gap-2 pt-2">
                        {!passed && (
                            <Link href={`/learning/${course.slug}/quiz`}>
                                <Button className="gap-2">
                                    <RefreshCw className="w-4 h-4" /> Spróbuj ponownie
                                </Button>
                            </Link>
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
                <RatingWidget
                    courseId={course.id}
                    initialRating={course.user_rating?.rating}
                    initialComment={course.user_rating?.comment}
                />
            )}
        </div>
    )
}

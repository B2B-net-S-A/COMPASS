'use client'

import { useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, FileText, Clock, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MarkdownView } from './MarkdownView'
import { EmbedVideo } from './EmbedVideo'
import { AcademyVideo } from '@/components/academy/AcademyVideo'
import { CourseCompletion } from '@/components/academy/CourseCompletion'
import { academyCourseHref } from '@/lib/academy/navigation'
import { markLessonComplete } from '@/lib/actions/course-learning'
import type { CourseLesson } from '@/lib/types/learning'

interface LessonPlayerProps {
    courseId: string
    courseSlug: string
    lesson: CourseLesson
    allLessons: CourseLesson[]
    completedLessonIds: string[]
    quizAvailable: boolean
    enrollmentId: string
    revokedAt?: string | null
    revokedReason?: string | null
    completedAt?: string | null
}

export function LessonPlayer({
    courseId,
    courseSlug,
    lesson,
    allLessons,
    completedLessonIds,
    quizAvailable,
    enrollmentId,
    completedAt,
    revokedAt,
    revokedReason,
}: LessonPlayerProps) {
    const router = useRouter()
    const [isCompleted, setIsCompleted] = useState(completedLessonIds.includes(lesson.id))
    const [isPending, startTransition] = useAcademyAction()
    const [error, setError] = useState<string | null>(null)

    const videos = lesson.attachments.filter(attachment => attachment.mime_type === 'video/mp4' && attachment.asset_id)
    const captions = lesson.attachments.find(attachment => attachment.mime_type === 'text/vtt' && attachment.asset_id)

    const currentIdx = allLessons.findIndex((l) => l.id === lesson.id)
    const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null
    const nextLesson = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null
    const isLastLesson = currentIdx === allLessons.length - 1

    const allCompleted = allLessons.every(
        (l) => l.id === lesson.id ? isCompleted : completedLessonIds.includes(l.id),
    )

    const handleMarkComplete = () => {
        if (isCompleted) return
        setError(null)
        startTransition(async () => {
            try {
                const res = await markLessonComplete(courseId, lesson.id, enrollmentId)
                if (!res.success) {
                    setError(res.error)
                    return
                }
                setIsCompleted(true)
                // A1.4: pokazujemy toast gdy user osiągnął milestone passy 7/14/21+
                if (res.data?.streak?.milestone_reached && typeof window !== 'undefined') {
                    const days = res.data.streak.current
                    // Lazy-import toast żeby nie obciążać bundle gdy nie potrzebne
                    import('@/lib/toast-success').then(({ toastSuccess }) => {
                        toastSuccess(`🔥 ${days} dni z rzędu! +25 pkt loyalty za passę nauki.`)
                    })
                }
                router.refresh()
            } catch {
                setError('Połączenie zostało przerwane. Spróbuj ponownie.')
            }
        })
    }

    return (
        <div className="space-y-6">
            {/* Lesson navigation header */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <Link href={academyCourseHref(courseSlug, enrollmentId)} className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                    ← Powrót do kursu
                </Link>
                <Badge variant="outline" className="text-[10px]">
                    Lekcja {currentIdx + 1} z {allLessons.length}
                </Badge>
            </div>

            <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{lesson.title}</h1>
                {lesson.estimated_minutes && (
                    <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> ~{lesson.estimated_minutes} min
                    </p>
                )}
            </div>

            {videos.map((video, index) => <AcademyVideo key={video.asset_id} lessonId={lesson.id} video={video} captions={index === 0 ? captions : undefined} />)}

            {lesson.video_url && <EmbedVideo url={lesson.video_url} title={lesson.title} />}

            {lesson.content_md && (
                <Card className="bg-card/5 border-border">
                    <CardContent className="p-6">
                        <MarkdownView content={lesson.content_md} />
                    </CardContent>
                </Card>
            )}

            {!lesson.content_md && !lesson.video_url && !lesson.attachments.length && (
                <Card className="bg-card/5 border-border">
                    <CardContent className="p-6 text-sm text-muted-foreground italic">
                        Lekcja nie ma jeszcze treści.
                    </CardContent>
                </Card>
            )}

            {lesson.attachments.length > 0 && (
                <Card className="bg-card/5 border-border">
                    <CardContent className="p-5 space-y-2">
                        <h3 className="text-sm font-semibold mb-2">Załączniki</h3>
                        {lesson.attachments.map((att, i) => (
                            <a
                                key={`${att.storage_path}-${i}`}
                                href={`/api/akademia/attachment?${new URLSearchParams({ lessonId: lesson.id, ...(att.asset_id ? { assetId: att.asset_id } : { path: att.storage_path }) })}`}
                                className="flex items-center gap-2 p-2 rounded bg-card/5 border border-border hover:border-primary/30 transition-colors text-sm"
                            >
                                <FileText className="w-4 h-4 text-muted-foreground" />
                                <span className="flex-1">{att.name}</span>
                                <span className="text-[10px] text-muted-foreground">{(att.size_bytes / 1024).toFixed(0)} KB</span>
                            </a>
                        ))}
                    </CardContent>
                </Card>
            )}

            {error && (
                <div role="alert" className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>
            )}

            <CourseCompletion courseId={courseId} enrollmentId={enrollmentId} completedAt={completedAt} revokedAt={revokedAt} revokedReason={revokedReason} />

            {/* Mark complete + nav */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-4 border-t border-border">
                <Button
                    onClick={handleMarkComplete}
                    disabled={isCompleted || isPending}
                    variant={isCompleted ? 'outline' : 'default'}
                    className="gap-2"
                >
                    {isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                    ) : (
                        <Circle className="w-4 h-4" />
                    )}
                    {isCompleted ? 'Lekcja ukończona' : 'Oznacz jako ukończoną'}
                </Button>

                <div className="flex items-center gap-2">
                    {prevLesson && (
                        <Button asChild variant="outline" size="sm" className="gap-2"><Link href={academyCourseHref(courseSlug, enrollmentId, `/lekcja/${prevLesson.id}`)}>
                                <ArrowLeft className="w-4 h-4" /> Poprzednia
                            </Link></Button>
                    )}
                    {nextLesson && (
                        <Button asChild size="sm" className="gap-2"><Link href={academyCourseHref(courseSlug, enrollmentId, `/lekcja/${nextLesson.id}`)}>
                                Następna <ArrowRight className="w-4 h-4" />
                            </Link></Button>
                    )}
                    {isLastLesson && quizAvailable && allCompleted && (
                        <Button asChild size="sm" className="gap-2 bg-success hover:bg-success/90"><Link href={academyCourseHref(courseSlug, enrollmentId, "/quiz")}>
                                Przejdź do quizu <ArrowRight className="w-4 h-4" />
                            </Link></Button>
                    )}
                </div>
            </div>
        </div>
    )
}

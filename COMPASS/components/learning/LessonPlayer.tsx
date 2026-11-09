'use client'

import { useRef, useState } from 'react'
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
import { LessonVideo } from '@/components/academy/LessonVideo'
import { DEFAULT_VIDEO_WATCH_PERCENT } from '@/lib/academy/video-progress'
import type { LessonVideoProgress, VideoProgressResult } from '@/lib/actions/academy-video-progress'
import { lessonCaptionForVideo } from '@/lib/academy/lesson-captions'
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
    videoProgress?: LessonVideoProgress
    videoWatchPercent?: number
}

export function LessonPlayer({
    videoProgress,
    videoWatchPercent = DEFAULT_VIDEO_WATCH_PERCENT,
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
    const [watchedPercent, setWatchedPercent] = useState<number | null>(null)
    const partRefs = useRef<(HTMLDivElement | null)[]>([])

    const videos = lesson.attachments.filter((attachment): attachment is typeof attachment & { asset_id: string } => attachment.mime_type === 'video/mp4' && !!attachment.asset_id)
    // A lesson with a recording completes by watching it; the button stays for text
    // lessons and until the progress migration has been applied.
    const completesByWatching = videos.length > 0 && videoProgress?.available === true

    // Teams splits a long session into files; the next one starts where this one ended.
    const playNextPart = (index: number) => {
        const next = partRefs.current[index + 1]
        if (!next) return
        next.scrollIntoView({ behavior: 'smooth', block: 'center' })
        void next.querySelector('video')?.play().catch(() => {})
    }

    const handleVideoResult = (result: VideoProgressResult) => {
        if (!result.available) return
        setWatchedPercent(result.watchedPercent)
        if (!result.completed) return
        setIsCompleted(true)
        router.refresh()
    }

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

            {videos.map((video, index) => <div key={video.asset_id} ref={element => { partRefs.current[index] = element }} className="space-y-2">
                {videos.length > 1 && <p className="text-sm font-medium">Część {index + 1} z {videos.length}</p>}
                {completesByWatching
                    ? <LessonVideo lessonId={lesson.id} enrollmentId={enrollmentId} video={video} captions={lessonCaptionForVideo(lesson.attachments, video.asset_id)} saved={videoProgress?.items[video.asset_id]} onResult={handleVideoResult} onEnded={() => playNextPart(index)} />
                    : <AcademyVideo lessonId={lesson.id} video={video} captions={lessonCaptionForVideo(lesson.attachments, video.asset_id)} />}
            </div>)}

            {lesson.attachments.filter(item => item.asset_id && ['audio/mpeg', 'audio/mp4'].includes(item.mime_type ?? '')).map(audio => <AcademyVideo key={audio.asset_id} lessonId={lesson.id} video={audio} audio />)}

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
                {completesByWatching && !isCompleted ? <p role="status" className="text-sm text-muted-foreground">Moduł zaliczy się automatycznie po obejrzeniu {videoWatchPercent}% nagrania{watchedPercent !== null && <> · obejrzano {watchedPercent.toLocaleString('pl-PL')}%</>}.</p> : <Button
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
                </Button>}

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

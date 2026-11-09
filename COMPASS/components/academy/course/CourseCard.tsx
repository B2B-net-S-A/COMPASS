import Link from 'next/link'
import { Award, CheckCircle2, ChevronLeft, Clock, FileText, Play, Star, Target, UserRound, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AcademyPrerequisites } from '@/components/academy/AcademyPrerequisites'
import { EditionSurvey } from '@/components/academy/EditionSurvey'
import { CourseFeedback } from '@/components/academy/CourseFeedback'
import { COURSE_FORMAT_LABELS, COURSE_LEVEL_LABELS } from '@/components/academy/catalog/catalog-filters'
import { CourseCover } from '@/components/academy/catalog/CourseCover'
import { CourseDetailActions } from '@/components/learning/CourseDetailActions'
import { academyCourseHref } from '@/lib/academy/navigation'
import type { AcademyPrerequisiteStatus } from '@/lib/actions/academy-discovery'
import type { CourseDeliveryMode, CourseDetail, CourseLevel } from '@/lib/types/learning'
import type { AcademyRunDTO } from '@/lib/types/academy-sessions'
import { CourseEditionCard } from './CourseEditionCard'
import { completionConditions, courseMaterials, filesLabel, formatMinutes, lessonProgress, programSummary } from './course-card-model'

export interface CourseCardProps {
    course: CourseDetail
    prerequisites?: AcademyPrerequisiteStatus
    prerequisitesError?: string
    nearestRun: AcademyRunDTO | null
    nearestRunFailed?: boolean
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
    return <div className="flex items-start gap-2.5"><Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium">{value}</dd></div></div>
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
    return <div className="flex items-baseline justify-between gap-3"><h2 className="text-lg font-semibold">{children}</h2>{aside && <span className="text-sm text-muted-foreground">{aside}</span>}</div>
}

/** One card for a self-paced course, a live edition and a test: the mode decides what the aside offers. */
export function CourseCard({ course, prerequisites, prerequisitesError, nearestRun, nearestRunFailed }: CourseCardProps) {
    const mode: CourseDeliveryMode = course.delivery_mode ?? 'self_paced'
    const live = mode !== 'self_paced'
    const duration = formatMinutes(course.duration_minutes)
    const program = programSummary(course.lessons)
    const progress = lessonProgress(course)
    const conditions = completionConditions(course)
    const materials = course.is_enrolled ? courseMaterials(course) : []
    const done = new Set(course.completed_lesson_ids ?? [])
    const mayEnroll = course.is_enrolled || (!live && prerequisites?.allCompleted === true)

    return <div className="space-y-6">
        <Link href="/learning" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ChevronLeft aria-hidden="true" className="size-4" />Katalog szkoleń</Link>

        <header className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-[184px_minmax(0,1fr)]">
            <CourseCover url={course.cover_image_url} mode={mode} className="h-32 border-b sm:h-auto sm:border-b-0 sm:border-r" />
            <div className="space-y-4 p-5 sm:px-6">
                <div className="space-y-1"><p className="text-sm font-semibold text-primary">{course.category}</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1></div>
                <dl className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
                    <Fact icon={Target} label="Poziom" value={COURSE_LEVEL_LABELS[course.level as CourseLevel] ?? course.level} />
                    {duration && <Fact icon={Clock} label="Czas" value={duration} />}
                    <Fact icon={Video} label="Format" value={COURSE_FORMAT_LABELS[mode]} />
                    {course.author_name && <Fact icon={UserRound} label="Autor" value={course.author_name} />}
                </dl>
                {course.tags.length > 0 && <ul className="flex flex-wrap gap-1.5">{course.tags.map(tag => <li key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{tag}</li>)}</ul>}
                {course.ratings_count > 0 && <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Star aria-hidden="true" className="size-3 text-warning" />{course.avg_rating.toFixed(1)} ({course.ratings_count} ocen)</p>}
            </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <aside className="order-first space-y-4 lg:sticky lg:top-5 lg:order-last">
                {live && !course.run_id && <CourseEditionCard run={nearestRun} failed={nearestRunFailed} courseId={course.id} />}
                <AcademyPrerequisites status={prerequisites} error={prerequisitesError} enrolled={course.is_enrolled} />
                {mayEnroll && <CourseDetailActions courseId={course.id} courseSlug={course.slug} isEnrolled={course.is_enrolled} enrollmentId={course.enrollment_id} runId={course.run_id} completedAt={course.completed_at} revokedAt={course.completion_revoked_at} revokedReason={course.completion_revoked_reason} deliveryMode={mode} hasLessons={course.lessons.length > 0} hasQuiz={course.quiz_questions_count > 0} />}
                <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-4"><Award aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><div className="space-y-1"><p className="text-sm font-medium">Certyfikat</p><p className="text-xs leading-relaxed text-muted-foreground">Dostaniesz go po spełnieniu wszystkich warunków. Dokument wewnętrzny B2B Network, bez związku z certyfikacją producenta.</p></div></div>
            </aside>

            <div className="min-w-0 space-y-6">
                {course.description && <section className="space-y-2"><SectionTitle>O szkoleniu</SectionTitle><p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{course.description}</p></section>}

                <section className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="space-y-2 px-4 py-3.5">
                        <SectionTitle aside={course.lessons.length > 0 ? program.label : undefined}>Program</SectionTitle>
                        {progress && <div className="flex items-center gap-3"><div className="h-1.5 grow overflow-hidden rounded-full bg-primary/10" role="progressbar" aria-label="Postęp programu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} /></div><span className="shrink-0 text-xs text-muted-foreground">{progress.completed} z {progress.total} ukończone</span></div>}
                    </div>
                    <hr className="border-border" />
                    {course.lessons.length === 0
                        ? <p className="p-4 text-sm italic text-muted-foreground">Program tego szkolenia jest realizowany podczas spotkań.</p>
                        : <ol className="space-y-0.5 p-1.5">{course.lessons.map((lesson, index) => {
                            const complete = course.is_enrolled && done.has(lesson.id)
                            const current = progress?.currentLessonId === lesson.id
                            const body = <>
                                <span className="mt-0.5 w-4 shrink-0 text-center text-sm text-muted-foreground">{complete ? <CheckCircle2 aria-hidden="true" className="size-4 text-success" /> : current ? <Play aria-hidden="true" className="size-4 text-primary" /> : index + 1}</span>
                                <span className="min-w-0 grow"><span className={`block text-sm ${current ? 'font-semibold' : ''}`}>{lesson.title}</span><span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{formatMinutes(lesson.estimated_minutes)}{current && <span>w trakcie</span>}{complete && <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">Ukończone</span>}</span></span>
                            </>
                            const rowClass = `flex items-start gap-3 rounded-lg p-2.5 ${current ? 'bg-primary/5' : ''}`
                            return <li key={lesson.id}>{course.is_enrolled ? <Link href={academyCourseHref(course.slug, course.enrollment_id, `/lekcja/${lesson.id}`)} className={`${rowClass} hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>{body}</Link> : <div className={rowClass}>{body}</div>}</li>
                        })}</ol>}
                </section>

                <section className="space-y-3">
                    <SectionTitle>Warunki ukończenia</SectionTitle>
                    {conditions.length > 0 && <ol className="space-y-3">{conditions.map((item, index) => <li key={item.title} className="flex items-start gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span><div><p className="text-sm font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.detail}</p></div></li>)}</ol>}
                    <p className="text-xs text-muted-foreground">Wersja programu: {course.version_number ?? 1}.</p>
                </section>

                {materials.length > 0 && <section className="space-y-3">
                    <SectionTitle aside={filesLabel(materials.length)}>Materiały</SectionTitle>
                    <ul className="divide-y divide-border">{materials.map(item => <li key={item.key} className="flex items-center gap-3 py-2.5"><FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 grow"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.size}</p></div><Button asChild variant="outline" size="sm"><a href={item.href} aria-label={`Pobierz ${item.name}`}>Pobierz</a></Button></li>)}</ul>
                </section>}

                {course.run_id && <EditionSurvey runId={course.run_id} canManage={false} />}
                {!course.run_id && course.enrollment_id && course.completed_at && !course.completion_revoked_at && <CourseFeedback courseId={course.id} enrollmentId={course.enrollment_id} completedAt={course.completed_at} initialRating={course.user_rating?.rating} initialComment={course.user_rating?.comment} />}
                {course.user_rating && !course.completed_at && <section className="space-y-2 rounded-xl border border-warning/20 bg-warning/5 p-5"><p className="text-xs text-muted-foreground">Twoja ocena:</p><div className="flex items-center gap-1" role="img" aria-label={`${course.user_rating.rating} z 5`}>{[1, 2, 3, 4, 5].map(n => <Star key={n} aria-hidden="true" className={`size-5 ${n <= course.user_rating!.rating ? 'fill-warning text-warning' : 'text-muted-foreground'}`} />)}</div>{course.user_rating.comment && <p className="text-sm italic">&quot;{course.user_rating.comment}&quot;</p>}</section>}
            </div>
        </div>
    </div>
}

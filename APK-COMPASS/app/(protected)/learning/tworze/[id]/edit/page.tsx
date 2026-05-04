import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GraduationCap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CourseEditWizard } from '@/components/learning/CourseEditWizard'
import {
    getCourseDetail,
    getCourseLessons,
    getCourseQuizForAuthor,
} from '@/lib/actions/courses'
import type { CourseStatus } from '@/lib/types/learning'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<CourseStatus, { label: string; color: string }> = {
    draft: { label: 'Szkic', color: 'border-white/20 text-muted-foreground bg-white/5' },
    pending_review: { label: 'W moderacji', color: 'border-amber-500/30 text-amber-400 bg-amber-500/10' },
    published: { label: 'Opublikowany', color: 'border-green-500/30 text-green-400 bg-green-500/10' },
    archived: { label: 'Zarchiwizowany', color: 'border-white/10 text-muted-foreground bg-white/5' },
    rejected: { label: 'Odrzucony', color: 'border-red-500/30 text-red-400 bg-red-500/10' },
}

interface PageProps {
    params: { id: string }
}

export default async function EditCoursePage({ params }: PageProps) {
    const detailResult = await getCourseDetail(params.id)
    if (!detailResult.success) {
        notFound()
    }
    const course = detailResult.data
    const lessonsResult = await getCourseLessons(course.id)
    const quizResult = await getCourseQuizForAuthor(course.id)

    const lessons = lessonsResult.success ? lessonsResult.data : []
    const quiz = quizResult.success ? quizResult.data : []
    const status = STATUS_LABEL[course.status]

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div>
                <Link href="/learning/tworze" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Moje szkolenia
                </Link>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <GraduationCap className="w-7 h-7 text-primary" />
                            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{course.title}</h1>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`text-[10px] ${status.color}`}>
                                {status.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                                {course.category}
                            </Badge>
                        </div>
                    </div>
                </div>
            </div>

            <CourseEditWizard course={course} initialLessons={lessons} initialQuiz={quiz} />
        </div>
    )
}

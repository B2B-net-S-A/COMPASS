'use client'

import { useRouter } from 'next/navigation'
import { CourseAuthorForm } from '@/components/learning/CourseAuthorForm'
import type { CourseType } from '@/lib/types/learning'

interface NewCourseClientProps {
    allowCompanyType: boolean
    defaultCourseType: CourseType
}

export function NewCourseClient({ allowCompanyType, defaultCourseType }: NewCourseClientProps) {
    const router = useRouter()

    return (
        <CourseAuthorForm
            allowCompanyType={allowCompanyType}
            defaultCourseType={defaultCourseType}
            onSuccess={(courseId) => {
                router.push(`/learning/tworze/${courseId}/edit`)
            }}
        />
    )
}

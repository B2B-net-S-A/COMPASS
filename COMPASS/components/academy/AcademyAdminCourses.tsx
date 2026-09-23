'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, BookOpen, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { archiveCourse } from '@/lib/actions/courses-admin'
import { ACADEMY_COURSE_STATUS_LABELS, type AcademyAdminCourse, type AcademyAdminCoursePage, type AcademyAdminCourseStatus } from '@/lib/types/academy-admin'
import { useAcademyAction } from './useAcademyAction'

function AdminCourseCard({ course }: { course: AcademyAdminCourse }) {
    const router = useRouter()
    const [confirm, ConfirmUI] = useConfirm()
    const [pending, run] = useAcademyAction()
    const [archived, setArchived] = useState(course.status === 'archived')
    const [error, setError] = useState<string | null>(null)

    async function archive() {
        if (archived || pending) return
        const accepted = await confirm({
            title: `Zarchiwizować szkolenie „${course.title}”?`,
            description: 'Archiwizacja zatrzymuje nowe zapisy i usuwa szkolenie z katalogu. Zachowuje istniejącą naukę, materiały, postępy i certyfikaty uczestników. Nie odwołuje automatycznie spotkań Teams — terminami zarządzasz osobno w edycjach. Archiwizacja nie ma opcji cofnięcia w panelu.',
            confirmLabel: 'Zarchiwizuj szkolenie', cancelLabel: 'Zachowaj szkolenie', variant: 'destructive',
        })
        if (!accepted) return
        setError(null)
        run(async () => {
            try {
                const result = await archiveCourse(course.id)
                if (!result.success) { setError(result.error); return }
                setArchived(true)
                router.refresh()
            } catch { setError('Nie udało się zarchiwizować szkolenia. Spróbuj ponownie.') }
        })
    }

    return <article className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
                <h2 className="break-words text-lg font-semibold">{course.title}</h2>
                <p className="text-sm text-muted-foreground">Autor: {course.authorName ?? 'Brak nazwy autora'}</p>
                <p className="text-sm">Stan kursu: <span className="font-semibold">{ACADEMY_COURSE_STATUS_LABELS[archived ? 'archived' : course.status]}</span>{course.publishedVersionNumber !== null && <span className="text-muted-foreground"> · opublikowana wersja {course.publishedVersionNumber}</span>}</p>
                {course.draftVersion && <p className="text-sm text-muted-foreground">Wersja robocza {course.draftVersion.number}: {ACADEMY_COURSE_STATUS_LABELS[course.draftVersion.status]}{course.draftVersion.title !== course.title && ` · ${course.draftVersion.title}`}</p>}
                {course.legacyReviewRequired && !archived && <p className="text-sm text-warning">Publikacja historyczna wymaga ponownej akceptacji przed otwarciem zapisów.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><Link href={`/learning/tworze/${course.id}/edit`}><BookOpen aria-hidden="true" />Program i historia</Link></Button>
                {!archived && <Button variant="outline" size="sm" onClick={archive} disabled={pending}><Archive aria-hidden="true" />{pending ? 'Archiwizowanie…' : 'Zarchiwizuj'}</Button>}
            </div>
        </div>
        {archived && <p role="status" className="text-sm text-muted-foreground">Szkolenie jest w archiwum. Dotychczasowi uczestnicy zachowują swoją naukę.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <ConfirmUI />
    </article>
}

export function AcademyAdminCourses({ result, search, status }: { result: AcademyAdminCoursePage; search: string; status: AcademyAdminCourseStatus }) {
    const pages = Math.max(1, Math.ceil(result.total / result.pageSize))
    const href = (page: number) => `/admin/learning/szkolenia?${new URLSearchParams({ q: search, status, page: String(page) })}`
    return <div className="space-y-5">
        <form action="/admin/learning/szkolenia" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/20 p-4">
            <div className="min-w-0 flex-1 space-y-1.5"><label htmlFor="academy-course-search" className="text-sm font-medium">Szukaj tytułu szkolenia</label><Input id="academy-course-search" name="q" defaultValue={search} maxLength={100} placeholder="Wpisz fragment tytułu" /></div>
            <div className="space-y-1.5"><label htmlFor="academy-course-status" className="block text-sm font-medium">Stan kursu</label><select id="academy-course-status" name="status" defaultValue={status} className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="all">Wszystkie stany</option>{Object.entries(ACADEMY_COURSE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <Button type="submit" variant="outline"><Search aria-hidden="true" />Szukaj</Button>
        </form>
        <p className="text-sm text-muted-foreground">Liczba szkoleń: {result.total}. Filtr dotyczy stanu kursu; stan jego wersji roboczej jest pokazany osobno.</p>
        {result.items.length ? result.items.map(course => <AdminCourseCard key={`${course.id}:${course.status}`} course={course} />) : <p className="rounded-xl border border-border p-6 text-muted-foreground">Brak szkoleń na tej stronie dla wybranych filtrów.</p>}
        <nav aria-label="Strony szkoleń" className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>{result.page > 1 && <Link className="text-primary underline-offset-4 hover:underline" href={href(Math.min(result.page - 1, pages))}>← Poprzednia strona</Link>}</div>
            <p className="text-muted-foreground">Strona {result.page} z {pages}</p>
            <div>{result.page < pages && <Link className="text-primary underline-offset-4 hover:underline" href={href(result.page + 1)}>Następna strona →</Link>}</div>
        </nav>
    </div>
}

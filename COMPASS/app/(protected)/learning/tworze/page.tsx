import Link from 'next/link'
import { BarChart3, CalendarDays, Eye, MessageSquare, Pencil, Plus } from 'lucide-react'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { COURSE_FORMAT_LABELS } from '@/components/academy/catalog/catalog-filters'
import { Button } from '@/components/ui/button'
import { getMyCourses } from '@/lib/actions/courses'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import type { CourseStatus } from '@/lib/types/learning'

export const dynamic = 'force-dynamic'

const STATUS: Record<CourseStatus, { label: string; color: string }> = {
    draft: { label: 'Wersja robocza', color: 'bg-muted text-muted-foreground' },
    pending_review: { label: 'Oczekuje na akceptację', color: 'bg-warning/10 text-warning' },
    published: { label: 'Opublikowane', color: 'bg-success/10 text-success' },
    archived: { label: 'Zarchiwizowane', color: 'bg-muted text-muted-foreground' },
    rejected: { label: 'Do poprawy', color: 'bg-destructive/10 text-destructive' },
}

export default async function MyCoursesPage() {
    const [access, result] = await Promise.all([getAcademyAccess(), getMyCourses()])
    return <AcademyShell activeTab="teaching" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Prowadzę szkolenia" description="Przygotowuj materiały, zgłaszaj wersje do akceptacji i zarządzaj terminami swoich zajęć." action={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/learning/tworze/analytics"><BarChart3 aria-hidden="true" />Raport</Link></Button><Button asChild><Link href="/learning/tworze/nowy"><Plus aria-hidden="true" />Nowe szkolenie</Link></Button></div>}>
        {!result.success ? <AcademyEmptyState variant="error" title="Nie udało się wczytać szkoleń" description="Odśwież stronę i spróbuj ponownie. Twoje materiały pozostają zapisane." /> : result.data.length === 0 ? <AcademyEmptyState title="Przygotuj swoje pierwsze szkolenie" description="Wybierz formę, dodaj program i materiały, a następnie prześlij je do akceptacji administratora." action={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/learning/tworze/analytics"><BarChart3 aria-hidden="true" />Raport</Link></Button><Button asChild><Link href="/learning/tworze/nowy"><Plus aria-hidden="true" />Utwórz szkic</Link></Button></div>} /> : <div className="space-y-4">{result.data.map((course) => <article key={course.id} className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div className="min-w-0 space-y-3"><div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2.5 py-1 ${STATUS[course.status].color}`}>{STATUS[course.status].label}</span>{course.version_status && course.version_status !== course.status && <span className={`rounded-full px-2.5 py-1 ${STATUS[course.version_status].color}`}>Wersja: {STATUS[course.version_status].label}</span>}<span className="text-muted-foreground">{COURSE_FORMAT_LABELS[course.delivery_mode ?? 'self_paced']}{course.version_number ? ` · wersja ${course.version_number}` : ''}</span></div><h2 className="text-lg font-semibold">{course.title}</h2>{course.description && <p className="line-clamp-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{course.description}</p>}{(course.version_status ?? course.status) === 'rejected' && course.rejection_reason && <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">Poprawki od administratora: {course.rejection_reason}</p>}{course.published_version_id && <p className="text-xs text-muted-foreground">Zapisy: {course.enrollments_count} · ukończenia: {course.completions_count}</p>}</div><div className="flex shrink-0 flex-wrap gap-2">{course.can_edit && <Button asChild variant="outline" size="sm"><Link href={`/learning/tworze/${course.id}/edit`}><Pencil aria-hidden="true" />{course.status !== 'archived' && ['draft', 'rejected'].includes(course.version_status ?? course.status) ? 'Edytuj szkic' : 'Otwórz program'}</Link></Button>}{(course.can_lead || course.can_manage_assigned_runs) && course.delivery_mode && course.delivery_mode !== 'self_paced' && <Button asChild variant="outline" size="sm"><Link href={`/learning/tworze/${course.id}/edycje`}><CalendarDays aria-hidden="true" />Edycje</Link></Button>}{(course.can_edit || course.published_version_id) && <Button asChild variant="outline" size="sm"><Link href={`/learning/tworze/${course.id}/pytania`}><MessageSquare aria-hidden="true" />Pytania uczestników</Link></Button>}{course.published_version_id && <Button asChild variant="ghost" size="sm"><Link href={`/learning/${course.slug}`}><Eye aria-hidden="true" />Zobacz</Link></Button>}</div></div></article>)}</div>}
    </AcademyShell>
}

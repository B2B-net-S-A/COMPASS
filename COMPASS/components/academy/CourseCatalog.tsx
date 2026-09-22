import Link from 'next/link'
import { ArrowRight, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock3, Layers, Plus, Search, ShieldCheck, SlidersHorizontal, Star, Video } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { CourseListItem } from '@/lib/types/learning'
import { AcademyEmptyState } from './AcademyEmptyState'
import { CourseCover } from './catalog/CourseCover'
import type { AcademyCatalogOptions } from '@/lib/actions/academy-discovery'
import type { CatalogNextRun } from './catalog/catalog-runs'
import { sessionDate, sessionTime } from './sessions/session-format'
import { CATALOG_PAGE_SIZE, COURSE_FORMAT_LABELS, COURSE_LEVEL_LABELS, catalogHref, formatCourseDuration, type CatalogFilters } from './catalog/catalog-filters'

interface CourseCatalogProps {
    courses: CourseListItem[]
    total: number
    page: number
    filters: CatalogFilters
    canTeach: boolean
    error?: string
    options?: AcademyCatalogOptions
    nextRuns?: Record<string, CatalogNextRun>
    discoveryError?: string
}

const SELECT_CLASS = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const FORMAT_OPTIONS = [
    { value: undefined, label: 'Wszystkie formaty', icon: Layers },
    { value: 'self_paced' as const, label: 'We własnym tempie', icon: BookOpen },
    { value: 'live' as const, label: 'Na żywo w Teams', icon: Video },
    { value: 'blended' as const, label: 'Kursy mieszane', icon: Layers },
]

export function CourseCatalog({ courses, total, page, filters, canTeach, error, options = { categories: [], instructors: [] }, nextRuns = {}, discoveryError }: CourseCatalogProps) {
    const hasFilters = Boolean(filters.search || filters.level || filters.courseType || filters.deliveryMode || filters.category || filters.instructorId)
    const pageCount = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE))
    const first = (page - 1) * CATALOG_PAGE_SIZE + 1
    const last = Math.min(page * CATALOG_PAGE_SIZE, total)

    return (
        <div className="space-y-6">
            <section aria-label="Wyszukiwanie i filtrowanie szkoleń" className="space-y-5">
                <form key={catalogHref(filters)} action="/learning" method="get" className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                    {filters.deliveryMode && <input type="hidden" name="format" value={filters.deliveryMode} />}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1 space-y-2">
                            <label htmlFor="academy-search" className="text-sm font-medium text-foreground">Czego chcesz się nauczyć?</label>
                            <div className="relative">
                                <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
                                <Input id="academy-search" name="q" type="search" defaultValue={filters.search} maxLength={200} placeholder="Szukaj po nazwie lub opisie szkolenia" className="h-11 rounded-lg bg-background pl-10" />
                            </div>
                        </div>
                        <Button type="submit" className="h-11 rounded-lg px-6">Szukaj szkoleń</Button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1.5">
                            <label htmlFor="academy-category" className="text-xs font-medium text-muted-foreground">Kategoria</label>
                            <select id="academy-category" name="category" defaultValue={filters.category ?? ''} className={SELECT_CLASS}>
                                <option value="">Wszystkie kategorie</option>
                                {filters.category && !options.categories.includes(filters.category) && <option value={filters.category}>{filters.category}</option>}
                                {options.categories.map((category) => <option key={category} value={category}>{category}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="academy-instructor" className="text-xs font-medium text-muted-foreground">Prowadzący</label>
                            <select id="academy-instructor" name="instructor" defaultValue={filters.instructorId ?? ''} className={SELECT_CLASS}>
                                <option value="">Wszyscy prowadzący</option>
                                {filters.instructorId && !options.instructors.some((author) => author.id === filters.instructorId) && <option value={filters.instructorId}>Wybrany prowadzący</option>}
                                {options.instructors.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="academy-level" className="text-xs font-medium text-muted-foreground">Poziom</label>
                            <select id="academy-level" name="level" defaultValue={filters.level ?? ''} className={SELECT_CLASS}>
                                <option value="">Wszystkie poziomy</option>
                                {Object.entries(COURSE_LEVEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="academy-source" className="text-xs font-medium text-muted-foreground">Rodzaj szkolenia</label>
                            <select id="academy-source" name="type" defaultValue={filters.courseType ?? ''} className={SELECT_CLASS}>
                                <option value="">Firmowe i konsultanckie</option>
                                <option value="company">Szkolenia firmowe</option>
                                <option value="consultant">Szkolenia konsultantów</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="academy-sort" className="text-xs font-medium text-muted-foreground">Sortowanie</label>
                            <select id="academy-sort" name="sort" defaultValue={filters.orderBy} className={SELECT_CLASS}>
                                <option value="newest">Najnowsze</option>
                                <option value="popular">Najpopularniejsze</option>
                                <option value="top_rated">Najwyżej oceniane</option>
                            </select>
                        </div>
                        <Button type="submit" variant="outline" className="h-10 self-end rounded-lg"><SlidersHorizontal aria-hidden="true" /> Zastosuj</Button>
                    </div>
                </form>
                <nav aria-label="Format szkolenia" className="flex flex-wrap gap-2">
                    {FORMAT_OPTIONS.map(({ value, label, icon: Icon }) => (
                        <Link key={value ?? 'all'} href={catalogHref({ ...filters, deliveryMode: value })} aria-current={filters.deliveryMode === value ? 'page' : undefined} className={cn('inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background', filters.deliveryMode === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground')}>
                            <Icon className="size-4" aria-hidden="true" />{label}
                        </Link>
                    ))}
                </nav>
            </section>
            {discoveryError && <p role="status" className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-muted-foreground">{discoveryError}</p>}
            {error ? (
                <AcademyEmptyState title="Nie udało się wczytać szkoleń" description="Spróbuj ponownie za chwilę. Twoje zapisy i postępy pozostają zachowane." variant="error" action={<Button asChild variant="outline"><a href={catalogHref(filters, page)}>Spróbuj ponownie</a></Button>} />
            ) : courses.length === 0 ? (
                <AcademyEmptyState
                    variant={hasFilters ? 'filtered' : 'empty'}
                    title={hasFilters ? 'Nie znaleźliśmy pasujących szkoleń' : 'Pierwsze szkolenia przed nami'}
                    description={hasFilters ? 'Zmień wyszukiwane hasło lub wyczyść filtry, aby zobaczyć pozostałe szkolenia.' : canTeach ? 'Przygotuj materiały i prześlij szkolenie do akceptacji. Po publikacji uczestnicy znajdą je tutaj.' : 'Tutaj pojawią się szkolenia zatwierdzone przez administratora. Wróć, aby sprawdzić nowe materiały i terminy.'}
                    action={hasFilters ? <Button asChild variant="outline"><Link href="/learning">Wyczyść filtry</Link></Button> : canTeach ? <Button asChild><Link href="/learning/tworze/nowy"><Plus aria-hidden="true" /> Utwórz szkolenie</Link></Button> : undefined}
                />
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-muted-foreground" aria-live="polite"><span className="font-medium text-foreground">{first}–{last}</span> z {total} {total === 1 ? 'szkolenia' : 'szkoleń'}{filters.search && <> dla „<span className="font-medium text-foreground">{filters.search}</span>”</>}</p>
                        {hasFilters && <Link href="/learning" className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Wyczyść filtry</Link>}
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {courses.map((course) => {
                            const mode = course.delivery_mode ?? 'self_paced'
                            const FormatIcon = mode === 'live' ? Video : mode === 'blended' ? Layers : BookOpen
                            const duration = formatCourseDuration(course.duration_minutes)
                            const nextRun = nextRuns[course.id]
                            return (
                                <Link key={course.id} href={`/learning/${course.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                                    <CourseCover url={course.cover_image_url} mode={mode} />
                                    <div className="flex flex-1 flex-col gap-4 p-5">
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                            <span className="inline-flex items-center gap-1.5 font-medium text-primary"><FormatIcon className="size-3.5" aria-hidden="true" />{COURSE_FORMAT_LABELS[mode]}</span>
                                            {course.is_official && <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 font-medium text-success"><ShieldCheck className="size-3" aria-hidden="true" />Oficjalne</span>}
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-xs font-medium text-muted-foreground">{course.category}</p>
                                            <h2 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">{course.title}</h2>
                                            {course.description && <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{course.description}</p>}
                                        </div>
                                        <div className="mt-auto space-y-4 pt-1">
                                            {mode !== 'self_paced' && <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs"><p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground"><CalendarDays className="size-3.5" aria-hidden="true" />Najbliższa edycja</p>{nextRun ? <><p className="text-muted-foreground">{sessionDate(nextRun.startsAt, nextRun.timeZone)}, {sessionTime(nextRun.startsAt, nextRun.timeZone)}</p><p className="mt-1 text-muted-foreground">{nextRun.timeZone} · {nextRun.full ? 'Lista rezerwowa' : 'Otwarte zapisy'}</p></> : <p className="text-muted-foreground">{discoveryError ? 'Terminy chwilowo niedostępne' : 'Nowe terminy w przygotowaniu'}</p>}</div>}
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                                                <span className="rounded-md bg-muted px-2 py-1">{COURSE_LEVEL_LABELS[course.level]}</span>
                                                {duration && <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" aria-hidden="true" />{duration}</span>}
                                            </div>
                                            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                                                <div className="min-w-0 space-y-1">
                                                    <p className="truncate text-xs font-medium text-foreground">{course.author_name || (course.course_type === 'company' ? 'Szkolenie firmowe' : 'Szkolenie konsultanta')}</p>
                                                    {course.ratings_count > 0 ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3 fill-warning/20 text-warning" aria-hidden="true" /><span>{Number(course.avg_rating).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · ocen: {course.ratings_count}</span></p> : <p className="text-xs text-muted-foreground">Dostępne w Akademii</p>}
                                                </div>
                                                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">Zobacz kurs<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" /></span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                    {pageCount > 1 && <CatalogPagination filters={filters} page={page} pageCount={pageCount} />}
                </>
            )}
        </div>
    )
}

function CatalogPagination({ filters, page, pageCount }: { filters: CatalogFilters; page: number; pageCount: number }) {
    const pages = Array.from(new Set([1, page - 1, page, page + 1, pageCount])).filter((item) => item >= 1 && item <= pageCount).sort((a, b) => a - b)
    return (
        <nav aria-label="Strony katalogu szkoleń" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
            {page > 1 ? <Link className={buttonVariants({ variant: 'outline' })} href={catalogHref(filters, page - 1)} rel="prev"><ChevronLeft aria-hidden="true" />Poprzednia</Link> : <Button variant="outline" disabled><ChevronLeft aria-hidden="true" />Poprzednia</Button>}
            <div className="order-last flex w-full items-center justify-center gap-1 sm:order-none sm:w-auto">
                {pages.map((item, index) => (
                    <span key={item} className="inline-flex items-center gap-1">
                        {index > 0 && item - pages[index - 1] > 1 && <span className="px-2 text-muted-foreground" aria-hidden="true">…</span>}
                        <Link href={catalogHref(filters, item)} aria-label={`Strona ${item}`} aria-current={page === item ? 'page' : undefined} className={cn(buttonVariants({ variant: page === item ? 'default' : 'ghost', size: 'icon' }), 'size-10')}>{item}</Link>
                    </span>
                ))}
            </div>
            {page < pageCount ? <Link className={buttonVariants({ variant: 'outline' })} href={catalogHref(filters, page + 1)} rel="next">Następna<ChevronRight aria-hidden="true" /></Link> : <Button variant="outline" disabled>Następna<ChevronRight aria-hidden="true" /></Button>}
        </nav>
    )
}

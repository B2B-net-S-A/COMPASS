import Link from 'next/link'
import { GraduationCap, Plus, Edit, Eye, Clock, AlertCircle, CheckCircle2, Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getMyCourses } from '@/lib/actions/courses'
import type { CourseStatus } from '@/lib/types/learning'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<CourseStatus, { label: string; color: string }> = {
    draft: { label: 'Szkic', color: 'border-border text-muted-foreground bg-muted' },
    pending_review: { label: 'W moderacji', color: 'border-warning/30 text-warning bg-warning/10' },
    published: { label: 'Opublikowany', color: 'border-success/30 text-success bg-success/10' },
    archived: { label: 'Zarchiwizowany', color: 'border-border text-muted-foreground bg-muted' },
    rejected: { label: 'Odrzucony', color: 'border-destructive/30 text-destructive bg-destructive/10' },
}

export default async function MyCoursesPage() {
    const result = await getMyCourses()
    const courses = result.success ? result.data : []
    const error = !result.success ? result.error : null

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <Link href="/learning" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                        ← Akademia
                    </Link>
                    <div className="flex items-center gap-3">
                        <Pencil className="w-7 h-7 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">Moje szkolenia</h1>
                    </div>
                    <p className="text-muted-foreground mt-1">Zarządzaj swoimi szkoleniami — szkice, oczekujące na moderację, opublikowane.</p>
                </div>
                <Link href="/learning/tworze/nowy">
                    <Button size="lg" className="gap-2">
                        <Plus className="w-4 h-4" /> Stwórz nowe
                    </Button>
                </Link>
            </div>

            {error && (
                <Card className="bg-destructive/5 border-destructive/20">
                    <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
                </Card>
            )}

            {!error && courses.length === 0 && (
                <Card className="bg-gradient-to-br from-burgundy/10 to-primary/10 border-burgundy/20">
                    <CardContent className="p-12 text-center space-y-4">
                        <GraduationCap className="w-16 h-16 text-primary mx-auto" />
                        <h2 className="text-2xl font-bold">Nie masz jeszcze żadnego szkolenia</h2>
                        <p className="text-muted-foreground max-w-lg mx-auto">
                            Stwórz pierwsze szkolenie w 3 krokach: meta → lekcje → quiz. Po zatwierdzeniu przez moderatora
                            otrzymujesz <strong className="text-primary">+100 pkt</strong> bonusu za pierwszą publikację.
                        </p>
                        <Link href="/learning/tworze/nowy">
                            <Button size="lg" className="gap-2">
                                <Plus className="w-4 h-4" /> Stwórz pierwsze szkolenie
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}

            {courses.length > 0 && (
                <div className="space-y-3">
                    {courses.map((c) => {
                        const status = STATUS_LABEL[c.status]
                        return (
                            <Card key={c.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                                <CardContent className="p-5">
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant="outline" className={`text-[10px] ${status.color}`}>
                                                    {status.label}
                                                </Badge>
                                                <Badge variant="outline" className="text-[10px]">
                                                    {c.category}
                                                </Badge>
                                            </div>
                                            <h3 className="font-bold text-lg mb-1">{c.title}</h3>
                                            {c.description && (
                                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{c.description}</p>
                                            )}
                                            {c.status === 'rejected' && c.rejection_reason && (
                                                <div className="flex items-start gap-2 p-2 rounded bg-destructive/5 border border-destructive/20 text-xs text-destructive mt-2">
                                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                                    <span>Powód odrzucenia: {c.rejection_reason}</span>
                                                </div>
                                            )}
                                            {c.status === 'published' && (
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                                                    <CheckCircle2 className="w-3 h-3 text-success" />
                                                    <span>{c.enrollments_count} zapisów · {c.completions_count} ukończeń · ★ {c.avg_rating.toFixed(1)} ({c.ratings_count})</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {c.status === 'published' && (
                                                <Link href={`/learning/${c.slug}`}>
                                                    <Button variant="outline" size="sm" className="gap-2">
                                                        <Eye className="w-3.5 h-3.5" /> Zobacz
                                                    </Button>
                                                </Link>
                                            )}
                                            <Link href={`/learning/tworze/${c.id}/edit`}>
                                                <Button size="sm" className="gap-2">
                                                    <Edit className="w-3.5 h-3.5" />
                                                    {c.status === 'draft' || c.status === 'rejected' ? 'Edytuj' : 'Otwórz'}
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border text-[10px] text-muted-foreground">
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            Aktualizacja: {new Date(c.updated_at).toLocaleDateString('pl-PL')}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

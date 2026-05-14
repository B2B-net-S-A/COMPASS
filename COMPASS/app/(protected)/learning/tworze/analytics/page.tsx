import Link from 'next/link'
import { ArrowLeft, BookOpen, Users, CheckCircle2, Star, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getAuthorAnalytics } from '@/lib/actions/courses-analytics'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
    draft: 'Roboczy',
    pending_review: 'W moderacji',
    published: 'Opublikowany',
    archived: 'Archiwum',
    rejected: 'Odrzucony',
}

const STATUS_COLOR: Record<string, string> = {
    draft: 'border-white/20 text-muted-foreground',
    pending_review: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
    published: 'border-green-500/30 text-green-400 bg-green-500/10',
    archived: 'border-white/20 text-muted-foreground',
    rejected: 'border-red-500/30 text-red-400 bg-red-500/10',
}

export default async function AuthorAnalyticsPage() {
    const result = await getAuthorAnalytics()
    if (!result.success || !result.data) {
        return (
            <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
                <Link href="/learning/tworze" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Wróć
                </Link>
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{result.error ?? 'Brak danych'}</CardContent>
                </Card>
            </div>
        )
    }

    const data = result.data

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <Link href="/learning/tworze" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Wróć do tworzenia
            </Link>

            <div>
                <div className="flex items-center gap-3 mb-1">
                    <BarChart3 className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Statystyki Twoich kursów</h1>
                </div>
                <p className="text-muted-foreground">Aggregat dla wszystkich kursów które stworzyłeś.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Kursów</p>
                            <p className="text-2xl font-bold">{data.total_courses}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Zapisanych</p>
                            <p className="text-2xl font-bold">{data.total_enrollments}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ukończonych</p>
                            <p className="text-2xl font-bold">{data.total_completions}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <Star className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Średnia ocena</p>
                            <p className="text-2xl font-bold">
                                {data.average_rating > 0 ? data.average_rating.toFixed(1) : '–'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Per kurs</CardTitle>
                </CardHeader>
                <CardContent>
                    {data.courses.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            Nie masz jeszcze żadnych kursów.{' '}
                            <Link href="/learning/tworze/nowy" className="text-primary hover:underline">
                                Stwórz pierwszy
                            </Link>
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-xs text-muted-foreground">
                                        <th className="text-left py-2 pr-3 font-medium">Kurs</th>
                                        <th className="text-left py-2 pr-3 font-medium">Status</th>
                                        <th className="text-right py-2 pr-3 font-medium">Zapisanych</th>
                                        <th className="text-right py-2 pr-3 font-medium">Ukończonych</th>
                                        <th className="text-right py-2 pr-3 font-medium">% ukończenia</th>
                                        <th className="text-right py-2 pr-3 font-medium">Ocena</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.courses.map((c) => (
                                        <tr key={c.course_id} className="border-b last:border-b-0 hover:bg-white/5">
                                            <td className="py-2 pr-3">
                                                <p className="font-medium">{c.course_title}</p>
                                            </td>
                                            <td className="py-2 pr-3">
                                                <Badge variant="outline" className={`text-[10px] ${STATUS_COLOR[c.course_status]}`}>
                                                    {STATUS_LABEL[c.course_status] ?? c.course_status}
                                                </Badge>
                                            </td>
                                            <td className="py-2 pr-3 text-right tabular-nums">{c.enrollments_count}</td>
                                            <td className="py-2 pr-3 text-right tabular-nums">{c.completions_count}</td>
                                            <td className="py-2 pr-3 text-right tabular-nums">
                                                {c.completion_rate}%
                                            </td>
                                            <td className="py-2 pr-3 text-right tabular-nums">
                                                {c.ratings_count > 0
                                                    ? `${c.avg_rating.toFixed(1)} (${c.ratings_count})`
                                                    : '–'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

import Link from 'next/link'
import { ArrowLeft, BookOpen, Users, CheckCircle2, Star, BarChart3, Inbox } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAdminLmsAnalytics } from '@/lib/actions/courses-analytics'

export const dynamic = 'force-dynamic'

const PL_MONTHS = [
    'sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
    'lip', 'sie', 'wrz', 'paź', 'lis', 'gru',
]

function formatMonth(yyyy_mm: string): string {
    const [y, m] = yyyy_mm.split('-')
    return `${PL_MONTHS[parseInt(m, 10) - 1]} ${y.slice(2)}`
}

export default async function AdminLmsAnalyticsPage() {
    const result = await getAdminLmsAnalytics()
    if (!result.success || !result.data) {
        return (
            <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
                <Link href="/admin/learning" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Wróć
                </Link>
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{result.error ?? 'Brak danych'}</CardContent>
                </Card>
            </div>
        )
    }

    const data = result.data
    const maxMonthCount = Math.max(...data.monthly_enrollments.map((m) => m.count), 1)

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
            <Link href="/admin/learning" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Wróć do moderacji
            </Link>

            <div>
                <div className="flex items-center gap-3 mb-1">
                    <BarChart3 className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Statystyki Akademii</h1>
                </div>
                <p className="text-muted-foreground">Globalne metryki LMS dla całej organizacji.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Opublikowanych</p>
                            <p className="text-2xl font-bold">{data.total_published_courses}</p>
                        </div>
                    </CardContent>
                </Card>

                {data.total_pending_review > 0 && (
                    <Card className="bg-amber-500/5 border-amber-500/20">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                <Inbox className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-amber-300">W moderacji</p>
                                <p className="text-2xl font-bold">{data.total_pending_review}</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Zapisów</p>
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
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">% ukończenia</p>
                            <p className="text-2xl font-bold">{data.overall_completion_rate}%</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <Star className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Śr. ocena</p>
                            <p className="text-2xl font-bold">
                                {data.average_rating_all > 0 ? data.average_rating_all.toFixed(1) : '–'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {data.monthly_enrollments.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Zapisy miesięczne (ostatnie 12 mies)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {data.monthly_enrollments.map((m) => (
                                <div key={m.month} className="flex items-center gap-3 text-xs">
                                    <span className="w-16 text-muted-foreground tabular-nums">
                                        {formatMonth(m.month)}
                                    </span>
                                    <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden relative">
                                        <div
                                            className="h-full bg-primary transition-all"
                                            style={{ width: `${(m.count / maxMonthCount) * 100}%` }}
                                        />
                                        <span className="absolute inset-0 flex items-center px-2 text-[11px] tabular-nums">
                                            {m.count}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Top 10 kursów (wg zapisów)</CardTitle>
                </CardHeader>
                <CardContent>
                    {data.top_courses.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">Brak danych.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-xs text-muted-foreground">
                                        <th className="text-left py-2 pr-3 font-medium">#</th>
                                        <th className="text-left py-2 pr-3 font-medium">Kurs</th>
                                        <th className="text-right py-2 pr-3 font-medium">Zapisów</th>
                                        <th className="text-right py-2 pr-3 font-medium">Ukończonych</th>
                                        <th className="text-right py-2 pr-3 font-medium">% ukończenia</th>
                                        <th className="text-right py-2 pr-3 font-medium">Ocena</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.top_courses.map((c, idx) => (
                                        <tr key={c.course_id} className="border-b last:border-b-0 hover:bg-white/5">
                                            <td className="py-2 pr-3 text-muted-foreground tabular-nums">{idx + 1}</td>
                                            <td className="py-2 pr-3 font-medium">{c.title}</td>
                                            <td className="py-2 pr-3 text-right tabular-nums">{c.enrollments}</td>
                                            <td className="py-2 pr-3 text-right tabular-nums">{c.completions}</td>
                                            <td className="py-2 pr-3 text-right tabular-nums">{c.completion_rate}%</td>
                                            <td className="py-2 pr-3 text-right tabular-nums">
                                                {c.avg_rating > 0 ? c.avg_rating.toFixed(1) : '–'}
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

import Link from 'next/link'
import { Briefcase, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listProjects } from '@/lib/actions/incubator'
import { PROJECT_STATUS_LABEL, APPLICATION_STATUS_LABEL } from '@/lib/types/incubator'

export const dynamic = 'force-dynamic'

export default async function ProjectsListPage() {
    const result = await listProjects()
    const items = result.success ? result.data : []

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/incubator" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Inkubator
                </Link>
                <div className="flex items-center gap-3">
                    <Briefcase className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Wewnętrzne projekty</h1>
                </div>
                <p className="text-muted-foreground mt-1">Projekty B2Bnetwork szukające zaangażowania konsultantów.</p>
            </div>

            {!result.success && (
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{result.error}</CardContent>
                </Card>
            )}

            {result.success && items.length === 0 && (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-12 text-center text-muted-foreground">
                        Brak otwartych projektów. Wróć tu wkrótce.
                    </CardContent>
                </Card>
            )}

            {items.length > 0 && (
                <div className="space-y-3">
                    {items.map((p) => (
                        <Link key={p.id} href={`/incubator/projects/${p.slug}`} className="block group">
                            <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                                <CardContent className="p-5 space-y-2">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <h3 className="font-bold text-lg group-hover:text-primary">{p.title}</h3>
                                        <div className="flex flex-wrap gap-1">
                                            <Badge variant="outline" className="text-[10px]">
                                                {PROJECT_STATUS_LABEL[p.status]}
                                            </Badge>
                                            {p.user_application_status && (
                                                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                                                    Aplikowałeś: {APPLICATION_STATUS_LABEL[p.user_application_status]}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    {p.compensation_model && (
                                        <p className="text-sm text-muted-foreground">{p.compensation_model}</p>
                                    )}

                                    {p.tech_stack && p.tech_stack.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {p.tech_stack.slice(0, 8).map((t) => (
                                                <Badge key={t} className="bg-white/5 text-muted-foreground border-0 text-[9px] h-4 px-1">
                                                    {t}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-white/5">
                                        <span className="inline-flex items-center gap-1">
                                            <Users className="w-3 h-3" /> {p.application_count} aplikacj{p.application_count === 1 ? 'a' : 'i'}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

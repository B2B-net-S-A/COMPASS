import Link from 'next/link'
import { Briefcase, Plus, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listProjects } from '@/lib/actions/incubator'
import { PROJECT_STATUS_LABEL } from '@/lib/types/incubator'

export const dynamic = 'force-dynamic'

export default async function AdminProjectsPage() {
    const result = await listProjects()
    const items = result.success ? result.data : []

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <Link href="/admin/incubator" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                        ← Pitche / Projekty
                    </Link>
                    <div className="flex items-center gap-3">
                        <Briefcase className="w-7 h-7 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">Manager projektów wewnętrznych</h1>
                    </div>
                </div>
                <Link href="/admin/incubator/projects/new">
                    <Button className="gap-2">
                        <Plus className="w-4 h-4" /> Nowy projekt
                    </Button>
                </Link>
            </div>

            {items.length === 0 ? (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-12 text-center text-muted-foreground">
                        Brak projektów. Stwórz pierwszy.
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {items.map((p) => (
                        <Link key={p.id} href={`/admin/incubator/projects/${p.slug}`} className="block group">
                            <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <Badge variant="outline" className="text-[10px]">{PROJECT_STATUS_LABEL[p.status]}</Badge>
                                            </div>
                                            <h3 className="font-semibold group-hover:text-primary">{p.title}</h3>
                                            <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                                                <Users className="w-3 h-3" /> {p.application_count} aplikacj{p.application_count === 1 ? 'a' : 'i'}
                                            </p>
                                        </div>
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

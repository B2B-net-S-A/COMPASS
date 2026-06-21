import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Briefcase, Users, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getProjectBySlug } from '@/lib/actions/incubator'
import { PROJECT_STATUS_LABEL, APPLICATION_STATUS_LABEL } from '@/lib/types/incubator'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string }
}

export default async function ProjectDetailPage({ params }: PageProps) {
    const result = await getProjectBySlug(params.slug)
    if (!result.success) notFound()
    const p = result.data

    const canApply = p.status === 'open' && !p.user_application_status

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/incubator/projects" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Wewnętrzne projekty
                </Link>
                <div className="flex items-center gap-3">
                    <Briefcase className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">{p.title}</h1>
                </div>

                <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="outline" className="text-[10px]">{PROJECT_STATUS_LABEL[p.status]}</Badge>
                    {p.compensation_model && <Badge variant="outline" className="text-[10px]">{p.compensation_model}</Badge>}
                    {p.user_application_status && (
                        <Badge variant="outline" className="text-[10px] border-success/30 text-success bg-success/10">
                            Aplikowałeś: {APPLICATION_STATUS_LABEL[p.user_application_status]}
                        </Badge>
                    )}
                </div>

                {p.tech_stack && p.tech_stack.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {p.tech_stack.map((t) => (
                            <Badge key={t} className="bg-muted text-muted-foreground border-0 text-[10px]">
                                {t}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            <Card className="bg-card border-border">
                <CardContent className="p-6">
                    <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
                        {p.description_md}
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-card border-border">
                <CardContent className="p-5 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        {p.application_count} {p.application_count === 1 ? 'aplikacja' : 'aplikacji'}
                    </div>
                    {canApply ? (
                        <Link href={`/incubator/projects/${p.slug}/apply`}>
                            <Button className="gap-2">
                                Aplikuj <ArrowRight className="w-4 h-4" />
                            </Button>
                        </Link>
                    ) : p.user_application_status ? (
                        <Badge variant="outline" className="text-xs">
                            Twoja aplikacja: {APPLICATION_STATUS_LABEL[p.user_application_status]}
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-xs">Projekt nie jest aktualnie otwarty</Badge>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

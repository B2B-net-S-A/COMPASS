import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Briefcase, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ApplicationStatusButtons } from '@/components/incubator/ApplicationStatusButtons'
import { getProjectBySlug, listApplicationsForProject } from '@/lib/actions/incubator'
import { PROJECT_STATUS_LABEL, APPLICATION_STATUS_LABEL } from '@/lib/types/incubator'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string }
}

export default async function AdminProjectDetailPage({ params }: PageProps) {
    const projectRes = await getProjectBySlug(params.slug)
    if (!projectRes.success) notFound()
    const project = projectRes.data

    const appsRes = await listApplicationsForProject(project.id)
    const applications = appsRes.success ? appsRes.data : []

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div>
                <Link href="/admin/incubator/projects" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Manager projektów
                </Link>
                <div className="flex items-center gap-3">
                    <Briefcase className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">{project.title}</h1>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="outline" className="text-[10px]">{PROJECT_STATUS_LABEL[project.status]}</Badge>
                    {project.compensation_model && <Badge variant="outline" className="text-[10px]">{project.compensation_model}</Badge>}
                </div>
            </div>

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-6">
                    <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
                        {project.description_md}
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold">Aplikacje ({applications.length})</h3>
                    </div>

                    {applications.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Brak aplikacji.</p>
                    ) : (
                        <div className="space-y-3">
                            {applications.map((a) => (
                                <Card key={a.id} className="bg-card border-white/10">
                                    <CardContent className="p-4 space-y-2">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div>
                                                <p className="font-semibold">{a.applicant_name ?? 'Anonim'}</p>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {new Date(a.created_at).toLocaleString('pl-PL')}
                                                </p>
                                            </div>
                                            <Badge variant="outline" className="text-[10px]">
                                                {APPLICATION_STATUS_LABEL[a.status]}
                                            </Badge>
                                        </div>
                                        <div className="text-sm whitespace-pre-wrap p-3 rounded-md bg-white/5 border border-white/10">
                                            {a.motivation_md}
                                        </div>
                                        <ApplicationStatusButtons applicationId={a.id} currentStatus={a.status} />
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

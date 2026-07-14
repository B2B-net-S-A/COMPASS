import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Briefcase } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { ApplyForm } from '@/components/incubator/ApplyForm'
import { getProjectBySlug } from '@/lib/actions/incubator'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: Promise<{ slug: string }>
}

export default async function ApplyPage(props: PageProps) {
    const params = await props.params;
    const result = await getProjectBySlug(params.slug)
    if (!result.success) notFound()
    const project = result.data

    if (project.user_application_status) {
        return (
            <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-4">
                <Link href={`/incubator/projects/${project.slug}`} className="text-sm text-muted-foreground hover:text-primary">
                    ← {project.title}
                </Link>
                <Card className="bg-warning/5 border-warning/20">
                    <CardContent className="p-6 text-sm">
                        Już aplikowałeś do tego projektu (status: {project.user_application_status}).
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href={`/incubator/projects/${project.slug}`} className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← {project.title}
                </Link>
                <div className="flex items-center gap-3">
                    <Briefcase className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Aplikacja do projektu</h1>
                </div>
                <p className="text-muted-foreground mt-1">Opisz dlaczego pasujesz do tego projektu.</p>
            </div>

            <ApplyForm projectId={project.id} projectSlug={project.slug} />
        </div>
    )
}

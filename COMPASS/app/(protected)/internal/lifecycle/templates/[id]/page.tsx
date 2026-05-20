import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTemplate } from '@/lib/actions/lifecycle'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { roleLabelPl } from '@/lib/types/role'
import { FileText, Star } from 'lucide-react'
import { TemplateEditor } from '../../components/TemplateEditor'

export const dynamic = 'force-dynamic'

export default async function TemplateDetailPage({ params }: { params: { id: string } }) {
    await requireLifecycleManagerAction()

    let data
    try {
        data = await getTemplate(params.id)
    } catch {
        notFound()
    }

    const { template, items } = data

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-5xl">
            <header>
                <Link href="/internal/lifecycle/templates" className="text-xs text-muted-foreground underline">
                    ← Wszystkie szablony
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
                    <FileText className="h-7 w-7 text-cyan-400" />
                    {template.name}
                    {template.is_default && <Star className="h-5 w-5 fill-amber-400 text-amber-400" />}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Dla: {roleLabelPl(template.target_role)}
                </p>
            </header>

            <TemplateEditor template={template} items={items} />
        </div>
    )
}

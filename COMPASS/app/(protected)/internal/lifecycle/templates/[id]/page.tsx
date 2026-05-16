import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTemplate } from '@/lib/actions/lifecycle'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { roleLabelPl } from '@/lib/types/role'
import { FileText, Star } from 'lucide-react'

export const dynamic = 'force-dynamic'

const CATEGORY_LABEL: Record<string, string> = {
    docs: 'Dokumenty',
    access: 'Dostępy',
    training: 'Szkolenie',
    meeting: 'Spotkanie',
    equipment: 'Sprzęt',
    other: 'Inne',
}

const RESPONSIBLE_LABEL: Record<string, string> = {
    employee: 'Pracownik',
    manager: 'Manager',
    buddy: 'Buddy',
    tcm: 'TCM',
    admin: 'Admin',
}

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
                    {template.description && <> • {template.description}</>}
                </p>
            </header>

            <section className="rounded-lg border bg-card overflow-hidden">
                <div className="bg-muted/50 p-3 border-b">
                    <h2 className="font-semibold">Items ({items.length})</h2>
                </div>
                <ul className="divide-y">
                    {items.map((item) => (
                        <li key={item.id} className="p-4 flex items-start gap-4">
                            <div className="font-mono text-xs text-muted-foreground w-6 pt-1">{item.position + 1}</div>
                            <div className="flex-1">
                                <div className="font-medium">
                                    {item.title}
                                    {!item.is_required && (
                                        <span className="text-xs text-muted-foreground ml-2">(opcjonalne)</span>
                                    )}
                                </div>
                                {item.description && (
                                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                                )}
                                <div className="flex items-center gap-2 mt-2 text-xs">
                                    <span className="px-2 py-0.5 rounded bg-muted">{CATEGORY_LABEL[item.category] ?? item.category}</span>
                                    <span className="text-muted-foreground">
                                        {RESPONSIBLE_LABEL[item.responsible_role]} • +{item.due_offset_days}d
                                    </span>
                                    {item.requires_file && <span className="text-cyan-400">📎 plik</span>}
                                    {item.course_slug && (
                                        <Link
                                            href={`/learning/${item.course_slug}`}
                                            className="text-cyan-400 hover:underline"
                                        >
                                            🎓 kurs
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            <p className="text-xs text-muted-foreground">
                Edycja items przez UI w przygotowaniu. Aktualnie szablony zarządzane przez migrację Phase 22e
                lub bezpośrednio w DB (SQL).
            </p>
        </div>
    )
}

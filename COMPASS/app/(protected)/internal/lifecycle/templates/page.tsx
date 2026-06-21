import Link from 'next/link'
import { listTemplates } from '@/lib/actions/lifecycle'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { roleLabelPl } from '@/lib/types/role'
import { FileText, Plus, Star } from 'lucide-react'
import { DuplicateTemplateButton } from '../components/DuplicateTemplateButton'

export const dynamic = 'force-dynamic'

export default async function TemplatesListPage() {
    await requireLifecycleManagerAction() // TCM/admin only

    const templates = await listTemplates()

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-5xl">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="h-7 w-7 text-info" />
                        Szablony onboardingu
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Każda rola ma jeden domyślny szablon używany przy automatycznym onboardingu.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/internal/lifecycle/templates/new"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-sm font-medium"
                    >
                        <Plus className="h-4 w-4" /> Nowy szablon
                    </Link>
                    <Link href="/internal/lifecycle" className="text-sm underline text-muted-foreground">
                        ← Powrót do hub
                    </Link>
                </div>
            </header>

            {templates.length === 0 ? (
                <div className="rounded-lg border bg-card p-8 text-center">
                    <p className="text-sm text-muted-foreground">Brak szablonów. Domyślne 3 są seedowane przez migrację Phase 22e.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {templates.map((t) => (
                        <div key={t.id} className="rounded-lg border bg-card p-4 hover:bg-accent block">
                            <Link href={`/internal/lifecycle/templates/${t.id}`} className="block">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold">{t.name}</span>
                                            {t.is_default && (
                                                <Star className="h-4 w-4 fill-warning text-warning" />
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">{roleLabelPl(t.target_role)}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-bold">{t.items_count}</div>
                                        <div className="text-xs text-muted-foreground">items</div>
                                    </div>
                                </div>
                                {t.description && (
                                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{t.description}</p>
                                )}
                            </Link>
                            <div className="flex justify-end mt-3 pt-3 border-t">
                                <DuplicateTemplateButton templateId={t.id} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

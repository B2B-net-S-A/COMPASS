import Link from 'next/link'
import { Star, Plus } from 'lucide-react'
import { listTemplates } from '@/lib/actions/lifecycle'
import { roleLabelPl } from '@/lib/types/role'

// People Ops — zakładka Szablony onboarding/exit. Reuse listTemplates; edycja/tworzenie przez
// istniejące strony /internal/lifecycle/templates/[id] i /new (nie duplikujemy formularzy).
export async function SzablonyTabPanel() {
    const templates = await listTemplates()

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Link
                    href="/internal/lifecycle/templates/new"
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                    <Plus className="h-4 w-4" /> Nowy szablon
                </Link>
            </div>

            {templates.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                    Brak szablonów.
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {templates.map((t) => (
                        <Link
                            key={t.id}
                            href={`/internal/lifecycle/templates/${t.id}`}
                            className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-foreground">{t.name}</span>
                                        {t.is_default && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">{roleLabelPl(t.target_role)}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-foreground">{t.items_count}</div>
                                    <div className="text-xs text-muted-foreground">items</div>
                                </div>
                            </div>
                            {t.description && (
                                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

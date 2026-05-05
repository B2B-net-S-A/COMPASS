import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { TicketComposer } from '@/components/support/TicketComposer'
import { listSupportCategories } from '@/lib/actions/support-tickets'

export const dynamic = 'force-dynamic'

interface NewTicketPageProps {
    searchParams: { category?: string; prefill?: string }
}

interface DispatchPrefill {
    subject?: string
    body_md?: string
    category_slug?: string
    assignee_id?: string | null
}

function decodePrefill(token: string | undefined): DispatchPrefill | null {
    if (!token) return null
    try {
        const json = Buffer.from(token, 'base64url').toString('utf-8')
        const parsed = JSON.parse(json) as DispatchPrefill
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
    }
}

export default async function NewTicketPage({ searchParams }: NewTicketPageProps) {
    const categoriesResult = await listSupportCategories()
    const categories = categoriesResult.success ? categoriesResult.data : []

    const prefill = decodePrefill(searchParams.prefill)
    const categorySlugFromUrl = prefill?.category_slug ?? searchParams.category
    const defaultCategoryId = categorySlugFromUrl
        ? categories.find(c => c.slug === categorySlugFromUrl)?.id
        : undefined

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/support/tickets" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Moje tickety
                </Link>
                <div className="flex items-center gap-3">
                    <Plus className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Nowy ticket</h1>
                </div>
                <p className="text-muted-foreground mt-1">Wybierz kategorię i opisz problem.</p>
            </div>

            {!categoriesResult.success && (
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">Nie udało się załadować kategorii: {categoriesResult.error}</CardContent>
                </Card>
            )}

            {categoriesResult.success && (
                <TicketComposer
                    categories={categories}
                    defaultCategoryId={defaultCategoryId}
                    defaultSubject={prefill?.subject}
                    defaultBody={prefill?.body_md}
                    defaultAssigneeId={prefill?.assignee_id ?? undefined}
                />
            )}
        </div>
    )
}

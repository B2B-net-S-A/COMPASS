import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { TicketComposer } from '@/components/support/TicketComposer'
import { listSupportCategories } from '@/lib/actions/support-tickets'

export const dynamic = 'force-dynamic'

interface NewTicketPageProps {
    searchParams: { category?: string }
}

export default async function NewTicketPage({ searchParams }: NewTicketPageProps) {
    const categoriesResult = await listSupportCategories()
    const categories = categoriesResult.success ? categoriesResult.data : []
    const defaultCategoryId = searchParams.category
        ? categories.find(c => c.slug === searchParams.category)?.id
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

            {categoriesResult.success && <TicketComposer categories={categories} defaultCategoryId={defaultCategoryId} />}
        </div>
    )
}

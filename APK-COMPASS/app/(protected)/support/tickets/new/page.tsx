import Link from 'next/link'
import { Plus, MessageSquarePlus, ArrowLeft } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { TicketComposer } from '@/components/support/TicketComposer'
import { listSupportCategories } from '@/lib/actions/support-tickets'

export const dynamic = 'force-dynamic'

interface NewTicketPageProps {
    searchParams: { category?: string; prefill?: string; chat?: string }
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
    const isChatMode = !!searchParams.chat
    // chat= takes precedence over category= and prefill.
    const categorySlugFromUrl = isChatMode
        ? searchParams.chat
        : (prefill?.category_slug ?? searchParams.category)
    const selectedCategory = categorySlugFromUrl
        ? categories.find(c => c.slug === categorySlugFromUrl)
        : undefined
    const defaultCategoryId = selectedCategory?.id

    const backHref = isChatMode ? '/support/contacts' : '/support/tickets'
    const backLabel = isChatMode ? 'Wybór tematu' : 'Moje tickety'
    const Icon = isChatMode ? MessageSquarePlus : Plus
    const heading = isChatMode ? 'Nowa rozmowa' : 'Nowy ticket'
    const subhead = isChatMode
        ? selectedCategory
            ? `Temat: ${selectedCategory.name_pl} — napisz pierwszą wiadomość, a Centrala odpowie w wątku.`
            : 'Wybierz najpierw temat z poprzedniego ekranu.'
        : 'Wybierz kategorię i opisz problem.'

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href={backHref} className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    {backLabel}
                </Link>
                <div className="flex items-center gap-3">
                    <Icon className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">{heading}</h1>
                </div>
                <p className="text-muted-foreground mt-1">{subhead}</p>
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
                    mode={isChatMode ? 'chat' : 'formal'}
                />
            )}
        </div>
    )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { ArticleEditor } from '@/components/support/ArticleEditor'
import { listSupportCategories } from '@/lib/actions/support-tickets'
import { getArticleBySlug } from '@/lib/actions/support-articles'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string }
}

export default async function EditArticlePage({ params }: PageProps) {
    const articleRes = await getArticleBySlug(params.slug)
    if (!articleRes.success) notFound()
    const article = articleRes.data

    const categoriesRes = await listSupportCategories()
    const categories = categoriesRes.success ? categoriesRes.data : []

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/admin/support/kb" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Edytor bazy wiedzy
                </Link>
                <div className="flex items-center gap-3">
                    <BookOpen className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Edycja artykułu</h1>
                </div>
            </div>

            <ArticleEditor categories={categories} initial={article} />
        </div>
    )
}

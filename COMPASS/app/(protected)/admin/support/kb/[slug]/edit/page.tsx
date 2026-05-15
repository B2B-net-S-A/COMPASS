import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { ArticleEditor } from '@/components/support/ArticleEditor'
import { ArticleAttachmentsEditor } from '@/components/support/admin/ArticleAttachmentsEditor'
import { listSupportCategories } from '@/lib/actions/support-tickets'
import { getArticleBySlug } from '@/lib/actions/support-articles'
import { listArticleAttachments } from '@/lib/actions/support-materials'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/super-admins'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string }
}

export default async function EditArticlePage({ params }: PageProps) {
    const articleRes = await getArticleBySlug(params.slug)
    if (!articleRes.success) notFound()
    const article = articleRes.data

    const [categoriesRes, attachmentsRes, supabase] = await Promise.all([
        listSupportCategories({ includeInactive: true }),
        listArticleAttachments(article.id),
        Promise.resolve(createClient()),
    ])
    const { data: { user } } = await supabase.auth.getUser()
    const superAdmin = isSuperAdmin(user?.email)

    const categories = categoriesRes.success ? categoriesRes.data : []
    const attachments = attachmentsRes.success ? attachmentsRes.data : []

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

            <ArticleAttachmentsEditor
                articleId={article.id}
                initialAttachments={attachments}
                canEdit={superAdmin}
            />
        </div>
    )
}

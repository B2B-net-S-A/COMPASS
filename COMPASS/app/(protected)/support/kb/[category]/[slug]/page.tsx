import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen, Paperclip } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listSupportCategories } from '@/lib/actions/support-tickets'
import { getArticleBySlug } from '@/lib/actions/support-articles'
import { listArticleAttachments } from '@/lib/actions/support-materials'
import { DownloadList } from '@/components/support/DownloadList'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { category: string; slug: string }
}

export default async function ArticleDetailPage({ params }: PageProps) {
    const articleRes = await getArticleBySlug(params.slug)
    if (!articleRes.success) notFound()
    const article = articleRes.data

    const [categoriesRes, attachmentsRes] = await Promise.all([
        listSupportCategories(),
        listArticleAttachments(article.id),
    ])
    const category = categoriesRes.success
        ? categoriesRes.data.find((c) => c.id === article.category_id)
        : null
    const attachments = attachmentsRes.success ? attachmentsRes.data : []

    return (
        <article className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href={`/support/kb/${params.category}`} className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← {category?.name_pl ?? 'Baza wiedzy'}
                </Link>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {category && <Badge variant="outline" className="text-[10px]">{category.name_pl}</Badge>}
                    {article.published_at && (
                        <Badge variant="outline" className="text-[10px]">
                            {new Date(article.published_at).toLocaleDateString('pl-PL')}
                        </Badge>
                    )}
                    {!article.published_at && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                            Wersja robocza
                        </Badge>
                    )}
                </div>
                <h1 className="text-3xl font-bold tracking-tight flex items-start gap-3">
                    <BookOpen className="w-7 h-7 text-primary mt-1 shrink-0" />
                    <span>{article.title}</span>
                </h1>
                {article.excerpt && <p className="text-muted-foreground mt-2">{article.excerpt}</p>}
            </div>

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-6">
                    <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
                        {article.content_md}
                    </div>
                </CardContent>
            </Card>

            {attachments.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-base font-semibold flex items-center gap-2">
                        <Paperclip className="w-4 h-4 text-primary" /> Załączniki
                    </h2>
                    <DownloadList items={attachments} />
                </section>
            )}

            <div className="flex justify-between text-xs text-muted-foreground border-t border-white/5 pt-4">
                <span>Aktualizacja: {new Date(article.updated_at).toLocaleString('pl-PL')}</span>
            </div>
        </article>
    )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listSupportCategories } from '@/lib/actions/support-tickets'
import { listArticlesByCategory } from '@/lib/actions/support-articles'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { category: string }
}

export default async function KbCategoryPage({ params }: PageProps) {
    const categoriesRes = await listSupportCategories()
    if (!categoriesRes.success) notFound()
    const category = categoriesRes.data.find((c) => c.slug === params.category)
    if (!category) notFound()

    const articlesRes = await listArticlesByCategory(params.category)
    const articles = articlesRes.success ? articlesRes.data : []

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/support/kb" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Baza wiedzy
                </Link>
                <div className="flex items-center gap-3">
                    <BookOpen className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">{category.name_pl}</h1>
                </div>
            </div>

            {articles.length === 0 ? (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                        Brak artykułów w tej kategorii.
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {articles.map((a) => (
                        <Link key={a.id} href={`/support/kb/${category.slug}/${a.slug}`} className="block group">
                            <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                                <CardContent className="p-4">
                                    <h3 className="font-semibold group-hover:text-primary">{a.title}</h3>
                                    {a.excerpt && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.excerpt}</p>}
                                    {a.published_at && (
                                        <Badge variant="outline" className="text-[10px] mt-2">
                                            {new Date(a.published_at).toLocaleDateString('pl-PL')}
                                        </Badge>
                                    )}
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

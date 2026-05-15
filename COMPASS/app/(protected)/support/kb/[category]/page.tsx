import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listSupportCategories } from '@/lib/actions/support-tickets'
import { listArticlesByCategory } from '@/lib/actions/support-articles'
import { listCategoryMaterials } from '@/lib/actions/support-materials'
import { DownloadList } from '@/components/support/DownloadList'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { category: string }
}

export default async function KbCategoryPage({ params }: PageProps) {
    const categoriesRes = await listSupportCategories()
    if (!categoriesRes.success) notFound()
    const category = categoriesRes.data.find((c) => c.slug === params.category)
    if (!category) notFound()

    const [articlesRes, materialsRes] = await Promise.all([
        listArticlesByCategory(params.category),
        listCategoryMaterials(category.id),
    ])
    const articles = articlesRes.success ? articlesRes.data : []
    const materials = materialsRes.success ? materialsRes.data : []

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

            {materials.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" /> Materiały do pobrania
                    </h2>
                    <DownloadList items={materials} />
                </section>
            )}

            <section className="space-y-3">
                {materials.length > 0 && <h2 className="text-lg font-semibold">Artykuły</h2>}
                {articles.length === 0 && materials.length === 0 ? (
                    <Card className="bg-white/5 border-white/10">
                        <CardContent className="p-8 text-center text-sm text-muted-foreground">
                            Brak artykułów i materiałów w tej kategorii.
                        </CardContent>
                    </Card>
                ) : articles.length === 0 ? null : (
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
            </section>
        </div>
    )
}

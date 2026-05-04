import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listSupportCategories } from '@/lib/actions/support-tickets'
import { listArticlesByCategory } from '@/lib/actions/support-articles'

export const dynamic = 'force-dynamic'

export default async function KnowledgeBasePage() {
    const [categoriesRes, articlesRes] = await Promise.all([
        listSupportCategories(),
        listArticlesByCategory(undefined, { onlyPublished: true }),
    ])

    const categories = categoriesRes.success ? categoriesRes.data : []
    const articles = articlesRes.success ? articlesRes.data : []

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div>
                <Link href="/support" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Support Center
                </Link>
                <div className="flex items-center gap-3">
                    <BookOpen className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Baza wiedzy</h1>
                </div>
                <p className="text-muted-foreground mt-1">Procedury HR, IT, benefity, onboarding.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                {categories.map((c) => {
                    const count = articles.filter((a) => a.category_slug === c.slug).length
                    return (
                        <Link key={c.id} href={`/support/kb/${c.slug}`} className="block group">
                            <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors h-full">
                                <CardContent className="p-5 flex items-center justify-between">
                                    <div>
                                        <h3 className="font-semibold group-hover:text-primary">{c.name_pl}</h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {count} {count === 1 ? 'artykuł' : 'artykułów'}
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="text-[10px]">{c.slug}</Badge>
                                </CardContent>
                            </Card>
                        </Link>
                    )
                })}
            </div>

            {articles.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold">Najnowsze artykuły</h2>
                    {articles.slice(0, 10).map((a) => (
                        <Link key={a.id} href={`/support/kb/${a.category_slug}/${a.slug}`} className="block group">
                            <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="outline" className="text-[10px]">{a.category_name_pl}</Badge>
                                        {a.published_at && (
                                            <span className="text-[10px] text-muted-foreground">
                                                {new Date(a.published_at).toLocaleDateString('pl-PL')}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="font-semibold group-hover:text-primary">{a.title}</h3>
                                    {a.excerpt && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.excerpt}</p>}
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </section>
            )}

            {articles.length === 0 && (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-12 text-center">
                        <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">Baza wiedzy jest jeszcze pusta. Admin zacznie ją wypełniać w najbliższym czasie.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

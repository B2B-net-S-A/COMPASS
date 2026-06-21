import Link from 'next/link'
import { BookOpen, Crown, Plus, Settings } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listArticlesByCategory } from '@/lib/actions/support-articles'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/super-admins'

export const dynamic = 'force-dynamic'

export default async function AdminKbPage() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const superAdmin = isSuperAdmin(user?.email)

    const result = await listArticlesByCategory(undefined, { onlyPublished: false })
    const articles = result.success ? result.data : []

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <Link href="/admin/support" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                        ← Kolejka ticketów
                    </Link>
                    <div className="flex items-center gap-3">
                        <BookOpen className="w-7 h-7 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">Edytor bazy wiedzy</h1>
                    </div>
                    <p className="text-muted-foreground mt-1">Artykuły publikowane w /support/kb.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {superAdmin && (
                        <Link href="/admin/support/kb/categories">
                            <Button variant="outline" className="gap-2 border-warning/30 text-warning/90 hover:text-warning">
                                <Crown className="w-4 h-4" />
                                <Settings className="w-4 h-4" />
                                Zakładki + materiały
                            </Button>
                        </Link>
                    )}
                    <Link href="/admin/support/kb/new">
                        <Button className="gap-2">
                            <Plus className="w-4 h-4" /> Nowy artykuł
                        </Button>
                    </Link>
                </div>
            </div>

            {!result.success && (
                <Card className="bg-destructive/5 border-destructive/20">
                    <CardContent className="p-4 text-sm text-destructive">{result.error}</CardContent>
                </Card>
            )}

            {result.success && articles.length === 0 && (
                <Card className="bg-card border-border">
                    <CardContent className="p-12 text-center space-y-3">
                        <BookOpen className="w-16 h-16 text-muted-foreground mx-auto" />
                        <p className="text-muted-foreground">Brak artykułów. Dodaj pierwszy.</p>
                    </CardContent>
                </Card>
            )}

            {articles.length > 0 && (
                <div className="space-y-2">
                    {articles.map((a) => (
                        <Link key={a.id} href={`/admin/support/kb/${a.slug}/edit`} className="block group">
                            <Card className="bg-card border-border hover:border-primary/40 transition-colors">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <Badge variant="outline" className="text-[10px]">{a.category_name_pl}</Badge>
                                                {a.published_at ? (
                                                    <Badge variant="outline" className="text-[10px] border-success/30 text-success bg-success/10">
                                                        Opublikowane
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] border-warning/30 text-warning">
                                                        Wersja robocza
                                                    </Badge>
                                                )}
                                            </div>
                                            <h3 className="font-semibold group-hover:text-primary">{a.title}</h3>
                                            {a.excerpt && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.excerpt}</p>}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

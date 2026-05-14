import Link from 'next/link'
import { Newspaper, Plus, Pin, CheckCircle2, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listAllNewsAdmin } from '@/lib/actions/news'

export const dynamic = 'force-dynamic'

export default async function AdminNewsPage() {
    const result = await listAllNewsAdmin()
    const items = result.success ? result.data : []

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <Link href="/news" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                        ← Aktualności
                    </Link>
                    <div className="flex items-center gap-3">
                        <Newspaper className="w-7 h-7 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">Composer News</h1>
                    </div>
                    <p className="text-muted-foreground mt-1">Posty admina — drafts i opublikowane.</p>
                </div>
                <Link href="/admin/news/new">
                    <Button className="gap-2">
                        <Plus className="w-4 h-4" /> Nowy post
                    </Button>
                </Link>
            </div>

            {!result.success && (
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{result.error}</CardContent>
                </Card>
            )}

            {result.success && items.length === 0 && (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-12 text-center space-y-3">
                        <Newspaper className="w-16 h-16 text-muted-foreground mx-auto" />
                        <p className="text-muted-foreground">Brak postów. Stwórz pierwszy.</p>
                    </CardContent>
                </Card>
            )}

            {items.length > 0 && (
                <div className="space-y-2">
                    {items.map((p) => (
                        <Link key={p.id} href={`/admin/news/${p.slug}/edit`} className="block group">
                            <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                {p.pinned && (
                                                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10 inline-flex items-center gap-1">
                                                        <Pin className="w-2.5 h-2.5" /> Pinned
                                                    </Badge>
                                                )}
                                                {p.published_at ? (
                                                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10 inline-flex items-center gap-1">
                                                        <CheckCircle2 className="w-2.5 h-2.5" /> Opublikowane
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 inline-flex items-center gap-1">
                                                        <FileText className="w-2.5 h-2.5" /> Draft
                                                    </Badge>
                                                )}
                                                {p.audience_role && p.audience_role.length > 0 && (
                                                    <Badge variant="outline" className="text-[10px]">
                                                        Dla: {p.audience_role.join(', ')}
                                                    </Badge>
                                                )}
                                            </div>
                                            <h3 className="font-semibold group-hover:text-primary truncate">{p.title}</h3>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {p.published_at && `Opublikowano: ${new Date(p.published_at).toLocaleDateString('pl-PL')} · `}
                                                Edycja: {new Date(p.updated_at).toLocaleString('pl-PL')}
                                            </p>
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

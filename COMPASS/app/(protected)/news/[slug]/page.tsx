import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Newspaper, Pin } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ReactionBar } from '@/components/news/ReactionBar'
import { MarkReadOnView } from '@/components/news/MarkReadOnView'
import { getNewsPostBySlug } from '@/lib/actions/news'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: Promise<{ slug: string }>
}

export default async function NewsDetailPage(props: PageProps) {
    const params = await props.params;
    const result = await getNewsPostBySlug(params.slug)
    if (!result.success) notFound()
    const post = result.data

    return (
        <article className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <MarkReadOnView postId={post.id} alreadyRead={post.is_read} />

            <div>
                <Link href="/news" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Aktualności
                </Link>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                    {post.pinned && (
                        <Badge variant="outline" className="text-[10px] border-warning/30 text-warning bg-warning/10 inline-flex items-center gap-1">
                            <Pin className="w-2.5 h-2.5" /> Przypięty
                        </Badge>
                    )}
                    {post.published_at && (
                        <Badge variant="outline" className="text-[10px]">
                            {new Date(post.published_at).toLocaleDateString('pl-PL')}
                        </Badge>
                    )}
                    {post.audience_role && post.audience_role.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                            Dla: {post.audience_role.join(', ')}
                        </Badge>
                    )}
                    {post.can_edit && (
                        <Link href={`/admin/news/${post.slug}/edit`}>
                            <Badge variant="outline" className="text-[10px] cursor-pointer hover:border-primary/40">Edytuj</Badge>
                        </Link>
                    )}
                </div>
                <h1 className="text-3xl font-bold tracking-tight flex items-start gap-3">
                    <Newspaper className="w-7 h-7 text-primary mt-1 shrink-0" />
                    <span>{post.title}</span>
                </h1>
                {post.excerpt && <p className="text-muted-foreground mt-2">{post.excerpt}</p>}
                <p className="text-xs text-muted-foreground mt-2">Autor: {post.author_name ?? '—'}</p>
            </div>

            {post.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.cover_url} alt={post.title} className="w-full rounded-lg border border-border" />
            )}

            <Card className="bg-card border-border">
                <CardContent className="p-6">
                    <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
                        {post.body_md}
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center justify-end pt-4 border-t border-border">
                <ReactionBar postId={post.id} counts={post.reaction_counts} userReaction={post.user_reaction} />
            </div>
        </article>
    )
}

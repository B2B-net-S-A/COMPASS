import Link from 'next/link'
import { Pin, Newspaper } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ReactionBar } from './ReactionBar'
import type { NewsPostListItem } from '@/lib/types/news'
import { cn } from '@/lib/utils'

export function PostCard({ post }: { post: NewsPostListItem }) {
    return (
        <Link href={`/news/${post.slug}`} className="block group">
            <Card
                className={cn(
                    'border-border hover:border-primary/40 transition-colors',
                    post.pinned && 'bg-warning/5 border-warning/30',
                    !post.pinned && 'bg-card',
                )}
            >
                <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                            {post.pinned && (
                                <Badge variant="outline" className="text-[10px] border-warning/30 text-warning bg-warning/10 inline-flex items-center gap-1">
                                    <Pin className="w-2.5 h-2.5" /> Przypięty
                                </Badge>
                            )}
                            {!post.is_read && (
                                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary bg-primary/10">
                                    Nowy
                                </Badge>
                            )}
                            {post.audience_role && post.audience_role.length > 0 && (
                                <Badge variant="outline" className="text-[10px]">
                                    Dla: {post.audience_role.join(', ')}
                                </Badge>
                            )}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                            {post.published_at ? new Date(post.published_at).toLocaleDateString('pl-PL') : 'Draft'}
                        </span>
                    </div>

                    <h2 className="font-bold text-lg group-hover:text-primary transition-colors flex items-start gap-2">
                        <Newspaper className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                        {post.title}
                    </h2>

                    {post.excerpt && (
                        <p className="text-sm text-muted-foreground line-clamp-3">{post.excerpt}</p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                        <p className="text-[10px] text-muted-foreground">
                            Autor: {post.author_name ?? '—'}
                        </p>
                        <ReactionBar
                            postId={post.id}
                            counts={post.reaction_counts}
                            userReaction={post.user_reaction}
                        />
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}

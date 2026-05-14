import { Newspaper } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { PostCard } from '@/components/news/PostCard'
import { listNewsForUser } from '@/lib/actions/news'

export const dynamic = 'force-dynamic'

export default async function NewsPage() {
    const result = await listNewsForUser()

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <div className="flex items-center gap-3">
                    <Newspaper className="w-8 h-8 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Aktualności</h1>
                </div>
                <p className="text-muted-foreground mt-1">Najnowsze ogłoszenia i komunikaty od B2Bnetwork.</p>
            </div>

            {!result.success && (
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{result.error}</CardContent>
                </Card>
            )}

            {result.success && result.data.length === 0 && (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-12 text-center space-y-3">
                        <Newspaper className="w-16 h-16 text-muted-foreground mx-auto" />
                        <p className="text-muted-foreground">Brak ogłoszeń. Wróć tu wkrótce.</p>
                    </CardContent>
                </Card>
            )}

            {result.success && result.data.length > 0 && (
                <div className="space-y-3">
                    {result.data.map((post) => (
                        <PostCard key={post.id} post={post} />
                    ))}
                </div>
            )}
        </div>
    )
}

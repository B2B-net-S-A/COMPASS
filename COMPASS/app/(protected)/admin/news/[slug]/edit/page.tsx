import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Newspaper } from 'lucide-react'
import { PostComposer } from '@/components/news/PostComposer'
import { getNewsPostBySlug } from '@/lib/actions/news'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string }
}

export default async function EditPostPage({ params }: PageProps) {
    const result = await getNewsPostBySlug(params.slug)
    if (!result.success) notFound()

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/admin/news" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Composer News
                </Link>
                <div className="flex items-center gap-3">
                    <Newspaper className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Edycja posta</h1>
                </div>
            </div>

            <PostComposer initial={result.data} />
        </div>
    )
}

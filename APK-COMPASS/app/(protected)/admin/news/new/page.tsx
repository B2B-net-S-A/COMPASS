import Link from 'next/link'
import { Newspaper } from 'lucide-react'
import { PostComposer } from '@/components/news/PostComposer'

export const dynamic = 'force-dynamic'

export default function NewPostPage() {
    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/admin/news" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Composer News
                </Link>
                <div className="flex items-center gap-3">
                    <Newspaper className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Nowy post</h1>
                </div>
            </div>

            <PostComposer />
        </div>
    )
}

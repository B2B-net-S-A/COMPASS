import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, Crown } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/super-admins'
import { listCategoriesForAdmin } from '@/lib/actions/support-categories-admin'
import { CategoryManager } from '@/components/support/admin/CategoryManager'
import type { CategoryMaterial } from '@/lib/types/support'

export const dynamic = 'force-dynamic'

export default async function KbCategoriesAdminPage() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !isSuperAdmin(user.email)) redirect('/admin/support/kb')

    const categoriesRes = await listCategoriesForAdmin()
    const categories = categoriesRes.success ? categoriesRes.data : []

    // Article counts per category (single query).
    const { data: articles } = await supabase
        .from('support_articles')
        .select('category_id')
    const articleCounts: Record<string, number> = {}
    for (const a of articles ?? []) {
        articleCounts[a.category_id] = (articleCounts[a.category_id] ?? 0) + 1
    }

    // Materials per category (single query, group in memory).
    const { data: materials } = await supabase
        .from('support_category_materials')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
    const materialsByCategory: Record<string, CategoryMaterial[]> = {}
    for (const m of (materials ?? []) as CategoryMaterial[]) {
        (materialsByCategory[m.category_id] ??= []).push(m)
    }

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div>
                <Link href="/admin/support/kb" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Edytor bazy wiedzy
                </Link>
                <div className="flex items-center gap-3">
                    <BookOpen className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Zarządzanie zakładkami</h1>
                </div>
                <p className="text-muted-foreground mt-1 flex items-center gap-2">
                    <Crown className="w-4 h-4 text-yellow-400/80" />
                    <span>Super Admin — kategorie KB + materiały do pobrania.</span>
                </p>
            </div>

            {!categoriesRes.success && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    {categoriesRes.error}
                </div>
            )}

            <CategoryManager
                initialCategories={categories}
                articleCounts={articleCounts}
                materialsByCategory={materialsByCategory}
            />
        </div>
    )
}

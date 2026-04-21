import { ProtectedPage } from '@/components/common/ProtectedPage'
import { getMarketRates, getMarketRateCategories, getMarketRateSources, getVerificationHistory } from '@/lib/actions/rates'
import { RatesPageClient } from '@/components/admin/RatesPageClient'
import { createClient } from '@/lib/supabase/server'

export default async function AdminRatesPage() {
    let marketRates: Awaited<ReturnType<typeof getMarketRates>> = []
    let categories: string[] = []
    let sources: string[] = []
    let history: Awaited<ReturnType<typeof getVerificationHistory>> = []
    let isAdmin = false

    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()
            isAdmin = ['administrator', 'admin'].includes(profile?.role || '')
        }

        ;[marketRates, categories, sources, history] = await Promise.all([
            getMarketRates(),
            getMarketRateCategories(),
            getMarketRateSources(),
            getVerificationHistory(),
        ])
    } catch (e) {
        const err = e as { digest?: string }
        if (err?.digest === 'NEXT_REDIRECT') throw e
        console.error('[AdminRatesPage]', e)
    }

    return (
        <ProtectedPage feature="rates">
            <div>
                <h1 className="text-3xl font-bold text-white">Weryfikacja Stawek</h1>
                <p className="text-muted-foreground">Porównaj stawki konsultantów z danymi rynkowymi i wewnętrznymi benchmarkami.</p>
            </div>

            <RatesPageClient
                initialMarketRates={marketRates}
                categories={categories}
                sources={sources}
                initialHistory={history}
                isAdmin={isAdmin}
            />
        </ProtectedPage>
    )
}

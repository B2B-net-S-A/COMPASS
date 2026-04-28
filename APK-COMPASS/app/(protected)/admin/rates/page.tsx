import { ProtectedPage } from '@/components/common/ProtectedPage'
import { getMarketRates, getMarketRateCategories, getMarketRateSources, getVerificationHistory, getRateChangeLog } from '@/lib/actions/rates'
import { RatesPageClient } from '@/components/admin/RatesPageClient'
import { RateChangeLogList } from '@/components/admin/RateChangeLogList'
import { createClient } from '@/lib/supabase/server'

export default async function AdminRatesPage() {
    let marketRates: Awaited<ReturnType<typeof getMarketRates>> = []
    let categories: string[] = []
    let sources: string[] = []
    let history: Awaited<ReturnType<typeof getVerificationHistory>> = []
    let changeLog: Awaited<ReturnType<typeof getRateChangeLog>> = []
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

        ;[marketRates, categories, sources, history, changeLog] = await Promise.all([
            getMarketRates(),
            getMarketRateCategories(),
            getMarketRateSources(),
            getVerificationHistory(),
            getRateChangeLog(undefined, 50),
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

            <RateChangeLogList initialEntries={changeLog} title="Historia zmian stawek (audit log)" limit={50} />
        </ProtectedPage>
    )
}

import { getAdminReferrals } from '@/lib/actions/referrals'
import { ReferralsAdminClient } from '@/components/admin/ReferralsAdminClient'
import { ProtectedPage } from '@/components/common/ProtectedPage'
import { redirect } from 'next/navigation'

export default async function AdminReferralsPage() {
    let referrals: Awaited<ReturnType<typeof getAdminReferrals>> = []
    try {
        referrals = await getAdminReferrals()
    } catch (e) {
        const err = e as { digest?: string }
        if (err?.digest === 'NEXT_REDIRECT') throw e
        console.error('[AdminReferralsPage]', e)
        referrals = []
    }

    return (
        <ProtectedPage feature="referrals">
            <div>
                <h1 className="text-3xl font-bold text-white">Zarządzanie Rekomendacjami</h1>
                <p className="text-muted-foreground">Weryfikuj i zarządzaj poleceniami projektowymi od konsultantów.</p>
            </div>

            <ReferralsAdminClient initialReferrals={referrals} />
        </ProtectedPage>
    )
}

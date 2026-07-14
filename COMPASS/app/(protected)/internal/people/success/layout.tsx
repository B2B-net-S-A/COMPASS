import { LockKeyhole } from 'lucide-react'
import { notFound } from 'next/navigation'
import { requireTalentCommunityOrAdminLayout } from '@/lib/auth/internal-guard'
import { SuccessNav } from '@/components/internal/success/SuccessNav'
import { isConsultantSuccessEnabled } from '@/lib/consultant-success/flags'

export const dynamic = 'force-dynamic'

export default async function ConsultantSuccessLayout({ children }: { children: React.ReactNode }) {
    await requireTalentCommunityOrAdminLayout()
    if (!isConsultantSuccessEnabled()) notFound()

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <div>
                    <strong className="text-foreground">Prywatna strefa TCM</strong>
                    <p className="text-muted-foreground">Profile, notatki, statusy relacji i action steps są dostępne wyłącznie dla Talent Community Managerów i administratorów.</p>
                </div>
            </div>
            <SuccessNav />
            {children}
        </div>
    )
}

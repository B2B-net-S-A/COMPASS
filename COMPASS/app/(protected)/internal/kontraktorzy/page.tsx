import { redirect } from 'next/navigation'
import { isConsultantSuccessEnabled } from '@/lib/consultant-success/flags'

export const dynamic = 'force-dynamic'

export default function KontraktorzyRedirectPage() {
    redirect(isConsultantSuccessEnabled()
        ? '/internal/people/success/consultants'
        : '/internal/people?tab=kontraktorzy')
}

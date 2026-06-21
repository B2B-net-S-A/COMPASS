// Phase „People Ops" — Analityka scalona w zunifikowany moduł /internal/people (zakładka analityka).
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AnalitykaRedirectPage() {
    redirect('/internal/people?tab=analityka')
}

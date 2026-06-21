// Phase „People Ops" — Zgłoszenia (skrzynka + helpdesk + sprawy kontraktorskie) scalone w
// zunifikowany moduł /internal/people (zakładka sprawy). /admin/inbox zostaje dla inbox-handlerów.
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ZgloszeniaRedirectPage() {
    redirect('/internal/people?tab=sprawy')
}

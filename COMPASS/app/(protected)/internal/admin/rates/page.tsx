// Phase 27i — "Stawki i Umowy" moved into the Administracja HR hub as a tab.
// This standalone route now redirects to the tab (keeps old links/bookmarks working).

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function RatesAdminPageRedirect() {
    redirect('/internal/admin?tab=rates')
}

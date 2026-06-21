// Phase 27i — "Klienci" moved into the Administracja HR hub as a tab.
// This standalone route now redirects to the tab (keeps old links/bookmarks working).

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ClientsAdminPageRedirect() {
    redirect('/internal/admin?tab=clients')
}

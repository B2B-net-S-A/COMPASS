// Phase „People Ops" — hub Kontraktorzy scalony w zunifikowany moduł /internal/people.
// Treść (Rozmowy/Onboarding/Exit/Roster) żyje teraz w zakładkach People Ops; detail
// /internal/kontraktorzy/[id] zostaje. Redirect zachowuje stare linki/zakładki.
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function KontraktorzyRedirectPage() {
    redirect('/internal/people?tab=kontraktorzy')
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Shield, FileText, Users, ExternalLink } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Compliance | COMPASS Admin' }

// Mapowanie document_type → slug do podglądu strony.
// Phase 11 schema legal_documents miało osobne pole `slug`, ale aktualny prod
// schema (um_legal_documents) trzyma tylko `document_type` — wyprowadzamy slug.
const TYPE_TO_SLUG: Record<string, string> = {
    terms_of_service: 'terms',
    privacy_policy: 'privacy-policy',
    help: 'help',
}

// Czy dokument wymaga eksplicytnej zgody usera. Pochodne z typu (terms/privacy
// zawsze wymagają, help — nie). Wcześniej była kolumna requires_acceptance
// ale nie istnieje w prod schema.
const REQUIRES_ACCEPTANCE: Record<string, boolean> = {
    terms_of_service: true,
    privacy_policy: true,
    help: false,
}

export default async function CompliancePage() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'admin') {
        redirect('/home')
    }

    const { data: documents } = await supabase
        .from('um_legal_documents')
        .select('id, document_type, version, title, effective_date, is_active, updated_at')
        .order('document_type')
        .order('version', { ascending: false })

    const { count: totalConsents } = await supabase
        .from('um_user_consents')
        .select('id', { count: 'exact', head: true })

    const { count: currentVersionConsents } = await supabase
        .from('um_user_consents')
        .select('id', { count: 'exact', head: true })
        .eq('terms_version', '1.0')

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-8">
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                    <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">Compliance</h1>
                    <p className="text-sm text-muted-foreground">Zarządzanie dokumentami prawnymi i zgodami użytkowników</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card border rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <FileText className="h-4 w-4" />
                        <span className="text-sm">Dokumenty</span>
                    </div>
                    <p className="text-2xl font-bold">{documents?.length || 0}</p>
                </div>
                <div className="bg-card border rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Users className="h-4 w-4" />
                        <span className="text-sm">Zgody (łącznie)</span>
                    </div>
                    <p className="text-2xl font-bold">{totalConsents || 0}</p>
                </div>
                <div className="bg-card border rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Shield className="h-4 w-4" />
                        <span className="text-sm">Zgody (v1.0)</span>
                    </div>
                    <p className="text-2xl font-bold">{currentVersionConsents || 0}</p>
                </div>
            </div>

            <div className="bg-card border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/50">
                    <h2 className="font-semibold">Dokumenty prawne</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-muted-foreground">
                                <th className="px-4 py-3 font-medium">Tytuł</th>
                                <th className="px-4 py-3 font-medium">Typ</th>
                                <th className="px-4 py-3 font-medium">Wersja</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 font-medium">Wymaga akceptacji</th>
                                <th className="px-4 py-3 font-medium">Obowiązuje od</th>
                                <th className="px-4 py-3 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {documents?.map((doc) => {
                                const slug = TYPE_TO_SLUG[doc.document_type] ?? doc.document_type
                                const requiresAcceptance = REQUIRES_ACCEPTANCE[doc.document_type] ?? false
                                return (
                                    <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/30">
                                        <td className="px-4 py-3 font-medium">{doc.title}</td>
                                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{doc.document_type}</td>
                                        <td className="px-4 py-3">{doc.version}</td>
                                        <td className="px-4 py-3">
                                            {doc.is_active ? (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                    Aktywny
                                                </span>
                                            ) : (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400">
                                                    Archiwalny
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {requiresAcceptance ? (
                                                <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">Tak</span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Nie</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs">
                                            {doc.effective_date ? new Date(doc.effective_date).toLocaleDateString('pl-PL') : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link
                                                href={slug === 'help' ? '/help' : `/${slug}`}
                                                className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                                            >
                                                Podgląd <ExternalLink className="h-3 w-3" />
                                            </Link>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

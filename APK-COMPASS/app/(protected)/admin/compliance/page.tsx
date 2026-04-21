import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Shield, FileText, Users, ExternalLink } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Compliance | ComPass Admin' }

export default async function CompliancePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'administrator'].includes(profile.role)) {
    redirect('/home')
  }

  // Fetch all legal documents
  const { data: documents } = await supabase
    .from('um_legal_documents')
    .select('id, slug, title, version, visibility, requires_acceptance, is_active, updated_at')
    .order('visibility')
    .order('title')

  // Fetch consent stats
  const { count: totalConsents } = await supabase
    .from('um_user_consents')
    .select('id', { count: 'exact', head: true })

  const { count: currentVersionConsents } = await supabase
    .from('um_user_consents')
    .select('id', { count: 'exact', head: true })
    .eq('terms_version', '1.0')

  const visibilityLabels: Record<string, { label: string; color: string }> = {
    public: { label: 'Publiczny', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    authenticated: { label: 'Zalogowani', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    admin: { label: 'Admin', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Compliance</h1>
          <p className="text-sm text-muted-foreground">Zarządzanie dokumentami prawnymi i zgodami użytkowników</p>
        </div>
      </div>

      {/* Stats */}
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

      {/* Documents table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/50">
          <h2 className="font-semibold">Dokumenty prawne</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Tytuł</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Wersja</th>
                <th className="px-4 py-3 font-medium">Widoczność</th>
                <th className="px-4 py-3 font-medium">Wymaga akceptacji</th>
                <th className="px-4 py-3 font-medium">Aktualizacja</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {documents?.map((doc) => {
                const vis = visibilityLabels[doc.visibility] || visibilityLabels.authenticated
                return (
                  <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{doc.title}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{doc.slug}</td>
                    <td className="px-4 py-3">{doc.version}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${vis.color}`}>
                        {vis.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {doc.requires_acceptance ? (
                        <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">Tak</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Nie</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(doc.updated_at).toLocaleDateString('pl-PL')}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={doc.visibility === 'public' ? `/${doc.slug === 'help' ? 'help' : doc.slug}` : `/docs/${doc.slug}`}
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

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Regulamin | ComPass' }

export default async function TermsPage() {
  const supabase = createClient()
  const { data: doc } = await supabase
    .from('um_legal_documents')
    .select('title, content_html, version, updated_at')
    .eq('slug', 'terms')
    .eq('is_active', true)
    .maybeSingle()

  return (
    <div className="min-h-screen bg-background p-8 text-foreground max-w-3xl mx-auto">
      {doc ? (
        <>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">{doc.title}</h1>
            <span className="text-xs text-muted-foreground">v{doc.version}</span>
          </div>
          <div
            className="prose prose-sm dark:prose-invert max-w-none mb-8
              [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3
              [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2
              [&_p]:mb-3 [&_p]:leading-relaxed
              [&_ul]:mb-3 [&_ul]:pl-6 [&_ul]:list-disc
              [&_li]:mb-1
              [&_a]:text-primary [&_a]:underline
              [&_strong]:font-semibold"
            dangerouslySetInnerHTML={{ __html: doc.content_html }}
          />
          <p className="text-xs text-muted-foreground mb-6">
            Ostatnia aktualizacja: {new Date(doc.updated_at).toLocaleDateString('pl-PL')}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold mb-4">Terms of Service / Regulamin</h1>
          <p className="text-muted-foreground mb-6">
            Strona w przygotowaniu. Regulamin korzystania z usługi ComPass zostanie udostępniony wkrótce.
          </p>
        </>
      )}
      <Link href="/login" className="text-primary hover:underline">← Powrót do logowania</Link>
    </div>
  )
}

import Link from 'next/link'
import { getLegalDocument } from '@/lib/actions/compliance'
import { sanitizeHtml } from '@/lib/html/sanitize'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Regulamin | COMPASS' }

export default async function TermsPage() {
  const doc = await getLegalDocument('terms')

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
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(doc.content_html) }}
          />
          <p className="text-xs text-muted-foreground mb-6">
            Ostatnia aktualizacja: {new Date(doc.updated_at).toLocaleDateString('pl-PL')}
          </p>
        </>
      ) : (
        // Jak w /privacy-policy: regulamin jest w bazie, więc ta gałąź oznacza
        // awarię odczytu, a nie brak dokumentu.
        <>
          <h1 className="text-2xl font-bold mb-4">Regulamin</h1>
          <p className="text-muted-foreground mb-2">
            Nie udało się teraz wczytać treści regulaminu. Spróbuj odświeżyć stronę za chwilę.
          </p>
          <p className="text-muted-foreground mb-6">
            Kopię obowiązującego regulaminu otrzymasz pod adresem{' '}
            <a className="text-primary underline" href="mailto:administracja@b2bnetwork.pl">administracja@b2bnetwork.pl</a>.
          </p>
        </>
      )}
      <Link href="/login" className="text-primary hover:underline">← Powrót do logowania</Link>
    </div>
  )
}

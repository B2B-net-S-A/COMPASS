import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()
  const { data: doc } = await supabase
    .from('um_legal_documents')
    .select('title')
    .eq('slug', params.slug)
    .eq('is_active', true)
    .maybeSingle()

  return { title: doc ? `${doc.title} | ComPass` : 'Dokument | ComPass' }
}

export default async function LegalDocPage({ params }: Props) {
  const supabase = createClient()
  const { data: doc } = await supabase
    .from('um_legal_documents')
    .select('*')
    .eq('slug', params.slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!doc) notFound()

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <Link
        href="/home"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Powrót do panelu
      </Link>

      <div className="bg-card rounded-lg border p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{doc.title}</h1>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            v{doc.version}
          </span>
        </div>

        <div
          className="prose prose-sm dark:prose-invert max-w-none
            [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3
            [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2
            [&_p]:mb-3 [&_p]:leading-relaxed
            [&_ul]:mb-3 [&_ul]:pl-6 [&_ul]:list-disc
            [&_li]:mb-1
            [&_a]:text-primary [&_a]:underline
            [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{ __html: doc.content_html }}
        />

        <div className="mt-8 pt-4 border-t text-xs text-muted-foreground">
          Ostatnia aktualizacja: {new Date(doc.updated_at).toLocaleDateString('pl-PL')}
        </div>
      </div>
    </div>
  )
}

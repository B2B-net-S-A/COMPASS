import { Compass } from 'lucide-react'
import { formatValidityDate } from '@/lib/academy/certificate-validity'
import type { PublicDocument } from '@/lib/academy/document-verify'
import { VENDOR_DISCLAIMER } from '@/lib/academy/document-text'

const KIND_LABEL: Record<PublicDocument['kind'], string> = { certificate: 'Certyfikat ukończenia', participation: 'Zaświadczenie udziału' }

function Status({ document }: { document: PublicDocument }) {
    if (document.state === 'revoked') return <p className="font-semibold text-destructive">Dokument unieważniony</p>
    if (document.state === 'expired') return <p className="font-semibold text-destructive">Wygasł {document.validUntil ? formatValidityDate(document.validUntil) : ''}</p>
    return <p className="font-semibold text-success">Dokument ważny{document.validUntil ? ` do ${formatValidityDate(document.validUntil)}` : ''}</p>
}

/** Widok publiczny: nazwisko, szkolenie, data, stan. Bez wyniku testu. */
export function PublicDocumentCard({ document }: { document: PublicDocument }) {
    return <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10">
        <section className="w-full space-y-4 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Compass aria-hidden="true" className="h-4 w-4" />COMPASS Akademia</p>
            <h1 className="text-xl font-bold">Weryfikacja dokumentu</h1>
            <Status document={document} />
            <dl className="space-y-3 text-sm">
                <div><dt className="text-muted-foreground">Rodzaj</dt><dd className="font-medium">{KIND_LABEL[document.kind]}</dd></div>
                <div><dt className="text-muted-foreground">Uczestnik</dt><dd className="font-medium">{document.participantName}</dd></div>
                <div><dt className="text-muted-foreground">Szkolenie</dt><dd className="font-medium">{document.courseTitle}</dd></div>
                <div><dt className="text-muted-foreground">Data wystawienia</dt><dd className="font-medium">{formatValidityDate(document.issuedAt)}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">{VENDOR_DISCLAIMER}</p>
        </section>
    </main>
}

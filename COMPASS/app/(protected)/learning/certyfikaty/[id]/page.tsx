import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CourseCompletion } from '@/components/academy/CourseCompletion'
import { CertificateRenewButton } from '@/components/academy/CertificateRenewButton'
import { certificateValidity, certificateValidityLabel } from '@/lib/academy/certificate-validity'
import { getMyAcademyCertificate } from '@/lib/actions/academy-certificates'

export const dynamic = 'force-dynamic'
export default async function CertificateStatusPage({ params }: { params: { id: string } }) {
    const result = await getMyAcademyCertificate(params.id)
    if (!result.success) notFound()
    const item = result.data
    const validity = certificateValidity(item.certificate_snapshot, item.revoked_at)
    return <main className="mx-auto max-w-3xl space-y-5 p-6 md:p-8"><h1 className="text-2xl font-bold">Status certyfikatu</h1><div className="space-y-2 rounded-xl border border-border bg-card p-6"><h2 className="text-xl font-semibold">{item.certificate_snapshot.course_title}</h2><p>{item.certificate_snapshot.participant_name} · wersja {item.certificate_snapshot.version_number}</p><p className="text-sm text-muted-foreground">Ukończono {new Date(item.completed_at).toLocaleDateString('pl-PL')}. Status sprawdzany na bieżąco w Compass.</p>{validity.state === 'expired' ? <p className="font-medium text-destructive">{certificateValidityLabel(validity)}. Dokument zostaje w historii.</p> : !item.revoked_at && <p className="font-medium text-success">Certyfikat ważny{validity.validUntil ? ` do ${certificateValidityLabel(validity).replace('Ważny do ', '')}` : ''}</p>}{(validity.state === 'expired' || validity.state === 'expiring') && (item.renewalSlug ? <CertificateRenewButton courseId={item.course_id} courseSlug={item.renewalSlug} /> : <p className="text-sm text-muted-foreground">Aby odnowić certyfikat, zapisz się na kolejną edycję szkolenia.</p>)}<CourseCompletion courseId={item.course_id} enrollmentId={item.enrollment_id} completedAt={item.completed_at} revokedAt={item.revoked_at} revokedReason={item.revoked_reason} /></div><Button variant="outline" asChild><Link href="/learning/moje">Moje szkolenia</Link></Button></main>
}

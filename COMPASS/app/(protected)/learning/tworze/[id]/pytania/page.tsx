import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { CourseQA } from '@/components/learning/CourseQA'
import { Button } from '@/components/ui/button'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { listTeachingQuestionVersions } from '@/lib/actions/course-qa'

export const dynamic = 'force-dynamic'

export default async function TeachingQuestionsPage({ params, searchParams }: { params: { id: string }; searchParams: { version?: string } }) {
    const [access, result] = await Promise.all([getAcademyAccess(), listTeachingQuestionVersions(params.id)])
    if (!access.success || !result.success || !result.data.length) notFound()
    const selected = searchParams.version ? result.data.find(version => version.id === searchParams.version) : result.data.find(version => version.status === 'published') ?? result.data[0]
    if (!selected) notFound()
    return <AcademyShell activeTab="teaching" access={access.data} title="Pytania uczestników" description={selected.title} action={<Button asChild variant="outline"><Link href="/learning/tworze">Wróć do szkoleń</Link></Button>}>
        <form className="flex flex-wrap items-end gap-3"><label className="flex flex-col gap-1 text-sm">Wersja programu<select name="version" defaultValue={selected.id} className="h-10 rounded-md border border-input bg-background px-3">{result.data.map(version => <option key={version.id} value={version.id}>Wersja {version.versionNumber}{version.status === 'published' ? ' · opublikowana' : ' · robocza'}</option>)}</select></label><Button type="submit" variant="outline">Pokaż pytania</Button></form>
        <p className="text-sm text-muted-foreground">Odpowiadasz na pytania dotyczące wskazanej wersji. Ten panel nie tworzy zapisu ani postępu w szkoleniu.</p>
        <CourseQA key={selected.id} courseId={params.id} previewVersionId={selected.id} />
    </AcademyShell>
}

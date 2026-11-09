'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setCourseLibraryFields, type CourseLibraryState } from '@/lib/actions/academy-library'
import { COURSE_TOPIC_MAX_LENGTH, libraryFieldsDraft } from '@/lib/academy/course-library'
import type { ActionResult } from '@/lib/types/learning'
import { useAcademyAction } from './useAcademyAction'

const SELECT_CLASS = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50'

interface CourseLibraryFieldsProps {
    courseId: string
    result: ActionResult<CourseLibraryState>
    /** Tematy z katalogu (filtr „Temat”), jako podpowiedzi. Nowy temat też jest dozwolony. */
    topics: string[]
    archived?: boolean
}

/** Temat i program kursu w bibliotece (B4.7). Pola są poza wersją, więc zmiana od razu działa w katalogu. */
export function CourseLibraryFields({ courseId, result, topics, archived = false }: CourseLibraryFieldsProps) {
    return <section aria-labelledby="course-library-title" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
            <h2 id="course-library-title" className="text-lg font-semibold">Biblioteka: temat i program</h2>
            <p className="mt-1 text-sm text-muted-foreground">Temat porządkuje katalog i jego filtr. Program łączy szkolenie na żywo z kursem z modułów, a raport liczy go raz. Zmiana działa od razu, bez nowej wersji.</p>
        </div>
        {!result.success
            ? <p role="alert" className="text-sm text-destructive">{result.error}</p>
            : !result.data.migrated
                ? <p className="text-sm text-muted-foreground">Ta funkcja czeka na migrację bazy danych. Pozostała część edytora działa bez zmian.</p>
                : <LibraryForm courseId={courseId} state={result.data} topics={topics} readOnly={archived || !result.data.canEdit} archived={archived} />}
    </section>
}

function LibraryForm({ courseId, state, topics, readOnly, archived }: { courseId: string; state: CourseLibraryState; topics: string[]; readOnly: boolean; archived: boolean }) {
    const router = useRouter()
    const [topic, setTopic] = useState(state.topic ?? '')
    const [programme, setProgramme] = useState(state.programmeId ?? '')
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [pending, start] = useAcademyAction()
    const draft = libraryFieldsDraft(state, topic, programme)
    const currentMissing = state.programmeId !== null && !state.programmes.some(item => item.id === state.programmeId)

    function save() {
        if (!draft.changed || draft.error || readOnly) return
        setError(null)
        setSaved(false)
        start(async () => {
            const response = await setCourseLibraryFields({ courseId, topic: draft.topic, programmeId: draft.programmeId }).catch(() => null)
            if (!response?.success) { setError(response?.error ?? 'Nie udało się zapisać tematu i programu. Spróbuj ponownie.'); return }
            setSaved(true)
            router.refresh()
        })
    }

    return <form className="space-y-4" onSubmit={event => { event.preventDefault(); save() }}>
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
                <label htmlFor="course-library-topic" className="text-sm font-medium">Temat</label>
                <Input id="course-library-topic" list="course-library-topics" value={topic} maxLength={COURSE_TOPIC_MAX_LENGTH} disabled={readOnly || pending}
                    placeholder="np. Kubernetes" aria-describedby="course-library-topic-hint" onChange={event => { setTopic(event.target.value); setSaved(false) }} />
                <datalist id="course-library-topics">{topics.map(item => <option key={item} value={item} />)}</datalist>
                <p id="course-library-topic-hint" className="text-xs text-muted-foreground">Wybierz temat z katalogu albo wpisz nowy. Puste pole oznacza brak tematu.</p>
            </div>
            <div className="space-y-1.5">
                <label htmlFor="course-library-programme" className="text-sm font-medium">Program</label>
                <select id="course-library-programme" value={programme} disabled={readOnly || pending} className={SELECT_CLASS} onChange={event => { setProgramme(event.target.value); setSaved(false) }}>
                    <option value="">Bez programu</option>
                    {currentMissing && <option value={state.programmeId!}>Obecny program (niedostępny na liście)</option>}
                    {state.programmes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">{state.programmes.length === 0 ? 'Nie ma jeszcze żadnego programu. Program powstaje przy tworzeniu kursu dla nieobecnych z edycji.' : 'Wybierz istniejący program. Nowy program powstaje przy tworzeniu kursu dla nieobecnych z edycji.'}</p>
            </div>
        </div>
        {readOnly
            ? <p className="text-sm text-muted-foreground">{archived ? 'Szkolenie jest zarchiwizowane, więc temat i program są tylko do odczytu.' : 'Temat i program zmienia osoba, która może edytować to szkolenie.'}</p>
            : <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={pending || !draft.changed || Boolean(draft.error)}>Zapisz temat i program</Button>
                {saved && <p role="status" className="text-sm text-success">Zapisano temat i program.</p>}
            </div>}
        {(draft.error || error) && <p role="alert" className="text-sm text-destructive">{draft.error ?? error}</p>}
    </form>
}

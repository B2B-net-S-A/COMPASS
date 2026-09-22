'use client'

import { useEffect, useId, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listAcademyPrerequisiteChoices, type AcademyPrerequisiteChoice } from '@/lib/actions/academy-discovery'
import { useAcademyAction } from './useAcademyAction'

export function CoursePrerequisitesEditor({ value, onChange, courseId, disabled }: { value: string[]; onChange: (ids: string[]) => void; courseId?: string; disabled?: boolean }) {
    const id = useId()
    const [search, setSearch] = useState('')
    const [choices, setChoices] = useState<AcademyPrerequisiteChoice[]>([])
    const [known, setKnown] = useState<Record<string, string>>({})
    const [searched, setSearched] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pending, runAction] = useAcademyAction()
    const selectedKey = value.join(',')
    useEffect(() => {
        if (!selectedKey) return
        let cancelled = false
        void listAcademyPrerequisiteChoices({ selectedIds: selectedKey.split(','), excludeCourseId: courseId }).then((result) => {
            if (cancelled) return
            if (!result.success) { setError(result.error); return }
            setKnown((previous) => ({ ...previous, ...Object.fromEntries(result.data.map((item) => [item.id, item.title])) }))
        }).catch(() => { if (!cancelled) setError('Nie udało się odczytać wybranych wymagań. Możesz ponowić wyszukiwanie.') })
        return () => { cancelled = true }
    }, [selectedKey, courseId])

    function findCourses() {
        setError(null)
        runAction(async () => {
            try {
                const result = await listAcademyPrerequisiteChoices({ search, excludeCourseId: courseId })
                if (!result.success) { setError(result.error); return }
                setChoices(result.data)
                setSearched(true)
                setKnown((previous) => ({ ...previous, ...Object.fromEntries(result.data.map((item) => [item.id, item.title])) }))
            } catch { setError('Nie udało się wyszukać szkoleń. Spróbuj ponownie.') }
        })
    }
    return <fieldset disabled={disabled} className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <legend className="px-2 text-base font-semibold">Wymagania wstępne</legend>
        <p className="text-sm text-muted-foreground">Opcjonalnie wybierz szkolenia, które uczestnik musi ukończyć przed zapisem. Liczy się ukończenie dowolnej zatwierdzonej wersji wymaganego kursu.</p>
        <div className="space-y-2"><label htmlFor={`${id}-search`} className="text-sm font-medium">Znajdź opublikowane szkolenie</label><div className="flex flex-col gap-2 sm:flex-row"><Input id={`${id}-search`} value={search} maxLength={200} placeholder="Tytuł szkolenia" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); findCourses() } }} /><Button type="button" variant="outline" disabled={pending} onClick={findCourses}><Search aria-hidden="true" />{pending ? 'Wyszukiwanie…' : 'Wyszukaj'}</Button></div></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="space-y-2"><p className="text-sm font-medium">Wybrane wymagania ({value.length}/50)</p>{value.length === 0 ? <p className="text-sm text-muted-foreground">Bez wymagań wstępnych — uczestnik może zapisać się od razu.</p> : <ul className="space-y-2">{value.map((selected) => <li key={selected} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm"><span className="break-words">{known[selected] ?? 'Wybrane szkolenie (niedostępne lub trwa odczyt nazwy)'}</span><Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Usuń wymaganie: ${known[selected] ?? selected}`} onClick={() => onChange(value.filter((item) => item !== selected))}><X aria-hidden="true" /></Button></li>)}</ul>}</div>
        {searched && <div className="space-y-2 border-t border-border pt-4"><p className="text-xs text-muted-foreground" role="status">{choices.length === 0 ? 'Brak pasujących szkoleń.' : choices.length === 50 ? 'Pierwsze 50 wyników. Zawęź nazwę, aby znaleźć pozostałe.' : `Znaleziono: ${choices.length}`}</p><ul className="max-h-64 space-y-1 overflow-y-auto">{choices.map((choice) => <li key={choice.id}><label className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-muted/50"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={value.includes(choice.id)} disabled={!value.includes(choice.id) && value.length >= 50} onChange={(event) => onChange(event.target.checked ? [...value, choice.id] : value.filter((item) => item !== choice.id))} /><span className="text-sm">{choice.title}</span></label></li>)}</ul></div>}
    </fieldset>
}

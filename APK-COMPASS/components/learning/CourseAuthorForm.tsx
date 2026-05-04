'use client'

import { useState, useTransition } from 'react'
import { Loader2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { createCourse, updateCourse } from '@/lib/actions/courses'
import type { CourseLevel, Course, CourseType } from '@/lib/types/learning'

interface CourseAuthorFormProps {
    /** Initial data dla edycji; brak = nowy kurs */
    initial?: Course
    /** Callback po sukcesie — przekazuje courseId + slug */
    onSuccess?: (courseId: string, slug: string) => void
    /** Tekst CTA przycisku — domyślnie "Zapisz" lub "Stwórz kurs" */
    submitLabel?: string
    /**
     * Phase 1.4: gdy `true`, pokazuje przełącznik typu kursu (consultant/company)
     * + checkbox "is_official". Tylko dla admin/trainer — server-side gate w createCourse
     * silently downgrades to 'consultant' jeśli caller nie ma uprawnień.
     */
    allowCompanyType?: boolean
    /** Phase 1.4: domyślny typ przy tworzeniu (np. z ?type=company w URL) */
    defaultCourseType?: CourseType
}

const CATEGORIES = [
    'Frontend',
    'Backend',
    'Cloud',
    'DevOps',
    'Data',
    'Mobile',
    'Soft Skills',
    'Architektura',
    'Bezpieczeństwo',
    'AI/ML',
    'Inne',
]

const LEVELS: { value: CourseLevel; label: string }[] = [
    { value: 'beginner', label: 'Podstawowy' },
    { value: 'intermediate', label: 'Średni' },
    { value: 'advanced', label: 'Zaawansowany' },
]

export function CourseAuthorForm({ initial, onSuccess, submitLabel, allowCompanyType = false, defaultCourseType = 'consultant' }: CourseAuthorFormProps) {
    const [title, setTitle] = useState(initial?.title ?? '')
    const [description, setDescription] = useState(initial?.description ?? '')
    const [category, setCategory] = useState(initial?.category ?? '')
    const [level, setLevel] = useState<CourseLevel>(initial?.level ?? 'beginner')
    const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
    const [tagInput, setTagInput] = useState('')
    const [duration, setDuration] = useState<string>(initial?.duration_minutes?.toString() ?? '')
    const [courseType, setCourseType] = useState<CourseType>(initial?.course_type ?? defaultCourseType)
    const [isOfficial, setIsOfficial] = useState<boolean>(initial?.is_official ?? false)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const handleAddTag = () => {
        const t = tagInput.trim().toLowerCase()
        if (!t) return
        if (tags.includes(t)) {
            setTagInput('')
            return
        }
        setTags([...tags, t])
        setTagInput('')
    }

    const handleRemoveTag = (t: string) => setTags(tags.filter((x) => x !== t))

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
            const durationMin = duration === '' ? undefined : parseInt(duration, 10)
            if (initial) {
                const res = await updateCourse(initial.id, {
                    title,
                    description: description || null,
                    category,
                    tags,
                    level,
                    duration_minutes: durationMin ?? null,
                })
                if (!res.success) {
                    setError(res.error)
                    return
                }
                onSuccess?.(initial.id, res.data.slug)
            } else {
                const res = await createCourse({
                    title,
                    description,
                    category,
                    tags,
                    level,
                    duration_minutes: durationMin,
                    course_type: allowCompanyType ? courseType : 'consultant',
                    is_official: allowCompanyType && courseType === 'company' ? isOfficial : false,
                })
                if (!res.success) {
                    setError(res.error)
                    return
                }
                onSuccess?.(res.data.courseId, res.data.slug)
            }
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
            )}

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5 space-y-4">
                    {allowCompanyType && (
                        <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-3">
                            <p className="text-xs font-semibold text-amber-400">Tryb autora (admin / trainer)</p>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCourseType('consultant')}
                                    disabled={isPending}
                                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                                        courseType === 'consultant'
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-white/5 text-muted-foreground border-white/10 hover:border-primary/40'
                                    }`}
                                >
                                    Kurs konsultancki
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCourseType('company')}
                                    disabled={isPending}
                                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                                        courseType === 'company'
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-white/5 text-muted-foreground border-white/10 hover:border-primary/40'
                                    }`}
                                >
                                    Kurs firmowy (Dynaminds)
                                </button>
                            </div>
                            {courseType === 'company' && (
                                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isOfficial}
                                        onChange={(e) => setIsOfficial(e.target.checked)}
                                        disabled={isPending}
                                        className="accent-amber-500"
                                    />
                                    Oznacz jako Official (np. GASQ-certified, SAFe Agile, Pega)
                                </label>
                            )}
                            <p className="text-[10px] text-muted-foreground">
                                {courseType === 'company'
                                    ? 'Kurs firmowy: brak bonusu autora, student dostaje +30 pkt zamiast +20.'
                                    : 'Kurs konsultancki: autor dostaje +50 pkt × rating multiplier za każdego studenta, student dostaje +20 pkt.'}
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                            Tytuł szkolenia <span className="text-red-400">*</span>
                        </label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="np. Wprowadzenie do TypeScript dla seniora"
                            required
                            minLength={3}
                            disabled={isPending}
                        />
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Krótki opis (1–2 zdania)</label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Czego nauczy się uczeń po ukończeniu kursu? Co dostanie w zamian?"
                            disabled={isPending}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                                Kategoria <span className="text-red-400">*</span>
                            </label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                required
                                disabled={isPending}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-primary/50"
                            >
                                <option value="" disabled>
                                    Wybierz...
                                </option>
                                {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Poziom</label>
                            <select
                                value={level}
                                onChange={(e) => setLevel(e.target.value as CourseLevel)}
                                disabled={isPending}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-primary/50"
                            >
                                {LEVELS.map((l) => (
                                    <option key={l.value} value={l.value}>
                                        {l.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Czas (minuty)</label>
                            <Input
                                type="number"
                                min="0"
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                placeholder="60"
                                disabled={isPending}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                            Tagi (technologie, słowa kluczowe — wpisz i Enter)
                        </label>
                        <div className="flex gap-2">
                            <Input
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        handleAddTag()
                                    }
                                }}
                                placeholder="typescript, react, postgresql..."
                                disabled={isPending}
                            />
                            <Button type="button" onClick={handleAddTag} variant="outline" size="sm" disabled={isPending}>
                                Dodaj
                            </Button>
                        </div>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {tags.map((t) => (
                                    <Badge key={t} variant="outline" className="text-[10px] gap-1 pr-1">
                                        {t}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTag(t)}
                                            disabled={isPending}
                                            className="hover:text-red-400"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Tagi pomagają algorytmowi AI rekomendować Twój kurs konsultantom z lukami w tych umiejętnościach.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button type="submit" disabled={isPending || !title.trim() || !category} size="lg" className="gap-2">
                    {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitLabel ?? (initial ? 'Zapisz zmiany' : 'Stwórz szkolenie')}
                </Button>
            </div>
        </form>
    )
}

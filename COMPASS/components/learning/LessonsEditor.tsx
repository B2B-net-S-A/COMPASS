'use client'

import { useEffect, useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { MaterialUploader } from '@/components/academy/MaterialUploader'
import { Plus, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Eye, Edit3, FileText, Loader2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { MarkdownView } from './MarkdownView'
import {
    addLesson,
    updateLesson,
    deleteLesson,
    reorderLessons,
} from '@/lib/actions/courses'
import type { CourseLesson } from '@/lib/types/learning'

interface LessonsEditorProps {
    courseId: string
    initialLessons: CourseLesson[]
    onChanged?: () => void
}

export function LessonsEditor({ courseId, initialLessons, onChanged }: LessonsEditorProps) {
    const [lessons, setLessons] = useState<CourseLesson[]>(initialLessons)
    const [expandedId, setExpandedId] = useState<string | null>(initialLessons[0]?.id ?? null)
    const [isPending, startTransition] = useAcademyAction()
    const [error, setError] = useState<string | null>(null)
    const [confirm, ConfirmUI] = useConfirm()

    useEffect(() => { setLessons(initialLessons) }, [initialLessons])

    const refreshAfterChange = () => onChanged?.()

    const handleAddLesson = () => {
        setError(null)
        const title = window.prompt('Tytuł nowej lekcji:')
        if (!title || title.trim().length < 2) return

        startTransition(async () => {
            const res = await addLesson(courseId, { title: title.trim() })
            if (!res.success) {
                setError(res.error)
                return
            }
            const newLesson: CourseLesson = {
                id: res.data.lessonId,
                course_id: courseId,
                order_index: lessons.length,
                title: title.trim(),
                content_md: null,
                video_url: null,
                attachments: [],
                estimated_minutes: null,
                unlock_after_days: 0,
            }
            setLessons([...lessons, newLesson])
            setExpandedId(newLesson.id)
            refreshAfterChange()
        })
    }

    const handleSaveLesson = (lessonId: string, patch: Partial<CourseLesson>) => {
        setError(null)
        startTransition(async () => {
            const res = await updateLesson(lessonId, {
                title: patch.title,
                content_md: patch.content_md,
                video_url: patch.video_url,
                estimated_minutes: patch.estimated_minutes,
                attachments: patch.attachments,
            })
            if (!res.success) {
                setError(res.error)
                return
            }
            setLessons((prev) => prev.map((l) => (l.id === lessonId ? { ...l, ...patch } : l)))
            refreshAfterChange()
        })
    }

    const handleDeleteLesson = async (lessonId: string) => {
        const ok = await confirm({
            description: 'Usunąć tę lekcję? Operacja jest nieodwracalna.',
            variant: 'destructive',
        })
        if (!ok) return
        setError(null)
        startTransition(async () => {
            const res = await deleteLesson(lessonId)
            if (!res.success) {
                setError(res.error)
                return
            }
            setLessons((prev) => prev.filter((l) => l.id !== lessonId))
            refreshAfterChange()
        })
    }

    const handleMove = (lessonId: string, direction: 'up' | 'down') => {
        const idx = lessons.findIndex((l) => l.id === lessonId)
        if (idx === -1) return
        const newIdx = direction === 'up' ? idx - 1 : idx + 1
        if (newIdx < 0 || newIdx >= lessons.length) return

        const reordered = [...lessons]
        ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
        setLessons(reordered)

        startTransition(async () => {
            const res = await reorderLessons(courseId, reordered.map((l) => l.id))
            if (!res.success) {
                setError(res.error)
                setLessons(lessons) // revert on error
                return
            }
            refreshAfterChange()
        })
    }

    const handleRemoveAttachment = (lessonId: string, idx: number) => {
        const lesson = lessons.find((l) => l.id === lessonId)
        if (!lesson) return
        const removedId = lesson.attachments[idx]?.asset_id
        const newAttachments = lesson.attachments.filter((_, i) => i !== idx).map(item =>
            removedId && item.caption_for_asset_id === removedId ? { ...item, caption_for_asset_id: null } : item)
        handleSaveLesson(lessonId, { attachments: newAttachments })
    }

    const handleAssignCaption = (lessonId: string, captionId: string, videoId: string | null) => {
        const lesson = lessons.find((l) => l.id === lessonId)
        if (!lesson) return
        handleSaveLesson(lessonId, { attachments: lesson.attachments.map(item =>
            item.asset_id === captionId ? { ...item, caption_for_asset_id: videoId } : item) })
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Lekcje ({lessons.length})</h3>
                    <p className="text-xs text-muted-foreground">Lekcje, dokumenty, nagrania i napisy</p>
                </div>
                <Button onClick={handleAddLesson} size="sm" disabled={isPending} className="gap-2">
                    <Plus className="w-4 h-4" /> Dodaj lekcję
                </Button>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>
            )}

            {lessons.length === 0 && (
                <Card className="bg-card border-border">
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                        Brak lekcji. Kliknij „Dodaj lekcję" żeby utworzyć pierwszą.
                    </CardContent>
                </Card>
            )}

            <div className="space-y-3">
                {lessons.map((lesson, idx) => (
                    <LessonRow
                        key={lesson.id}
                        lesson={lesson}
                        position={idx + 1}
                        total={lessons.length}
                        expanded={expandedId === lesson.id}
                        disabled={isPending}
                        onToggle={() => setExpandedId(expandedId === lesson.id ? null : lesson.id)}
                        onSave={(patch) => handleSaveLesson(lesson.id, patch)}
                        onDelete={() => handleDeleteLesson(lesson.id)}
                        onMove={(dir) => handleMove(lesson.id, dir)}
                        onMaterialReady={refreshAfterChange}
                        onRemoveAttachment={(i) => handleRemoveAttachment(lesson.id, i)}
                        onAssignCaption={(captionId, videoId) => handleAssignCaption(lesson.id, captionId, videoId)}
                    />
                ))}
            </div>
            <ConfirmUI />
        </div>
    )
}

interface LessonRowProps {
    lesson: CourseLesson
    position: number
    total: number
    expanded: boolean
    disabled: boolean
    onToggle: () => void
    onSave: (patch: Partial<CourseLesson>) => void
    onDelete: () => void
    onMove: (dir: 'up' | 'down') => void
    onMaterialReady: () => void
    onRemoveAttachment: (idx: number) => void
    onAssignCaption: (captionId: string, videoId: string | null) => void
}

function LessonRow({
    lesson,
    position,
    total,
    expanded,
    disabled,
    onToggle,
    onSave,
    onDelete,
    onMove,
    onMaterialReady,
    onRemoveAttachment,
    onAssignCaption,
}: LessonRowProps) {
    const [title, setTitle] = useState(lesson.title)
    const [contentMd, setContentMd] = useState(lesson.content_md ?? '')
    const [videoUrl, setVideoUrl] = useState(lesson.video_url ?? '')
    const [estimatedMin, setEstimatedMin] = useState<string>(lesson.estimated_minutes?.toString() ?? '')
    const [previewMode, setPreviewMode] = useState(false)

    const dirty =
        title !== lesson.title ||
        contentMd !== (lesson.content_md ?? '') ||
        videoUrl !== (lesson.video_url ?? '') ||
        (estimatedMin === '' ? null : parseInt(estimatedMin, 10)) !== lesson.estimated_minutes

    const handleSave = () => {
        onSave({
            title: title.trim(),
            content_md: contentMd.trim() || null,
            video_url: videoUrl.trim() || null,
            estimated_minutes: estimatedMin === '' ? null : parseInt(estimatedMin, 10),
        })
    }

    return (
        <Card className="bg-card border-border">
            <CardContent className="p-4">
                {/* Header row */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onToggle}
                        className="flex items-center gap-2 flex-1 text-left hover:text-primary transition-colors"
                        type="button"
                    >
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <Badge variant="outline" className="text-[10px]">
                            {position}
                        </Badge>
                        <span className="font-medium text-sm">{lesson.title}</span>
                        {lesson.attachments.length > 0 && (
                            <Badge variant="outline" className="text-[10px] border-border">
                                {lesson.attachments.length} plików
                            </Badge>
                        )}
                    </button>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onMove('up')}
                            disabled={disabled || position === 1}
                            className="h-8 w-8 p-0"
                            title="Przesuń w górę"
                        >
                            <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onMove('down')}
                            disabled={disabled || position === total}
                            className="h-8 w-8 p-0"
                            title="Przesuń w dół"
                        >
                            <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onDelete}
                            disabled={disabled}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Usuń lekcję"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Expanded body */}
                {expanded && (
                    <div className="mt-4 space-y-4 pt-4 border-t border-border">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Tytuł lekcji</label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={disabled} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Embed wideo (YouTube/Vimeo URL — opcjonalnie)</label>
                                <Input
                                    value={videoUrl}
                                    onChange={(e) => setVideoUrl(e.target.value)}
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    disabled={disabled}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Szacunkowy czas (minuty)</label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={estimatedMin}
                                    onChange={(e) => setEstimatedMin(e.target.value)}
                                    placeholder="15"
                                    disabled={disabled}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-muted-foreground">Treść lekcji (Markdown)</label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setPreviewMode(!previewMode)}
                                    className="h-7 text-xs gap-1"
                                    type="button"
                                >
                                    {previewMode ? (
                                        <>
                                            <Edit3 className="w-3 h-3" /> Edycja
                                        </>
                                    ) : (
                                        <>
                                            <Eye className="w-3 h-3" /> Podgląd
                                        </>
                                    )}
                                </Button>
                            </div>
                            {previewMode ? (
                                <div className="min-h-[200px] p-4 rounded-lg border border-border bg-muted">
                                    {contentMd.trim() ? (
                                        <MarkdownView content={contentMd} />
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic">Brak treści</p>
                                    )}
                                </div>
                            ) : (
                                <Textarea
                                    value={contentMd}
                                    onChange={(e) => setContentMd(e.target.value)}
                                    rows={12}
                                    placeholder="# Wprowadzenie&#10;&#10;Tekst lekcji w **Markdown**.&#10;&#10;- Wsparcie list&#10;- Tabel&#10;- Code blocks"
                                    className="font-mono text-sm"
                                    disabled={disabled}
                                />
                            )}
                        </div>

                        <div>
                            <label className="text-xs text-muted-foreground mb-2 block">Materiały lekcji</label>
                            <p className="mb-2 text-xs text-muted-foreground">Przypisz napisy VTT do właściwego nagrania MP4 przed wysłaniem programu do akceptacji.</p>
                            <div className="space-y-2">
                                {lesson.attachments.map((att, i) => (
                                    <div
                                        key={`${att.storage_path}-${i}`}
                                        className="space-y-2 rounded border border-border bg-muted p-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            <span className="min-w-0 flex-1 break-all text-xs">{att.name}</span>
                                            <span className="text-[10px] text-muted-foreground">{(att.size_bytes / 1024).toFixed(0)} KB</span>
                                            <Button variant="ghost" size="sm" onClick={() => onRemoveAttachment(i)} disabled={disabled}
                                                aria-label={`Usuń załącznik ${att.name}`} className="h-6 w-6 p-0 text-destructive">
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                        {att.mime_type === 'text/vtt' && att.asset_id && <label className="block text-xs">
                                            Nagranie dla napisów {att.name}
                                            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={att.caption_for_asset_id ?? ''}
                                                disabled={disabled} onChange={event => onAssignCaption(att.asset_id!, event.target.value || null)}>
                                                <option value="">Bez przypisania</option>
                                                {lesson.attachments.filter(video => video.mime_type === 'video/mp4' && video.asset_id
                                                    && (video.asset_id === att.caption_for_asset_id || !lesson.attachments.some(caption =>
                                                        caption.asset_id !== att.asset_id && caption.caption_for_asset_id === video.asset_id))).map(video =>
                                                    <option key={video.asset_id} value={video.asset_id}>{video.name}</option>)}
                                            </select>
                                        </label>}
                                    </div>
                                ))}
                                <MaterialUploader courseId={lesson.course_id} lessonId={lesson.id} disabled={disabled} onReady={onMaterialReady} />
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button onClick={handleSave} disabled={disabled || !dirty} size="sm" className="gap-2">
                                {disabled && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Zapisz lekcję
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

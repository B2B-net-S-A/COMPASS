'use client'

import { useCallback, useState } from 'react'
import { CheckCircle2, Clock, Eye, FileText, PlayCircle, ShieldAlert, Upload, XCircle } from 'lucide-react'
import { MaterialUploader } from '@/components/academy/MaterialUploader'
import { VideoChaptersEditor } from '@/components/academy/VideoChaptersEditor'
import { listAcademyRunMaterials } from '@/lib/actions/academy-materials'
import { trainerMaterialState, type TrainerMaterialRow } from '@/lib/academy/teaching-steps'

interface TrainerMaterialsProps {
    courseId: string
    runId: string
    initial: TrainerMaterialRow[]
    viewers: Record<string, number>
    preview?: boolean
}

const ICONS = { scanning: Clock, waiting: Clock, library: CheckCircle2, rejected: XCircle, blocked: ShieldAlert, withdrawn: XCircle }
const TONES = { scanning: 'text-muted-foreground', waiting: 'text-warning', library: 'text-success', rejected: 'text-destructive', blocked: 'text-destructive', withdrawn: 'text-muted-foreground' }

/** Krok 2: przeciągnij MP4 i PDF; każdy plik pokazuje, gdzie jest w drodze do biblioteki. */
export function TrainerMaterials({ courseId, runId, initial, viewers, preview = false }: TrainerMaterialsProps) {
    const [items, setItems] = useState(initial)
    const refresh = useCallback(async () => {
        const result = await listAcademyRunMaterials(runId).catch(() => null)
        if (result?.success) setItems(result.data)
    }, [runId])

    return <div className="space-y-4">
        {preview
            ? <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-4 py-8 text-center"><Upload aria-hidden="true" className="size-6 text-muted-foreground" /><p className="text-sm font-medium">Przeciągnij tu nagranie MP4 i slajdy PDF</p><p className="text-xs text-muted-foreground">albo wybierz pliki z dysku</p></div>
            : <MaterialUploader courseId={courseId} runId={runId} onReady={() => void refresh()} />}
        {items.length > 0 && <ul className="divide-y divide-border rounded-xl border border-border bg-card">{items.map(item => {
            const state = trainerMaterialState(item)
            const Icon = ICONS[state.key]
            const video = item.mime_type === 'video/mp4'
            return <li key={item.id} className="space-y-3 px-4 py-3">
                <div className="flex items-start gap-3">
                    {video ? <PlayCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /> : <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 grow space-y-0.5">
                        <p className="break-words text-sm font-medium">{item.filename}</p>
                        <p className={`flex flex-wrap items-center gap-1.5 text-xs ${TONES[state.key]}`}><Icon aria-hidden="true" className="size-3.5" />{state.label}{video && state.key === 'library' && <span className="inline-flex items-center gap-1 text-muted-foreground"><Eye aria-hidden="true" className="size-3.5" />{viewers[item.id] ?? 0} os. oglądało</span>}</p>
                        {state.note && <p className="text-xs text-muted-foreground">{state.note}</p>}
                    </div>
                </div>
                {video && !preview && item.status === 'ready' && <details className="rounded-lg border border-border px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Rozdziały nagrania</summary><div className="pt-3"><VideoChaptersEditor assetId={item.id} /></div></details>}
            </li>
        })}</ul>}
    </div>
}

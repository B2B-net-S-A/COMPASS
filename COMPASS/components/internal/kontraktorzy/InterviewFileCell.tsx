'use client'

// Phase 38 — per-row interview file cell for the Onboarding / Exit tables.
// Uploads to the contractor's latest interview (creating the interview — and, when needed, the
// contractor — on the fly), lists existing attachments with short-lived signed-URL view links,
// and allows removing a wrong upload. The upload anchors to a contractor; when a row isn't linked
// to one yet, the entry identity is passed so the action can find-or-create + link it.

import { useRef, useState } from 'react'
import { Loader2, Paperclip, Upload, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
    uploadContractorInterviewFile,
    removeContractorInterviewFile,
    getContractorInterviewFileUrl,
} from '@/lib/actions/contractors'
import type { InterviewAttachment, InterviewKind } from '@/lib/types/contractor'

interface Props {
    kind: InterviewKind
    /** Linked contractor, or null when the row hasn't been matched to one yet. */
    contractorId: string | null
    attachments: InterviewAttachment[]
    /** Entry identity used to find-or-create + link a contractor when contractorId is null. */
    entry: {
        consultantName: string
        client?: string | null
        position?: string | null
        source: 'placement' | 'archive' | 'departure'
        entryId: string
    }
    onChanged: () => void
}

export function InterviewFileCell({ kind, contractorId, attachments, entry, onChanged }: Props) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [busy, setBusy] = useState(false)
    const [opening, setOpening] = useState<string | null>(null)

    async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (inputRef.current) inputRef.current.value = ''
        if (!file) return
        setBusy(true)
        try {
            const fd = new FormData()
            fd.set('kind', kind)
            fd.set('file', file)
            if (contractorId) fd.set('contractorId', contractorId)
            else {
                fd.set('consultantName', entry.consultantName)
                if (entry.client) fd.set('client', entry.client)
                if (entry.position) fd.set('position', entry.position)
                fd.set('entrySource', entry.source)
                fd.set('entryId', entry.entryId)
            }
            await uploadContractorInterviewFile(fd)
            toast.success('Plik wgrany.')
            onChanged()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Nie udało się wgrać pliku.')
        } finally {
            setBusy(false)
        }
    }

    async function openFile(path: string) {
        setOpening(path)
        try {
            const url = await getContractorInterviewFileUrl(path)
            window.open(url, '_blank', 'noopener,noreferrer')
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Nie udało się otworzyć pliku.')
        } finally {
            setOpening(null)
        }
    }

    async function remove(path: string) {
        if (!contractorId) return
        setBusy(true)
        try {
            await removeContractorInterviewFile(kind, contractorId, path)
            toast.success('Usunięto plik.')
            onChanged()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć pliku.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-1">
            {attachments.map((a) => (
                <div key={a.path} className="flex items-center gap-1 text-xs">
                    <button
                        type="button"
                        onClick={() => openFile(a.path)}
                        disabled={opening === a.path}
                        className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
                        title={a.name}
                    >
                        {opening === a.path ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                        <span className="max-w-[160px] truncate">{a.name}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => remove(a.path)}
                        disabled={busy}
                        className="text-muted-foreground hover:text-red-600 disabled:opacity-50"
                        title="Usuń plik"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ))}
            <input ref={inputRef} type="file" className="hidden" onChange={onPick}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                {attachments.length > 0 ? 'Dodaj' : 'Wgraj plik'}
            </button>
        </div>
    )
}

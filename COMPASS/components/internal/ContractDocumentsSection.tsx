'use client'

// Phase 27i — Contract documents (umowa + aneksy) for one employee. Finanse + admin only
// (parent dialog is already gated). Lists existing docs with download/delete and an upload form.

import { useEffect, useState } from 'react'
import { Loader2, Download, Trash2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import {
    listContractDocuments,
    uploadContractDocument,
    getContractDocumentSignedUrl,
    deleteContractDocument,
} from '@/lib/actions/internal-contracts'
import type { ContractDocument, ContractDocType } from '@/lib/types/rates'
import { CONTRACT_DOC_TYPE_LABELS_PL } from '@/lib/types/rates'

interface Props {
    userId: string
}

function formatBytes(n: number | null): string {
    if (!n) return ''
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function ContractDocumentsSection({ userId }: Props) {
    const [docs, setDocs] = useState<ContractDocument[]>([])
    const [loading, setLoading] = useState(true)
    const [docType, setDocType] = useState<ContractDocType>('umowa')
    const [description, setDescription] = useState('')
    const [signedDate, setSignedDate] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [fileInputKey, setFileInputKey] = useState(0)
    const [uploading, setUploading] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [confirm, ConfirmUI] = useConfirm()

    async function refresh() {
        try {
            const rows = await listContractDocuments(userId)
            setDocs(rows)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Błąd pobierania dokumentów.')
        }
    }

    useEffect(() => {
        let active = true
        setLoading(true)
        listContractDocuments(userId)
            .then((rows) => {
                if (active) setDocs(rows)
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : 'Błąd pobierania dokumentów.'))
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [userId])

    async function handleUpload() {
        if (!file) {
            toast.error('Wybierz plik.')
            return
        }
        setUploading(true)
        try {
            await uploadContractDocument(userId, file, docType, description.trim() || null, signedDate || null)
            toast.success('Dodano dokument.')
            setFile(null)
            setDescription('')
            setSignedDate('')
            setDocType('umowa')
            setFileInputKey((k) => k + 1)
            await refresh()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Błąd dodawania dokumentu.')
        } finally {
            setUploading(false)
        }
    }

    async function handleDownload(docId: string) {
        setBusyId(docId)
        try {
            const url = await getContractDocumentSignedUrl(docId)
            window.open(url, '_blank', 'noopener,noreferrer')
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Błąd pobierania pliku.')
        } finally {
            setBusyId(null)
        }
    }

    async function handleDelete(docId: string) {
        const ok = await confirm({
            description: 'Usunąć ten dokument? Tej operacji nie można cofnąć.',
            variant: 'destructive',
        })
        if (!ok) return
        setBusyId(docId)
        try {
            await deleteContractDocument(docId)
            toast.success('Usunięto dokument.')
            await refresh()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Błąd usuwania dokumentu.')
        } finally {
            setBusyId(null)
        }
    }

    return (
        <div className="space-y-3">
            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Ładowanie dokumentów…
                </div>
            ) : docs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Brak dokumentów.</p>
            ) : (
                <div className="rounded-lg border border-white/10 divide-y divide-border/20">
                    {docs.map((d) => (
                        <div key={d.id} className="flex items-center gap-2 p-2 text-sm">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="inline-block rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium">
                                        {CONTRACT_DOC_TYPE_LABELS_PL[d.doc_type]}
                                    </span>
                                    <span className="truncate font-medium">{d.file_name}</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                    {d.signed_date ? `Podpisano: ${d.signed_date}` : 'Brak daty podpisania'}
                                    {d.file_size_bytes ? ` · ${formatBytes(d.file_size_bytes)}` : ''}
                                    {d.description ? ` · ${d.description}` : ''}
                                </div>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                disabled={busyId === d.id}
                                onClick={() => handleDownload(d.id)}
                            >
                                {busyId === d.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <Download className="h-3 w-3" />
                                )}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-red-400 hover:text-red-300"
                                disabled={busyId === d.id}
                                onClick={() => handleDelete(d.id)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload form */}
            <div className="rounded-lg border border-white/10 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <Label htmlFor="doc-type" className="text-xs">
                            Typ dokumentu
                        </Label>
                        <select
                            id="doc-type"
                            value={docType}
                            onChange={(e) => setDocType(e.target.value as ContractDocType)}
                            disabled={uploading}
                            className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        >
                            <option value="umowa">Umowa</option>
                            <option value="aneks">Aneks</option>
                            <option value="inne">Inne</option>
                        </select>
                    </div>
                    <div>
                        <Label htmlFor="doc-signed" className="text-xs">
                            Data podpisania
                        </Label>
                        <Input
                            id="doc-signed"
                            type="date"
                            value={signedDate}
                            onChange={(e) => setSignedDate(e.target.value)}
                            disabled={uploading}
                            className="mt-1 h-8"
                        />
                    </div>
                </div>
                <div>
                    <Label htmlFor="doc-desc" className="text-xs">
                        Opis (opcjonalny)
                    </Label>
                    <Input
                        id="doc-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="np. Umowa B2B 2026 / Aneks nr 1 — zmiana stawki"
                        maxLength={500}
                        disabled={uploading}
                        className="mt-1 h-8"
                    />
                </div>
                <div>
                    <Label htmlFor="doc-file" className="text-xs">
                        Plik (PDF, JPG, PNG, WEBP, DOCX — max 10 MB)
                    </Label>
                    <input
                        key={fileInputKey}
                        id="doc-file"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        disabled={uploading}
                        className="mt-1 block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs"
                    />
                </div>
                <div className="flex justify-end">
                    <Button type="button" size="sm" onClick={handleUpload} disabled={uploading || !file}>
                        {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Dodaj załącznik
                    </Button>
                </div>
            </div>
            <ConfirmUI />
        </div>
    )
}

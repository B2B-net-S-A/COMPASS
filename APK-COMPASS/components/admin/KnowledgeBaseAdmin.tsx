'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Loader2, Plus, Trash2, Search, BookOpen, Upload, FileText, File } from 'lucide-react'
import { addKnowledgeDocument, getKnowledgeHistory, deleteKnowledgeDocument, uploadKnowledgeFile } from '@/lib/actions/knowledge-base'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/shared/ConfirmDialog'

const CATEGORIES = [
    { value: 'umowy', label: 'Umowy i Procedury' },
    { value: 'benefity', label: 'Benefity' },
    { value: 'finanse', label: 'Finanse i Rozliczenia' },
    { value: 'hr', label: 'HR i Onboarding' },
    { value: 'it', label: 'IT i Sprzęt' },
    { value: 'ogolne', label: 'Ogólne' }
]

export function KnowledgeBaseAdmin() {
    const [documents, setDocuments] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [confirm, ConfirmUI] = useConfirm()
    const [content, setContent] = useState('')
    const [category, setCategory] = useState('ogolne')
    const [searchQuery, setSearchQuery] = useState('')
    const [uploading, setUploading] = useState(false)
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [dragOver, setDragOver] = useState(false)

    const [tableError, setTableError] = useState<string | null>(null)

    useEffect(() => {
        fetchDocuments()
    }, [])

    async function fetchDocuments() {
        try {
            setLoading(true)
            setTableError(null)
            const data = await getKnowledgeHistory()
            setDocuments(data as any[])
        } catch (err: any) {
            const msg = err?.message || ''
            if (msg.includes('schema cache') || msg.includes('PGRST205') || msg.includes('does not exist')) {
                setTableError('Tabela compass_assist_knowledge nie istnieje w bazie danych. Uruchom migrację SQL w Supabase Dashboard.')
            } else {
                toast.error("Błąd podczas pobierania bazy wiedzy: " + msg)
            }
        } finally {
            setLoading(false)
        }
    }

    async function handleAdd() {
        if (!content.trim()) return
        try {
            setAdding(true)
            await addKnowledgeDocument(content, category)
            toastSuccess("Dokument dodany i zaindeksowany")
            setContent('')
            fetchDocuments()
        } catch {
            toast.error("Błąd podczas dodawania dokumentu")
        } finally {
            setAdding(false)
        }
    }

    async function handleFileUpload() {
        if (!uploadFile) return
        try {
            setUploading(true)
            const formData = new FormData()
            formData.append('file', uploadFile)
            const result = await uploadKnowledgeFile(formData, category)
            if (result.success) {
                toastSuccess(`Plik "${result.fileName}" zaindeksowany: ${result.chunksIndexed} fragmentów`)
                setUploadFile(null)
                fetchDocuments()
            } else {
                toast.error(result.error || 'Błąd uploadu')
            }
        } catch {
            toast.error("Błąd podczas przetwarzania pliku")
        } finally {
            setUploading(false)
        }
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file && (file.name.endsWith('.pdf') || file.name.endsWith('.docx'))) {
            setUploadFile(file)
        } else {
            toast.error('Dozwolone formaty: PDF, DOCX')
        }
    }

    async function handleDelete(id: string) {
        const ok = await confirm({
            title: 'Usuń dokument',
            description: 'Czy na pewno chcesz usunąć ten dokument z bazy wiedzy?',
            confirmLabel: 'Usuń',
            variant: 'destructive',
        })
        if (!ok) return
        try {
            await deleteKnowledgeDocument(id)
            toastSuccess("Dokument usunięty")
            fetchDocuments()
        } catch {
            toast.error("Błąd podczas usuwania")
        }
    }

    const filteredDocs = documents.filter(doc =>
        doc.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.category.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="space-y-6">
            {/* Category selector (shared between both methods) */}
            <Card className="bg-[#1a1a2e] border-white/10 text-white">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Plus className="w-5 h-5 text-slate-200" />
                        Dodaj do Bazy Wiedzy
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                        Wgraj plik PDF/DOCX lub wprowadź tekst ręcznie. Treść zostanie automatycznie zaindeksowana wektorowo dla AI.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Category selector */}
                    <div className="flex items-center gap-4">
                        <label className="text-sm font-medium shrink-0">Kategoria:</label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="bg-white/5 border-white/10 w-64">
                                <SelectValue placeholder="Wybierz kategorię" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1a2e] border-white/10 text-white">
                                {CATEGORIES.map(cat => (
                                    <SelectItem key={cat.value} value={cat.value}>
                                        {cat.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* File Upload */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-slate-200 flex items-center gap-2">
                                <Upload className="w-4 h-4" /> Wgraj plik
                            </label>
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                className={cn(
                                    "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer relative",
                                    dragOver
                                        ? "border-slate-200 bg-slate-200/10"
                                        : uploadFile
                                            ? "border-green-500/50 bg-green-500/5"
                                            : "border-white/10 hover:border-slate-200/50 hover:bg-white/5"
                                )}
                            >
                                <input
                                    type="file"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    accept=".pdf,.docx"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0]
                                        if (f) setUploadFile(f)
                                    }}
                                />
                                {uploadFile ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-center gap-2 text-green-400">
                                            {uploadFile.name.endsWith('.pdf') ? (
                                                <FileText className="w-8 h-8" />
                                            ) : (
                                                <File className="w-8 h-8" />
                                            )}
                                        </div>
                                        <p className="font-medium text-green-400">{uploadFile.name}</p>
                                        <p className="text-xs text-slate-600">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Upload className="w-10 h-10 mx-auto text-slate-600" />
                                        <p className="text-sm font-medium text-slate-300">Przeciągnij plik lub kliknij</p>
                                        <p className="text-xs text-slate-600">PDF, DOCX (max 20MB)</p>
                                    </div>
                                )}
                            </div>
                            <Button
                                className="w-full bg-burgundy hover:bg-slate-200"
                                onClick={handleFileUpload}
                                disabled={uploading || !uploadFile}
                            >
                                {uploading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Przetwarzanie pliku...</>
                                ) : (
                                    <><Upload className="w-4 h-4 mr-2" /> Wgraj i zaindeksuj plik</>
                                )}
                            </Button>
                        </div>

                        {/* Manual Text Input */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-slate-200 flex items-center gap-2">
                                <Plus className="w-4 h-4" /> Wprowadź tekst ręcznie
                            </label>
                            <Textarea
                                placeholder="Treść dokumentu, procedury, FAQ..."
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="min-h-[180px] bg-white/5 border-white/10 text-white"
                            />
                            <Button
                                className="w-full bg-burgundy hover:bg-blue-700"
                                onClick={handleAdd}
                                disabled={adding || !content.trim()}
                            >
                                {adding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                                Indeksuj tekst
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {tableError && (
                <Card className="bg-red-900/20 border-red-500/30 text-white">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                                <BookOpen className="w-5 h-5 text-red-400" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-semibold text-red-300">Baza wiedzy wymaga konfiguracji</h3>
                                <p className="text-sm text-red-200/70">{tableError}</p>
                                <p className="text-sm text-slate-600">
                                    Otwórz <strong>Supabase Dashboard → SQL Editor</strong> i uruchom plik migracji:
                                </p>
                                <code className="block text-xs bg-black/30 p-2 rounded text-foreground">
                                    supabase/migrations/20260219_fix_knowledge_rls.sql
                                </code>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="bg-[#1a1a2e] border-white/10 text-white">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-green-400" />
                                Zaindeksowane Dokumenty
                            </CardTitle>
                            <CardDescription className="text-gray-400">
                                Zarządzaj wiedzą, którą posługuje się Compass Assist.
                            </CardDescription>
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                placeholder="Szukaj w bazie..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-white/5 border-white/10 text-white"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-white/5 hover:bg-transparent">
                                    <TableHead className="text-gray-400">Kategoria</TableHead>
                                    <TableHead className="text-gray-400">Źródło</TableHead>
                                    <TableHead className="text-gray-400">Treść</TableHead>
                                    <TableHead className="text-gray-400 w-[120px]">Data</TableHead>
                                    <TableHead className="text-gray-400 w-[80px] text-right">Akcje</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredDocs.map((doc) => (
                                    <TableRow key={doc.id} className="border-white/5 hover:bg-white/5">
                                        <TableCell>
                                            <Badge variant="outline" className="capitalize border-white/20">
                                                {CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {doc.metadata?.source_file ? (
                                                <div className="flex items-center gap-1.5">
                                                    {doc.metadata.file_type === 'pdf' ? (
                                                        <FileText className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                                    ) : (
                                                        <File className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                                                    )}
                                                    <span className="text-xs text-slate-300 truncate max-w-[120px]" title={doc.metadata.source_file}>
                                                        {doc.metadata.source_file}
                                                    </span>
                                                    {doc.metadata.chunk_index !== undefined && (
                                                        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-white/10">
                                                            {doc.metadata.chunk_index + 1}/{doc.metadata.total_chunks}
                                                        </Badge>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-600">Tekst ręczny</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-md truncate">
                                            {doc.content}
                                        </TableCell>
                                        <TableCell className="text-sm text-gray-400">
                                            {new Date(doc.created_at).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                                onClick={() => handleDelete(doc.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredDocs.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center p-8 text-gray-500">
                                            Brak dokumentów w bazie wiedzy.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <ConfirmUI />
        </div>
    )
}

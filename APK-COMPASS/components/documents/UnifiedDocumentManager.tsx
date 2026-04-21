'use client'

import { useState, useEffect, useCallback } from 'react'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
    FileText,
    Download,
    Upload,
    History,
    Archive,
    Trash2,
    Plus,
    Search,
    Loader2,
    Calendar,
    User,
    Clock
} from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    uploadNewDocument,
    getUnifiedDocuments,
    archiveDocument,
    deleteDocument,
    uploadNewVersion,
    type DocumentCategory
} from '@/lib/actions/documents'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

interface UnifiedDocumentManagerProps {
    ownerId?: string
    isAdminView?: boolean
    allowedCategories?: DocumentCategory[]
    initialIsPublic?: boolean
    title?: string
}

export function UnifiedDocumentManager({ ownerId, isAdminView = false, allowedCategories, initialIsPublic = false }: UnifiedDocumentManagerProps) {
    const [documents, setDocuments] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [activeTab, setActiveTab] = useState<'all' | 'archived'>('all')
    const [isUploadOpen, setIsUploadOpen] = useState(false)
    const [isVersionOpen, setIsVersionOpen] = useState(false)
    const [selectedDoc, setSelectedDoc] = useState<any>(null)

    // Form states
    const [file, setFile] = useState<File | null>(null)
    const [title, setTitle] = useState('')
    const [category, setCategory] = useState<DocumentCategory>('other')
    const [changeSummary, setChangeSummary] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [confirm, ConfirmUI] = useConfirm()

    // Memoize category dependency to avoid infinite loops if array literal passed
    const categoriesDep = allowedCategories ? allowedCategories.join(',') : ''

    const loadDocuments = useCallback(async () => {
        setLoading(true)
        try {
            // If public mode, fetch public docs. ownerId might be null.
            const data = await getUnifiedDocuments(ownerId, initialIsPublic, allowedCategories?.[0])
            // Note: getUnifiedDocuments modified to accept isPublic
            if (Array.isArray(data)) {
                setDocuments(data)
            } else {
                setDocuments([])
            }
        } catch (err) {
            console.error('Failed to load documents:', err)
            setDocuments([])
        } finally {
            setLoading(false)
        }
    }, [ownerId, initialIsPublic, categoriesDep])

    useEffect(() => {
        loadDocuments()
    }, [loadDocuments])

    const handleUpload = async () => {
        if (!file || !title) return
        setSubmitting(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('title', title)
            formData.append('category', category)
            if (changeSummary) formData.append('changeSummary', changeSummary)
            formData.append('isPublic', initialIsPublic ? 'true' : 'false')

            await uploadNewDocument(formData)
            setIsUploadOpen(false)
            resetForm()
            await loadDocuments()
        } catch (err: any) {
            alert('Upload failed: ' + err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleNewVersion = async () => {
        if (!file || !selectedDoc) return
        setSubmitting(true)
        try {
            const formData = new FormData()
            formData.append('documentId', selectedDoc.id)
            formData.append('file', file)
            if (changeSummary) formData.append('changeSummary', changeSummary)

            await uploadNewVersion(formData)
            setIsVersionOpen(false)
            resetForm()
            await loadDocuments()
        } catch (err: any) {
            alert('Version upload failed: ' + err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleArchive = async (id: string) => {
        const ok = await confirm({
            title: 'Archiwizuj dokument',
            description: 'Czy na pewno chcesz zarchiwizować ten dokument?',
            confirmLabel: 'Archiwizuj',
        })
        if (!ok) return
        try {
            await archiveDocument(id)
            await loadDocuments()
        } catch (err: any) {
            alert('Archiving failed: ' + err.message)
        }
    }

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Trwałe usunięcie',
            description: 'Czy na pewno chcesz TRWALE usunąć ten dokument? Tej operacji nie można cofnąć.',
            confirmLabel: 'Usuń trwale',
            variant: 'destructive',
        })
        if (!ok) return
        try {
            await deleteDocument(id)
            await loadDocuments()
        } catch (err: any) {
            alert('Usuwanie nie powiodło się: ' + err.message)
        }
    }

    const resetForm = () => {
        setFile(null)
        setTitle('')
        setCategory('other')
        setChangeSummary('')
        setSelectedDoc(null)
    }

    const filteredDocs = documents.filter(doc => {
        const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesArchive = activeTab === 'archived' ? doc.is_archived : !doc.is_archived
        return matchesSearch && matchesArchive
    })

    const getCategoryBadge = (cat: string) => {
        const maps: Record<string, { label: string, color: string }> = {
            contract: { label: 'Kontrakt', color: 'bg-burgundy/10 text-foreground border-burgundy/20' },
            invoice: { label: 'Faktura', color: 'bg-primary/10 text-slate-200 border-primary/20' },
            certificate: { label: 'Certyfikat', color: 'bg-primary/10 text-primary border-primary/20' },
            onboarding: { label: 'Onboarding', color: 'bg-burgundy/10 text-primary border-burgundy/20' },
            benefit: { label: 'Benefit', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
            other: { label: 'Inny', color: 'bg-slate-600/10 text-slate-600 border-slate-600/20' }
        }
        const config = maps[cat] || maps.other
        return <Badge variant="outline" className={config.color}>{config.label}</Badge>
    }

    return (
        <div className="space-y-6">
            {/* Header / Controls */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-slate-900/40 p-4 rounded-xl border border-white/5 relative z-[100]">
                <div className="flex gap-2">
                    <Button
                        variant={activeTab === 'all' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTab('all')}
                        className="rounded-lg"
                    >
                        Aktywne
                    </Button>
                    <Button
                        variant={activeTab === 'archived' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTab('archived')}
                        className="rounded-lg"
                    >
                        Archiwum
                    </Button>
                </div>

                <div className="flex w-full md:w-auto gap-3">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                        <Input
                            placeholder="Szukaj dokumentów..."
                            className="pl-9 bg-white/5 border-white/10"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Show Add Button only if authorized */}
                    {(!initialIsPublic || isAdminView) && (
                        <Button
                            type="button"
                            className="bg-gradient-to-r from-foreground to-burgundy hover:opacity-90 relative z-10"
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setIsUploadOpen((prev) => !prev)
                                console.log('Toggling upload form:', !isUploadOpen)
                            }}
                        >
                            <Plus className={`w-4 h-4 mr-2 transition-transform ${isUploadOpen ? 'rotate-45' : ''}`} />
                            {isUploadOpen ? 'Anuluj' : 'Dodaj dokument'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Inline Upload Form */}
            {isUploadOpen && (
                <Card className="bg-slate-900/50 border-slate-200/30 animate-in slide-in-from-top-2 fade-in duration-300">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Upload className="w-5 h-5 text-slate-200" />
                                Nowy Dokument
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div className="space-y-2">
                                <Label>Tytuł dokumentu</Label>
                                <Input
                                    placeholder="np. Aneks do umowy B2B"
                                    className="bg-white/5 border-white/10"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Kategoria</Label>
                                <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                                    <SelectTrigger className="bg-white/5 border-white/10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        {(!allowedCategories || allowedCategories.includes('contract')) && <SelectItem value="contract">Kontrakt</SelectItem>}
                                        {(!allowedCategories || allowedCategories.includes('invoice')) && <SelectItem value="invoice">Faktura</SelectItem>}
                                        {(!allowedCategories || allowedCategories.includes('certificate')) && <SelectItem value="certificate">Certyfikat</SelectItem>}
                                        {(!allowedCategories || allowedCategories.includes('onboarding')) && <SelectItem value="onboarding">Onboarding</SelectItem>}
                                        {(!allowedCategories || allowedCategories.includes('benefit')) && <SelectItem value="benefit">Benefit</SelectItem>}
                                        {(!allowedCategories || allowedCategories.includes('other')) && <SelectItem value="other">Inny</SelectItem>}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div className="space-y-2">
                                <Label>Plik (PDF, DOCX)</Label>
                                <Input
                                    type="file"
                                    accept=".pdf,.docx"
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                    className="bg-white/5 border-white/10 cursor-pointer"
                                />
                            </div>

                            {isAdminView && initialIsPublic && (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20 h-fit mt-auto">
                                    <Checkbox
                                        id="public-mode"
                                        checked={initialIsPublic}
                                        disabled={true}
                                    />
                                    <Label htmlFor="public-mode" className="text-sm text-blue-200">
                                        Dokument publiczny (widoczny dla wszystkich)
                                    </Label>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
                            <Button variant="ghost" onClick={() => setIsUploadOpen(false)}>Anuluj</Button>
                            <Button
                                onClick={handleUpload}
                                disabled={submitting || !file || !title}
                                className="bg-burgundy hover:bg-foreground"
                            >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                                Wyślij do bazy
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Documents Grid */}
            <div className="grid grid-cols-1 gap-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                        <Loader2 className="w-10 h-10 animate-spin mb-4" />
                        <p>Ładowanie dokumentów...</p>
                    </div>
                ) : filteredDocs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-dashed border-white/10 rounded-2xl text-slate-600">
                        <FileText className="w-12 h-12 mb-4 opacity-10" />
                        <p>Brak dokumentów w tej kategorii.</p>
                    </div>
                ) : (
                    filteredDocs.map((doc) => (
                        <Card key={doc.id} className="bg-slate-900/50 border-white/5 hover:border-white/10 transition-all group overflow-hidden">
                            <CardContent className="p-0">
                                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-card to-background border border-white/10 flex items-center justify-center text-slate-200 shadow-inner group-hover:scale-110 transition-transform">
                                            <FileText className="w-6 h-6" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-slate-200 group-hover:text-white transition-colors">{doc.title}</h4>
                                                {getCategoryBadge(doc.category)}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-slate-600">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    v{doc.latest_version?.version_number || 1}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {(() => {
                                                        try {
                                                            return format(new Date(doc.created_at), 'dd MMM yyyy', { locale: pl })
                                                        } catch (e) {
                                                            return 'Data nieznana'
                                                        }
                                                    })()}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <User className="w-3 h-3" />
                                                    ID: {doc.owner_id.slice(0, 8)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {/* History / Versions Trigger */}
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="sm" className="text-slate-600 hover:text-white hover:bg-white/5">
                                                    <History className="w-4 h-4 mr-2" />
                                                    Historia
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="bg-slate-950 border-white/10 text-white sm:max-w-lg">
                                                <DialogHeader>
                                                    <DialogTitle>Historia Wersji: {doc.title}</DialogTitle>
                                                </DialogHeader>
                                                <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto pr-2">
                                                    {doc.versions?.sort((a: any, b: any) => b.version_number - a.version_number).map((ver: any) => (
                                                        <div key={ver.id} className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between group/ver">
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-bold text-slate-200">v{ver.version_number}</span>
                                                                    <span className="text-sm font-medium text-slate-200">{ver.file_name}</span>
                                                                </div>
                                                                <p className="text-[11px] text-slate-600 italic">"{ver.change_summary}"</p>
                                                                <p className="text-[10px] text-slate-600">
                                                                    {format(new Date(ver.created_at), 'Pp', { locale: pl })} • {(ver.file_size / 1024).toFixed(0)} KB
                                                                </p>
                                                            </div>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-8 w-8 text-slate-600 hover:text-slate-200"
                                                                asChild
                                                            >
                                                                <a href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/${ver.file_url}`} target="_blank" rel="noopener noreferrer">
                                                                    <Download className="w-4 h-4" />
                                                                </a>
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </DialogContent>
                                        </Dialog>

                                        {/* New Version Trigger */}
                                        {!doc.is_archived && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-slate-600 hover:text-white hover:bg-white/5"
                                                onClick={() => {
                                                    setSelectedDoc(doc)
                                                    setIsVersionOpen(true)
                                                }}
                                            >
                                                <Upload className="w-4 h-4 mr-2" />
                                                Nowa wersja
                                            </Button>
                                        )}

                                        <div className="w-px h-6 bg-white/10 mx-2 hidden md:block" />

                                        {/* Download Latest */}
                                        <Button
                                            size="sm"
                                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-200/30"
                                            asChild
                                        >
                                            <a href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/${doc.latest_version?.file_url}`} target="_blank" rel="noopener noreferrer">
                                                <Download className="w-4 h-4 mr-2" />
                                                Pobierz
                                            </a>
                                        </Button>

                                        {!doc.is_archived && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 text-slate-600 hover:text-amber-400 hover:bg-amber-400/10"
                                                onClick={() => handleArchive(doc.id)}
                                                title="Archiwizuj"
                                            >
                                                <Archive className="w-4 h-4" />
                                            </Button>
                                        )}
                                        {isAdminView && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 text-slate-600 hover:text-red-400 hover:bg-red-400/10"
                                                onClick={() => handleDelete(doc.id)}
                                                title="Usuń trwale"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* New Version Dialog */}
            <Dialog open={isVersionOpen} onOpenChange={(open) => !open && setIsVersionOpen(false)}>
                <DialogContent className="bg-slate-950 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle>Dodaj nową wersję</DialogTitle>
                        <DialogDescription>
                            Aktualizujesz dokument: {selectedDoc?.title}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nowy plik</Label>
                            <Input
                                type="file"
                                accept=".pdf,.docx"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                className="bg-white/5 border-white/10"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Co się zmieniło?</Label>
                            <Input
                                placeholder="np. aktualizacja terminów płatności"
                                className="bg-white/5 border-white/10"
                                value={changeSummary}
                                onChange={(e) => setChangeSummary(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsVersionOpen(false)}>Anuluj</Button>
                        <Button
                            onClick={handleNewVersion}
                            disabled={submitting || !file || !changeSummary}
                            className="bg-burgundy"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                            Aktualizuj
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmUI />
        </div>
    )
}

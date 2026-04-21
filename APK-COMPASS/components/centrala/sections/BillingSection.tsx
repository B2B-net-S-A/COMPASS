'use client'

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    History,
    FileCheck,
    Mail,
    Clock,
    DollarSign,
    Upload,
    Loader2,
    CheckCircle,
    XCircle,
    AlertCircle,
    FileText,
    Eye,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { submitInvoice, getMyInvoices, type Invoice } from "@/lib/actions/invoices"
import { toast } from "sonner"
import { toastSuccess } from "@/lib/toast-success"

interface BillingSectionProps {
    profileId: string
    initialData?: any[]
}

const STATUS_MAP: Record<string, { label: string, color: string }> = {
    submitted: { label: 'Wysłana', color: 'bg-primary/10 text-slate-200 border-primary/20' },
    verified: { label: 'Zweryfikowana', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    approved: { label: 'Zatwierdzona', color: 'bg-primary/10 text-primary border-primary/20' },
    paid: { label: 'Opłacona', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
    rejected: { label: 'Odrzucona', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const MONTHS = [
    'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
]

export function BillingSection({ profileId }: BillingSectionProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Form state
    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [amount, setAmount] = useState('')
    const [periodMonth, setPeriodMonth] = useState('')
    const [periodYear, setPeriodYear] = useState(new Date().getFullYear().toString())
    const [notes, setNotes] = useState('')
    const [selectedFile, setSelectedFile] = useState<File | null>(null)

    // Load invoices
    useEffect(() => {
        loadInvoices()
    }, [])

    const loadInvoices = async () => {
        setLoading(true)
        const { data, error } = await getMyInvoices()
        if (error) {
            toast.error('Nie udało się pobrać faktur')
        } else {
            setInvoices(data)
        }
        setLoading(false)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            toast.error('Akceptujemy tylko pliki PDF')
            e.target.value = ''
            return
        }

        if (file.size > 10 * 1024 * 1024) {
            toast.error('Plik jest za duży (max 10MB)')
            e.target.value = ''
            return
        }

        setSelectedFile(file)
    }

    const handleSubmit = async () => {
        if (!invoiceNumber || !amount || !periodMonth || !periodYear) {
            toast.error('Wypełnij wszystkie wymagane pola')
            return
        }

        setIsSubmitting(true)
        try {
            const formData = new FormData()
            formData.append('invoiceNumber', invoiceNumber)
            formData.append('amount', amount)
            formData.append('periodMonth', periodMonth)
            formData.append('periodYear', periodYear)
            if (notes) formData.append('notes', notes)
            if (selectedFile) formData.append('file', selectedFile)

            const result = await submitInvoice(formData)

            if (result.success) {
                toastSuccess('Faktura została przesłana!')
                // Reset form
                setInvoiceNumber('')
                setAmount('')
                setPeriodMonth('')
                setNotes('')
                setSelectedFile(null)
                setShowForm(false)
                if (fileInputRef.current) fileInputRef.current.value = ''
                // Reload list
                await loadInvoices()
            } else {
                toast.error(result.error || 'Błąd wysyłania faktury')
            }
        } catch (error) {
            console.error('Submit error:', error)
            toast.error('Wystąpił nieoczekiwany błąd')
        } finally {
            setIsSubmitting(false)
        }
    }

    // Suggest invoice number
    const suggestInvoiceNumber = () => {
        const now = new Date()
        const month = (periodMonth || (now.getMonth() + 1).toString()).padStart(2, '0')
        const year = periodYear || now.getFullYear()
        const count = invoices.filter(i =>
            i.period_month === parseInt(month) && i.period_year === parseInt(year.toString())
        ).length + 1
        return `FV/${year}/${month}/${count.toString().padStart(3, '0')}`
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
                {/* Main action card */}
                <Card className="bg-primary/10 border-primary/20 md:col-span-2 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                        <DollarSign className="w-32 h-32" />
                    </div>
                    <CardContent className="p-8 space-y-4">
                        <Badge variant="outline" className="bg-primary/20 border-primary/30 text-primary-foreground mb-2">Rozliczenia</Badge>
                        <h3 className="text-2xl font-bold text-white uppercase tracking-tight">System Rozliczeń B2B</h3>

                        {!showForm ? (
                            <>
                                <p className="text-sm text-gray-400 max-w-md">
                                    Zakończyłeś miesiąc pracy? Prześlij fakturę w formacie PDF.
                                    Pamiętaj o terminowym dostarczaniu dokumentów do 5-go dnia miesiąca.
                                </p>
                                <div className="pt-4">
                                    <Button
                                        className="bg-primary hover:bg-primary/80 gap-2 h-12 px-8 font-bold"
                                        onClick={() => {
                                            setInvoiceNumber(suggestInvoiceNumber())
                                            setShowForm(true)
                                        }}
                                    >
                                        <Upload className="w-5 h-5" /> WYŚLIJ NOWĄ FAKTURĘ
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4 pt-2">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-gray-400">Numer faktury *</Label>
                                        <Input
                                            value={invoiceNumber}
                                            onChange={(e) => setInvoiceNumber(e.target.value)}
                                            placeholder="FV/2026/02/001"
                                            className="bg-black/30 border-white/10 h-9"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-gray-400">Kwota netto (PLN) *</Label>
                                        <Input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="5000.00"
                                            min="0"
                                            step="0.01"
                                            className="bg-black/30 border-white/10 h-9"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-gray-400">Za miesiąc *</Label>
                                        <Select value={periodMonth} onValueChange={setPeriodMonth}>
                                            <SelectTrigger className="bg-black/30 border-white/10 h-9">
                                                <SelectValue placeholder="Wybierz miesiąc" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {MONTHS.map((m, i) => (
                                                    <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-gray-400">Rok *</Label>
                                        <Select value={periodYear} onValueChange={setPeriodYear}>
                                            <SelectTrigger className="bg-black/30 border-white/10 h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="2025">2025</SelectItem>
                                                <SelectItem value="2026">2026</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* File upload */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-gray-400">Plik PDF (max 10MB)</Label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept=".pdf"
                                            onChange={handleFileSelect}
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-white/10 hover:bg-white/5 gap-2"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <FileText className="w-4 h-4" />
                                            {selectedFile ? 'Zmień plik' : 'Wybierz PDF'}
                                        </Button>
                                        {selectedFile && (
                                            <span className="text-xs text-gray-400 truncate max-w-[200px]">
                                                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Notes */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-gray-400">Uwagi (opcjonalnie)</Label>
                                    <Input
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="np. praca zdalna, projekt XYZ"
                                        className="bg-black/30 border-white/10 h-9"
                                    />
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <Button
                                        className="bg-primary hover:bg-primary/80 gap-2 h-10 px-6 font-bold"
                                        onClick={handleSubmit}
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Wysyłanie...</>
                                        ) : (
                                            <><Upload className="w-4 h-4" /> Wyślij fakturę</>
                                        )}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="h-10 text-gray-400 hover:text-white"
                                        onClick={() => setShowForm(false)}
                                        disabled={isSubmitting}
                                    >
                                        Anuluj
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Company data card */}
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-6 space-y-6">
                        <div className="space-y-4">
                            <h4 className="text-[10px] text-muted-foreground uppercase font-black tracking-widest flex items-center gap-2">
                                <FileCheck className="w-3 h-3 text-primary" /> Dane do Faktury
                            </h4>
                            <div className="space-y-3 bg-black/20 p-4 rounded-lg border border-white/5">
                                <div className="space-y-1">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold">Nabywca</p>
                                    <p className="text-xs font-bold text-gray-200">B2B.net S.A.</p>
                                    <p className="text-[10px] text-gray-400">Aleje Jerozolimskie 180, 02-486 Warszawa</p>
                                    <p className="text-[10px] text-gray-400">NIP: 5711707392</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 pt-4 border-t border-white/5">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest flex items-center gap-2">
                                <Mail className="w-3 h-3 text-primary" /> Kontakt
                            </p>
                            <a href="mailto:faktury@b2bnetwork.pl" className="text-sm font-bold text-primary hover:underline">
                                faktury@b2bnetwork.pl
                            </a>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Invoice history — LIVE from Supabase */}
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-0">
                        <div className="p-4 border-b border-white/5 flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                <History className="w-4 h-4 text-primary" /> Historia Rozliczeń
                            </h4>
                            {invoices.length > 0 && (
                                <Badge variant="outline" className="text-[9px]">{invoices.length} faktur</Badge>
                            )}
                        </div>
                        <div className="divide-y divide-white/5 max-h-[350px] overflow-y-auto custom-scrollbar">
                            {loading ? (
                                <div className="p-12 text-center">
                                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground mb-2" />
                                    <p className="text-xs text-muted-foreground">Ładowanie...</p>
                                </div>
                            ) : invoices.length > 0 ? invoices.map((inv) => {
                                const statusInfo = STATUS_MAP[inv.status] || STATUS_MAP.submitted
                                return (
                                    <div key={inv.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors group">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 bg-black/20 rounded-lg group-hover:bg-primary/20 transition-colors">
                                                {inv.status === 'paid' ? (
                                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                                ) : inv.status === 'rejected' ? (
                                                    <XCircle className="w-4 h-4 text-red-400" />
                                                ) : (
                                                    <FileCheck className="w-4 h-4 text-gray-400 group-hover:text-primary" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-200">{inv.invoice_number}</p>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {new Date(inv.created_at).toLocaleDateString('pl-PL')} • {Number(inv.amount).toLocaleString('pl-PL')} PLN
                                                    {inv.period_month && inv.period_year && (
                                                        <> • {MONTHS[inv.period_month - 1]} {inv.period_year}</>
                                                    )}
                                                </p>
                                                {inv.status === 'rejected' && inv.rejection_reason && (
                                                    <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" /> {inv.rejection_reason}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {inv.file_url && (
                                                <a href={inv.file_url} target="_blank" rel="noopener noreferrer" title="Podgląd PDF">
                                                    <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors" />
                                                </a>
                                            )}
                                            <Badge variant="outline" className={`${statusInfo.color} border px-2 py-0.5 text-[9px]`}>
                                                {statusInfo.label}
                                            </Badge>
                                        </div>
                                    </div>
                                )
                            }) : (
                                <div className="p-12 text-center">
                                    <DollarSign className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                                    <p className="text-sm text-muted-foreground italic">Brak zarejestrowanych faktur.</p>
                                    <p className="text-xs text-muted-foreground mt-1">Kliknij &quot;Wyślij nową fakturę&quot; aby dodać pierwszą.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Important dates */}
                <Card className="bg-white/5 border-white/10 p-6">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Ważne Terminy
                    </h4>
                    <div className="space-y-6">
                        {[
                            { day: '05', title: 'Wystawienie faktury', desc: 'Ostatni dzień na przesłanie PDF do księgowości.' },
                            { day: '10', title: 'Weryfikacja deklaracji', desc: 'Zatwierdzenie benefitów i ubezpieczeń na kolejny miesiąc.' },
                            { day: '21', title: 'Data płatności', desc: 'Standardowy termin realizacji przelewów (zgodnie z umową).' }
                        ].map((item) => (
                            <div key={item.day} className="flex gap-4">
                                <div className="h-10 w-10 shrink-0 rounded bg-white/5 border border-white/10 flex flex-col items-center justify-center">
                                    <span className="text-sm font-black text-white leading-none">{item.day}</span>
                                    <span className="text-[8px] uppercase text-muted-foreground font-bold">DZIEŃ</span>
                                </div>
                                <div>
                                    <h5 className="text-sm font-bold text-gray-200 mb-0.5">{item.title}</h5>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    )
}

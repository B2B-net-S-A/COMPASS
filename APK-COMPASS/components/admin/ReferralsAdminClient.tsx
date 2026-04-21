'use client'

import { useState, useTransition, useMemo } from 'react'
import { ProjectReferral, ReferralStatus } from '@/lib/types'
import { updateReferralStatus } from '@/lib/actions/referrals'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Clock,
    User,
    Building2,
    FileText,
    CheckCircle2,
    XCircle,
    Search,
    Filter,
    ArrowRight,
    MoreHorizontal,
    Briefcase,
    Mail,
    Phone,
    Linkedin,
    Plus,
    UserPlus,
    UserCheck,
    Users,
    TrendingUp,
    Target
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { cn } from '@/lib/utils'
import { ReferralWizard } from '@/components/referrals/ReferralWizard'
import { useRouter } from 'next/navigation'

type WizardMode = 'consultant_to_project' | 'external_to_project' | 'external_to_pool' | null

interface ReferralsAdminClientProps {
    initialReferrals: ProjectReferral[]
}

export function ReferralsAdminClient({ initialReferrals }: ReferralsAdminClientProps) {
    const [referrals, setReferrals] = useState<ProjectReferral[]>(initialReferrals)
    const [filter, setFilter] = useState<string>('all')
    const [search, setSearch] = useState('')
    const [, startTransition] = useTransition()
    const [wizardOpen, setWizardOpen] = useState(false)
    const [wizardMode, setWizardMode] = useState<WizardMode>(null)
    const router = useRouter()

    // Stats
    const stats = useMemo(() => {
        const s = { total: referrals.length, new: 0, in_review: 0, accepted: 0, rejected: 0, hired: 0, withdrawn: 0 }
        for (const r of referrals) {
            if (r.status in s) s[r.status as keyof typeof s]++
        }
        return s
    }, [referrals])

    const openWizard = (mode: WizardMode) => {
        setWizardMode(mode)
        setWizardOpen(true)
    }

    const handleWizardClose = (open: boolean) => {
        setWizardOpen(open)
        if (!open) {
            setWizardMode(null)
            // Refresh data after wizard closes
            router.refresh()
        }
    }

    const filteredReferrals = referrals.filter(ref => {
        const matchesFilter = filter === 'all' || ref.status === filter
        const matchesSearch =
            ref.candidate_name?.toLowerCase().includes(search.toLowerCase()) ||
            ref.project?.title?.toLowerCase().includes(search.toLowerCase()) ||
            ref.referrer?.full_name?.toLowerCase().includes(search.toLowerCase())
        return matchesFilter && matchesSearch
    })

    const handleStatusUpdate = (id: string, newStatus: ReferralStatus) => {
        let reason = ''
        if (newStatus === 'rejected') {
            reason = prompt('Podaj powód odrzucenia (opcjonalnie):') || ''
        }

        startTransition(async () => {
            try {
                await updateReferralStatus(id, newStatus, reason)
                setReferrals(prev => prev.map(r => r.id === id ? { ...r, status: newStatus, rejection_reason: reason } : r))
                toastSuccess('Status zaktualizowany.')
            } catch (err: any) {
                toast.error(err.message || 'Błąd aktualizacji.')
            }
        })
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'new': return <Badge variant="secondary" className="bg-primary/20 text-slate-200 border-primary/30">Nowy</Badge>
            case 'in_review': return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">W weryfikacji</Badge>
            case 'accepted': return <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">Zaakceptowany</Badge>
            case 'rejected': return <Badge variant="secondary" className="bg-red-500/20 text-red-400 border-red-500/30">Odrzucony</Badge>
            case 'hired': return <Badge variant="secondary" className="bg-primary text-white border-0">Zatrudniony</Badge>
            case 'withdrawn': return <Badge variant="outline" className="text-slate-600 border-slate-800">Wycofany</Badge>
            default: return <Badge variant="outline">{status}</Badge>
        }
    }

    return (
        <div className="space-y-4">
            {/* Stats Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {[
                    { label: 'Wszystkie', value: stats.total, color: 'text-white', bg: 'bg-white/5', border: 'border-white/10' },
                    { label: 'Nowe', value: stats.new, color: 'text-slate-200', bg: 'bg-primary/10', border: 'border-primary/20' },
                    { label: 'W weryfikacji', value: stats.in_review, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
                    { label: 'Zaakceptowane', value: stats.accepted, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
                    { label: 'Odrzucone', value: stats.rejected, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
                    { label: 'Zatrudnieni', value: stats.hired, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
                ].map((s) => (
                    <div key={s.label} className={cn("p-4 rounded-xl border text-center", s.bg, s.border)}>
                        <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
                        <div className="text-[10px] text-slate-600 uppercase tracking-wider mt-1">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Quick Actions - 3 referral variants */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                    onClick={() => openWizard('consultant_to_project')}
                    className="flex items-center gap-4 p-4 rounded-xl border border-burgundy/20 bg-burgundy/5 hover:bg-burgundy/15 hover:border-burgundy/40 transition-all group text-left"
                >
                    <div className="w-12 h-12 rounded-xl bg-burgundy/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <UserCheck className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-white group-hover:text-foreground transition-colors">Zgłoś konsultanta do projektu</h3>
                        <p className="text-xs text-slate-600 mt-0.5">Wybierz konsultanta z bazy Compass i przypisz do projektu</p>
                    </div>
                </button>

                <button
                    onClick={() => openWizard('external_to_project')}
                    className="flex items-center gap-4 p-4 rounded-xl border border-slate-200/20 bg-slate-200/5 hover:bg-slate-200/15 hover:border-slate-200/40 transition-all group text-left"
                >
                    <div className="w-12 h-12 rounded-xl bg-slate-200/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <UserPlus className="w-6 h-6 text-slate-200" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-white group-hover:text-foreground transition-colors">Poleć osobę zewnętrzną do projektu</h3>
                        <p className="text-xs text-slate-600 mt-0.5">Zarekomenduj kogoś spoza bazy do konkretnego projektu</p>
                    </div>
                </button>

                <button
                    onClick={() => openWizard('external_to_pool')}
                    className="flex items-center gap-4 p-4 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/15 hover:border-primary/40 transition-all group text-left"
                >
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Users className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-white group-hover:text-primary transition-colors">Poleć osobę do puli talentów</h3>
                        <p className="text-xs text-slate-600 mt-0.5">Dodaj talent do bazy bez przypisania do projektu</p>
                    </div>
                </button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    {['all', 'new', 'in_review', 'accepted', 'rejected', 'hired'].map((s) => (
                        <Button
                            key={s}
                            variant={filter === s ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilter(s)}
                            className={cn(
                                "text-xs whitespace-nowrap",
                                filter === s ? "bg-burgundy hover:bg-slate-200" : "border-white/10 text-slate-600"
                            )}
                        >
                            {s === 'all' ? 'Wszystkie' :
                                s === 'new' ? 'Nowe' :
                                    s === 'in_review' ? 'Weryfikacja' :
                                        s === 'accepted' ? 'Zaakceptowane' :
                                            s === 'rejected' ? 'Odrzucone' : 'Zatrudnieni'}
                        </Button>
                    ))}
                </div>
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <Input
                        placeholder="Szukaj..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 bg-black/20 border-white/10 text-sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {filteredReferrals.length === 0 ? (
                    <div className="p-20 text-center bg-white/5 rounded-xl border border-white/10">
                        <Filter className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                        <p className="text-slate-600">Brak rekomendacji spełniających kryteria.</p>
                    </div>
                ) : (
                    filteredReferrals.map((ref) => (
                        <Card key={ref.id} className="bg-slate-900 border-white/10 hover:border-white/20 transition-all overflow-hidden group">
                            <CardContent className="p-0">
                                <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
                                    {/* Candidate Info */}
                                    <div className="p-5 space-y-3 lg:col-span-1">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h3 className="font-bold text-white text-lg">
                                                    {ref.referral_type === 'self_referral' ? 'Zgłoszenie własne' : ref.candidate_name}
                                                </h3>
                                                <div className="text-xs text-slate-600 mt-1">
                                                    ID: {ref.id.substring(0, 8)}
                                                </div>
                                            </div>
                                            {getStatusBadge(ref.status)}
                                        </div>

                                        <div className="space-y-2 pt-2">
                                            {ref.candidate_email && (
                                                <div className="flex items-center gap-2 text-xs text-slate-300">
                                                    <Mail className="w-3 h-3 text-slate-200" /> {ref.candidate_email}
                                                </div>
                                            )}
                                            {ref.candidate_phone && (
                                                <div className="flex items-center gap-2 text-xs text-slate-300">
                                                    <Phone className="w-3 h-3 text-slate-200" /> {ref.candidate_phone}
                                                </div>
                                            )}
                                            {ref.candidate_linkedin && (
                                                <a href={ref.candidate_linkedin} target="_blank" className="flex items-center gap-2 text-xs text-slate-200 hover:underline">
                                                    <Linkedin className="w-3 h-3" /> LinkedIn Profil
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {/* Project & Referrer Info */}
                                    <div className="p-5 space-y-4 lg:col-span-2">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Projekt</label>
                                                <div className="bg-white/5 p-3 rounded-lg border border-white/5 group-hover:border-slate-200/30 transition-colors">
                                                    <div className="text-sm font-medium text-white line-clamp-1">{ref.project?.title}</div>
                                                    <div className="text-[10px] text-slate-600 mt-1 flex items-center gap-1">
                                                        <Building2 className="w-3 h-3" /> AK Qualrix
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Polecający</label>
                                                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                                    <div className="text-sm font-medium text-white">{ref.referrer?.full_name || 'System User'}</div>
                                                    <div className="text-[10px] text-slate-600 mt-1 flex items-center gap-1">
                                                        <User className="w-3 h-3" /> {ref.referrer?.job_title || 'Konsultant'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                                            <label className="text-[10px] text-slate-600 uppercase font-bold tracking-wider block mb-1">
                                                {ref.referral_type === 'self_referral' ? 'Szczegóły zgłoszenia' : 'Uzasadnienie polecenia'}
                                            </label>
                                            <p className="text-xs text-slate-300 line-clamp-2 italic">
                                                {ref.referral_type === 'self_referral'
                                                    ? `Stawka: ${ref.desired_rate_min}-${ref.desired_rate_max} PLN/h | Start: ${ref.available_from} | ${ref.self_referral_note || ''}`
                                                    : ref.recommendation_note || 'Brak dodatkowego uzasadnienia.'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="p-5 flex flex-col justify-between lg:col-span-1">
                                        <div className="space-y-2">
                                            <div className="text-xs text-slate-600 flex items-center gap-1 mb-3">
                                                <Clock className="w-3 h-3" /> {new Date(ref.created_at).toLocaleString('pl-PL')}
                                            </div>

                                            {ref.cv_file_url && (
                                                <Button variant="outline" size="sm" className="w-full text-xs border-slate-200/30 text-slate-200 hover:bg-slate-200/10 mb-2">
                                                    <FileText className="w-3 h-3 mr-2" /> Otwórz CV
                                                </Button>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="sm" className="flex-1 text-xs border-white/10 text-slate-600">
                                                        Akcje <MoreHorizontal className="w-3 h-3 ml-2" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="bg-slate-900 border-white/10 text-white">
                                                    <DropdownMenuLabel>Zmień status</DropdownMenuLabel>
                                                    <DropdownMenuSeparator className="bg-white/5" />
                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(ref.id, 'in_review')} className="text-xs hover:bg-white/5">
                                                        <Clock className="w-3 h-3 mr-2 text-yellow-500" /> Analiza
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(ref.id, 'accepted')} className="text-xs hover:bg-white/5">
                                                        <CheckCircle2 className="w-3 h-3 mr-2 text-green-500" /> Zaakceptuj
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(ref.id, 'rejected')} className="text-xs text-red-400 hover:bg-white/5">
                                                        <XCircle className="w-3 h-3 mr-2" /> Odrzuć
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator className="bg-white/5" />
                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(ref.id, 'hired')} className="text-xs font-bold text-primary hover:bg-white/5">
                                                        <Briefcase className="w-3 h-3 mr-2" /> Zatrudnij
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>

                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-white" asChild>
                                                <a href={`/admin/candidates/${ref.id}`} title="Przejdź do kandydata">
                                                    <ArrowRight className="w-4 h-4" />
                                                </a>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* ReferralWizard - rendered based on wizardMode */}
            {wizardMode === 'consultant_to_project' && (
                <ReferralWizard
                    isOpen={wizardOpen}
                    onOpenChange={handleWizardClose}
                    isAdmin={true}
                    initialContext="project"
                />
            )}
            {wizardMode === 'external_to_project' && (
                <ReferralWizard
                    isOpen={wizardOpen}
                    onOpenChange={handleWizardClose}
                    isAdmin={true}
                    initialContext="project"
                />
            )}
            {wizardMode === 'external_to_pool' && (
                <ReferralWizard
                    isOpen={wizardOpen}
                    onOpenChange={handleWizardClose}
                    isAdmin={true}
                    initialContext="general"
                />
            )}
        </div>
    )
}

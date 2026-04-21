'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    UserCheck,
    Stethoscope,
    CreditCard,
    Laptop,
    Users,
    ShieldCheck,
    FileText,
    Bell,
    ChevronRight,
    Search
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
    Dialog as ShadcnDialog,
    DialogContent as ShadcnDialogContent,
    DialogHeader as ShadcnDialogHeader,
    DialogTitle as ShadcnDialogTitle,
    DialogDescription as ShadcnDialogDescription
} from "@/components/ui/dialog"
import { useState, useEffect } from "react"
import { getCentralaData } from "@/lib/actions/centrala"

// Import sections
import { RecruiterSection } from "./sections/RecruiterSection"
import { BenefitsSection } from "./sections/BenefitsSection"
import { BillingSection } from "./sections/BillingSection"
import { EquipmentSection } from "./sections/EquipmentSection"
import { ReferralsSection } from "./sections/ReferralsSection"
import { DocumentsSection } from "./sections/DocumentsSection"
import { CompassAssistWidget } from "./CompassAssistWidget"

const centralaSections = [
    {
        id: 'ambassador',
        title: 'AMBASADOR - REKRUTER',
        subtitle: 'Twój opiekun w B2B.net',
        icon: UserCheck,
        color: 'from-primary/20 to-foreground/20',
        borderColor: 'border-primary/30',
        textColor: 'text-slate-200'
    },
    {
        id: 'benefits',
        title: 'BENEFITY',
        subtitle: 'Medycyna i Sport',
        icon: Stethoscope,
        color: 'from-green-500/20 to-primary/20',
        borderColor: 'border-green-500/30',
        textColor: 'text-green-400'
    },
    {
        id: 'billing',
        title: 'ROZLICZENIA FINANSOWE',
        subtitle: 'Faktury i terminy',
        icon: CreditCard,
        color: 'from-burgundy/20 to-pink-500/20',
        borderColor: 'border-burgundy/30',
        textColor: 'text-primary'
    },
    {
        id: 'equipment',
        title: 'SPRZĘT I ZAKUPY',
        subtitle: 'Hardware i biuro',
        icon: Laptop,
        color: 'from-orange-500/20 to-yellow-500/20',
        borderColor: 'border-orange-500/30',
        textColor: 'text-orange-400'
    },
    {
        id: 'referrals',
        title: 'REKOMENDACJE',
        subtitle: 'Program poleceń',
        icon: Users,
        color: 'from-burgundy/20 to-primary/20',
        borderColor: 'border-burgundy/30',
        textColor: 'text-foreground'
    },
    {
        id: 'documents',
        title: 'CENTRUM DOKUMENTÓW',
        subtitle: 'Biblioteka Formularzy',
        icon: FileText,
        color: 'from-gray-500/20 to-muted-foreground/20',
        borderColor: 'border-gray-500/30',
        textColor: 'text-gray-400'
    }
]

interface CentralaDashboardProps {
    profileId: string
}

export function CentralaDashboard({ profileId }: CentralaDashboardProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedSection, setSelectedSection] = useState<string | null>(null)
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchData() {
            try {
                const result = await getCentralaData(profileId)
                setData(result)
            } catch (error) {
                console.error("Error fetching centrala data:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [profileId])

    const filteredSections = centralaSections.filter(section =>
        section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        section.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const renderSectionContent = () => {
        switch (selectedSection) {
            case 'ambassador': return <RecruiterSection />
            case 'benefits': return <BenefitsSection profileId={profileId} initialData={data?.benefits} />
            case 'billing': return <BillingSection profileId={profileId} initialData={data?.invoices} />
            case 'equipment': return <EquipmentSection profileId={profileId} initialData={data?.equipment} />
            case 'referrals': return <ReferralsSection profileId={profileId} initialData={data?.referrals} />
            case 'documents': return <DocumentsSection />
            default: return null
        }
    }

    const currentSection = centralaSections.find(s => s.id === selectedSection)

    if (loading) {
        return <div className="p-8 text-center text-gray-500 animate-pulse">Ładowanie danych Centrali...</div>
    }

    return (
        <div className="space-y-8 pb-12">
            {/* Header & Stats */}
            <div className="grid gap-6 md:grid-cols-4">
                <Card className="bg-card border-white/10 overflow-hidden relative group">
                    <div className="absolute inset-0 bg-gradient-to-br from-foreground/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-2">
                        <p className="text-xs text-muted-foreground uppercase font-semibold">Status Pakiety</p>
                        <CardTitle className="text-2xl font-bold flex items-center justify-between">
                            {data?.benefits?.length > 0 ? "Aktywny" : "Brak"}
                            <Stethoscope className={`w-5 h-5 ${data?.benefits?.length > 0 ? "text-green-400" : "text-gray-500"}`} />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            {data?.benefits?.[0]?.variant || "Brak aktywnego pakietu"}
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                            <Badge variant="secondary" className="bg-green-500/10 text-green-400 text-[10px]">Do 19-go</Badge>
                            <span className="text-[10px] text-muted-foreground italic">Czas na deklarację</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card border-white/10 overflow-hidden relative group">
                    <CardHeader className="pb-2">
                        <p className="text-xs text-muted-foreground uppercase font-semibold">Rozliczenia</p>
                        <CardTitle className="text-2xl font-bold flex items-center justify-between">
                            {data?.invoices?.length > 0 ? "OK" : "--"}
                            <CreditCard className="w-5 h-5 text-primary" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            {data?.invoices?.length > 0 ? "Ostatnia faktura opłacona" : "Brak historii faktur"}
                        </p>
                        <div className="mt-4 overflow-hidden h-1.5 bg-secondary/30 rounded-full">
                            <div className="h-full bg-burgundy w-[100%]" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card border-white/10 overflow-hidden relative group">
                    <CardHeader className="pb-2">
                        <p className="text-xs text-muted-foreground uppercase font-semibold">Sprzęt</p>
                        <CardTitle className="text-2xl font-bold flex items-center justify-between">
                            {data?.equipment?.length || 0} Zgłosz.
                            <Laptop className="w-5 h-5 text-orange-400" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            {data?.equipment?.[0]?.item_name || "Brak zgłoszeń"}
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${data?.equipment?.length > 0 ? "bg-orange-500 animate-pulse" : "bg-gray-600"}`} />
                            <span className="text-[10px] text-orange-500 font-medium italic">Status aktualizowany na bieżąco</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card border-white/10 overflow-hidden relative group">
                    <CardHeader className="pb-2">
                        <p className="text-xs text-muted-foreground uppercase font-semibold">Dokumenty PL</p>
                        <CardTitle className="text-2xl font-bold flex items-center justify-between">
                            95%
                            <ShieldCheck className="w-5 h-5 text-primary" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">Brak 1 skanu oryginału</p>
                        <Progress value={95} className="mt-4 h-1.5" />
                    </CardContent>
                </Card>
            </div>

            {/* Quick Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    type="text"
                    placeholder="Czego szukasz w Centrali? (np. PZU, Faktura, Rekruter...)"
                    className="w-full bg-card border border-white/10 rounded-xl py-4 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all shadow-xl"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Main Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {filteredSections.map((section) => {
                    const Icon = section.icon
                    return (
                        <Card
                            key={section.id}
                            onClick={() => setSelectedSection(section.id)}
                            className={`bg-card ${section.borderColor} hover:scale-[1.02] transition-all cursor-pointer overflow-hidden relative group h-48 border-2`}
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${section.color} opacity-30 group-hover:opacity-50 transition-opacity`} />

                            <CardContent className="p-6 h-full flex flex-col justify-between relative z-10">
                                <div className="flex items-start justify-between">
                                    <div className={`p-3 rounded-xl bg-black/20 ${section.textColor}`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-600 group-hover:translate-x-1 transition-transform" />
                                </div>

                                <div>
                                    <h3 className="font-bold text-white text-lg leading-tight uppercase tracking-wide">
                                        {section.title}
                                    </h3>
                                    <p className="text-sm text-gray-400 mt-1">
                                        {section.subtitle}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* Notifications / Alerts */}
            <Card className="bg-red-500/10 border-red-500/20 overflow-hidden relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50" />
                <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-red-500/20 rounded-lg text-red-500">
                            <Bell className="w-5 h-5 animate-bounce" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-red-400">WAŻNE: Termin zgłoszeń benefitów upływa za 3 dni!</p>
                            <p className="text-xs text-gray-500">Złóż deklarację PZU do 19 dnia miesiąca, aby zachować ciągłość ubezpieczenia.</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => setSelectedSection('benefits')}>
                        Złóż teraz
                    </Button>
                </CardContent>
            </Card>

            {/* Section Detail Dialog */}
            <ShadcnDialog open={!!selectedSection} onOpenChange={(open) => !open && setSelectedSection(null)}>
                <ShadcnDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-950 border-white/10 text-white">
                    <ShadcnDialogHeader className="border-b border-white/10 pb-4 mb-6">
                        <div className="flex items-center gap-3">
                            {currentSection && (
                                <div className={`p-2 rounded-lg bg-black/20 ${currentSection.textColor}`}>
                                    <currentSection.icon className="w-5 h-5" />
                                </div>
                            )}
                            <div>
                                <ShadcnDialogTitle className="text-xl font-bold uppercase tracking-tight">
                                    {currentSection?.title}
                                </ShadcnDialogTitle>
                                <ShadcnDialogDescription className="text-gray-400 text-xs">
                                    {currentSection?.subtitle}
                                </ShadcnDialogDescription>
                            </div>
                        </div>
                    </ShadcnDialogHeader>

                    {renderSectionContent()}
                </ShadcnDialogContent>
            </ShadcnDialog>

            {/* Compass Assist AI Widget */}
            <CompassAssistWidget profileId={profileId} />
        </div>
    )
}

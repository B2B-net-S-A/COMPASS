'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    UserCheck,
    Stethoscope,
    CreditCard,
    Laptop,
    FileText,
    Users
} from "lucide-react"
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
import { RecruiterSection } from "@/components/centrala/sections/RecruiterSection"
import { BenefitsSection } from "@/components/centrala/sections/BenefitsSection"
import { BillingSection } from "@/components/centrala/sections/BillingSection"
import { EquipmentSection } from "@/components/centrala/sections/EquipmentSection"
import { ReferralsSection } from "@/components/centrala/sections/ReferralsSection"
import { DocumentsSection } from "@/components/centrala/sections/DocumentsSection"

// Configuration
const centralaSections = [
    {
        id: 'ambassador',
        title: 'Ambasador',
        subtitle: 'Twój opiekun',
        icon: UserCheck,
        color: 'text-slate-200',
        bg: 'bg-primary/10'
    },
    {
        id: 'benefits',
        title: 'Benefity',
        subtitle: 'Medycyna/Sport',
        icon: Stethoscope,
        color: 'text-green-400',
        bg: 'bg-green-500/10'
    },
    {
        id: 'billing',
        title: 'Finanse',
        subtitle: 'Faktury',
        icon: CreditCard,
        color: 'text-primary',
        bg: 'bg-burgundy/10'
    },
    {
        id: 'equipment',
        title: 'Sprzęt',
        subtitle: 'Hardware',
        icon: Laptop,
        color: 'text-orange-400',
        bg: 'bg-orange-500/10'
    },
    {
        id: 'documents',
        title: 'Dokumenty',
        subtitle: 'Wnioski',
        icon: FileText,
        color: 'text-gray-400',
        bg: 'bg-gray-500/10'
    },
    {
        id: 'referrals',
        title: 'Polecenia',
        subtitle: 'Rekomenduj',
        icon: Users,
        color: 'text-foreground',
        bg: 'bg-burgundy/10'
    }
]

const categories = [
    { title: "Twoje Biuro", items: ['ambassador', 'equipment', 'billing'] },
    { title: "Rozwój i Benefity", items: ['benefits', 'referrals', 'documents'] },
]

interface CentralaServicesWidgetProps {
    profileId: string
}

export function CentralaServicesWidget({ profileId }: CentralaServicesWidgetProps) {
    const [selectedSection, setSelectedSection] = useState<string | null>(null)
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchData() {
            if (!profileId) return
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

    const getStatus = (id: string) => {
        if (!data) return null
        switch (id) {
            case 'benefits':
                return data.benefits?.length > 0 ? { label: 'Aktywny', color: 'bg-green-500/20 text-green-400' } : null
            case 'billing':
                return data.invoices?.length > 0 ? { label: 'OK', color: 'bg-burgundy/20 text-primary' } : null
            case 'equipment':
                return data.equipment?.length > 0 ? { label: `${data.equipment.length} szt.`, color: 'bg-orange-500/20 text-orange-400' } : null
            case 'referrals':
                return { label: 'Nowe!', color: 'bg-pink-500/20 text-pink-400' }
            default:
                return null
        }
    }

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

    return (
        <Card className="bg-white/5 border-white/10 card-hover">
            <CardHeader className="pb-4 border-b border-white/5">
                <CardTitle className="text-lg font-semibold flex items-center justify-between">
                    Usługi Centrali
                    <span className="text-xs font-normal text-slate-600 bg-white/5 px-2 py-1 rounded-md">
                        {loading ? 'Ładowanie...' : 'Bento Grid'}
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {categories.map((cat, idx) => (
                        <div key={idx} className="space-y-4">
                            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1 flex items-center gap-2">
                                <div className="w-1 h-1 rounded-full bg-slate-600" />
                                {cat.title}
                            </h3>
                            <div className="space-y-3">
                                {cat.items.map(itemId => {
                                    const item = centralaSections.find(s => s.id === itemId)
                                    if (!item) return null
                                    const Icon = item.icon
                                    const status = getStatus(item.id)

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedSection(item.id)}
                                            className="flex items-start gap-3 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer group relative overflow-hidden"
                                        >
                                            {/* Hover Glow */}
                                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

                                            <div className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.bg} group-hover:scale-110 transition-transform`}>
                                                <Icon className={`w-4 h-4 ${item.color}`} />
                                            </div>

                                            <div className="flex-1 min-w-0 z-10">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                                                        {item.title}
                                                    </h4>
                                                    {status && (
                                                        <span className={`text-[9px] px-1.5 py-px rounded-full font-medium ${status.color}`}>
                                                            {status.label}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-slate-600 mt-0.5 truncate group-hover:text-slate-600 transition-colors">
                                                    {item.subtitle}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>

            {/* Dialog */}
            <ShadcnDialog open={!!selectedSection} onOpenChange={(open) => !open && setSelectedSection(null)}>
                <ShadcnDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-950 border-white/10 text-white">
                    <ShadcnDialogHeader className="border-b border-white/10 pb-4 mb-6">
                        <div className="flex items-center gap-3">
                            {currentSection && (
                                <div className={`p-2 rounded-lg bg-black/20 ${currentSection.bg}`}>
                                    <currentSection.icon className={`w-5 h-5 ${currentSection.color}`} />
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
        </Card>
    )
}

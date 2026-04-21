'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from "@/components/ui/card"
import dynamic from 'next/dynamic'

import {
    FileText,
    Activity,
    Laptop,
    Users,
    Award,
    CreditCard,
    UserCheck,
    Stethoscope
} from "lucide-react"
import {
    Dialog as ShadcnDialog,
    DialogContent as ShadcnDialogContent,
    DialogHeader as ShadcnDialogHeader,
    DialogTitle as ShadcnDialogTitle,
    DialogDescription as ShadcnDialogDescription
} from "@/components/ui/dialog"

// Lazy load heavy components for better performance
const BenefitsSection = dynamic(() => import("@/components/centrala/sections/BenefitsSection").then(mod => ({ default: mod.BenefitsSection })), {
    loading: () => <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
})

const EquipmentSection = dynamic(() => import("@/components/centrala/sections/EquipmentSection").then(mod => ({ default: mod.EquipmentSection })), {
    loading: () => <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
})

const UnifiedDocumentManager = dynamic(() => import("@/components/documents/UnifiedDocumentManager").then(mod => ({ default: mod.UnifiedDocumentManager })), {
    loading: () => <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
})

// Import lightweight sections normally
import { RecruiterSection } from "@/components/centrala/sections/RecruiterSection"
import { BillingSection } from "@/components/centrala/sections/BillingSection"
import { ReferralsSection } from "@/components/centrala/sections/ReferralsSection"
import { NotificationCenterWidget } from "@/components/dashboard/NotificationCenterWidget"

// Configuration mapping real services to Hub Layout
const serviceApps = [
    { id: 'billing', title: 'Faktury', icon: CreditCard, color: 'bg-primary', desc: 'Rozliczenia B2B' },
    { id: 'documents', title: 'Dokumenty', icon: FileText, color: 'bg-burgundy', desc: 'Wnioski i druki' },
    { id: 'benefits', title: 'Benefity', icon: Stethoscope, color: 'bg-green-500', desc: 'Medicover/Sport' },
    { id: 'equipment', title: 'Sprzęt', icon: Laptop, color: 'bg-orange-500', desc: 'Twój hardware' },
    { id: 'ambassador', title: 'Opiekun', icon: UserCheck, color: 'bg-burgundy', desc: 'Kontakt HR' },
    // { id: 'referrals', title: 'Polecenia', icon: Users, color: 'bg-pink-500', desc: 'Program partnerski' }, // Moved to "Discovery"
]

const discoveryCards = [
    {
        id: 'referrals',
        title: 'Rekomendacje',
        subtitle: 'Zgarnij 3000 PLN za każdego specjalistę',
        icon: Users,
        color: 'bg-pink-500',
        gradient: 'from-pink-500/10 to-rose-500/10 border-pink-500/20'
    },
    {
        id: 'training', // Placeholder for now or separate section
        title: 'Strefa Rozwoju',
        subtitle: 'Dostępne budżety szkoleniowe Q1',
        icon: Award,
        color: 'bg-slate-200',
        gradient: 'from-foreground/10 to-primary/10 border-slate-200/20'
    }
]

interface ServiceHubViewProps {
    stats: any
    notifications: any[]
}

export function ServiceHubView({ stats, notifications }: ServiceHubViewProps) {
    const router = useRouter()
    const [selectedSection, setSelectedSection] = useState<string | null>(null)

    // Helper to extract data safely
    const profileId = stats?.profile?.id
    const userRole = stats?.profile?.role
    const isAdmin = ['admin', 'administrator', 'centrala'].includes(userRole || '')

    const renderSectionContent = () => {
        if (!profileId) return <div className="p-4 text-center">Brak identyfikatora profilu. Odśwież stronę.</div>

        switch (selectedSection) {
            case 'ambassador': return <RecruiterSection />
            // Note: BenefitsSection and others fetch their own data or need it passed. 
            // Previous CentralaServicesWidget fetched 'getCentralaData'.
            // For simplicity in this transition, we might render them and let them fetch if they do, 
            // OR we rely on the component's internal logic. 
            // Looking at previous code, CentralaServicesWidget passed `initialData`.
            // We'll pass profileId and let them handle (or refactor if needed). 
            // Most sections like RecruiterSection are static or fetch internally.
            case 'benefits': return <BenefitsSection profileId={profileId} isAdmin={isAdmin} />
            case 'billing': return <BillingSection profileId={profileId} />
            case 'equipment': return <EquipmentSection profileId={profileId} />
            case 'referrals': return <ReferralsSection profileId={profileId} />
            case 'documents': return <UnifiedDocumentManager ownerId={profileId} />
            default: return null
        }
    }

    // Reuse the Dialog Title/Subtitle logic
    const getSectionDetails = (id: string) => {
        const app = serviceApps.find(a => a.id === id) || discoveryCards.find(d => d.id === id)
        return app ? { title: app.title, subtitle: 'desc' in app ? app.desc : ('subtitle' in app ? app.subtitle : 'Szczegóły') } : { title: '', subtitle: '' }
    }

    const currentSection = selectedSection ? getSectionDetails(selectedSection) : null

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Banner — compact */}
            <div className="rounded-xl bg-gradient-to-r from-burgundy to-burgundy px-6 py-4 flex items-center justify-between relative overflow-hidden border border-white/10">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>

                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white">Service Hub</h1>
                        <p className="text-xs text-foreground">
                            Narzędzia, benefity i sprawy formalne
                        </p>
                    </div>
                </div>

                {/* Context pill — role-aware */}
                {!isAdmin && (
                    <div className="relative z-10 hidden sm:block">
                        <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10">
                            <p className="text-xs text-foreground">Punkty Lojalnościowe</p>
                            <p className="text-lg font-bold text-white">{stats?.profile?.loyalty_points || 0}</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Apps Grid */}
                <div className="lg:col-span-2 space-y-8">
                    <section>
                        <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 px-2 flex items-center gap-2">
                            <Award className="w-4 h-4" />
                            Odkryj
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {discoveryCards.map((card, i) => {
                                const Icon = card.icon
                                return (
                                    <Card
                                        key={i}
                                        onClick={() => {
                                            if (card.id === 'training') {
                                                router.push('/development')
                                            } else {
                                                setSelectedSection(card.id)
                                            }
                                        }}
                                        className={`bg-gradient-to-br ${card.gradient} border-0 cursor-pointer hover:opacity-90 transition-opacity`}
                                    >
                                        <CardContent className="p-4 flex gap-4">
                                            <div className={`w-12 h-12 rounded-full ${card.color} flex items-center justify-center shrink-0 shadow-lg`}>
                                                <Icon className="w-6 h-6 text-white" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white">{card.title}</h4>
                                                <p className="text-xs text-white/70 mt-1">{card.subtitle}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 px-2 flex items-center gap-2">
                            <Activity className="w-4 h-4" />
                            Aplikacje i Usługi
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {serviceApps.map((app, i) => {
                                const Icon = app.icon
                                return (
                                    <div
                                        key={i}
                                        onClick={() => setSelectedSection(app.id)}
                                        className="group flex flex-col items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg"
                                    >
                                        <div className={`w-12 h-12 rounded-xl ${app.color} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform`}>
                                            <Icon className="w-6 h-6" />
                                        </div>
                                        <div className="text-center">
                                            <span className="font-medium text-slate-200 group-hover:text-white block">{app.title}</span>
                                            <span className="text-[10px] text-slate-600 mt-1">{app.desc}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                </div>

                {/* Right Panel */}
                <div className="space-y-6">
                    {/* Notifications */}
                    <div className="h-[400px]">
                        <NotificationCenterWidget
                            notifications={notifications}
                            totalUnread={stats?.unreadNotificationsCount || 0}
                        />
                    </div>
                </div>
            </div>

            {/* Global Dialog for Services */}
            <ShadcnDialog open={!!selectedSection} onOpenChange={(open) => !open && setSelectedSection(null)}>
                <ShadcnDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-950 border-white/10 text-white">
                    <ShadcnDialogHeader className="border-b border-white/10 pb-4 mb-6">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-white/10`}>
                                {currentSection && serviceApps.find(a => a.id === selectedSection)?.icon && (
                                    (() => {
                                        const Icon = serviceApps.find(a => a.id === selectedSection)!.icon
                                        return <Icon className="w-5 h-5 text-white" />
                                    })()
                                )}
                                {selectedSection === 'referrals' && <Users className="w-5 h-5 text-white" />}
                            </div>
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
        </div>
    )
}

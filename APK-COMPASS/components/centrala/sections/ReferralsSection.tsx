'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Users,
    Gift,
    History,
    FileText,
    UserPlus,
    CheckCircle2,
    Clock,
    AlertCircle,
    PartyPopper,
    Coins,
    Activity,
    Scale,
    Mail,
} from "lucide-react"
import { useState, useEffect } from "react"
import { ReferralWizard } from "@/components/referrals/ReferralWizard"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    type ReferralSettings,
    getReferralSettings,
} from '@/lib/actions/referral-settings'

interface ReferralsSectionProps {
    profileId: string
    initialData?: any[]
}

export function ReferralsSection({ profileId, initialData = [] }: ReferralsSectionProps) {
    const [wizardOpen, setWizardOpen] = useState(false)
    const [rulesOpen, setRulesOpen] = useState(false)
    const [settings, setSettings] = useState<ReferralSettings | null>(null)

    useEffect(() => {
        getReferralSettings().then(setSettings).catch(console.error)
    }, [])

    const statusMap: Record<string, { label: string, color: string, icon: React.FC<any> }> = {
        'SUBMITTED': { label: 'Zgłoszony', color: 'text-slate-200 bg-slate-200/10', icon: Clock },
        'IN_RECRUITMENT': { label: 'W Rekrutacji', color: 'text-yellow-400 bg-yellow-400/10', icon: Activity },
        'HIRED': { label: 'Zatrudniony', color: 'text-slate-200 bg-slate-200/10', icon: CheckCircle2 },
        'PROJECT_STARTED': { label: 'Na Projekcie', color: 'text-primary bg-primary/10', icon: PartyPopper },
        'BONUS_ELIGIBLE': { label: 'Bonus Aktywny', color: 'text-green-400 bg-green-400/10', icon: Coins },
        'REJECTED': { label: 'Odrzucono', color: 'text-red-400 bg-red-400/10', icon: AlertCircle },
        'DUPLICATE': { label: 'Duplikat', color: 'text-gray-400 bg-white/5', icon: Users }
    }

    // Computed values from settings
    const tiers = settings?.rewardTiers || []
    const actions = settings?.rewardActions || []
    const minBonus = tiers.length > 0 ? Math.min(...tiers.map(t => t.bonusAmount)) : 2000
    const maxBonus = tiers.length > 0 ? Math.max(...tiers.map(t => t.bonusAmount)) : 5000
    const contactEmail = settings?.rulesContactEmail || 'rekrutacja@b2bnetwork.pl'
    const effectiveDate = settings?.rulesEffectiveDate || '2026-01-01'

    // Parse rules text into sections
    const rulesSections = parseRules(settings?.rules || '')

    return (
        <div className="space-y-6">
            <Card className="bg-burgundy/10 border-burgundy/20 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-6 opacity-10">
                    <Gift className="w-32 h-32" />
                </div>
                <CardContent className="p-8 space-y-4">
                    <div className="max-w-xl">
                        <Badge className="bg-burgundy text-white mb-2">M6: Referral Program</Badge>
                        <h3 className="text-2xl font-bold text-white mb-2">Rekomenduj specjalistę i zgarnij bonus!</h3>
                        <p className="text-sm text-foreground/70 mb-6 font-medium leading-relaxed">
                            Program Rekomendacji łączy najlepszych. Rekomenduj specjalistę do konkretnego projektu
                            lub ogólnie do puli talentów. Za każdego zatrudnionego kandydata otrzymasz
                            <strong> od {minBonus.toLocaleString('pl-PL')} do {maxBonus.toLocaleString('pl-PL')} PLN</strong> bonusu + punkty lojalnościowe.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button
                                className="bg-burgundy hover:bg-burgundy gap-2"
                                onClick={() => setWizardOpen(true)}
                            >
                                <UserPlus className="w-4 h-4" /> Rekomenduj
                            </Button>
                            <Button
                                variant="outline"
                                className="border-burgundy/30 hover:bg-burgundy/10 gap-2"
                                onClick={() => setRulesOpen(true)}
                            >
                                <FileText className="w-4 h-4" /> Zasady Programu
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <ReferralWizard
                isOpen={wizardOpen}
                onOpenChange={setWizardOpen}
            />

            {/* Dialog: Zasady Programu Rekomendacji — dynamiczny regulamin z bazy */}
            <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] bg-slate-950 border-white/10 text-white p-0">
                    <DialogHeader className="p-6 pb-4 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-burgundy/20">
                                <Scale className="w-5 h-5 text-foreground" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold">Regulamin Programu Rekomendacji</DialogTitle>
                                <DialogDescription className="text-slate-600 text-xs mt-1">
                                    B2B.net S.A. — obowiązuje od {new Date(effectiveDate).toLocaleDateString('pl-PL')}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <ScrollArea className="max-h-[70vh] p-6">
                        <div className="space-y-8 text-sm">

                            {/* Dynamiczne sekcje regulaminu */}
                            {rulesSections.map((section, idx) => (
                                <section key={idx}>
                                    {section.heading && (
                                        <h3 className="text-base font-bold text-white flex items-center gap-2 mb-3">
                                            <span className="text-foreground">{section.paragraphId}</span> {section.heading}
                                        </h3>
                                    )}
                                    <div className="space-y-2 text-slate-300 leading-relaxed">
                                        {section.lines.map((line, lineIdx) => (
                                            <p key={lineIdx}>{line}</p>
                                        ))}
                                    </div>
                                </section>
                            ))}

                            {/* Tabela bonusów z bazy */}
                            {tiers.length > 0 && (
                                <section>
                                    <h3 className="text-base font-bold text-white flex items-center gap-2 mb-3">
                                        <Coins className="w-4 h-4 text-primary" /> Aktualna tabela bonusów
                                    </h3>
                                    <div className="rounded-lg border border-white/10 overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-white/5">
                                                    <th className="text-left p-3 text-xs uppercase tracking-wider text-slate-600 font-semibold">Poziom kandydata</th>
                                                    <th className="text-right p-3 text-xs uppercase tracking-wider text-slate-600 font-semibold">Bonus netto (PLN)</th>
                                                    <th className="text-right p-3 text-xs uppercase tracking-wider text-slate-600 font-semibold">Punkty lojalnościowe</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-slate-300">
                                                {tiers.map(tier => (
                                                    <tr key={tier.id} className="border-t border-white/5">
                                                        <td className="p-3">{tier.level} ({tier.description})</td>
                                                        <td className="p-3 text-right font-bold text-primary">{tier.bonusAmount.toLocaleString('pl-PL')} PLN</td>
                                                        <td className="p-3 text-right text-yellow-400">{tier.loyaltyPoints} pkt</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            )}

                            {/* Contact */}
                            <div className="rounded-xl bg-burgundy/10 border border-burgundy/20 p-4">
                                <div className="flex items-center gap-3">
                                    <Mail className="w-5 h-5 text-foreground shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium text-white">Masz pytania?</p>
                                        <p className="text-xs text-slate-600 mt-0.5">
                                            Skontaktuj się z Działem Rekrutacji: <span className="text-foreground font-medium">{contactEmail}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-6">
                    <Card className="bg-white/5 border-white/10 h-full">
                        <CardHeader className="pb-2 border-b border-white/5 mb-4">
                            <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <History className="w-4 h-4 text-primary" />
                                Historia Poleceń
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {initialData.length > 0 ? initialData.map((ref: any) => {
                                    const statusKey = ref.status?.toUpperCase() || 'SUBMITTED'
                                    const status = statusMap[statusKey] || statusMap['SUBMITTED']
                                    const StatusIcon = status.icon
                                    return (
                                        <div key={ref.id} className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/5 group hover:border-white/10 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                                                    <Users className="w-5 h-5 text-gray-400" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-200">{ref.candidate_name}</p>
                                                    <p className="text-[10px] text-muted-foreground">{ref.candidate_position} • {new Date(ref.created_at).toLocaleDateString('pl-PL')}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                {ref.bonus_amount > 0 && (
                                                    <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary text-[10px] h-6">
                                                        {ref.bonus_amount} PLN
                                                    </Badge>
                                                )}
                                                <Badge variant="outline" className={`border-0 ${status.color} px-2 h-6 text-[10px] flex items-center gap-1.5`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {status.label}
                                                </Badge>
                                            </div>
                                        </div>
                                    )
                                }) : (
                                    <div className="py-12 text-center">
                                        <p className="text-sm text-muted-foreground italic">Nie masz jeszcze żadnych poleceń.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="bg-white/5 border-white/10 p-6">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                            <Coins className="w-4 h-4" />
                            Zasady i Nagrody
                        </h4>
                        <div className="space-y-6">
                            {(actions.length > 0
                                ? actions.sort((a, b) => a.order - b.order).map((item, idx) => ({
                                    step: String(idx + 1),
                                    title: item.action,
                                    desc: item.description,
                                    points: item.points,
                                }))
                                : [
                                    { step: '1', title: 'Zgłoszenie kandydata', desc: 'Wypełnij formularz. Sprawdzimy czy kandydata nie ma już w bazie.', points: '0 pkt' },
                                    { step: '2', title: 'Rozpoczęcie projektu', desc: 'Gdy Twój kandydat zacznie pracę, otrzymasz punkty lojalnościowe.', points: '25–100 pkt' },
                                    { step: '3', title: 'Bonus Finansowy', desc: 'Po 3 miesiącach nienagannej pracy wypłacamy bonus na fakturę B2B.', points: '2000–5000 PLN' },
                                ]
                            ).map((item) => (
                                <div key={item.step} className="flex gap-4">
                                    <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 text-primary font-bold text-xs mt-1">
                                        {item.step}
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-start mb-1">
                                            <h5 className="text-sm font-bold text-gray-200">{item.title}</h5>
                                            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded uppercase">{item.points}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-8 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/10">
                            <p className="text-[11px] text-yellow-200/60 leading-relaxed italic">
                                * Wysokość bonusu zależy od poziomu doświadczenia kandydata
                                {tiers.length > 0 && ` (${tiers.map(t => t.level).join('/')})`}.
                                Pełny regulamin dostępny po kliknięciu „Zasady Programu" powyżej.
                            </p>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    )
}

// ============================================================
// Helper: Parse rules text into structured sections
// Lines starting with §X become section headers
// ============================================================
interface RulesSection {
    paragraphId: string
    heading: string
    lines: string[]
}

function parseRules(rulesText: string): RulesSection[] {
    if (!rulesText.trim()) return []

    const lines = rulesText.split('\n').filter(l => l.trim())
    const sections: RulesSection[] = []
    let currentSection: RulesSection | null = null

    for (const line of lines) {
        const trimmed = line.trim()
        const sectionMatch = trimmed.match(/^(§\d+)\s+(.+)/)

        if (sectionMatch) {
            if (currentSection) sections.push(currentSection)
            currentSection = {
                paragraphId: sectionMatch[1],
                heading: sectionMatch[2],
                lines: []
            }
        } else if (currentSection) {
            currentSection.lines.push(trimmed)
        } else {
            // Lines before first section
            currentSection = { paragraphId: '', heading: '', lines: [trimmed] }
        }
    }

    if (currentSection) sections.push(currentSection)
    return sections
}

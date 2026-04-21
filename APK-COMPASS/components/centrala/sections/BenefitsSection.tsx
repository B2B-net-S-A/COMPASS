'use client'

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    Activity,
    Download,
    Info,
    Mail,
    Heart,
    Dumbbell,
} from "lucide-react"
import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UnifiedDocumentManager } from "@/components/documents/UnifiedDocumentManager"
import { Badge } from "@/components/ui/badge"

interface BenefitsSectionProps {
    profileId: string
    initialData?: any[]
    isAdmin?: boolean
}

export function BenefitsSection({ profileId, initialData = [], isAdmin = false }: BenefitsSectionProps) {
    const [activeTab, setActiveTab] = useState<'medical' | 'sport'>('medical')

    return (
        <div className="space-y-6">
            <div className="flex p-1 bg-white/5 rounded-xl border border-white/10 w-fit">
                <Button
                    variant={activeTab === 'medical' ? 'secondary' : 'ghost'}
                    className="rounded-lg px-6 gap-2"
                    onClick={() => setActiveTab('medical')}
                >
                    <Heart className="w-4 h-4" /> Opieka Medyczna (PZU)
                </Button>
                <Button
                    variant={activeTab === 'sport' ? 'secondary' : 'ghost'}
                    className="rounded-lg px-6 gap-2"
                    onClick={() => setActiveTab('sport')}
                >
                    <Dumbbell className="w-4 h-4" /> Karty Sportowe
                </Button>
            </div>

            {activeTab === 'medical' ? (
                <div className="space-y-6">
                    {/* Info banner */}
                    <Card className="bg-primary/10 border-primary/20 p-4">
                        <div className="flex items-start gap-3">
                            <Info className="w-5 h-5 text-slate-200 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm text-gray-200">
                                    B2B.net refunduje <strong className="text-white">100% pakietu KOMFORT</strong> (99 zł/mies.).
                                    Wyższe pakiety — dofinansowanie 99 zł, resztę pokrywasz sam.
                                </p>
                                <p className="text-xs text-gray-400">
                                    Termin składania deklaracji: <strong>do 19. dnia miesiąca</strong> (aktywacja od 1. dnia kolejnego miesiąca).
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* Package cards */}
                    <div className="grid gap-4 md:grid-cols-3">
                        {[
                            {
                                name: 'KOMFORT',
                                code: '17',
                                specs: '25 specjalizacji',
                                price: '0 zł',
                                fullPrice: '99 zł',
                                color: 'border-green-500/30',
                                badge: 'W 100% refundowany',
                                badgeColor: 'bg-green-500/20 text-green-400 border-green-500/30',
                                features: ['25 specjalizacji', '152 badania', '29 zabiegów', '2 wizyty domowe/rok', 'Szczepienia (grypa, tężec)']
                            },
                            {
                                name: 'KOMFORT PLUS',
                                code: '18',
                                specs: '30 specjalizacji',
                                price: '73 zł',
                                fullPrice: '172 zł',
                                color: 'border-primary/30',
                                badge: null,
                                badgeColor: '',
                                features: ['30 specjalizacji', 'Większy zakres badań', 'Więcej zabiegów', '4 wizyty domowe/rok', 'Wszystko z Komfort +']
                            },
                            {
                                name: 'OPTIMUM',
                                code: '23',
                                specs: '35 specjalizacji',
                                price: '163,90 zł',
                                fullPrice: '262,90 zł',
                                color: 'border-burgundy/30',
                                badge: 'Najpełniejszy',
                                badgeColor: 'bg-burgundy/20 text-primary border-burgundy/30',
                                features: ['35 specjalizacji', 'Pełny zakres badań', 'Pełny zakres zabiegów', '4 wizyty domowe/rok', '30 zabiegów rehab./rok']
                            }
                        ].map((tier) => (
                            <Card key={tier.name} className={`bg-white/5 ${tier.color} overflow-hidden group`}>
                                <div className="p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-lg">{tier.name}</h4>
                                        <span className="text-[10px] text-muted-foreground bg-white/5 px-2 py-0.5 rounded">kod: {tier.code}</span>
                                    </div>
                                    {tier.badge && (
                                        <Badge variant="outline" className={`text-[10px] ${tier.badgeColor}`}>{tier.badge}</Badge>
                                    )}
                                    <div>
                                        <p className="text-2xl font-black text-white">{tier.price}</p>
                                        <p className="text-[10px] text-muted-foreground">
                                            Po dofinansowaniu B2B (pełna cena: {tier.fullPrice}/mies.)
                                        </p>
                                    </div>
                                    <ul className="space-y-1.5">
                                        {tier.features.map((f, i) => (
                                            <li key={i} className="text-[11px] text-gray-400 flex items-center gap-2">
                                                <span className="w-1 h-1 rounded-full bg-primary shrink-0" /> {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </Card>
                        ))}
                    </div>

                    {/* Pricing table — all variants */}
                    <Card className="bg-white/5 border-white/10 overflow-hidden">
                        <div className="p-4 border-b border-white/5">
                            <h4 className="text-xs font-bold uppercase tracking-widest">Cennik pakietów indywidualnych, partnerskich i rodzinnych</h4>
                        </div>
                        <Table>
                            <TableHeader className="bg-white/5">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[140px] text-[10px] font-bold uppercase">Pakiet</TableHead>
                                    <TableHead className="text-center text-[10px] font-bold uppercase">KOMFORT (17)</TableHead>
                                    <TableHead className="text-center text-[10px] font-bold uppercase">KOMFORT PLUS (18)</TableHead>
                                    <TableHead className="text-center text-[10px] font-bold uppercase">OPTIMUM (23)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[
                                    { label: 'Indywidualny', v1: '0 zł', v2: '73 zł', v3: '163,90 zł' },
                                    { label: 'Partnerski', v1: '98,70 zł', v2: '244,80 zł', v3: '426,40 zł' },
                                    { label: 'Rodzinny', v1: '197,40 zł', v2: '416,70 zł', v3: '689 zł' },
                                ].map((row) => (
                                    <TableRow key={row.label} className="border-white/5 hover:bg-white/5">
                                        <TableCell className="font-medium text-[11px] text-gray-400 py-3">{row.label}</TableCell>
                                        <TableCell className="text-center text-[11px] py-3 font-bold text-green-400">{row.v1}</TableCell>
                                        <TableCell className="text-center text-[11px] py-3">{row.v2}</TableCell>
                                        <TableCell className="text-center text-[11px] py-3">{row.v3}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <div className="p-3 bg-white/5 text-[10px] text-muted-foreground">
                            Ceny po dofinansowaniu (odliczone 99 zł). Osoby towarzyszące nie są objęte dofinansowaniem.
                        </div>
                    </Card>

                    {/* Additional info */}
                    <Card className="bg-white/5 border-white/10 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-white/5">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[180px] text-[10px] font-bold uppercase">Zakres usług</TableHead>
                                    <TableHead className="text-center text-[10px] font-bold uppercase">Komfort</TableHead>
                                    <TableHead className="text-center text-[10px] font-bold uppercase">Komfort Plus</TableHead>
                                    <TableHead className="text-center text-[10px] font-bold uppercase">Optimum</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[
                                    { label: 'Lekarze specjaliści', v1: '25', v2: '30', v3: '35' },
                                    { label: 'Badania diagnostyczne', v1: '152', v2: 'Więcej', v3: 'Pełne' },
                                    { label: 'Zabiegi', v1: '29', v2: 'Więcej', v3: 'Pełne' },
                                    { label: 'Wizyty domowe / rok', v1: '2', v2: '4', v3: '4' },
                                    { label: 'Rehabilitacja / rok', v1: '—', v2: '—', v3: '30 zabiegów' },
                                    { label: 'Teleporady (7 dni/tydz.)', v1: '✓', v2: '✓', v3: '✓' },
                                    { label: 'Czas oczekiwania (internista)', v1: '2 dni', v2: '2 dni', v3: '2 dni' },
                                    { label: 'Czas oczekiwania (specjalista)', v1: '5 dni', v2: '5 dni', v3: '5 dni' },
                                ].map((row) => (
                                    <TableRow key={row.label} className="border-white/5 hover:bg-white/5">
                                        <TableCell className="font-medium text-[11px] text-gray-400 py-2.5">{row.label}</TableCell>
                                        <TableCell className="text-center text-[11px] py-2.5">{row.v1}</TableCell>
                                        <TableCell className="text-center text-[11px] py-2.5">{row.v2}</TableCell>
                                        <TableCell className="text-center text-[11px] py-2.5 font-bold text-primary">{row.v3}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>

                    {/* Contact info */}
                    <Card className="bg-white/5 border-white/10 p-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold uppercase tracking-tighter text-primary mb-2 flex items-center gap-2">
                                    <Mail className="w-4 h-4" /> Kontakt ws. benefitów
                                </h4>
                                <a href="mailto:benefity@b2bnetwork.pl" className="text-sm font-bold text-primary hover:underline block">
                                    benefity@b2bnetwork.pl
                                </a>
                            </div>
                            <div className="space-y-2">
                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Ważne informacje</p>
                                <ul className="space-y-1.5 text-[11px] text-gray-400">
                                    <li>• Deklaracje do <strong className="text-white">19. dnia miesiąca</strong></li>
                                    <li>• Skierowania od lekarzy spoza PZU są honorowane</li>
                                    <li>• Zmiana pakietu w górę — w dowolnym momencie</li>
                                    <li>• Zmiana w dół — tylko w rocznicę polisy (co 12 mies.)</li>
                                    <li>• Oryginały zgłoszeń trzeba dostarczyć do biura lub pocztą</li>
                                </ul>
                            </div>
                        </div>
                    </Card>

                    {/* Documents section - full width */}
                    <Card className="bg-white/5 border-white/10 p-6">
                        <h4 className="text-xs font-bold uppercase tracking-tighter text-primary mb-4 flex items-center gap-2">
                            <Download className="w-4 h-4" />
                            Dokumentacja PZU
                        </h4>
                        <UnifiedDocumentManager
                            ownerId={profileId}
                            isAdminView={isAdmin}
                            allowedCategories={['benefit']}
                            initialIsPublic={true}
                        />
                    </Card>
                </div>
            ) : (
                /* ====== SPORT TAB ====== */
                <div className="space-y-6">
                    {/* Info banner */}
                    <Card className="bg-green-500/10 border-green-500/20 p-4">
                        <div className="flex items-start gap-3">
                            <Info className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm text-gray-200">
                                    B2B.net dofinansowuje <strong className="text-white">50% ceny pakietu sportowego</strong>.
                                    Osoby towarzyszące nie są objęte dofinansowaniem.
                                </p>
                                <p className="text-xs text-gray-400">
                                    Zgłoszenie: wyślij skan zgody na przetwarzanie danych na <strong>benefity@b2bnetwork.pl</strong>
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* FitProfit */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card className="bg-white/5 border-orange-500/30 overflow-hidden">
                            <div className="p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-lg">FitProfit</h4>
                                    <Badge variant="outline" className="text-[10px] bg-orange-500/20 text-orange-400 border-orange-500/30">Bez limitu wejść</Badge>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-white">71 zł</p>
                                    <p className="text-[10px] text-muted-foreground">Po dofinansowaniu (pełna cena: 142 zł)</p>
                                </div>
                                <p className="text-xs text-gray-400">Nieograniczona liczba wejść w miesiącu do wszystkich obiektów w programie.</p>
                                <div className="pt-2 border-t border-white/5">
                                    <p className="text-[10px] text-muted-foreground">Osoba towarzysząca: <strong className="text-gray-300">185 zł</strong> (bez dofinansowania)</p>
                                </div>
                            </div>
                        </Card>

                        <Card className="bg-white/5 border-slate-200/30 overflow-hidden">
                            <div className="p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-lg">FitSport</h4>
                                    <Badge variant="outline" className="text-[10px] bg-slate-200/20 text-slate-200 border-slate-200/30">Limitowane wejścia</Badge>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5">
                                        <div>
                                            <p className="text-sm font-bold text-white">8 wejść</p>
                                            <p className="text-[10px] text-muted-foreground">Pełna cena: 80 zł</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black text-white">40 zł</p>
                                            <p className="text-[9px] text-muted-foreground">os. tow. 148 zł</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5">
                                        <div>
                                            <p className="text-sm font-bold text-white">10 wejść</p>
                                            <p className="text-[10px] text-muted-foreground">Pełna cena: 104 zł</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black text-white">52 zł</p>
                                            <p className="text-[9px] text-muted-foreground">os. tow. 173 zł</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Cards for kids/junior/senior */}
                    <Card className="bg-white/5 border-white/10">
                        <div className="p-4 border-b border-white/5">
                            <h4 className="text-xs font-bold uppercase tracking-widest">Karty dla dzieci, juniorów i seniorów</h4>
                        </div>
                        <Table>
                            <TableHeader className="bg-white/5">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="text-[10px] font-bold uppercase">Karta</TableHead>
                                    <TableHead className="text-[10px] font-bold uppercase">Wiek</TableHead>
                                    <TableHead className="text-right text-[10px] font-bold uppercase">Cena</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[
                                    { name: 'Karta basenowa', age: 'do 15 lat', price: '45 zł' },
                                    { name: 'FitProfit Dziecko', age: 'do 15 lat', price: '95 zł' },
                                    { name: 'Karta Junior', age: '15–18 lat', price: '107 zł' },
                                    { name: 'Karta Senior', age: 'od 60 lat', price: '119 zł' },
                                ].map((row) => (
                                    <TableRow key={row.name} className="border-white/5 hover:bg-white/5">
                                        <TableCell className="text-[11px] font-medium text-gray-300 py-2.5">{row.name}</TableCell>
                                        <TableCell className="text-[11px] text-gray-400 py-2.5">{row.age}</TableCell>
                                        <TableCell className="text-right text-[11px] font-bold text-white py-2.5">{row.price}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <div className="p-3 bg-white/5 text-[10px] text-muted-foreground">
                            Karty dla dzieci, juniorów i seniorów nie są objęte dofinansowaniem. Możliwe jest wyrobienie karty dla 1 osoby towarzyszącej.
                        </div>
                    </Card>

                    {/* Contact */}
                    <Card className="bg-white/5 border-white/10 p-6 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Kontakt ws. kart sportowych</p>
                            <a href="mailto:benefity@b2bnetwork.pl" className="text-sm font-bold text-primary hover:underline">
                                benefity@b2bnetwork.pl
                            </a>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="text-xs border-white/10 gap-1" asChild>
                                <a href="https://www.fitprofit.pl/" target="_blank" rel="noopener noreferrer">
                                    FitProfit.pl <Activity className="w-3 h-3" />
                                </a>
                            </Button>
                            <Button variant="outline" size="sm" className="text-xs border-white/10 gap-1" asChild>
                                <a href="https://www.kartafitsport.pl/" target="_blank" rel="noopener noreferrer">
                                    FitSport.pl <Activity className="w-3 h-3" />
                                </a>
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}

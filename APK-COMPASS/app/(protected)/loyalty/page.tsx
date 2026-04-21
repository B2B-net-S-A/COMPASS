import React from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Trophy,
    Star,
    Target,
    TrendingUp,
    Gift,
    Shield,
    Award,
    Clock,
    CheckCircle2,
    ArrowRight,
    Users,
    Search,
    Briefcase,
    Settings,
    BarChart3
} from "lucide-react"
import { MyPointsTab } from '@/components/dashboard/loyalty/MyPointsTab'
import { AdminLoyaltyOverview } from '@/components/dashboard/loyalty/AdminLoyaltyOverview'
import { TIER_CONFIG } from '@/lib/loyalty-config'

export default async function LoyaltyPage() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let role = 'consultant'
    let loyaltyPoints = 0
    let loyaltyTier = 'bronze'

    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('role, loyalty_points, loyalty_tier')
            .eq('id', user.id)
            .single()
        role = profile?.role || 'consultant'
        loyaltyPoints = profile?.loyalty_points || 0
        loyaltyTier = profile?.loyalty_tier || 'bronze'
    }

    const isAdmin = role === 'admin' || role === 'administrator'
    const isAdminOrCentrala = ['admin', 'administrator', 'centrala'].includes(role)

    const currentTierInfo = TIER_CONFIG.find(t => t.name === loyaltyTier) || TIER_CONFIG[0]
    const pointsToNext = currentTierInfo.next
        ? Math.max(0, currentTierInfo.nextThreshold - loyaltyPoints)
        : 0
    const progressPercent = currentTierInfo.next
        ? Math.min(100, Math.round(((loyaltyPoints - currentTierInfo.threshold) / (currentTierInfo.nextThreshold - currentTierInfo.threshold)) * 100))
        : 100

    const tierColorMap: Record<string, string> = {
        bronze: 'text-[#CD7F32]',
        silver: 'text-[#C0C0C0]',
        gold: 'text-amber-500',
        platinum: 'text-[#E5B4F3]',
    }

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Program Lojalnościowy</h1>
                <p className="text-muted-foreground">
                    System behawioralny oparty na pozytywnym wzmacnianiu. Zbieraj punkty, awansuj i zdobywaj przywileje.
                </p>
            </div>

            {/* Hero Section / Current Status — only for consultants */}
            {!isAdminOrCentrala && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-200/20">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Twój Status</CardTitle>
                            <Trophy className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${tierColorMap[loyaltyTier] || 'text-amber-500'}`}>{currentTierInfo.label}</div>
                            <p className="text-xs text-muted-foreground">
                                Aktywny do: Bezterminowo
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Zgromadzone Punkty</CardTitle>
                            <Star className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{loyaltyPoints.toLocaleString('pl-PL')} pkt</div>
                            <p className="text-xs text-muted-foreground">
                                Suma zdobytych punktów
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Do następnego poziomu</CardTitle>
                            <Target className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{currentTierInfo.next ? `${pointsToNext.toLocaleString('pl-PL')} pkt` : '—'}</div>
                            <div className="h-2 w-full bg-secondary mt-2 rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${progressPercent}%` }} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Aktualny Poziom</CardTitle>
                            <Gift className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{currentTierInfo.label}</div>
                            <Button variant="link" className="px-0 h-auto text-xs text-primary">
                                Zobacz przywileje <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            <Tabs defaultValue={isAdminOrCentrala ? "consultants" : "mypoints"} className="space-y-4">
                <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 h-auto">
                    {isAdminOrCentrala ? (
                        <TabsTrigger value="consultants" className="gap-1">
                            <Users className="h-3.5 w-3.5" />
                            Punkty konsultantów
                        </TabsTrigger>
                    ) : (
                        <TabsTrigger value="mypoints" className="gap-1">
                            <BarChart3 className="h-3.5 w-3.5" />
                            Moje punkty
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="overview">Przegląd</TabsTrigger>
                    <TabsTrigger value="roles">Wsparcie</TabsTrigger>
                    <TabsTrigger value="tiers">Poziomy</TabsTrigger>
                    <TabsTrigger value="earning">Jak zdobywać</TabsTrigger>
                    <TabsTrigger value="faq">FAQ</TabsTrigger>
                </TabsList>

                {isAdminOrCentrala ? (
                    <TabsContent value="consultants" className="space-y-4">
                        <AdminLoyaltyOverview />
                    </TabsContent>
                ) : (
                    <TabsContent value="mypoints" className="space-y-4">
                        <MyPointsTab />
                    </TabsContent>
                )}

                <TabsContent value="overview" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Filozofia Systemu M3</CardTitle>
                            <CardDescription>
                                ZERO kar, wyłącznie nagrody.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="prose dark:prose-invert max-w-none space-y-4">
                            <p>
                                M3 to system behawioralny oparty na pozytywnym wzmacnianiu. Konsultanci B2B.net zbierają punkty za konkretne działania i awansują na wyższe poziomy statusu (tier'y), co odblokowuje realne przywileje biznesowe.
                            </p>

                            <div className="grid md:grid-cols-3 gap-4 my-6 not-prose">
                                <Card className="bg-secondary/50 border-none shadow-none">
                                    <CardHeader>
                                        <Award className="h-8 w-8 text-primary mb-2" />
                                        <CardTitle className="text-lg">Jasne Zasady</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        Każda akcja ma zdefiniowaną wartość punktową. Wiesz dokładnie, za co jesteś nagradzany.
                                    </CardContent>
                                </Card>
                                <Card className="bg-secondary/50 border-none shadow-none">
                                    <CardHeader>
                                        <TrendingUp className="h-8 w-8 text-primary mb-2" />
                                        <CardTitle className="text-lg">Rozwój Statusu</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        4 poziomy: Bronze, Silver, Gold i Platinum. Każdy poziom to nowe możliwości i benefity.
                                    </CardContent>
                                </Card>
                                <Card className="bg-secondary/50 border-none shadow-none">
                                    <CardHeader>
                                        <Shield className="h-8 w-8 text-primary mb-2" />
                                        <CardTitle className="text-lg">Bezstratność</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        Punkty są bezpieczne. System skupia się na docenianiu Twojego wkładu, nie na karaniu.
                                    </CardContent>
                                </Card>
                            </div>

                            {isAdmin && (
                                <div className="mt-8 p-4 bg-muted border rounded-lg not-prose">
                                    <h3 className="font-bold flex items-center gap-2 mb-2">
                                        <Shield className="h-5 w-5" /> Panel Administratora
                                    </h3>
                                    <p className="text-sm text-muted-foreground mb-3">
                                        Jako Administrator masz pełną kontrolę nad systemem: dashboard statystyk, ręczne przyznawanie punktów, konfiguracja wartości oraz pełny audit log transakcji.
                                    </p>
                                    <Link href="/admin/settings/loyalty">
                                        <Button variant="outline" className="gap-2">
                                            <Settings className="h-4 w-4" />
                                            Konfiguracja programu lojalnościowego
                                        </Button>
                                    </Link>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="roles" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Wsparcie</CardTitle>
                            <CardDescription>
                                Zaangażowanie i System Benefitów. Przestrzeń dla osób, które chcą współtworzyć kulturę B2B.net.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Ambasador */}
                            <div className="flex flex-col md:flex-row gap-6 p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                                <div className="md:w-16 md:h-16 flex items-center justify-center rounded-full bg-blue-100 text-burgundy dark:bg-blue-900/30 dark:text-foreground shrink-0">
                                    <Users className="h-8 w-8" />
                                </div>
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-bold">Ambasador</h3>
                                        <Badge variant="outline">Kultura & Onboarding</Badge>
                                    </div>
                                    <p className="text-muted-foreground italic">"Buduje kulturę. Skraca czas wdrożenia. Stabilizuje projekt."</p>
                                    <p className="text-sm">
                                        Twarz i głos B2B.net na projekcie. Wita nowych Konsultantów, pomaga im wejść w środowisko klienta i buduje poczucie przynależności.
                                    </p>
                                    <div className="pt-2">
                                        <strong className="text-sm font-semibold">Benefity:</strong>
                                        <ul className="text-sm list-disc list-inside text-muted-foreground mt-1">
                                            <li>Premia onboardingowa (500–1000 zł)</li>
                                            <li>Punkty lojalnościowe Compass (100-300 pkt)</li>
                                            <li>Odznaka "Ambasador B2B.net"</li>
                                            <li>Priorytet w rozwoju (szkolenia, spotkania strategiczne)</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Weryfikator */}
                            <div className="flex flex-col md:flex-row gap-6 p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                                <div className="md:w-16 md:h-16 flex items-center justify-center rounded-full bg-purple-100 text-burgundy dark:bg-purple-900/30 dark:text-primary shrink-0">
                                    <Search className="h-8 w-8" />
                                </div>
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-bold">Weryfikator</h3>
                                        <Badge variant="outline">Jakość & Standardy</Badge>
                                    </div>
                                    <p className="text-muted-foreground italic">"Gwarant jakości. Odpowiada za poziom merytoryczny projektów."</p>
                                    <p className="text-sm">
                                        Strażnik jakości technicznej. Przeprowadza ocenę kandydatów i wspiera procesy decyzyjne Centrali.
                                    </p>
                                    <div className="pt-2">
                                        <strong className="text-sm font-semibold">Benefity:</strong>
                                        <ul className="text-sm list-disc list-inside text-muted-foreground mt-1">
                                            <li>Premia jakościowa (300–800 zł)</li>
                                            <li>Bonus za skuteczność rekomendacji</li>
                                            <li>AI Quality Boost (+5 score)</li>
                                            <li>Udział w warsztatach technologicznych</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Wsparcie sprzedaży */}
                            <div className="flex flex-col md:flex-row gap-6 p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                                <div className="md:w-16 md:h-16 flex items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                                    <Briefcase className="h-8 w-8" />
                                </div>
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-bold">Wsparcie Sprzedaży</h3>
                                        <Badge variant="outline">Biznes & Rozwój</Badge>
                                    </div>
                                    <p className="text-muted-foreground italic">"Łączy technologię z biznesem. Współtworzy wzrost firmy."</p>
                                    <p className="text-sm">
                                        Wsparcie pre-sales i spotkań z klientami. Dla osób, które chcą mieć realny wpływ na rozwój biznesu.
                                    </p>
                                    <div className="pt-2">
                                        <strong className="text-sm font-semibold">Benefity:</strong>
                                        <ul className="text-sm list-disc list-inside text-muted-foreground mt-1">
                                            <li>Premia pre-sales (1–3% marży)</li>
                                            <li>Bonus leadowy (2000–5000 zł)</li>
                                            <li>Status "Business Contributor"</li>
                                            <li>Ścieżka do roli Tech Sales / Client Advisor</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {isAdmin && (
                                <div className="mt-4 p-4 bg-muted border rounded-lg">
                                    <Link href="/admin/settings/loyalty">
                                        <Button variant="outline" className="gap-2">
                                            <Settings className="h-4 w-4" />
                                            Konfiguracja programu lojalnościowego
                                        </Button>
                                    </Link>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="tiers" className="space-y-4">
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Bronze */}
                        <Card className="border-l-4 border-l-[#CD7F32]">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>BRONZE</CardTitle>
                                    <div className="h-6 w-6 rounded-full bg-[#CD7F32]" />
                                </div>
                                <CardDescription>0 - 499 pkt</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2 text-sm">
                                    <li className="flex items-center text-muted-foreground"><CheckCircle2 className="mr-2 h-4 w-4 text-[#CD7F32]" /> Widok profilu</li>
                                    <li className="flex items-center text-muted-foreground"><CheckCircle2 className="mr-2 h-4 w-4 text-[#CD7F32]" /> Historia punktów</li>
                                </ul>
                            </CardContent>
                        </Card>

                        {/* Silver */}
                        <Card className="border-l-4 border-l-[#C0C0C0]">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>SILVER</CardTitle>
                                    <div className="h-6 w-6 rounded-full bg-[#C0C0C0]" />
                                </div>
                                <CardDescription>500 - 1999 pkt</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2 text-sm">
                                    <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-[#C0C0C0]" /> <strong>Priorytet w kolejce</strong></li>
                                    <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-[#C0C0C0]" /> Raporty wyników</li>
                                    <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-[#C0C0C0]" /> Preferencje projektów</li>
                                </ul>
                            </CardContent>
                        </Card>

                        {/* Gold */}
                        <Card className="border-l-4 border-l-[#FFD700] ring-1 ring-[#FFD700]/20 bg-[#FFD700]/5">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>GOLD</CardTitle>
                                    <div className="h-6 w-6 rounded-full bg-[#FFD700]" />
                                </div>
                                <CardDescription>2000 - 4999 pkt</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2 text-sm font-medium">
                                    <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-[#FFD700]" /> <strong>Projekty Premium</strong></li>
                                    <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-[#FFD700]" /> Negocjacja stawki +5%</li>
                                    <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-[#FFD700]" /> Skrócone procesy (5 dni)</li>
                                </ul>
                            </CardContent>
                        </Card>

                        {/* Platinum */}
                        <Card className="border-l-4 border-l-[#E5B4F3]">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>PLATINUM</CardTitle>
                                    <div className="h-6 w-6 rounded-full bg-[#E5B4F3]" />
                                </div>
                                <CardDescription>5000+ pkt</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2 text-sm">
                                    <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-[#E5B4F3]" /> <strong>Dedykowany Account Manager</strong></li>
                                    <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-[#E5B4F3]" /> Negocjacja stawki +10%</li>
                                    <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-[#E5B4F3]" /> Exclusive Eventy VIP</li>
                                    <li className="flex items-center"><CheckCircle2 className="mr-2 h-4 w-4 text-[#E5B4F3]" /> Procesy 2-dniowe</li>
                                </ul>
                            </CardContent>
                        </Card>
                    </div>
                    {isAdmin && (
                        <div className="mt-4 p-4 bg-muted border rounded-lg">
                            <Link href="/admin/settings/loyalty">
                                <Button variant="outline" className="gap-2">
                                    <Settings className="h-4 w-4" />
                                    Konfiguracja programu lojalnościowego
                                </Button>
                            </Link>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="earning" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Mechanizm Zbierania Punktów</CardTitle>
                            <CardDescription>Automatyczne nagrody za Twoje osiągnięcia</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm border rounded-lg overflow-hidden">
                                <div className="grid grid-cols-12 bg-muted/50 p-3 font-medium border-b">
                                    <div className="col-span-8 md:col-span-9">Zdarzenie</div>
                                    <div className="col-span-4 md:col-span-3 text-right">Punkty</div>
                                </div>
                                {[
                                    { name: "Referral (Zatrudnienie osoby poleconej)", points: "+1000", hl: true },
                                    { name: "Rola Compass: Ambasador", points: "+200", hl: true },
                                    { name: "Rola Compass: Weryfikator", points: "+100", hl: true },
                                    { name: "Rola Compass: Wsparcie Sprzedaży", points: "+300", hl: true },
                                    { name: "Rocznica zatrudnienia (co rok)", points: "+500", hl: true },
                                    { name: "Przedłużenie umowy (Annex)", points: "+500", hl: true },
                                    { name: "Gładkie przejście (gap ≤ 14 dni)", points: "+300" },
                                    { name: "Pozytywna ankieta kwartalna (Rating ≥4.5)", points: "+200" },
                                    { name: "Nowa certyfikacja (np. Azure, AWS)", points: "+150" },
                                    { name: "Pełny miesiąc na projekcie (attendance ≥90%)", points: "+100" },
                                ].map((item, i) => (
                                    <div key={i} className={`grid grid-cols-12 p-3 border-b last:border-0 items-center ${item.hl ? 'bg-primary/5' : ''}`}>
                                        <div className="col-span-8 md:col-span-9">
                                            <span className="font-medium block">{item.name}</span>
                                        </div>
                                        <div className="col-span-4 md:col-span-3 text-right font-mono font-bold text-primary">
                                            {item.points}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                    {isAdmin && (
                        <div className="p-4 bg-muted border rounded-lg">
                            <Link href="/admin/settings/loyalty">
                                <Button variant="outline" className="gap-2">
                                    <Settings className="h-4 w-4" />
                                    Konfiguracja programu lojalnościowego
                                </Button>
                            </Link>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="faq">
                    <Card>
                        <CardHeader>
                            <CardTitle>Często Zadawane Pytania</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <h4 className="font-semibold mb-1">Czy punkty wygasają?</h4>
                                <p className="text-muted-foreground text-sm">
                                    Domyślnie punkty <strong>nigdy nie wygasają</strong>. Twój status może tylko rosnąć.
                                </p>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-1">Kiedy następuje awans?</h4>
                                <p className="text-muted-foreground text-sm">
                                    Natychmiast po przekroczeniu progu (np. 500 pkt dla Silver). Otrzymasz powiadomienie.
                                </p>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-1">Co to jest "Real-time feedback"?</h4>
                                <p className="text-muted-foreground text-sm">
                                    System wysyła powiadomienia od razu po zdobyciu punktów. Zobaczysz animację i aktualny stan konta.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    {isAdmin && (
                        <div className="p-4 bg-muted border rounded-lg">
                            <Link href="/admin/settings/loyalty">
                                <Button variant="outline" className="gap-2">
                                    <Settings className="h-4 w-4" />
                                    Konfiguracja programu lojalnościowego
                                </Button>
                            </Link>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}

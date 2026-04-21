import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getMatchingProjectsForCandidate } from '@/lib/actions/candidates'
import Link from 'next/link'
import { ArrowLeft, Download } from 'lucide-react'
import { ClientCVPreview } from '@/components/admin/ClientCVPreview'
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { DeleteRedirectWrapper } from '@/components/admin/DeleteRedirectWrapper'
import { AdminCVUpload } from '@/components/admin/AdminCVUpload'
import { CandidateProjectList } from '@/components/admin/CandidateProjectList'
import { FavoriteProjectsSection } from '@/components/shared/FavoriteProjectsSection'
import { getUserFavoriteProjects } from '@/lib/actions/favorites'
import { Label } from "@/components/ui/label";
import { RoleItem } from '@/components/profile/RoleItem'
import { CandidateProfile360Tab } from '@/components/admin/CandidateProfile360Tab'

interface PageProps {
    params: {
        id: string
    }
    searchParams: {
        tab?: string
    }
}

export default async function CandidateDetailPage({ params, searchParams }: PageProps) {
    const supabase = createClient()
    const { id } = params
    let activeTab = searchParams.tab || 'profile'
    // Normalize 'cv' tab to 'profile' as they are now integrated
    if (activeTab === 'cv') activeTab = 'profile'

    // Fetch candidate details (specific columns, skip heavy embedding)
    const { data: candidate, error } = await supabase
        .from('candidates')
        .select('id, full_name, email, avatar_url, skills, experience_years, current_status, bio, cv_url, previous_clients, available_from, project_sentiment, verifier_status, ambassador_status, sales_support_status, created_at')
        .eq('id', id)
        .single()

    if (error || !candidate) {
        notFound()
    }

    // Fetch matching projects and favorites IN PARALLEL (not sequential!)
    const [matches, favorites] = await Promise.all([
        getMatchingProjectsForCandidate(id),
        getUserFavoriteProjects(id)
    ])

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] overflow-hidden -m-6">
            {/* Header Bar */}
            <div className="flex items-center gap-4 px-6 py-4 bg-background/80 border-b border-white/10 backdrop-blur-md z-20">
                <Link href="/admin/candidates">
                    <Button variant="ghost" size="icon" className="hover:bg-white/10">
                        <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </Button>
                </Link>
                <Avatar className="h-12 w-12 border-2 border-foreground/30">
                    <AvatarImage src={candidate.avatar_url} alt={candidate.full_name} className="object-cover" />
                    <AvatarFallback className="bg-card text-foreground font-bold">
                        {candidate.full_name ? candidate.full_name[0] : '?'}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <h1 className="text-xl font-bold text-white tracking-tight">{candidate.full_name || 'Kandydat'}</h1>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">ID: {candidate.id.slice(0, 8)}</span>
                        <div className="w-1 h-1 rounded-full bg-muted-foreground" />
                        <span className="text-xs font-medium text-foreground">
                            {candidate.experience_years !== null ? `${candidate.experience_years} lat exp.` : 'Brak danych exp.'}
                        </span>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-3">
                    <DeleteRedirectWrapper id={candidate.id} name={candidate.full_name} />
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT COLUMN: Profile Intelligence (Scrollable) */}
                <div className="w-1/3 min-w-[380px] border-r border-white/10 bg-background/40 overflow-y-auto p-6 space-y-6">

                    {/* Status & Sentiment Intelligence Card */}
                    <Card className="bg-gradient-to-br from-card/80 to-background/80 border-white/10 shadow-lg">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status & Nastawienie</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col gap-1">
                                <Label className="text-[10px] text-muted-foreground uppercase">Aktualny Status</Label>
                                <div className="text-sm font-medium text-white flex items-center gap-2 bg-white/5 p-2 rounded-lg border border-white/5">
                                    {(() => {
                                        const map: Record<string, string> = {
                                            open: '🟢 Dostępny (Standard)',
                                            available_from: `🔵 Dostępny od ${candidate.available_from || '?'}`,
                                            fte_1_0: '🟢 Pełny etat (1.0 FTE)',
                                            fte_0_5: '🟡 0.5 FTE',
                                            fte_0_25: '🟠 0.25 FTE',
                                            blocked: '🔴 Zablokowany (projekt)',
                                            notice_period: '⚫ Notice period',
                                            busy: '⏳ Zajęty',
                                            unavailable: '⚪ Niedostępny'
                                        }
                                        return map[candidate.current_status] || candidate.current_status || 'Brak danych'
                                    })()}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <Label className="text-[10px] text-muted-foreground uppercase">Nastawienie do projektu</Label>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                    {Array.isArray(candidate.project_sentiment) && candidate.project_sentiment.length > 0 ? (
                                        candidate.project_sentiment.map((id: string) => {
                                            const map: Record<string, string> = {
                                                super: '🚀 Super',
                                                change_willing: '🔄 Chętnie zmienię',
                                                manager_issues: '⚠️ Problemy',
                                                low_growth: '📉 Rozwój',
                                                needs_training: '📚 Szkolenia',
                                                extra_work: '➕ Dodatkowy'
                                            }
                                            return (
                                                <Badge key={id} variant="secondary" className="bg-foreground/10 text-cyan-300 border-foreground/20 text-[10px] py-0.5">
                                                    {map[id] || id}
                                                </Badge>
                                            )
                                        })
                                    ) : (
                                        <span className="text-muted-foreground text-[10px] italic">Brak danych</span>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* AI Executive Summary */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-foreground animate-pulse" />
                            <h3 className="text-sm font-semibold text-white tracking-wide">Podsumowanie AI</h3>
                        </div>
                        <div className="relative group">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-foreground to-burgundy rounded-xl blur opacity-10 group-hover:opacity-20 transition duration-1000"></div>
                            <div className="relative p-4 rounded-xl bg-card/50 border border-white/10 text-sm text-foreground leading-relaxed italic">
                                &quot;{candidate.bio || 'Brak wygenerowanego podsumowania profilu.'}&quot;
                            </div>
                        </div>
                    </div>

                    {/* Skills & Expertise */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-white tracking-wide">Kompetencje & Doświadczenie</h3>
                        <div className="flex flex-wrap gap-1.5">
                            {Array.isArray(candidate.skills) && candidate.skills.map((skill: string, i: number) => (
                                <Badge key={i} variant="outline" className="bg-white/5 border-white/10 text-foreground text-[11px] font-normal hover:border-foreground/50 transition-colors">
                                    {skill}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    {/* Clients History */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase text-[10px]">Historia Klientów</h3>
                        <div className="flex flex-wrap gap-2">
                            {Array.isArray(candidate.previous_clients) && candidate.previous_clients.map((client: string, i: number) => (
                                <div key={i} className="px-2 py-1 bg-indigo-500/5 border border-indigo-500/20 text-indigo-300 text-[11px] rounded flex items-center gap-1.5 leading-none">
                                    <span className="w-1 h-1 rounded-full bg-indigo-400" />
                                    {client}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Additional Work */}
                    <div className="pt-4 border-t border-white/5 space-y-4">
                        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Wsparcie</h3>
                        <div className="grid grid-cols-1 gap-2">
                            {[
                                {
                                    id: 'verifier',
                                    name: 'Weryfikator',
                                    value: candidate.verifier_status,
                                    description: 'Strażnik jakości i standardów technicznych. Przeprowadza merytoryczną ocenę kandydatów i wspiera proces decyzyjny Centrali.'
                                },
                                {
                                    id: 'ambassador',
                                    name: 'Ambasador',
                                    value: candidate.ambassador_status,
                                    description: 'Twarz i głos B2B.net na projekcie. Wita nowych Konsultantów i pomaga im wejść w środowisko klienta.'
                                },
                                {
                                    id: 'sales',
                                    name: 'Wsparcie Sprzedaży',
                                    value: candidate.sales_support_status,
                                    description: 'Wspiera działania pre-sales, uczestniczy w spotkaniach z klientami i buduje zaufanie wiedzą ekspercką.'
                                }
                            ].map((role) => (
                                <RoleItem key={role.id} {...role} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Dynamics (Tabs) */}
                <div className="flex-1 overflow-hidden bg-slate-950 flex flex-col">
                    <Tabs defaultValue={activeTab} className="flex-1 flex flex-col">
                        <div className="px-6 border-b border-white/10 bg-background/20 backdrop-blur-sm sticky top-0 z-10">
                            <TabsList className="h-14 bg-transparent gap-8">
                                <TabsTrigger value="profile" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none px-0 text-sm font-medium text-muted-foreground">
                                    Podgląd CV
                                </TabsTrigger>
                                <TabsTrigger value="projects" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none px-0 text-sm font-medium text-muted-foreground">
                                    Dopasowane Projekty ({matches.length})
                                </TabsTrigger>
                                <TabsTrigger value="favorites" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none px-0 text-sm font-medium text-muted-foreground">
                                    Ulubione ({favorites.length})
                                </TabsTrigger>
                                <TabsTrigger value="profile360" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none px-0 text-sm font-medium text-muted-foreground">
                                    Profil 360°
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* CV VIEW (Integrated into Profile Tab for seamless split-screen experience) */}
                        <TabsContent value="profile" className="flex-1 m-0 overflow-hidden data-[state=inactive]:!hidden" forceMount={undefined}>
                            <div className="flex flex-col h-full">
                            <div className="flex-1 relative bg-[#1a1c1e]">
                                <div className="absolute top-4 right-6 z-10 flex gap-2">
                                    <AdminCVUpload candidateId={candidate.id} />
                                    {candidate.cv_url && (
                                        <Button variant="outline" size="sm" className="bg-background/50 backdrop-blur-sm border-white/10 text-white" asChild>
                                            <a href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/${candidate.cv_url.split('/').map(encodeURIComponent).join('/')}`} target="_blank" rel="noopener noreferrer">
                                                <Download className="w-4 h-4 mr-2" />
                                                Pobierz
                                            </a>
                                        </Button>
                                    )}
                                </div>
                                {candidate.cv_url ? (
                                    <ClientCVPreview
                                        url={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/${candidate.cv_url.split('/').map(encodeURIComponent).join('/')}`}
                                        isPdf={candidate.cv_url.toLowerCase().endsWith('.pdf')}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 border-2 border-dashed border-white/5 rounded-2xl m-8">
                                        <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center text-2xl opacity-50">📄</div>
                                        <div className="text-center">
                                            <p className="font-medium">Brak wgranego CV</p>
                                            <p className="text-xs">Użyj przycisku &quot;Aktualizuj CV&quot;, aby dodać plik.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            </div>
                        </TabsContent>

                        {/* PROJECTS TAB */}
                        <TabsContent value="projects" className="flex-1 m-0 overflow-y-auto p-6 data-[state=inactive]:!hidden">
                            <CandidateProjectList matches={matches} candidateId={candidate.id} candidateName={candidate.full_name || 'Konsultant'} candidateEmail={candidate.email || undefined} />
                        </TabsContent>

                        {/* FAVORITES TAB */}
                        <TabsContent value="favorites" className="flex-1 m-0 overflow-y-auto p-6 data-[state=inactive]:!hidden">
                            <FavoriteProjectsSection
                                favorites={favorites}
                                title={`Ulubione projekty: ${candidate.full_name}`}
                                emptyMessage="Kandydat nie oznaczył projektów jako ulubione."
                                showRemoveButton={false}
                            />
                        </TabsContent>

                        {/* PROFILE 360 TAB */}
                        <TabsContent value="profile360" className="flex-1 m-0 overflow-y-auto p-6 data-[state=inactive]:!hidden">
                            <CandidateProfile360Tab candidateId={candidate.id} candidateName={candidate.full_name || 'Konsultant'} />
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    )
}

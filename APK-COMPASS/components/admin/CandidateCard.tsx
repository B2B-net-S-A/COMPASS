'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Mail, User as UserIcon, Clock, Target } from 'lucide-react'
import { ClientDate } from '@/components/common/ClientDate'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { useRouter } from 'next/navigation'
import { MatchedProject } from '@/lib/actions/candidates'
import { MatchAnalysisDialog } from "./MatchAnalysisDialog"
import { DeleteCandidateButton } from './DeleteCandidateButton'
import { Checkbox } from "@/components/ui/checkbox"

interface CandidateCardProps {
    candidate: any
    isSelected?: boolean
    onToggleSelect?: (id: string) => void
    initialMatches?: MatchedProject[]
}

export function CandidateCard({ candidate, isSelected, onToggleSelect, initialMatches }: CandidateCardProps) {
    const router = useRouter()
    const [isOpen, setIsOpen] = useState(false)
    const [selectedProject, setSelectedProject] = useState<MatchedProject | null>(null)
    const [analysisOpen, setAnalysisOpen] = useState(false)
    const [matches, setMatches] = useState<MatchedProject[]>(initialMatches || [])
    const [loadingMatches, setLoadingMatches] = useState(false)

    const fetchMatches = async () => {
        // Only skip if already loading OR we have "real" projects (not pseudo-matches)
        const hasRealMatches = matches.length > 0 && 'title' in matches[0]
        if (loadingMatches || hasRealMatches) return

        setLoadingMatches(true)
        try {
            const { getMatchingProjectsForCandidate } = await import('@/lib/actions/candidates')
            const data = await getMatchingProjectsForCandidate(candidate.id)
            setMatches(data)
        } catch (error) {
            console.error('Failed to fetch matches:', error)
        } finally {
            setLoadingMatches(false)
        }
    }

    return (
        <Card className={`bg-card border-white/10 transition-colors flex flex-col h-full relative group ${isSelected ? 'border-slate-200/50 bg-muted/10' : 'hover:border-slate-200/50'}`}>
            {onToggleSelect && (
                <div className="absolute top-4 left-4 z-20">
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect(candidate.id)}
                        className="border-white/20 data-[state=checked]:bg-slate-200 data-[state=checked]:border-slate-200 h-5 w-5 bg-black/50 backdrop-blur-sm"
                    />
                </div>
            )}
            <CardHeader className={`flex flex-row items-center justify-between gap-4 space-y-0 pb-2 ${onToggleSelect ? 'pl-12' : ''}`}>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-secondary/30 flex items-center justify-center text-slate-200 font-bold border border-white/10 overflow-hidden relative">
                        {candidate.avatar_url ? (
                            <Image
                                src={candidate.avatar_url}
                                alt={candidate.full_name || 'Candidate'}
                                fill
                                sizes="40px"
                                loading="lazy"
                                className="object-cover"
                            />
                        ) : (
                            candidate.full_name ? candidate.full_name[0] : '?'
                        )}
                    </div>
                    <div className="min-w-0">
                        <CardTitle className="text-lg font-bold truncate">{candidate.full_name || 'Nieznany'}</CardTitle>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <ClientDate date={candidate.created_at} />
                        </div>
                    </div>
                </div>
                <DeleteCandidateButton id={candidate.id} name={candidate.full_name} />
            </CardHeader>
            <CardContent className="space-y-4 flex-1 flex flex-col">
                <div className="space-y-3 text-sm text-gray-300">

                    {/* 2. Technologies / Skills (Moved to top as requested) */}
                    {candidate.skills && candidate.skills.length > 0 && (
                        <div className="space-y-1 mb-2">
                            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Umiejętności:</span>
                            <div className="flex flex-wrap gap-1">
                                {candidate.skills.slice(0, 5).map((skill: string, i: number) => (
                                    <Badge key={i} variant="outline" className="text-xs border-slate-200/30 text-foreground">
                                        {skill}
                                    </Badge>
                                ))}
                                {candidate.skills.length > 5 && (
                                    <Badge variant="outline" className="text-xs border-white/10 text-gray-500">
                                        +{candidate.skills.length - 5}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 2a. Clients (New) */}
                    {candidate.previous_clients && candidate.previous_clients.length > 0 && (
                        <div className="space-y-1 mb-2">
                            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Klienci / Projekty:</span>
                            <div className="flex flex-wrap gap-1">
                                {candidate.previous_clients.slice(0, 3).map((client: string, i: number) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-burgundy/10 text-foreground border border-burgundy/20">
                                        {client}
                                    </span>
                                ))}
                                {candidate.previous_clients.length > 3 && (
                                    <span className="text-[10px] px-2 py-0.5 text-muted-foreground">
                                        +{candidate.previous_clients.length - 3}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 3. Status (with label) */}
                    <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Dostępność:</span>
                        <div className="flex flex-wrap gap-2">
                            <Badge
                                variant="outline"
                                className={`uppercase text-[10px] flex items-center gap-1.5 py-1 px-2 ${candidate.current_status === 'available_from' ? 'bg-primary/10 text-slate-200 border-primary/30' :
                                    ['fte_1_0', 'fte_0_5', 'fte_0_25', 'open'].includes(candidate.current_status) ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                                        candidate.current_status === 'blocked' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                                            candidate.current_status === 'notice_period' ? 'bg-slate-600/10 text-slate-600 border-slate-600/30' :
                                                candidate.current_status === 'busy' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' :
                                                    'bg-red-500/10 text-red-400 border-red-500/30'
                                    }`}
                            >
                                <span>
                                    {candidate.current_status === 'available_from' ? '🔵' :
                                        ['fte_1_0', 'fte_0_5', 'fte_0_25', 'open'].includes(candidate.current_status) ? '🟢' :
                                            candidate.current_status === 'blocked' ? '🔴' :
                                                candidate.current_status === 'notice_period' ? '⚫' :
                                                    candidate.current_status === 'busy' ? '🟡' : '🟠'}
                                </span>
                                {candidate.current_status === 'available_from' ? `Od ${candidate.available_from}` :
                                    candidate.current_status === 'fte_1_0' ? '1.0 FTE' :
                                        candidate.current_status === 'fte_0_5' ? '0.5 FTE' :
                                            candidate.current_status === 'fte_0_25' ? '0.25 FTE' :
                                                candidate.current_status === 'blocked' ? 'Zablokowany' :
                                                    candidate.current_status === 'notice_period' ? 'Notice' :
                                                        candidate.current_status === 'busy' ? 'Zajęty' :
                                                            candidate.current_status === 'open' ? 'Dostępny' : 'Niedostępny'}
                            </Badge>

                            {/* Capacity Info if relevant */}
                            {candidate.max_monthly_hours && (
                                <Badge variant="outline" className="text-[10px] border-white/5 text-slate-600">
                                    Max: {candidate.max_monthly_hours}h/mc
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* 4. Project (with label) */}
                    {candidate.project_sentiment && candidate.project_sentiment.length > 0 && (
                        <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Nastawienie do projektu:</span>
                            <div className="flex flex-wrap gap-1">
                                {candidate.project_sentiment.map((sent: string, i: number) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/30 text-white border border-white/5">
                                        {sent === 'super' ? '🚀 Super' :
                                            sent === 'change_willing' ? '🔄 Chętnie zmienię' :
                                                sent === 'manager_issues' ? '⚠️ Problemy z managerem' :
                                                    sent === 'low_growth' ? '📉 Mało rozwojowy' :
                                                        sent === 'needs_training' ? '📚 Wymaga szkoleń' :
                                                            sent === 'extra_work' ? '➕ Chcę dodatkowy' : sent}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 5. Additional Work (with label) */}
                    <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Prace dodatkowe:</span>
                        <div className="flex gap-2 flex-wrap">
                            {[
                                { id: 'verifier', status: candidate.verifier_status, icon: '🛡️', label: 'Weryfikator' },
                                { id: 'ambassador', status: candidate.ambassador_status, icon: '🚩', label: 'Ambasador' },
                                { id: 'sales', status: candidate.sales_support_status, icon: '💰', label: 'Sprzedaż' }
                            ].map((role) => {
                                if (!role.status || role.status === 'not_interested') return null;
                                const colorClass = role.status === 'active'
                                    ? 'text-green-400 bg-green-500/10 border-green-500/30'
                                    : (role.status === 'interested'
                                        ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
                                        : 'text-gray-400 bg-gray-500/10 border-gray-500/30');
                                return (
                                    <div key={role.id} className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] ${colorClass}`} title={`${role.label}: ${role.status}`}>
                                        <span>{role.icon}</span>
                                        <span>{role.label}</span>
                                    </div>
                                )
                            })}
                            {/* Show placeholder if no additional work */}
                            {(!candidate.verifier_status || candidate.verifier_status === 'not_interested') &&
                                (!candidate.ambassador_status || candidate.ambassador_status === 'not_interested') &&
                                (!candidate.sales_support_status || candidate.sales_support_status === 'not_interested') && (
                                    <span className="text-[10px] text-gray-600 italic">Brak</span>
                                )}
                        </div>
                    </div>

                    {/* 6. Other Elements */}
                    <div className="pt-2 border-t border-white/5 space-y-2">
                        <Badge variant="outline" className="border-slate-200/30 text-foreground mb-1">
                            {candidate.experience_years || 0} lat exp
                        </Badge>

                        {candidate.email && (
                            <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-slate-200" />
                                <span className="truncate">{candidate.email}</span>
                            </div>
                        )}
                        {candidate.phone && (
                            <div className="flex items-center gap-2">
                                <div className="w-4 flex justify-center">
                                    <span className="text-slate-200 text-xs">📞</span>
                                </div>
                                <span className="truncate">{candidate.phone}</span>
                            </div>
                        )}
                    </div>

                </div>

                <div className="flex-1" />

                <div className="pt-2 flex gap-2">
                    <button
                        type="button"
                        onClick={() => router.push(`/admin/candidates/${candidate.id}?tab=profile`)}
                        className="flex-1 flex items-center justify-center gap-2 text-xs py-2 rounded-md bg-secondary/30 text-gray-300 hover:bg-slate-200/10 hover:text-slate-200 border border-white/5 transition-colors cursor-pointer"
                    >
                        <UserIcon className="w-3 h-3" />
                        Profil
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push(`/admin/candidates/${candidate.id}?tab=profile`)}
                        className="flex-1 flex items-center justify-center gap-2 text-xs py-2 rounded-md bg-secondary/30 text-gray-300 hover:bg-slate-200/10 hover:text-slate-200 border border-white/5 transition-colors cursor-pointer"
                    >
                        <FileText className="w-3 h-3" />
                        CV
                    </button>
                </div>

                {/* Matching Projects Section (Moved below actions for cleaner DOM) */}
                <div className="pt-4 mt-auto">
                    <Dialog open={isOpen} onOpenChange={(open) => {
                        setIsOpen(open)
                        if (open) fetchMatches()
                    }}>
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                className={`w-full justify-start gap-4 border-dashed border-2 h-auto py-3 px-4 ${matches.length > 0
                                    ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                                    : 'border-white/10 text-muted-foreground hover:bg-white/5'
                                    }`}
                            >
                                <Target className={`w-5 h-5 shrink-0 ${loadingMatches ? 'animate-spin' : ''}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">
                                        Dopasowane Projekty ({matches.length})
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-center">
                                            <span className="text-xs text-green-400 font-medium">&gt;90%</span>
                                            <span className="text-lg font-bold leading-none">{matches.filter(m => m.similarity >= 0.9).length}</span>
                                        </div>
                                        <div className="w-px h-6 bg-white/10" />
                                        <div className="flex flex-col items-center">
                                            <span className="text-xs text-yellow-400 font-medium">&gt;70%</span>
                                            <span className="text-lg font-bold leading-none">{matches.filter(m => m.similarity >= 0.7).length}</span>
                                        </div>
                                        <div className="w-px h-6 bg-white/10" />
                                        <div className="flex flex-col items-center">
                                            <span className="text-xs text-orange-400 font-medium">&gt;50%</span>
                                            <span className="text-lg font-bold leading-none">{matches.filter(m => m.similarity >= 0.5).length}</span>
                                        </div>
                                    </div>
                                </div>
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl bg-[#0f0f1a] border-white/10 text-white">
                            <DialogHeader>
                                <DialogTitle>Dopasowane Projekty: {candidate.full_name}</DialogTitle>
                                <DialogDescription>
                                    Lista projektów, które najlepiej odpowiadają profilowi kompetencyjnemu kandydata.
                                </DialogDescription>
                            </DialogHeader>

                            <ScrollArea className="max-h-[60vh] pr-4">
                                {loadingMatches ? (
                                    <div className="text-center py-12 text-muted-foreground animate-pulse">Analizowanie dopasowań...</div>
                                ) : (
                                    <div className="space-y-4">
                                        {matches.map((project) => {
                                            const score = Math.round(project.similarity * 100)
                                            let colorClass = "bg-red-500/10 text-red-500 border-red-500/20"
                                            if (score >= 80) colorClass = "bg-green-500/10 text-green-400 border-green-500/20"
                                            else if (score >= 50) colorClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"

                                            return (
                                                <div key={project.id}
                                                    onClick={() => {
                                                        setSelectedProject(project)
                                                        setAnalysisOpen(true)
                                                    }}
                                                    className="p-4 rounded-lg bg-secondary/20 border border-white/10 hover:border-slate-200/50 transition-colors cursor-pointer group/match">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <h4 className="font-bold text-lg text-white flex items-center gap-2 group-hover/match:text-slate-200 transition-colors">
                                                                {project.title}
                                                            </h4>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <Badge variant="outline" className={`border ${colorClass}`}>
                                                                    {score}% {project.ai_recommendation ? `- ${project.ai_recommendation}` : 'Dopasowania'}
                                                                </Badge>
                                                                <Badge variant="outline" className="text-[10px] border-white/10 text-gray-500">
                                                                    Analiza AI
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                        <Button size="sm" className="bg-burgundy hover:bg-foreground text-white"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                window.location.href = `/admin/referrals?project=${project.id}&candidate=${candidate.id}`
                                                            }}>
                                                            Przypisz
                                                        </Button>
                                                    </div>
                                                    {project.ai_reasoning && (
                                                        <p className="text-xs text-slate-200/80 italic mb-2 px-2 py-1 bg-muted/10 border-l-2 border-slate-200/30">
                                                            &quot;{project.ai_reasoning}&quot;
                                                        </p>
                                                    )}
                                                    <p className="text-sm text-gray-400 line-clamp-2 mb-3">
                                                        {project.description}
                                                    </p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {project.required_skills?.map((skill, i) => (
                                                            <Badge key={i} variant="secondary" className="text-[10px] bg-black/40 text-gray-300">
                                                                {skill}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        {matches.length === 0 && (
                                            <div className="text-center py-12 text-muted-foreground">
                                                Brak pasujących projektów dla tego kandydata (przy obecnym progu dopasowania).
                                            </div>
                                        )}
                                    </div>
                                )}
                            </ScrollArea>
                        </DialogContent>
                    </Dialog>
                </div>

                {selectedProject && (
                    <MatchAnalysisDialog
                        open={analysisOpen}
                        onOpenChange={setAnalysisOpen}
                        projectId={selectedProject.id}
                        candidateId={candidate.id}
                        candidateName={candidate.full_name}
                        score={Math.round(selectedProject.similarity * 100)}
                    />
                )}
            </CardContent>
        </Card>
    )
}

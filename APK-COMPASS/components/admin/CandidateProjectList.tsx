'use client'

import { useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MatchAnalysisDialog } from "@/components/admin/MatchAnalysisDialog"
import { MatchedProject } from '@/lib/actions/candidates'
import { ReferralWizard } from "@/components/referrals/ReferralWizard"
import { Share2, Sparkles, RefreshCw } from 'lucide-react'

interface CandidateProjectListProps {
    matches: MatchedProject[]
    candidateId: string
    candidateName?: string
    candidateEmail?: string
}

export function CandidateProjectList({ matches, candidateId, candidateName = 'Kandydata', candidateEmail }: CandidateProjectListProps) {
    const [selectedProject, setSelectedProject] = useState<MatchedProject | null>(null)
    const [analysisOpen, setAnalysisOpen] = useState(false)
    const [referralOpen, setReferralOpen] = useState(false)
    const [referralProject, setReferralProject] = useState<MatchedProject | null>(null)
    const [isScoring, setIsScoring] = useState(false)
    const [scoringResult, setScoringResult] = useState<string | null>(null)

    const handleAIScoring = async () => {
        setIsScoring(true)
        setScoringResult(null)
        try {
            const { triggerAIScoringForCandidate } = await import('@/lib/actions/candidates')
            const result = await triggerAIScoringForCandidate(candidateId)
            if (result.scored > 0) {
                setScoringResult(`Przeanalizowano ${result.scored} projektów. Odśwież stronę aby zobaczyć wyniki.`)
            } else {
                setScoringResult('Wszystkie projekty mają już ocenę AI.')
            }
        } catch {
            setScoringResult('Błąd podczas AI scoringu.')
        } finally {
            setIsScoring(false)
        }
    }

    // Check if any projects lack AI scores
    const unscoredCount = matches.filter(m => !m.ai_recommendation).length

    return (
        <div className="grid gap-4">
            {/* AI Scoring Banner */}
            {unscoredCount > 0 && (
                <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-burgundy/10 to-burgundy/10 border border-burgundy/20">
                    <div className="flex items-center gap-3">
                        <Sparkles className="w-5 h-5 text-foreground" />
                        <div>
                            <p className="text-sm font-medium text-white">{unscoredCount} projektów bez oceny AI</p>
                            <p className="text-xs text-slate-600">Uruchom AI scoring aby uzyskać precyzyjniejsze dopasowania</p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-burgundy/30 text-foreground hover:bg-burgundy/20"
                        onClick={handleAIScoring}
                        disabled={isScoring}
                    >
                        {isScoring ? (
                            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Analizuję...</>
                        ) : (
                            <><Sparkles className="w-4 h-4 mr-2" /> Uruchom AI Scoring</>
                        )}
                    </Button>
                </div>
            )}
            {scoringResult && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-300">
                    {scoringResult}
                </div>
            )}

            {matches.map((project) => {
                const score = Math.round(project.similarity * 100)
                let colorClass = "bg-red-500/10 text-red-500 border-red-500/20" // Default < 50%
                if (score >= 80) colorClass = "bg-green-500/10 text-green-400 border-green-500/20"
                else if (score >= 50) colorClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"

                return (
                    <Card
                        key={project.id}
                        className="bg-card border-white/10 hover:border-slate-200/50 transition-colors cursor-pointer group/match"
                        onClick={() => {
                            setSelectedProject(project)
                            setAnalysisOpen(true)
                        }}
                    >
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h4 className="font-bold text-lg text-white flex items-center gap-2 group-hover/match:text-slate-200 transition-colors">
                                        {project.title}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className={`border ${colorClass}`}>
                                            {score}% Dopasowania
                                        </Badge>
                                    </div>
                                </div>
                                <Button
                                    className="bg-burgundy hover:bg-burgundy text-white"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setReferralProject(project)
                                        setReferralOpen(true)
                                    }}
                                >
                                    <Share2 className="w-4 h-4 mr-2" />
                                    Rekomenduj
                                </Button>
                            </div>
                            <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                                {project.description}
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {project.required_skills?.slice(0, 5).map((skill, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs bg-black/40 text-gray-300 border border-white/5">
                                        {skill}
                                    </Badge>
                                ))}
                                {(project.required_skills?.length || 0) > 5 && (
                                    <Badge variant="secondary" className="text-xs bg-black/40 text-gray-500 border border-white/5">
                                        +{project.required_skills.length - 5}
                                    </Badge>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )
            })}

            {matches.length === 0 && (
                <div className="text-center py-12 text-muted-foreground rounded-lg border border-dashed border-white/10">
                    Brak pasujących projektów dla tego kandydata (przy obecnym progu dopasowania).
                </div>
            )}

            {selectedProject && (
                <MatchAnalysisDialog
                    open={analysisOpen}
                    onOpenChange={setAnalysisOpen}
                    projectId={selectedProject.id}
                    candidateId={candidateId}
                    candidateName={candidateName}
                    score={Math.round(selectedProject.similarity * 100)}
                />
            )}

            {referralProject && (
                <ReferralWizard
                    projectId={referralProject.id}
                    projectTitle={referralProject.title}
                    isOpen={referralOpen}
                    onOpenChange={setReferralOpen}
                    candidateId={candidateId}
                    candidateName={candidateName}
                    candidateEmail={candidateEmail}
                />
            )}
        </div>
    )
}

'use client'

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Flag, Shield } from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import { analyzeMatch, MatchAnalysis } from "@/lib/actions/match-analysis"

interface MatchAnalysisDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    projectId: string
    candidateId: string
    candidateName: string
    score: number
    onAnalysisComplete?: (newScore: number, recommendation?: string) => void
}

export function MatchAnalysisDialog({
    open,
    onOpenChange,
    projectId,
    candidateId,
    candidateName,
    score,
    onAnalysisComplete
}: MatchAnalysisDialogProps) {
    const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchAnalysis = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await analyzeMatch(projectId, candidateId)
            setAnalysis(result)
            if (onAnalysisComplete) {
                onAnalysisComplete(result.match_score_verification, result.recommendation)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed')
        } finally {
            setLoading(false)
        }
    }, [projectId, candidateId])

    useEffect(() => {
        if (open && projectId && candidateId) {
            fetchAnalysis()
        }
    }, [open, projectId, candidateId, fetchAnalysis])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] bg-[#1a1a2e] border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center justify-between">
                        <span>Analiza Dopasowania</span>
                        <Badge variant="outline"
                            className={`text-sm border-0 ${(analysis?.match_score_verification ?? score) >= 80 ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' :
                                (analysis?.match_score_verification ?? score) >= 50 ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' :
                                    'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                }`}>
                            Score: {analysis?.match_score_verification ?? score}%
                        </Badge>
                    </DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Analiza AI dla dopasowania: <span className="text-white font-medium">{candidateName}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                            <p className="text-sm text-gray-400">Analizowanie profilu i wymagań...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-8 text-red-400 space-y-4">
                            <AlertTriangle className="w-8 h-8 mx-auto" />
                            <p>{error}</p>
                            <Button variant="outline" onClick={fetchAnalysis} className="border-red-500/30 hover:bg-red-500/10 text-red-400">
                                Spróbuj ponownie
                            </Button>
                        </div>
                    ) : analysis ? (
                        <ScrollArea className="h-[60vh] pr-4">
                            <div className="space-y-6">
                                {/* Summary */}
                                <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                                    <h4 className="text-sm font-semibold text-slate-200 mb-2 uppercase tracking-wider">Werdykt AI</h4>
                                    <p className="text-sm text-gray-300 leading-relaxed">
                                        {analysis.summary}
                                    </p>
                                    <div className="mt-2 text-xs font-mono text-gray-500">
                                        Status: {analysis.recommendation}
                                    </div>
                                </div>

                                {/* Strong Points */}
                                <div>
                                    <h4 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4" /> Mocne Strony
                                    </h4>
                                    <ul className="space-y-2">
                                        {analysis.strong_points.map((point, i) => (
                                            <li key={i} className="text-sm text-gray-300 flex items-start gap-2 bg-green-900/10 p-2 rounded border border-green-500/10">
                                                <span className="text-green-500 mt-0.5">•</span>
                                                {point}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Missing Requirements */}
                                <div>
                                    <h4 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                                        <XCircle className="w-4 h-4" /> Braki / Ryzyka
                                    </h4>
                                    <ul className="space-y-2">
                                        {analysis.missing_requirements.length > 0 ? (
                                            analysis.missing_requirements.map((point, i) => (
                                                <li key={i} className="text-sm text-gray-300 flex items-start gap-2 bg-red-900/10 p-2 rounded border border-red-500/10">
                                                    <span className="text-red-500 mt-0.5">•</span>
                                                    {point}
                                                </li>
                                            ))
                                        ) : (
                                            <li className="text-sm text-gray-500 italic pl-6">Brak istotnych braków.</li>
                                        )}
                                    </ul>
                                </div>

                                {/* Negotiation Points */}
                                {analysis.negotiation_points && analysis.negotiation_points.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
                                            <Flag className="w-4 h-4" /> Punkty Negocjacyjne
                                        </h4>
                                        <ul className="space-y-2">
                                            {analysis.negotiation_points.map((point, i) => (
                                                <li key={i} className="text-sm text-gray-300 flex items-start gap-2 bg-yellow-900/10 p-2 rounded border border-yellow-500/10">
                                                    <span className="text-yellow-500 mt-0.5">•</span>
                                                    {point}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Confidence */}
                                <div className="pt-2 flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                                    <Shield className={`w-3 h-3 ${analysis.confidence === 'high' ? 'text-green-500' : analysis.confidence === 'medium' ? 'text-yellow-500' : 'text-red-500'}`} />
                                    Confidence: {analysis.confidence}
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <Button variant="outline" size="sm" onClick={fetchAnalysis} className="text-xs border-white/10 hover:bg-white/5 text-gray-400">
                                        <RefreshCw className="w-3 h-3 mr-2" /> Odśwież analizę
                                    </Button>
                                </div>
                            </div>
                        </ScrollArea>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    )
}

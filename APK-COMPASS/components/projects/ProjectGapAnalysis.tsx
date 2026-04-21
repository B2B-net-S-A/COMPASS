'use client'

import { useState } from 'react'
import { analyzeGap } from '@/lib/actions/admin'
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

interface GapAnalysisResult {
    match_score?: number
    matching_skills?: string[]
    missing_skills?: string[]
    explanation?: string
    error?: string
}

export function ProjectGapAnalysis({ projectId, projectTitle }: { projectId: string, projectTitle: string }) {
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<GapAnalysisResult | null>(null)

    const handleAnalyze = async () => {
        setLoading(true)
        try {
            const data = await analyzeGap(projectId)
            setResult(data)
        } catch (error) {
            console.error(error)
            setResult({ error: 'Nie udało się przeprowadzić analizy.' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full border-slate-200/50 text-slate-200 hover:bg-slate-200/10">
                    🤖 Analiza AI
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1A1A2E] border-white/10 text-white max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
                        Analiza Dopasowania: <span className="text-slate-200">{projectTitle}</span>
                    </DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Szczegółowa ocena Twoich kompetencji w kontekście tego projektu.
                    </DialogDescription>
                </DialogHeader>

                {!result && !loading && (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <p className="text-center text-muted-foreground">
                            Kliknij, aby poprosić AI o porównanie Twojego Bio z wymaganiami projektu.
                        </p>
                        <Button onClick={handleAnalyze} className="bg-gradient-to-r from-foreground to-burgundy">
                            Rozpocznij Analizę
                        </Button>
                    </div>
                )}

                {loading && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-12 w-12 animate-spin text-slate-200" />
                        <p className="mt-4 text-slate-200">AI analizuje Twoje kompetencje...</p>
                    </div>
                )}

                {result && !loading && (
                    <ScrollArea className="max-h-[60vh] pr-4">
                        {result.error ? (
                            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 p-4 rounded-lg">
                                <AlertCircle /> {result.error}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Score */}
                                <div className="flex items-center justify-between bg-white/5 p-4 rounded-lg border border-white/10">
                                    <span className="text-lg font-medium">Ocena Dopasowania</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-3xl font-bold ${(result.match_score || 0) >= 80 ? 'text-green-500' :
                                                (result.match_score || 0) >= 50 ? 'text-yellow-500' : 'text-red-500'
                                            }`}>
                                            {result.match_score}%
                                        </span>
                                    </div>
                                </div>

                                {/* Lists */}
                                <div className="grid md:grid-cols-2 gap-4">
                                    {/* Matches */}
                                    <div className="space-y-3">
                                        <h3 className="font-semibold text-green-400 flex items-center gap-2">
                                            <CheckCircle2 size={18} /> Twoje Mocne Strony
                                        </h3>
                                        <ul className="space-y-2">
                                            {result.matching_skills?.map((skill, i) => (
                                                <li key={i} className="bg-green-500/10 text-green-300 px-3 py-2 rounded text-sm border border-green-500/20">
                                                    {skill}
                                                </li>
                                            ))}
                                            {(!result.matching_skills || result.matching_skills.length === 0) && (
                                                <li className="text-gray-500 italic text-sm">Brak idealnych dopasowań.</li>
                                            )}
                                        </ul>
                                    </div>

                                    {/* Gaps */}
                                    <div className="space-y-3">
                                        <h3 className="font-semibold text-red-400 flex items-center gap-2">
                                            <XCircle size={18} /> Braki / Do Rozwoju
                                        </h3>
                                        <ul className="space-y-2">
                                            {result.missing_skills?.map((skill, i) => (
                                                <li key={i} className="bg-red-500/10 text-red-300 px-3 py-2 rounded text-sm border border-red-500/20">
                                                    {skill}
                                                </li>
                                            ))}
                                            {(!result.missing_skills || result.missing_skills.length === 0) && (
                                                <li className="text-gray-500 italic text-sm">Brak widocznych braków!</li>
                                            )}
                                        </ul>
                                    </div>
                                </div>

                                {/* Explanation */}
                                <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                                    <h3 className="font-semibold text-slate-200 mb-2">Komentarz AI</h3>
                                    <p className="text-sm text-gray-300 leading-relaxed">
                                        {result.explanation}
                                    </p>
                                </div>
                            </div>
                        )}
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    )
}

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    AlertTriangle,
    CheckCircle2,
    Info,
    Loader2,
    Target,
    TrendingUp,
    Brain,
    Rocket,
    Map,
    ChevronRight,
    Star,
    Clock,
    Award,
    BarChart3,
    Sparkles,
    FileText,
    ThumbsUp,
    ThumbsDown,
    RefreshCw,
    Users,
    Search,
    Briefcase,
    ArrowUpDown,
} from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { getSkillGaps, ProjectsAnalysis } from '@/lib/actions/development'
import {
    analyzeCVWithAI,
    suggestCareerPathWithAI,
    generateDevelopmentPlanWithAI,
    getCurrentUserRole,
    getConsultantsForSelector,
    matchProjectsWithAI,
    CVAnalysisResult,
    CareerPathResult,
    DevelopmentPlan,
    ConsultantOption,
    ProjectMatchingResult,
} from '@/lib/actions/cv-analysis'

export default function DevelopmentPage() {
    // User role
    const [userRole, setUserRole] = useState<string>('consultant')
    const [currentUserId, setCurrentUserId] = useState<string>('')
    const [isManagerView, setIsManagerView] = useState(false)

    // Consultant selector (for admin/centrala)
    const [consultants, setConsultants] = useState<ConsultantOption[]>([])
    const [selectedConsultantId, setSelectedConsultantId] = useState<string>('')
    const [consultantSearch, setConsultantSearch] = useState('')
    const [showConsultantDropdown, setShowConsultantDropdown] = useState(false)

    // Skill gaps (existing)
    const [analysis, setAnalysis] = useState<ProjectsAnalysis | null>(null)
    const [loading, setLoading] = useState(false)
    const [showGapsDialog, setShowGapsDialog] = useState(false)

    // CV Analysis
    const [cvAnalysis, setCvAnalysis] = useState<CVAnalysisResult | null>(null)
    const [cvLoading, setCvLoading] = useState(false)
    const [cvError, setCvError] = useState<string | null>(null)

    // Career Path
    const [careerPath, setCareerPath] = useState<CareerPathResult | null>(null)
    const [careerLoading, setCareerLoading] = useState(false)
    const [careerError, setCareerError] = useState<string | null>(null)
    const [selectedPathIndex, setSelectedPathIndex] = useState(0)

    // Development Plan
    const [devPlan, setDevPlan] = useState<DevelopmentPlan | null>(null)
    const [planLoading, setPlanLoading] = useState(false)
    const [planError, setPlanError] = useState<string | null>(null)

    // Project Matching (new)
    const [projectMatching, setProjectMatching] = useState<ProjectMatchingResult | null>(null)
    const [projectMatchLoading, setProjectMatchLoading] = useState(false)
    const [projectMatchError, setProjectMatchError] = useState<string | null>(null)

    // Webinar interest
    const [webinarInterest, setWebinarInterest] = useState(false)
    const [trainingInterest, setTrainingInterest] = useState(false)

    // Get the target user ID for analysis
    const targetUserId = isManagerView && selectedConsultantId ? selectedConsultantId : currentUserId

    // Selected consultant info
    const selectedConsultant = consultants.find(c => c.id === selectedConsultantId)

    useEffect(() => {
        initPage()
    }, [])

    const initPage = async () => {
        try {
            const roleInfo = await getCurrentUserRole()
            console.log('[Development] User role info:', roleInfo)
            if (roleInfo) {
                setUserRole(roleInfo.role)
                setCurrentUserId(roleInfo.userId)

                if (roleInfo.role === 'admin' || roleInfo.role === 'administrator' || roleInfo.role === 'centrala') {
                    setIsManagerView(true)
                    const list = await getConsultantsForSelector()
                    console.log('[Development] Consultants loaded:', list.length)
                    setConsultants(list)
                }
            }
        } catch (e) {
            console.error('Init failed:', e)
        }

        loadAnalysis()
    }

    const loadAnalysis = async () => {
        setLoading(true)
        try {
            const data = await getSkillGaps()
            setAnalysis(data)
        } catch (error) {
            console.error('Failed to load skill gaps', error)
        } finally {
            setLoading(false)
        }
    }

    // Reset all analyses when consultant changes
    const handleConsultantSelect = (id: string) => {
        setSelectedConsultantId(id)
        setShowConsultantDropdown(false)
        setConsultantSearch('')
        // Reset analyses
        setCvAnalysis(null)
        setCareerPath(null)
        setDevPlan(null)
        setProjectMatching(null)
        setCvError(null)
        setCareerError(null)
        setPlanError(null)
        setProjectMatchError(null)
    }

    const runCVAnalysis = async () => {
        setCvLoading(true)
        setCvError(null)
        try {
            const result = await analyzeCVWithAI(isManagerView ? targetUserId : undefined)
            setCvAnalysis(result)
        } catch (error: unknown) {
            setCvError(error instanceof Error ? error.message : 'Błąd analizy CV')
        } finally {
            setCvLoading(false)
        }
    }

    const runCareerPath = async () => {
        setCareerLoading(true)
        setCareerError(null)
        try {
            const result = await suggestCareerPathWithAI(isManagerView ? targetUserId : undefined)
            setCareerPath(result)
        } catch (error: unknown) {
            setCareerError(error instanceof Error ? error.message : 'Błąd analizy ścieżki')
        } finally {
            setCareerLoading(false)
        }
    }

    const runDevPlan = async () => {
        setPlanLoading(true)
        setPlanError(null)
        try {
            const pathId = careerPath?.primaryPath?.id
            const result = await generateDevelopmentPlanWithAI(
                isManagerView ? targetUserId : undefined,
                pathId
            )
            setDevPlan(result)
        } catch (error: unknown) {
            setPlanError(error instanceof Error ? error.message : 'Błąd generowania planu')
        } finally {
            setPlanLoading(false)
        }
    }

    const runProjectMatching = async () => {
        if (!targetUserId) return
        setProjectMatchLoading(true)
        setProjectMatchError(null)
        try {
            const result = await matchProjectsWithAI(targetUserId)
            setProjectMatching(result)
        } catch (error: unknown) {
            setProjectMatchError(error instanceof Error ? error.message : 'Błąd dopasowania projektów')
        } finally {
            setProjectMatchLoading(false)
        }
    }

    // Safely calculate counts
    const gapsCount = analysis?.gaps.filter(g => g.status === 'has_gaps').length || 0
    const perfectCount = analysis?.perfectMatches || 0
    const uniqueMissingSkills = Array.from(new Set(
        analysis?.gaps
            .filter(g => g.status === 'has_gaps')
            .flatMap(g => g.missingSkills) || []
    ))

    const getScoreColor = (score: number) => {
        if (score >= 75) return 'text-green-400'
        if (score >= 50) return 'text-foreground'
        if (score >= 25) return 'text-amber-400'
        return 'text-red-400'
    }

    const getScoreBg = (score: number) => {
        if (score >= 75) return 'bg-green-500/20 border-green-500/30'
        if (score >= 50) return 'bg-primary/20 border-primary/30'
        if (score >= 25) return 'bg-amber-500/20 border-amber-500/30'
        return 'bg-red-500/20 border-red-500/30'
    }

    const getFitColor = (fit: string) => {
        switch (fit) {
            case 'excellent': return { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', label: 'Doskonałe' }
            case 'good': return { bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-foreground', label: 'Dobre' }
            case 'partial': return { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', label: 'Częściowe' }
            default: return { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', label: 'Niskie' }
        }
    }

    const quarterColors = [
        { bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-foreground', dot: 'bg-primary' },
        { bg: 'bg-burgundy/10', border: 'border-burgundy/20', text: 'text-primary', dot: 'bg-burgundy' },
        { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-500' },
        { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', dot: 'bg-green-500' },
    ]

    // Filtered consultants for search
    const filteredConsultants = consultants.filter(c =>
        c.fullName.toLowerCase().includes(consultantSearch.toLowerCase()) ||
        c.email.toLowerCase().includes(consultantSearch.toLowerCase()) ||
        c.skills.some(s => s.toLowerCase().includes(consultantSearch.toLowerCase()))
    )

    return (
        <div className="min-h-screen bg-black text-white p-6 md:p-12">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
                            <Rocket className="w-8 h-8 text-primary" />
                            Strefa Rozwoju
                        </h1>
                        <p className="text-muted-foreground">
                            {isManagerView
                                ? 'Analiza i rozwój konsultantów — widok Managera'
                                : 'AI-powered analiza Twojej kariery, kompetencji i plan rozwoju.'
                            }
                        </p>
                    </div>
                </div>

                {/* ============================================================ */}
                {/* CONSULTANT SELECTOR — only for admin/centrala */}
                {/* ============================================================ */}
                {isManagerView && (
                    <Card className="bg-gradient-to-r from-indigo-500/10 to-burgundy/10 border-indigo-500/20">
                        <CardContent className="p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <Users className="w-5 h-5 text-indigo-400" />
                                <h3 className="font-semibold text-indigo-300">Wybierz konsultanta do analizy</h3>
                                <Badge variant="outline" className="border-indigo-500/30 text-indigo-300 text-[10px]">
                                    {consultants.length} konsultantów
                                </Badge>
                            </div>

                            <div className="relative">
                                <div className="flex items-center gap-3">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="Szukaj po nazwisku, emailu lub umiejętności..."
                                            value={showConsultantDropdown ? consultantSearch : (selectedConsultant?.fullName || consultantSearch)}
                                            onChange={(e) => {
                                                setConsultantSearch(e.target.value)
                                                setShowConsultantDropdown(true)
                                            }}
                                            onFocus={() => setShowConsultantDropdown(true)}
                                            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50"
                                        />
                                    </div>
                                    {selectedConsultant && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setSelectedConsultantId('')
                                                setCvAnalysis(null)
                                                setCareerPath(null)
                                                setDevPlan(null)
                                                setProjectMatching(null)
                                            }}
                                            className="shrink-0 text-xs"
                                        >
                                            Wyczyść
                                        </Button>
                                    )}
                                </div>

                                {/* Dropdown */}
                                {showConsultantDropdown && (
                                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-white/10 rounded-lg max-h-64 overflow-y-auto shadow-xl">
                                        {filteredConsultants.length === 0 ? (
                                            <div className="p-4 text-sm text-muted-foreground text-center">Brak wyników</div>
                                        ) : (
                                            filteredConsultants.map(c => (
                                                <button
                                                    key={c.id}
                                                    onClick={() => handleConsultantSelect(c.id)}
                                                    className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${
                                                        c.id === selectedConsultantId ? 'bg-indigo-500/10' : ''
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="text-sm font-medium">{c.fullName}</p>
                                                            <p className="text-xs text-muted-foreground">{c.email}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xs text-muted-foreground">{c.experienceYears || 0} lat exp.</p>
                                                            {c.currentStatus && (
                                                                <Badge variant="outline" className="text-[9px] border-white/10 mt-0.5">
                                                                    {c.currentStatus}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {c.skills.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                                            {c.skills.slice(0, 6).map(s => (
                                                                <Badge key={s} className="bg-white/5 text-muted-foreground border-0 text-[9px] h-4 px-1">
                                                                    {s}
                                                                </Badge>
                                                            ))}
                                                            {c.skills.length > 6 && (
                                                                <Badge className="bg-white/5 text-muted-foreground border-0 text-[9px] h-4 px-1">
                                                                    +{c.skills.length - 6}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    )}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Selected consultant summary */}
                            {selectedConsultant && (
                                <div className="mt-3 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold text-indigo-300">{selectedConsultant.fullName}</p>
                                            <p className="text-xs text-muted-foreground">{selectedConsultant.email} | {selectedConsultant.experienceYears} lat doświadczenia</p>
                                        </div>
                                        <Badge variant="outline" className="border-indigo-500/30 text-indigo-300">
                                            {selectedConsultant.skills.length} skills
                                        </Badge>
                                    </div>
                                    {selectedConsultant.skills.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {selectedConsultant.skills.slice(0, 10).map(s => (
                                                <Badge key={s} className="bg-indigo-500/10 text-indigo-300 border-0 text-[10px]">
                                                    {s}
                                                </Badge>
                                            ))}
                                            {selectedConsultant.skills.length > 10 && (
                                                <Badge className="bg-white/5 text-muted-foreground border-0 text-[10px]">
                                                    +{selectedConsultant.skills.length - 10}
                                                </Badge>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Info when no consultant selected (manager view) */}
                {isManagerView && !selectedConsultantId && (
                    <div className="flex items-center gap-2 p-4 rounded-lg bg-indigo-500/5 border border-indigo-500/20 text-indigo-300 text-sm">
                        <Info className="w-4 h-4 shrink-0" />
                        Wybierz konsultanta z listy powyżej, aby uruchomić analizy AI.
                    </div>
                )}

                {/* Diagnostics banner */}
                {analysis?.diagnostics && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
                        <Info className="w-4 h-4 shrink-0" />
                        {analysis.diagnostics}
                    </div>
                )}

                {/* Show tabs only when consultant is selected (manager) or always (consultant) */}
                {(!isManagerView || selectedConsultantId) && (
                    <Tabs defaultValue="cv-analysis" className="w-full">
                        <TabsList className="grid grid-cols-5 bg-white/5 border border-white/10 p-1 rounded-xl h-auto">
                            <TabsTrigger value="cv-analysis" className="data-[state=active]:bg-burgundy data-[state=active]:text-white text-xs sm:text-sm py-2.5 rounded-lg">
                                <Brain className="w-4 h-4 mr-1.5 hidden sm:block" />
                                Analiza CV
                            </TabsTrigger>
                            <TabsTrigger value="career-path" className="data-[state=active]:bg-burgundy data-[state=active]:text-white text-xs sm:text-sm py-2.5 rounded-lg">
                                <Map className="w-4 h-4 mr-1.5 hidden sm:block" />
                                Ścieżka
                            </TabsTrigger>
                            <TabsTrigger value="dev-plan" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-xs sm:text-sm py-2.5 rounded-lg">
                                <Target className="w-4 h-4 mr-1.5 hidden sm:block" />
                                Plan 12M
                            </TabsTrigger>
                            <TabsTrigger value="project-match" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-xs sm:text-sm py-2.5 rounded-lg">
                                <Briefcase className="w-4 h-4 mr-1.5 hidden sm:block" />
                                Projekty
                            </TabsTrigger>
                            <TabsTrigger value="skill-gaps" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-xs sm:text-sm py-2.5 rounded-lg">
                                <BarChart3 className="w-4 h-4 mr-1.5 hidden sm:block" />
                                Kompetencje
                            </TabsTrigger>
                        </TabsList>

                        {/* ====== TAB 1: ANALIZA CV ====== */}
                        <TabsContent value="cv-analysis" className="mt-6 space-y-6">
                            {!cvAnalysis && !cvLoading && (
                                <Card className="bg-gradient-to-br from-burgundy/10 to-primary/10 border-burgundy/20">
                                    <CardContent className="p-8 text-center">
                                        <Brain className="w-16 h-16 text-primary mx-auto mb-4" />
                                        <h2 className="text-2xl font-bold mb-2">
                                            {isManagerView ? `Analiza CV — ${selectedConsultant?.fullName || 'Konsultant'}` : 'AI Analiza Twojego CV'}
                                        </h2>
                                        <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                                            AI przeanalizuje profil, oceni atrakcyjność CV na rynku IT
                                            i wskaże braki oraz rekomendacje.
                                        </p>
                                        <Button onClick={runCVAnalysis} className="bg-burgundy hover:bg-purple-700 text-white px-8 py-3 text-lg" disabled={cvLoading}>
                                            <Sparkles className="w-5 h-5 mr-2" />
                                            Uruchom Analizę AI
                                        </Button>
                                        {cvError && <p className="text-red-400 text-sm mt-4">{cvError}</p>}
                                    </CardContent>
                                </Card>
                            )}

                            {cvLoading && (
                                <Card className="bg-white/5 border-white/10">
                                    <CardContent className="p-12 text-center">
                                        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold mb-2">AI analizuje CV...</h3>
                                        <p className="text-muted-foreground text-sm">Oceniamy umiejętności, doświadczenie i pozycję rynkową.</p>
                                    </CardContent>
                                </Card>
                            )}

                            {cvAnalysis && !cvLoading && (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <Card className={`${getScoreBg(cvAnalysis.overallScore)} border p-6`}>
                                            <div className="text-center">
                                                <div className={`text-5xl font-bold ${getScoreColor(cvAnalysis.overallScore)} mb-2`}>{cvAnalysis.overallScore}</div>
                                                <div className="text-xs text-muted-foreground uppercase tracking-wider">Scoring CV</div>
                                                <div className="mt-2">
                                                    <Badge variant="outline" className={`${getScoreColor(cvAnalysis.overallScore)} border-current`}>
                                                        {cvAnalysis.marketPositionLabel}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </Card>
                                        <Card className="bg-green-500/5 border-green-500/20 p-6">
                                            <div className="flex items-center gap-2 mb-3">
                                                <ThumbsUp className="w-5 h-5 text-green-400" />
                                                <h3 className="font-semibold text-green-400">Mocne strony</h3>
                                            </div>
                                            <ul className="space-y-2">
                                                {cvAnalysis.strengths.map((s, i) => (
                                                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />{s}
                                                    </li>
                                                ))}
                                                {cvAnalysis.strengths.length === 0 && <li className="text-sm text-muted-foreground">Brak danych do analizy</li>}
                                            </ul>
                                        </Card>
                                        <Card className="bg-red-500/5 border-red-500/20 p-6">
                                            <div className="flex items-center gap-2 mb-3">
                                                <ThumbsDown className="w-5 h-5 text-red-400" />
                                                <h3 className="font-semibold text-red-400">Braki w CV</h3>
                                            </div>
                                            <ul className="space-y-2">
                                                {cvAnalysis.weaknesses.map((w, i) => (
                                                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                                                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />{w}
                                                    </li>
                                                ))}
                                            </ul>
                                        </Card>
                                    </div>

                                    <Card className="bg-white/5 border-white/10 p-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Sparkles className="w-5 h-5 text-primary" />
                                            <h3 className="font-semibold">Rekomendacje AI — co poprawić</h3>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {cvAnalysis.recommendations.map((rec, i) => (
                                                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-burgundy/5 border border-burgundy/10">
                                                    <div className="w-6 h-6 rounded-full bg-burgundy/20 flex items-center justify-center shrink-0 mt-0.5">
                                                        <span className="text-xs font-bold text-primary">{i + 1}</span>
                                                    </div>
                                                    <p className="text-sm text-foreground">{rec}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>

                                    <div className="flex items-center gap-2 p-4 rounded-lg bg-white/5 border border-white/10">
                                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                        <p className="text-sm text-foreground">{cvAnalysis.summaryText}</p>
                                    </div>

                                    <div className="flex justify-center">
                                        <Button variant="outline" onClick={runCVAnalysis} className="text-sm">
                                            <RefreshCw className="w-4 h-4 mr-2" />Uruchom ponownie
                                        </Button>
                                    </div>
                                </>
                            )}
                        </TabsContent>

                        {/* ====== TAB 2: ŚCIEŻKA ROZWOJU ====== */}
                        <TabsContent value="career-path" className="mt-6 space-y-6">
                            {!careerPath && !careerLoading && (
                                <Card className="bg-gradient-to-br from-primary/10 to-foreground/10 border-primary/20">
                                    <CardContent className="p-8 text-center">
                                        <Map className="w-16 h-16 text-foreground mx-auto mb-4" />
                                        <h2 className="text-2xl font-bold mb-2">Ścieżka Kariery AI</h2>
                                        <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                                            AI zasugeruje optymalną ścieżkę rozwoju: techniczną, zarządczą, analityczną lub hybrydową.
                                        </p>
                                        <Button onClick={runCareerPath} className="bg-burgundy hover:bg-blue-700 text-white px-8 py-3 text-lg" disabled={careerLoading}>
                                            <Sparkles className="w-5 h-5 mr-2" />Wyznacz Ścieżkę AI
                                        </Button>
                                        {careerError && <p className="text-red-400 text-sm mt-4">{careerError}</p>}
                                    </CardContent>
                                </Card>
                            )}

                            {careerLoading && (
                                <Card className="bg-white/5 border-white/10">
                                    <CardContent className="p-12 text-center">
                                        <Loader2 className="w-12 h-12 animate-spin text-foreground mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold mb-2">AI projektuje ścieżkę kariery...</h3>
                                    </CardContent>
                                </Card>
                            )}

                            {careerPath && !careerLoading && (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {[careerPath.primaryPath, ...careerPath.alternativePaths].map((path, idx) => (
                                            <Card key={path.id || idx} className={`cursor-pointer transition-all ${selectedPathIndex === idx ? 'bg-primary/15 border-primary/40 ring-1 ring-[primary]/30' : 'bg-white/5 border-white/10 hover:border-white/20'}`} onClick={() => setSelectedPathIndex(idx)}>
                                                <CardContent className="p-5">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <span className="text-2xl">{path.icon || '🎯'}</span>
                                                        <div>
                                                            <h3 className="font-bold text-sm">{path.name}</h3>
                                                            {idx === 0 && <Badge className="bg-primary/20 text-blue-300 border-0 text-[10px] mt-0.5">Rekomendowana</Badge>}
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground line-clamp-2">{path.description}</p>
                                                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Clock className="w-3 h-3" />~{path.estimatedTimeMonths || '?'} mies.
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>

                                    {(() => {
                                        const allPaths = [careerPath.primaryPath, ...careerPath.alternativePaths]
                                        const selected = allPaths[selectedPathIndex] || allPaths[0]
                                        if (!selected) return null
                                        return (
                                            <Card className="bg-white/5 border-white/10 p-6">
                                                <div className="flex items-center gap-3 mb-6">
                                                    <span className="text-3xl">{selected.icon}</span>
                                                    <div>
                                                        <h2 className="text-xl font-bold">{selected.name}</h2>
                                                        <p className="text-sm text-muted-foreground">{selected.description}</p>
                                                    </div>
                                                </div>
                                                <div className="relative">
                                                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary via-burgundy to-green-500" />
                                                    <div className="space-y-6">
                                                        {selected.stages.map((stage, i) => (
                                                            <div key={i} className="relative pl-12">
                                                                <div className={`absolute left-2 top-1 w-5 h-5 rounded-full border-2 ${i === 0 ? 'bg-primary border-foreground' : i === selected.stages.length - 1 ? 'bg-green-500 border-green-400' : 'bg-burgundy border-primary'}`} />
                                                                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <h4 className="font-bold text-sm">{stage.title}</h4>
                                                                        <Badge variant="outline" className="text-[10px] border-white/20">{stage.timeframe}</Badge>
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground mb-3">{stage.description}</p>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {stage.skills.map(skill => (
                                                                            <Badge key={skill} className="bg-primary/10 text-blue-300 border-0 text-[10px]">{skill}</Badge>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                {selected.requiredCertifications.length > 0 && (
                                                    <div className="mt-6 p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <Award className="w-4 h-4 text-amber-400" />
                                                            <span className="text-sm font-semibold text-amber-400">Rekomendowane certyfikaty</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {selected.requiredCertifications.map(cert => (
                                                                <Badge key={cert} variant="outline" className="border-amber-500/30 text-amber-300">{cert}</Badge>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </Card>
                                        )
                                    })()}

                                    {careerPath.reasoning && (
                                        <div className="flex items-start gap-2 p-4 rounded-lg bg-primary/5 border border-primary/20">
                                            <Brain className="w-4 h-4 text-foreground mt-0.5 shrink-0" />
                                            <p className="text-sm text-foreground">{careerPath.reasoning}</p>
                                        </div>
                                    )}

                                    <div className="flex justify-center">
                                        <Button variant="outline" onClick={runCareerPath} className="text-sm">
                                            <RefreshCw className="w-4 h-4 mr-2" />Generuj ponownie
                                        </Button>
                                    </div>
                                </>
                            )}
                        </TabsContent>

                        {/* ====== TAB 3: PLAN ROZWOJU 12M ====== */}
                        <TabsContent value="dev-plan" className="mt-6 space-y-6">
                            {!devPlan && !planLoading && (
                                <Card className="bg-gradient-to-br from-green-500/10 to-primary/10 border-green-500/20">
                                    <CardContent className="p-8 text-center">
                                        <Target className="w-16 h-16 text-green-400 mx-auto mb-4" />
                                        <h2 className="text-2xl font-bold mb-2">Plan Rozwoju — 12 Miesięcy</h2>
                                        <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                                            AI wygeneruje spersonalizowany roadmap: kwartał po kwartale.
                                        </p>
                                        <div className="flex flex-col items-center gap-3">
                                            <Button onClick={runDevPlan} className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg" disabled={planLoading}>
                                                <Sparkles className="w-5 h-5 mr-2" />Generuj Plan AI
                                            </Button>
                                            {!careerPath && <p className="text-xs text-muted-foreground">Tip: Najpierw uruchom &quot;Ścieżkę Rozwoju&quot; — plan będzie lepiej dopasowany.</p>}
                                        </div>
                                        {planError && <p className="text-red-400 text-sm mt-4">{planError}</p>}
                                    </CardContent>
                                </Card>
                            )}

                            {planLoading && (
                                <Card className="bg-white/5 border-white/10">
                                    <CardContent className="p-12 text-center">
                                        <Loader2 className="w-12 h-12 animate-spin text-green-400 mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold mb-2">AI buduje roadmap...</h3>
                                    </CardContent>
                                </Card>
                            )}

                            {devPlan && !planLoading && (
                                <>
                                    {devPlan.estimatedRateIncrease && (
                                        <Card className="bg-gradient-to-r from-green-500/10 to-primary/10 border-green-500/20 p-6">
                                            <div className="flex items-center justify-center gap-4">
                                                <TrendingUp className="w-8 h-8 text-green-400" />
                                                <div className="text-center">
                                                    <p className="text-2xl font-bold text-green-400">{devPlan.estimatedRateIncrease}</p>
                                                    <p className="text-xs text-green-400/60">Estymowany wzrost stawki</p>
                                                </div>
                                            </div>
                                        </Card>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {devPlan.quarters.map((q, i) => {
                                            const colors = quarterColors[i] || quarterColors[0]
                                            return (
                                                <Card key={q.quarter} className={`${colors.bg} ${colors.border} border p-6`}>
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className={`w-10 h-10 rounded-xl ${colors.dot} flex items-center justify-center`}>
                                                            <span className="text-white font-bold text-sm">{q.quarter}</span>
                                                        </div>
                                                        <div>
                                                            <h3 className={`font-bold ${colors.text}`}>{q.title}</h3>
                                                            <p className="text-xs text-muted-foreground">Miesiące {i * 3 + 1}–{(i + 1) * 3}</p>
                                                        </div>
                                                    </div>
                                                    <div className="mb-3">
                                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Cele</p>
                                                        <ul className="space-y-1">
                                                            {q.goals.map((goal, gi) => (
                                                                <li key={gi} className="text-xs text-foreground flex items-start gap-2">
                                                                    <Target className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />{goal}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    {q.skills.length > 0 && (
                                                        <div className="mb-3">
                                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Technologie</p>
                                                            <div className="flex flex-wrap gap-1">
                                                                {q.skills.map(skill => (
                                                                    <Badge key={skill} className={`${colors.bg} ${colors.text} border-0 text-[10px]`}>{skill}</Badge>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {q.certifications.length > 0 && (
                                                        <div className="mb-3">
                                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Certyfikaty</p>
                                                            <div className="flex flex-wrap gap-1">
                                                                {q.certifications.map(cert => (
                                                                    <Badge key={cert} variant="outline" className="border-amber-500/30 text-amber-300 text-[10px]">
                                                                        <Award className="w-2.5 h-2.5 mr-0.5" />{cert}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {q.actions.length > 0 && (
                                                        <div>
                                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Akcje</p>
                                                            <ul className="space-y-1">
                                                                {q.actions.map((action, ai) => (
                                                                    <li key={ai} className="text-xs text-muted-foreground flex items-start gap-2">
                                                                        <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />{action}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </Card>
                                            )
                                        })}
                                    </div>

                                    {devPlan.keyMilestones.length > 0 && (
                                        <Card className="bg-white/5 border-white/10 p-6">
                                            <div className="flex items-center gap-2 mb-4">
                                                <Star className="w-5 h-5 text-amber-400" />
                                                <h3 className="font-semibold">Kamienie milowe</h3>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {devPlan.keyMilestones.map((m, i) => (
                                                    <div key={i} className="flex items-center gap-2 p-2 rounded bg-white/5">
                                                        <div className="w-5 h-5 rounded bg-amber-500/20 flex items-center justify-center shrink-0">
                                                            <span className="text-[10px] font-bold text-amber-400">{i + 1}</span>
                                                        </div>
                                                        <span className="text-xs text-foreground">{m}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </Card>
                                    )}

                                    {devPlan.summaryText && (
                                        <div className="flex items-start gap-2 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                                            <Info className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                                            <p className="text-sm text-foreground">{devPlan.summaryText}</p>
                                        </div>
                                    )}

                                    <div className="flex justify-center">
                                        <Button variant="outline" onClick={runDevPlan} className="text-sm">
                                            <RefreshCw className="w-4 h-4 mr-2" />Generuj nowy plan
                                        </Button>
                                    </div>
                                </>
                            )}
                        </TabsContent>

                        {/* ====== TAB 4: DOPASOWANIE PROJEKTÓW (NEW) ====== */}
                        <TabsContent value="project-match" className="mt-6 space-y-6">
                            {!projectMatching && !projectMatchLoading && (
                                <Card className="bg-gradient-to-br from-foreground/10 to-teal-500/10 border-foreground/20">
                                    <CardContent className="p-8 text-center">
                                        <Briefcase className="w-16 h-16 text-foreground mx-auto mb-4" />
                                        <h2 className="text-2xl font-bold mb-2">
                                            {isManagerView ? 'Dopasowanie Projektów do Konsultanta' : 'Twoje Dopasowanie do Projektów'}
                                        </h2>
                                        <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                                            AI przeanalizuje wszystkie projekty z bazy i uszereguje je od najlepszego dopasowania do najsłabszego.
                                            Dla każdego projektu otrzymasz rekomendację.
                                        </p>
                                        <Button onClick={runProjectMatching} className="bg-cyan-600 hover:bg-cyan-700 text-white px-8 py-3 text-lg" disabled={projectMatchLoading}>
                                            <ArrowUpDown className="w-5 h-5 mr-2" />
                                            Analizuj Dopasowanie AI
                                        </Button>
                                        {projectMatchError && <p className="text-red-400 text-sm mt-4">{projectMatchError}</p>}
                                    </CardContent>
                                </Card>
                            )}

                            {projectMatchLoading && (
                                <Card className="bg-white/5 border-white/10">
                                    <CardContent className="p-12 text-center">
                                        <Loader2 className="w-12 h-12 animate-spin text-foreground mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold mb-2">AI rankuje projekty...</h3>
                                        <p className="text-muted-foreground text-sm">Analizujemy dopasowanie umiejętności do wymagań projektów.</p>
                                    </CardContent>
                                </Card>
                            )}

                            {projectMatching && !projectMatchLoading && (
                                <>
                                    {/* Summary header */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <Card className="bg-green-500/5 border-green-500/20 p-4 text-center">
                                            <p className="text-2xl font-bold text-green-400">
                                                {projectMatching.matches.filter(m => m.fitLevel === 'excellent').length}
                                            </p>
                                            <p className="text-[10px] text-green-400/60">Doskonałe</p>
                                        </Card>
                                        <Card className="bg-primary/5 border-primary/20 p-4 text-center">
                                            <p className="text-2xl font-bold text-foreground">
                                                {projectMatching.matches.filter(m => m.fitLevel === 'good').length}
                                            </p>
                                            <p className="text-[10px] text-foreground/60">Dobre</p>
                                        </Card>
                                        <Card className="bg-amber-500/5 border-amber-500/20 p-4 text-center">
                                            <p className="text-2xl font-bold text-amber-400">
                                                {projectMatching.matches.filter(m => m.fitLevel === 'partial').length}
                                            </p>
                                            <p className="text-[10px] text-amber-400/60">Częściowe</p>
                                        </Card>
                                        <Card className="bg-white/5 border-white/10 p-4 text-center">
                                            <p className="text-2xl font-bold">{projectMatching.totalProjectsAnalyzed}</p>
                                            <p className="text-[10px] text-muted-foreground">Projektów w bazie</p>
                                        </Card>
                                    </div>

                                    {/* AI Summary */}
                                    {projectMatching.aiSummary && (
                                        <div className="flex items-start gap-2 p-4 rounded-lg bg-foreground/5 border border-foreground/20">
                                            <Brain className="w-4 h-4 text-foreground mt-0.5 shrink-0" />
                                            <p className="text-sm text-foreground">{projectMatching.aiSummary}</p>
                                        </div>
                                    )}

                                    {/* Project list */}
                                    <div className="space-y-3">
                                        {projectMatching.matches.map((match, idx) => {
                                            const fitStyle = getFitColor(match.fitLevel)
                                            return (
                                                <Card key={match.projectId} className={`${fitStyle.bg} ${fitStyle.border} border`}>
                                                    <CardContent className="p-4">
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-xs font-bold text-muted-foreground w-6">#{idx + 1}</span>
                                                                    <h4 className="font-semibold text-sm">{match.projectTitle}</h4>
                                                                </div>
                                                                {match.description && (
                                                                    <p className="text-xs text-muted-foreground ml-8 mb-2 line-clamp-2">{match.description}</p>
                                                                )}
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <div className={`text-2xl font-bold ${fitStyle.text}`}>{match.matchScore}%</div>
                                                                <Badge className={`${fitStyle.bg} ${fitStyle.text} border-0 text-[10px]`}>
                                                                    {fitStyle.label}
                                                                </Badge>
                                                            </div>
                                                        </div>

                                                        {/* Skills comparison */}
                                                        <div className="ml-8 mt-2 space-y-2">
                                                            {match.matchedSkills.length > 0 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {match.matchedSkills.map(s => (
                                                                        <Badge key={s} variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 text-[10px] h-5 px-1.5">
                                                                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />{s}
                                                                        </Badge>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {match.missingSkills.length > 0 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {match.missingSkills.map(s => (
                                                                        <Badge key={s} variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10 text-[10px] h-5 px-1.5">
                                                                            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />{s}
                                                                        </Badge>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* AI Recommendation */}
                                                        {match.aiRecommendation && (
                                                            <div className="ml-8 mt-2 p-2 rounded bg-white/5 text-xs text-muted-foreground flex items-start gap-2">
                                                                <Sparkles className="w-3 h-3 text-foreground mt-0.5 shrink-0" />
                                                                {match.aiRecommendation}
                                                            </div>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            )
                                        })}

                                        {projectMatching.matches.length === 0 && (
                                            <div className="text-center py-8 text-muted-foreground">
                                                Brak projektów do analizy.
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-center">
                                        <Button variant="outline" onClick={runProjectMatching} className="text-sm">
                                            <RefreshCw className="w-4 h-4 mr-2" />Analizuj ponownie
                                        </Button>
                                    </div>
                                </>
                            )}
                        </TabsContent>

                        {/* ====== TAB 5: ANALIZA KOMPETENCJI ====== */}
                        <TabsContent value="skill-gaps" className="mt-6 space-y-6">
                            <Card className="bg-white/5 border-white/10">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5 text-amber-400" />
                                        Analiza Kompetencji vs Projekty
                                    </CardTitle>
                                    <p className="text-sm text-muted-foreground">
                                        Porównanie umiejętności z wymaganiami Top {analysis?.totalAnalyzed || 10} projektów ({analysis?.totalProjectsInDb || 0} ogółem).
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    {loading ? (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                                            <Loader2 className="w-4 h-4 animate-spin" /> Analizowanie...
                                        </div>
                                    ) : analysis ? (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-4 gap-3">
                                                <div className="text-center p-3 rounded-lg bg-burgundy/10 border border-burgundy/20">
                                                    <p className="text-xl font-bold text-primary">{analysis.userSkillsCount || 0}</p>
                                                    <p className="text-[10px] text-muted-foreground">Skills</p>
                                                </div>
                                                <div className="text-center p-3 rounded-lg bg-white/5 border border-white/10">
                                                    <p className="text-xl font-bold">{analysis.totalAnalyzed || 0}</p>
                                                    <p className="text-[10px] text-muted-foreground">Analizowane</p>
                                                </div>
                                                <div className="text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                                    <p className="text-xl font-bold text-green-400">{perfectCount}</p>
                                                    <p className="text-[10px] text-muted-foreground">Idealne</p>
                                                </div>
                                                <div className="text-center p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                                    <p className="text-xl font-bold text-amber-400">{gapsCount}</p>
                                                    <p className="text-[10px] text-muted-foreground">Z brakami</p>
                                                </div>
                                            </div>

                                            {uniqueMissingSkills.length > 0 && (
                                                <div>
                                                    <p className="text-xs text-muted-foreground mb-2">Najczęściej brakujące:</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {uniqueMissingSkills.slice(0, 12).map(skill => (
                                                            <Badge key={skill} variant="outline" className="border-amber-500/30 text-amber-300 bg-amber-500/10 text-[10px]">{skill}</Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex gap-3">
                                                <Button variant="outline" className="flex-1" onClick={() => setShowGapsDialog(true)} disabled={!analysis}>
                                                    Zobacz szczegóły
                                                </Button>
                                                <Button variant="outline" onClick={loadAnalysis} className="px-3"><RefreshCw className="w-4 h-4" /></Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground text-sm">Brak danych.</div>
                                    )}
                                </CardContent>
                            </Card>

                            {analysis && analysis.totalAnalyzed > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card className="bg-green-500/5 border-green-500/20 p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-green-500/20"><CheckCircle2 className="w-5 h-5 text-green-400" /></div>
                                            <div>
                                                <p className="text-2xl font-bold text-green-400">{perfectCount}/{analysis.totalAnalyzed}</p>
                                                <p className="text-xs text-green-400/60">Pełna zgodność</p>
                                            </div>
                                        </div>
                                    </Card>
                                    <Card className="bg-amber-500/5 border-amber-500/20 p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-amber-500/20"><Target className="w-5 h-5 text-amber-400" /></div>
                                            <div>
                                                <p className="text-2xl font-bold text-amber-400">{uniqueMissingSkills.length}</p>
                                                <p className="text-xs text-amber-400/60">Do rozwoju</p>
                                            </div>
                                        </div>
                                    </Card>
                                    <Card className="bg-burgundy/5 border-burgundy/20 p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-burgundy/20"><TrendingUp className="w-5 h-5 text-primary" /></div>
                                            <div>
                                                <p className="text-2xl font-bold text-primary">{Math.round((perfectCount / analysis.totalAnalyzed) * 100)}%</p>
                                                <p className="text-xs text-primary/60">Gotowość</p>
                                            </div>
                                        </div>
                                    </Card>
                                </div>
                            )}
                        </TabsContent>

                    </Tabs>
                )}
            </div>

            {/* Skill Gaps Dialog */}
            <Dialog open={showGapsDialog} onOpenChange={setShowGapsDialog}>
                <DialogContent className="bg-background border-white/10 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Analiza Kompetencji (Top {analysis?.totalAnalyzed || 0})</DialogTitle>
                        <DialogDescription className="text-muted-foreground">Szczegółowa analiza dopasowania.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        {analysis?.gaps.map((project) => (
                            <div key={project.projectId} className={`p-4 rounded-lg border ${project.status === 'has_gaps' ? 'bg-red-500/5 border-red-500/20' : project.status === 'no_requirements' ? 'bg-muted-foreground/5 border-muted-foreground/20' : 'bg-green-500/5 border-green-500/20'}`}>
                                <h4 className="font-semibold text-white text-sm">{project.projectTitle}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${project.status === 'has_gaps' ? 'bg-red-500/20 text-red-400' : project.status === 'no_requirements' ? 'bg-muted-foreground/20 text-muted-foreground' : 'bg-green-500/20 text-green-400'}`}>
                                        {project.status === 'has_gaps' ? 'Braki' : project.status === 'no_requirements' ? 'Brak wymagań' : 'Zgodność'}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{project.matchScore}%</span>
                                </div>
                                {project.matchedSkills.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {project.matchedSkills.map(s => (
                                            <Badge key={s} variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 text-[10px] h-5 px-1.5">
                                                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />{s}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                                {project.status === 'has_gaps' && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {project.missingSkills.map(s => (
                                            <Badge key={s} variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10 text-[10px] h-5 px-1.5">
                                                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />{s}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

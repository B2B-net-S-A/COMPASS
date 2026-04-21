'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card, CardContent } from '@/components/ui/card'
import {
    UserPlus,
    UserCheck,
    ArrowRight,
    ArrowLeft,
    Upload,
    Check,
    CheckCircle,
    FileText,
    AlertCircle,
    Loader2,
    Target,
    Users
} from 'lucide-react'
import { submitProjectReferral, getSelfReferralCount } from '@/lib/actions/referrals'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useEffect } from 'react'
import { Search } from 'lucide-react'

const externalReferralSchema = z.object({
    candidate_name: z.string().min(5, 'Imię i nazwisko musi zawierać min. 5 znaków (minimum 2 wyrazy)'),
    candidate_email: z.string().email('Niepoprawny adres email'),
    candidate_phone: z.string().min(9, 'Niepoprawny numer telefonu'),
    candidate_linkedin: z.string().url('Niepoprawny adres URL').optional().or(z.literal('')),
    relationship_type: z.enum(['coworker', 'industry_contact', 'former_project', 'linkedin', 'other']),
    recommendation_note: z.string().max(500, 'Maksymalnie 500 znaków').optional(),
    candidate_interested: z.enum(['yes', 'no', 'not_asked']),
    expected_rate: z.string().optional(),
    gdpr_consent: z.boolean().refine(val => val === true, 'Zgoda RODO jest wymagana')
})

const selfReferralSchema = z.object({
    desired_rate_min: z.string().min(1, 'Pole wymagane'),
    desired_rate_max: z.string().min(1, 'Pole wymagane'),
    available_from: z.string().min(1, 'Pole wymagane'),
    engagement_type: z.enum(['full_time', 'half_time', '3_4_days', 'to_be_discussed']),
    cv_is_current: z.boolean(),
    self_referral_note: z.string().max(500, 'Maksymalnie 500 znaków').optional()
})

interface ReferralWizardProps {
    projectId?: string
    projectTitle?: string
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    /** When called from admin candidate detail page, pass candidate info to replace "Zgłaszam siebie" */
    candidateId?: string
    candidateName?: string
    candidateEmail?: string
    /** When true, admin/centrala mode — "Zgłaszam siebie" becomes "Zgłoś konsultanta z bazy" with selector */
    isAdmin?: boolean
    /** Pre-select context to skip context_selection step: 'project' → project_picker, 'general' → type_selection */
    initialContext?: 'project' | 'general'
}

type ReferralContext = 'project' | 'general'
type Step = 'context_selection' | 'project_picker' | 'candidate_picker' | 'type_selection' | 'form' | 'summary'

interface Project {
    id: string
    title: string
    position?: string
    location?: string
}

interface CandidateOption {
    id: string
    full_name: string
    email: string | null
}

export function ReferralWizard({ projectId, projectTitle, isOpen, onOpenChange, candidateId, candidateName, candidateEmail, isAdmin, initialContext }: ReferralWizardProps) {
    // When candidateId is provided, we're in "admin recommending a specific candidate" mode
    const isAdminCandidateMode = !!candidateId
    // When isAdmin is true but no candidateId, we're in "admin browsing projects" mode — show candidate selector
    const isAdminProjectMode = !!isAdmin && !candidateId
    // Determine initial step based on props
    const computeInitialStep = (): Step => {
        if (projectId) return 'type_selection'
        if (initialContext === 'project') return 'project_picker'
        if (initialContext === 'general') return 'type_selection'
        return 'context_selection'
    }
    const initialStep: Step = computeInitialStep()

    const [step, setStep] = useState<Step>(initialStep)
    const [context, setContext] = useState<ReferralContext | null>(projectId ? 'project' : initialContext || null)
    const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(projectId)
    const [selectedProjectTitle, setSelectedProjectTitle] = useState<string | undefined>(projectTitle)
    const [referralType, setReferralType] = useState<'external_person' | 'self_referral' | null>(null)
    const [showSelfReferral, setShowSelfReferral] = useState(!!projectId || initialContext === 'project') // Only show initially if entering from project context
    const [isPending, startTransition] = useTransition()
    const [cvFile, setCvFile] = useState<File | null>(null)
    const [projects, setProjects] = useState<Project[]>([])
    const [loadingProjects, setLoadingProjects] = useState(false)
    const [projectSearch, setProjectSearch] = useState('')

    // Admin candidate selector state (for isAdminProjectMode)
    const [candidates, setCandidates] = useState<CandidateOption[]>([])
    const [loadingCandidates, setLoadingCandidates] = useState(false)
    const [candidateSearch, setCandidateSearch] = useState('')
    const [selectedCandidate, setSelectedCandidate] = useState<CandidateOption | null>(null)

    // Current user profile data (for "Zgłaszam siebie")
    const [currentUserName, setCurrentUserName] = useState<string>('')
    const [currentUserEmail, setCurrentUserEmail] = useState<string>('')

    useEffect(() => {
        const fetchCurrentUser = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setCurrentUserEmail(user.email || '')
                // Fetch full_name from profiles table
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name, email')
                    .eq('id', user.id)
                    .single()
                if (profile) {
                    setCurrentUserName(profile.full_name || user.user_metadata?.full_name || '')
                    if (profile.email) setCurrentUserEmail(profile.email)
                }
            }
        }
        if (isOpen && !isAdminCandidateMode) {
            fetchCurrentUser()
        }
    }, [isOpen, isAdminCandidateMode])

    const externalForm = useForm<z.infer<typeof externalReferralSchema>>({
        resolver: zodResolver(externalReferralSchema),
        defaultValues: {
            candidate_interested: 'not_asked',
            gdpr_consent: false
        }
    })

    const selfForm = useForm<z.infer<typeof selfReferralSchema>>({
        resolver: zodResolver(selfReferralSchema),
        defaultValues: {
            engagement_type: 'full_time',
            cv_is_current: true
        }
    })

    const handleContextSelect = (selectedContext: ReferralContext) => {
        setContext(selectedContext)
        if (selectedContext === 'general') {
            // For general context, we don't need a project, go directly to type selection
            setSelectedProjectId(undefined)
            setSelectedProjectTitle(undefined)
            setShowSelfReferral(false) // Explicitly hide self-referral
            setStep('type_selection')
        } else {
            // For project context, show project picker
            setStep('project_picker')
        }
    }

    const handleProjectSelect = (project: Project) => {
        setSelectedProjectId(project.id)
        setSelectedProjectTitle(project.title)
        setContext('project')
        setShowSelfReferral(true) // Explicitly show self-referral
        setStep('type_selection')
    }

    // Fetch projects when project_picker step is shown
    useEffect(() => {
        if (step === 'project_picker' && projects.length === 0) {
            const fetchProjects = async () => {
                setLoadingProjects(true)
                try {
                    const supabase = createClient()
                    const { data, error } = await supabase
                        .from('projects')
                        .select('id, title, position, location')
                        .order('created_at', { ascending: false })
                        .limit(50)

                    if (error) throw error
                    setProjects(data || [])
                } catch (err) {
                    console.error('Error fetching projects:', err)
                    toast.error('Nie udało się pobrać listy projektów')
                } finally {
                    setLoadingProjects(false)
                }
            }
            fetchProjects()
        }
    }, [step, projects.length])

    // Fetch candidates for admin candidate picker
    useEffect(() => {
        if (step === 'candidate_picker' && candidates.length === 0) {
            const fetchCandidates = async () => {
                setLoadingCandidates(true)
                try {
                    const supabase = createClient()
                    const { data, error } = await supabase
                        .from('candidates')
                        .select('id, full_name, email')
                        .order('full_name', { ascending: true })

                    if (error) throw error
                    setCandidates(data || [])
                } catch (err) {
                    console.error('Error fetching candidates:', err)
                    toast.error('Nie udało się pobrać listy konsultantów')
                } finally {
                    setLoadingCandidates(false)
                }
            }
            fetchCandidates()
        }
    }, [step, candidates.length])

    const onSubmit = (data: any) => {
        setStep('summary')
    }

    const handleFinalSubmit = () => {
        const formData = referralType === 'external_person' ? externalForm.getValues() : selfForm.getValues()

        startTransition(async () => {
            try {
                // Upload CV file if exists
                let cvPath = null
                if (cvFile) {
                    const cvFormData = new FormData()
                    cvFormData.append('file', cvFile)
                    const { uploadReferralCV } = await import('@/lib/actions/files')
                    const uploadResult = await uploadReferralCV(cvFormData)
                    if (uploadResult.success) {
                        cvPath = uploadResult.path
                    } else {
                        throw new Error(uploadResult.error || 'CV upload failed')
                    }
                }

                const payload = {
                    ...formData,
                    project_id: selectedProjectId || undefined,  // Use selectedProjectId, can be undefined for general referrals
                    referral_type: referralType || undefined,
                    cv_file_url: cvPath || undefined,
                    cv_file_name: cvFile?.name,
                    expected_rate: referralType === 'external_person' ? parseFloat((formData as any).expected_rate || '0') : undefined,
                    desired_rate_min: referralType === 'self_referral' ? parseFloat((formData as any).desired_rate_min || '0') : undefined,
                    desired_rate_max: referralType === 'self_referral' ? parseFloat((formData as any).desired_rate_max || '0') : undefined,
                }

                await submitProjectReferral(payload)
                toastSuccess('Rekomendacja została wysłana!')
                onOpenChange(false)
                resetWizard()
            } catch (err: any) {
                toast.error(err.message || 'Wystąpił błąd podczas wysyłania.')
            }
        })
    }

    // Safety check to ensure button visibility consistency
    useEffect(() => {
        if (context === 'project' && !showSelfReferral) {
            setShowSelfReferral(true)
        }
    }, [context, showSelfReferral])

    const handleTypeSelect = async (type: 'external_person' | 'self_referral') => {
        // Logic protection backup:
        if (type === 'self_referral' && context !== 'project') {
            toast.error("Zgłoszenie własne dostępne tylko dla projektów.")
            return
        }

        if (type === 'self_referral') {
            // Validation on CLICK, not on render
            const count = await getSelfReferralCount()
            // Assuming 5 is the limit, or logic from checkCanReferSelf
            if (count >= 5) {
                toast.error("Osiągnięto limit aktywnych zgłoszeń własnych (5).")
                return
            }
            // Removed: setShowSelfReferral check. We trust the button is visible because context is correct.

            setReferralType('self_referral')
            setStep('form')
        } else { // external_person
            setReferralType('external_person')
            setStep('form')
        }
    }


    const resetWizard = () => {
        setStep(computeInitialStep())
        setReferralType('external_person')
        // Don't reset context if it was passed as prop? No, wizard should be clean.
        setContext(projectId ? 'project' : initialContext || null)
        setSelectedProjectId(projectId || undefined)
        externalForm.reset()
        // Force update step logic based on initial props
        const nextStep = computeInitialStep()
        setStep(nextStep)
        setSelectedProjectTitle(projectTitle)
        setReferralType(null)
        setProjectSearch('')
        setShowSelfReferral(!!projectId || initialContext === 'project') // Reset visibility state
        setSelectedCandidate(null)
        setCandidateSearch('')
        externalForm.reset({
            candidate_interested: 'not_asked',
            gdpr_consent: false
        })
        selfForm.reset({
            engagement_type: 'full_time',
            cv_is_current: true
        })
        setCvFile(null)
    }

    const filteredProjects = projects.filter(p =>
        p.title?.toLowerCase().includes(projectSearch.toLowerCase()) ||
        p.position?.toLowerCase().includes(projectSearch.toLowerCase()) ||
        p.location?.toLowerCase().includes(projectSearch.toLowerCase())
    )

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) resetWizard()
            onOpenChange(open)
        }}>
            <DialogContent className="sm:max-w-2xl bg-zinc-950 border-white/10 text-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>


                    <DialogTitle className="text-xl flex items-center gap-2">
                        {step === 'summary' ? (
                            <>🎉 Gratulacje!</>
                        ) : step === 'candidate_picker' ? (
                            <>👤 Wybierz konsultanta</>
                        ) : step === 'project_picker' ? (
                            <>🎯 Wybierz projekt</>
                        ) : context === 'project' ? (
                            <>🎯 Rekomendacja do projektu: <span className="text-slate-200">{selectedProjectTitle}</span></>
                        ) : context === 'general' ? (
                            <>👥 Rekomendacja do puli talentów</>
                        ) : (
                            <>🌟 Program Rekomendacji</>
                        )}
                    </DialogTitle>
                    <DialogDescription className="text-slate-600">
                        {step === 'summary'
                            ? 'Dziękujemy za Twoje zaangażowanie! Twój bonus jest o krok bliżej.'
                            : step === 'candidate_picker'
                                ? 'Wybierz konsultanta z bazy Compass, którego chcesz zgłosić do projektu.'
                                : context === 'project' && step === 'type_selection'
                                    ? (isAdminCandidateMode
                                        ? `Rekomenduj ${candidateName || 'konsultanta'} lub poleć kogoś innego.`
                                        : isAdminProjectMode
                                            ? 'Poleć kogoś nowego lub zgłoś konsultanta z bazy.'
                                            : 'Kogo chcesz zgłosić do tego projektu?')
                                    : 'Wybierz rodzaj rekomendacji, aby rozpocząć proces.'}
                    </DialogDescription>
                </DialogHeader>

                {/* Context Selection Step */}
                {step === 'context_selection' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-8">
                        <button
                            onClick={() => handleContextSelect('project')}
                            className="flex flex-col items-center justify-center p-8 rounded-xl border border-white/10 bg-white/5 hover:bg-slate-200/10 hover:border-slate-200/50 transition-all group"
                        >
                            <div className="w-16 h-16 rounded-full bg-slate-200/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <Target className="w-8 h-8 text-slate-200" />
                            </div>
                            <h3 className="text-lg font-bold mb-2">🎯 Do konkretnego projektu</h3>
                            <p className="text-sm text-slate-600 text-center mb-4">Rekomenduj kandydata do wybranego projektu. Matching engine nada priorytet tej rekomendacji.</p>
                            <div className="text-xs text-foreground bg-slate-200/10 px-3 py-1 rounded-full">
                                Bonus + szybsza ścieżka
                            </div>
                        </button>

                        <button
                            onClick={() => handleContextSelect('general')}
                            className="flex flex-col items-center justify-center p-8 rounded-xl border border-white/10 bg-white/5 hover:bg-primary/10 hover:border-primary/50 transition-all group"
                        >
                            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <Users className="w-8 h-8 text-primary" />
                            </div>
                            <h3 className="text-lg font-bold mb-2">Ogólnie do puli talentów</h3>
                            <p className="text-sm text-slate-600 text-center">Nie masz konkretnego projektu? Zgłoś talent do naszej bazy!</p>
                        </button>
                    </div>
                )}

                {/* Project Picker Step */}
                {step === 'project_picker' && (
                    <div className="space-y-4 py-4">
                        {/* Search Input */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-600" />
                            <Input
                                value={projectSearch}
                                onChange={(e) => setProjectSearch(e.target.value)}
                                placeholder="Szukaj projektu po nazwie, stanowisku lub lokalizacji..."
                                className="pl-10 bg-white/5 border-white/10 focus:border-slate-200/50"
                            />
                        </div>

                        {/* Projects List */}
                        <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
                            {loadingProjects ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-200" />
                                    <span className="ml-2 text-slate-600">Ładowanie projektów...</span>
                                </div>
                            ) : filteredProjects.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-slate-600 text-sm">
                                        {projectSearch ? 'Nie znaleziono projektów pasujących do wyszukiwania' : 'Brak dostępnych projektów'}
                                    </p>
                                </div>
                            ) : (
                                filteredProjects.map((project) => (
                                    <button
                                        key={project.id}
                                        onClick={() => handleProjectSelect(project)}
                                        className="w-full p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-slate-200/10 hover:border-slate-200/50 transition-all text-left group"
                                    >
                                        <h4 className="font-bold text-white group-hover:text-slate-200 transition-colors mb-1">
                                            {project.title}
                                        </h4>
                                        {project.position && (
                                            <p className="text-sm text-slate-600 mb-1">📋 {project.position}</p>
                                        )}
                                        {project.location && (
                                            <p className="text-xs text-slate-600">📍 {project.location}</p>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Back Button */}
                        <div className="flex justify-between items-center pt-4 border-t border-white/10">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    if (initialContext === 'project') {
                                        // Came from referrals page shortcut — close wizard
                                        onOpenChange(false)
                                    } else {
                                        setStep('context_selection')
                                    }
                                    setProjectSearch('')
                                }}
                                className="gap-2 border-white/10 hover:bg-white/5"
                            >
                                <ArrowLeft className="w-4 h-4" /> {initialContext === 'project' ? 'Zamknij' : 'Wstecz'}
                            </Button>
                            <p className="text-xs text-slate-600">
                                {filteredProjects.length} {filteredProjects.length === 1 ? 'projekt' : 'projektów'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Candidate Picker Step (Admin mode from Projects page) */}
                {step === 'candidate_picker' && (
                    <div className="space-y-4 py-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-600" />
                            <Input
                                value={candidateSearch}
                                onChange={(e) => setCandidateSearch(e.target.value)}
                                placeholder="Szukaj konsultanta po imieniu lub emailu..."
                                className="pl-10 bg-white/5 border-white/10 focus:border-burgundy/50"
                            />
                        </div>

                        <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
                            {loadingCandidates ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                    <span className="ml-2 text-slate-600">Ładowanie konsultantów...</span>
                                </div>
                            ) : candidates.filter(c =>
                                c.full_name?.toLowerCase().includes(candidateSearch.toLowerCase()) ||
                                c.email?.toLowerCase().includes(candidateSearch.toLowerCase())
                            ).length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-slate-600 text-sm">
                                        {candidateSearch ? 'Nie znaleziono konsultantów' : 'Brak konsultantów w bazie'}
                                    </p>
                                </div>
                            ) : (
                                candidates.filter(c =>
                                    c.full_name?.toLowerCase().includes(candidateSearch.toLowerCase()) ||
                                    c.email?.toLowerCase().includes(candidateSearch.toLowerCase())
                                ).map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => {
                                            setSelectedCandidate(c)
                                            setReferralType('self_referral')
                                            setStep('form')
                                        }}
                                        className="w-full p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-burgundy/10 hover:border-burgundy/50 transition-all text-left group"
                                    >
                                        <h4 className="font-bold text-white group-hover:text-primary transition-colors">
                                            {c.full_name || 'Nieznany'}
                                        </h4>
                                        {c.email && (
                                            <p className="text-sm text-slate-600">{c.email}</p>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-white/10">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setStep('type_selection')
                                    setCandidateSearch('')
                                }}
                                className="gap-2 border-white/10 hover:bg-white/5"
                            >
                                <ArrowLeft className="w-4 h-4" /> Wstecz
                            </Button>
                            <p className="text-xs text-slate-600">
                                {candidates.filter(c =>
                                    c.full_name?.toLowerCase().includes(candidateSearch.toLowerCase()) ||
                                    c.email?.toLowerCase().includes(candidateSearch.toLowerCase())
                                ).length} konsultantów
                            </p>
                        </div>
                    </div>
                )}

                {/* Type Selection Step */}

                {step === 'type_selection' && (
                    <div className="flex flex-col gap-4">
                        {/* Clear Context Indicator */}
                        <div className="text-xs text-slate-600 font-mono text-center uppercase tracking-widest mb-2">
                            {context === 'project' ? 'Tryb: Projekt' : 'Tryb: Wybór ścieżki'}
                        </div>

                        <div className={cn(
                            "grid gap-4 py-4",
                            context === 'project' ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 max-w-md mx-auto w-full"
                        )}>
                            <button
                                onClick={() => handleTypeSelect('external_person')}
                                className="flex flex-col items-center justify-center p-8 rounded-xl border border-white/10 bg-white/5 hover:bg-slate-200/10 hover:border-slate-200/50 transition-all group"
                            >
                                <div className="w-16 h-16 rounded-full bg-slate-200/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <UserPlus className="w-8 h-8 text-slate-200" />
                                </div>
                                <h3 className="text-lg font-bold mb-2">Polecam kogoś</h3>
                                <p className="text-sm text-slate-600 text-center">Poleć znajomego, kolegę z pracy lub kontakt z rynku.</p>
                            </button>

                            {/* CONDITIONAL RENDER: ONLY SHOW IN PROJECT CONTEXT */}
                            {context === 'project' && (
                                <button
                                    onClick={() => {
                                        if (isAdminProjectMode) {
                                            // Admin without specific candidate → show candidate picker
                                            setStep('candidate_picker')
                                        } else {
                                            handleTypeSelect('self_referral')
                                        }
                                    }}
                                    className="flex flex-col items-center justify-center p-8 rounded-xl border border-white/10 bg-white/5 hover:bg-burgundy/10 hover:border-burgundy/50 transition-all group cursor-pointer relative overflow-hidden"
                                >
                                    <div className="w-16 h-16 rounded-full bg-burgundy/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <UserCheck className="w-8 h-8 text-primary" />
                                    </div>
                                    <h3 className="text-lg font-bold mb-2">
                                        {isAdminCandidateMode ? 'Zgłaszam konsultanta' : isAdminProjectMode ? 'Zgłoś konsultanta z bazy' : 'Zgłaszam siebie'}
                                    </h3>
                                    <p className="text-sm text-slate-600 text-center">
                                        {isAdminCandidateMode
                                            ? `Zgłoś ${candidateName || 'konsultanta'} do tego projektu.`
                                            : isAdminProjectMode
                                                ? 'Wybierz konsultanta z bazy Compass i zgłoś do projektu.'
                                                : 'Chcę wziąć udział w tym projekcie.'
                                        }
                                    </p>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {step === 'form' && referralType === 'external_person' && (
                    <form onSubmit={externalForm.handleSubmit(onSubmit)} className="space-y-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Imię i nazwisko</Label>
                                <Input
                                    {...externalForm.register('candidate_name')}
                                    className="bg-white/5 border-white/10"
                                    placeholder="np. Jan Kowalski"
                                />
                                {externalForm.formState.errors.candidate_name && (
                                    <p className="text-xs text-red-400">{externalForm.formState.errors.candidate_name.message}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input
                                    {...externalForm.register('candidate_email')}
                                    className="bg-white/5 border-white/10"
                                    placeholder="jan.kowalski@example.com"
                                />
                                {externalForm.formState.errors.candidate_email && (
                                    <p className="text-xs text-red-400">{externalForm.formState.errors.candidate_email.message}</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Telefon</Label>
                                <Input
                                    {...externalForm.register('candidate_phone')}
                                    className="bg-white/5 border-white/10"
                                    placeholder="+48 000 000 000"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>LinkedIn (opcjonalnie)</Label>
                                <Input
                                    {...externalForm.register('candidate_linkedin')}
                                    className="bg-white/5 border-white/10"
                                    placeholder="linkedin.com/in/profile"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Label>CV / Resume</Label>
                            <div className={cn(
                                "border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-slate-200/50 hover:bg-white/5 transition-all cursor-pointer relative",
                                cvFile && "border-green-500/50 bg-green-500/5"
                            )}>
                                <input
                                    type="file"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                                    accept=".pdf,.doc,.docx"
                                />
                                {cvFile ? (
                                    <div className="flex items-center justify-center gap-2 text-green-400">
                                        <FileText className="w-6 h-6" />
                                        <span className="font-medium">{cvFile.name} ({(cvFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Upload className="w-8 h-8 mx-auto text-slate-600" />
                                        <p className="text-sm font-medium">Kliknij lub przeciągnij plik CV</p>
                                        <p className="text-xs text-slate-600">PDF, DOCX (Max 10MB)</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Skąd znasz tę osobę?</Label>
                                <Select onValueChange={(val: any) => externalForm.setValue('relationship_type', val)}>
                                    <SelectTrigger className="bg-white/5 border-white/10">
                                        <SelectValue placeholder="Wybierz relację" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="coworker">Kolega z pracy</SelectItem>
                                        <SelectItem value="industry_contact">Znajomy z branży</SelectItem>
                                        <SelectItem value="former_project">Kontakt z projektu</SelectItem>
                                        <SelectItem value="linkedin">Kontakt z LinkedIn</SelectItem>
                                        <SelectItem value="other">Inne</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Czy osoba wie o poleceniu?</Label>
                                <RadioGroup
                                    defaultValue="not_asked"
                                    onValueChange={(val: any) => externalForm.setValue('candidate_interested', val)}
                                    className="flex gap-4 pt-2"
                                >
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="yes" id="r_yes" />
                                        <Label htmlFor="r_yes" className="text-xs">Tak</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="no" id="r_no" />
                                        <Label htmlFor="r_no" className="text-xs">Nie</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="not_asked" id="r_na" />
                                        <Label htmlFor="r_na" className="text-xs">Nie pytałem</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Uzasadnienie (opcjonalnie)</Label>
                            <Textarea
                                {...externalForm.register('recommendation_note')}
                                className="bg-white/5 border-white/10"
                                placeholder="Dlaczego polecasz tę osobę?"
                                rows={2}
                            />
                        </div>

                        <div className="flex items-start space-x-3 p-4 rounded-lg bg-slate-200/5 border border-slate-200/20">
                            <Checkbox
                                id="gdpr"
                                onCheckedChange={(val: boolean) => externalForm.setValue('gdpr_consent', val)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label htmlFor="gdpr" className="text-xs font-medium text-slate-300 cursor-pointer">
                                    Oświadczam, że rekomendowana osoba wyraziła zgodę na przetwarzanie jej danych osobowych zgodnie z RODO.
                                </label>
                                {externalForm.formState.errors.gdpr_consent && (
                                    <p className="text-[10px] text-red-500">{externalForm.formState.errors.gdpr_consent.message}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-between pt-4">
                            <Button type="button" variant="outline" onClick={() => setStep('type_selection')}>
                                <ArrowLeft className="w-4 h-4 mr-2" /> Wstecz
                            </Button>
                            <Button type="submit" className="bg-burgundy hover:bg-slate-200">
                                Dalej <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </form>
                )}

                {step === 'form' && referralType === 'self_referral' && (
                    <form onSubmit={selfForm.handleSubmit(onSubmit)} className="space-y-6 py-4">
                        <Card className="bg-white/5 border-white/10">
                            <CardContent className="pt-6">
                                <p className="text-sm text-slate-600 mb-4">
                                    {(isAdminCandidateMode || selectedCandidate)
                                        ? 'Dane konsultanta pobrane z bazy Compass.'
                                        : 'Twoje dane zostaną pobrane automatycznie z profilu Compass.'
                                    }
                                </p>
                                <div className="grid grid-cols-2 gap-y-3 text-sm">
                                    <div className="text-slate-600">Imię i nazwisko:</div>
                                    <div className="font-medium text-slate-200">
                                        {isAdminCandidateMode
                                            ? (candidateName || 'Nieznany')
                                            : selectedCandidate
                                                ? (selectedCandidate.full_name || 'Nieznany')
                                                : (currentUserName || 'Ładowanie...')}
                                    </div>
                                    <div className="text-slate-600">Email:</div>
                                    <div className="font-medium text-slate-200">
                                        {isAdminCandidateMode
                                            ? (candidateEmail || 'Brak w profilu')
                                            : selectedCandidate
                                                ? (selectedCandidate.email || 'Brak w profilu')
                                                : (currentUserEmail || 'Ładowanie...')}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Stawka od (PLN/h)</Label>
                                <Input
                                    type="number"
                                    {...selfForm.register('desired_rate_min')}
                                    className="bg-white/5 border-white/10"
                                    placeholder="np. 150"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Stawka do (PLN/h)</Label>
                                <Input
                                    type="number"
                                    {...selfForm.register('desired_rate_max')}
                                    className="bg-white/5 border-white/10"
                                    placeholder="np. 200"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Dostępność od</Label>
                                <Input
                                    type="date"
                                    {...selfForm.register('available_from')}
                                    className="bg-white/5 border-white/10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Wymiar zaangażowania</Label>
                                <Select onValueChange={(val: any) => selfForm.setValue('engagement_type', val)}>
                                    <SelectTrigger className="bg-white/5 border-white/10">
                                        <SelectValue placeholder="Wybierz..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="full_time">Pełny etat</SelectItem>
                                        <SelectItem value="half_time">Pół etatu</SelectItem>
                                        <SelectItem value="3_4_days">3-4 dni / tyg.</SelectItem>
                                        <SelectItem value="to_be_discussed">Do uzgodnienia</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Dodatkowy komentarz (opcjonalnie)</Label>
                            <Textarea
                                {...selfForm.register('self_referral_note')}
                                className="bg-white/5 border-white/10"
                                placeholder="Co chcesz przekazać PM-owi?"
                                rows={3}
                            />
                        </div>

                        <div className="flex justify-between pt-4">
                            <Button type="button" variant="outline" onClick={() => setStep('type_selection')}>
                                <ArrowLeft className="w-4 h-4 mr-2" /> Wstecz
                            </Button>
                            <Button type="submit" className="bg-burgundy hover:bg-burgundy text-white">
                                Dalej <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </form>
                )}

                {step === 'summary' && (
                    <div className="py-4 space-y-6">
                        <div className="p-6 rounded-xl bg-white/5 border border-white/10 space-y-4">
                            <div className="flex items-center gap-2 text-slate-200 font-bold border-b border-white/5 pb-2">
                                <CheckCircle className="w-5 h-5" /> Podsumowanie danych
                            </div>

                            {referralType === 'external_person' ? (
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between"><span className="text-slate-600">Imię i nazwisko:</span> <span>{externalForm.getValues('candidate_name')}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-600">Email:</span> <span>{externalForm.getValues('candidate_email')}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-600">Relacja:</span> <span>{externalForm.getValues('relationship_type')}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-600">Plik CV:</span> <span className="text-slate-200">{cvFile?.name}</span></div>
                                </div>
                            ) : (
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between"><span className="text-slate-600">Stawka:</span> <span>{selfForm.getValues('desired_rate_min')} - {selfForm.getValues('desired_rate_max')} PLN/h</span></div>
                                    <div className="flex justify-between"><span className="text-slate-600">Start:</span> <span>{selfForm.getValues('available_from')}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-600">Wymiar:</span> <span>{selfForm.getValues('engagement_type')}</span></div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-200/80 leading-relaxed">
                                Każda rekomendacja jest weryfikowana przez dział rekrutacji i PM-a projektu. O statusie zostaniesz poinformowany drogą mailową oraz w panelu Compass.
                            </p>
                        </div>

                        <div className="flex justify-between pt-4">
                            <Button type="button" variant="outline" disabled={isPending} onClick={() => setStep('form')}>
                                <ArrowLeft className="w-4 h-4 mr-2" /> Edytuj dane
                            </Button>
                            <Button
                                onClick={handleFinalSubmit}
                                disabled={isPending}
                                className={cn(
                                    "px-8",
                                    referralType === 'external_person' ? "bg-burgundy hover:bg-slate-200" : "bg-burgundy hover:bg-burgundy"
                                )}
                            >
                                {isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Wysyłanie...
                                    </>
                                ) : (
                                    <>
                                        Wyślij rekomendację <Check className="w-4 h-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

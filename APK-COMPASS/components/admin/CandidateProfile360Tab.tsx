'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Code2, Award, Briefcase, MapPin, Clock, DollarSign } from "lucide-react"
import { getConsultantProfile360 } from '@/lib/actions/matching'
import { addAdminNote } from '@/lib/actions/admin-notes'
import { AdminNotesSection, type AdminNote } from '@/components/profile/sections/AdminNotesSection'
import { Shimmer } from '@/components/ui/shimmer-skeleton'

interface TechItem {
    name: string
    level: string
    category: string
}

interface Certification {
    name: string
    issuer: string
    date_obtained?: string
    expiry_date?: string
    credential_url?: string
}

interface WorkPreferences {
    preferred_locations?: string[]
    work_mode?: string
    min_rate?: number | null
    max_rate?: number | null
    preferred_industries?: string[]
    notice_period?: string
    preferred_contract_type?: string
}

const LEVEL_COLORS: Record<string, string> = {
    junior: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    mid: 'bg-green-500/20 text-green-300 border-green-500/30',
    senior: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    expert: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
}

const CATEGORY_LABELS: Record<string, string> = {
    language: 'Języki',
    framework: 'Frameworki',
    database: 'Bazy danych',
    cloud: 'Cloud',
    tool: 'Narzędzia',
    other: 'Inne',
}

const WORK_MODE_LABELS: Record<string, string> = {
    remote: 'Zdalnie',
    hybrid: 'Hybrydowo',
    onsite: 'Stacjonarnie',
    flexible: 'Elastycznie',
}

const NOTICE_LABELS: Record<string, string> = {
    immediately: 'Natychmiast',
    '1_week': '1 tydzień',
    '2_weeks': '2 tygodnie',
    '1_month': '1 miesiąc',
    '2_months': '2 miesiące',
    '3_months': '3 miesiące',
}

interface CandidateProfile360TabProps {
    candidateId: string
    candidateName: string
}

export function CandidateProfile360Tab({ candidateId, candidateName }: CandidateProfile360TabProps) {
    const [profile, setProfile] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadProfile()
    }, [candidateId])

    const loadProfile = async () => {
        setLoading(true)
        setError(null)
        const result = await getConsultantProfile360(candidateId)
        if (result.success && 'profile' in result) {
            setProfile(result.profile)
        } else {
            setError('error' in result ? result.error : 'Nie udało się pobrać profilu')
        }
        setLoading(false)
    }

    const handleAddNote = async (data: { content: string; category: string }) => {
        const result = await addAdminNote(candidateId, data.content, data.category)
        if (result.success) {
            await loadProfile()
        }
    }

    if (loading) {
        return (
            <div className="space-y-4">
                <Shimmer className="h-32 w-full" />
                <Shimmer className="h-24 w-full" />
                <Shimmer className="h-40 w-full" />
            </div>
        )
    }

    if (error || !profile) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">{error || 'Brak danych profilu 360°'}</p>
            </div>
        )
    }

    const techStack: TechItem[] = (profile.tech_stack as TechItem[]) || []
    const certifications: Certification[] = (profile.certifications as Certification[]) || []
    const workPrefs: WorkPreferences = (profile.work_preferences as WorkPreferences) || {}
    const adminNotes: AdminNote[] = (profile.admin_notes as AdminNote[]) || []

    const groupedTech = techStack.reduce<Record<string, TechItem[]>>((acc, tech) => {
        const cat = tech.category || 'other'
        if (!acc[cat]) acc[cat] = []
        acc[cat].push(tech)
        return acc
    }, {})

    return (
        <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">Profil 360° — {candidateName}</h2>

            {/* Tech Stack */}
            <Card className="bg-background/50 border-white/10">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Code2 className="h-4 w-4 text-primary" />
                        Tech Stack ({techStack.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {techStack.length > 0 ? (
                        <div className="space-y-4">
                            {Object.entries(groupedTech).map(([cat, items]) => (
                                <div key={cat}>
                                    <p className="text-xs text-muted-foreground mb-2">{CATEGORY_LABELS[cat] || cat}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {items.map((tech, i) => (
                                            <Badge
                                                key={`${tech.name}-${i}`}
                                                variant="outline"
                                                className={`text-xs px-2.5 py-1 ${LEVEL_COLORS[tech.level] || ''}`}
                                            >
                                                {tech.name}
                                                <span className="opacity-60 ml-1 text-[10px]">{tech.level}</span>
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Brak zdefiniowanego tech stacku</p>
                    )}
                </CardContent>
            </Card>

            {/* Certifications */}
            <Card className="bg-background/50 border-white/10">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Award className="h-4 w-4 text-primary" />
                        Certyfikaty ({certifications.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {certifications.length > 0 ? (
                        <div className="space-y-2">
                            {certifications.map((cert, i) => {
                                const isExpired = cert.expiry_date && new Date(cert.expiry_date) < new Date()
                                const isExpiringSoon = cert.expiry_date && !isExpired &&
                                    new Date(cert.expiry_date).getTime() - Date.now() < 60 * 24 * 60 * 60 * 1000

                                return (
                                    <div key={`${cert.name}-${i}`} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                        <div>
                                            <p className="text-sm text-white font-medium">{cert.name}</p>
                                            <p className="text-xs text-muted-foreground">{cert.issuer}</p>
                                            {cert.date_obtained && (
                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                    Uzyskany: {new Date(cert.date_obtained).toLocaleDateString('pl-PL')}
                                                    {cert.expiry_date && ` · Wygasa: ${new Date(cert.expiry_date).toLocaleDateString('pl-PL')}`}
                                                </p>
                                            )}
                                        </div>
                                        <Badge variant="outline" className={`text-[10px] ${
                                            isExpired ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                                            isExpiringSoon ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                            'bg-green-500/20 text-green-300 border-green-500/30'
                                        }`}>
                                            {isExpired ? 'Wygasł' : isExpiringSoon ? 'Wygasa' : 'Ważny'}
                                        </Badge>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Brak certyfikatów</p>
                    )}
                </CardContent>
            </Card>

            {/* Work Preferences */}
            <Card className="bg-background/50 border-white/10">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-primary" />
                        Preferencje pracy
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {(workPrefs.work_mode || workPrefs.preferred_locations?.length || workPrefs.min_rate) ? (
                        <>
                            <div className="flex flex-wrap gap-2">
                                {workPrefs.work_mode && (
                                    <Badge variant="outline" className="text-xs">
                                        {WORK_MODE_LABELS[workPrefs.work_mode] || workPrefs.work_mode}
                                    </Badge>
                                )}
                                {workPrefs.preferred_contract_type && (
                                    <Badge variant="outline" className="text-xs">
                                        {workPrefs.preferred_contract_type === 'both' ? 'B2B / UoP' : workPrefs.preferred_contract_type.toUpperCase()}
                                    </Badge>
                                )}
                                {(workPrefs.min_rate || workPrefs.max_rate) && (
                                    <Badge variant="outline" className="text-xs gap-1">
                                        <DollarSign className="h-3 w-3" />
                                        {workPrefs.min_rate || '?'}–{workPrefs.max_rate || '?'} PLN/h
                                    </Badge>
                                )}
                                {workPrefs.notice_period && (
                                    <Badge variant="outline" className="text-xs gap-1">
                                        <Clock className="h-3 w-3" />
                                        {NOTICE_LABELS[workPrefs.notice_period] || workPrefs.notice_period}
                                    </Badge>
                                )}
                            </div>
                            {workPrefs.preferred_locations && workPrefs.preferred_locations.length > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1.5">Preferowane lokalizacje</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {workPrefs.preferred_locations.map(loc => (
                                            <Badge key={loc} variant="outline" className="text-[11px] gap-1 bg-emerald-500/10 border-emerald-500/20 text-emerald-300">
                                                <MapPin className="h-3 w-3" />
                                                {loc}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {workPrefs.preferred_industries && workPrefs.preferred_industries.length > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1.5">Preferowane branże</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {workPrefs.preferred_industries.map(ind => (
                                            <Badge key={ind} variant="outline" className="text-[11px] bg-blue-500/10 border-blue-500/20 text-blue-300">
                                                {ind}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">Brak zdefiniowanych preferencji</p>
                    )}
                </CardContent>
            </Card>

            {/* Admin Notes */}
            <AdminNotesSection
                notes={adminNotes}
                onAddNote={handleAddNote}
                canAdd={true}
            />
        </div>
    )
}

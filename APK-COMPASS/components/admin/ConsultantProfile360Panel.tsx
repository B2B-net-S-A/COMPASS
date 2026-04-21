'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { X, User, Mail, Phone, Calendar, Code2, Award, Briefcase, MapPin, Clock, DollarSign } from "lucide-react"
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

interface ConsultantProfile360PanelProps {
    consultantId: string
    consultantName: string
    onClose: () => void
}

export function ConsultantProfile360Panel({ consultantId, consultantName, onClose }: ConsultantProfile360PanelProps) {
    const [profile, setProfile] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'overview' | 'tech' | 'notes'>('overview')

    useEffect(() => {
        loadProfile()
    }, [consultantId])

    const loadProfile = async () => {
        setLoading(true)
        const result = await getConsultantProfile360(consultantId)
        if (result.success && 'profile' in result) {
            setProfile(result.profile)
        }
        setLoading(false)
    }

    const handleAddNote = async (data: { content: string; category: string }) => {
        const result = await addAdminNote(consultantId, data.content, data.category)
        if (result.success) {
            await loadProfile()
        }
    }

    if (loading) {
        return (
            <Card className="bg-background/50 border-white/10">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-4">
                        <Shimmer className="w-14 h-14 rounded-full" />
                        <div className="space-y-2 flex-1">
                            <Shimmer className="h-5 w-48" />
                            <Shimmer className="h-4 w-32" />
                        </div>
                    </div>
                    <Shimmer className="h-24 w-full" />
                </CardContent>
            </Card>
        )
    }

    if (!profile) return null

    const techStack: TechItem[] = (profile.tech_stack as TechItem[]) || []
    const certifications: Certification[] = (profile.certifications as Certification[]) || []
    const workPrefs: WorkPreferences = (profile.work_preferences as WorkPreferences) || {}
    const adminNotes: AdminNote[] = (profile.admin_notes as AdminNote[]) || []
    const skills: string[] = profile.skills || []

    const tabs = [
        { id: 'overview' as const, label: 'Przegląd', icon: '📊' },
        { id: 'tech' as const, label: 'Tech & Certyfikaty', icon: '💻' },
        { id: 'notes' as const, label: `Notatki (${adminNotes.length})`, icon: '📝' },
    ]

    return (
        <Card className="bg-background/50 border-primary/20">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={profile.avatar_url} />
                            <AvatarFallback className="bg-primary/20 text-primary text-sm">
                                {profile.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '?'}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="text-white">{profile.full_name}</div>
                            <div className="text-xs text-muted-foreground font-normal">{profile.email}</div>
                        </div>
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex gap-1.5 mt-3 overflow-x-auto">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                                activeTab === tab.id
                                    ? 'bg-primary/20 text-primary border border-primary/30'
                                    : 'bg-card/50 text-muted-foreground border border-white/5 hover:bg-muted/50'
                            }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {activeTab === 'overview' && (
                    <>
                        {/* Basic info */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {profile.phone && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Phone className="h-3.5 w-3.5" />
                                    <span className="text-white">{profile.phone}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                <span className="text-white">{profile.experience_years || 0} lat dośw.</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <Badge variant="outline" className="text-[10px]">
                                    {profile.loyalty_tier || 'bronze'} · {profile.loyalty_points || 0} pkt
                                </Badge>
                            </div>
                        </div>

                        {/* Bio */}
                        {profile.bio && (
                            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                <p className="text-xs text-muted-foreground mb-1">Bio</p>
                                <p className="text-sm text-white/80 line-clamp-4">{profile.bio}</p>
                            </div>
                        )}

                        {/* Work preferences summary */}
                        {(workPrefs.work_mode || workPrefs.preferred_locations?.length || workPrefs.min_rate) && (
                            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 space-y-2">
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Briefcase className="h-3.5 w-3.5" /> Preferencje pracy
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {workPrefs.work_mode && (
                                        <Badge variant="outline" className="text-[10px]">
                                            {WORK_MODE_LABELS[workPrefs.work_mode] || workPrefs.work_mode}
                                        </Badge>
                                    )}
                                    {workPrefs.preferred_contract_type && (
                                        <Badge variant="outline" className="text-[10px]">
                                            {workPrefs.preferred_contract_type === 'both' ? 'B2B / UoP' : workPrefs.preferred_contract_type.toUpperCase()}
                                        </Badge>
                                    )}
                                    {(workPrefs.min_rate || workPrefs.max_rate) && (
                                        <Badge variant="outline" className="text-[10px] gap-1">
                                            <DollarSign className="h-3 w-3" />
                                            {workPrefs.min_rate || '?'}–{workPrefs.max_rate || '?'} PLN/h
                                        </Badge>
                                    )}
                                    {workPrefs.notice_period && (
                                        <Badge variant="outline" className="text-[10px] gap-1">
                                            <Clock className="h-3 w-3" />
                                            {NOTICE_LABELS[workPrefs.notice_period] || workPrefs.notice_period}
                                        </Badge>
                                    )}
                                </div>
                                {workPrefs.preferred_locations && workPrefs.preferred_locations.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {workPrefs.preferred_locations.map(loc => (
                                            <Badge key={loc} variant="outline" className="text-[10px] gap-1 bg-emerald-500/10 border-emerald-500/20 text-emerald-300">
                                                <MapPin className="h-3 w-3" />
                                                {loc}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                                {workPrefs.preferred_industries && workPrefs.preferred_industries.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {workPrefs.preferred_industries.map(ind => (
                                            <Badge key={ind} variant="outline" className="text-[10px] bg-blue-500/10 border-blue-500/20 text-blue-300">
                                                {ind}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Skills from CV */}
                        {skills.length > 0 && (
                            <div>
                                <p className="text-xs text-muted-foreground mb-2">Umiejętności (CV)</p>
                                <div className="flex flex-wrap gap-1">
                                    {skills.map(skill => (
                                        <Badge key={skill} variant="outline" className="text-[10px]">{skill}</Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'tech' && (
                    <>
                        {/* Tech Stack */}
                        {techStack.length > 0 ? (
                            <div className="space-y-3">
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Code2 className="h-3.5 w-3.5" /> Tech Stack ({techStack.length})
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {techStack.map((tech, i) => (
                                        <Badge
                                            key={`${tech.name}-${i}`}
                                            variant="outline"
                                            className={`text-xs px-2 py-1 ${LEVEL_COLORS[tech.level] || ''}`}
                                        >
                                            {tech.name}
                                            <span className="opacity-60 ml-1 text-[10px]">{tech.level}</span>
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">Brak zdefiniowanego tech stacku</p>
                        )}

                        {/* Certifications */}
                        {certifications.length > 0 ? (
                            <div className="space-y-3 pt-3 border-t border-white/5">
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Award className="h-3.5 w-3.5" /> Certyfikaty ({certifications.length})
                                </p>
                                <div className="space-y-2">
                                    {certifications.map((cert, i) => {
                                        const isExpired = cert.expiry_date && new Date(cert.expiry_date) < new Date()
                                        const isExpiringSoon = cert.expiry_date && !isExpired &&
                                            new Date(cert.expiry_date).getTime() - Date.now() < 60 * 24 * 60 * 60 * 1000

                                        return (
                                            <div key={`${cert.name}-${i}`} className="flex items-center justify-between p-2 rounded bg-white/[0.02] border border-white/5">
                                                <div>
                                                    <p className="text-sm text-white">{cert.name}</p>
                                                    <p className="text-xs text-muted-foreground">{cert.issuer}</p>
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
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground pt-3 border-t border-white/5">Brak certyfikatów</p>
                        )}
                    </>
                )}

                {activeTab === 'notes' && (
                    <AdminNotesSection
                        notes={adminNotes}
                        onAddNote={handleAddNote}
                        canAdd={true}
                    />
                )}
            </CardContent>
        </Card>
    )
}

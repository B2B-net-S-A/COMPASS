'use client'

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Briefcase, DollarSign, Clock, MapPin, Globe, Pencil, Save, X, CalendarClock, User, Trash2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { ClientDate } from '@/components/common/ClientDate'
import { Project, ProjectMatch } from '@/lib/types'
import { getProjectMatches, updateProject, getMyProjectMatch } from '@/lib/actions/projects'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MatchAnalysisDialog } from "@/components/admin/MatchAnalysisDialog"
import { FavoriteButton } from '@/components/shared/FavoriteButton'
import { ReferralWizard } from '@/components/referrals/ReferralWizard'
import { Share2 } from 'lucide-react'

import { anonymizeProjectText, formatProjectValue } from '@/lib/utils/anonymizer'

interface ProjectCardProps {
    project: Project
    isSelected: boolean
    onToggleSelect: (id: string) => void
    onDelete: (id: string) => void
    onUpdate: (updatedProject: Project) => void
    initialMatches?: ProjectMatch[]
    isFavorite?: boolean
    onFavoriteToggle?: (projectId: string, newState: boolean) => void
    showFavoriteButton?: boolean
    favoriteCount?: number
    isAdmin?: boolean
}

const WORK_TYPE_LABELS: Record<string, string> = {
    hybrid: 'Hybryda',
    remote: 'Zdalnie',
    onsite: 'Stacjonarnie',
}

export function ProjectCard({
    project, isSelected, onToggleSelect, onDelete, onUpdate, initialMatches,
    isFavorite, onFavoriteToggle, showFavoriteButton, favoriteCount,
    isAdmin = true // Default to true to be safe, easier to opt-out
}: ProjectCardProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [editData, setEditData] = useState<Partial<Project>>({})

    // Matches state
    const [matches, setMatches] = useState<ProjectMatch[]>(initialMatches || [])
    const [loadingMatches, setLoadingMatches] = useState(false)
    const [showAllMatches, setShowAllMatches] = useState(false)

    // Analysis Dialog State
    const [analysisOpen, setAnalysisOpen] = useState(false)
    const [selectedMatch, setSelectedMatch] = useState<ProjectMatch | null>(null)

    // Referral Wizard State
    const [referralOpen, setReferralOpen] = useState(false)

    // Consultant Match State
    const [myMatch, setMyMatch] = useState<ProjectMatch | null>(null)
    const [loadingMyMatch, setLoadingMyMatch] = useState(false)

    const handleAnalyzeMyMatch = async () => {
        setLoadingMyMatch(true)
        try {
            const match = await getMyProjectMatch(project.id)
            setMyMatch(match)
        } catch (err) {
            console.error("Failed to analyze match", err)
        } finally {
            setLoadingMyMatch(false)
        }
    }

    const fetchMatches = async () => {
        if (loadingMatches) return
        setLoadingMatches(true)
        try {
            const data = await getProjectMatches(project.id)
            setMatches(data)
        } catch (err) {
            console.error("Failed to load matches", err)
        } finally {
            setLoadingMatches(false)
        }
    }

    const handleMatchClick = (match: ProjectMatch) => {
        setSelectedMatch(match)
        setAnalysisOpen(true)
    }

    const startEdit = () => {
        setEditData({
            position: project.position || '',
            max_rate: project.max_rate || '',
            location: project.location || '',
            work_type: project.work_type || '',
            description: project.description || '',
            description_pl: project.description_pl || '',
            required_languages: project.required_languages || [],
            start_date: project.start_date || '',
            recommendation_deadline: project.recommendation_deadline || '',
            manager_name: project.manager_name || '',
        })
        setIsEditing(true)
    }

    const cancelEdit = () => {
        setIsEditing(false)
        setEditData({})
    }

    const saveEdit = async () => {
        try {
            const updates = { ...editData }
            if (typeof updates.required_languages === 'string') {
                updates.required_languages = (updates.required_languages as unknown as string).split(',').map(s => s.trim()).filter(Boolean)
            }

            await updateProject(project.id, updates)
            onUpdate({ ...project, ...updates })
            setIsEditing(false)
            setEditData({})
        } catch (e: unknown) {
            alert('Błąd zapisu: ' + (e instanceof Error ? e.message : 'Unknown'))
        }
    }

    const workTypeLabel = WORK_TYPE_LABELS[project.work_type || '']

    // Prepare display values
    const displayTitle = isAdmin ? project.title : anonymizeProjectText(project.title)
    const displayDescription = isAdmin ? project.description : anonymizeProjectText(project.description)
    const displayDescriptionPl = isAdmin ? project.description_pl : anonymizeProjectText(project.description_pl)

    const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) => {
        if (!value) return null
        return (
            <div className="flex items-start gap-3 py-1.5">
                <span className="text-gray-500 mt-0.5 shrink-0">{icon}</span>
                <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
                    <div className="text-sm text-gray-200">{value}</div>
                </div>
            </div>
        )
    }

    return (
        <>
            <Card className={`group relative bg-card border-white/10 hover:border-slate-200/30 transition-colors ${isSelected ? 'border-slate-200/50 bg-muted/10' : ''}`}>
                <div className="absolute top-4 left-4 z-10">
                    <Checkbox checked={isSelected}
                        onCheckedChange={() => onToggleSelect(project.id)}
                        className="border-white/20 data-[state=checked]:bg-slate-200 data-[state=checked]:border-slate-200" />
                </div>


                <CardHeader className="pb-2 pl-12">
                    <div className="flex flex-row items-center justify-between gap-4 w-full min-w-0">
                        <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                                <CardTitle className="text-lg font-bold text-white truncate flex-1">{displayTitle}</CardTitle>
                                {showFavoriteButton !== false && (
                                    <FavoriteButton
                                        projectId={project.id}
                                        isFavorite={isFavorite || false}
                                        size="sm"
                                        variant="box"
                                        onToggle={(newState) => onFavoriteToggle?.(project.id, newState)}
                                    />
                                )}
                                {typeof favoriteCount === 'number' && favoriteCount > 0 && (
                                    <Badge variant="secondary" className="text-xs bg-yellow-400/10 text-yellow-400 border-yellow-400/20">
                                        {favoriteCount} zainteresowanych
                                    </Badge>
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 shrink-0">
                                <Clock className="w-3 h-3" /> <ClientDate date={project.created_at} />
                            </div>
                        </div>

                        {!isEditing && (
                            <div className="flex items-center gap-2 shrink-0">
                                {project.file_url && (
                                    <Button variant="outline" size="sm" className="h-8 text-xs border-slate-200/50 text-slate-200 hover:bg-slate-200/10" asChild>
                                        <a href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/${project.file_url.split('/').map(encodeURIComponent).join('/')}`}
                                            target="_blank" rel="noopener noreferrer">
                                            <Briefcase className="w-3 h-3 mr-1.5" /> Szczegóły
                                        </a>
                                    </Button>
                                )}
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="h-8 text-xs bg-burgundy hover:bg-burgundy text-white"
                                    onClick={() => setReferralOpen(true)}
                                >
                                    <Share2 className="w-3 h-3 mr-1.5" /> Rekomenduj
                                </Button>
                                <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block" />
                                <Button variant="outline" size="icon" onClick={startEdit} title="Edytuj"
                                    className="h-8 w-8 rounded-lg border-white/10 text-slate-600 hover:bg-white/5 hover:text-white">
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => onDelete(project.id)} title="Usuń"
                                    className="h-8 w-8 rounded-lg border-white/10 text-red-400 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/50">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardHeader>

                <CardContent className="pl-12">
                    {isEditing ? (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Nazwa profilu</label>
                                    <Input value={editData.position || ''} onChange={(e) => setEditData({ ...editData, position: e.target.value })}
                                        placeholder="np. Senior Java Developer" className="bg-secondary/50 border-white/20 text-white" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Stawka</label>
                                    <Input value={editData.max_rate || ''} onChange={(e) => setEditData({ ...editData, max_rate: e.target.value })}
                                        placeholder="np. 150 PLN/h" className="bg-secondary/50 border-white/20 text-white" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Lokalizacja</label>
                                    <Input value={editData.location || ''} onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                                        placeholder="np. Gdynia, wizyty 1-2x/tyg" className="bg-secondary/50 border-white/20 text-white" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Tryb pracy</label>
                                    <select value={editData.work_type || ''} onChange={(e) => setEditData({ ...editData, work_type: e.target.value })}
                                        title="Tryb pracy" className="w-full h-10 bg-secondary/50 border border-white/20 rounded-md px-3 text-sm text-white">
                                        <option value="">-- Wybierz --</option>
                                        <option value="remote">Zdalnie</option>
                                        <option value="hybrid">Hybryda</option>
                                        <option value="onsite">Stacjonarnie</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Start w projekcie</label>
                                    <Input value={editData.start_date || ''} onChange={(e) => setEditData({ ...editData, start_date: e.target.value })}
                                        placeholder="np. ASAP, 01.03.2025" className="bg-secondary/50 border-white/20 text-white" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Deadline na rekomendacje</label>
                                    <Input value={editData.recommendation_deadline || ''} onChange={(e) => setEditData({ ...editData, recommendation_deadline: e.target.value })}
                                        placeholder="np. 14.02.2025" className="bg-secondary/50 border-white/20 text-white" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Manager</label>
                                <Input value={editData.manager_name || ''} onChange={(e) => setEditData({ ...editData, manager_name: e.target.value })}
                                    placeholder="Imię i nazwisko managera" className="bg-secondary/50 border-white/20 text-white" />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Wymagane języki (przecinek)</label>
                                <Input value={Array.isArray(editData.required_languages) ? editData.required_languages.join(', ') : editData.required_languages || ''}
                                    onChange={(e) => setEditData({ ...editData, required_languages: e.target.value as unknown as string[] })}
                                    placeholder="np. English B2, German C1" className="bg-secondary/50 border-white/20 text-white" />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Opis projektu (EN)</label>
                                <textarea value={editData.description || ''} onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                                    rows={5} placeholder="Project description in English..."
                                    className="w-full bg-secondary/50 border border-white/20 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 resize-none" />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Opis projektu (PL)</label>
                                <textarea value={editData.description_pl || ''} onChange={(e) => setEditData({ ...editData, description_pl: e.target.value })}
                                    rows={5} placeholder="Opis projektu po polsku..."
                                    className="w-full bg-secondary/50 border border-white/20 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 resize-none" />
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-2 border-r border-white/5 pr-6">
                                <InfoRow icon={<Briefcase className="w-4 h-4" />} label="Nazwa profilu" value={project.position} />
                                <InfoRow icon={<DollarSign className="w-4 h-4" />} label="Stawka" value={formatProjectValue(project.max_rate, isAdmin)} />
                                <InfoRow icon={<MapPin className="w-4 h-4" />} label="Lokalizacja / Tryb pracy" value={
                                    [formatProjectValue(project.location, isAdmin), workTypeLabel].filter(v => v && v !== 'N/A' && v !== 'Brak').join(' • ') || (isAdmin ? 'Brak' : 'N/A')
                                } />
                                <InfoRow icon={<CalendarClock className="w-4 h-4" />} label="Start w projekcie" value={formatProjectValue(project.start_date, isAdmin)} />
                                <InfoRow icon={<Clock className="w-4 h-4" />} label="Deadline na rekomendacje" value={formatProjectValue(project.recommendation_deadline, isAdmin)} />

                                {isAdmin && (
                                    <InfoRow icon={<User className="w-4 h-4" />} label="Manager" value={project.manager_name} />
                                )}

                                {project.required_languages && project.required_languages.length > 0 && (
                                    <div className="flex items-center gap-2 flex-wrap pt-1">
                                        <Globe className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-[10px] text-gray-500 uppercase">Języki:</span>
                                        {project.required_languages.map((lang, i) => (
                                            <Badge key={i} variant="outline" className="text-xs border-burgundy/30 text-foreground bg-burgundy/10">{lang}</Badge>
                                        ))}
                                    </div>
                                )}

                                {project.required_skills && project.required_skills.length > 0 && (
                                    <div className="flex flex-wrap gap-1 pt-1">
                                        {project.required_skills.map((skill: string, i: number) => (
                                            <Badge key={i} variant="outline" className="text-xs border-slate-200/30 text-foreground">{skill}</Badge>
                                        ))}
                                    </div>
                                )}

                                {displayDescription && (
                                    <div className="pt-2 border-t border-white/5">
                                        <div className="text-[10px] text-gray-500 uppercase mb-1">Opis (EN):</div>
                                        <p className="text-sm text-gray-400 whitespace-pre-wrap">{displayDescription}</p>
                                    </div>
                                )}

                                {displayDescriptionPl && (
                                    <div className="pt-2 border-t border-white/5">
                                        <div className="text-[10px] text-gray-500 uppercase mb-1">Opis (PL):</div>
                                        <p className="text-sm text-gray-400 whitespace-pre-wrap">{displayDescriptionPl}</p>
                                    </div>
                                )}
                            </div>

                            <div className="lg:col-span-1 space-y-4">
                                <h4 className="text-sm font-medium text-slate-200 flex items-center justify-between border-b border-slate-200/20 pb-2">
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4" />
                                        {isAdmin ? `Dopasowani Konsultanci (${matches.length})` : 'Moje Dopasowanie'}
                                    </div>
                                    {isAdmin && (
                                        <Button variant="ghost" size="icon" onClick={fetchMatches} disabled={loadingMatches}
                                            className="h-6 w-6 text-slate-200 hover:text-slate-200 hover:bg-slate-200/10" title="Odśwież analizę AI">
                                            <RefreshCw className={`w-3 h-3 ${loadingMatches ? 'animate-spin' : ''}`} />
                                        </Button>
                                    )}
                                </h4>

                                {isAdmin ? (
                                    loadingMatches ? (
                                        <div className="text-xs text-gray-500 animate-pulse py-2">Szukam kandydatów...</div>
                                    ) : matches.length > 0 ? (
                                        <div className="space-y-3">
                                            {(showAllMatches ? matches : matches.slice(0, 10)).map(match => (
                                                <div key={match.id}
                                                    onClick={() => handleMatchClick(match)}
                                                    className="flex items-center gap-3 bg-secondary/30 p-2 rounded-md border border-white/5 hover:border-slate-200/30 transition-colors cursor-pointer group/match hover:bg-muted/10">
                                                    <Avatar className="w-8 h-8 border border-white/10">
                                                        <AvatarImage src={match.avatar_url || ''} />
                                                        <AvatarFallback className="bg-muted text-cyan-200 text-xs">
                                                            {match.full_name?.substring(0, 2).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium text-gray-200 truncate group-hover/match:text-slate-200 transition-colors">{match.full_name}</div>
                                                        <div className="text-[10px] text-gray-500 truncate">{match.job_title || 'Konsultant'}</div>
                                                    </div>
                                                    {(() => {
                                                        const score = Math.round(match.similarity * 100)
                                                        let colorClass = "bg-red-500/10 text-red-400 border-red-500/20"
                                                        if (score >= 80) colorClass = "bg-green-500/10 text-green-400 border-green-500/20"
                                                        else if (score >= 50) colorClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"

                                                        return (
                                                            <div className="flex flex-col items-end gap-1">
                                                                <Badge variant="secondary" className={`text-[10px] tabular-nums ${colorClass}`}>
                                                                    {score}%
                                                                </Badge>
                                                                {match.ai_recommendation && (
                                                                    <span className="text-[9px] font-bold tracking-tighter uppercase opacity-70">
                                                                        {match.ai_recommendation}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )
                                                    })()}
                                                </div>
                                            ))}

                                            {matches.length > 10 && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setShowAllMatches(!showAllMatches)}
                                                    className="w-full text-[10px] text-slate-200/70 hover:text-slate-200 hover:bg-slate-200/5 mt-2 h-7"
                                                >
                                                    {showAllMatches ? 'Pokaż mniej' : `Pokaż pozostałe ${matches.length - 10}...`}
                                                </Button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-gray-500 italic py-2">Brak idealnych dopasowań dla tego projektu.</div>
                                    )
                                ) : (
                                    // Consultant View
                                    <div className="space-y-3">
                                        {!myMatch ? (
                                            <div className="flex flex-col gap-3">
                                                <p className="text-xs text-slate-600">
                                                    Sprawdź, jak twoje umiejętności pasują do tego projektu.
                                                </p>
                                                <Button
                                                    onClick={handleAnalyzeMyMatch}
                                                    disabled={loadingMyMatch}
                                                    size="sm"
                                                    className="w-full bg-burgundy/20 text-slate-200 hover:bg-burgundy/30 border border-slate-200/30"
                                                >
                                                    {loadingMyMatch ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : <Briefcase className="w-3 h-3 mr-2" />}
                                                    Analizuj dopasowanie
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="bg-secondary/30 p-3 rounded-lg border border-white/5 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-medium text-slate-300">Twoje dopasowanie:</span>
                                                    {(() => {
                                                        const score = Math.round(myMatch.similarity * 100)
                                                        let colorClass = "bg-red-500/10 text-red-400 border-red-500/20"
                                                        if (score >= 80) colorClass = "bg-green-500/10 text-green-400 border-green-500/20"
                                                        else if (score >= 50) colorClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"

                                                        return (
                                                            <Badge variant="secondary" className={`text-sm tabular-nums ${colorClass}`}>
                                                                {score}%
                                                            </Badge>
                                                        )
                                                    })()}
                                                </div>

                                                {myMatch.ai_reasoning && (
                                                    <div className="text-xs text-slate-600 italic border-l-2 border-white/10 pl-2">
                                                        &quot;{myMatch.ai_reasoning}&quot;
                                                    </div>
                                                )}

                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleMatchClick(myMatch)}
                                                    className="w-full text-xs text-slate-200 hover:text-foreground hover:bg-muted/20 border border-slate-200/20"
                                                >
                                                    <Briefcase className="w-3 h-3 mr-2" />
                                                    Zobacz szczegóły analizy
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>

                <CardFooter className="flex justify-end gap-2 pt-0 pl-12">
                    {isEditing ? (
                        <>
                            <Button variant="outline" size="sm" onClick={cancelEdit} className="text-xs border-white/20 text-gray-400 hover:bg-white/5">
                                <X className="w-3 h-3 mr-1" /> Anuluj
                            </Button>
                            <Button size="sm" onClick={saveEdit} className="text-xs bg-burgundy hover:bg-foreground text-white">
                                <Save className="w-3 h-3 mr-1" /> Zapisz
                            </Button>
                        </>
                    ) : null}
                </CardFooter>
            </Card>

            <ReferralWizard
                projectId={project.id}
                projectTitle={project.title}
                isOpen={referralOpen}
                onOpenChange={setReferralOpen}
                isAdmin={isAdmin}
            />

            {selectedMatch && (
                <MatchAnalysisDialog
                    open={analysisOpen}
                    onOpenChange={setAnalysisOpen}
                    projectId={project.id}
                    candidateId={selectedMatch.id}
                    candidateName={selectedMatch.full_name}
                    score={Math.round(selectedMatch.similarity * 100)}
                    onAnalysisComplete={(newScore, recommendation) => {
                        // Update Admin List
                        setMatches(prev => prev.map(m =>
                            m.id === selectedMatch.id
                                ? { ...m, similarity: newScore / 100, ai_recommendation: recommendation }
                                : m
                        ))

                        // Update Consultant Self-Match
                        if (myMatch && selectedMatch.id === myMatch.id) {
                            setMyMatch(prev => prev ? {
                                ...prev,
                                similarity: newScore / 100,
                                ai_recommendation: recommendation
                            } : null)
                        }
                    }}
                />
            )}
        </>
    )
}

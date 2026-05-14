'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Star, Briefcase, MapPin, DollarSign, ExternalLink, StickyNote } from 'lucide-react'
import { FavoriteButton } from '@/components/shared/FavoriteButton'
import Link from 'next/link'

interface FavoriteProjectData {
    id: string
    project_id: string
    created_at: string
    note: string | null
    project: {
        id: string
        title: string
        description?: string
        description_pl?: string
        position?: string
        max_rate?: string
        location?: string
        work_type?: string
        required_skills?: string[]
        start_date?: string
    }
}

interface FavoriteProjectsSectionProps {
    favorites: FavoriteProjectData[]
    title?: string
    emptyMessage?: string
    showRemoveButton?: boolean
    maxItems?: number
    compact?: boolean
    onFavoriteRemoved?: (projectId: string) => void
}

const WORK_TYPE_LABELS: Record<string, string> = {
    hybrid: 'Hybryda',
    remote: 'Zdalnie',
    onsite: 'Stacjonarnie',
}

export function FavoriteProjectsSection({
    favorites,
    title = 'Ulubione Projekty',
    emptyMessage = 'Nie masz jeszcze ulubionych projektów. Przejdź do Marketplace i oznacz projekty gwiazdką!',
    showRemoveButton = true,
    maxItems = 0,
    compact = false,
    onFavoriteRemoved
}: FavoriteProjectsSectionProps) {
    const displayFavorites = maxItems > 0 ? favorites.slice(0, maxItems) : favorites

    if (favorites.length === 0) {
        return (
            <Card className="bg-card border-white/10">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Star className="w-5 h-5 text-yellow-400" />
                        {title}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-muted-foreground rounded-lg border border-dashed border-white/10">
                        {emptyMessage}
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="bg-card border-white/10">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    {title}
                    <Badge variant="secondary" className="ml-2 bg-yellow-400/10 text-yellow-400 border-yellow-400/20">
                        {favorites.length}
                    </Badge>
                </CardTitle>
                {maxItems > 0 && favorites.length > maxItems && (
                    <Link href="/projects?tab=favorites">
                        <Button variant="ghost" size="sm" className="text-slate-200 hover:text-foreground">
                            Zobacz wszystkie ({favorites.length})
                            <ExternalLink className="w-3 h-3 ml-1" />
                        </Button>
                    </Link>
                )}
            </CardHeader>
            <CardContent className="space-y-3">
                {displayFavorites.map((fav) => (
                    <div
                        key={fav.id}
                        className="group flex items-start gap-3 p-3 rounded-lg border border-white/5 hover:border-slate-200/30 hover:bg-slate-200/5 transition-all"
                    >
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-white truncate group-hover:text-slate-200 transition-colors">
                                    {fav.project.title}
                                </h4>
                            </div>

                            {!compact && (
                                <>
                                    {fav.project.position && (
                                        <p className="text-sm text-muted-foreground mb-1">
                                            <Briefcase className="w-3 h-3 inline mr-1" />
                                            {fav.project.position}
                                        </p>
                                    )}

                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                                        {fav.project.location && (
                                            <span><MapPin className="w-3 h-3 inline mr-0.5" />{fav.project.location}</span>
                                        )}
                                        {fav.project.max_rate && (
                                            <span><DollarSign className="w-3 h-3 inline mr-0.5" />{fav.project.max_rate}</span>
                                        )}
                                        {fav.project.work_type && (
                                            <Badge variant="outline" className="text-xs border-white/10">
                                                {WORK_TYPE_LABELS[fav.project.work_type] || fav.project.work_type}
                                            </Badge>
                                        )}
                                    </div>

                                    {fav.project.required_skills && fav.project.required_skills.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {fav.project.required_skills.slice(0, 4).map((skill, i) => (
                                                <Badge key={i} variant="secondary" className="text-xs bg-black/40 text-gray-300 border border-white/5">
                                                    {skill}
                                                </Badge>
                                            ))}
                                            {fav.project.required_skills.length > 4 && (
                                                <Badge variant="secondary" className="text-xs bg-black/40 text-gray-500 border border-white/5">
                                                    +{fav.project.required_skills.length - 4}
                                                </Badge>
                                            )}
                                        </div>
                                    )}

                                    {fav.note && (
                                        <div className="flex items-start gap-1 text-xs text-yellow-400/70 bg-yellow-400/5 rounded px-2 py-1 mt-1">
                                            <StickyNote className="w-3 h-3 mt-0.5 shrink-0" />
                                            <span className="italic">{fav.note}</span>
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="text-xs text-muted-foreground/50 mt-1">
                                Dodano: {new Date(fav.created_at).toLocaleDateString('pl-PL')}
                            </div>
                        </div>

                        {showRemoveButton && (
                            <FavoriteButton
                                projectId={fav.project_id}
                                isFavorite={true}
                                size="sm"
                                onToggle={(newState) => {
                                    if (!newState) onFavoriteRemoved?.(fav.project_id)
                                }}
                            />
                        )}
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

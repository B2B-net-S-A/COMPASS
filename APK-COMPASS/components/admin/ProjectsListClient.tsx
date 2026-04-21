'use client'

import { createClient } from '@/lib/supabase/client'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, AlertCircle, Trash2, Star } from 'lucide-react'
import { deleteProject, deleteProjects } from '@/lib/actions/projects'
import { getMyFavoriteProjectIds } from '@/lib/actions/favorites'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { Checkbox } from "@/components/ui/checkbox"
import { useEffect, useState, useCallback } from 'react'
import { Project } from '@/lib/types'
import { ProjectCard } from '@/components/admin/ProjectCard'

import { useSearchParams } from 'next/navigation'
import { SearchInput } from '@/components/admin/SearchInput'
import { ProjectSortSelect } from '@/components/admin/ProjectSortSelect'

interface ProjectsListClientProps {
    isAdmin?: boolean
}

export function ProjectsListClient({ isAdmin = true }: ProjectsListClientProps) {
    const [projects, setProjects] = useState<Project[]>([])
    const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [favoriteIds, setFavoriteIds] = useState<string[]>([])
    const [showOnlyFavorites, setShowOnlyFavorites] = useState(false)
    const [summaries, setSummaries] = useState<Record<string, any[]>>({})
    const pageSize = 10
    const [confirm, ConfirmUI] = useConfirm()

    const searchParams = useSearchParams()
    const query = searchParams.get('q')?.toLowerCase() || ''
    const sort = searchParams.get('sort') || 'newest'

    const fetchProjects = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const supabase = createClient()
            const { data, error: sbError } = await supabase
                .from('projects')
                .select('*')
            // .order('created_at', { ascending: false }) // We sort client-side now

            if (sbError) {
                setError(sbError.message)
            } else {
                setProjects(data || [])
                setSelectedProjects(new Set())
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            setError(message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        const loadFavorites = async () => {
            const ids = await getMyFavoriteProjectIds()
            setFavoriteIds(ids)
        }
        loadFavorites()
    }, [])

    // ... handleDelete, toggleSelect, handleBulkDelete unchanged ...
    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Usuń projekt',
            description: 'Czy na pewno chcesz usunąć ten projekt?',
            confirmLabel: 'Usuń',
            variant: 'destructive',
        })
        if (!ok) return
        try {
            await deleteProject(id)
            setProjects(projects.filter(p => p.id !== id))
            const newSelected = new Set(selectedProjects)
            newSelected.delete(id)
            setSelectedProjects(newSelected)
        } catch (e: unknown) {
            alert('Błąd: ' + (e instanceof Error ? e.message : 'Unknown'))
        }
    }

    const toggleSelect = (id: string) => {
        const s = new Set(selectedProjects)
        if (s.has(id)) s.delete(id); else s.add(id)
        setSelectedProjects(s)
    }



    const handleBulkDelete = async () => {
        if (selectedProjects.size === 0) return
        const ok = await confirm({
            title: 'Usuń projekty',
            description: `Czy na pewno chcesz usunąć ${selectedProjects.size} zaznaczonych projektów?`,
            confirmLabel: 'Usuń wszystkie',
            variant: 'destructive',
        })
        if (!ok) return
        try {
            setLoading(true)
            await deleteProjects(Array.from(selectedProjects))
            await fetchProjects()
        } catch (e: unknown) {
            alert('Błąd: ' + (e instanceof Error ? e.message : 'Unknown'))
            setLoading(false)
        }
    }

    const handleUpdateProject = (updated: Project) => {
        setProjects(projects.map(p => p.id === updated.id ? updated : p))
    }

    useEffect(() => { fetchProjects() }, [fetchProjects])

    // Filter and Sort Logic
    const filteredProjects = projects.filter(project => {
        if (showOnlyFavorites && !favoriteIds.includes(project.id)) return false
        if (!query) return true

        return (
            project.title?.toLowerCase().includes(query) ||
            project.manager_name?.toLowerCase().includes(query) ||
            project.description?.toLowerCase().includes(query) ||
            project.description_pl?.toLowerCase().includes(query) ||
            project.position?.toLowerCase().includes(query) ||
            project.location?.toLowerCase().includes(query)
        )
    }).sort((a, b) => {
        if (sort === 'oldest') {
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        }
        if (sort === 'title_asc') {
            return (a.title || '').localeCompare(b.title || '')
        }
        if (sort === 'title_desc') {
            return (b.title || '').localeCompare(a.title || '')
        }
        // Default: newest
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    const totalPages = Math.ceil(filteredProjects.length / pageSize)
    const paginatedProjects = filteredProjects.slice((page - 1) * pageSize, page * pageSize)

    // Fetch summaries for current page
    useEffect(() => {
        const fetchSummaries = async () => {
            const { getProjectMatchSummary } = await import('@/lib/actions/projects')
            const projectIds = paginatedProjects.map(p => p.id)
            const newSummaries: Record<string, any[]> = { ...summaries }
            let changed = false

            await Promise.all(projectIds.map(async (id) => {
                if (!newSummaries[id]) {
                    try {
                        const summary = await getProjectMatchSummary(id)
                        newSummaries[id] = [
                            ...Array(summary.high).fill({ similarity: 0.95 }),
                            ...Array(summary.medium).fill({ similarity: 0.75 }),
                            ...Array(summary.low).fill({ similarity: 0.55 })
                        ]
                        changed = true
                    } catch (err) {
                        console.error(`Failed to fetch summary for project ${id}:`, err)
                    }
                }
            }))

            if (changed) setSummaries(newSummaries)
        }

        if (paginatedProjects.length > 0) {
            fetchSummaries()
        }
    }, [page, paginatedProjects.map(p => p.id).join(',')])

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold text-white">Projekty</h1>
                    <Badge variant="outline" className="text-gray-500">
                        {filteredProjects.length > 0
                            ? <>Wyświetlanie <span className="text-slate-200 font-semibold">{Math.min((page - 1) * pageSize + 1, filteredProjects.length)}–{Math.min(page * pageSize, filteredProjects.length)}</span> z <span className="text-white font-semibold">{filteredProjects.length}</span>{projects.length !== filteredProjects.length && <span className="text-gray-500"> (ogółem: {projects.length})</span>}</>
                            : `0 projektów`
                        }
                    </Badge>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    {query && (
                        <div className="flex items-center">
                            <Button
                                variant="link"
                                onClick={() => window.history.replaceState(null, '', window.location.pathname)} // Crude clear but works if we want link, or standard clear param
                                className="text-xs text-muted-foreground hover:text-white mr-2 h-auto p-0"
                            >
                                Wyczyść filtry ✕
                            </Button>
                        </div>
                    )}
                    <SearchInput placeholder="Szukaj projektu..." />
                    <Button
                        variant={showOnlyFavorites ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                        className={showOnlyFavorites ? "bg-yellow-500 hover:bg-yellow-600 text-white" : "border-white/20 text-gray-400"}
                    >
                        <Star className={cn("w-4 h-4 mr-2", showOnlyFavorites && "fill-white")} />
                        Ulubione ({favoriteIds.length})
                    </Button>
                    <ProjectSortSelect />
                    <Button variant="outline" size="sm" onClick={fetchProjects} disabled={loading}
                        className="border-slate-200/50 text-slate-200 hover:bg-slate-200/10">
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Odśwież
                    </Button>
                </div>
            </div>

            {selectedProjects.size > 0 && (
                <div className="sticky top-4 z-10 bg-secondary/90 backdrop-blur-sm border border-slate-200/30 p-4 rounded-lg flex justify-between items-center shadow-lg">
                    <span className="text-white font-medium">Zaznaczono: {selectedProjects.size}</span>
                    <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="bg-red-500 hover:bg-red-600 text-white">
                        <Trash2 className="w-4 h-4 mr-2" /> Usuń zaznaczone
                    </Button>
                </div>
            )}

            <div className="flex items-center gap-2">
                <Checkbox id="select-all"
                    checked={filteredProjects.length > 0 && selectedProjects.size === filteredProjects.length} // Select all VISIBLE
                    onCheckedChange={() => {
                        if (selectedProjects.size === filteredProjects.length && filteredProjects.length > 0) {
                            setSelectedProjects(new Set())
                        } else {
                            setSelectedProjects(new Set(filteredProjects.map(p => p.id)))
                        }
                    }}
                    className="border-white/20 data-[state=checked]:bg-slate-200 data-[state=checked]:border-slate-200" />
                <label htmlFor="select-all" className="text-sm text-gray-400 cursor-pointer select-none">Zaznacz widoczne</label>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-md text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    <div><strong>Błąd:</strong> {error}</div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6">
                {loading && projects.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground animate-pulse">Ładowanie projektów...</div>
                )}

                {paginatedProjects.map((project) => (
                    <ProjectCard
                        key={project.id}
                        project={project}
                        isSelected={selectedProjects.has(project.id)}
                        initialMatches={summaries[project.id]}
                        isFavorite={favoriteIds.includes(project.id)}
                        onFavoriteToggle={(id, newState) => {
                            setFavoriteIds(prev =>
                                newState ? [...prev, id] : prev.filter(fid => fid !== id)
                            )
                        }}
                        onToggleSelect={toggleSelect}
                        onDelete={handleDelete}
                        onUpdate={handleUpdateProject}
                        isAdmin={isAdmin}
                    />
                ))}

                {!loading && filteredProjects.length === 0 && !error && (
                    <div className="col-span-full text-center py-12 text-muted-foreground">
                        {query ? 'Brak projektów spełniających kryteria.' : 'Brak projektów. Wykonaj import.'}
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 pt-4 pb-8">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                        className="border-white/10 text-gray-400 hover:text-white"
                    >
                        Poprzednia
                    </Button>
                    <div className="text-sm text-gray-400 font-medium text-center">
                        <span className="text-slate-200">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredProjects.length)}</span> z {filteredProjects.length}
                        <span className="text-muted-foreground ml-2">(str. {page}/{totalPages})</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="border-white/10 text-gray-400 hover:text-white"
                    >
                        Następna
                    </Button>
                </div>
            )}

            <ConfirmUI />
        </div>
    )
}

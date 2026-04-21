'use client'

import { useState } from 'react'
import { CandidateCard } from './CandidateCard'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2 } from 'lucide-react'
import { deleteCandidates } from '@/lib/actions/candidates'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { MatchedProject } from '@/lib/actions/candidates'

// We use any here because Candidate type is complex and inferred in page.tsx
// Ideally we should export Candidate type from types.ts
interface Candidate extends Record<string, any> {
    id: string
    full_name: string
    matches?: MatchedProject[]
}

interface CandidatesListClientProps {
    candidates: Candidate[]
    currentPage: number
    totalPages: number
    totalCount: number
}

export function CandidatesListClient({ candidates, currentPage, totalPages, totalCount }: CandidatesListClientProps) {
    const pageSize = 12
    const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1
    const endItem = totalCount === 0 ? 0 : Math.min(currentPage * pageSize, totalCount)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()
    const [confirm, ConfirmUI] = useConfirm()

    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedIds(newSelected)
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === candidates.length && candidates.length > 0) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(candidates.map(c => c.id)))
        }
    }

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return
        const ok = await confirm({
            title: 'Usuń konsultantów',
            description: `Czy na pewno chcesz usunąć ${selectedIds.size} wybranych konsultantów?`,
            confirmLabel: 'Usuń',
            variant: 'destructive',
        })
        if (!ok) return

        setIsDeleting(true)
        try {
            await deleteCandidates(Array.from(selectedIds))
            setSelectedIds(new Set())
            router.refresh()
        } catch (error) {
            alert('Błąd podczas usuwania: ' + (error instanceof Error ? error.message : 'Unknown error'))
        } finally {
            setIsDeleting(false)
        }
    }

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(window.location.search)
        params.set('page', newPage.toString())
        router.push(`/admin/candidates?${params.toString()}`)
    }

    return (
        <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex justify-between items-center bg-secondary/20 p-3 rounded-lg border border-white/5">
                <div className="flex items-center gap-3">
                    <Checkbox
                        id="select-all"
                        checked={candidates.length > 0 && selectedIds.size === candidates.length}
                        onCheckedChange={toggleSelectAll}
                        className="border-white/20 data-[state=checked]:bg-slate-200 data-[state=checked]:border-slate-200"
                    />
                    <label htmlFor="select-all" className="text-sm text-gray-400 cursor-pointer select-none">
                        Zaznacz wszystkich ({candidates.length})
                    </label>
                    <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">
                        Wyświetlanie <span className="text-slate-200 font-semibold">{startItem}–{endItem}</span> z <span className="text-white font-semibold">{totalCount}</span>
                    </span>
                </div>

                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-white">Wybrano: <span className="font-bold text-slate-200">{selectedIds.size}</span></span>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDeleteSelected}
                            disabled={isDeleting}
                            className="bg-red-500/80 hover:bg-red-600 text-white"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {isDeleting ? 'Usuwanie...' : 'Usuń zaznaczone'}
                        </Button>
                    </div>
                )}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {candidates.map((candidate) => (
                    <div key={candidate.id} className="h-full">
                        <CandidateCard
                            candidate={candidate}
                            initialMatches={candidate.matches || []}
                            isSelected={selectedIds.has(candidate.id)}
                            onToggleSelect={toggleSelect}
                        />
                    </div>
                ))}

                {candidates.length === 0 && (
                    <div className="col-span-full text-center py-12 text-muted-foreground">
                        Brak konsultantów spełniających kryteria.
                    </div>
                )}
            </div>
            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 pt-8">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => handlePageChange(currentPage - 1)}
                        className="border-white/10 text-gray-400 hover:text-white"
                    >
                        Poprzednia
                    </Button>
                    <div className="text-sm text-gray-400 font-medium text-center">
                        <span className="text-slate-200">{startItem}–{endItem}</span> z {totalCount}
                        <span className="text-muted-foreground ml-2">(str. {currentPage}/{totalPages})</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => handlePageChange(currentPage + 1)}
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

'use client'

import React, { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { deleteCandidate } from '@/lib/actions/candidates'
import { useRouter } from 'next/navigation'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface DeleteCandidateButtonProps {
    id: string
    name?: string
    variant?: 'icon' | 'full' | 'link'
    onDeleted?: () => void
}

export function DeleteCandidateButton({ id, name, variant = 'icon', onDeleted }: DeleteCandidateButtonProps) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const [open, setOpen] = useState(false)

    const handleDelete = async () => {
        setLoading(true)
        try {
            await deleteCandidate(id)
            setOpen(false)

            // Allow parent to handle redirection or state update
            if (onDeleted) {
                onDeleted()
            } else {
                // Default: Refresh current page
                router.refresh()
            }
        } catch (error) {
            console.error(error)
            alert('Wystąpił błąd podczas usuwania.')
        } finally {
            setLoading(false)
        }
    }

    const preventBubble = (e: React.MouseEvent) => {
        e.stopPropagation()
    }

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild onClick={preventBubble}>
                {variant === 'full' ? (
                    <Button variant="destructive" disabled={loading} size="sm">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        {loading ? 'Usuwanie...' : 'Usuń Kandydata'}
                    </Button>
                ) : variant === 'link' ? (
                    <button className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1">
                        <Trash2 className="w-3 h-3" /> Usuń
                    </button>
                ) : (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10 h-8 w-8"
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                )}
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#1a1b26] border-white/10 text-white" onClick={preventBubble}>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-red-400">
                        <AlertTriangle className="w-5 h-5" />
                        Usuwanie kandydata
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-gray-400">
                        Czy na pewno chcesz usunąć kandydata <strong>{name}</strong>?
                        <br />
                        Ta operacja jest nieodwracalna i usunie wszystkie powiązane dane (CV, historia).
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel className="bg-transparent border-white/10 text-white hover:bg-white/5 hover:text-white">Anuluj</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); handleDelete(); }}
                        className="bg-red-600 hover:bg-red-700 text-white"
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        {loading ? 'Usuwanie...' : 'Usuń Trwale'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

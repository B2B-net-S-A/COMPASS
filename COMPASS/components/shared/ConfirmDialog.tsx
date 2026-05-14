'use client'

import { useState, useCallback, useRef } from 'react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

type ConfirmVariant = 'destructive' | 'default'

interface ConfirmOptions {
    title?: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: ConfirmVariant
}

interface ConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    confirmLabel: string
    cancelLabel: string
    variant: ConfirmVariant
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmDialog({
    open, onOpenChange, title, description,
    confirmLabel, cancelLabel, variant, onConfirm, onCancel
}: ConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="bg-[var(--color-bg-primary,#1a1a2e)] border-white/10 text-white">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">{title}</AlertDialogTitle>
                    <AlertDialogDescription className="text-gray-400">
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel
                        onClick={onCancel}
                        className="border-white/20 text-gray-300 hover:bg-white/5 hover:text-white bg-transparent"
                    >
                        {cancelLabel}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className={cn(
                            variant === 'destructive'
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-primary hover:bg-primary/90 text-white'
                        )}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

/**
 * Hook that replaces native window.confirm() with a React AlertDialog.
 *
 * Usage:
 *   const [confirm, ConfirmUI] = useConfirm()
 *   const ok = await confirm({ description: 'Are you sure?' })
 *   if (!ok) return
 *   // ... proceed
 *   // Render <ConfirmUI /> somewhere in your JSX
 */
export function useConfirm() {
    const [state, setState] = useState<{
        open: boolean
        options: ConfirmOptions
    }>({ open: false, options: { description: '' } })

    const resolveRef = useRef<((value: boolean) => void) | null>(null)

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            resolveRef.current = resolve
            setState({ open: true, options })
        })
    }, [])

    const handleConfirm = useCallback(() => {
        setState(prev => ({ ...prev, open: false }))
        resolveRef.current?.(true)
        resolveRef.current = null
    }, [])

    const handleCancel = useCallback(() => {
        setState(prev => ({ ...prev, open: false }))
        resolveRef.current?.(false)
        resolveRef.current = null
    }, [])

    const ConfirmUI = useCallback(() => (
        <ConfirmDialog
            open={state.open}
            onOpenChange={(open) => {
                if (!open) handleCancel()
            }}
            title={state.options.title || 'Potwierdzenie'}
            description={state.options.description}
            confirmLabel={state.options.confirmLabel || 'Potwierdź'}
            cancelLabel={state.options.cancelLabel || 'Anuluj'}
            variant={state.options.variant || 'default'}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
        />
    ), [state.open, state.options, handleConfirm, handleCancel])

    return [confirm, ConfirmUI] as const
}

'use client'

import { logCompat } from '@/lib/logger'

import { useTransition } from 'react'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toggleFavoriteProject } from '@/lib/actions/favorites'
import { cn } from '@/lib/utils'

interface FavoriteButtonProps {
    projectId: string
    isFavorite: boolean
    size?: 'sm' | 'md' | 'lg'
    showLabel?: boolean
    variant?: 'ghost' | 'box'
    className?: string
    onToggle?: (newState: boolean) => void
}

export function FavoriteButton({
    projectId,
    isFavorite,
    size = 'md',
    showLabel = false,
    variant = 'ghost',
    className,
    onToggle
}: FavoriteButtonProps) {
    const [isPending, startTransition] = useTransition()

    const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'
    const buttonSize = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-10 w-10' : 'h-9 w-9'

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()

        const newState = !isFavorite

        // Update parent immediately (Optimistic update in parent)
        onToggle?.(newState)

        startTransition(async () => {
            try {
                const result = await toggleFavoriteProject(projectId)
                // Sync with server result if it differs from our optimistic update
                if (result.is_favorite !== newState) {
                    onToggle?.(result.is_favorite)
                }
            } catch (err) {
                logCompat.error('Failed to toggle favorite:', err)
                // Revert on error
                onToggle?.(isFavorite)
            }
        })
    }

    return (
        <Button
            variant={variant === 'box' ? 'outline' : 'ghost'}
            size="icon"
            onClick={handleClick}
            disabled={isPending}
            className={cn(
                showLabel ? 'w-auto px-3 gap-2' : buttonSize,
                'transition-all duration-300 relative',
                variant === 'box' ? (
                    isFavorite
                        ? 'bg-warning/20 border-warning/50 text-warning hover:bg-warning/30 shadow-[0_0_15px_-5px_rgba(234,179,8,0.4)]'
                        : 'bg-muted border-border text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border'
                ) : (
                    isFavorite
                        ? 'text-warning hover:text-warning'
                        : 'text-muted-foreground hover:text-warning'
                ),
                className
            )}
            title={isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
        >
            <Star
                className={cn(
                    iconSize,
                    'transition-all duration-300',
                    isFavorite ? 'fill-warning text-warning' : 'fill-transparent',
                    isPending && 'animate-pulse opacity-70'
                )}
            />
            {showLabel && (
                <span className="text-sm font-medium">
                    {isFavorite ? 'W ulubionych' : 'Dodaj do ulubionych'}
                </span>
            )}
        </Button>
    )
}

'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/lib/contexts/ThemeContext'
import { cn } from '@/lib/utils'

export function ColorModeToggle() {
    const { colorMode, toggleColorMode } = useTheme()
    const isLight = colorMode === 'light'

    return (
        <div className="flex items-center justify-between rounded-xl border bg-card/80 p-4">
            <div>
                <h3 className="text-sm font-medium">Tryb jasny</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Przełącz na jasne tło dla lepszej widoczności w jasnym otoczeniu
                </p>
            </div>
            <button
                onClick={toggleColorMode}
                className={cn(
                    'relative w-14 h-7 rounded-full transition-colors duration-300 flex items-center',
                    isLight ? 'bg-primary' : 'bg-muted',
                )}
                aria-label="Przełącz tryb jasny/ciemny"
            >
                <div
                    className={cn(
                        'absolute w-5 h-5 rounded-full bg-white shadow-md flex items-center justify-center transition-transform duration-300',
                        isLight ? 'translate-x-8' : 'translate-x-1',
                    )}
                >
                    {isLight ? (
                        <Sun className="w-3 h-3 text-amber-500" />
                    ) : (
                        <Moon className="w-3 h-3 text-slate-600" />
                    )}
                </div>
            </button>
        </div>
    )
}

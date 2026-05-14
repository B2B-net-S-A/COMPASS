'use client'

import { useTheme, THEMES } from '@/lib/contexts/ThemeContext'

function HexagonMiniLogo({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon
                points="16,3 28,9.5 28,22.5 16,29 4,22.5 4,9.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
            />
            <circle cx="16" cy="16" r="2.5" fill="currentColor" />
        </svg>
    )
}

export function ThemeQuickPicker() {
    const { theme, setTheme } = useTheme()
    const themeList = Object.values(THEMES)

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Motyw:</span>
            {themeList.map((t) => {
                const active = theme === t.id
                return (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTheme(t.id)}
                        title={t.label}
                        className={`
                            w-8 h-8 rounded-full transition-all duration-200 flex items-center justify-center
                            ${active
                                ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110'
                                : 'hover:scale-110 opacity-70 hover:opacity-100'
                            }
                        `}
                        style={{ backgroundColor: t.preview.primary }}
                    >
                        <HexagonMiniLogo className="w-5 h-5 text-white" />
                    </button>
                )
            })}
        </div>
    )
}

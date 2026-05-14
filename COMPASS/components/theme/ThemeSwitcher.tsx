'use client'

import { useTheme, THEMES, type ThemeId } from '@/lib/contexts/ThemeContext'
import { Check } from 'lucide-react'

export function ThemeSwitcher() {
    const { theme, setTheme } = useTheme()
    const themeList = Object.values(THEMES)

    return (
        <div className="grid gap-4 sm:grid-cols-3">
            {themeList.map((t) => {
                const active = theme === t.id
                return (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTheme(t.id)}
                        className={`
                            relative group rounded-xl border-2 p-1 transition-all duration-200 text-left
                            ${active
                                ? 'border-primary ring-2 ring-primary/30 scale-[1.02]'
                                : 'border-border hover:border-muted-foreground/40 hover:scale-[1.01]'
                            }
                        `}
                    >
                        {active && (
                            <div className="absolute -top-2 -right-2 z-10 bg-primary rounded-full p-0.5">
                                <Check className="h-3.5 w-3.5 text-primary-foreground" />
                            </div>
                        )}
                        <ThemePreviewCard config={t} />
                        <div className="px-2 py-2">
                            <p className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>
                                {t.label}
                            </p>
                            <p className="text-xs text-muted-foreground">{t.brandName}</p>
                        </div>
                    </button>
                )
            })}
        </div>
    )
}

function ThemePreviewCard({ config }: { config: (typeof THEMES)[ThemeId] }) {
    return (
        <div
            className="rounded-lg overflow-hidden h-28"
            style={{ backgroundColor: config.preview.bg }}
        >
            <div className="h-6 flex items-center gap-1.5 px-3" style={{ backgroundColor: config.preview.card }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: config.preview.primary, opacity: 0.7 }} />
                <div className="w-10 h-1.5 rounded" style={{ backgroundColor: config.preview.primary, opacity: 0.3 }} />
            </div>
            <div className="flex h-[calc(100%-1.5rem)]">
                <div className="w-12 pt-2 px-1.5 space-y-1.5" style={{ backgroundColor: config.preview.card }}>
                    {[...Array(4)].map((_, i) => (
                        <div
                            key={i}
                            className="h-1.5 rounded"
                            style={{
                                backgroundColor: i === 0 ? config.preview.primary : '#ffffff',
                                opacity: i === 0 ? 0.8 : 0.1,
                            }}
                        />
                    ))}
                </div>
                <div className="flex-1 p-2 space-y-1.5">
                    <div className="h-2 w-16 rounded" style={{ backgroundColor: '#ffffff', opacity: 0.15 }} />
                    <div className="grid grid-cols-3 gap-1">
                        {[...Array(3)].map((_, i) => (
                            <div
                                key={i}
                                className="h-8 rounded"
                                style={{ backgroundColor: config.preview.card }}
                            />
                        ))}
                    </div>
                    <div className="h-3 w-14 rounded" style={{ backgroundColor: config.preview.primary, opacity: 0.6 }} />
                </div>
            </div>
        </div>
    )
}

'use client'

import { useLayoutPreferences } from '@/lib/contexts/LayoutPreferencesContext'

export function LayoutSwitcher() {
    const { layout, setLayout, isMobile } = useLayoutPreferences()

    const layouts = [
        {
            id: 'grid' as const,
            name: 'Grid',
            icon: '🎴',
            description: 'Karty 2-kolumnowe',
            badge: 'Desktop'
        },
        {
            id: 'tabs' as const,
            name: 'Zakładki',
            icon: '📑',
            description: 'Zorganizowane sekcje',
            badge: null
        },
        {
            id: 'feed' as const,
            name: 'Feed',
            icon: '📜',
            description: 'Pionowy scroll',
            badge: 'Mobile'
        }
    ]

    return (
        <div className="bg-gradient-to-br from-card/50 to-muted/50 border border-slate-600/30 rounded-xl p-4 backdrop-blur">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    🎨 Wygląd Profilu
                </h3>
                {isMobile && (
                    <span className="text-xs text-slate-200 bg-slate-200/10 px-2 py-0.5 rounded">
                        📱 Urządzenie mobilne
                    </span>
                )}
            </div>
            <div className="grid grid-cols-3 gap-2">
                {layouts.map((layoutOption) => (
                    <button
                        key={layoutOption.id}
                        onClick={() => setLayout(layoutOption.id)}
                        className={`relative p-3 rounded-lg transition-all ${layout === layoutOption.id
                            ? 'bg-gradient-to-br from-foreground to-burgundy text-white shadow-lg scale-105'
                            : 'bg-slate-900/50 text-slate-300 hover:bg-slate-800 border border-slate-600/30'
                            }`}
                    >
                        {layoutOption.badge && (
                            <div className={`absolute -top-1 -right-1 text-[10px] px-1.5 py-0.5 rounded font-semibold ${layout === layoutOption.id
                                ? 'bg-yellow-500 text-slate-900'
                                : 'bg-slate-700 text-slate-300'
                                }`}>
                                {layoutOption.badge}
                            </div>
                        )}
                        <div className="text-2xl mb-1">{layoutOption.icon}</div>
                        <div className={`text-xs font-semibold mb-0.5 ${layout === layoutOption.id ? 'text-white' : ''
                            }`}>
                            {layoutOption.name}
                        </div>
                        <div className={`text-[10px] ${layout === layoutOption.id ? 'text-white/80' : 'text-slate-600'
                            }`}>
                            {layoutOption.description}
                        </div>
                    </button>
                ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-600/30">
                <p className="text-xs text-slate-600 text-center">
                    💡 Wybierz wygląd dopasowany do twojego urządzenia
                </p>
            </div>
        </div>
    )
}

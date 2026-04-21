'use client'

import { useAIAssistantPreferences, GLOW_COLOR_CONFIG } from '@/lib/contexts/AIAssistantPreferencesContext'

export function ScreenGlowEffect() {
    const { preferences } = useAIAssistantPreferences()
    const showGlow = preferences.glowEnabled && preferences.glowColor !== 'none'

    if (!showGlow) return null

    const color = GLOW_COLOR_CONFIG[preferences.glowColor].preview

    return (
        <>
            <style jsx global>{`
                @keyframes screen-glow-pulse {
                    0%, 100% {
                        opacity: 0.5;
                    }
                    50% {
                        opacity: 1;
                    }
                }
                .screen-glow-overlay {
                    animation: screen-glow-pulse 3s ease-in-out infinite;
                }
            `}</style>
            {/* Full-viewport glow border — 4 edge strips for vivid effect */}
            <div className="screen-glow-overlay fixed inset-0 z-[9999] pointer-events-none"
                style={{
                    boxShadow: [
                        `inset 0 0 60px ${color}50`,
                        `inset 0 0 120px ${color}25`,
                        `inset 0 0 200px ${color}12`,
                        `inset 0 0 300px ${color}08`,
                    ].join(', '),
                }}
            />
            {/* Top edge accent */}
            <div className="screen-glow-overlay fixed top-0 left-0 right-0 h-[2px] z-[9999] pointer-events-none"
                style={{ background: `linear-gradient(90deg, transparent, ${color}90, ${color}, ${color}90, transparent)` }}
            />
            {/* Bottom edge accent */}
            <div className="screen-glow-overlay fixed bottom-0 left-0 right-0 h-[2px] z-[9999] pointer-events-none"
                style={{ background: `linear-gradient(90deg, transparent, ${color}90, ${color}, ${color}90, transparent)` }}
            />
            {/* Left edge accent */}
            <div className="screen-glow-overlay fixed top-0 left-0 bottom-0 w-[2px] z-[9999] pointer-events-none"
                style={{ background: `linear-gradient(180deg, transparent, ${color}90, ${color}, ${color}90, transparent)` }}
            />
            {/* Right edge accent */}
            <div className="screen-glow-overlay fixed top-0 right-0 bottom-0 w-[2px] z-[9999] pointer-events-none"
                style={{ background: `linear-gradient(180deg, transparent, ${color}90, ${color}, ${color}90, transparent)` }}
            />
        </>
    )
}

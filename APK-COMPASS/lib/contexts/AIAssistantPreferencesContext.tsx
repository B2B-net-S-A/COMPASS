'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// ============================================================
// AI Assistant glow/appearance preferences (stored in localStorage)
// ============================================================

export type GlowColor = 'violet' | 'blue' | 'green' | 'red' | 'orange' | 'pink' | 'cyan' | 'none'

export interface AIAssistantPreferences {
    glowColor: GlowColor
    glowEnabled: boolean
}

interface AIAssistantPreferencesContextType {
    preferences: AIAssistantPreferences
    setGlowColor: (color: GlowColor) => void
    setGlowEnabled: (enabled: boolean) => void
}

const DEFAULT_PREFERENCES: AIAssistantPreferences = {
    glowColor: 'violet',
    glowEnabled: true,
}

const STORAGE_KEY = 'ai-assistant-preferences'

const AIAssistantPreferencesContext = createContext<AIAssistantPreferencesContextType | undefined>(undefined)

// Color config mapped to Tailwind classes
export const GLOW_COLOR_CONFIG: Record<GlowColor, {
    label: string
    borderClass: string
    shadowClass: string
    buttonFrom: string
    buttonTo: string
    gradientFrom: string
    gradientTo: string
    preview: string
}> = {
    violet: {
        label: 'Fioletowy',
        borderClass: 'border-violet-500/30',
        shadowClass: 'shadow-violet-500/20',
        buttonFrom: 'from-violet-500',
        buttonTo: 'to-blue-500',
        gradientFrom: 'from-violet-500/10',
        gradientTo: 'to-blue-500/10',
        preview: '#8b5cf6',
    },
    blue: {
        label: 'Niebieski',
        borderClass: 'border-blue-500/30',
        shadowClass: 'shadow-blue-500/20',
        buttonFrom: 'from-blue-500',
        buttonTo: 'to-cyan-500',
        gradientFrom: 'from-blue-500/10',
        gradientTo: 'to-cyan-500/10',
        preview: '#3b82f6',
    },
    green: {
        label: 'Zielony',
        borderClass: 'border-emerald-500/30',
        shadowClass: 'shadow-emerald-500/20',
        buttonFrom: 'from-emerald-500',
        buttonTo: 'to-teal-500',
        gradientFrom: 'from-emerald-500/10',
        gradientTo: 'to-teal-500/10',
        preview: '#10b981',
    },
    red: {
        label: 'Czerwony',
        borderClass: 'border-red-500/30',
        shadowClass: 'shadow-red-500/20',
        buttonFrom: 'from-red-500',
        buttonTo: 'to-rose-500',
        gradientFrom: 'from-red-500/10',
        gradientTo: 'to-rose-500/10',
        preview: '#ef4444',
    },
    orange: {
        label: 'Pomarańczowy',
        borderClass: 'border-orange-500/30',
        shadowClass: 'shadow-orange-500/20',
        buttonFrom: 'from-orange-500',
        buttonTo: 'to-amber-500',
        gradientFrom: 'from-orange-500/10',
        gradientTo: 'to-amber-500/10',
        preview: '#f97316',
    },
    pink: {
        label: 'Różowy',
        borderClass: 'border-pink-500/30',
        shadowClass: 'shadow-pink-500/20',
        buttonFrom: 'from-pink-500',
        buttonTo: 'to-fuchsia-500',
        gradientFrom: 'from-pink-500/10',
        gradientTo: 'to-fuchsia-500/10',
        preview: '#ec4899',
    },
    cyan: {
        label: 'Cyjanowy',
        borderClass: 'border-cyan-500/30',
        shadowClass: 'shadow-cyan-500/20',
        buttonFrom: 'from-cyan-500',
        buttonTo: 'to-sky-500',
        gradientFrom: 'from-cyan-500/10',
        gradientTo: 'to-sky-500/10',
        preview: '#06b6d4',
    },
    none: {
        label: 'Brak',
        borderClass: 'border-muted',
        shadowClass: 'shadow-none',
        buttonFrom: 'from-zinc-500',
        buttonTo: 'to-zinc-600',
        gradientFrom: 'from-muted/50',
        gradientTo: 'to-muted/50',
        preview: '#71717a',
    },
}

export function AIAssistantPreferencesProvider({ children }: { children: ReactNode }) {
    const [preferences, setPreferences] = useState<AIAssistantPreferences>(DEFAULT_PREFERENCES)

    // Load from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved) as Partial<AIAssistantPreferences>
                setPreferences({
                    glowColor: parsed.glowColor && Object.keys(GLOW_COLOR_CONFIG).includes(parsed.glowColor)
                        ? parsed.glowColor
                        : DEFAULT_PREFERENCES.glowColor,
                    glowEnabled: typeof parsed.glowEnabled === 'boolean'
                        ? parsed.glowEnabled
                        : DEFAULT_PREFERENCES.glowEnabled,
                })
            }
        } catch {
            // Ignore parse errors
        }
    }, [])

    const save = (newPrefs: AIAssistantPreferences) => {
        setPreferences(newPrefs)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs))
    }

    const setGlowColor = (color: GlowColor) => {
        save({ ...preferences, glowColor: color })
    }

    const setGlowEnabled = (enabled: boolean) => {
        save({ ...preferences, glowEnabled: enabled })
    }

    return (
        <AIAssistantPreferencesContext.Provider value={{ preferences, setGlowColor, setGlowEnabled }}>
            {children}
        </AIAssistantPreferencesContext.Provider>
    )
}

export function useAIAssistantPreferences() {
    const context = useContext(AIAssistantPreferencesContext)
    if (!context) {
        throw new Error('useAIAssistantPreferences must be used within AIAssistantPreferencesProvider')
    }
    return context
}

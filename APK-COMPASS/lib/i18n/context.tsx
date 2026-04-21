'use client'

import { createContext, useContext } from 'react'
import { dictionary, Locale } from './dictionary'

interface LanguageContextType {
    language: Locale
    setLanguage: (lang: Locale) => void
    t: (key: keyof typeof dictionary['pl']) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

// Hardcoded to Polish as per user request
export function LanguageProvider({ children }: { children: React.ReactNode }) {
    // Always 'pl', no state, no localStorage reading to prevent hydration mismatches
    const language: Locale = 'pl'

    const t = (key: keyof typeof dictionary['pl']) => {
        return dictionary['pl'][key] || key
    }

    const setLanguage = () => { } // No-op

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    )
}

export const useTranslation = () => {
    const context = useContext(LanguageContext)
    if (!context) {
        // Fallback
        return {
            language: 'pl' as Locale,
            setLanguage: () => { },
            t: (key: string) => key
        }
    }
    return context
}

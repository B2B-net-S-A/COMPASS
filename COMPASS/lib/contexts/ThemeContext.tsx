'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export type ThemeId = 'inframinds' | 'qualrix' | 'b2bnetwork'

export interface ThemeConfig {
    id: ThemeId
    label: string
    brandName: string
    className: string
    preview: {
        bg: string
        primary: string
        card: string
    }
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
    inframinds: {
        id: 'inframinds',
        label: 'B2Bnetwork',
        brandName: 'B2Bnetwork',
        className: '',
        preview: { bg: '#1D121B', primary: '#3A8DFF', card: '#241625' },
    },
    qualrix: {
        id: 'qualrix',
        label: 'Qualrix',
        brandName: 'Qualrix',
        className: 'theme-qualrix',
        preview: { bg: '#0A0A14', primary: '#10B981', card: '#101018' },
    },
    b2bnetwork: {
        id: 'b2bnetwork',
        label: 'B2Bnetwork',
        brandName: 'B2Bnetwork',
        className: 'theme-b2bnetwork',
        preview: { bg: '#142136', primary: '#f43a48', card: '#1C2D45' },
    },
}

const STORAGE_KEY = 'compass-theme'
const THEME_IDS: ThemeId[] = ['inframinds', 'qualrix', 'b2bnetwork']

interface ThemeContextValue {
    theme: ThemeId
    themeConfig: ThemeConfig
    setTheme: (id: ThemeId) => void
    brandName: string
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: 'inframinds',
    themeConfig: THEMES.inframinds,
    setTheme: () => {},
    brandName: 'B2Bnetwork',
})

function buildFaviconSvg(color: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><polygon points="16,1 29.86,8.5 29.86,23.5 16,31 2.14,23.5 2.14,8.5" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="16" r="2.5" fill="${color}"/></svg>`
}

function applyFavicon(color: string) {
    const svg = buildFaviconSvg(color)
    const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
    }
    link.type = 'image/svg+xml'
    link.href = url
}

function applyThemeClass(themeId: ThemeId) {
    const root = document.documentElement
    THEME_IDS.forEach(id => {
        const cls = THEMES[id].className
        if (cls) root.classList.remove(cls)
    })
    const cls = THEMES[themeId].className
    if (cls) root.classList.add(cls)
    applyFavicon(THEMES[themeId].preview.primary)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeId>('inframinds')

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null
            if (stored && THEMES[stored]) {
                setThemeState(stored)
                applyThemeClass(stored)
            }
        } catch { /* localStorage unavailable: private mode / quota exceeded — noop OK */ }

        // Phase 18.7: usunąłem DB sync — kolumna `theme` nie istnieje w
        // profiles. Theme to UX preference per-device (localStorage wystarcza),
        // sync DB był martwy kod (failuje w runtime od czasu cleanup profiles
        // schema).
    }, [])

    const setTheme = useCallback((id: ThemeId) => {
        setThemeState(id)
        applyThemeClass(id)
        try { localStorage.setItem(STORAGE_KEY, id) } catch { /* localStorage unavailable: private mode / quota exceeded — noop OK */ }
    }, [])

    const themeConfig = THEMES[theme]

    return (
        <ThemeContext.Provider value={{
            theme, themeConfig, setTheme, brandName: themeConfig.brandName,
        }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    return useContext(ThemeContext)
}

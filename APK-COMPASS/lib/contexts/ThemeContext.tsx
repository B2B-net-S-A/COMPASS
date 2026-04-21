'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export type ThemeId = 'inframinds' | 'qualrix' | 'b2bnetwork'
export type ColorMode = 'dark' | 'light'

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
        label: 'Inframinds',
        brandName: 'Inframinds',
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
        label: 'B2BNETWORK',
        brandName: 'B2BNETWORK',
        className: 'theme-b2bnetwork',
        preview: { bg: '#142136', primary: '#f43a48', card: '#1C2D45' },
    },
}

const STORAGE_KEY = 'compass-theme'
const MODE_STORAGE_KEY = 'compass-color-mode'
const THEME_IDS: ThemeId[] = ['inframinds', 'qualrix', 'b2bnetwork']

interface ThemeContextValue {
    theme: ThemeId
    themeConfig: ThemeConfig
    setTheme: (id: ThemeId) => void
    brandName: string
    colorMode: ColorMode
    setColorMode: (mode: ColorMode) => void
    toggleColorMode: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: 'inframinds',
    themeConfig: THEMES.inframinds,
    setTheme: () => {},
    brandName: 'Inframinds',
    colorMode: 'dark',
    setColorMode: () => {},
    toggleColorMode: () => {},
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

function applyColorMode(mode: ColorMode) {
    const root = document.documentElement
    if (mode === 'light') {
        root.classList.add('light')
    } else {
        root.classList.remove('light')
    }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeId>('inframinds')
    const [colorMode, setColorModeState] = useState<ColorMode>('dark')

    useEffect(() => {
        let localTheme: ThemeId | null = null
        try {
            const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null
            if (stored && THEMES[stored]) {
                localTheme = stored
                setThemeState(stored)
                applyThemeClass(stored)
            }
            const storedMode = localStorage.getItem(MODE_STORAGE_KEY) as ColorMode | null
            if (storedMode === 'light' || storedMode === 'dark') {
                setColorModeState(storedMode)
                applyColorMode(storedMode)
            }
        } catch {}

        if (!localTheme) {
            ;(async () => {
                try {
                    const supabase = createClient()
                    const { data: { user } } = await supabase.auth.getUser()
                    if (user) {
                        const { data } = await supabase.from('profiles').select('theme').eq('id', user.id).single()
                        const dbTheme = data?.theme as ThemeId | null
                        if (dbTheme && THEMES[dbTheme]) {
                            setThemeState(dbTheme)
                            applyThemeClass(dbTheme)
                            try { localStorage.setItem(STORAGE_KEY, dbTheme) } catch {}
                        }
                    }
                } catch {}
            })()
        }
    }, [])

    const setTheme = useCallback((id: ThemeId) => {
        setThemeState(id)
        applyThemeClass(id)
        try { localStorage.setItem(STORAGE_KEY, id) } catch {}

        ;(async () => {
            try {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    await supabase.from('profiles').update({ theme: id }).eq('id', user.id)
                }
            } catch {}
        })()
    }, [])

    const setColorMode = useCallback((mode: ColorMode) => {
        setColorModeState(mode)
        applyColorMode(mode)
        try { localStorage.setItem(MODE_STORAGE_KEY, mode) } catch {}
    }, [])

    const toggleColorMode = useCallback(() => {
        setColorModeState(prev => {
            const next = prev === 'dark' ? 'light' : 'dark'
            applyColorMode(next)
            try { localStorage.setItem(MODE_STORAGE_KEY, next) } catch {}
            return next
        })
    }, [])

    const themeConfig = THEMES[theme]

    return (
        <ThemeContext.Provider value={{
            theme, themeConfig, setTheme, brandName: themeConfig.brandName,
            colorMode, setColorMode, toggleColorMode,
        }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    return useContext(ThemeContext)
}

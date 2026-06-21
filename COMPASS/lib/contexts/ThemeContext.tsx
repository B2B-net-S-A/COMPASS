'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export type ThemeId = 'inframinds' | 'qualrix' | 'b2bnetwork'
export type ColorMode = 'dark' | 'light'

export interface ThemeConfig {
    id: ThemeId
    label: string
    brandName: string
    /** Accent palette applied via [data-theme] on <html>. undefined = indigo default. */
    dataTheme?: 'green' | 'rose'
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
        dataTheme: undefined,
        preview: { bg: '#ffffff', primary: '#4f46e5', card: '#f8fafc' },
    },
    qualrix: {
        id: 'qualrix',
        label: 'Qualrix',
        brandName: 'Qualrix',
        dataTheme: 'green',
        preview: { bg: '#ffffff', primary: '#15803d', card: '#f8fafc' },
    },
    b2bnetwork: {
        id: 'b2bnetwork',
        label: 'B2Bnetwork',
        brandName: 'B2Bnetwork',
        dataTheme: 'rose',
        preview: { bg: '#ffffff', primary: '#e11d48', card: '#f8fafc' },
    },
}

const STORAGE_KEY = 'compass-theme'
const MODE_STORAGE_KEY = 'compass-color-mode'

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
    brandName: 'B2Bnetwork',
    colorMode: 'light',
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

/** Accent palette via [data-theme] attribute (chrome stays neutral, shared). */
function applyTheme(themeId: ThemeId) {
    const root = document.documentElement
    const dt = THEMES[themeId].dataTheme
    if (dt) root.setAttribute('data-theme', dt)
    else root.removeAttribute('data-theme')
    applyFavicon(THEMES[themeId].preview.primary)
}

/** Light-first: dark is opt-in via the .dark class. */
function applyColorMode(mode: ColorMode) {
    const root = document.documentElement
    if (mode === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeId>('inframinds')
    const [colorMode, setColorModeState] = useState<ColorMode>('light')

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null
            if (stored && THEMES[stored]) {
                setThemeState(stored)
                applyTheme(stored)
            }
            const storedMode = localStorage.getItem(MODE_STORAGE_KEY) as ColorMode | null
            if (storedMode === 'light' || storedMode === 'dark') {
                setColorModeState(storedMode)
                applyColorMode(storedMode)
            }
        } catch { /* localStorage unavailable: private mode / quota exceeded — noop OK */ }
        // Theme is a per-device UX preference (localStorage only; no DB sync).
    }, [])

    const setTheme = useCallback((id: ThemeId) => {
        setThemeState(id)
        applyTheme(id)
        try { localStorage.setItem(STORAGE_KEY, id) } catch { /* noop */ }
    }, [])

    const setColorMode = useCallback((mode: ColorMode) => {
        setColorModeState(mode)
        applyColorMode(mode)
        try { localStorage.setItem(MODE_STORAGE_KEY, mode) } catch { /* noop */ }
    }, [])

    const toggleColorMode = useCallback(() => {
        setColorModeState(prev => {
            const next = prev === 'dark' ? 'light' : 'dark'
            applyColorMode(next)
            try { localStorage.setItem(MODE_STORAGE_KEY, next) } catch { /* noop */ }
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

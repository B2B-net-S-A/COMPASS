'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type ProfileLayout = 'grid' | 'tabs' | 'feed'

interface LayoutPreferencesContextType {
    layout: ProfileLayout
    setLayout: (layout: ProfileLayout) => void
    isMobile: boolean
}

const LayoutPreferencesContext = createContext<LayoutPreferencesContextType | undefined>(undefined)

export function LayoutPreferencesProvider({ children }: { children: ReactNode }) {
    const [layout, setLayoutState] = useState<ProfileLayout>('grid')
    const [isMobile, setIsMobile] = useState(false)

    // Detect mobile on mount
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    // Load preference from localStorage on mount
    useEffect(() => {
        const savedLayout = localStorage.getItem('profile-layout-preference') as ProfileLayout
        if (savedLayout && ['grid', 'tabs', 'feed'].includes(savedLayout)) {
            setLayoutState(savedLayout)
        } else {
            // Auto-select based on device
            const defaultLayout = isMobile ? 'feed' : 'grid'
            setLayoutState(defaultLayout)
        }
    }, [isMobile])

    const setLayout = (newLayout: ProfileLayout) => {
        setLayoutState(newLayout)
        localStorage.setItem('profile-layout-preference', newLayout)
    }

    return (
        <LayoutPreferencesContext.Provider value={{ layout, setLayout, isMobile }}>
            {children}
        </LayoutPreferencesContext.Provider>
    )
}

export function useLayoutPreferences() {
    const context = useContext(LayoutPreferencesContext)
    if (!context) {
        throw new Error('useLayoutPreferences must be used within LayoutPreferencesProvider')
    }
    return context
}

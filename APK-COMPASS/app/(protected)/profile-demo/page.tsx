'use client'

import { useState, useEffect } from 'react'
import { useLayoutPreferences } from '@/lib/contexts/LayoutPreferencesContext'
import { LayoutSwitcher } from '@/components/profile/LayoutSwitcher'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ProfileDemoPage() {
    const { layout } = useLayoutPreferences()
    const [mounted, setMounted] = useState(false)

    // Prevent hydration mismatch
    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return null
    }

    return (
        <div className="min-h-screen p-6 md:p-8">
            {/* Layout Switcher - Always Visible */}
            <div className="mb-6 max-w-2xl mx-auto">
                <LayoutSwitcher />
            </div>

            {/* Dynamic Content Based on Layout */}
            {layout === 'grid' && <GridLayout />}
            {layout === 'tabs' && <TabsLayout />}
            {layout === 'feed' && <FeedLayout />}
        </div>
    )
}

// Grid Layout Component
function GridLayout() {
    return (
        <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">Profil - Grid Layout</h1>
            <div className="grid grid-cols-3 gap-6">
                {/* Left Column (2/3) */}
                <div className="col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>💼 O mnie</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-foreground">
                                Doświadczony konsultant z 8+ lat w branży IT...
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>⚡ Umiejętności</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                {['React', 'TypeScript', 'Node.js'].map(skill => (
                                    <span key={skill} className="px-3 py-1 bg-foreground/20 text-cyan-300 rounded-lg text-sm">
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column (1/3) */}
                <div className="space-y-6">
                    <Card className="bg-gradient-to-br from-foreground/10 to-burgundy/10 border-foreground/30">
                        <CardHeader>
                            <CardTitle>📄 CV</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <button className="w-full px-4 py-2 bg-gradient-to-r from-foreground to-burgundy text-white rounded-lg font-semibold">
                                Wgraj CV
                            </button>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>📅 Dostępność</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-foreground">Status: Dostępny</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

// Tabs Layout Component  
function TabsLayout() {
    const [activeTab, setActiveTab] = useState('overview')

    return (
        <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">Profil - Tabs Layout</h1>

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-6">
                {['overview', 'professional', 'documents'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg font-semibold transition ${activeTab === tab
                                ? 'bg-gradient-to-r from-foreground to-burgundy text-white'
                                : 'bg-card text-muted-foreground hover:text-white'
                            }`}
                    >
                        {tab === 'overview' && '📊 Przegląd'}
                        {tab === 'professional' && '💼 Profesjonalne'}
                        {tab === 'documents' && '📄 Dokumenty'}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Statystyki</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-4 gap-4">
                                {['8+ lat', 'Dostępny', '75%', '1250 pkt'].map((stat, i) => (
                                    <div key={i} className="text-center">
                                        <div className="text-2xl font-bold text-white">{stat}</div>
                                        <div className="text-xs text-muted-foreground">Metryka {i + 1}</div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}

// Feed Layout Component
function FeedLayout() {
    return (
        <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">Profil - Feed Layout</h1>

            {/* Vertical feed of cards */}
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            📋 Informacje Podstawowe
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <div>
                                <label className="text-sm text-muted-foreground">Imię i nazwisko</label>
                                <p className="text-white">Jan Kowalski</p>
                            </div>
                            <div>
                                <label className="text-sm text-muted-foreground">Email</label>
                                <p className="text-white">jan@example.com</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            💼 Profil Profesjonalny
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-foreground">
                            Doświadczony konsultant IT specjalizujący się w transformacji cyfrowej...
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            📊 Dostępność & Obciążenie
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div>
                            <label className="text-sm text-muted-foreground">Obciążenie: 75%</label>
                            <div className="mt-2 h-3 bg-[muted] rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-foreground to-burgundy" style={{ width: '75%' }}></div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-foreground/10 to-burgundy/10 border-foreground/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            📄 Dokumenty & CV
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <button className="w-full px-4 py-3 bg-gradient-to-r from-foreground to-burgundy text-white rounded-lg font-semibold">
                            Wgraj CV
                        </button>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

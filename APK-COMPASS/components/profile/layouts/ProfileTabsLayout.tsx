"use client"
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload } from 'lucide-react'
import { FavoriteProjectsSection } from '@/components/shared/FavoriteProjectsSection'
import { MyReferralsSection } from '@/components/referrals/MyReferralsSection'
import { RoleItem } from '@/components/profile/RoleItem'
import { TechStackSection, TechItem } from '@/components/profile/sections/TechStackSection'
import { CertificationsSection, Certification } from '@/components/profile/sections/CertificationsSection'
import { WorkPreferencesSection, WorkPreferences } from '@/components/profile/sections/WorkPreferencesSection'
import { updateProfileFull } from '@/lib/actions/matching'

interface ProfileTabsLayoutProps {
    // All same props as Grid... (abbreviated for brevity)
    [key: string]: any
}

export function ProfileTabsLayout(props: any) {
    const [activeTab, setActiveTab] = useState('overview')
    const [expandedSections, setExpandedSections] = useState(['bio'])

    const toggleSection = (section: string) => {
        setExpandedSections(prev =>
            prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
        )
    }

    const {
        initialProfile, avatarUrl, avatarLoading, handleAvatarUpload,
        fullName, setFullName, phone, setPhone,
        bio, setBio, clients, clientInput, setClientInput, handleAddClient, handleRemoveClient,
        status, setStatus, capacity, setCapacity, sentiments, handleToggleSentiment, experience, setExperience,
        currentCvUrl, fileToUpload, handleFileSelect, coverLetter, setCoverLetter, handleUploadCV, loading,
        verifier, setVerifier, ambassador, setAmbassador, sales, setSales,
        availableFrom, setAvailableFrom, fteStatus, setFteStatus, maxMonthlyHours, setMaxMonthlyHours,
        favorites, handleSave, isDirty
    } = props

    return (
        <div className="max-w-6xl mx-auto">
            {/* Profile Header */}
            <div className="bg-gradient-to-r from-card/70 to-muted/70 border border-slate-600/30 rounded-2xl p-6 mb-6 backdrop-blur">
                <div className="flex items-center gap-6">
                    <label className="cursor-pointer">
                        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-foreground to-burgundy p-1">
                            <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
                                {avatarLoading ? (
                                    <span className="text-xs animate-pulse">Wait...</span>
                                ) : avatarUrl ? (
                                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-xl">👤</span>
                                )}
                            </div>
                        </div>
                        <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={avatarLoading} />
                    </label>
                    <div>
                        <h2 className="text-2xl font-bold text-white">{fullName || 'Twój Profil'}</h2>
                        <div className="flex gap-4 mt-2">
                            <div className="flex-1 min-w-[200px]">
                                <Label className="text-slate-400 text-[10px] uppercase mb-1 block">Imię i Nazwisko</Label>
                                <Input
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Imię i nazwisko"
                                    className="h-8 bg-white/5 border-white/10 text-white text-sm"
                                />
                            </div>
                            <div className="flex-1 min-w-[150px]">
                                <Label className="text-slate-400 text-[10px] uppercase mb-1 block">Telefon</Label>
                                <Input
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="Telefon"
                                    className="h-8 bg-white/5 border-white/10 text-white text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-6">
                {[
                    { id: 'overview', label: 'Przegląd', icon: '📊' },
                    { id: 'professional', label: 'Profesjonalne', icon: '💼' },
                    { id: 'documents', label: 'Dokumenty', icon: '📄' }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-6 py-3 rounded-xl font-semibold transition ${activeTab === tab.id
                            ? 'bg-gradient-to-r from-foreground to-burgundy text-white'
                            : 'bg-slate-800/50 text-slate-600 hover:text-white hover:bg-slate-800'
                            }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab: Overview */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-4 gap-4">
                        {[
                            { label: 'Doświadczenie', value: `${experience}+ lat`, icon: '📅' },
                            {
                                label: 'Status',
                                value: status === 'available_from' ? 'Dostępny od' :
                                    status === 'fte_1_0' ? 'Pełny etat' :
                                        ['fte_0_5', 'fte_0_25'].includes(status) ? 'Part-time' :
                                            status === 'blocked' ? 'Zablokowany' :
                                                status === 'notice_period' ? 'Notice' :
                                                    status === 'open' ? 'Dostępny' : status === 'busy' ? 'Zajęty' : 'Niedostępny',
                                icon: status === 'available_from' ? '🔵' : ['fte_1_0', 'fte_0_5', 'fte_0_25', 'open'].includes(status) ? '🟢' : status === 'blocked' ? '🔴' : '🟡'
                            },
                            { label: 'Obciążenie', value: `${capacity}% (${Math.round((capacity / 100) * maxMonthlyHours)}h)`, icon: '📊' },
                            { label: 'Klienci', value: clients.length, icon: '🏢' }
                        ].map((stat, i) => (
                            <Card key={i} className="bg-slate-800/50 border-slate-600/30">
                                <CardContent className="p-4 text-center">
                                    <div className="text-2xl mb-1">{stat.icon}</div>
                                    <div className="text-2xl font-bold text-white">{stat.value}</div>
                                    <div className="text-xs text-slate-600">{stat.label}</div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Quick Actions */}
                    <Card className="bg-slate-800/50 border-slate-600/30">
                        <CardContent className="p-4">
                            <div className="flex gap-3">
                                <Button onClick={handleSave} disabled={!isDirty} className="bg-gradient-to-r from-foreground to-burgundy">
                                    Zapisz Zmiany
                                </Button>
                                <Button variant="outline" onClick={() => setActiveTab('documents')}>
                                    Wgraj CV
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Collapsible Sections */}
                    <div className="space-y-3">
                        {/* Bio Section */}
                        <Card className="bg-slate-800/50 border-slate-600/30">
                            <button
                                onClick={() => toggleSection('bio')}
                                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition rounded-t-xl"
                            >
                                <span className="text-white font-semibold flex items-center gap-2">
                                    {expandedSections.includes('bio') ? '▼' : '▶'}
                                    💼 Podsumowanie Profesjonalne
                                </span>
                            </button>
                            {expandedSections.includes('bio') && (
                                <CardContent className="px-6 pb-6">
                                    <Textarea
                                        value={bio}
                                        onChange={(e) => setBio(e.target.value)}
                                        placeholder="Opisz swoje doświadczenie..."
                                        className="min-h-[100px] bg-white/5 border-white/10"
                                    />
                                </CardContent>
                            )}
                        </Card>

                        {/* Experience & Skills */}
                        <Card className="bg-slate-800/50 border-slate-600/30">
                            <button
                                onClick={() => toggleSection('experience')}
                                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition rounded-t-xl"
                            >
                                <span className="text-white font-semibold flex items-center gap-2">
                                    {expandedSections.includes('experience') ? '▼' : '▶'}
                                    ⚡ Doświadczenie & Preferencje
                                </span>
                            </button>
                            {expandedSections.includes('experience') && (
                                <CardContent className="px-6 pb-6 space-y-4">
                                    <div>
                                        <Label>Lata doświadczenia</Label>
                                        <Input
                                            type="number"
                                            value={experience}
                                            onChange={(e) => setExperience(parseInt(e.target.value))}
                                            className="bg-white/5 border-white/10"
                                        />
                                    </div>
                                    <Label>Typ projektów / Nastawienie</Label>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {[
                                            { id: 'super', label: '🚀 Super' },
                                            { id: 'change_willing', label: '🔄 Chętnie zmienię' },
                                            { id: 'manager_issues', label: '⚠️ Problemy z managerem' },
                                            { id: 'low_growth', label: '📉 Mało rozwojowy' },
                                            { id: 'needs_training', label: '📚 Wymaga szkoleń' },
                                            { id: 'extra_work', label: '➕ Chcę dodatkowy' }
                                        ].map((sentiment) => (
                                            <button
                                                key={sentiment.id}
                                                onClick={() => handleToggleSentiment(sentiment.id)}
                                                className={`px-3 py-1.5 rounded-lg text-sm transition border ${sentiments.includes(sentiment.id)
                                                    ? 'bg-gradient-to-r from-foreground to-burgundy text-white border-transparent'
                                                    : 'bg-white/5 text-slate-600 border border-white/10 hover:bg-white/10'
                                                    }`}
                                            >
                                                {sentiment.label}
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            )}
                        </Card>

                        {/* Availability */}
                        <Card className="bg-slate-800/50 border-slate-600/30">
                            <button
                                onClick={() => toggleSection('availability')}
                                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition rounded-t-xl"
                            >
                                <span className="text-white font-semibold flex items-center gap-2">
                                    {expandedSections.includes('availability') ? '▼' : '▶'}
                                    📅 Dostępność & Obciążenie
                                </span>
                            </button>
                            {expandedSections.includes('availability') && (
                                <CardContent className="px-6 pb-6 space-y-4">
                                    <div>
                                        <Label>Status</Label>
                                        <select
                                            value={status}
                                            onChange={(e) => setStatus(e.target.value)}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                                            title="Status dostępności"
                                        >
                                            <option value="open">🟢 Dostępny (Standard)</option>
                                            <option value="available_from">🔵 Dostępny od (data)...</option>
                                            <option value="fte_1_0">🟢 Pełny etat (1.0 FTE)</option>
                                            <option value="fte_0_5">🟡 0.5 FTE</option>
                                            <option value="fte_0_25">🟠 0.25 FTE</option>
                                            <option value="blocked">🔴 Zablokowany (projekt)</option>
                                            <option value="notice_period">⚫ Notice period</option>
                                            <option value="busy">⏳ Zajęty</option>
                                            <option value="unavailable">⚪ Niedostępny</option>
                                        </select>
                                    </div>
                                    <div>
                                        <Label>Obciążenie: {capacity}%</Label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={capacity}
                                            onChange={(e) => setCapacity(parseInt(e.target.value))}
                                            className="w-full"
                                            title="Slider obciążenia"
                                        />
                                    </div>
                                </CardContent>
                            )}
                        </Card>

                        {/* Clients */}
                        <Card className="bg-slate-800/50 border-slate-600/30">
                            <button
                                onClick={() => toggleSection('clients')}
                                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition rounded-t-xl"
                            >
                                <span className="text-white font-semibold flex items-center gap-2">
                                    {expandedSections.includes('clients') ? '▼' : '▶'}
                                    🏢 Portfolio Klientów
                                </span>
                            </button>
                            {expandedSections.includes('clients') && (
                                <CardContent className="px-6 pb-6 space-y-3">
                                    <div className="flex flex-wrap gap-2">
                                        {clients.map((client: string) => (
                                            <span key={client} className="px-3 py-1 bg-white/5 border border-white/10 text-white rounded-lg text-sm flex items-center gap-2">
                                                {client}
                                                <button onClick={() => handleRemoveClient(client)} className="text-red-400">✕</button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            value={clientInput}
                                            onChange={(e) => setClientInput(e.target.value)}
                                            placeholder="Dodaj klienta..."
                                            className="bg-white/5 border-white/10"
                                            onKeyPress={(e) => e.key === 'Enter' && handleAddClient()}
                                        />
                                        <Button onClick={handleAddClient}>Dodaj</Button>
                                    </div>
                                </CardContent>
                            )}
                        </Card>

                        {/* Programs */}
                        <Card className="bg-slate-800/50 border-slate-600/30">
                            <button
                                onClick={() => toggleSection('programs')}
                                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition rounded-t-xl"
                            >
                                <span className="text-white font-semibold flex items-center gap-2">
                                    {expandedSections.includes('programs') ? '▼' : '▶'}
                                    🎯 Wsparcie
                                </span>
                            </button>
                            {expandedSections.includes('programs') && (
                                <CardContent className="px-6 pb-6 space-y-3">
                                    {[
                                        {
                                            id: 'verifier',
                                            name: 'Weryfikator',
                                            value: verifier,
                                            setter: setVerifier,
                                            description: 'Strażnik jakości i standardów technicznych. Przeprowadza merytoryczną ocenę kandydatów i wspiera proces decyzyjny Centrali.'
                                        },
                                        {
                                            id: 'ambassador',
                                            name: 'Ambasador',
                                            value: ambassador,
                                            setter: setAmbassador,
                                            description: 'Twarz i głos B2B.net na projekcie. Wita nowych Konsultantów i pomaga im wejść w środowisko klienta.'
                                        },
                                        {
                                            id: 'sales',
                                            name: 'Wsparcie Sprzedaży',
                                            value: sales,
                                            setter: setSales,
                                            description: 'Wspiera działania pre-sales, uczestniczy w spotkaniach z klientami i buduje zaufanie wiedzą ekspercką.'
                                        }
                                    ].map((role) => (
                                        <RoleItem key={role.id} {...role} />
                                    ))}
                                </CardContent>
                            )}
                        </Card>
                    </div>

                    {/* Favorites & Referrals */}
                    {favorites.length > 0 && (
                        <Card className="bg-slate-800/50 border-slate-600/30">
                            <CardHeader><CardTitle>⭐ Ulubione Projekty</CardTitle></CardHeader>
                            <CardContent>
                                <FavoriteProjectsSection favorites={favorites} />
                            </CardContent>
                        </Card>
                    )}

                    <Card className="bg-slate-800/50 border-slate-600/30">
                        <CardHeader><CardTitle>👥 Rekomendacje</CardTitle></CardHeader>
                        <CardContent>
                            <MyReferralsSection />
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Tab: Professional */}
            {activeTab === 'professional' && (
                <div className="space-y-6">
                    <Card className="bg-slate-800/50 border-slate-600/30">
                        <CardHeader><CardTitle>💼 Informacje Profesjonalne</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <Textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Bio..."
                                className="min-h-[120px] bg-white/5 border-white/10"
                            />
                        </CardContent>
                    </Card>

                    <TechStackSection
                        techStack={initialProfile?.tech_stack || []}
                        skills={initialProfile?.skills || []}
                        onSave={async (items: TechItem[]) => {
                            await updateProfileFull({ tech_stack: items as unknown as Record<string, unknown>[] })
                        }}
                    />

                    <CertificationsSection
                        certifications={initialProfile?.certifications || []}
                        onSave={async (items: Certification[]) => {
                            await updateProfileFull({ certifications: items as unknown as Record<string, unknown>[] })
                        }}
                    />

                    <WorkPreferencesSection
                        preferences={initialProfile?.work_preferences || {}}
                        onSave={async (prefs: WorkPreferences) => {
                            await updateProfileFull({ work_preferences: prefs as unknown as Record<string, unknown> })
                        }}
                    />
                </div>
            )}

            {/* Tab: Documents */}
            {activeTab === 'documents' && (
                <div className="space-y-6">
                    <Card className="bg-gradient-to-r from-foreground/5 to-burgundy/5 border-white/10">
                        <CardHeader><CardTitle>📄 CV i Dokumenty</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <Input
                                type="file"
                                accept=".pdf,.docx"
                                className="hidden"
                                id="cv-tabs"
                                onChange={handleFileSelect}
                                disabled={loading}
                            />
                            <Button asChild variant="outline" className="w-full">
                                <label htmlFor="cv-tabs">
                                    <Upload className="w-4 h-4 mr-2" />
                                    {fileToUpload ? fileToUpload.name : 'Wybierz CV'}
                                </label>
                            </Button>
                            <Textarea
                                value={coverLetter}
                                onChange={(e) => setCoverLetter(e.target.value)}
                                placeholder="List motywacyjny..."
                                className="min-h-[100px] bg-white/5 border-white/10"
                            />
                            <Button onClick={handleUploadCV} disabled={!fileToUpload || loading} className="w-full bg-gradient-to-r from-foreground to-burgundy">
                                {loading ? 'Przetwarzanie...' : 'Wgraj CV'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}

"use client"
import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload } from 'lucide-react'
import { FavoriteProjectsSection } from '@/components/shared/FavoriteProjectsSection'
import { MyReferralsSection } from '@/components/referrals/MyReferralsSection'
import { RoleItem } from '@/components/profile/RoleItem'

export function ProfileFeedLayout(props: any) {
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
        <div className="max-w-3xl mx-auto">
            {/* Sticky Header */}
            <div className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-lg border-b border-slate-700/50 -mx-4 px-4 py-4 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <label className="cursor-pointer">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-foreground to-burgundy p-0.5">
                                <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
                                    {avatarLoading ? <span className="text-xs">...</span> :
                                        avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> :
                                            <span className="text-lg">👤</span>}
                                </div>
                            </div>
                            <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={avatarLoading} />
                        </label>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-bold text-white truncate">{fullName || 'Profil'}</h2>
                            <p className="text-xs text-slate-500 truncate">{phone || 'Brak numeru'}</p>
                        </div>
                    </div>
                    <Button onClick={handleSave} disabled={!isDirty} size="sm" className="bg-gradient-to-r from-foreground to-burgundy">
                        Zapisz
                    </Button>
                </div>
            </div>

            {/* Vertical Feed of Cards */}
            <div className="space-y-4">
                {/* Essential Info Card */}
                <Card className="bg-gradient-to-br from-card/50 to-muted/50 border-slate-600/30">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            📋 Informacje Podstawowe
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-sm text-slate-600">Imię i nazwisko</Label>
                                <Input
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Imię i nazwisko"
                                    className="bg-white/5 border-white/10 mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-sm text-slate-600">Telefon</Label>
                                <Input
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="Numer telefonu"
                                    className="bg-white/5 border-white/10 mt-1"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-sm text-slate-600">Lata doświadczenia</Label>
                                <Input
                                    type="number"
                                    value={experience}
                                    onChange={(e) => setExperience(parseInt(e.target.value))}
                                    className="bg-white/5 border-white/10 mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-sm text-slate-600">Status</Label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
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
                        </div>
                    </CardContent>
                </Card>

                {/* Professional Profile Card */}
                <Card className="bg-gradient-to-br from-card/50 to-muted/50 border-slate-600/30">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            💼 Profil Profesjonalny
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Opisz swoje doświadczenie i kompetencje..."
                            className="min-h-[100px] bg-white/5 border-white/10"
                        />
                    </CardContent>
                </Card>

                {/* Availability & Capacity Card */}
                <Card className="bg-gradient-to-br from-card/50 to-muted/50 border-slate-600/30">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            📊 Dostępność & Obciążenie
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <Label className="text-sm text-slate-600">Obciążenie</Label>
                                <span className="text-white font-semibold">{capacity}%</span>
                            </div>
                            <div className="relative h-3 bg-slate-900/50 rounded-full overflow-hidden">
                                <div
                                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-foreground to-burgundy rounded-full transition-all"
                                    style={{ width: `${capacity}%` }}
                                />
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={capacity}
                                onChange={(e) => setCapacity(parseInt(e.target.value))}
                                className="w-full mt-2"
                                title="Slider obciążenia"
                            />
                            <p className="text-xs text-slate-600 mt-1">Dostępność: {100 - capacity}%</p>
                        </div>
                        <div>
                            <Label className="text-sm text-slate-600 mb-2 block">Typ projektów</Label>
                            <div className="flex flex-wrap gap-2">
                                {['transformation', 'strategy', 'remote_work', 'short_gigs'].map((sentiment) => (
                                    <button
                                        key={sentiment}
                                        onClick={() => handleToggleSentiment(sentiment)}
                                        className={`px-3 py-1.5 rounded-lg text-sm transition ${sentiments.includes(sentiment)
                                            ? 'bg-gradient-to-r from-foreground to-burgundy text-white'
                                            : 'bg-white/5 text-slate-600 border border-white/10'
                                            }`}
                                    >
                                        {sentiment === 'transformation' && 'Transformacja'}
                                        {sentiment === 'strategy' && 'Strategia'}
                                        {sentiment === 'remote_work' && 'Remote'}
                                        {sentiment === 'short_gigs' && 'Krótkie'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Documents & CV Card */}
                <Card className="bg-gradient-to-br from-foreground/10 to-burgundy/10 border-slate-200/30">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            📄 Dokumenty & CV
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Input
                                type="file"
                                accept=".pdf,.docx"
                                className="hidden"
                                id="cv-feed"
                                onChange={handleFileSelect}
                                disabled={loading}
                            />
                            <Button asChild variant="outline" className="w-full border-slate-200/30">
                                <label htmlFor="cv-feed" className="cursor-pointer">
                                    <Upload className="w-4 h-4 mr-2" />
                                    {fileToUpload ? fileToUpload.name : 'Wybierz CV'}
                                </label>
                            </Button>
                        </div>
                        {currentCvUrl && (
                            <div className="bg-slate-900/50 border border-slate-600/30 rounded-lg p-3 flex items-center gap-2">
                                <span className="text-green-400">✅</span>
                                <span className="text-white text-sm">CV wgrane</span>
                            </div>
                        )}
                        <Textarea
                            value={coverLetter}
                            onChange={(e) => setCoverLetter(e.target.value)}
                            placeholder="List motywacyjny (opcjonalnie)..."
                            className="min-h-[80px] bg-white/5 border-white/10"
                        />
                        <Button
                            onClick={handleUploadCV}
                            disabled={!fileToUpload || loading}
                            className="w-full bg-gradient-to-r from-foreground to-burgundy"
                        >
                            {loading ? 'Przetwarzanie...' : 'Wgraj CV'}
                        </Button>
                    </CardContent>
                </Card>

                {/* Project Sentiment Card */}
                <Card className="bg-gradient-to-br from-card/50 to-muted/50 border-slate-600/30">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            ❤️ Nastawienie do Projektu
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-2">
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
                </Card>

                {/* Clients Card */}
                <Card className="bg-gradient-to-br from-card/50 to-muted/50 border-slate-600/30">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            🏢 Poprzedni Klienci
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {clients.map((client: string) => (
                                <span key={client} className="px-3 py-1.5 bg-white/5 border border-white/10 text-white rounded-lg text-sm flex items-center gap-2">
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
                                onKeyPress={(e: any) => e.key === 'Enter' && handleAddClient()}
                            />
                            <Button onClick={handleAddClient} size="sm">+</Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Program Participation Card */}
                <Card className="bg-gradient-to-br from-card/50 to-muted/50 border-slate-600/30">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            🎯 Wsparcie
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {[
                            {
                                id: 'verifier',
                                name: 'Weryfikator',
                                value: verifier,
                                setter: setVerifier,
                                description: 'Weryfikator to strażnik jakości i standardów technicznych B2B.net. Jego wiedza i doświadczenie realnie wpływają na to, kto dołącza do projektu i jaką jakość dostarczamy klientowi. Przeprowadza merytoryczną ocenę kandydatów, wspiera proces decyzyjny Centrali i podnosi poziom całej organizacji.'
                            },
                            {
                                id: 'ambassador',
                                name: 'Ambasador',
                                value: ambassador,
                                setter: setAmbassador,
                                description: 'Ambasador to twarz i głos B2B.net na projekcie. To osoba, która jako pierwsza wita nowych Konsultantów i pomaga im wejść w środowisko klienta z poczuciem bezpieczeństwa i przynależności. Buduje kulturę współpracy, dba o standard jakości oraz reprezentuje wartości B2B.net.'
                            },
                            {
                                id: 'sales',
                                name: 'Sales Support',
                                value: sales,
                                setter: setSales,
                                description: 'Wsparcie sprzedaży to rola dla Konsultantów, którzy chcą wyjść poza projekt i współtworzyć rozwój biznesu. Uczestniczy w spotkaniach z klientami, wspiera działania pre-sales i pomaga budować zaufanie poprzez wiedzę ekspercką.'
                            }
                        ].map((role) => (
                            <RoleItem key={role.id} {...role} />
                        ))}
                    </CardContent>
                </Card>

                {/* Favorites Card */}
                {favorites.length > 0 && (
                    <Card className="bg-gradient-to-br from-card/50 to-muted/50 border-slate-600/30">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                ⭐ Ulubione Projekty
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <FavoriteProjectsSection favorites={favorites} />
                        </CardContent>
                    </Card>
                )}

                {/* Referrals Card */}
                <Card className="bg-gradient-to-br from-card/50 to-muted/50 border-slate-600/30">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            👥 Rekomendacje
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <MyReferralsSection />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

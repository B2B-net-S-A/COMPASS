"use client"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload } from 'lucide-react'
import { FavoriteProjectsSection } from '@/components/shared/FavoriteProjectsSection'
import { MyReferralsSection } from '@/components/referrals/MyReferralsSection'
import { RoleItem } from '@/components/profile/RoleItem'

interface GridLayoutProps {
    // Personal info
    initialProfile: any
    avatarUrl: string | null
    avatarLoading: boolean
    handleAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
    fullName: string
    setFullName: (val: string) => void
    phone: string
    setPhone: (val: string) => void

    // Bio & Skills
    bio: string
    setBio: (val: string) => void
    clients: string[]
    clientInput: string
    setClientInput: (val: string) => void
    handleAddClient: () => void
    handleRemoveClient: (client: string) => void

    // Availability
    status: string
    setStatus: (val: string) => void
    capacity: number
    setCapacity: (val: number) => void
    sentiments: string[]
    handleToggleSentiment: (sentiment: string) => void
    experience: number
    setExperience: (val: number) => void

    // CV Upload
    currentCvUrl: string | null
    fileToUpload: File | null
    handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
    coverLetter: string
    setCoverLetter: (val: string) => void
    handleUploadCV: () => void
    loading: boolean

    // Programs
    verifier: string
    setVerifier: (val: string) => void
    ambassador: string
    setAmbassador: (val: string) => void
    sales: string
    setSales: (val: string) => void
    availableFrom: string
    setAvailableFrom: (val: string) => void
    fteStatus: string
    setFteStatus: (val: string) => void
    maxMonthlyHours: number
    setMaxMonthlyHours: (val: number) => void

    // Favorites & Referrals
    favorites: any[]

    // Loyalty
    loyaltyPoints?: number
    loyaltyTier?: string

    // Actions
    handleSave: () => void
    isDirty: boolean
}

export function ProfileGridLayout(props: GridLayoutProps) {
    const {
        initialProfile, avatarUrl, avatarLoading, handleAvatarUpload,
        fullName, setFullName, phone, setPhone,
        bio, setBio, clients, clientInput, setClientInput, handleAddClient, handleRemoveClient,
        status, setStatus, capacity, setCapacity, sentiments, handleToggleSentiment, experience, setExperience,
        currentCvUrl, fileToUpload, handleFileSelect, coverLetter, setCoverLetter, handleUploadCV, loading,
        verifier, setVerifier, ambassador, setAmbassador, sales, setSales,
        availableFrom, setAvailableFrom, fteStatus, setFteStatus, maxMonthlyHours, setMaxMonthlyHours,
        favorites, handleSave, isDirty,
        loyaltyPoints = 0, loyaltyTier = 'bronze'
    } = props

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Top Section: Large Header with Avatar, Name & Loyalty Badge */}
            <div className="relative">
                {/* Background Gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-foreground/10 via-burgundy/10 to-foreground/10 rounded-2xl blur-xl" />

                {/* Header Content */}
                <Card className="relative bg-gradient-to-br from-card/90 to-background/90 border-white/20 backdrop-blur-xl shadow-2xl">
                    <CardContent className="p-8">
                        <div className="flex items-center gap-6">
                            {/* Avatar - Left */}
                            <label className="cursor-pointer group">
                                <div className="h-24 w-24 rounded-full bg-gradient-to-br from-foreground via-burgundy to-burgundy p-1 shadow-lg group-hover:shadow-foreground/50 transition-all">
                                    <div className="h-full w-full rounded-full bg-slate-900 flex items-center justify-center overflow-hidden">
                                        {avatarLoading ? (
                                            <span className="text-sm animate-pulse text-slate-200">Loading...</span>
                                        ) : avatarUrl ? (
                                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-2xl group-hover:scale-110 transition-transform">👤</span>
                                        )}
                                    </div>
                                </div>
                                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={avatarLoading} />
                            </label>

                            {/* Name & Loyalty Badge - Center Aligned */}
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-foreground">
                                        {fullName || 'Twój Profil'}
                                    </h1>
                                    {/* Loyalty Badge */}
                                    <div className="px-4 py-1.5 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/40 rounded-full flex items-center gap-2 shadow-lg">
                                        <span className="text-xl">⭐</span>
                                        <span className="text-sm font-semibold text-yellow-300">{(loyaltyTier || 'bronze').charAt(0).toUpperCase() + (loyaltyTier || 'bronze').slice(1)} Member</span>
                                    </div>
                                </div>
                                <div className="flex flex-col md:flex-row gap-4 mt-4">
                                    <div className="flex-1">
                                        <Label className="text-slate-400 text-xs uppercase mb-1 block">Imię i Nazwisko</Label>
                                        <Input
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Twoje imię i nazwisko"
                                            className="bg-white/5 border-white/10 text-white focus:border-slate-200/50"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <Label className="text-slate-400 text-xs uppercase mb-1 block">Telefon</Label>
                                        <Input
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="Numer telefonu"
                                            className="bg-white/5 border-white/10 text-white focus:border-slate-200/50"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Stats Cards Row */}
            <div className="grid grid-cols-4 gap-4">
                {/* Years of Experience */}
                <Card className="bg-gradient-to-br from-foreground/10 to-burgundy/5 border-slate-200/30 backdrop-blur-sm hover:shadow-lg hover:shadow-foreground/20 transition-all">
                    <CardContent className="p-6 text-center">
                        <div className="text-3xl mb-2">📅</div>
                        <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-foreground to-cyan-200">
                            {experience}+
                        </div>
                        <div className="text-xs text-slate-600 mt-1 uppercase tracking-wide">Lata Doświadczenia</div>
                    </CardContent>
                </Card>

                {/* Current Status */}
                <Card className={`bg-gradient-to-br border backdrop-blur-sm hover:shadow-lg transition-all ${status === 'available_from' ? 'from-primary/10 to-burgundy/5 border-primary/30 hover:shadow-primary/20' :
                    ['fte_1_0', 'fte_0_5', 'fte_0_25'].includes(status) ? 'from-green-500/10 to-green-600/5 border-green-500/30 hover:shadow-green-500/20' :
                        status === 'blocked' ? 'from-red-500/10 to-red-600/5 border-red-500/30 hover:shadow-red-500/20' :
                            status === 'notice_period' ? 'from-muted-foreground/10 to-muted-foreground/5 border-slate-600/30 hover:shadow-muted-foreground/20' :
                                status === 'open' ? 'from-green-500/10 to-green-600/5 border-green-500/30 hover:shadow-green-500/20' :
                                    status === 'busy' ? 'from-yellow-500/10 to-yellow-600/5 border-yellow-500/30 hover:shadow-yellow-500/20' :
                                        'from-red-500/10 to-red-600/5 border-red-500/30 hover:shadow-red-500/20'
                    }`}>
                    <CardContent className="p-6 text-center">
                        <div className="text-3xl mb-2">
                            {status === 'available_from' ? '🔵' :
                                ['fte_1_0', 'fte_0_5', 'fte_0_25', 'open'].includes(status) ? '🟢' :
                                    status === 'blocked' ? '🔴' :
                                        status === 'notice_period' ? '⚫' :
                                            status === 'busy' ? '🟡' : '🟠'}
                        </div>
                        <div className={`text-xl font-bold ${status === 'available_from' ? 'text-slate-200' :
                            ['fte_1_0', 'fte_0_5', 'fte_0_25', 'open'].includes(status) ? 'text-green-400' :
                                status === 'blocked' ? 'text-red-400' :
                                    status === 'notice_period' ? 'text-slate-600' :
                                        status === 'busy' ? 'text-yellow-400' : 'text-orange-400'
                            }`}>
                            {status === 'available_from' ? 'Dostępny od' :
                                status === 'fte_1_0' ? 'Pełny etat' :
                                    status === 'fte_0_5' ? '0.5 FTE' :
                                        status === 'fte_0_25' ? '0.25 FTE' :
                                            status === 'blocked' ? 'Zablokowany' :
                                                status === 'notice_period' ? 'Notice period' :
                                                    status === 'open' ? 'Dostępny' :
                                                        status === 'busy' ? 'Zajęty' : 'Niedostępny'}
                        </div>
                        <div className="text-xs text-slate-600 mt-1 uppercase tracking-wide">Status</div>
                    </CardContent>
                </Card>

                {/* Capacity */}
                <Card className="bg-gradient-to-br from-burgundy/10 to-burgundy/5 border-burgundy/30 backdrop-blur-sm hover:shadow-lg hover:shadow-burgundy/20 transition-all">
                    <CardContent className="p-6 text-center">
                        <div className="text-3xl mb-2">📊</div>
                        <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-foreground">
                            {capacity}%
                        </div>
                        <div className="text-xs text-slate-600 mt-1 uppercase tracking-wide">Obciążenie</div>
                    </CardContent>
                </Card>

                {/* Loyalty Points */}
                <Card className="bg-gradient-to-br from-amber-500/10 to-yellow-600/5 border-amber-500/30 backdrop-blur-sm hover:shadow-lg hover:shadow-amber-500/20 transition-all">
                    <CardContent className="p-6 text-center">
                        <div className="text-3xl mb-2">⭐</div>
                        <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-200">
                            {loyaltyPoints}
                        </div>
                        <div className="text-xs text-slate-600 mt-1 uppercase tracking-wide">Punkty Lojalnościowe</div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content: 2-Column Grid (60/40 split) */}
            <div className="grid grid-cols-5 gap-6">
                {/* LEFT COLUMN - 60% (3 of 5 columns) */}
                <div className="col-span-3 space-y-6">
                    {/* About Me Card */}
                    <Card className="bg-gradient-to-br from-card/80 to-background/80 border-white/10 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-shadow">
                        <CardHeader>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <span className="text-2xl">💼</span>
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground to-primary">
                                    O mnie
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Opisz swoje doświadczenie, kompetencje i cele zawodowe..."
                                className="min-h-[140px] bg-white/5 border-white/10 focus:border-slate-200/50 transition-colors"
                            />
                        </CardContent>
                    </Card>

                    {/* Skills & Experience Card */}
                    <Card className="bg-gradient-to-br from-card/80 to-background/80 border-white/10 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-shadow">
                        <CardHeader>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <span className="text-2xl">⚡</span>
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground to-primary">
                                    Umiejętności & Preferencje
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label className="text-slate-300 font-medium">Preferencje projektowe</Label>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {['transformation', 'strategy', 'remote_work', 'short_gigs'].map((sentiment) => (
                                        <button
                                            key={sentiment}
                                            onClick={() => handleToggleSentiment(sentiment)}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${sentiments.includes(sentiment)
                                                ? 'bg-gradient-to-r from-foreground to-burgundy text-white shadow-lg shadow-foreground/30'
                                                : 'bg-white/5 text-slate-600 border border-white/10 hover:border-slate-200/50 hover:text-foreground'
                                                }`}
                                        >
                                            {sentiment === 'transformation' && '🔄 Transformacja'}
                                            {sentiment === 'strategy' && '🎯 Strategia'}
                                            {sentiment === 'remote_work' && '🌐 Praca Zdalna'}
                                            {sentiment === 'short_gigs' && '⚡ Krótkie Zlecenia'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Previous Clients Card */}
                    <Card className="bg-gradient-to-br from-card/80 to-background/80 border-white/10 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-shadow">
                        <CardHeader>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <span className="text-2xl">🏢</span>
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground to-primary">
                                    Poprzedni Klienci
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {clients.length === 0 ? (
                                    <p className="text-slate-600 text-sm italic">Dodaj swoich klientów aby pokazać doświadczenie...</p>
                                ) : (
                                    clients.map((client) => (
                                        <span
                                            key={client}
                                            className="px-4 py-2 bg-gradient-to-r from-white/5 to-white/10 border border-white/20 text-white rounded-lg text-sm flex items-center gap-2 hover:border-slate-200/50 transition-colors"
                                        >
                                            {client}
                                            <button
                                                onClick={() => handleRemoveClient(client)}
                                                className="text-red-400 hover:text-red-300 hover:scale-110 transition-all"
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    ))
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    value={clientInput}
                                    onChange={(e) => setClientInput(e.target.value)}
                                    placeholder="Nazwa klienta..."
                                    className="bg-white/5 border-white/10 focus:border-slate-200/50"
                                    onKeyPress={(e) => e.key === 'Enter' && handleAddClient()}
                                />
                                <Button
                                    onClick={handleAddClient}
                                    className="bg-gradient-to-r from-foreground to-burgundy hover:from-burgundy hover:to-burgundy shadow-lg"
                                >
                                    Dodaj
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT COLUMN - 40% (2 of 5 columns) */}
                <div className="col-span-2 space-y-6">
                    {/* CV & Documents Card */}
                    <Card className="bg-gradient-to-br from-foreground/10 via-burgundy/10 to-foreground/10 border-slate-200/30 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:shadow-foreground/20 transition-all">
                        <CardHeader>
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <span className="text-2xl">📄</span>
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground to-primary">
                                    CV & Dokumenty
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Input
                                    type="file"
                                    accept=".pdf,.docx"
                                    className="hidden"
                                    id="cv-select-grid"
                                    onChange={handleFileSelect}
                                    disabled={loading}
                                />
                                <Button
                                    asChild
                                    variant="outline"
                                    className="w-full border-slate-200/30 text-slate-200 hover:bg-slate-200/10 cursor-pointer"
                                >
                                    <label htmlFor="cv-select-grid" className="cursor-pointer">
                                        <Upload className="w-4 h-4 mr-2" />
                                        {fileToUpload ? fileToUpload.name : 'Wybierz plik CV'}
                                    </label>
                                </Button>
                            </div>
                            {currentCvUrl && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                                    <span className="text-green-400 text-lg">✅</span>
                                    <span className="text-green-300 text-sm font-medium">CV wgrane</span>
                                </div>
                            )}
                            <Textarea
                                value={coverLetter}
                                onChange={(e) => setCoverLetter(e.target.value)}
                                placeholder="List motywacyjny (opcjonalnie)..."
                                className="min-h-[100px] bg-white/5 border-white/10 focus:border-slate-200/50"
                            />
                            <Button
                                onClick={handleUploadCV}
                                disabled={!fileToUpload || loading}
                                className="w-full bg-gradient-to-r from-foreground to-burgundy hover:from-burgundy hover:to-burgundy shadow-lg disabled:opacity-50"
                            >
                                {loading ? '🔄 Przetwarzanie...' : '📤 Wgraj CV'}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-card/80 to-background/80 border-white/10 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-shadow">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <span className="text-2xl">📅</span>
                                <span className="text-white">Dostępność i Status</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Detailed Status Select */}
                            <div>
                                <Label className="text-slate-300 font-medium mb-2 block text-xs">Aktualny Status</Label>
                                <select
                                    value={status}
                                    onChange={(e) => {
                                        const newStatus = e.target.value;
                                        setStatus(newStatus);
                                        // Auto-sync FTE/Hours
                                        if (newStatus === 'fte_1_0') { setMaxMonthlyHours(160); setCapacity(100); }
                                        else if (newStatus === 'fte_0_5') { setMaxMonthlyHours(80); setCapacity(50); }
                                        else if (newStatus === 'fte_0_25') { setMaxMonthlyHours(40); setCapacity(25); }
                                    }}
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:border-slate-200/50 focus:outline-none transition-colors"
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

                            {/* Temporal availability (Date Picker) */}
                            {(status === 'available_from' || status === 'notice_period') && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <Label className="text-slate-300 font-medium mb-2 block text-xs">
                                        {status === 'available_from' ? 'Kiedy będziesz dostępny?' : 'Koniec okresu wypowiedzenia'}
                                    </Label>
                                    <Input
                                        type="date"
                                        value={availableFrom}
                                        onChange={(e) => setAvailableFrom(e.target.value)}
                                        className="bg-white/5 border-white/10 text-white focus:border-primary/50"
                                    />
                                </div>
                            )}

                            {/* Hours & Load bar */}
                            <div className="space-y-4 pt-2 border-t border-white/5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-slate-300 font-medium text-xs">Lata doświadczenia</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            value={experience}
                                            onChange={(e) => setExperience(parseInt(e.target.value) || 0)}
                                            className="w-20 h-8 bg-white/5 border-white/10 text-center text-sm font-bold text-foreground"
                                        />
                                        <span className="text-xs text-slate-600">lat</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <Label className="text-slate-300 font-medium text-xs">Maks. dostępność (h/mc)</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            value={maxMonthlyHours}
                                            onChange={(e) => setMaxMonthlyHours(parseInt(e.target.value) || 0)}
                                            className="w-20 h-8 bg-white/5 border-white/10 text-center text-sm font-bold text-slate-200"
                                        />
                                        <span className="text-xs text-slate-600">h</span>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2 text-xs">
                                        <Label className="text-slate-300 font-medium italic">Aktualne obciążenie</Label>
                                        <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-foreground to-primary">
                                            {capacity}% ({Math.round((capacity / 100) * maxMonthlyHours)}h)
                                        </span>
                                    </div>
                                    <div className="relative h-2 w-full bg-slate-700/50 rounded-full overflow-hidden">
                                        <div
                                            className="absolute left-0 top-0 h-full bg-gradient-to-r from-foreground to-burgundy transition-all duration-500"
                                            style={{ width: `${capacity}%` }}
                                        />
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={capacity}
                                        onChange={(e) => setCapacity(parseInt(e.target.value))}
                                        className="w-full h-2 bg-transparent appearance-none cursor-pointer accent-foreground -mt-2 relative z-10"
                                    />
                                    <p className="text-[10px] text-slate-600 mt-1 flex justify-between">
                                        <span>Małe obciążenie</span>
                                        <span className="text-slate-200 font-semibold">Wolne: {maxMonthlyHours - Math.round((capacity / 100) * maxMonthlyHours)}h</span>
                                        <span>Przeciążenie</span>
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Program Participation Card */}
                    <Card className="bg-gradient-to-br from-card/80 to-background/80 border-white/10 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-shadow">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <span className="text-2xl">🎯</span>
                                <span className="text-white">Wsparcie</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                    </Card>

                    {/* Project Sentiment Card */}
                    <Card className="bg-gradient-to-br from-card/80 to-background/80 border-white/10 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-shadow">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <span>❤️</span>
                                <span className="text-white">Nastawienie do Projektu</span>
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
                                        className={`px-3 py-2 text-xs font-medium rounded-full transition-all border ${sentiments.includes(sentiment.id)
                                            ? 'bg-slate-200/20 text-foreground border-slate-200 shadow-lg shadow-foreground/20'
                                            : 'bg-white/5 text-slate-600 border-transparent hover:bg-white/10'
                                            }`}
                                    >
                                        {sentiment.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-slate-600 italic">
                                Twoje nastawienie pomaga nam lepiej dopasować przyszłe propozycje.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Bottom Section: Full Width */}
            <div className="space-y-6">
                {/* Favorite Projects */}
                {favorites.length > 0 && (
                    <FavoriteProjectsSection favorites={favorites} />
                )}

                {/* My Referrals */}
                <MyReferralsSection />

                {/* Save Button */}
                <div className="flex justify-end">
                    <Button
                        onClick={handleSave}
                        disabled={!isDirty || loading}
                        className="px-8 py-3 text-lg bg-gradient-to-r from-foreground to-burgundy hover:from-burgundy hover:to-burgundy text-white font-semibold shadow-xl hover:shadow-2xl disabled:opacity-50 transition-all"
                    >
                        💾 Zapisz Zmiany
                    </Button>
                </div>
            </div>
        </div>
    )
}


'use client'

import { useState, useRef } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { LoyaltyTierBadge, LoyaltyTier } from "./loyalty/LoyaltyTierBadge"
import { LoyaltyProgressBar } from "./loyalty/LoyaltyProgressBar"
import { Phone, Users, Camera, Loader2 } from "lucide-react"
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'

interface WelcomePanelProps {
    fullName?: string | null
    avatarUrl?: string | null
    role?: string | null
    loyaltyPoints?: number
    loyaltyTier?: string
    activeContract?: {
        project_name: string
        client_name: string
    } | null
    recruiterName?: string | null
    recruiterPhone?: string | null
    locale?: 'pl' | 'en'
}

export function WelcomePanel({
    fullName,
    avatarUrl,
    loyaltyPoints = 0,
    loyaltyTier = 'bronze',
    activeContract,
    recruiterName,
    recruiterPhone,
    locale = 'pl'
}: WelcomePanelProps) {
    const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(avatarUrl || null)
    const [avatarLoading, setAvatarLoading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleAvatarClick = () => {
        if (!avatarLoading) {
            fileInputRef.current?.click()
        }
    }

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error(locale === 'pl' ? 'Wybierz plik graficzny (JPG, PNG, GIF)' : 'Wybierz plik graficzny (JPG, PNG, GIF)')
            return
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error(locale === 'pl' ? 'Zdjęcie jest za duże. Maksymalny rozmiar to 5 MB.' : 'Zdjęcie jest za duże. Maksymalny rozmiar to 5 MB.')
            return
        }

        setAvatarLoading(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const { uploadAvatar } = await import('@/lib/actions/files')
            const result = await uploadAvatar(formData)
            if (result.success) {
                // Show local preview immediately
                const objectUrl = URL.createObjectURL(file)
                setCurrentAvatarUrl(objectUrl)
                toastSuccess(locale === 'pl' ? 'Zdjęcie profilowe zostało zaktualizowane!' : 'Zdjęcie profilowe zostało zaktualizowane!')
            }
        } catch (error) {
            console.error('Avatar upload error:', error)
            toast.error(locale === 'pl' ? 'Nie udało się wgrać zdjęcia. Spróbuj ponownie.' : 'Nie udało się wgrać zdjęcia. Spróbuj ponownie.')
        } finally {
            setAvatarLoading(false)
            // Reset input so same file can be re-selected
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const getGreeting = () => {
        const hour = new Date().getHours()
        if (hour < 12) return locale === 'pl' ? "Dzień dobry" : "Dzień dobry"
        if (hour < 18) return locale === 'pl' ? "Dzień dobry" : "Dzień dobry"
        return locale === 'pl' ? "Dobry wieczór" : "Dobry wieczór"
    }

    const initials = fullName
        ? fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
        : 'U'

    const getNextTierPoints = (points: number) => {
        if (points < 500) return 500    // Bronze -> Silver
        if (points < 1500) return 1500  // Silver -> Gold
        if (points < 3000) return 3000  // Gold -> Platinum
        return 5000                     // Platinum -> Diamond/Max
    }

    const nextTierPoints = getNextTierPoints(loyaltyPoints)

    return (
        <Card className="bg-gradient-to-r from-blue-900/40 to-background/40 border-white/10 overflow-hidden relative">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-4">
                    {/* Clickable avatar with upload */}
                    <div className="relative group">
                        <button
                            type="button"
                            onClick={handleAvatarClick}
                            disabled={avatarLoading}
                            className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 focus:ring-offset-background transition-all"
                            title={locale === 'pl' ? 'Kliknij, aby zmienić zdjęcie' : 'Click to change photo'}
                        >
                            <Avatar className="w-16 h-16 border-2 border-primary/30 group-hover:border-slate-200/60 transition-colors">
                                <AvatarImage src={currentAvatarUrl || ''} />
                                <AvatarFallback className="text-xl bg-blue-950 text-blue-200">{initials}</AvatarFallback>
                            </Avatar>

                            {/* Hover overlay with camera icon */}
                            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {avatarLoading ? (
                                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                                ) : (
                                    <Camera className="w-6 h-6 text-white" />
                                )}
                            </div>
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            onChange={handleAvatarUpload}
                            disabled={avatarLoading}
                        />
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            {getGreeting()}, {(fullName || (locale === 'pl' ? 'Użytkowniku' : 'User')).split(' ')[0]}! 👋
                        </h2>
                        <p className="text-slate-600">
                            {locale === 'pl' ? 'Panel Konsultanta' : 'Consultant Panel'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {recruiterName && (
                        <div className="hidden md:block text-right mr-4 border-r border-white/10 pr-6">
                            <div className="text-xs text-slate-600 uppercase tracking-wider font-semibold mb-1">
                                {locale === 'pl' ? 'Twój Opiekun' : 'Your Recruiter'}
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                <Users className="w-4 h-4 text-primary" />
                                <span className="text-sm font-bold text-slate-200">{recruiterName}</span>
                            </div>
                            {recruiterPhone && (
                                <a href={`tel:+48${recruiterPhone.replace(/\s/g, '')}`} className="flex items-center justify-end gap-1 mt-0.5 text-xs text-slate-200 hover:underline">
                                    <Phone className="w-3 h-3" />
                                    {recruiterPhone}
                                </a>
                            )}
                        </div>
                    )}

                    <div className="hidden md:block text-right mr-4 border-r border-white/10 pr-6">
                        <div className="text-xs text-slate-600 uppercase tracking-wider font-semibold mb-1">
                            {locale === 'pl' ? 'Program lojalnościowy' : 'Loyalty Program'}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <span className="text-xl font-bold text-slate-200">
                                {loyaltyPoints} <span className="text-sm font-normal text-slate-600">pkt</span>
                            </span>
                            <LoyaltyTierBadge tier={loyaltyTier as LoyaltyTier} />
                        </div>
                        <LoyaltyProgressBar
                            currentPoints={loyaltyPoints}
                            nextTierPoints={nextTierPoints}
                            className="w-32 mt-1"
                        />
                    </div>

                    <div className="flex flex-col items-end">
                        <span className="text-xs text-slate-600 uppercase tracking-wider font-semibold">
                            {locale === 'pl' ? 'Twój status' : 'Your status'}
                        </span>
                        <div className="flex items-center gap-2">
                            {activeContract ? (
                                <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 px-3 py-1">
                                    <span className="w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse" />
                                    {locale === 'pl' ? 'Aktywny Kontrakt' : 'Active Contract'}
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 bg-yellow-500/10 px-3 py-1">
                                    {locale === 'pl' ? 'Dostępny' : 'Available'}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

'use client'

import { useRef, useState, useEffect } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Camera, Loader2, Star, Shield } from 'lucide-react'
import { uploadAvatar } from '@/lib/actions/files'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'

interface AdminWelcomePanelProps {
    user: {
        full_name?: string | null
        avatar_url?: string | null
        email?: string | null
    }
    isSuperAdmin?: boolean
}

export function AdminWelcomePanel({ user, isSuperAdmin = false }: AdminWelcomePanelProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '')
    const router = useRouter()

    const [greeting, setGreeting] = useState('Dzień dobry')
    const [dateStr, setDateStr] = useState('')

    useEffect(() => {
        const hour = new Date().getHours()
        setGreeting(hour < 18 ? 'Dzień dobry' : 'Dobry wieczór')
        setDateStr(new Date().toLocaleDateString('pl-PL', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        }))
    }, [])

    if (!user) return null;

    const initials = user.full_name
        ? user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
        : 'AD'

    const handleAvatarClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            toast.error('Wybierz plik graficzny (JPG, PNG, WebP)')
            return
        }

        if (file.size > 5 * 1024 * 1024) {
            toast.error('Maksymalny rozmiar pliku to 5 MB')
            return
        }

        setIsUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            const result = await uploadAvatar(formData)
            if (result.success && result.url) {
                setAvatarUrl(result.url)
                toastSuccess('Zdjęcie profilowe zostało zaktualizowane!')
                router.refresh()
            }
        } catch (error) {
            console.error('Avatar upload error:', error)
            toast.error('Nie udało się wgrać zdjęcia. Spróbuj ponownie.')
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    return (
        <Card className="bg-gradient-to-r from-background to-card border-burgundy/20 overflow-hidden relative">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-burgundy/15 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-burgundy/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />

            <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-4">
                    {/* Avatar with upload overlay */}
                    <div
                        className="relative group cursor-pointer"
                        onClick={handleAvatarClick}
                        title="Kliknij, aby zmienić zdjęcie"
                    >
                        <Avatar className="w-16 h-16 border-2 border-burgundy/40 transition-all group-hover:border-burgundy/70">
                            <AvatarImage src={avatarUrl} />
                            <AvatarFallback className="text-xl bg-background text-foreground">{initials}</AvatarFallback>
                        </Avatar>

                        <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {isUploading ? (
                                <Loader2 className="w-5 h-5 text-white animate-spin" />
                            ) : (
                                <Camera className="w-5 h-5 text-white" />
                            )}
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={handleFileChange}
                            disabled={isUploading}
                        />
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
                            {greeting}, {(user.full_name || 'Administrator').split(' ')[0]}!
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            Panel Administratora{dateStr ? ` • ${dateStr}` : ''}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className="border-burgundy/40 text-foreground bg-burgundy/15 px-3 py-1">
                        <Shield className="w-3 h-3 mr-1.5" />
                        Administrator
                    </Badge>
                    {isSuperAdmin && (
                        <Badge variant="outline" className="border-burgundy/50 text-foreground bg-burgundy/25 px-3 py-1">
                            <Star className="w-3 h-3 mr-1.5" />
                            Super Admin
                        </Badge>
                    )}
                    <Badge variant="outline" className="border-foreground/20 text-foreground bg-foreground/5 px-3 py-1">
                        <span className="w-2 h-2 rounded-full bg-foreground mr-1.5 animate-pulse" />
                        Aktywny
                    </Badge>
                </div>
            </CardContent>
        </Card>
    )
}

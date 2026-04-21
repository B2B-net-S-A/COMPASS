import React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Mail, Phone, Calendar, Clock, Shield, Briefcase } from "lucide-react"

interface ProfileHeaderProps {
    profile: {
        full_name: string | null
        role: string
        avatar_url: string | null
        email: string
        phone?: string | null
        created_at?: string
        last_sign_in_at?: string
    }
}

export function ProfileHeader({ profile }: ProfileHeaderProps) {
    const initials = profile.full_name
        ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
        : 'U'

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A'
        return new Date(dateString).toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    const formatTime = (dateString?: string) => {
        if (!dateString) return ''
        return new Date(dateString).toLocaleTimeString('pl-PL', {
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const getRoleLabel = (role: string) => {
        switch (role) {
            case 'admin':
            case 'administrator':
                return 'Administrator Systemu'
            case 'centrala':
            case 'consultant_manager':
                return 'Centrala / Management'
            default:
                return 'Użytkownik'
        }
    }

    const getRoleBadgeVariant = (role: string) => {
        if (role === 'admin' || role === 'administrator') return 'destructive'
        if (role === 'centrala' || role === 'consultant_manager') return 'default' // primary
        return 'secondary'
    }

    return (
        <Card className="mb-8 border-none shadow-sm bg-muted/40">
            <CardContent className="p-6">
                <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                    <Avatar className="h-20 w-20 md:h-24 md:w-24 border-2 border-background shadow-sm">
                        <AvatarImage src={profile.avatar_url || ''} alt={profile.full_name || 'User'} />
                        <AvatarFallback className="text-xl bg-primary/10 text-primary">{initials}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 space-y-2">
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <h2 className="text-2xl font-bold tracking-tight">
                                {profile.full_name || profile.email}
                            </h2>
                            <Badge variant={getRoleBadgeVariant(profile.role)} className="w-fit px-3 py-1">
                                {profile.role === 'admin' || profile.role === 'administrator' ? (
                                    <Shield className="w-3 h-3 mr-1" />
                                ) : (
                                    <Briefcase className="w-3 h-3 mr-1" />
                                )}
                                {getRoleLabel(profile.role).toUpperCase()}
                            </Badge>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                                <Mail className="w-4 h-4" />
                                <span>{profile.email}</span>
                            </div>
                            {profile.phone && (
                                <div className="flex items-center gap-1.5">
                                    <Phone className="w-4 h-4" />
                                    <span>{profile.phone}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-4 h-4" />
                                <span>Dołączył: {formatDate(profile.created_at)}</span>
                            </div>
                            {profile.last_sign_in_at && (
                                <div className="flex items-center gap-1.5">
                                    <Clock className="w-4 h-4" />
                                    <span>Ostatnio: {formatDate(profile.last_sign_in_at)} {formatTime(profile.last_sign_in_at)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

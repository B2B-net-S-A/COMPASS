'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Bell,
    Check,
    CheckCheck,
    Clock,
    Trash2,
    Briefcase,
    Trophy,
    Users,
    FileText,
    CreditCard,
    AlertTriangle,
    Megaphone,
    ArrowLeft,
} from 'lucide-react'
import { markNotificationAsRead, markAllNotificationsAsRead, deleteNotification } from '@/lib/actions/notifications'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import type { Notification } from '@/lib/types'

interface NotificationsPageClientProps {
    notifications: Notification[]
}

const typeConfig: Record<string, { icon: typeof Bell; color: string; label: string }> = {
    contract_ending: { icon: Briefcase, color: 'text-amber-400', label: 'Kontrakt' },
    health_score_low: { icon: AlertTriangle, color: 'text-red-400', label: 'Health Score' },
    new_project_match: { icon: Briefcase, color: 'text-primary', label: 'Nowy projekt' },
    loyalty_tier_up: { icon: Trophy, color: 'text-yellow-400', label: 'Lojalność' },
    referral_update: { icon: Users, color: 'text-pink-400', label: 'Polecenie' },
    document_uploaded: { icon: FileText, color: 'text-slate-200', label: 'Dokument' },
    system_announcement: { icon: Megaphone, color: 'text-primary', label: 'System' },
    payment_received: { icon: CreditCard, color: 'text-green-400', label: 'Płatność' },
}

export function NotificationsPageClient({ notifications: initial }: NotificationsPageClientProps) {
    const router = useRouter()
    const [notifications, setNotifications] = useState(initial)
    const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')
    const [loading, setLoading] = useState(false)

    const filtered = notifications.filter(n => {
        if (filter === 'unread') return !n.is_read
        if (filter === 'read') return n.is_read
        return true
    })

    const unreadCount = notifications.filter(n => !n.is_read).length

    const handleMarkAsRead = async (id: string) => {
        const result = await markNotificationAsRead(id)
        if (result.success) {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
            toastSuccess('Oznaczono jako przeczytane')
        }
    }

    const handleMarkAllAsRead = async () => {
        setLoading(true)
        const result = await markAllNotificationsAsRead()
        if (result.success) {
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })))
            toastSuccess('Wszystkie oznaczono jako przeczytane')
        }
        setLoading(false)
    }

    const handleDelete = async (id: string) => {
        const result = await deleteNotification(id)
        if (result.success) {
            setNotifications(prev => prev.filter(n => n.id !== id))
            toastSuccess('Powiadomienie usunięte')
        }
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diff = now.getTime() - date.getTime()
        const mins = Math.floor(diff / 60000)
        const hours = Math.floor(diff / 3600000)
        const days = Math.floor(diff / 86400000)

        if (mins < 1) return 'Przed chwilą'
        if (mins < 60) return `${mins} min temu`
        if (hours < 24) return `${hours} godz. temu`
        if (days < 7) return `${days} dni temu`
        return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-600 hover:text-white"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Bell className="w-6 h-6" />
                            Powiadomienia
                            {unreadCount > 0 && (
                                <Badge className="bg-red-500 text-white text-xs">{unreadCount}</Badge>
                            )}
                        </h1>
                        <p className="text-sm text-slate-600 mt-0.5">
                            {notifications.length} powiadomień łącznie
                        </p>
                    </div>
                </div>

                {unreadCount > 0 && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-slate-300 hover:text-white"
                        onClick={handleMarkAllAsRead}
                        disabled={loading}
                    >
                        <CheckCheck className="w-4 h-4 mr-2" />
                        Oznacz wszystkie jako przeczytane
                    </Button>
                )}
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                {(['all', 'unread', 'read'] as const).map(f => (
                    <Button
                        key={f}
                        variant={filter === f ? 'default' : 'ghost'}
                        size="sm"
                        className={filter === f
                            ? 'bg-white/10 text-white'
                            : 'text-slate-600 hover:text-white'
                        }
                        onClick={() => setFilter(f)}
                    >
                        {f === 'all' && `Wszystkie (${notifications.length})`}
                        {f === 'unread' && `Nieprzeczytane (${unreadCount})`}
                        {f === 'read' && `Przeczytane (${notifications.length - unreadCount})`}
                    </Button>
                ))}
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <Bell className="w-12 h-12 text-slate-600 mb-4" />
                        <h3 className="text-lg font-semibold text-slate-300">Brak powiadomień</h3>
                        <p className="text-sm text-slate-600 mt-1">
                            {filter === 'unread'
                                ? 'Wszystkie powiadomienia zostały przeczytane.'
                                : 'Nie masz jeszcze żadnych powiadomień.'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {filtered.map(notification => {
                        const config = typeConfig[notification.type] || { icon: Bell, color: 'text-slate-600', label: notification.type }
                        const Icon = config.icon

                        return (
                            <Card
                                key={notification.id}
                                className={`group bg-white/5 border-white/10 hover:bg-white/[0.08] transition-colors ${
                                    !notification.is_read ? 'border-l-2 border-l-primary' : ''
                                }`}
                            >
                                <CardContent className="p-4 flex items-start gap-4">
                                    {/* Icon */}
                                    <div className={`mt-0.5 ${config.color}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm leading-tight ${!notification.is_read ? 'font-semibold text-white' : 'text-slate-300'}`}>
                                                    {notification.title_pl}
                                                </p>
                                                {notification.body_pl && (
                                                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                                                        {notification.body_pl}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-3 mt-2">
                                                    <span className="text-[10px] text-slate-600 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {formatDate(notification.created_at)}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] border-white/10 text-slate-600 px-1.5 py-0">
                                                        {config.label}
                                                    </Badge>
                                                    {notification.priority === 'urgent' && (
                                                        <Badge className="bg-red-500/20 text-red-400 text-[10px] px-1.5 py-0">
                                                            Pilne
                                                        </Badge>
                                                    )}
                                                    {notification.priority === 'high' && (
                                                        <Badge className="bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0">
                                                            Ważne
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                {!notification.is_read && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-slate-600 hover:text-green-400 hover:bg-green-400/10"
                                                        onClick={() => handleMarkAsRead(notification.id)}
                                                        title="Oznacz jako przeczytane"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-slate-600 hover:text-red-400 hover:bg-red-400/10"
                                                    onClick={() => handleDelete(notification.id)}
                                                    title="Usuń"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

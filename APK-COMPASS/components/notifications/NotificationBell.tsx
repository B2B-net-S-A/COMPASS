'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    getRecentNotifications,
    getUnreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification
} from '@/lib/actions/notifications'
import type { Notification } from '@/lib/types'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeNotifications } from '@/lib/hooks/useRealtimeNotifications'

export function NotificationBell({ locale = 'pl' }: { locale?: 'pl' | 'en' }) {
    const router = useRouter()
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [userId, setUserId] = useState<string>('')

    // Get current user ID for realtime subscription
    useEffect(() => {
        try {
            const supabase = createClient()
            supabase.auth.getUser().then(({ data: { user } }) => {
                if (user) setUserId(user.id)
            }).catch(() => {})
        } catch {}
    }, [])

    // Load notifications
    const loadNotifications = useCallback(async () => {
        setLoading(true)
        const result = await getRecentNotifications(20, false)
        if (result.success && result.notifications) {
            setNotifications(result.notifications)
        }
        setLoading(false)
    }, [])

    // Load unread count
    const loadUnreadCount = useCallback(async () => {
        const result = await getUnreadNotificationCount()
        if (result.success && result.count !== undefined) {
            setUnreadCount(result.count)
        }
    }, [])

    // Handle real-time notification: refresh both list and count
    const handleRealtimeNotification = useCallback(() => {
        loadNotifications()
        loadUnreadCount()
    }, [loadNotifications, loadUnreadCount])

    useRealtimeNotifications({
        userId,
        onNewNotification: handleRealtimeNotification,
        enabled: !!userId,
    })

    // Initial load + fallback polling (60s instead of 30s since we have realtime)
    useEffect(() => {
        loadNotifications()
        loadUnreadCount()

        const interval = setInterval(() => {
            loadUnreadCount()
            if (isOpen) {
                loadNotifications()
            }
        }, 60000)

        return () => clearInterval(interval)
    }, [isOpen, loadNotifications, loadUnreadCount])

    // Mark as read
    const handleMarkAsRead = async (notificationId: string) => {
        await markNotificationAsRead(notificationId)
        await loadNotifications()
        await loadUnreadCount()
    }

    // Mark all as read
    const handleMarkAllAsRead = async () => {
        await markAllNotificationsAsRead()
        await loadNotifications()
        await loadUnreadCount()
    }

    // Handle notification click
    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.is_read) {
            await handleMarkAsRead(notification.id)
        }
        if (notification.action_url) {
            setIsOpen(false)
            router.push(notification.action_url)
        }
    }

    // Get notification icon based on type
    const getNotificationIcon = (type: Notification['type']) => {
        switch (type) {
            case 'contract_ending':
                return '📋'
            case 'health_score_low':
                return '⚠️'
            case 'new_project_match':
                return '🎯'
            case 'loyalty_tier_up':
                return '🏆'
            case 'referral_update':
                return '👥'
            case 'document_uploaded':
                return '📄'
            case 'payment_received':
                return '💰'
            default:
                return '📢'
        }
    }

    // Get priority color
    const getPriorityColor = (priority: Notification['priority']) => {
        switch (priority) {
            case 'urgent':
                return 'bg-red-500/10 border-red-500/20'
            case 'high':
                return 'bg-orange-500/10 border-orange-500/20'
            case 'normal':
                return 'bg-primary/10 border-primary/20'
            default:
                return 'bg-gray-500/10 border-gray-500/20'
        }
    }

    // Format time
    const formatTime = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMs / 3600000)
        const diffDays = Math.floor(diffMs / 86400000)

        if (diffMins < 1) return locale === 'pl' ? 'Teraz' : 'Now'
        if (diffMins < 60) return `${diffMins}${locale === 'pl' ? 'min' : 'm'}`
        if (diffHours < 24) return `${diffHours}${locale === 'pl' ? 'godz' : 'h'}`
        if (diffDays < 7) return `${diffDays}${locale === 'pl' ? 'd' : 'd'}`
        return date.toLocaleDateString(locale === 'pl' ? 'pl-PL' : 'en-US')
    }

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label={locale === 'pl' ? 'Powiadomienia' : 'Notifications'}
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                        >
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Badge>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[380px] p-0">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="font-semibold text-sm">
                        {locale === 'pl' ? 'Powiadomienia' : 'Notifications'}
                    </h3>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleMarkAllAsRead}
                            className="text-xs h-7"
                        >
                            {locale === 'pl' ? 'Oznacz wszystko' : 'Mark all read'}
                        </Button>
                    )}
                </div>

                {/* Notifications List */}
                <ScrollArea className="h-[400px]">
                    {loading ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                            {locale === 'pl' ? 'Ładowanie...' : 'Loading...'}
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                            <Bell className="h-12 w-12 mx-auto mb-2 opcity-50" />
                            <p>{locale === 'pl' ? 'Brak powiadomień' : 'No notifications'}</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {notifications.map((notification) => (
                                <button
                                    key={notification.id}
                                    onClick={() => handleNotificationClick(notification)}
                                    className={cn(
                                        'w-full text-left p-4 transition-colors hover:bg-accent',
                                        !notification.is_read && 'bg-accent/50'
                                    )}
                                >
                                    <div className="flex gap-3">
                                        {/* Icon */}
                                        <div
                                            className={cn(
                                                'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xl border',
                                                getPriorityColor(notification.priority)
                                            )}
                                        >
                                            {getNotificationIcon(notification.type)}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <h4 className={cn(
                                                    'text-sm font-medium line-clamp-1',
                                                    !notification.is_read && 'font-semibold'
                                                )}>
                                                    {locale === 'pl' ? notification.title_pl : notification.title_en}
                                                </h4>
                                                {!notification.is_read && (
                                                    <div className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-1" />
                                                )}
                                            </div>
                                            {(notification.body_pl || notification.body_en) && (
                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                    {locale === 'pl' ? notification.body_pl : notification.body_en}
                                                </p>
                                            )}
                                            <p className="text-xs text-muted-foreground mt-2">
                                                {formatTime(notification.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                {/* Footer */}
                {notifications.length > 0 && (
                    <div className="p-2 border-t">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => {
                                setIsOpen(false)
                                router.push('/notifications')
                            }}
                        >
                            {locale === 'pl' ? 'Zobacz wszystkie' : 'View all'}
                        </Button>
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

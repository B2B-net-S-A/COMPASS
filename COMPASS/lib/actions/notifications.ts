'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import type { Notification, NotificationType, NotificationPriority } from '@/lib/types'

/**
 * Get recent notifications for the current user
 * @param limit - Number of notifications to fetch (default: 10)
 * @param unreadOnly - Only fetch unread notifications
 */
export async function getRecentNotifications(
    limit: number = 10,
    unreadOnly: boolean = false
): Promise<{ success: boolean; notifications?: Notification[]; error?: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Nie jesteś zalogowany' }
        }

        let query = supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (unreadOnly) {
            query = query.eq('is_read', false)
        }

        const { data, error } = await query

        if (error) {
            logger.error({ event: 'notifications.fetch.db_error', error, user_id: user.id })
            return { success: false, error: error.message }
        }

        return { success: true, notifications: data as Notification[] }
    } catch (error: any) {
        logger.error({ event: 'notifications.fetch.unexpected', error })
        return { success: false, error: error.message || 'Nie udało się pobrać powiadomień' }
    }
}

/**
 * Get count of unread notifications
 */
export async function getUnreadNotificationCount(): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Nie jesteś zalogowany' }
        }

        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false)

        if (error) {
            logger.error({ event: 'notifications.count.db_error', error, user_id: user.id })
            return { success: false, error: error.message }
        }

        return { success: true, count: count || 0 }
    } catch (error: any) {
        logger.error({ event: 'notifications.count.unexpected', error })
        return { success: false, error: error.message || 'Nie udało się policzyć powiadomień' }
    }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Nie jesteś zalogowany' }
        }

        const { error } = await supabase
            .from('notifications')
            .update({
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('id', notificationId)
            .eq('user_id', user.id)

        if (error) {
            logger.error({ event: 'notifications.mark_read.db_error', error, notification_id: notificationId })
            return { success: false, error: error.message }
        }

        return { success: true }
    } catch (error: any) {
        logger.error({ event: 'notifications.mark_read.unexpected', error })
        return { success: false, error: error.message || 'Nie udało się oznaczyć powiadomienia jako przeczytane' }
    }
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsAsRead(): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Nie jesteś zalogowany' }
        }

        const { error } = await supabase
            .from('notifications')
            .update({
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('is_read', false)

        if (error) {
            logger.error({ event: 'notifications.mark_all_read.db_error', error })
            return { success: false, error: error.message }
        }

        return { success: true }
    } catch (error: any) {
        logger.error({ event: 'notifications.mark_all_read.unexpected', error })
        return { success: false, error: error.message || 'Nie udało się oznaczyć wszystkich jako przeczytane' }
    }
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Nie jesteś zalogowany' }
        }

        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId)
            .eq('user_id', user.id)

        if (error) {
            logger.error({ event: 'notifications.delete.db_error', error, notification_id: notificationId })
            return { success: false, error: error.message }
        }

        return { success: true }
    } catch (error: any) {
        logger.error({ event: 'notifications.delete.unexpected', error })
        return { success: false, error: error.message || 'Nie udało się usunąć powiadomienia' }
    }
}

/**
 * Create a notification (admin/system only)
 * Note: This uses the helper function in the database
 */
export async function createNotification(params: {
    userId: string
    type: NotificationType
    titlePl: string
    titleEn: string
    bodyPl?: string
    bodyEn?: string
    actionUrl?: string
    priority?: NotificationPriority
}): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Nie jesteś zalogowany' }
        }

        // Check if user is admin
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!['admin'].includes(profile?.role || '') && params.userId !== user.id) {
            return { success: false, error: 'Brak uprawnień: Tylko administratorzy mogą tworzyć powiadomienia dla innych użytkowników' }
        }

        const { data, error } = await supabase
            .rpc('create_notification', {
                p_user_id: params.userId,
                p_type: params.type,
                p_title_pl: params.titlePl,
                p_title_en: params.titleEn,
                p_body_pl: params.bodyPl || undefined,
                p_body_en: params.bodyEn || undefined,
                p_action_url: params.actionUrl || undefined,
                p_priority: params.priority || 'normal'
            })

        if (error) {
            logger.error({ event: 'notifications.create.db_error', error, target_user_id: params.userId })
            return { success: false, error: error.message }
        }

        return { success: true, notificationId: data as string }
    } catch (error: any) {
        logger.error({ event: 'notifications.create.unexpected', error })
        return { success: false, error: error.message || 'Nie udało się utworzyć powiadomienia' }
    }
}

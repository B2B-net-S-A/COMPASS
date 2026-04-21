'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Get a system setting value by key
 */
export async function getSystemSetting(key: string): Promise<string | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .single()

    if (error) {
        console.error(`Failed to get setting ${key}:`, error)
        return null
    }

    return data?.value || null
}

/**
 * Update a system setting (admin only)
 */
export async function updateSystemSetting(key: string, value: string) {
    const supabase = await createClient()

    // Check admin permissions
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!['admin', 'administrator', 'centrala'].includes(profile?.role || '')) {
        throw new Error('Only administrators can update system settings')
    }

    // Update or insert setting
    const { error } = await supabase
        .from('system_settings')
        .upsert({
            key,
            value,
            updated_at: new Date().toISOString(),
            updated_by: user.id
        }, {
            onConflict: 'key'
        })

    if (error) {
        console.error('Failed to update setting:', error)
        throw new Error(`Failed to update setting: ${error.message}`)
    }

    return { success: true }
}

/**
 * Get all system settings (admin only)
 */
export async function getAllSystemSettings() {
    const supabase = await createClient()

    // Check admin permissions
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!['admin', 'administrator', 'centrala'].includes(profile?.role || '')) {
        throw new Error('Only administrators can view system settings')
    }

    const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .order('key', { ascending: true })

    if (error) {
        console.error('Failed to get settings:', error)
        throw new Error('Failed to fetch settings')
    }

    return data || []
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { FavoriteProject } from '@/lib/types'

export async function addFavoriteProject(projectId: string, note?: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data, error } = await supabase
        .from('favorite_projects')
        .insert({
            user_id: user.id,
            project_id: projectId,
            note: note || null
        })
        .select()
        .single()

    if (error) {
        if (error.code === '23505') {
            return { success: true, already_exists: true }
        }
        throw new Error('Failed to add favorite: ' + error.message)
    }

    revalidatePath('/projects')
    revalidatePath('/profile')
    revalidatePath('/admin/projects')
    return { success: true, data }
}

export async function removeFavoriteProject(projectId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error } = await supabase
        .from('favorite_projects')
        .delete()
        .eq('user_id', user.id)
        .eq('project_id', projectId)

    if (error) throw new Error('Failed to remove favorite: ' + error.message)

    revalidatePath('/projects')
    revalidatePath('/profile')
    revalidatePath('/admin/projects')
    return { success: true }
}

export async function toggleFavoriteProject(projectId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Using .select().eq().eq() instead of .single() to be safer
    const { data: existing, error: fetchError } = await supabase
        .from('favorite_projects')
        .select('id')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .maybeSingle()

    if (fetchError) {
        console.error('Error fetching favorite status:', fetchError)
        throw new Error('Failed to toggle favorite')
    }

    if (existing) {
        const { error: deleteError } = await supabase
            .from('favorite_projects')
            .delete()
            .eq('id', existing.id)

        if (deleteError) throw new Error('Failed to remove favorite')

        revalidatePath('/projects')
        revalidatePath('/profile')
        revalidatePath('/admin/projects')
        return { success: true, is_favorite: false }
    } else {
        const { error: insertError } = await supabase
            .from('favorite_projects')
            .insert({
                user_id: user.id,
                project_id: projectId
            })

        if (insertError) throw new Error('Failed to add favorite')

        revalidatePath('/projects')
        revalidatePath('/profile')
        revalidatePath('/admin/projects')
        return { success: true, is_favorite: true }
    }
}

export async function getMyFavoriteProjects(): Promise<(FavoriteProject & { project: any })[]> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('favorite_projects')
        .select('*, project:projects(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Failed to get favorites:', error)
        return []
    }
    return data || []
}

export async function getUserFavoriteProjects(userId: string): Promise<(FavoriteProject & { project: any })[]> {
    const supabase = createClient()

    const { data, error } = await supabase
        .from('favorite_projects')
        .select('*, project:projects(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Failed to get user favorites:', error)
        return []
    }
    return data || []
}

export async function getMyFavoriteProjectIds(): Promise<string[]> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('favorite_projects')
        .select('project_id')
        .eq('user_id', user.id)

    if (error) return []
    return (data || []).map(d => d.project_id)
}

export async function updateFavoriteNote(projectId: string, note: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error } = await supabase
        .from('favorite_projects')
        .update({ note })
        .eq('user_id', user.id)
        .eq('project_id', projectId)

    if (error) throw new Error('Failed to update note: ' + error.message)
    return { success: true }
}

export async function getProjectFavoriteCount(projectId: string): Promise<number> {
    const supabase = createClient()

    const { count, error } = await supabase
        .from('favorite_projects')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)

    if (error) return 0
    return count || 0
}

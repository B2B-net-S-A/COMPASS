'use server'

import { createClient } from '@/lib/supabase/server'

export async function addAdminNote(consultantId: string, content: string, category: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Nie jesteś zalogowany' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single()

    if (!profile || !['admin', 'administrator', 'centrala'].includes(profile.role)) {
        return { success: false, error: 'Brak uprawnień' }
    }

    const newNote = {
        author_id: user.id,
        author_name: profile.full_name || user.email,
        content,
        created_at: new Date().toISOString(),
        category,
    }

    const { data: targetProfile } = await supabase
        .from('profiles')
        .select('admin_notes')
        .eq('id', consultantId)
        .single()

    if (targetProfile) {
        const existingNotes = (targetProfile.admin_notes as Record<string, unknown>[]) || []
        const { error } = await supabase
            .from('profiles')
            .update({ admin_notes: [...existingNotes, newNote] })
            .eq('id', consultantId)

        if (error) return { success: false, error: 'Nie udało się dodać notatki' }
        return { success: true, note: newNote }
    }

    // Candidates table may not have admin_notes column yet — try gracefully
    try {
        const { data: targetCandidate } = await supabase
            .from('candidates')
            .select('admin_notes')
            .eq('id', consultantId)
            .single()

        if (targetCandidate) {
            const existingNotes = (targetCandidate.admin_notes as Record<string, unknown>[]) || []
            const { error } = await supabase
                .from('candidates')
                .update({ admin_notes: [...existingNotes, newNote] })
                .eq('id', consultantId)

            if (error) return { success: false, error: 'Nie udało się dodać notatki' }
            return { success: true, note: newNote }
        }
    } catch {
        return { success: false, error: 'Kolumna admin_notes nie istnieje w tabeli candidates. Wymagana migracja SQL.' }
    }

    return { success: false, error: 'Nie znaleziono profilu' }
}

export async function getAdminNotes(consultantId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Nie jesteś zalogowany' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || !['admin', 'administrator', 'centrala'].includes(profile.role)) {
        return { success: false, error: 'Brak uprawnień' }
    }

    const { data: targetProfile } = await supabase
        .from('profiles')
        .select('admin_notes')
        .eq('id', consultantId)
        .single()

    if (targetProfile) {
        return { success: true, notes: (targetProfile.admin_notes as Record<string, unknown>[]) || [] }
    }

    try {
        const { data: targetCandidate } = await supabase
            .from('candidates')
            .select('admin_notes')
            .eq('id', consultantId)
            .single()

        return { success: true, notes: (targetCandidate?.admin_notes as Record<string, unknown>[]) || [] }
    } catch {
        return { success: true, notes: [] }
    }
}

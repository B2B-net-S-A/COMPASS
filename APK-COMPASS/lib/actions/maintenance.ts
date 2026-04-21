'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function cleanDuplicateCandidates() {
    try {
        const supabase = createClient()

        // 1. Fetch all candidates
        const { data: candidates, error } = await supabase
            .from('candidates')
            .select('id, email, full_name, created_at, skills, bio, phone, avatar_url, cv_url')
            .order('created_at', { ascending: true })

        if (error) throw new Error(`Supabase Fetch Error: ${error.message}`)

        if (!candidates || candidates.length === 0) {
            return { count: 0, message: 'Brak kandydatów do sprawdzenia.' }
        }

        const idsToDelete: string[] = []
        const updates: { id: string; skills: string[] }[] = []

        // Helper to process a group of duplicates
        const processGroup = (group: any[]) => {
            if (group.length < 2) return

            const master = group[0] // Oldest is master
            const victims = group.slice(1) // Newer are victims

            // Merge Skills
            const allSkills = new Set<string>(master.skills || [])
            victims.forEach((v: any) => {
                if (v.skills) v.skills.forEach((s: string) => allSkills.add(s))
                idsToDelete.push(v.id)
            })

            // Prepare Update for Master (only if skills changed)
            if (allSkills.size > (master.skills?.length || 0)) {
                updates.push({
                    id: master.id,
                    skills: Array.from(allSkills)
                })
            }
        }

        // Group by Email
        const byEmail = new Map<string, any[]>()
        candidates.forEach((c: any) => {
            if (c.email) {
                const key = c.email.toLowerCase().trim()
                if (!byEmail.has(key)) byEmail.set(key, [])
                byEmail.get(key)!.push(c)
            }
        })

        byEmail.forEach(group => processGroup(group))

        // 3. Apply Updates (Merge Skills)
        for (const update of updates) {
            await supabase.from('candidates').update({ skills: update.skills }).eq('id', update.id)
        }

        // 4. Delete duplicates
        if (idsToDelete.length > 0) {
            const { error: deleteError } = await supabase
                .from('candidates')
                .delete()
                .in('id', idsToDelete)

            if (deleteError) {
                console.error('Delete Error:', deleteError)
                return { count: 0, message: `Błąd usuwania API: ${deleteError.message}` }
            }
        }

        try {
            revalidatePath('/admin/candidates')
        } catch (e) {
            console.warn('Revalidate path failed:', e)
        }

        return {
            count: idsToDelete.length,
            message: idsToDelete.length > 0
                ? `Sukces! Scalono i usunięto ${idsToDelete.length} duplikatów.`
                : 'Nie znaleziono żadnych duplikatów.'
        }

    } catch (err: any) {
        console.error('Maintenance Action Critical Error:', err)
        return { count: 0, message: `Błąd krytyczny serwera: ${err.message || 'Nieznany błąd'}` }
    }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'

export async function setOnboardingTourDone(): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const admin = createServiceClient()
        const { error } = await admin
            .from('profiles')
            .update({ onboarding_tour_done: true })
            .eq('id', user.id)

        if (error) return { success: false, error: error.message }
        return { success: true }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Błąd' }
    }
}

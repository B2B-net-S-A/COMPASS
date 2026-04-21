'use client'

import { UnifiedDocumentManager } from "@/components/documents/UnifiedDocumentManager"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export function DocumentsSection() {
    const [profileId, setProfileId] = useState<string | undefined>(undefined)
    const [isAdmin, setIsAdmin] = useState(false)

    useEffect(() => {
        async function init() {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setProfileId(user.id)
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single()
                if (profile && ['admin', 'administrator', 'centrala'].includes(profile.role)) {
                    setIsAdmin(true)
                }
            }
        }
        init()
    }, [])

    return (
        <div className="space-y-4">
            <UnifiedDocumentManager
                ownerId={profileId}
                isAdminView={isAdmin}
            />
        </div>
    )
}

'use client'

import { ShieldAlert } from 'lucide-react'
import { usePermissions } from '@/lib/hooks/usePermissions'
import type { PermissionFeature } from '@/lib/types/permissions'

interface PermissionGateProps {
    feature: PermissionFeature
    children: React.ReactNode
    fallback?: React.ReactNode
}

/**
 * Wraps content that should only be visible if the user has access
 * to a given feature. Admins always pass the gate.
 *
 * Usage:
 *   <PermissionGate feature="candidates">
 *       <CandidatesPage />
 *   </PermissionGate>
 */
export function PermissionGate({ feature, children, fallback }: PermissionGateProps) {
    const { hasAccess } = usePermissions()

    if (!hasAccess(feature)) {
        return fallback ?? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center p-6">
                <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
                <h1 className="text-2xl font-bold">Brak Dostępu</h1>
                <p className="text-muted-foreground mt-2 max-w-md">
                    Nie masz uprawnień do tego modułu. Skontaktuj się z Administratorem,
                    aby uzyskać dostęp.
                </p>
            </div>
        )
    }

    return <>{children}</>
}

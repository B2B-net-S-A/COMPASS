'use client'

import { usePermissions } from '@/lib/hooks/usePermissions'
import type { PermissionFeature } from '@/lib/types/permissions'
import { PermissionGate } from '@/components/common/PermissionGate'

interface ProtectedPageProps {
    feature: PermissionFeature
    children: React.ReactNode
}

/**
 * Client wrapper for protected pages.
 * Server components (pages) can wrap their content in this component
 * to enforce permission-based access control.
 *
 * Usage in a page.tsx:
 *   <ProtectedPage feature="candidates">
 *       <YourPageContent />
 *   </ProtectedPage>
 */
export function ProtectedPage({ feature, children }: ProtectedPageProps) {
    const { isReadonly } = usePermissions()
    const readonly = isReadonly(feature)

    return (
        <PermissionGate feature={feature}>
            {readonly ? (
                <div>
                    <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-400 flex items-center gap-2">
                        <span>🔒</span>
                        <span>Tryb tylko do odczytu — nie możesz edytować danych w tym module.</span>
                    </div>
                    <div className="pointer-events-none opacity-90 [&_button]:opacity-50 [&_button]:cursor-not-allowed [&_a[href*='new']]:opacity-50 [&_a[href*='new']]:cursor-not-allowed">
                        {children}
                    </div>
                </div>
            ) : (
                <>{children}</>
            )}
        </PermissionGate>
    )
}

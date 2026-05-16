import { requireAdminLayout } from '@/lib/auth/internal-guard'
import { listRoleDefaults } from '@/lib/actions/internal-timesheet-role-defaults'
import { RoleDefaultsManager } from '@/components/internal/RoleDefaultsManager'

export const dynamic = 'force-dynamic'

export default async function RoleDefaultsPage() {
    await requireAdminLayout()
    const defaults = await listRoleDefaults()
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Domyślne opisy timesheet</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Definiuj globalne szablony opisu usług per rola lub projekt. Pracownik klika
                    „Wypełnij defaultem” w timesheecie, a system dobiera najbardziej specyficzny
                    aktywny default (rola+projekt &gt; rola &gt; projekt &gt; globalny).
                </p>
            </div>
            <RoleDefaultsManager initialDefaults={defaults} />
        </div>
    )
}

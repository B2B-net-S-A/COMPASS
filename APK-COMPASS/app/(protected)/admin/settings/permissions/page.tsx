import Link from 'next/link'
import { getPermissions } from '@/lib/actions/permissions'
import { PermissionsTable } from '@/components/admin/PermissionsTable'
import { ShieldCheck, Users, ArrowRight } from 'lucide-react'

export default async function PermissionsPage() {
    const permissions = await getPermissions()

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h3 className="text-lg font-medium flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Uprawnienia Ról
                </h3>
                <p className="text-sm text-muted-foreground">
                    Definiuj zakres dostępu dla każdej roli w systemie Compass.
                    Zmiany obowiązują po ponownym zalogowaniu użytkownika.
                </p>
            </div>

            {/* Info banner — link to Zarządzanie Centralą */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                <Users className="h-4 w-4 shrink-0 text-foreground" />
                <span className="text-muted-foreground">
                    Tutaj definiujesz <strong>co</strong> dana rola może robić. Aby zarządzać <strong>kto</strong> jest w Centrali i przypisywać role, przejdź do{' '}
                    <Link href="/admin/settings/team" className="text-foreground font-medium hover:underline inline-flex items-center gap-1">
                        Zarządzania Centralą <ArrowRight className="h-3 w-3" />
                    </Link>
                </span>
            </div>

            <PermissionsTable initialPermissions={permissions} />
        </div>
    )
}

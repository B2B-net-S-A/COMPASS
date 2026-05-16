import Link from 'next/link'
import { listEmployeesForLifecycle } from '@/lib/actions/lifecycle'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { EmployeesDirectory } from '../components/EmployeesDirectory'
import { Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function EmployeesDirectoryPage() {
    await requireLifecycleManagerAction()
    const employees = await listEmployeesForLifecycle('all')

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-7xl">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Users className="h-7 w-7 text-cyan-400" />
                        Pracownicy
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {employees.length} pracowników HR-zone z filtrami i akcjami per osoba
                    </p>
                </div>
                <Link href="/internal/lifecycle" className="text-sm underline text-muted-foreground">
                    ← Powrót do hub
                </Link>
            </header>

            <EmployeesDirectory initialEmployees={employees} />
        </div>
    )
}

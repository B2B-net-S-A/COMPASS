import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { roleLabelPl } from '@/lib/types/role'

interface EmployeeRow {
    id: string
    full_name: string | null
    email: string
    avatar_url: string | null
    role: string
    default_location: 'onsite' | 'remote' | null
    employment_type: 'uop' | 'b2b' | null
    work_start_date: string | null
}

export async function AdminEmployeesPanel() {
    const admin = createServiceClient()
    const { data } = await admin
        .from('profiles')
        .select(
            'id, full_name, email, avatar_url, role, default_location, employment_type, work_start_date',
        )
        .in('role', ['internal', 'admin'])
        .order('full_name')
    const employees = (data ?? []) as EmployeeRow[]

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Pracownicy wewnętrzni</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Lista pracowników internal + admin. Aby zmienić rolę lub edytować pola HR
                    (lokalizacja, typ umowy), użyj{' '}
                    <Link href="/admin/settings/users" className="text-primary underline">
                        Zarządzania użytkownikami
                    </Link>
                    .
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Lista ({employees.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {employees.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                            Brak pracowników. Nadaj pierwszej osobie rolę „internal" w Zarządzaniu
                            użytkownikami.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-xs text-muted-foreground">
                                        <th className="text-left py-2 pr-2 font-medium">Osoba</th>
                                        <th className="text-left py-2 pr-2 font-medium">Rola</th>
                                        <th className="text-left py-2 pr-2 font-medium">Lokalizacja</th>
                                        <th className="text-left py-2 pr-2 font-medium">Umowa</th>
                                        <th className="text-left py-2 pr-2 font-medium">Od</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.map((e) => (
                                        <tr key={e.id} className="border-b border-border/40">
                                            <td className="py-2 pr-2">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-7 w-7">
                                                        <AvatarImage src={e.avatar_url || undefined} />
                                                        <AvatarFallback className="text-[10px]">
                                                            {(e.full_name ?? e.email)
                                                                .slice(0, 2)
                                                                .toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="text-xs font-medium">
                                                            {e.full_name ?? e.email.split('@')[0]}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground">
                                                            {e.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-2 pr-2">
                                                <Badge variant="outline" className="text-[10px]">
                                                    {roleLabelPl(e.role)}
                                                </Badge>
                                            </td>
                                            <td className="py-2 pr-2 text-xs">
                                                {e.default_location === 'remote' ? 'Zdalnie' : 'Biuro'}
                                            </td>
                                            <td className="py-2 pr-2 text-xs">
                                                {e.employment_type === 'b2b' ? 'B2B' : 'UoP'}
                                            </td>
                                            <td className="py-2 pr-2 text-xs">
                                                {e.work_start_date ?? '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    )
}

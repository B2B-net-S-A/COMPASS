'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Loader2 } from 'lucide-react'
import { roleLabelPl } from '@/lib/types/role'
import { EditEmployeeDialog, type ManagerCandidateRow } from '@/components/admin/EditEmployeeDialog'

export interface EmployeeRow {
    id: string
    full_name: string | null
    email: string
    avatar_url: string | null
    role: string
    default_location: 'onsite' | 'remote' | null
    employment_type: 'uop' | 'b2b' | null
    work_start_date: string | null
    manager_id: string | null
    manager_full_name: string | null
    manager_email: string | null
}

interface Props {
    initialEmployees: EmployeeRow[]
    managerCandidates: ManagerCandidateRow[]
}

const ROLE_FILTERS = ['all', 'admin', 'manager', 'finanse', 'talent_community', 'internal'] as const
type RoleFilter = (typeof ROLE_FILTERS)[number]

export function AdminEmployeesPanelClient({ initialEmployees, managerCandidates }: Props) {
    const [employees, setEmployees] = useState<EmployeeRow[]>(initialEmployees)
    const [filter, setFilter] = useState<RoleFilter>('all')
    const [editTarget, setEditTarget] = useState<EmployeeRow | null>(null)
    const [, startReload] = useTransition()

    const filtered = filter === 'all' ? employees : employees.filter((e) => e.role === filter)

    function onUpdated(updated: EmployeeRow) {
        setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
        setEditTarget(null)
    }

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Pracownicy wewnętrzni</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Lista wszystkich pracowników biurowych (admin, manager, finanse, talent_community,
                    konsultant wewnętrzny). Edytuj rolę i managera bezpośrednio z poziomu listy. Pełne
                    Zarządzanie użytkownikami:{' '}
                    <Link href="/admin/settings/users" className="text-primary underline">
                        /admin/settings/users
                    </Link>
                    .
                </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs uppercase text-muted-foreground">Filtr:</span>
                {ROLE_FILTERS.map((f) => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            filter === f
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/70'
                        }`}
                    >
                        {f === 'all' ? 'Wszyscy' : roleLabelPl(f)}
                    </button>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Lista ({filtered.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {filtered.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                            Brak pracowników w wybranym filtrze.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-xs text-muted-foreground">
                                        <th className="text-left py-2 pr-2 font-medium">Osoba</th>
                                        <th className="text-left py-2 pr-2 font-medium">Rola</th>
                                        <th className="text-left py-2 pr-2 font-medium">Manager</th>
                                        <th className="text-left py-2 pr-2 font-medium">Lokalizacja</th>
                                        <th className="text-left py-2 pr-2 font-medium">Od</th>
                                        <th className="text-right py-2 pl-2 font-medium">Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((e) => (
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
                                                {e.manager_full_name ?? e.manager_email ?? (
                                                    <span className="text-muted-foreground/60">—</span>
                                                )}
                                            </td>
                                            <td className="py-2 pr-2 text-xs">
                                                {e.default_location === 'remote' ? 'Zdalnie' : 'Biuro'}
                                            </td>
                                            <td className="py-2 pr-2 text-xs">
                                                {e.work_start_date ?? '—'}
                                            </td>
                                            <td className="py-2 pl-2 text-right">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => setEditTarget(e)}
                                                    className="h-7 px-2"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {editTarget && (
                <EditEmployeeDialog
                    employee={editTarget}
                    managerCandidates={managerCandidates}
                    open={!!editTarget}
                    onOpenChange={(o) => !o && setEditTarget(null)}
                    onUpdated={onUpdated}
                />
            )}
        </section>
    )
}

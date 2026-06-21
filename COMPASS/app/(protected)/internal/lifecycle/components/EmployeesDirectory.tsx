'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, FileText, LogOut, MessageSquare, MoreHorizontal, Search, Settings, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { roleLabelPl, type DbRole } from '@/lib/types/role'
import type { EligibleEmployee } from '@/lib/actions/lifecycle'
import { StartOnboardingDialog } from './StartOnboardingDialog'
import { ScheduleExitDialog } from './ScheduleExitDialog'
import { EditLifecycleProfileDialog } from './EditLifecycleProfileDialog'
import { ExternalEmployeeDialog } from './ExternalEmployeeDialog'
import { EmployeeNotesDialog } from './EmployeeNotesDialog'

const STATUS_LABEL: Record<string, string> = {
    pending: 'Czeka',
    onboarding: 'Onboarding',
    active: 'Aktywny',
    offboarding: 'Offboarding',
    exited: 'Odszedł',
}
const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    onboarding: 'bg-info/20 text-info',
    active: 'bg-success/20 text-success',
    offboarding: 'bg-warning/20 text-warning',
    exited: 'bg-destructive/20 text-destructive',
}

interface Props {
    initialEmployees: EligibleEmployee[]
}

type StatusFilter = 'all' | 'pending' | 'onboarding' | 'active' | 'offboarding' | 'exited'
type RoleFilter = 'all' | DbRole

export function EmployeesDirectory({ initialEmployees }: Props) {
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
    const [activeMenu, setActiveMenu] = useState<string | null>(null)

    // Dialogs
    const [externalOpen, setExternalOpen] = useState(false)
    const [startOnboardingFor, setStartOnboardingFor] = useState<EligibleEmployee | null>(null)
    const [scheduleExitFor, setScheduleExitFor] = useState<EligibleEmployee | null>(null)
    const [editProfileFor, setEditProfileFor] = useState<EligibleEmployee | null>(null)
    const [notesFor, setNotesFor] = useState<EligibleEmployee | null>(null)

    const filtered = useMemo(() => {
        return initialEmployees.filter((e) => {
            if (statusFilter !== 'all' && e.employment_status !== statusFilter) return false
            if (roleFilter !== 'all' && e.role !== roleFilter) return false
            if (search.trim()) {
                const s = search.toLowerCase()
                return (
                    (e.full_name ?? '').toLowerCase().includes(s)
                    || e.email.toLowerCase().includes(s)
                )
            }
            return true
        })
    }, [initialEmployees, search, statusFilter, roleFilter])

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { all: initialEmployees.length }
        for (const e of initialEmployees) {
            counts[e.employment_status] = (counts[e.employment_status] ?? 0) + 1
        }
        return counts
    }, [initialEmployees])

    return (
        <div className="space-y-4">
            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => setExternalOpen(true)} variant="outline" className="border-warning/50">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Dodaj external pracownika
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">{filtered.length} z {initialEmployees.length}</p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Szukaj po imieniu lub emailu..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="h-9 px-3 rounded-md border bg-background text-sm"
                >
                    <option value="all">Status: wszystkie ({statusCounts.all ?? 0})</option>
                    {(['pending', 'onboarding', 'active', 'offboarding', 'exited'] as const).map((s) => (
                        <option key={s} value={s}>
                            {STATUS_LABEL[s]} ({statusCounts[s] ?? 0})
                        </option>
                    ))}
                </select>
                <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                    className="h-9 px-3 rounded-md border bg-background text-sm"
                >
                    <option value="all">Rola: wszystkie</option>
                    <option value="consultant">Konsultant IT</option>
                    <option value="internal">Konsultant wewnętrzny</option>
                    <option value="finanse">Finanse</option>
                    <option value="manager">Manager</option>
                    <option value="talent_community">TCM</option>
                </select>
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
                <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
                    Brak pracowników pasujących do filtrów.
                </div>
            ) : (
                <div className="rounded-lg border bg-card overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase">
                            <tr>
                                <th className="text-left p-3">Pracownik</th>
                                <th className="text-left p-3">Rola</th>
                                <th className="text-left p-3">Status</th>
                                <th className="text-left p-3">Hire date</th>
                                <th className="text-left p-3">Flagi</th>
                                <th className="text-right p-3">Akcje</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((e) => (
                                <tr key={e.id} className="border-t hover:bg-accent/40">
                                    <td className="p-3">
                                        <div className="font-medium flex items-center gap-2">
                                            {e.full_name ?? e.email}
                                            {e.is_external && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning uppercase tracking-wide">
                                                    external
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{e.email}</div>
                                    </td>
                                    <td className="p-3 text-muted-foreground">{roleLabelPl(e.role)}</td>
                                    <td className="p-3">
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${STATUS_COLOR[e.employment_status]}`}>
                                            {STATUS_LABEL[e.employment_status] ?? e.employment_status}
                                        </span>
                                    </td>
                                    <td className="p-3 text-muted-foreground text-xs">
                                        {e.hired_at ? new Date(e.hired_at).toLocaleDateString('pl-PL') : '—'}
                                    </td>
                                    <td className="p-3 text-xs">
                                        {e.has_active_onboarding && (
                                            <span className="px-2 py-0.5 rounded bg-info/20 text-info">onboarding</span>
                                        )}
                                        {e.has_active_exit_interview && (
                                            <span className="px-2 py-0.5 rounded bg-warning/20 text-warning ml-1">exit</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-right relative">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setActiveMenu(activeMenu === e.id ? null : e.id)}
                                        >
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                        {activeMenu === e.id && (
                                            <div className="absolute right-3 top-full mt-1 z-10 rounded-md border bg-card shadow-lg min-w-[220px] py-1">
                                                {!e.has_active_onboarding && e.employment_status !== 'exited' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => { setActiveMenu(null); setStartOnboardingFor(e) }}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                                                    >
                                                        <UserPlus className="h-4 w-4 text-info" />
                                                        Uruchom onboarding
                                                    </button>
                                                )}
                                                {e.has_active_onboarding && (
                                                    <Link
                                                        href={`/internal/lifecycle/onboarding/${e.id}-progress`}
                                                        onClick={() => setActiveMenu(null)}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                                                    >
                                                        <FileText className="h-4 w-4 text-info" />
                                                        Otwórz aktywny onboarding
                                                    </Link>
                                                )}
                                                {!e.has_active_exit_interview && e.employment_status !== 'exited' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => { setActiveMenu(null); setScheduleExitFor(e) }}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                                                    >
                                                        <LogOut className="h-4 w-4 text-warning" />
                                                        Zaplanuj exit interview
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => { setActiveMenu(null); setEditProfileFor(e) }}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                                                >
                                                    <Settings className="h-4 w-4" />
                                                    Edytuj lifecycle profile
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setActiveMenu(null); setNotesFor(e) }}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                                                >
                                                    <MessageSquare className="h-4 w-4" />
                                                    Notatki TCM
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Dialogs */}
            <ExternalEmployeeDialog
                open={externalOpen}
                onOpenChange={(o) => { setExternalOpen(o); if (!o) router.refresh() }}
            />
            {startOnboardingFor && (
                <StartOnboardingDialog
                    open={!!startOnboardingFor}
                    onOpenChange={(o) => { if (!o) { setStartOnboardingFor(null); router.refresh() } }}
                />
            )}
            {scheduleExitFor && (
                <ScheduleExitDialog
                    open={!!scheduleExitFor}
                    onOpenChange={(o) => { if (!o) { setScheduleExitFor(null); router.refresh() } }}
                />
            )}
            {editProfileFor && (
                <EditLifecycleProfileDialog
                    open={!!editProfileFor}
                    onOpenChange={(o) => { if (!o) { setEditProfileFor(null); router.refresh() } }}
                    employee={editProfileFor}
                />
            )}
            {notesFor && (
                <EmployeeNotesDialog
                    open={!!notesFor}
                    onOpenChange={(o) => { if (!o) { setNotesFor(null); router.refresh() } }}
                    employee={notesFor}
                />
            )}
        </div>
    )
}

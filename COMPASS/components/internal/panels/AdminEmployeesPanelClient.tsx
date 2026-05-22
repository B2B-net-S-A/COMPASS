'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Pencil, Archive, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { roleLabelPl } from '@/lib/types/role'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { archiveEmployee, deleteUserAccount } from '@/lib/actions/user-admin'
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
    const [archiveTarget, setArchiveTarget] = useState<EmployeeRow | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<EmployeeRow | null>(null)

    const filtered = filter === 'all' ? employees : employees.filter((e) => e.role === filter)

    function onUpdated(updated: EmployeeRow) {
        setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
        setEditTarget(null)
    }

    function onArchived() {
        // Employee stays on list (role unchanged) — full removal happens after
        // offboarding tasks done + Mark as exited in /internal/lifecycle.
        setArchiveTarget(null)
    }

    function onDeleted(id: string) {
        setEmployees((prev) => prev.filter((e) => e.id !== id))
        setDeleteTarget(null)
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
                                            <td className="py-2 pl-2">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setEditTarget(e)}
                                                        className="h-7 px-2"
                                                        title="Edytuj rolę i managera"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setArchiveTarget(e)}
                                                        className="h-7 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                                        title="Archiwizuj — uruchom offboarding + exit interview"
                                                    >
                                                        <Archive className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setDeleteTarget(e)}
                                                        className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        title="Usuń konto (nieodwracalne)"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
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

            <ArchiveEmployeeDialog
                employee={archiveTarget}
                onOpenChange={(o) => !o && setArchiveTarget(null)}
                onArchived={onArchived}
            />

            <DeleteEmployeeDialog
                employee={deleteTarget}
                onOpenChange={(o) => !o && setDeleteTarget(null)}
                onDeleted={onDeleted}
            />
        </section>
    )
}

// ─── Archive dialog (offboarding + exit interview) ──────────────────────────

interface ArchiveProps {
    employee: EmployeeRow | null
    onOpenChange: (open: boolean) => void
    onArchived: () => void
}

function ArchiveEmployeeDialog({ employee, onOpenChange, onArchived }: ArchiveProps) {
    const today = new Date().toISOString().slice(0, 10)
    const [terminationDate, setTerminationDate] = useState<string>(today)
    const [sendEmployeeEmail, setSendEmployeeEmail] = useState(false)
    const [sendManagerEmail, setSendManagerEmail] = useState(false)
    const [isPending, startTransition] = useTransition()

    function handleConfirm() {
        if (!employee) return
        startTransition(async () => {
            const res = await archiveEmployee(employee.id, terminationDate, {
                sendEmployeeEmail,
                sendManagerEmail,
            })
            if (!res.ok) {
                toast.error(res.error)
                return
            }
            const sentParts: string[] = []
            if (sendEmployeeEmail) sentParts.push('zaproszenie do pracownika')
            if (sendManagerEmail) sentParts.push('checklist do managera')
            toastSuccess(
                sentParts.length > 0
                    ? `Uruchomiono offboarding dla ${employee.full_name ?? employee.email}. Wysłano: ${sentParts.join(' + ')}.`
                    : `Uruchomiono offboarding dla ${employee.full_name ?? employee.email} (bez emaili — możesz je wysłać później z karty exit).`,
            )
            onArchived()
        })
    }

    return (
        <AlertDialog open={!!employee} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <Archive className="h-4 w-4 text-amber-600" />
                        Archiwizuj pracownika
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-3 text-sm">
                            <p>
                                Uruchomisz pełny proces offboardingu dla{' '}
                                <strong>{employee?.full_name ?? employee?.email}</strong>:
                            </p>
                            <ul className="list-disc list-inside space-y-0.5 text-xs text-muted-foreground">
                                <li>
                                    <code className="text-[10px]">employment_status</code> →{' '}
                                    <code className="text-[10px]">offboarding</code>
                                </li>
                                <li>5 default offboarding tasks (access, equipment, knowledge transfer…)</li>
                                <li>Exit interview zaplanowany (status <code className="text-[10px]">scheduled</code>)</li>
                                <li>Emaile: tylko gdy zaznaczysz checkboxy poniżej (domyślnie wyciszone)</li>
                            </ul>
                            <p className="text-xs text-muted-foreground">
                                Konto <strong>nie znika</strong> z listy. Kolejka: <code>/internal/lifecycle</code>.
                                Po wykonaniu wszystkich required tasks admin/TCM klika &quot;Mark as exited&quot;.
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="archive-termination-date">Data zakończenia</Label>
                        <Input
                            id="archive-termination-date"
                            type="date"
                            value={terminationDate}
                            min={today}
                            onChange={(e) => setTerminationDate(e.target.value)}
                            disabled={isPending}
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Domyślnie dziś. Wpływa na due dates offboarding tasks + termin exit interview.
                        </p>
                    </div>

                    <div className="space-y-2 rounded border border-input bg-muted/20 p-3">
                        <div className="text-xs font-medium">Powiadomienia email (opcjonalne)</div>
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={sendEmployeeEmail}
                                onChange={(e) => setSendEmployeeEmail(e.target.checked)}
                                disabled={isPending}
                                className="mt-0.5 h-4 w-4 rounded border-input"
                            />
                            <span className="text-xs">
                                Wyślij zaproszenie do exit interview do pracownika
                            </span>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={sendManagerEmail}
                                onChange={(e) => setSendManagerEmail(e.target.checked)}
                                disabled={isPending}
                                className="mt-0.5 h-4 w-4 rounded border-input"
                            />
                            <span className="text-xs">
                                Wyślij checklist offboardingu managerowi
                            </span>
                        </label>
                        <p className="text-[11px] text-muted-foreground">
                            Domyślnie wyłączone. Emaile możesz wysłać później z karty exit interview.
                        </p>
                    </div>
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>Anuluj</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault()
                            handleConfirm()
                        }}
                        disabled={isPending || !terminationDate}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                        {isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Archiwizuję…
                            </>
                        ) : (
                            <>
                                <Archive className="mr-2 h-4 w-4" /> Archiwizuj
                            </>
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

// ─── Delete dialog (hard delete — destructive) ──────────────────────────────

interface DeleteProps {
    employee: EmployeeRow | null
    onOpenChange: (open: boolean) => void
    onDeleted: (id: string) => void
}

function DeleteEmployeeDialog({ employee, onOpenChange, onDeleted }: DeleteProps) {
    const [confirmEmail, setConfirmEmail] = useState<string>('')
    const [isPending, startTransition] = useTransition()

    const expected = employee?.email.trim().toLowerCase() ?? ''
    const typed = confirmEmail.trim().toLowerCase()
    const matches = !!expected && typed === expected

    function handleConfirm() {
        if (!employee || !matches) return
        startTransition(async () => {
            const res = await deleteUserAccount(employee.id, confirmEmail)
            if (!res.ok) {
                toast.error(res.error)
                return
            }
            toastSuccess(`Konto ${employee.email} zostało usunięte.`)
            setConfirmEmail('')
            onDeleted(employee.id)
        })
    }

    function handleOpenChange(open: boolean) {
        if (!open) setConfirmEmail('')
        onOpenChange(open)
    }

    return (
        <AlertDialog open={!!employee} onOpenChange={handleOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Usuń konto — operacja nieodwracalna
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-3 text-sm">
                            <p>
                                Usuwasz konto <strong>{employee?.full_name ?? employee?.email}</strong>{' '}
                                (<code className="text-[11px]">{employee?.email}</code>).
                            </p>
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs space-y-1">
                                <p className="font-medium text-destructive">Konsekwencje:</p>
                                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                                    <li>Konto Supabase Auth zostanie skasowane (login niemożliwy)</li>
                                    <li>
                                        Powiązane dane z <code>ON DELETE CASCADE</code> zostaną
                                        usunięte: timesheety, faktury, dokumenty, lifecycle artefakty,
                                        loyalty, akademia
                                    </li>
                                    <li>
                                        Dane z <code>ON DELETE RESTRICT</code> (np. zgłoszenia
                                        inkubatora) <strong>zablokują</strong> usuwanie — w takim
                                        przypadku użyj <em>Archiwizuj</em>
                                    </li>
                                </ul>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Dla RODO-compliant retention preferuj{' '}
                                <strong>Archiwizuj</strong> (offboarding flow).
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="space-y-1.5">
                    <Label htmlFor="delete-confirm-email">
                        Wpisz email użytkownika aby potwierdzić
                    </Label>
                    <Input
                        id="delete-confirm-email"
                        type="email"
                        autoComplete="off"
                        placeholder={employee?.email ?? ''}
                        value={confirmEmail}
                        onChange={(e) => setConfirmEmail(e.target.value)}
                        disabled={isPending}
                        className={
                            confirmEmail && !matches
                                ? 'border-destructive focus-visible:ring-destructive'
                                : ''
                        }
                    />
                    {confirmEmail && !matches && (
                        <p className="text-[11px] text-destructive">
                            Email nie pasuje do konta użytkownika.
                        </p>
                    )}
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>Anuluj</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault()
                            handleConfirm()
                        }}
                        disabled={isPending || !matches}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                        {isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Usuwam…
                            </>
                        ) : (
                            <>
                                <Trash2 className="mr-2 h-4 w-4" /> Usuń konto
                            </>
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Crown,
    KeyRound,
    Loader2,
    Lock,
    LogOut,
    Mail,
    MoreVertical,
    ShieldAlert,
    ShieldCheck,
    Search,
    Users,
    Ban,
    UserCog,
    UserPlus,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { SetPasswordDialog } from '@/components/admin/SetPasswordDialog'
import { EmployeeProfileDialog } from '@/components/admin/EmployeeProfileDialog'
import { InviteUserDialog } from '@/components/admin/InviteUserDialog'
import {
    listAllUsers,
    sendPasswordResetLink,
    signOutAllSessions,
    setUserBan,
    setUserRole,
    checkUserAdminAccess,
    type UserAdminItem,
} from '@/lib/actions/user-admin'
import { DB_ROLES, type DbRole, roleLabelPl } from '@/lib/types/role'

const PAGE_SIZE = 50

export function UserManagementPanel() {
    const [allowed, setAllowed] = useState<boolean | null>(null)
    const [items, setItems] = useState<UserAdminItem[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [loading, setLoading] = useState(true)
    const [pendingId, setPendingId] = useState<string | null>(null)
    const [confirm, ConfirmUI] = useConfirm()
    const [passwordTarget, setPasswordTarget] = useState<UserAdminItem | null>(null)
    const [profileTarget, setProfileTarget] = useState<UserAdminItem | null>(null)
    const [inviteOpen, setInviteOpen] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Debounce search input (300 ms).
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => setDebouncedSearch(search.trim()), 300)
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [search])

    // Reset to page 1 when search changes.
    useEffect(() => {
        setPage(1)
    }, [debouncedSearch])

    const loadUsers = useCallback(async () => {
        setLoading(true)
        try {
            const result = await listAllUsers({
                search: debouncedSearch || undefined,
                page,
                limit: PAGE_SIZE,
            })
            setItems(result.items)
            setTotal(result.total)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Nieznany błąd'
            toast.error(msg)
        } finally {
            setLoading(false)
        }
    }, [debouncedSearch, page])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const ok = await checkUserAdminAccess()
            if (cancelled) return
            setAllowed(ok)
            if (ok) {
                await loadUsers()
            } else {
                setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [loadUsers])

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

    async function handleSendReset(user: UserAdminItem) {
        const ok = await confirm({
            title: 'Wyślij link reset hasła',
            description: `Wysłać email z linkiem do resetu hasła na ${user.email}?`,
            confirmLabel: 'Wyślij',
        })
        if (!ok) return
        setPendingId(user.id)
        try {
            await sendPasswordResetLink(user.id)
            toastSuccess(`Wysłano link do ${user.email}`)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Nieznany błąd'
            toast.error(msg)
        } finally {
            setPendingId(null)
        }
    }

    async function handleSignOut(user: UserAdminItem) {
        const ok = await confirm({
            title: 'Wyloguj wszystkie sesje',
            description: `Zakończyć wszystkie aktywne sesje użytkownika ${user.email}? User będzie musiał ponownie się zalogować.`,
            confirmLabel: 'Wyloguj',
            variant: 'destructive',
        })
        if (!ok) return
        setPendingId(user.id)
        try {
            await signOutAllSessions(user.id)
            toastSuccess(`Sesje ${user.email} zakończone`)
            loadUsers()
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Nieznany błąd'
            toast.error(msg)
        } finally {
            setPendingId(null)
        }
    }

    async function handleChangeRole(user: UserAdminItem, newRole: DbRole) {
        if (user.role === newRole) return
        const ok = await confirm({
            title: 'Zmiana roli',
            description: `Zmienić rolę ${user.email} z "${roleLabelPl(user.role)}" na "${roleLabelPl(newRole)}"? Użytkownik dostanie email z powiadomieniem.`,
            confirmLabel: 'Zmień rolę',
        })
        if (!ok) return
        setPendingId(user.id)
        try {
            await setUserRole(user.id, newRole)
            toastSuccess(`Rola ${user.email} zmieniona na ${roleLabelPl(newRole)}`)
            await loadUsers()
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Nieznany błąd'
            toast.error(msg)
        } finally {
            setPendingId(null)
        }
    }

    async function handleToggleBan(user: UserAdminItem) {
        const willBan = !user.is_banned
        const ok = await confirm({
            title: willBan ? 'Zablokuj użytkownika' : 'Odblokuj użytkownika',
            description: willBan
                ? `Zablokować ${user.email}? Nie będzie mógł się zalogować, dopóki nie odblokujesz.`
                : `Odblokować ${user.email}? Będzie mógł znów się logować.`,
            confirmLabel: willBan ? 'Zablokuj' : 'Odblokuj',
            variant: willBan ? 'destructive' : 'default',
        })
        if (!ok) return
        setPendingId(user.id)
        try {
            await setUserBan(user.id, willBan)
            toastSuccess(willBan ? `Zablokowano ${user.email}` : `Odblokowano ${user.email}`)
            loadUsers()
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Nieznany błąd'
            toast.error(msg)
        } finally {
            setPendingId(null)
        }
    }

    function getInitials(name: string | null, email: string) {
        if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
        return email.slice(0, 2).toUpperCase()
    }

    if (allowed === null || (loading && items.length === 0 && allowed)) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!allowed) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center p-6">
                <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
                <h1 className="text-2xl font-bold">Brak Dostępu</h1>
                <p className="text-muted-foreground mt-2">
                    Ten moduł jest dostępny wyłącznie dla Super Administratorów.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex flex-col gap-2">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        Zarządzanie użytkownikami
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Lista wszystkich kont w systemie. Możesz wysłać link resetu hasła, ustawić nowe hasło,
                        wylogować sesje oraz zablokować dostęp.
                    </p>
                </div>
                <Button onClick={() => setInviteOpen(true)} className="shrink-0">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Zaproś użytkownika
                </Button>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-200">
                <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                    Reset linki idą przez wbudowany SMTP Supabase (limit ≈2 emaile/godz.). Jeśli user pilnie
                    potrzebuje dostępu — użyj <strong>&bdquo;Ustaw hasło teraz&rdquo;</strong> i przekaż mu hasło
                    bezpiecznym kanałem.
                </span>
            </div>

            <Card>
                <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3 justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-slate-200" />
                            Użytkownicy ({total})
                        </CardTitle>
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Szukaj po email lub imieniu…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                    <CardDescription>
                        Akcje są wyłączone dla Super Adminów (siebie oraz innych) — to zabezpieczenie przed
                        przypadkowym zablokowaniem dostępu.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Osoba</TableHead>
                                <TableHead>Rola</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Ostatnie logowanie</TableHead>
                                <TableHead className="text-right">Akcje</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                        {loading ? 'Ładowanie…' : debouncedSearch ? 'Brak wyników dla wyszukiwania.' : 'Brak użytkowników.'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                items.map((user) => {
                                    const locked = user.is_super_admin
                                    const busy = pendingId === user.id
                                    return (
                                        <TableRow key={user.id} className={user.is_banned ? 'opacity-60' : undefined}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={user.avatar_url || undefined} />
                                                        <AvatarFallback className="text-xs">
                                                            {getInitials(user.full_name, user.email)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="font-medium text-sm flex items-center gap-1.5">
                                                            {user.full_name || user.email.split('@')[0]}
                                                            {user.is_super_admin && (
                                                                <Crown className="h-3.5 w-3.5 text-yellow-400" aria-label="Super Admin" />
                                                            )}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {locked ? (
                                                    <Badge variant="outline" className="text-xs">
                                                        {roleLabelPl(user.role)}
                                                    </Badge>
                                                ) : (
                                                    <select
                                                        aria-label={`Rola ${user.email}`}
                                                        disabled={busy}
                                                        value={(DB_ROLES as readonly string[]).includes(user.role ?? '') ? user.role! : 'consultant'}
                                                        onChange={(e) => handleChangeRole(user, e.target.value as DbRole)}
                                                        className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                                                    >
                                                        {DB_ROLES.map((r) => (
                                                            <option key={r} value={r}>
                                                                {roleLabelPl(r)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {user.is_banned ? (
                                                    <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                                                        Zablokowany
                                                    </Badge>
                                                ) : user.has_logged_in ? (
                                                    <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                                                        Aktywny
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                                                        Nie logował się
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {user.last_sign_in_at
                                                    ? new Date(user.last_sign_in_at).toLocaleString('pl-PL', {
                                                          dateStyle: 'short',
                                                          timeStyle: 'short',
                                                      })
                                                    : 'Nigdy'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" disabled={locked || busy} aria-label="Akcje">
                                                            {busy ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <MoreVertical className="h-4 w-4" />
                                                            )}
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56">
                                                        <DropdownMenuItem onClick={() => handleSendReset(user)}>
                                                            <Mail className="mr-2 h-4 w-4" /> Wyślij link reset
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setPasswordTarget(user)}>
                                                            <KeyRound className="mr-2 h-4 w-4" /> Ustaw hasło teraz
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setProfileTarget(user)}>
                                                            <UserCog className="mr-2 h-4 w-4" /> Edytuj profil HR
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => handleSignOut(user)}>
                                                            <LogOut className="mr-2 h-4 w-4" /> Wyloguj sesje
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => handleToggleBan(user)}
                                                            className={user.is_banned ? '' : 'text-destructive focus:text-destructive'}
                                                        >
                                                            {user.is_banned ? (
                                                                <>
                                                                    <Lock className="mr-2 h-4 w-4" /> Odblokuj
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Ban className="mr-2 h-4 w-4" /> Zablokuj
                                                                </>
                                                            )}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>

                    {totalPages > 1 && !debouncedSearch && (
                        <div className="flex items-center justify-between mt-4 text-sm">
                            <span className="text-muted-foreground">
                                Strona {page} z {totalPages}
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1 || loading}
                                >
                                    Poprzednia
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages || loading}
                                >
                                    Następna
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <ConfirmUI />
            {passwordTarget && (
                <SetPasswordDialog
                    open={!!passwordTarget}
                    onOpenChange={(o) => { if (!o) setPasswordTarget(null) }}
                    targetUserId={passwordTarget.id}
                    targetEmail={passwordTarget.email}
                    onSuccess={loadUsers}
                />
            )}
            {profileTarget && (
                <EmployeeProfileDialog
                    open={!!profileTarget}
                    onOpenChange={(o) => { if (!o) setProfileTarget(null) }}
                    targetUserId={profileTarget.id}
                    targetEmail={profileTarget.email}
                    onSuccess={loadUsers}
                />
            )}
            <InviteUserDialog
                open={inviteOpen}
                onOpenChange={setInviteOpen}
                onSuccess={loadUsers}
            />
        </div>
    )
}

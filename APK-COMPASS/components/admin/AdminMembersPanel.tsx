'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Trash2, Plus, Loader2, ShieldAlert, Crown, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import {
    getAdminMembers,
    addAdminMember,
    removeAdminMember,
    checkIsSuperAdmin,
    listSuperAdmins,
    type AdminMember,
} from '@/lib/actions/admin-management'

export function AdminMembersPanel() {
    const [isSuperAdmin, setIsSuperAdmin] = useState(false)
    const [loading, setLoading] = useState(true)
    const [members, setMembers] = useState<AdminMember[]>([])
    const [superAdminEmails, setSuperAdminEmails] = useState<readonly string[]>([])
    const [email, setEmail] = useState('')
    const [fullName, setFullName] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [confirm, ConfirmUI] = useConfirm()

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            const superAdminCheck = await checkIsSuperAdmin()
            setIsSuperAdmin(superAdminCheck)
            if (superAdminCheck) {
                const [data, superAdmins] = await Promise.all([
                    getAdminMembers(),
                    listSuperAdmins(),
                ])
                setMembers(data)
                setSuperAdminEmails(superAdmins)
            }
        } catch (err) {
            console.error('Error loading admin panel:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim()) return

        setSubmitting(true)
        try {
            await addAdminMember(email, fullName || undefined)
            toastSuccess(`Dodano ${email} jako Administratora`)
            setEmail('')
            setFullName('')
            loadData()
        } catch (err: any) {
            toast.error(err.message || 'Błąd dodawania')
        } finally {
            setSubmitting(false)
        }
    }

    const handleRemove = async (member: AdminMember) => {
        const ok = await confirm({
            title: 'Usuń Administratora',
            description: `Czy na pewno usunąć ${member.email} z listy Administratorów? Osoba straci uprawnienia po ponownym zalogowaniu.`,
            confirmLabel: 'Usuń',
            variant: 'destructive',
        })
        if (!ok) return

        try {
            await removeAdminMember(member.id)
            toastSuccess(`Usunięto ${member.email}`)
            loadData()
        } catch (err: any) {
            toast.error(err.message || 'Błąd usuwania')
        }
    }

    const getInitials = (name: string | null, email: string) => {
        if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        return email.slice(0, 2).toUpperCase()
    }

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!isSuperAdmin) {
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
            <div className="flex flex-col gap-2">
                <h3 className="text-lg font-medium flex items-center gap-2">
                    <Crown className="h-5 w-5 text-yellow-500" />
                    Zarządzanie Administratorami
                </h3>
                <p className="text-sm text-muted-foreground">
                    Jako Super Admin możesz wyznaczać Administratorów systemu.
                    Administratorzy mają pełny dostęp do aplikacji, ale nie mogą zarządzać innymi Administratorami.
                </p>
            </div>

            {/* Super Admins info */}
            <Card className="border-yellow-500/20 bg-yellow-500/5">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Crown className="h-4 w-4 text-yellow-500" />
                        Super Administratorzy (hardcoded)
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Konta z najwyższymi uprawnieniami. Nie można ich usunąć ani zmienić przez interfejs.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {superAdminEmails.map(email => (
                            <Badge key={email} variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                                <Crown className="h-3 w-3 mr-1" />
                                {email}
                            </Badge>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Add admin form */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Dodaj Administratora</CardTitle>
                    <CardDescription>Adres musi być w domenie @b2bnetwork.pl</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
                        <div className="grid gap-1.5 flex-1 min-w-[200px]">
                            <Label htmlFor="admin-email">Email</Label>
                            <Input
                                id="admin-email"
                                type="email"
                                placeholder="jan.kowalski@b2bnetwork.pl"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="grid gap-1.5 min-w-[150px]">
                            <Label htmlFor="admin-name">Imię i nazwisko</Label>
                            <Input
                                id="admin-name"
                                placeholder="Jan Kowalski"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                            />
                        </div>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                            Dodaj
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Admins table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Shield className="h-4 w-4 text-slate-200" />
                        Administratorzy ({members.length})
                    </CardTitle>
                    <CardDescription>
                        Osoby wyznaczone jako Administratorzy — mają pełny dostęp do systemu.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Osoba</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Data dodania</TableHead>
                                <TableHead className="text-right">Akcje</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {members.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                        Brak wyznaczonych Administratorów. Dodaj pierwszego powyżej.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                members.map(member => (
                                    <TableRow key={member.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={member.avatar_url || undefined} />
                                                    <AvatarFallback className="text-xs">
                                                        {getInitials(member.full_name, member.email)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="font-medium text-sm">{member.full_name || member.email.split('@')[0]}</p>
                                                    <p className="text-xs text-muted-foreground">{member.email}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={member.has_logged_in
                                                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                                                : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                                            }>
                                                {member.has_logged_in ? 'Aktywny' : 'Nie logował się'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {new Date(member.created_at).toLocaleDateString('pl-PL')}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                onClick={() => handleRemove(member)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Explanation */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-white/5 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                    <strong>Super Admin</strong> (hardcoded) = pełny dostęp + zarządzanie Administratorami. &nbsp;
                    <strong>Administrator</strong> (z listy powyżej) = pełny dostęp do systemu, ale bez możliwości zarządzania innymi Administratorami.
                    Obie role widzą identyczne menu i dane — różnią się tylko uprawnieniami w tym panelu.
                </span>
            </div>

            <ConfirmUI />
        </div>
    )
}

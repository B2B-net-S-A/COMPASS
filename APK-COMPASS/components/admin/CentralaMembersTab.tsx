'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Trash2, Plus, Loader2, Pencil, Users, Briefcase, Calculator, ShieldCheck, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import {
    addCentralaMember,
    updateCentralaMember,
    removeCentralaMember,
    type CentralaMember,
} from '@/lib/actions/centrala-management'

interface CentralaMembersTabProps {
    members: CentralaMember[]
    onRefresh: () => void
}

const ROLE_CONFIG = {
    recruiter: { label: 'Rekruter', icon: Users, color: 'bg-primary/20 text-slate-200 border-primary/30' },
    delivery_lead: { label: 'Delivery Lead', icon: Briefcase, color: 'bg-burgundy/20 text-primary border-burgundy/30' },
    finance: { label: 'Finanse', icon: Calculator, color: 'bg-green-500/20 text-green-400 border-green-500/30' },
}

export function CentralaMembersTab({ members, onRefresh }: CentralaMembersTabProps) {
    const [email, setEmail] = useState('')
    const [fullName, setFullName] = useState('')
    const [role, setRole] = useState<'recruiter' | 'delivery_lead' | 'finance'>('recruiter')
    const [submitting, setSubmitting] = useState(false)
    const [confirm, ConfirmUI] = useConfirm()

    // Edit dialog
    const [editMember, setEditMember] = useState<CentralaMember | null>(null)
    const [editRole, setEditRole] = useState<'recruiter' | 'delivery_lead' | 'finance'>('recruiter')
    const [editName, setEditName] = useState('')
    const [saving, setSaving] = useState(false)

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim()) return

        setSubmitting(true)
        try {
            await addCentralaMember(email, role, fullName || undefined)
            toastSuccess(`Dodano ${email} jako ${ROLE_CONFIG[role].label}`)
            setEmail('')
            setFullName('')
            setRole('recruiter')
            onRefresh()
        } catch (err: any) {
            toast.error(err.message || 'Błąd dodawania')
        } finally {
            setSubmitting(false)
        }
    }

    const handleRemove = async (member: CentralaMember) => {
        const ok = await confirm({
            title: 'Usuń członka Centrali',
            description: `Czy na pewno usunąć ${member.email}? Użytkownik straci uprawnienia Centrali po ponownym logowaniu.`,
            confirmLabel: 'Usuń',
            variant: 'destructive',
        })
        if (!ok) return

        try {
            await removeCentralaMember(member.id)
            toastSuccess(`Usunięto ${member.email}`)
            onRefresh()
        } catch (err: any) {
            toast.error(err.message || 'Błąd usuwania')
        }
    }

    const openEdit = (member: CentralaMember) => {
        setEditMember(member)
        setEditRole(member.centrala_role)
        setEditName(member.full_name || '')
    }

    const handleSaveEdit = async () => {
        if (!editMember) return
        setSaving(true)
        try {
            await updateCentralaMember(editMember.id, {
                centrala_role: editRole,
                full_name: editName || undefined,
            })
            toastSuccess('Zaktualizowano')
            setEditMember(null)
            onRefresh()
        } catch (err: any) {
            toast.error(err.message || 'Błąd aktualizacji')
        } finally {
            setSaving(false)
        }
    }

    const getInitials = (name: string | null, email: string) => {
        if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        return email.slice(0, 2).toUpperCase()
    }

    // Summary counts
    const recruiterCount = members.filter(m => m.centrala_role === 'recruiter').length
    const dlCount = members.filter(m => m.centrala_role === 'delivery_lead').length
    const finCount = members.filter(m => m.centrala_role === 'finance').length

    return (
        <div className="space-y-6">
            {/* Info banner — link to Uprawnienia Ról */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">
                    Zakres dostępu (co dana rola może robić) definiujesz w{' '}
                    <Link href="/admin/settings/permissions" className="text-primary font-medium hover:underline inline-flex items-center gap-1">
                        Uprawnieniach Ról <ArrowRight className="h-3 w-3" />
                    </Link>
                </span>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="text-2xl font-bold text-slate-200">{recruiterCount}</div>
                    <div className="text-xs text-muted-foreground">Rekruterów</div>
                </div>
                <div className="p-3 rounded-lg bg-burgundy/10 border border-burgundy/20">
                    <div className="text-2xl font-bold text-primary">{dlCount}</div>
                    <div className="text-xs text-muted-foreground">Delivery Lead</div>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="text-2xl font-bold text-green-400">{finCount}</div>
                    <div className="text-xs text-muted-foreground">Finanse</div>
                </div>
            </div>

            {/* Add form */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Dodaj Członka Centrali</CardTitle>
                    <CardDescription>Adres musi być w domenie @b2bnetwork.pl</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
                        <div className="grid gap-1.5 flex-1 min-w-[200px]">
                            <Label htmlFor="member-email">Email</Label>
                            <Input
                                id="member-email"
                                type="email"
                                placeholder="jan.kowalski@b2bnetwork.pl"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="grid gap-1.5 min-w-[150px]">
                            <Label htmlFor="member-name">Imię i nazwisko</Label>
                            <Input
                                id="member-name"
                                placeholder="Jan Kowalski"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-1.5 w-[160px]">
                            <Label>Rola</Label>
                            <Select value={role} onValueChange={(v) => setRole(v as any)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="recruiter">Rekruter</SelectItem>
                                    <SelectItem value="delivery_lead">Delivery Lead</SelectItem>
                                    <SelectItem value="finance">Finanse</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                            Dodaj
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Members table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Członkowie Centrali ({members.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Osoba</TableHead>
                                <TableHead>Rola</TableHead>
                                <TableHead className="text-center">Przypisani</TableHead>
                                <TableHead className="text-right">Akcje</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {members.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                        Brak członków Centrali. Dodaj pierwszego powyżej.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                members.map(member => {
                                    const roleConf = ROLE_CONFIG[member.centrala_role] || ROLE_CONFIG.recruiter
                                    return (
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
                                                <Badge variant="outline" className={roleConf.color}>
                                                    {roleConf.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className="text-sm font-medium">{member.assignment_count}</span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openEdit(member)}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                        onClick={() => handleRemove(member)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={!!editMember} onOpenChange={(open) => !open && setEditMember(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edytuj członka Centrali</DialogTitle>
                        <DialogDescription>{editMember?.email}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Imię i nazwisko</Label>
                            <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Jan Kowalski"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Rola w Centrali</Label>
                            <Select value={editRole} onValueChange={(v) => setEditRole(v as any)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="recruiter">Rekruter</SelectItem>
                                    <SelectItem value="delivery_lead">Delivery Lead</SelectItem>
                                    <SelectItem value="finance">Finanse</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-white/5 text-xs text-muted-foreground">
                            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                            <span>
                                Zakres uprawnień dla tej roli (dostęp do modułów, tryb portfela/pełny) konfiguruj w{' '}
                                <Link href="/admin/settings/permissions" className="text-primary hover:underline">
                                    Uprawnieniach Ról
                                </Link>.
                            </span>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditMember(null)}>Anuluj</Button>
                        <Button onClick={handleSaveEdit} disabled={saving}>
                            {saving ? 'Zapisywanie...' : 'Zapisz'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmUI />
        </div>
    )
}

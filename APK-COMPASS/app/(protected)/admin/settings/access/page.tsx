'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Trash2, ShieldAlert, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'

export default function AccessManagementPage() {
    const [email, setEmail] = useState('')
    const [accessList, setAccessList] = useState<{ id: string, email: string, created_at: string }[]>([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [confirm, ConfirmUI] = useConfirm()

    const supabase = createClient()

    useEffect(() => {
        checkAdminAndFetchList()
    }, [])

    async function checkAdminAndFetchList() {
        // 1. Check if user is administrator
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (profile?.role === 'administrator' || profile?.role === 'admin') {
            setIsAdmin(true)
            fetchList()
        } else {
            setLoading(false)
        }
    }

    async function fetchList() {
        setLoading(true)
        const { data, error } = await supabase
            .from('centrala_access_list')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            toast.error('Błąd pobierania listy: ' + error.message)
        } else {
            setAccessList(data || [])
        }
        setLoading(false)
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault()
        if (!email.trim().endsWith('@b2bnetwork.pl')) {
            toast.error('Tylko adresy @b2bnetwork.pl są dozwolone.')
            return
        }

        setSubmitting(true)
        const { error } = await supabase.from('centrala_access_list').insert({
            email: email.trim(),
            // added_by is handled by RLS/Trigger or default? 
            // In migration: added_by UUID REFERENCES auth.users(id)
            // But client insert doesn't auto-set auth.uid() usually unless we use default or trigger.
            // Let's rely on RLS allowing it, and maybe set it if needed, but client lib usually sends auth header.
            // A trigger `before insert set added_by = auth.uid()` is best.
            // For now, let's try inserting. If `added_by` is not null constraint, it might fail.
            // Migration: added_by UUID REFERENCES auth.users(id) (Nullable by default)
        })

        if (error) {
            toast.error('Błąd dodawania: ' + error.message)
        } else {
            toastSuccess('Dodano do listy Centrali')
            setEmail('')
            fetchList()
        }
        setSubmitting(false)
    }

    async function handleRemove(id: string) {
        const ok = await confirm({
            title: 'Usuń dostęp',
            description: 'Czy na pewno usunąć ten adres? Użytkownik straci uprawnienia po ponownym logowaniu.',
            confirmLabel: 'Usuń',
            variant: 'destructive',
        })
        if (!ok) return

        const { error } = await supabase.from('centrala_access_list').delete().eq('id', id)
        if (error) {
            toast.error('Błąd usuwania: ' + error.message)
        } else {
            toastSuccess('Usunięto z listy')
            fetchList()
        }
    }

    if (!isAdmin && !loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center p-6">
                <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
                <h1 className="text-2xl font-bold">Brak Dostępu</h1>
                <p className="text-muted-foreground mt-2">
                    Ten moduł jest dostępny tylko dla Administratorów Systemu.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h3 className="text-lg font-medium">Zarządzanie Dostępem</h3>
                <p className="text-sm text-muted-foreground">
                    Zarządzaj listą pracowników Centrali. Osoby na tej liście otrzymają rolę "Centrala" po zalogowaniu.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Dodaj Pracownika Centrali</CardTitle>
                    <CardDescription>
                        Użytkownik musi posiadać adres w domenie @b2bnetwork.pl
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAdd} className="flex gap-4 items-end">
                        <div className="grid w-full items-center gap-1.5">
                            <Label htmlFor="email">Adres Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="jan.kowalski@b2bnetwork.pl"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                            Dodaj
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Lista Dostępowa (Centrala)</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Data dodania</TableHead>
                                    <TableHead className="text-right">Akcje</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {accessList.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                            Brak wpisów.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    accessList.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.email}</TableCell>
                                            <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                    onClick={() => handleRemove(item.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <ConfirmUI />
        </div>
    )
}

'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Search, Plus, Minus, User as UserIcon, Award, History } from "lucide-react"
import { searchUsers, addLoyaltyPoints } from '@/lib/actions/loyalty'
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

interface UserResult {
    id: string
    full_name: string | null
    email: string | null
    role: string
    loyalty_points: number
    loyalty_tier: string
}

export function LoyaltyManager() {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<UserResult[]>([])
    const [selectedUser, setSelectedUser] = useState<UserResult | null>(null)
    const [loading, setLoading] = useState(false)

    // Transaction form state
    const [pointsAmount, setPointsAmount] = useState<number>(0)
    const [description, setDescription] = useState('')
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [transactionType, setTransactionType] = useState<'add' | 'subtract'>('add')

    const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setQuery(val)
        if (val.length >= 2) {
            const data = await searchUsers(val)
            setResults(data)
        } else {
            setResults([])
        }
    }

    const selectUser = (user: UserResult) => {
        setSelectedUser(user)
        setResults([])
        setQuery('')
    }

    const handleTransaction = async () => {
        if (!selectedUser) return

        setLoading(true)
        try {
            const points = transactionType === 'add' ? Math.abs(pointsAmount) : -Math.abs(pointsAmount)
            const result = await addLoyaltyPoints(
                selectedUser.id,
                points,
                'manual_admin',
                description || 'Korekta administracyjna'
            )

            if (result.success) {
                // Update local state loosely (points will be refreshed on re-search or page reload)
                // Ideally reload the user data
                setSelectedUser(prev => prev ? { ...prev, loyalty_points: prev.loyalty_points + points } : null)

                setIsDialogOpen(false)
                setPointsAmount(0)
                setDescription('')
                alert('Punkty zostały zaktualizowane.')
            } else {
                alert('Błąd: ' + result.error)
            }
        } catch (error) {
            console.error(error)
            alert('Wystąpił błąd.')
        } finally {
            setLoading(false)
        }
    }

    const openDialog = (type: 'add' | 'subtract') => {
        setTransactionType(type)
        setPointsAmount(0)
        setDescription('')
        setIsDialogOpen(true)
    }

    return (
        <div className="grid gap-6 md:grid-cols-2">
            <Card className="col-span-2 md:col-span-1 h-fit">
                <CardHeader>
                    <CardTitle>Wyszukaj Użytkownika</CardTitle>
                    <CardDescription>Znajdź użytkownika, aby zarządzać jego punktami.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Szukaj po nazwisku lub email..."
                            className="pl-8"
                            value={query}
                            onChange={handleSearch}
                        />
                    </div>

                    {results.length > 0 && (
                        <div className="border rounded-md divide-y max-h-[300px] overflow-auto">
                            {results.map(user => (
                                <div
                                    key={user.id}
                                    className="p-3 hover:bg-accent cursor-pointer flex items-center justify-between"
                                    onClick={() => selectUser(user)}
                                >
                                    <div>
                                        <p className="font-medium">{user.full_name || 'Użytkownik bez nazwy'}</p>
                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                    </div>
                                    <Badge variant="outline">{user.loyalty_points} pkt</Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {selectedUser ? (
                <Card className="col-span-2 md:col-span-1">
                    <CardHeader>
                        <CardTitle>Wybrany Użytkownik</CardTitle>
                        <CardDescription>Zarządzaj saldem punktowym.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center gap-4 p-4 border rounded-lg bg-secondary/10">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <UserIcon className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">{selectedUser.full_name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="secondary">{selectedUser.role}</Badge>
                                    <Badge className="bg-amber-500 hover:bg-amber-600">{selectedUser.loyalty_tier}</Badge>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex items-center gap-3">
                                <Award className="h-5 w-5 text-amber-500" />
                                <span className="font-medium">Aktualne Saldo</span>
                            </div>
                            <span className="text-2xl font-bold">{selectedUser.loyalty_points} pkt</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Button
                                className="w-full bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => openDialog('add')}
                            >
                                <Plus className="mr-2 h-4 w-4" /> Przyznaj Punkty
                            </Button>
                            <Button
                                className="w-full"
                                variant="destructive"
                                onClick={() => openDialog('subtract')}
                            >
                                <Minus className="mr-2 h-4 w-4" /> Odejmij Punkty
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card className="col-span-2 md:col-span-1 flex items-center justify-center min-h-[300px] border-dashed">
                    <div className="text-center text-muted-foreground">
                        <Search className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p>Wyszukaj i wybierz użytkownika, aby zobaczyć szczegóły</p>
                    </div>
                </Card>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {transactionType === 'add' ? 'Przyznawanie Punktów' : 'Odejmowanie Punktów'}
                        </DialogTitle>
                        <DialogDescription>
                            {transactionType === 'add'
                                ? `Dodaj punkty dla użytkownika ${selectedUser?.full_name}.`
                                : `Zredukuj saldo punktowe użytkownika ${selectedUser?.full_name}.`
                            }
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Ilość punktów</Label>
                            <Input
                                type="number"
                                min="1"
                                value={pointsAmount}
                                onChange={(e) => setPointsAmount(parseInt(e.target.value) || 0)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Powód / Opis</Label>
                            <Textarea
                                placeholder="Np. Bonus za projekt, Korekta błędnego naliczenia..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Anuluj</Button>
                        <Button
                            onClick={handleTransaction}
                            disabled={loading || pointsAmount <= 0}
                            variant={transactionType === 'add' ? 'default' : 'destructive'}
                        >
                            {loading ? 'Przetwarzanie...' : 'Zatwierdź'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

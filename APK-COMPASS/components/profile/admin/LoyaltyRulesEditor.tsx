'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Save, Undo, AlertTriangle } from "lucide-react"
import { getLoyaltyRules, updateLoyaltyRule, LoyaltyRule } from '@/lib/actions/loyalty'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export function LoyaltyRulesEditor() {
    const [rules, setRules] = useState<LoyaltyRule[]>([])
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editValues, setEditValues] = useState<Partial<LoyaltyRule>>({})
    const [saving, setSaving] = useState(false)
    const [isMockData, setIsMockData] = useState(false)

    useEffect(() => {
        fetchRules()
    }, [])

    const fetchRules = async () => {
        setLoading(true)
        try {
            const data = await getLoyaltyRules()
            setRules(data)
            if (data.length > 0 && data[0].id.startsWith('mock-')) {
                setIsMockData(true)
            }
        } catch (error) {
            console.error(error)
            toast.error('Błąd pobierania konfiguracji')
        } finally {
            setLoading(false)
        }
    }

    const startEdit = (rule: LoyaltyRule) => {
        setEditingId(rule.id)
        setEditValues({ points: rule.points, is_active: rule.is_active })
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditValues({})
    }

    const saveEdit = async (id: string) => {
        setSaving(true)
        try {
            const result = await updateLoyaltyRule(id, editValues)
            if (result.success) {
                toastSuccess('Zaktualizowano regułę')
                setRules(prev => prev.map(r => r.id === id ? { ...r, ...editValues } : r))
                setEditingId(null)
            } else {
                if (result.warning) {
                    toast.warning(result.warning)
                } else {
                    toast.error('Błąd zapisu: ' + result.error)
                }
            }
        } catch (error) {
            toast.error('Wystąpił błąd podczas zapisu')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <span>Tabela Punktacji</span>
                    {isMockData && (
                        <Badge variant="destructive" className="flex gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Tryb tylko do odczytu (Brak tabeli w DB)
                        </Badge>
                    )}
                </CardTitle>
                <CardDescription>
                    Definiuj ile punktów przyznawanych jest za poszczególne aktywności.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isMockData && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg text-sm text-yellow-500 mb-6">
                        <strong>Uwaga:</strong> Tabela `loyalty_rules` nie została znaleziona w bazie danych.
                        Wyświetlamy wartości domyślne. Aby edytować, poproś administratora o uruchomienie migracji SQL.
                    </div>
                )}

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Kategoria</TableHead>
                            <TableHead>Nazwa Reguły</TableHead>
                            <TableHead>Opis</TableHead>
                            <TableHead className="text-right">Punkty</TableHead>
                            <TableHead className="text-center">Aktywna</TableHead>
                            <TableHead className="text-right">Akcje</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rules.map((rule) => {
                            const isEditing = editingId === rule.id

                            return (
                                <TableRow key={rule.id} className={!rule.is_active ? 'opacity-60 bg-muted/50' : ''}>
                                    <TableCell className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                                        {rule.category}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {rule.name}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {rule.description}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {isEditing ? (
                                            <Input
                                                type="number"
                                                value={editValues.points}
                                                onChange={e => setEditValues(prev => ({ ...prev, points: parseInt(e.target.value) || 0 }))}
                                                className="w-24 text-right ml-auto h-8"
                                            />
                                        ) : (
                                            <Badge variant="secondary" className="font-mono text-base">
                                                {rule.points}
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {isEditing ? (
                                            <div className="flex justify-center">
                                                <Checkbox
                                                    checked={editValues.is_active}
                                                    onCheckedChange={(val: boolean) => setEditValues(prev => ({ ...prev, is_active: val }))}
                                                />
                                            </div>
                                        ) : (
                                            <div className={`w-2 h-2 rounded-full mx-auto ${rule.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {isEditing ? (
                                            <div className="flex justify-end gap-1">
                                                <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                                                    <Undo className="h-4 w-4" />
                                                </Button>
                                                <Button size="sm" onClick={() => saveEdit(rule.id)} disabled={saving}>
                                                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button size="sm" variant="ghost" onClick={() => startEdit(rule)}>
                                                Edytuj
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}

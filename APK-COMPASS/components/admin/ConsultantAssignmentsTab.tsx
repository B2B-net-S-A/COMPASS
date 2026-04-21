'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, X, AlertTriangle, Users } from 'lucide-react'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { ConsultantSearchSelect } from './ConsultantSearchSelect'
import {
    getConsultantAssignments,
    getAllConsultants,
    assignConsultant,
    bulkAssignConsultants,
    unassignConsultant,
    getUnassignedConsultants,
    ensureCentralaMemberProfile,
    type CentralaMember,
    type ConsultantAssignment,
    type ConsultantForAssignment,
    type BulkAssignResult,
} from '@/lib/actions/centrala-management'

interface ConsultantAssignmentsTabProps {
    members: CentralaMember[]
}

export function ConsultantAssignmentsTab({ members }: ConsultantAssignmentsTabProps) {
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
    const [assignments, setAssignments] = useState<ConsultantAssignment[]>([])
    const [allConsultants, setAllConsultants] = useState<ConsultantForAssignment[]>([])
    const [unassignedCount, setUnassignedCount] = useState(0)
    const [loading, setLoading] = useState(false)
    const [loadingConsultants, setLoadingConsultants] = useState(true)

    // Load all consultants on mount
    useEffect(() => {
        loadConsultants()
    }, [])

    // Load assignments when member changes
    useEffect(() => {
        if (selectedMemberId) {
            loadAssignments(selectedMemberId)
        } else {
            setAssignments([])
        }
    }, [selectedMemberId])

    async function loadConsultants() {
        setLoadingConsultants(true)
        try {
            const [consultants, unassigned] = await Promise.all([
                getAllConsultants(),
                getUnassignedConsultants(),
            ])
            setAllConsultants(consultants)
            setUnassignedCount(unassigned.length)
        } catch (err) {
            console.error('Error loading consultants:', err)
        } finally {
            setLoadingConsultants(false)
        }
    }

    // profileIdOverride allows loading assignments with a freshly-created profile_id
    // that is not yet reflected in the members prop
    async function loadAssignments(memberId: string, profileIdOverride?: string) {
        setLoading(true)
        try {
            const member = members.find(m => m.id === memberId)
            const pid = profileIdOverride || member?.profile_id
            if (!pid) {
                setAssignments([])
                setLoading(false)
                return
            }
            const data = await getConsultantAssignments(pid)
            setAssignments(data)
        } catch (err) {
            console.error('Error loading assignments:', err)
            toast.error('Błąd ładowania przypisań')
        } finally {
            setLoading(false)
        }
    }

    const handleAssign = async (selectedConsultantIds: string[]) => {
        const member = members.find(m => m.id === selectedMemberId)
        if (!member) {
            toast.error('Nie znaleziono wybranego członka Centrali.')
            return
        }

        // If member has no profile_id, resolve it
        let resolvedProfileId = member.profile_id
        if (!resolvedProfileId) {
            const profileResult = await ensureCentralaMemberProfile(member.email, member.full_name)
            if (profileResult.error || !profileResult.profileId) {
                toast.error(profileResult.error || 'Nie udało się znaleźć profilu dla członka Centrali.')
                return
            }
            resolvedProfileId = profileResult.profileId
        }

        // Determine assignment type from member's centrala_role
        const type = member.centrala_role === 'delivery_lead' ? 'delivery_lead' : 'recruiter'

        try {
            if (selectedConsultantIds.length === 1) {
                const result = await assignConsultant(selectedConsultantIds[0], resolvedProfileId, type)
                if (result.error) {
                    // Parse ALREADY_ASSIGNED error
                    if (result.error.startsWith('ALREADY_ASSIGNED:')) {
                        const parts = result.error.split(':')
                        const recruiterName = parts[1] || 'nieznany'
                        toast.error(
                            `Konsultant jest już przypisany do rekrutera ${recruiterName}. Najpierw rekruter powinien wypisać konsultanta ze swojej listy.`,
                            { duration: 8000 }
                        )
                    } else {
                        toast.error(result.error)
                    }
                    return
                }
                toastSuccess('Przypisano konsultanta')
            } else {
                const result: BulkAssignResult = await bulkAssignConsultants(selectedConsultantIds, resolvedProfileId, type)

                // Show results
                if (result.skippedCount > 0 && result.assignedCount > 0) {
                    toastSuccess(`Przypisano ${result.assignedCount} konsultantów`)
                    // Show skipped with details
                    result.skipped.forEach(s => {
                        toast.warning(
                            `${s.consultantName} — już przypisany do rekrutera ${s.currentRecruiter}. Najpierw rekruter powinien wypisać konsultanta ze swojej listy.`,
                            { duration: 8000 }
                        )
                    })
                } else if (result.skippedCount > 0 && result.assignedCount === 0) {
                    result.skipped.forEach(s => {
                        toast.error(
                            `${s.consultantName} — już przypisany do rekrutera ${s.currentRecruiter}. Najpierw rekruter powinien wypisać konsultanta ze swojej listy.`,
                            { duration: 8000 }
                        )
                    })
                } else {
                    toastSuccess(`Przypisano ${result.assignedCount} konsultantów`)
                }
            }
            // Refresh data
            loadAssignments(selectedMemberId!, resolvedProfileId)
            loadConsultants()
        } catch (err: any) {
            toast.error(err.message || 'Błąd przypisania')
        }
    }

    const handleUnassign = async (assignmentId: string) => {
        try {
            await unassignConsultant(assignmentId)
            toastSuccess('Usunięto przypisanie')
            loadAssignments(selectedMemberId!)
            loadConsultants()
        } catch (err: any) {
            toast.error(err.message || 'Błąd usuwania przypisania')
        }
    }

    const selectedMember = members.find(m => m.id === selectedMemberId)
    const assignedIds = new Set(assignments.map(a => a.consultant_id))

    // Only show recruiter and DL members (finance doesn't need assignments)
    const assignableMembers = members.filter(m => m.centrala_role !== 'finance')

    const getInitials = (name: string | null) => {
        if (!name) return '?'
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }

    const statusLabel = (status: string | null) => {
        switch (status) {
            case 'active': return 'Aktywny'
            case 'bench': return 'Bench'
            case 'available': return 'Dostępny'
            default: return status || 'Brak'
        }
    }

    return (
        <div className="space-y-6">
            {/* Unassigned warning */}
            {unassignedCount > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <span>
                        <strong>{unassignedCount}</strong> konsultantów nie ma przypisanego rekrutera.
                    </span>
                </div>
            )}

            {/* Member selector */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Wybierz Członka Centrali</CardTitle>
                    <CardDescription>
                        Wybierz rekrutera lub Delivery Lead, aby zarządzać jego portfelem konsultantów.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Select
                        value={selectedMemberId || ''}
                        onValueChange={(v) => setSelectedMemberId(v || null)}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Wybierz osobę z Centrali..." />
                        </SelectTrigger>
                        <SelectContent>
                            {assignableMembers.map(m => (
                                <SelectItem key={m.id} value={m.id}>
                                    <div className="flex items-center gap-2">
                                        <span>{m.full_name || m.email.split('@')[0]}</span>
                                        <Badge variant="outline" className="text-[10px]">
                                            {m.centrala_role === 'delivery_lead' ? 'DL' : 'Rekruter'}
                                        </Badge>
                                        <span className="text-muted-foreground text-xs">({m.assignment_count})</span>
                                        {!m.profile_id && (
                                            <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                                                ⚠ brak konta
                                            </Badge>
                                        )}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* Assignments for selected member */}
            {selectedMember && (
                <>
                    {/* Current assignments */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Przypisani konsultanci ({assignments.length})
                            </CardTitle>
                            <CardDescription>
                                {selectedMember.full_name || selectedMember.email}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                </div>
                            ) : assignments.length === 0 ? (
                                <div className="text-center text-muted-foreground py-6 text-sm">
                                    Brak przypisanych konsultantów. Użyj wyszukiwarki poniżej, aby dodać.
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Konsultant</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Typ</TableHead>
                                            <TableHead className="text-right">Akcja</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {assignments.map(a => (
                                            <TableRow key={a.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-7 w-7">
                                                            <AvatarImage src={a.consultant_avatar || undefined} />
                                                            <AvatarFallback className="text-xs">
                                                                {getInitials(a.consultant_name)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <p className="text-sm font-medium">{a.consultant_name || 'Bez nazwy'}</p>
                                                            <p className="text-xs text-muted-foreground">{a.consultant_email}</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-xs">{statusLabel(a.consultant_status)}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-[10px]">
                                                        {a.assignment_type === 'delivery_lead' ? 'DL' : 'Rekruter'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                        onClick={() => handleUnassign(a.id)}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    {/* Add consultants */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Dodaj Konsultantów</CardTitle>
                            <CardDescription>
                                Wyszukaj i zaznacz konsultantów do przypisania.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ConsultantSearchSelect
                                consultants={allConsultants}
                                excludeIds={assignedIds}
                                onAssign={handleAssign}
                                loading={loadingConsultants}
                            />
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}

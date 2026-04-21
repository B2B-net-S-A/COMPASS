'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShieldAlert, Loader2, Users, Link2, BarChart3 } from 'lucide-react'
import { CentralaMembersTab } from '@/components/admin/CentralaMembersTab'
import { ConsultantAssignmentsTab } from '@/components/admin/ConsultantAssignmentsTab'
import { AssignmentOverviewTab } from '@/components/admin/AssignmentOverviewTab'
import { getCentralaMembers, type CentralaMember } from '@/lib/actions/centrala-management'

export default function TeamManagementPage() {
    const [status, setStatus] = useState<'loading' | 'unauthorized' | 'ready'>('loading')
    const [members, setMembers] = useState<CentralaMember[]>([])

    useEffect(() => {
        loadMembers()
    }, [])

    async function loadMembers() {
        try {
            // getCentralaMembers already enforces admin check server-side
            const data = await getCentralaMembers()
            setMembers(data)
            setStatus('ready')
        } catch (err: any) {
            if (err?.message?.includes('Admin access required') || err?.message?.includes('Unauthorized')) {
                setStatus('unauthorized')
            } else {
                // Any other error — still show page but empty
                console.error('Error loading members:', err)
                setStatus('ready')
            }
        }
    }

    if (status === 'loading') {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (status === 'unauthorized') {
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
                <h3 className="text-lg font-medium">Zarządzanie Centralą</h3>
                <p className="text-sm text-muted-foreground">
                    Zarządzaj członkami Centrali, przypisuj konsultantów do rekruterów i Delivery Lead.
                </p>
            </div>

            <Tabs defaultValue="members" className="space-y-6">
                <TabsList className="bg-muted/30">
                    <TabsTrigger value="members" className="gap-2">
                        <Users className="h-4 w-4" />
                        Członkowie
                    </TabsTrigger>
                    <TabsTrigger value="assignments" className="gap-2">
                        <Link2 className="h-4 w-4" />
                        Przypisania
                    </TabsTrigger>
                    <TabsTrigger value="overview" className="gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Przegląd
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="members">
                    <CentralaMembersTab members={members} onRefresh={loadMembers} />
                </TabsContent>

                <TabsContent value="assignments">
                    <ConsultantAssignmentsTab members={members} />
                </TabsContent>

                <TabsContent value="overview">
                    <AssignmentOverviewTab members={members} />
                </TabsContent>
            </Tabs>
        </div>
    )
}

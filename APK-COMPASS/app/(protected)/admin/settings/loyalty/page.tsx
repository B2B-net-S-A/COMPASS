import React from 'react'
import { LoyaltyManager } from '@/components/profile/admin/LoyaltyManager'
import { LoyaltyRulesEditor } from '@/components/profile/admin/LoyaltyRulesEditor'
import { ReferralSettingsEditor } from '@/components/admin/ReferralSettingsEditor'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminLoyaltyPage() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const role = profile?.role

    if (role !== 'admin' && role !== 'centrala' && role !== 'administrator') {
        redirect('/home')
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h3 className="text-lg font-medium">Konfiguracja Programu Lojalnościowego i Rekomendacji</h3>
                <p className="text-sm text-muted-foreground">
                    Zarządzaj punktami użytkowników, konfiguruj wartości nagród, regulamin rekomendacji i monitoruj statusy.
                </p>
            </div>

            <Tabs defaultValue="manual" className="w-full">
                <TabsList className="grid w-full grid-cols-3 lg:w-[550px]">
                    <TabsTrigger value="manual">Korekty Ręczne</TabsTrigger>
                    <TabsTrigger value="rules">Tabela punktacji</TabsTrigger>
                    <TabsTrigger value="referrals">Rekomendacje</TabsTrigger>
                </TabsList>
                <TabsContent value="manual" className="mt-6">
                    <LoyaltyManager />
                </TabsContent>
                <TabsContent value="rules" className="mt-6">
                    <LoyaltyRulesEditor />
                </TabsContent>
                <TabsContent value="referrals" className="mt-6">
                    <ReferralSettingsEditor />
                </TabsContent>
            </Tabs>
        </div>
    )
}

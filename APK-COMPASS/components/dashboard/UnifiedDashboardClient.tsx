'use client'

import React from 'react'
import { CollapsibleSection } from '@/components/common/CollapsibleSection'
import {
    Shield,
    Users,
    User,
    Bell,
    Briefcase,
} from 'lucide-react'

// Admin components
import { AdminWelcomePanel } from '@/components/admin/AdminWelcomePanel'
import { AdminPanelContent } from '@/components/admin/AdminPanelContent'
import { AdminProfileSection } from '@/components/admin/AdminProfileSection'

// Centrala components
import { CentralaProfileView } from '@/components/profile/views/CentralaProfileView'
import { CentralaDashboardPanel } from '@/components/dashboard/CentralaDashboardPanel'

// Consultant components
import { ConsultantProfileView } from '@/components/profile/views/ConsultantProfileView'
import { WelcomePanel } from '@/components/dashboard/WelcomePanel'
import { ContractStatusWidget } from '@/components/dashboard/ContractStatusWidget'
import { HealthScoreWidget } from '@/components/dashboard/HealthScoreWidget'
import { DashboardQuickActions } from '@/components/dashboard/DashboardQuickActions'

import Link from 'next/link'
import type { AdminKpiStats } from '@/lib/actions/unified-dashboard'
import type { AdminDashboardData } from '@/lib/actions/admin-dashboard'

interface RecruiterInfo {
    full_name: string
    email: string
    phone: string | null
    avatar_url: string | null
}

interface UnifiedDashboardClientProps {
    role: string
    centralaSubRole?: 'recruiter' | 'delivery_lead' | 'finance' | null
    userProfile: any
    centralaStats: any
    consultantsList: any
    consultantDashboard: any
    adminKpi?: AdminKpiStats | null
    recruiterInfo?: RecruiterInfo | null
    adminDashboardData?: AdminDashboardData | null
    isSuperAdmin?: boolean
}

export function UnifiedDashboardClient({
    role,
    centralaSubRole,
    userProfile,
    centralaStats,
    consultantsList,
    consultantDashboard,
    adminKpi,
    recruiterInfo,
    adminDashboardData,
    isSuperAdmin = false,
}: UnifiedDashboardClientProps) {
    const isAdmin = role === 'admin' || role === 'administrator'
    const isCentrala = role === 'centrala' || role === 'consultant_manager'
    const isConsultant = role === 'consultant'

    return (
        <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
            {/* ===== ADMIN VIEW ===== */}
            {isAdmin && (
                <>
                    <AdminWelcomePanel
                        user={{
                            full_name: userProfile?.full_name,
                            avatar_url: userProfile?.avatar_url,
                            email: userProfile?.email,
                        }}
                        isSuperAdmin={isSuperAdmin}
                    />

                    <CollapsibleSection
                        title="Panel Administratora"
                        description="Analiza efektywności, KPI i monitoring zespołu."
                        icon={<Shield className="h-5 w-5" />}
                        sectionId="admin-panel"
                        defaultOpen={true}
                    >
                        <AdminPanelContent dashboardData={adminDashboardData} />
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Mój Profil"
                        description="Twoje dane osobowe, rola i ustawienia konta."
                        icon={<User className="h-5 w-5" />}
                        sectionId="admin-profile"
                        defaultOpen={false}
                    >
                        <AdminProfileSection
                            userProfile={userProfile}
                            isSuperAdmin={isSuperAdmin}
                            dashboardData={adminDashboardData}
                        />
                    </CollapsibleSection>

                </>
            )}

            {/* ===== CENTRALA VIEW ===== */}
            {isCentrala && (
                <>
                    <CentralaDashboardPanel
                        subRole={centralaSubRole || 'recruiter'}
                        stats={centralaStats}
                        consultants={consultantsList || []}
                        userName={userProfile?.full_name}
                    />

                    <CollapsibleSection
                        title="Mój Profil"
                        description="Twoje dane osobowe i ustawienia konta."
                        icon={<User className="h-5 w-5" />}
                        sectionId="centrala-profile"
                        defaultOpen={false}
                    >
                        <CentralaProfileView
                            userProfile={userProfile}
                            subRole={centralaSubRole || 'recruiter'}
                            hideHeader={true}
                        />
                    </CollapsibleSection>
                </>
            )}

            {/* ===== CONSULTANT VIEW ===== */}
            {isConsultant && (
                <>
                    <WelcomePanel
                        fullName={consultantDashboard?.stats?.profile?.full_name}
                        avatarUrl={consultantDashboard?.stats?.profile?.avatar_url}
                        loyaltyPoints={consultantDashboard?.stats?.loyaltyPoints || 0}
                        loyaltyTier={consultantDashboard?.stats?.loyaltyTier || 'bronze'}
                        activeContract={consultantDashboard?.stats?.activeContract ? {
                            project_name: consultantDashboard.stats.activeContract.project_name,
                            client_name: consultantDashboard.stats.activeContract.client_name
                        } : null}
                        recruiterName={recruiterInfo?.full_name}
                        recruiterPhone={recruiterInfo?.phone}
                        locale="pl"
                    />

                    <CollapsibleSection
                        title="Moje Kontrakty"
                        description="Status kontraktu, health score i szybkie akcje."
                        icon={<Briefcase className="h-5 w-5" />}
                        sectionId="consultant-contracts"
                        defaultOpen={true}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <ContractStatusWidget
                                contract={consultantDashboard?.contract?.contract}
                            />
                            <HealthScoreWidget
                                score={consultantDashboard?.contract?.contract?.health_score}
                            />
                            <DashboardQuickActions
                                actions={consultantDashboard?.actions || []}
                                locale="pl"
                            />
                        </div>
                    </CollapsibleSection>

                    {/* Notifications */}
                    {consultantDashboard?.notifications && consultantDashboard.notifications.length > 0 && (
                        <CollapsibleSection
                            title="Ostatnie Powiadomienia"
                            description="Twoje najnowsze powiadomienia."
                            icon={<Bell className="h-5 w-5" />}
                            sectionId="consultant-notifications"
                            defaultOpen={true}
                        >
                            <div className="space-y-3">
                                {consultantDashboard.notifications.slice(0, 3).map((notification: any) => (
                                    <Link
                                        key={notification.id}
                                        href={notification.action_url || '/notifications'}
                                        className="block p-3 rounded-lg border hover:bg-accent card-hover"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 text-xl">
                                                {notification.type === 'new_project_match' && '🎯'}
                                                {notification.type === 'contract_ending' && '📋'}
                                                {notification.type === 'health_score_low' && '⚠️'}
                                                {notification.type === 'loyalty_tier_up' && '🏆'}
                                                {notification.type === 'referral_update' && '👥'}
                                                {notification.type === 'document_uploaded' && '📄'}
                                                {notification.type === 'payment_received' && '💰'}
                                                {!['new_project_match', 'contract_ending', 'health_score_low', 'loyalty_tier_up', 'referral_update', 'document_uploaded', 'payment_received'].includes(notification.type) && '📢'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-medium line-clamp-1">
                                                    {notification.title_pl || notification.title_en}
                                                </h4>
                                                {(notification.body_pl || notification.body_en) && (
                                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                        {notification.body_pl || notification.body_en}
                                                    </p>
                                                )}
                                            </div>
                                            {!notification.is_read && (
                                                <div className="flex-shrink-0 w-2 h-2 bg-primary rounded-full" />
                                            )}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    <CollapsibleSection
                        title="Mój Profil"
                        description="Twoje dane, umiejętności, dostępność i preferencje."
                        icon={<User className="h-5 w-5" />}
                        sectionId="consultant-profile"
                        defaultOpen={false}
                    >
                        <ConsultantProfileView />
                    </CollapsibleSection>
                </>
            )}
        </div>
    )
}

import { createServiceClient } from '@/lib/supabase/admin'
import { AdminEmployeesPanelClient, type EmployeeRow } from './AdminEmployeesPanelClient'

// Phase 20f: pokazuj wszystkich HR-zone (admin + internal + finanse + manager + talent_community).
// Edycja role + manager_id przez EditEmployeeDialog inline.
export async function AdminEmployeesPanel() {
    const admin = createServiceClient()
    const { data } = await admin
        .from('profiles')
        .select(
            'id, full_name, email, avatar_url, role, default_location, employment_type, work_start_date, manager_id',
        )
        .in('role', ['admin', 'internal', 'finanse', 'manager', 'talent_community'])
        .order('role')
        .order('full_name')

    const rawProfiles = (data ?? []) as Array<{
        id: string
        full_name: string | null
        email: string
        avatar_url: string | null
        role: string
        default_location: 'onsite' | 'remote' | null
        employment_type: 'uop' | 'b2b' | null
        work_start_date: string | null
        manager_id: string | null
    }>

    // Phase 20f: doładuj nazwy managerów jednym SELECT (uniknij N+1).
    const managerIds = Array.from(
        new Set(rawProfiles.map((p) => p.manager_id).filter((id): id is string => !!id)),
    )
    const managerMap = new Map<string, { full_name: string | null; email: string }>()
    if (managerIds.length > 0) {
        const { data: managersData } = await admin
            .from('profiles')
            .select('id, full_name, email')
            .in('id', managerIds)
        for (const m of (managersData ?? []) as Array<{
            id: string
            full_name: string | null
            email: string
        }>) {
            managerMap.set(m.id, { full_name: m.full_name, email: m.email })
        }
    }

    const employees: EmployeeRow[] = rawProfiles.map((p) => ({
        ...p,
        manager_full_name: p.manager_id ? managerMap.get(p.manager_id)?.full_name ?? null : null,
        manager_email: p.manager_id ? managerMap.get(p.manager_id)?.email ?? null : null,
    }))

    // Phase 20f: lista kandydatów na managera (admin + manager + finanse).
    const { data: candidatesData } = await admin
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['admin', 'manager', 'finanse'])
        .order('full_name')
    const candidates = ((candidatesData ?? []) as Array<{
        id: string
        full_name: string | null
        email: string
        role: string
    }>).filter((r) => !!r.email)

    return <AdminEmployeesPanelClient initialEmployees={employees} managerCandidates={candidates} />
}

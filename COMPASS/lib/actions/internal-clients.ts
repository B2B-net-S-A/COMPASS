'use server'

// Phase 27d — Client list server actions (predefined dropdown for bonus categories).
//
// Auth:
//   - listClients         : any HR-zone user (managers pick a client when assigning bonus)
//   - listActiveClients   : any HR-zone user (active only, for dropdown)
//   - createClient        : admin + finanse
//   - toggleClientActive  : admin + finanse
//   - deleteClient        : admin + finanse

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireInternalOrAdminAction,
    requireFinanseOrAdminAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'

export interface ClientRow {
    id: string
    name: string
    is_active: boolean
    created_by: string | null
    created_at: string
}

const CLIENT_NAME_MAX = 120

function validateClientName(name: string): string {
    const trimmed = (name ?? '').trim()
    if (trimmed.length < 1) throw new Error('Nazwa klienta jest wymagana.')
    if (trimmed.length > CLIENT_NAME_MAX) {
        throw new Error(`Nazwa klienta za długa (max ${CLIENT_NAME_MAX} znaków).`)
    }
    return trimmed
}

/** Phase 27d — full client list (active + inactive). HR-zone read scope. */
export async function listClients(): Promise<ClientRow[]> {
    await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('clients' as any)
        .select('*')
        .order('name')
    if (error) throw new Error(`Błąd pobierania klientów: ${error.message}`)
    return ((data ?? []) as unknown) as ClientRow[]
}

/** Phase 27d — active clients only (for the bonus dropdown). */
export async function listActiveClients(): Promise<ClientRow[]> {
    await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('clients' as any)
        .select('*')
        .eq('is_active', true)
        .order('name')
    if (error) throw new Error(`Błąd pobierania klientów: ${error.message}`)
    return ((data ?? []) as unknown) as ClientRow[]
}

/** Phase 27d — create a new client. Admin + finanse only. */
export async function createClient_(name: string): Promise<ClientRow> {
    const ctx = await requireFinanseOrAdminAction()
    const trimmed = validateClientName(name)
    const admin = createServiceClient()
    const { data, error } = await admin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('clients' as any)
        .insert({ name: trimmed, created_by: ctx.userId })
        .select('*')
        .single()
    if (error) {
        if ((error as { code?: string }).code === '23505') {
            throw new Error(`Klient "${trimmed}" już istnieje.`)
        }
        throw new Error(`Błąd dodawania klienta: ${error.message}`)
    }
    const row = (data as unknown) as ClientRow
    await logAudit(ctx.userId, 'CLIENT_CREATED', { client_id: row.id, name: trimmed })
    return row
}

/** Phase 27d — toggle client active flag (soft hide from dropdown). Admin + finanse. */
export async function toggleClientActive(id: string, isActive: boolean): Promise<void> {
    const ctx = await requireFinanseOrAdminAction()
    if (!id) throw new Error('Brak id klienta.')
    const admin = createServiceClient()
    const { error } = await admin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('clients' as any)
        .update({ is_active: isActive })
        .eq('id', id)
    if (error) throw new Error(`Błąd aktualizacji klienta: ${error.message}`)
    await logAudit(ctx.userId, 'CLIENT_UPDATED', { client_id: id, is_active: isActive })
}

/** Phase 27d — rename a client. Admin + finanse. */
export async function renameClient(id: string, name: string): Promise<void> {
    const ctx = await requireFinanseOrAdminAction()
    if (!id) throw new Error('Brak id klienta.')
    const trimmed = validateClientName(name)
    const admin = createServiceClient()
    const { error } = await admin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('clients' as any)
        .update({ name: trimmed })
        .eq('id', id)
    if (error) {
        if ((error as { code?: string }).code === '23505') {
            throw new Error(`Klient "${trimmed}" już istnieje.`)
        }
        throw new Error(`Błąd zmiany nazwy: ${error.message}`)
    }
    await logAudit(ctx.userId, 'CLIENT_UPDATED', { client_id: id, name: trimmed })
}

/** Phase 27d — hard delete a client. Admin + finanse. (Bonuses keep client_name as free text.) */
export async function deleteClient(id: string): Promise<void> {
    const ctx = await requireFinanseOrAdminAction()
    if (!id) throw new Error('Brak id klienta.')
    const admin = createServiceClient()
    // Capture name for audit.
    const { data: existing } = await admin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('clients' as any)
        .select('name')
        .eq('id', id)
        .maybeSingle()
    const { error } = await admin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('clients' as any)
        .delete()
        .eq('id', id)
    if (error) {
        // Phase 46: klient ma FK z mapy technologicznej (karty wywiadów, obszary).
        if ((error as { code?: string }).code === '23503') {
            throw new Error(
                'Klient ma powiązane dane mapy technologicznej (karty wywiadów lub obszary) — dezaktywuj go zamiast usuwać.',
            )
        }
        throw new Error(`Błąd usuwania klienta: ${error.message}`)
    }
    await logAudit(ctx.userId, 'CLIENT_DELETED', {
        client_id: id,
        name: (existing as { name?: string } | null)?.name ?? null,
    })
}

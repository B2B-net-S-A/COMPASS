import { z } from 'zod'
import { b2bnetworkEmailSchema, uuidSchema } from './common'

// Server actions: lib/actions/admin-management.ts

export const addAdminMemberInputSchema = z.object({
    email: b2bnetworkEmailSchema,
})

export type AddAdminMemberInput = z.infer<typeof addAdminMemberInputSchema>

export const removeAdminMemberInputSchema = z.object({
    id: uuidSchema,
})

export type RemoveAdminMemberInput = z.infer<typeof removeAdminMemberInputSchema>

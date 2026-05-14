import { z } from 'zod'
import { uuidSchema } from './common'

// Server actions: lib/actions/profile.ts

export const updateUserBioInputSchema = z.object({
    bio: z.string().trim().max(5_000),
})

export type UpdateUserBioInput = z.infer<typeof updateUserBioInputSchema>

// Allowlist pól które user może modyfikować na własnym profilu. Krytyczne pola
// (role, email, embedding, loyalty_*, onboarding_*, default_location) są
// CELOWO pominięte — user nie może ich edytować, nawet jeśli wysłałby je
// w request body. RLS dodatkowo to egzekwuje na poziomie DB, ale ta warstwa
// łapie misuse szybciej i z lepszym error message.
//
// .passthrough() bo aktualnie frontend wysyła rozszerzone shape (tech_stack,
// certifications), które nie są jeszcze typowane na DB level. Po wprowadzeniu
// generated DB types zaostrzymy do .strict().

export const profileUpdateInputSchema = z
    .object({
        full_name: z.string().trim().min(1).max(200).optional(),
        bio: z.string().trim().max(5_000).optional(),
        phone: z.string().trim().max(50).optional(),
        avatar_url: z.string().trim().url().max(500).optional().or(z.literal('')),
        cv_url: z.string().trim().url().max(500).optional().or(z.literal('')),
        experience_years: z.number().int().min(0).max(80).optional(),
        skills: z.array(z.string().trim().min(1).max(100)).max(200).optional(),
        current_status: z.string().trim().max(50).optional(),
        capacity_percentage: z.number().int().min(0).max(100).optional(),
        project_sentiment: z.array(z.string().trim().max(100)).max(50).optional(),
        verifier_status: z.string().trim().max(50).optional(),
        ambassador_status: z.string().trim().max(50).optional(),
        sales_support_status: z.string().trim().max(50).optional(),
        previous_clients: z.array(z.string().trim().max(200)).max(100).optional(),
        available_from: z.string().nullable().optional(),
        fte_status: z.string().trim().nullable().optional(),
        max_monthly_hours: z.number().int().min(0).max(744).optional(),
        gdpr_consent: z.boolean().optional(),
        tech_stack: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
        certifications: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
        work_preferences: z.record(z.string(), z.unknown()).optional(),
    })
    // embedding nie może przyjść od klienta — generujemy server-side
    // z bio. Jeśli przyjdzie, ignorujemy (nie throw, bo legacy clienci
    // mogą wciąż wysyłać).
    .passthrough()

export type ProfileUpdateInput = z.infer<typeof profileUpdateInputSchema>

export const consultantIdSchema = z.object({
    consultantId: uuidSchema,
})

export type ConsultantIdInput = z.infer<typeof consultantIdSchema>

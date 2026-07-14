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
export const profileUpdateInputSchema = z
    .object({
        full_name: z.string().trim().min(1).max(200).optional(),
        bio: z.string().trim().max(5_000).optional(),
        phone: z.string().trim().max(50).optional(),
        experience_years: z.number().int().min(0).max(80).optional(),
        skills: z.array(z.string().trim().min(1).max(100)).max(200).optional(),
        previous_clients: z.array(z.string().trim().max(200)).max(100).optional(),
        available_from: z.string().nullable().optional(),
        certifications: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
        education: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
        work_history: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
        languages: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
        location: z.string().trim().max(200).optional(),
        linkedin_url: z.string().trim().url().max(500).optional().or(z.literal('')),
        github_url: z.string().trim().url().max(500).optional().or(z.literal('')),
        portfolio_url: z.string().trim().url().max(500).optional().or(z.literal('')),
        preferred_language: z.string().trim().max(10).optional(),
    })
    // P0: unknown fields are rejected. In particular role, email, embedding,
    // HR/finance fields, avatar_url and cv_url can never pass this boundary.
    .strict()

export type ProfileUpdateInput = z.infer<typeof profileUpdateInputSchema>

export const consultantIdSchema = z.object({
    consultantId: uuidSchema,
})

export type ConsultantIdInput = z.infer<typeof consultantIdSchema>

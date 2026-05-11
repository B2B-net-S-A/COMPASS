import { z } from 'zod'
import { uuidSchema } from './common'

// Server actions: lib/actions/projects.ts
//
// `updateProject(projectId, updates)` accepted `Record<string, unknown>`.
// Privilege escalation risk — caller could send `{ role: 'admin' }` or
// `{ owner_id: '<attacker-id>' }`. We tighten to an explicit allowlist.

const projectStatusSchema = z.enum(['draft', 'open', 'matched', 'closed', 'archived'])

export const updateProjectInputSchema = z.object({
    projectId: uuidSchema,
    updates: z
        .object({
            title: z.string().trim().min(1).max(200).optional(),
            description: z.string().trim().max(10_000).optional(),
            status: projectStatusSchema.optional(),
            client_name: z.string().trim().max(200).optional(),
            tech_stack: z.array(z.string()).max(50).optional(),
            required_seniority: z.string().trim().max(50).optional(),
            location: z.string().trim().max(200).optional(),
            rate_min: z.number().int().nonnegative().optional(),
            rate_max: z.number().int().nonnegative().optional(),
            start_date: z.string().datetime().nullable().optional(),
            end_date: z.string().datetime().nullable().optional(),
            notes: z.string().trim().max(10_000).optional(),
        })
        .strict() // ZodObject.strict: extra keys rzucają błąd → defense-in-depth.
        .refine(
            (u) => Object.keys(u).length > 0,
            { message: 'Brak pól do aktualizacji.' },
        ),
})

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>

export const deleteProjectInputSchema = z.object({
    projectId: uuidSchema,
})

export type DeleteProjectInput = z.infer<typeof deleteProjectInputSchema>

export const deleteProjectsInputSchema = z.object({
    projectIds: z.array(uuidSchema).min(1).max(500),
})

export type DeleteProjectsInput = z.infer<typeof deleteProjectsInputSchema>

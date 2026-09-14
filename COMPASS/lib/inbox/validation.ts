import { z } from 'zod'

export const inboxDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Nieprawidłowa data').refine((date) => {
    const parsed = new Date(`${date}T12:00:00Z`)
    return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && date >= '2000-01-01' && date <= '2100-12-31'
}, 'Nieprawidłowa data').nullable()
export const inboxPlanningSchema = z.object({
    work_area: z.enum(['administration', 'marketing']),
    planned_due_date: inboxDate,
})
export const inboxEditSchema = inboxPlanningSchema.extend({
    category_id: z.string().uuid('Wybierz typ sprawy'),
    assignee_id: z.string().uuid('Wybierz osobę odpowiedzialną').nullable(),
    subject: z.string().trim().min(3).max(200),
    body_md: z.string().trim().min(10).max(20000),
    priority_level: z.enum(['P1', 'P2', 'P3']),
    waiting_for: z.string().trim().max(300).nullable(),
    follow_up_date: inboxDate,
    checklist: z.array(z.object({ id: z.string().uuid(), text: z.string().trim().min(1).max(300), done: z.boolean() })).max(50),
    materials: z.array(z.object({ id: z.string().uuid(), label: z.string().trim().min(1).max(150), url: z.string().url().max(2000).refine((url) => /^https?:\/\//i.test(url), 'Dozwolone są linki http i https') })).max(30),
}).strict()
export type InboxEditInput = z.infer<typeof inboxEditSchema>

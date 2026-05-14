import { addPolishBusinessDays } from './business-days'
import { SLA_DAYS, type InboxPriorityLevel } from '@/lib/types/support'

export function computeDueDate(priority: InboxPriorityLevel, from: Date = new Date()): Date {
    return addPolishBusinessDays(from, SLA_DAYS[priority])
}

export type SlaStatus = 'green' | 'yellow' | 'red'

/**
 * - red: due_date in the past (breached)
 * - yellow: due_date in the next 24h
 * - green: more than 24h until due_date
 */
export function getSlaStatus(dueDate: Date | string, now: Date = new Date()): SlaStatus {
    const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
    const diffH = (due.getTime() - now.getTime()) / (1000 * 60 * 60)
    if (diffH < 0) return 'red'
    if (diffH < 24) return 'yellow'
    return 'green'
}

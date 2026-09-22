import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AcademyOperationsHealth } from '../AcademyOperationsHealth'
import { evaluateAcademyOperations } from '@/lib/academy/operations-health'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
describe('Academy operations status', () => {
    it('does not show empty or healthy state after an unreadable health result', () => {
        render(<AcademyOperationsHealth result={{ success: false, error: 'unavailable' }} />)
        expect(screen.getByRole('alert')).toHaveTextContent('Nie oznacza to pustej kolejki')
        expect(screen.queryByText('Zadania działają prawidłowo')).not.toBeInTheDocument()
    })
    it('makes a silent stopped worker visible with an owner and recovery action', () => {
        const data = evaluateAcademyOperations({ checkedAt: '2026-09-22T15:00:00Z', workers: [{ kind: 'materials', lastFinishedAt: null, ok: false }, { kind: 'sync', lastFinishedAt: '2026-09-22T14:59:00Z', ok: true }], materials: { pending: 0, failed: 0, oldestDueAt: null }, integrations: { pending: 0, failed: 0, oldestDueAt: null }, storage: { reservedBytes: 0, authorsNearQuota: 0 } }, { available: true, databaseUpdatedAt: '2026-09-22T12:00:00Z' })
        render(<AcademyOperationsHealth result={{ success: true, data }} />)
        expect(screen.getByText('Wymagana interwencja')).toBeInTheDocument()
        expect(screen.getByRole('alert')).toHaveTextContent('Operator techniczny')
        expect(screen.getByRole('button', { name: 'Odśwież stan zadań' })).toBeEnabled()
    })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AcademyReport } from '../AcademyReport'

describe('etykieta danych raportu', () => {
    it('do startu oznacza dane jako próbę', () => {
        render(<AcademyReport metrics={[]} rows={[]} />)
        expect(screen.getByRole('note')).toHaveTextContent('Próba.')
    })
    it('po starcie podaje datę i nie pokazuje etykiety próby', () => {
        const { unmount } = render(<AcademyReport metrics={[]} rows={[]} reportsStartAt="2026-12-01T00:00:00Z" />)
        expect(screen.getByRole('note')).toHaveTextContent('od startu Akademii')
        expect(screen.queryByText('Próba.')).not.toBeInTheDocument()
        unmount()
    })
})

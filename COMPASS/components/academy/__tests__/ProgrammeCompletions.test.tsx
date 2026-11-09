import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgrammeCompletions } from '../ProgrammeCompletions'

describe('ProgrammeCompletions', () => {
    it('pokazuje program raz, z liczbą kursów i osób', () => {
        render(<ProgrammeCompletions result={{ success: true, data: { migrated: true, programmes: [{ programme_id: 'p1', title: 'PEGA podstawy', courses: 2, completed_users: 1 }] } }} />)
        const row = screen.getByRole('row', { name: /PEGA podstawy/ })
        expect(within(row).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['2', '1'])
    })

    it('przed migracją mówi, że czeka na migrację, a nie że programów nie ma', () => {
        render(<ProgrammeCompletions result={{ success: true, data: { migrated: false, programmes: [] } }} />)
        expect(screen.getByText('Podsumowanie programów czeka na migrację bazy danych.')).toBeInTheDocument()
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('odróżnia brak programów od awarii odczytu', () => {
        const { unmount } = render(<ProgrammeCompletions result={{ success: true, data: { migrated: true, programmes: [] } }} />)
        expect(screen.getByText('Żaden kurs nie jest jeszcze przypisany do programu.')).toBeInTheDocument()
        unmount()
        render(<ProgrammeCompletions result={{ success: false, error: 'Nie udało się wykonać operacji.' }} />)
        expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się wykonać operacji.')
    })
})

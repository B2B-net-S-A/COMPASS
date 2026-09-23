import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AcademyAdminCourses } from '../AcademyAdminCourses'
import { AcademyAdminNav } from '../AcademyAdminNav'
import { archiveCourse } from '@/lib/actions/courses-admin'
import type { AcademyAdminCoursePage } from '@/lib/types/academy-admin'

vi.mock('@/lib/actions/courses-admin', () => ({ archiveCourse: vi.fn() }))
afterEach(cleanup)
beforeEach(() => vi.mocked(archiveCourse).mockResolvedValue({ success: true, data: undefined }))
const page: AcademyAdminCoursePage = { page: 1, pageSize: 25, total: 1, items: [{ id: 'course', title: 'Warsztat SQL', status: 'published', authorName: 'Autorka', publishedVersionNumber: 2, draftVersion: { title: 'Nowy SQL', number: 3, status: 'rejected' }, legacyReviewRequired: false }] }
function mount(data = page) { return render(<AcademyAdminCourses result={data} search="SQL" status="all" />) }

describe('administrator course inventory', () => {
    it('links to inventory and distinguishes course lifecycle from draft review state', () => {
        render(<AcademyAdminNav active="courses" />)
        expect(screen.getByRole('link', { name: 'Wszystkie szkolenia' })).toHaveAttribute('href', '/admin/learning/szkolenia')
        mount()
        expect(within(screen.getByRole('heading', { name: 'Warsztat SQL' }).closest('article')!).getByText('Opublikowany')).toBeInTheDocument()
        expect(screen.getByText('Wersja robocza 3: Do poprawy · Nowy SQL')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Program i historia' })).toHaveAttribute('href', '/learning/tworze/course/edit')
    })
    it('explains all consequences and does not archive when confirmation is cancelled', async () => {
        mount()
        fireEvent.click(screen.getByRole('button', { name: 'Zarchiwizuj' }))
        const dialog = await screen.findByRole('alertdialog')
        expect(dialog).toHaveTextContent('Archiwizacja zatrzymuje nowe zapisy')
        expect(dialog).toHaveTextContent('Zachowuje istniejącą naukę, materiały, postępy i certyfikaty')
        expect(dialog).toHaveTextContent('Nie odwołuje automatycznie spotkań Teams')
        expect(archiveCourse).not.toHaveBeenCalled()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Zachowaj szkolenie' }))
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
        expect(archiveCourse).not.toHaveBeenCalled()
    })
    it('archives only after confirmation and preserves learning state', async () => {
        mount()
        fireEvent.click(screen.getByRole('button', { name: 'Zarchiwizuj' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Zarchiwizuj szkolenie' }))
        await waitFor(() => expect(archiveCourse).toHaveBeenCalledExactlyOnceWith('course'))
        expect(await screen.findByRole('status')).toHaveTextContent('Dotychczasowi uczestnicy zachowują swoją naukę')
        expect(screen.queryByRole('button', { name: 'Zarchiwizuj' })).not.toBeInTheDocument()
    })
    it('retains the course and surfaces rejected archive attempts', async () => {
        vi.mocked(archiveCourse).mockResolvedValue({ success: false, error: 'Brak uprawnień do archiwizacji.' })
        mount()
        fireEvent.click(screen.getByRole('button', { name: 'Zarchiwizuj' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Zarchiwizuj szkolenie' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Brak uprawnień do archiwizacji.')
        expect(screen.getByRole('button', { name: 'Zarchiwizuj' })).toBeEnabled()
    })
    it('shows archived courses without mutation and preserves filters across pages', () => {
        mount({ ...page, total: 61, page: 2, items: [{ ...page.items[0], status: 'archived' }] })
        expect(screen.queryByRole('button', { name: 'Zarchiwizuj' })).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: '← Poprzednia strona' })).toHaveAttribute('href', '/admin/learning/szkolenia?q=SQL&status=all&page=1')
        expect(screen.getByRole('link', { name: 'Następna strona →' })).toHaveAttribute('href', '/admin/learning/szkolenia?q=SQL&status=all&page=3')
        expect(screen.getByLabelText('Szukaj tytułu szkolenia')).toHaveValue('SQL')
        expect(screen.getByLabelText('Stan kursu')).toHaveValue('all')
    })
    it('offers a route back from an empty out-of-range page', () => {
        mount({ ...page, page: 3, items: [], total: 0 })
        expect(screen.getByText(/Brak szkoleń na tej stronie/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: '← Poprzednia strona' })).toHaveAttribute('href', '/admin/learning/szkolenia?q=SQL&status=all&page=1')
    })
})

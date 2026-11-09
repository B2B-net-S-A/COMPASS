import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CourseLibraryFields } from '../CourseLibraryFields'
import { libraryFieldsDraft } from '@/lib/academy/course-library'
import { setCourseLibraryFields, type CourseLibraryState } from '@/lib/actions/academy-library'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/lib/actions/academy-library', () => ({ setCourseLibraryFields: vi.fn() }))

const programmeId = '22222222-2222-4222-8222-222222222222'
const otherProgrammeId = '33333333-3333-4333-8333-333333333333'
const ready: CourseLibraryState = {
    migrated: true, canEdit: true, topic: 'Kubernetes', programmeId,
    programmes: [{ id: programmeId, title: 'Chmura od podstaw' }, { id: otherProgrammeId, title: 'Java dla zespołów' }],
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(setCourseLibraryFields).mockResolvedValue({ success: true, data: null }) })
afterEach(cleanup)

describe('libraryFieldsDraft', () => {
    const initial = { topic: 'Kubernetes', programmeId }
    it('treats surrounding spaces as no change', () => {
        expect(libraryFieldsDraft(initial, '  Kubernetes ', programmeId)).toEqual({ topic: 'Kubernetes', programmeId, changed: false, error: null })
    })
    it('turns an empty or blank topic into no topic', () => {
        expect(libraryFieldsDraft(initial, '   ', programmeId)).toMatchObject({ topic: null, changed: true, error: null })
    })
    it('turns the "no programme" option into null', () => {
        expect(libraryFieldsDraft(initial, 'Kubernetes', '')).toMatchObject({ programmeId: null, changed: true })
    })
    it('blocks a topic longer than 100 characters', () => {
        expect(libraryFieldsDraft(initial, 'a'.repeat(100), programmeId).error).toBeNull()
        expect(libraryFieldsDraft(initial, 'a'.repeat(101), programmeId).error).toBe('Temat może mieć najwyżej 100 znaków.')
    })
})

describe('CourseLibraryFields', () => {
    it('shows "czeka na migrację" without controls when the columns are missing', () => {
        render(<CourseLibraryFields courseId="c1" result={{ success: true, data: { ...ready, migrated: false, canEdit: false, topic: null, programmeId: null, programmes: [] } }} topics={[]} />)
        expect(screen.getByText(/czeka na migrację/i)).toBeInTheDocument()
        expect(screen.queryByLabelText('Temat')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Zapisz temat i program' })).not.toBeInTheDocument()
    })

    it('shows a read error without controls instead of empty fields', () => {
        render(<CourseLibraryFields courseId="c1" result={{ success: false, error: 'Nie udało się wczytać.' }} topics={[]} />)
        expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się wczytać.')
        expect(screen.queryByLabelText('Temat')).not.toBeInTheDocument()
    })

    it('offers catalogue topics as suggestions while allowing a new one', () => {
        render(<CourseLibraryFields courseId="c1" result={{ success: true, data: ready }} topics={['Java', 'Kubernetes']} />)
        const input = screen.getByLabelText('Temat')
        expect(input).toHaveValue('Kubernetes')
        expect(input).toHaveAttribute('maxLength', '100')
        const list = document.getElementById(input.getAttribute('list') ?? '')
        expect(Array.from(list?.querySelectorAll('option') ?? []).map(option => option.getAttribute('value'))).toEqual(['Java', 'Kubernetes'])
    })

    it('keeps the save button off until something changes', () => {
        render(<CourseLibraryFields courseId="c1" result={{ success: true, data: ready }} topics={[]} />)
        const save = screen.getByRole('button', { name: 'Zapisz temat i program' })
        expect(save).toBeDisabled()
        fireEvent.change(screen.getByLabelText('Temat'), { target: { value: ' Kubernetes ' } })
        expect(save).toBeDisabled()
        fireEvent.change(screen.getByLabelText('Program'), { target: { value: otherProgrammeId } })
        expect(save).toBeEnabled()
    })

    it('saves a new topic and programme through the action, then refreshes', async () => {
        render(<CourseLibraryFields courseId="c1" result={{ success: true, data: ready }} topics={[]} />)
        fireEvent.change(screen.getByLabelText('Temat'), { target: { value: '  Java ' } })
        fireEvent.change(screen.getByLabelText('Program'), { target: { value: otherProgrammeId } })
        fireEvent.click(screen.getByRole('button', { name: 'Zapisz temat i program' }))
        await waitFor(() => expect(setCourseLibraryFields).toHaveBeenCalledWith({ courseId: 'c1', topic: 'Java', programmeId: otherProgrammeId }))
        await waitFor(() => expect(refresh).toHaveBeenCalled())
        expect(screen.getByRole('status')).toHaveTextContent('Zapisano')
    })

    it('clears both fields to "none"', async () => {
        render(<CourseLibraryFields courseId="c1" result={{ success: true, data: ready }} topics={[]} />)
        fireEvent.change(screen.getByLabelText('Temat'), { target: { value: '' } })
        fireEvent.change(screen.getByLabelText('Program'), { target: { value: '' } })
        fireEvent.click(screen.getByRole('button', { name: 'Zapisz temat i program' }))
        await waitFor(() => expect(setCourseLibraryFields).toHaveBeenCalledWith({ courseId: 'c1', topic: null, programmeId: null }))
    })

    it('shows the refusal and does not refresh', async () => {
        vi.mocked(setCourseLibraryFields).mockResolvedValue({ success: false, error: 'Nie masz uprawnień do edycji tego szkolenia.' })
        render(<CourseLibraryFields courseId="c1" result={{ success: true, data: ready }} topics={[]} />)
        fireEvent.change(screen.getByLabelText('Temat'), { target: { value: 'Java' } })
        fireEvent.click(screen.getByRole('button', { name: 'Zapisz temat i program' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Nie masz uprawnień do edycji tego szkolenia.')
        expect(refresh).not.toHaveBeenCalled()
    })

    it('shows a generic message when the action itself fails', async () => {
        vi.mocked(setCourseLibraryFields).mockRejectedValue(new Error('network'))
        render(<CourseLibraryFields courseId="c1" result={{ success: true, data: ready }} topics={[]} />)
        fireEvent.change(screen.getByLabelText('Temat'), { target: { value: 'Java' } })
        fireEvent.click(screen.getByRole('button', { name: 'Zapisz temat i program' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się zapisać')
    })

    it('is read-only for a person who cannot edit this course', () => {
        render(<CourseLibraryFields courseId="c1" result={{ success: true, data: { ...ready, canEdit: false } }} topics={[]} />)
        expect(screen.getByLabelText('Temat')).toBeDisabled()
        expect(screen.getByLabelText('Program')).toBeDisabled()
        expect(screen.queryByRole('button', { name: 'Zapisz temat i program' })).not.toBeInTheDocument()
        expect(screen.getByText(/zmienia osoba, która może edytować to szkolenie/)).toBeInTheDocument()
    })

    it('is read-only for an archived course', () => {
        render(<CourseLibraryFields courseId="c1" result={{ success: true, data: ready }} topics={[]} archived />)
        expect(screen.getByLabelText('Temat')).toBeDisabled()
        expect(screen.queryByRole('button', { name: 'Zapisz temat i program' })).not.toBeInTheDocument()
    })

    it('keeps a current programme that is no longer on the list instead of silently dropping it', () => {
        render(<CourseLibraryFields courseId="c1" result={{ success: true, data: { ...ready, programmes: [] } }} topics={[]} />)
        expect(screen.getByLabelText('Program')).toHaveValue(programmeId)
        expect(screen.getByRole('option', { name: /niedostępny/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Zapisz temat i program' })).toBeDisabled()
    })

    it('says programmes are created only from an edition when the list is empty', () => {
        render(<CourseLibraryFields courseId="c1" result={{ success: true, data: { ...ready, programmeId: null, programmes: [] } }} topics={[]} />)
        expect(screen.getByText(/Nie ma jeszcze żadnego programu/)).toBeInTheDocument()
    })
})

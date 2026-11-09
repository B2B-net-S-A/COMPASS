import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TwinCourseButton } from '../TwinCourseButton'

const push = vi.fn()
const createTwinCourse = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/academy/useAcademyAction', () => ({ useAcademyAction: () => [false, (run: () => Promise<void>) => { void run() }] }))
vi.mock('@/lib/actions/academy-twin-course', () => ({ createTwinCourse: (...args: unknown[]) => createTwinCourse(...args) }))

beforeEach(() => { push.mockClear(); createTwinCourse.mockReset() })
afterEach(cleanup)

const click = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Utwórz kurs dla nieobecnych' })) })

it('opens the draft editor after creating the course', async () => {
    createTwinCourse.mockResolvedValue({ success: true, data: { courseId: 'course-1', created: true, absentees: 3 } })
    render(<TwinCourseButton runId="run-1" />)
    await click()
    expect(createTwinCourse).toHaveBeenCalledWith('run-1')
    expect(push).toHaveBeenCalledWith('/learning/tworze/course-1/edit')
})

it('redirects to a route that has a page', () => {
    // /learning/tworze/[id] has no page.tsx, so the old redirect ended in a 404.
    expect(existsSync(join(process.cwd(), 'app/(protected)/learning/tworze/[id]/edit/page.tsx'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'app/(protected)/learning/tworze/[id]/page.tsx'))).toBe(false)
})

it('shows the refusal and stays on the page', async () => {
    createTwinCourse.mockResolvedValue({ success: false, error: 'Kurs dla nieobecnych można utworzyć po zakończeniu edycji.' })
    render(<TwinCourseButton runId="run-1" />)
    await click()
    expect(screen.getByRole('alert')).toHaveTextContent('po zakończeniu edycji')
    expect(push).not.toHaveBeenCalled()
})

it('survives a stale tab returning no result and a dropped connection', async () => {
    createTwinCourse.mockResolvedValue(undefined)
    render(<TwinCourseButton runId="run-1" />)
    await click()
    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się utworzyć')
    createTwinCourse.mockRejectedValue(new Error('network'))
    await click()
    expect(screen.getByRole('alert')).toHaveTextContent('Połączenie zostało przerwane')
})

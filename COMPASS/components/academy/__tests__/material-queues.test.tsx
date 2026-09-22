import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MaterialScanQueue } from '../MaterialScanQueue'
import { MaterialCleanupQueue } from '../MaterialCleanupQueue'

const mocks = vi.hoisted(() => ({ scanGet: vi.fn(), scanRetry: vi.fn(), cleanupGet: vi.fn(), cleanupRetry: vi.fn() }))
vi.mock('@/lib/actions/academy-materials', () => ({
    getAcademyMaterialQueue: mocks.scanGet, retryAcademyMaterialScan: mocks.scanRetry,
    getAcademyMaterialCleanupQueue: mocks.cleanupGet, retryAcademyMaterialCleanup: mocks.cleanupRetry,
}))
const item = { id: 'asset', filename: 'materiał.pdf', status: 'quarantined', attempts: 5, canRetry: true,
    createdAt: '2026-09-22', nextAttemptAt: null, courseId: 'course', runId: null as string | null, failed: true }
const base = { page: 1, pageSize: 25, total: 26, items: [item], scannerConfigured: true, mode: 'execute', uploadHours: 48, rejectedDays: 30 }
const ok = (patch: Partial<typeof base> = {}) => ({ success: true, data: { ...base, ...patch } })
beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset())
    mocks.scanGet.mockResolvedValue(ok())
    mocks.cleanupGet.mockResolvedValue(ok())
    mocks.scanRetry.mockResolvedValue({ success: true, data: undefined })
    mocks.cleanupRetry.mockResolvedValue({ success: true, data: undefined })
})
afterEach(cleanup)

describe.each([
    { name: 'scan', Component: MaterialScanQueue, get: mocks.scanGet, retry: mocks.scanRetry, filterLabel: 'Status weryfikacji', initialFilter: 'pending', retryLabel: 'Ponów skanowanie', refreshLabel: 'Odśwież kolejkę', empty: 'Brak materiałów pasujących do filtra.' },
    { name: 'cleanup', Component: MaterialCleanupQueue, get: mocks.cleanupGet, retry: mocks.cleanupRetry, filterLabel: 'Stan porządkowania', initialFilter: 'all', retryLabel: 'Ponów porządkowanie', refreshLabel: 'Odśwież stan', empty: 'Brak zadań pasujących do filtra.' },
])('$name queue interaction', ({ Component, get, retry, filterLabel, initialFilter, retryLabel, refreshLabel, empty }) => {
    it('changes pages and resets to page 1 when the filter changes', async () => {
        render(<Component />)
        await screen.findByText(item.filename)
        expect(get).toHaveBeenLastCalledWith({ page: 1, filter: initialFilter })
        expect(screen.getByRole('button', { name: 'Poprzednia strona' })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: 'Następna strona' }))
        await screen.findByText('Strona 2 z 2 · wyników: 26')
        expect(get).toHaveBeenLastCalledWith({ page: 2, filter: initialFilter })
        expect(screen.getByRole('button', { name: 'Następna strona' })).toBeDisabled()
        fireEvent.change(screen.getByLabelText(filterLabel), { target: { value: 'failed' } })
        await screen.findByText('Strona 1 z 2 · wyników: 26')
        expect(get).toHaveBeenLastCalledWith({ page: 1, filter: 'failed' })
    })
    it('returns to the last valid page when retry removes its final item', async () => {
        render(<Component />)
        await screen.findByText(item.filename)
        fireEvent.click(screen.getByRole('button', { name: 'Następna strona' }))
        await screen.findByText('Strona 2 z 2 · wyników: 26')
        get.mockResolvedValueOnce(ok({ total: 25, items: [] })).mockResolvedValue(ok({ total: 25 }))
        fireEvent.click(screen.getByRole('button', { name: retryLabel }))
        await screen.findByText('Strona 1 z 1 · wyników: 25')
        expect(retry).toHaveBeenCalledWith('asset')
        expect(get).toHaveBeenLastCalledWith({ page: 1, filter: initialFilter })
        expect(screen.queryByText('Strona 2 z 1 · wyników: 25')).not.toBeInTheDocument()
    })
    it('locks retry and navigation until the server finishes, preventing duplicate retries', async () => {
        let resolve!: (value: { success: boolean; error: string }) => void
        retry.mockImplementation(() => new Promise(done => { resolve = done }))
        render(<Component />)
        await screen.findByText(item.filename)
        const button = screen.getByRole('button', { name: retryLabel })
        fireEvent.click(button)
        fireEvent.click(button)
        expect(button).toBeDisabled()
        expect(screen.getByLabelText(filterLabel)).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Następna strona' })).toBeDisabled()
        expect(retry).toHaveBeenCalledTimes(1)
        await act(async () => resolve({ success: false, error: 'Zadanie jest nadal przetwarzane.' }))
        expect(screen.getByRole('alert')).toHaveTextContent('Zadanie jest nadal przetwarzane.')
        expect(button).toBeEnabled()
        expect(get).toHaveBeenCalledTimes(1)
    })
    it('distinguishes an empty result from an error and recovers through refresh', async () => {
        get.mockResolvedValueOnce({ success: false, error: 'Nie można odczytać kolejki.' }).mockResolvedValue(ok({ total: 0, items: [] }))
        render(<Component />)
        expect(await screen.findByRole('alert')).toHaveTextContent('Nie można odczytać kolejki.')
        expect(screen.queryByText(empty)).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: refreshLabel }))
        await screen.findByText(empty)
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Następna strona' })).toBeDisabled()
    })
    it('recovers from transport failure without leaving controls pending', async () => {
        retry.mockRejectedValue(new Error('network unavailable'))
        render(<Component />)
        await screen.findByText(item.filename)
        fireEvent.click(screen.getByRole('button', { name: retryLabel }))
        await screen.findByRole('alert')
        expect(screen.getByRole('button', { name: retryLabel })).toBeEnabled()
        expect(screen.getByLabelText(filterLabel)).toBeEnabled()
    })
    it('ignores a stale response from an earlier mounted instance', async () => {
        let resolve!: (value: ReturnType<typeof ok>) => void
        get.mockImplementationOnce(() => new Promise(done => { resolve = done }))
        const first = render(<Component />)
        first.unmount()
        render(<Component />)
        await screen.findByText(item.filename)
        await act(async () => resolve(ok({ items: [{ ...item, filename: 'stary wynik.pdf' }] })))
        expect(screen.queryByText('stary wynik.pdf')).not.toBeInTheDocument()
    })
})

it('disables cleanup retry in report mode and explains when orphan retention starts', async () => {
    mocks.cleanupGet.mockResolvedValue(ok({ mode: 'report' }))
    render(<MaterialCleanupQueue />)
    await screen.findByText(item.filename)
    expect(screen.getByRole('button', { name: 'Ponów porządkowanie' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Zadanie wykonuje tylko raport')
    expect(screen.getByRole('status')).toHaveTextContent('30 dniach od pierwszego stwierdzenia braku użycia')
    expect(mocks.cleanupRetry).not.toHaveBeenCalled()
})

it('links a run asset to its run and warns when the scanner is unavailable', async () => {
    mocks.scanGet.mockResolvedValue(ok({ scannerConfigured: false, items: [{ ...item, runId: 'run' }] }))
    render(<MaterialScanQueue />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Otwórz szkolenie' })).toHaveAttribute('href', '/learning/edycje/run'))
    expect(screen.getByRole('status')).toHaveTextContent('Skaner nie jest skonfigurowany')
})

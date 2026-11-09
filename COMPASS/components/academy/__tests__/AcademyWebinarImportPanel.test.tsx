import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AcademyWebinarImportPanel } from '../sessions/AcademyWebinarImportPanel'
const mocks = vi.hoisted(() => ({ preview: vi.fn(), commit: vi.fn(), roster: vi.fn(), confirm: vi.fn(), refresh: vi.fn(), export: vi.fn(), exceptions: vi.fn(), excluded: vi.fn(), resolve: vi.fn(), setExcluded: vi.fn() }))
vi.mock('@/lib/actions/academy-webinar-import', () => ({ previewAcademyWebinarImport: mocks.preview, commitAcademyWebinarImport: mocks.commit, listAcademyWebinarRoster: mocks.roster, exportAcademyWebinarMailingList: mocks.export, verifyAcademyWebinarContractEmail: vi.fn(), cancelAcademyWebinarRegistration: vi.fn(), listAcademyWebinarExceptions: mocks.exceptions, listAcademyWebinarExcluded: mocks.excluded, resolveAcademyWebinarException: mocks.resolve, setAcademyWebinarExcluded: mocks.setExcluded }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [mocks.confirm, () => null] }))
function upload() {
 const file = new File(['Email\nexternal@example.test'], 'teams.csv', { type: 'text/csv' })
 Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('Email\nexternal@example.test').buffer })
 fireEvent.change(screen.getByLabelText('Plik raportu Teams'), { target: { files: [file] } })
}
beforeEach(() => {
 vi.clearAllMocks(); mocks.confirm.mockResolvedValue(true); mocks.roster.mockResolvedValue({ success: true, data: [] })
 mocks.exceptions.mockResolvedValue({ success: true, data: { available: true, items: [] } }); mocks.excluded.mockResolvedValue({ success: true, data: { available: true, items: [] } })
 vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) } })
 mocks.commit.mockResolvedValue({ success: true, data: { created: 96, linked: 1, attendance: 0, preserved: 0, alreadyCommitted: false } })
 mocks.preview.mockResolvedValue({ success: true, data: { id: 'batch', kind: 'registrations', expiresAt: '2030-01-01', rows: Array.from({ length: 96 }, (_, i) => ({ email: `person${i}@example.test`, fullName: `Person ${i}`, candidates: [], match: 'unmatched', userId: null, existing: false })) } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('webinar review before atomic import', () => {
 it('renders the full 96-row preview and commits only after explicit approval', async () => {
  render(<AcademyWebinarImportPanel runId="run" sessions={[]} readOnly={false} />); upload()
  expect(await screen.findByText('Person 95')).toBeInTheDocument(); expect(mocks.commit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Zatwierdź import' }))
  await waitFor(() => expect(mocks.commit).toHaveBeenCalledWith('batch', {})); expect(mocks.confirm).toHaveBeenCalledOnce()
  expect(await screen.findByRole('status')).toHaveTextContent('nowe osoby 96')
 })
 it('blocks ambiguous identity until administrator chooses an exact candidate or external roster', async () => {
  mocks.preview.mockResolvedValue({ success: true, data: { id: 'batch', kind: 'registrations', rows: [{ email: 'shared@example.test', fullName: 'Shared', candidates: [{ userId: 'user', fullName: 'Verified user' }], match: 'ambiguous', userId: null, existing: false }] } })
  render(<AcademyWebinarImportPanel runId="run" sessions={[]} readOnly={false} />); upload()
  const approve = await screen.findByRole('button', { name: 'Zatwierdź import' }); expect(approve).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Dopasowanie shared@example.test'), { target: { value: 'external' } }); expect(approve).toBeEnabled()
  fireEvent.click(approve); await waitFor(() => expect(mocks.commit).toHaveBeenCalledWith('batch', { 'shared@example.test': null }))
 })
 it('keeps preview for retry when import fails and reports the error', async () => {
  mocks.commit.mockResolvedValue({ success: false, error: 'Limit miejsc obejmuje webinar.' })
  render(<AcademyWebinarImportPanel runId="run" sessions={[]} readOnly={false} />); upload(); fireEvent.click(await screen.findByRole('button', { name: 'Zatwierdź import' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Limit miejsc'); expect(screen.getByText('Person 95')).toBeInTheDocument()
 })
 it('shows no file/import operation for canceled editions and requires completed actual window for attendance', () => {
  const { unmount } = render(<AcademyWebinarImportPanel runId="run" sessions={[]} readOnly={true} />)
  expect(screen.queryByLabelText('Plik raportu Teams')).not.toBeInTheDocument(); unmount()
  render(<AcademyWebinarImportPanel runId="run" sessions={[]} readOnly={false} />)
  fireEvent.change(screen.getByLabelText('Rodzaj raportu'), { target: { value: 'attendance' } })
  expect(screen.getByLabelText('Plik raportu Teams')).toBeDisabled()
 })
})
describe('wyjątki importu', () => {
 const exception = { kind: 'missing_email', rowNumber: 4, email: null, fullName: 'Gość bez adresu', message: 'Wiersz 4' }
 const stored = { id: 'e1', sessionId: 's1', kind: 'not_on_list', rowNumber: 2, email: 'obcy@example.test', fullName: 'Obcy', detail: 'x', connections: 2, status: 'open', note: null, resolvedAt: null }
 const person = { id: 'batch', kind: 'attendance', expiresAt: '2030-01-01', rows: [{ email: 'a@example.test', fullName: 'Anna', candidates: [], match: 'unmatched', userId: null, existing: false, attendedSeconds: 600 }] }
 const panel = () => render(<AcademyWebinarImportPanel runId="run" sessions={[]} readOnly={false} />)
 it('shows exceptions next to the importable rows and still allows approving them', async () => {
  mocks.preview.mockResolvedValue({ success: true, data: { ...person, exceptions: [exception], excludedCount: 2, exceptionsAvailable: true } })
  panel(); upload()
  expect(await screen.findByText('Gość bez adresu')).toBeInTheDocument()
  expect(screen.getByText(/Wyjątki: 1 · pominięci prowadzący i organizatorzy: 2/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Zatwierdź import' })).toBeEnabled()
 })
 it('explains a report without any address and offers nothing to approve', async () => {
  mocks.preview.mockResolvedValue({ success: true, data: { id: null, kind: 'attendance', expiresAt: null, rows: [], exceptions: [exception], excludedCount: 0, exceptionsAvailable: true } })
  panel(); upload()
  expect(await screen.findByRole('alert')).toHaveTextContent('spotkania z rejestracją')
  expect(screen.queryByRole('button', { name: 'Zatwierdź import' })).not.toBeInTheDocument()
 })
 it('requires a reason and a person from the list to assign attendance', async () => {
  mocks.exceptions.mockResolvedValue({ success: true, data: { available: true, items: [stored] } })
  mocks.roster.mockResolvedValue({ success: true, data: [{ id: 'r1', email: 'anna@example.test', fullName: 'Anna', userId: null, contractualEmail: null, status: 'confirmed', match: 'x', registrationStatus: null, attendance: [] }] })
  mocks.resolve.mockResolvedValue({ success: true, data: { status: 'assigned', attendedSeconds: 600 } })
  panel()
  fireEvent.click(await screen.findByRole('button', { name: 'Przypisz' }))
  expect(screen.getByLabelText('Uzasadnienie')).toBeRequired()
  expect(screen.getByLabelText(/Osoba z listy/)).toBeRequired()
  fireEvent.click(screen.getByRole('button', { name: 'Pokaż listę webinaru' }))
  await screen.findByRole('option', { name: 'Anna · anna@example.test' })
  fireEvent.change(screen.getByLabelText(/Osoba z listy/), { target: { value: 'roster:r1' } })
  fireEvent.change(screen.getByLabelText('Uzasadnienie'), { target: { value: 'Potwierdzone przez organizatora.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz decyzję' }))
  await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({ exceptionId: 'e1', decision: 'assign', note: 'Potwierdzone przez organizatora.', rosterId: 'r1', registrationId: undefined }))
 })
 it('offers only skipping when the row has no attendance time', async () => {
  mocks.exceptions.mockResolvedValue({ success: true, data: { available: true, items: [{ ...stored, connections: 0 }] } })
  panel()
  expect(await screen.findByRole('button', { name: 'Pomiń' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Przypisz' })).not.toBeInTheDocument()
 })
 it('says the feature waits for the migration instead of failing', async () => {
  mocks.exceptions.mockResolvedValue({ success: true, data: { available: false, items: [] } })
  mocks.excluded.mockResolvedValue({ success: true, data: { available: false, items: [] } })
  panel()
  expect(await screen.findByText(/po zastosowaniu migracji/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pokaż listę webinaru' })).toBeInTheDocument()
 })
 it('adds a trainer address to the exclusion list', async () => {
  mocks.setExcluded.mockResolvedValue({ success: true, data: undefined })
  panel()
  fireEvent.change(await screen.findByLabelText('Adres do wykluczenia'), { target: { value: 'trener@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj adres' }))
  await waitFor(() => expect(mocks.setExcluded).toHaveBeenCalledWith({ runId: 'run', email: 'trener@example.test', excluded: true }))
 })
})

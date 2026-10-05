import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AcademyWebinarImportPanel } from '../sessions/AcademyWebinarImportPanel'
const mocks = vi.hoisted(() => ({ preview: vi.fn(), commit: vi.fn(), roster: vi.fn(), confirm: vi.fn(), refresh: vi.fn(), export: vi.fn() }))
vi.mock('@/lib/actions/academy-webinar-import', () => ({ previewAcademyWebinarImport: mocks.preview, commitAcademyWebinarImport: mocks.commit, listAcademyWebinarRoster: mocks.roster, exportAcademyWebinarMailingList: mocks.export, verifyAcademyWebinarContractEmail: vi.fn(), cancelAcademyWebinarRegistration: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [mocks.confirm, () => null] }))
function upload() {
 const file = new File(['Email\nexternal@example.test'], 'teams.csv', { type: 'text/csv' })
 Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('Email\nexternal@example.test').buffer })
 fireEvent.change(screen.getByLabelText('Plik raportu Teams'), { target: { files: [file] } })
}
beforeEach(() => {
 vi.clearAllMocks(); mocks.confirm.mockResolvedValue(true); mocks.roster.mockResolvedValue({ success: true, data: [] })
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

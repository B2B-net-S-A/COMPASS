import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EditionSummary } from '../EditionSummary'
import { listAcademyWebinarRoster } from '@/lib/actions/academy-webinar-import'
import { getEditionSurveyReport } from '@/lib/actions/academy-surveys'
import type { AcademyRunDTO } from '@/lib/types/academy-sessions'
import type { EditionSurveyReport } from '@/lib/types/academy-surveys'

vi.mock('@/lib/actions/academy-webinar-import', () => ({ listAcademyWebinarRoster: vi.fn() }))
vi.mock('@/lib/actions/academy-surveys', () => ({ getEditionSurveyReport: vi.fn() }))
vi.mock('../EditionSummaryDownload', () => ({ EditionSummaryDownload: ({ text }: { text: string }) => <pre data-testid="download">{text}</pre> }))
const run = { id: 'run', courseTitle: 'Cybersecurity', title: 'Edycja 7.10', confirmedCount: 0, waitlistCount: 0, sessions: [] } as unknown as AcademyRunDTO
const survey: EditionSurveyReport = { responseCount: 0, overall: null, trainer: null, materials: null, materialsResponseCount: 0, nps: null, difficulty: { too_easy: 0, appropriate: 0, too_hard: 0 }, futureTopics: [], teachingInterests: [] }
beforeEach(() => {
    vi.mocked(listAcademyWebinarRoster).mockResolvedValue({ success: true, data: [] })
    vi.mocked(getEditionSurveyReport).mockResolvedValue({ success: true, data: survey })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('does not turn a failed private roster read into an empty report or export', async () => {
    vi.mocked(listAcademyWebinarRoster).mockResolvedValue({ success: false, error: 'Denied' })
    render(await EditionSummary({ run, participants: [] }))
    expect(screen.getByRole('alert')).toHaveTextContent('brak danych nie jest zerowym wynikiem')
    expect(screen.queryByTestId('download')).not.toBeInTheDocument()
})

it('does not export an inconsistent registration snapshot', async () => {
    render(await EditionSummary({ run: { ...run, confirmedCount: 96 }, participants: [] }))
    expect(screen.getByRole('alert')).toHaveTextContent('Lista zapisów zmieniła się')
    expect(screen.queryByTestId('download')).not.toBeInTheDocument()
})

it('exports survey coverage and absent ratings honestly without teaching-interest identities', async () => {
    vi.mocked(getEditionSurveyReport).mockResolvedValue({ success: true, data: { ...survey, teachingInterests: [{ userId: 'private-user', fullName: 'Private identity', proposedTopic: 'Topic', contactPreference: 'contract_email' }] } })
    render(await EditionSummary({ run, participants: [] }))
    const text = screen.getByTestId('download').textContent ?? ''
    expect(text).toContain('Ocena materiałów: brak odpowiedzi')
    expect(text).toContain('Deklaracje chęci prowadzenia: 1')
    expect(text).toContain('Osoby bez konta Compass nie odpowiadają')
    expect(text).not.toContain('Private identity')
    expect(text).not.toContain('private-user')
    expect(text).not.toContain('contract_email')
})


it('marks personal teaching-interest data unavailable in the TCM export instead of claiming zero', async () => {
    const aggregates = { ...survey }
    delete aggregates.teachingInterests
    vi.mocked(getEditionSurveyReport).mockResolvedValue({ success: true, data: aggregates })
    render(await EditionSummary({ run, participants: [] }))
    const text = screen.getByTestId('download').textContent ?? ''
    expect(text).toContain('Deklaracje chęci prowadzenia: dostępne tylko administratorowi')
    expect(text).not.toContain('Deklaracje chęci prowadzenia: 0')
})

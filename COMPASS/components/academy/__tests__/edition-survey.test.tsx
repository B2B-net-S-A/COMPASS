import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EditionSurveyForm, EditionSurveySettings } from '../EditionSurveyForm'
import { submitEditionSurvey, saveEditionSurveySettings } from '@/lib/actions/academy-surveys'
import type { EditionSurveyState } from '@/lib/types/academy-surveys'
vi.mock('@/lib/actions/academy-surveys', () => ({ submitEditionSurvey: vi.fn(), saveEditionSurveySettings: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
afterEach(() => { cleanup();vi.clearAllMocks() })
const state: EditionSurveyState = { eligible: true, submitted: false, settings: { introduction: 'October feedback', labels: { overall: 'Ocena Cybersecurity' } } }
it('submits separate live edition feedback with absent later materials and optional zero NPS', async () => {
    vi.mocked(submitEditionSurvey).mockResolvedValue({success:true,data:'response'})
    render(<EditionSurveyForm runId="october" state={state} />)
    fireEvent.change(screen.getByLabelText('Ocena Cybersecurity'), {target:{value:'5'}})
    fireEvent.change(screen.getByLabelText('Jak oceniasz prowadzącego?'), {target:{value:'4'}})
    fireEvent.change(screen.getByLabelText('Jak oceniasz poziom trudności?'), {target:{value:'appropriate'}})
    fireEvent.change(screen.getByLabelText('Czy polecisz szkolenie? 0–10 (opcjonalnie)'), {target:{value:'0'}})
    fireEvent.change(screen.getByLabelText('Czy chcesz poprowadzić własne szkolenie?'), {target:{value:'yes'}})
    fireEvent.change(screen.getByLabelText('Proponowany temat (opcjonalnie)'), {target:{value:'Pega'}})
    fireEvent.change(screen.getByLabelText('Preferencja kontaktu w sprawie prowadzenia'), {target:{value:'contract_email'}})
    fireEvent.submit(screen.getByRole('button',{name:'Wyślij ankietę tej edycji'}).closest('form')!)
    await waitFor(()=>expect(submitEditionSurvey).toHaveBeenCalledWith('october',expect.objectContaining({overall:5,trainer:4,materials:null,nps:0,willingToTeach:true,proposedTopic:'Pega',contactPreference:'contract_email'})))
    await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('ankieta tej edycji została zapisana'))
})
it('uses persisted submission and verified participation gate before showing fields', () => {
    const {rerender}=render(<EditionSurveyForm runId="october" state={{...state,eligible:false}} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/po potwierdzeniu Twojej obecności/)).toBeInTheDocument()
    rerender(<EditionSurveyForm key="submitted" runId="october" state={{...state,submitted:true}} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByLabelText('Ocena Cybersecurity')).not.toBeInTheDocument()
})
it('saves edition-specific introduction and questions', async () => {
    vi.mocked(saveEditionSurveySettings).mockResolvedValue({success:true,data:null})
    render(<EditionSurveySettings runId="october" state={state} />)
    fireEvent.change(screen.getByLabelText('Wprowadzenie'), {target:{value:'Dedicated Cybersecurity survey'}})
    fireEvent.submit(screen.getByRole('button',{name:'Zapisz pytania edycji',hidden:true}).closest('form')!)
    await waitFor(()=>expect(saveEditionSurveySettings).toHaveBeenCalledWith('october','Dedicated Cybersecurity survey',expect.objectContaining({overall:'Ocena Cybersecurity'})))
})

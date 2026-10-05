import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AcademyHandoverPanel } from '../AcademyHandoverPanel'
const actions = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), review: vi.fn() }))
vi.mock('@/lib/actions/academy-handover', () => ({ getAcademyHandover: actions.get, saveAcademyHandover: actions.save, reviewAcademyHandover: actions.review }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const files = [{id:'slides',filename:'Slides.pdf',mime_type:'application/pdf'},{id:'video',filename:'Module.mp4',mime_type:'video/mp4'},{id:'audio',filename:'Audio.mp3',mime_type:'audio/mpeg'}]
it('submits typed file categories and internal evidence for the selected edition', async () => {
 actions.get.mockResolvedValue({success:true,data:{handover:null,canReview:false,files}})
 actions.save.mockResolvedValue({success:true,data:{}})
 render(<AcademyHandoverPanel versionId="version" runId="run" />)
 await screen.findByText('Nowy pakiet')
 const checkboxes=screen.getAllByRole('checkbox')
 checkboxes.forEach(box=>fireEvent.click(box))
 fireEvent.change(screen.getByLabelText('Źródła montażowe na wspólnym dysku'),{target:{value:'https://firm.sharepoint.com/sources'}})
 fireEvent.change(screen.getByLabelText('Dowód przekazania praw'),{target:{value:'https://firm.sharepoint.com/rights'}})
 fireEvent.change(screen.getByLabelText('Data podpisania przekazania praw'),{target:{value:'2026-10-01'}})
 fireEvent.click(screen.getByRole('button',{name:'Przekaż kompletny pakiet do odbioru'}))
 await waitFor(()=>expect(actions.save).toHaveBeenCalledWith({versionId:'version',runId:'run',id:null,submit:true,items:{presentation:['slides'],participant_materials:['slides'],exercises:['slides'],modular_video:['video'],audio:['audio']},sourceUrl:'https://firm.sharepoint.com/sources',rightsUrl:'https://firm.sharepoint.com/rights',rightsSignedOn:'2026-10-01'}))
})
it('requires an independent reviewer for submitted metadata and locks editing', async () => {
 actions.get.mockResolvedValue({success:true,data:{handover:{id:'receipt',status:'submitted',material_ids:{},contributors:['self']},canReview:false,files}})
 render(<AcademyHandoverPanel versionId="version" />)
 await screen.findByText('Oczekuje na odbiór')
 expect(screen.getByText(/Pakiet musi odebrać niezależny administrator/)).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Potwierdź odbiór pakietu'})).toBeNull()
 expect(screen.getAllByRole('checkbox')[0]).toBeDisabled()
})

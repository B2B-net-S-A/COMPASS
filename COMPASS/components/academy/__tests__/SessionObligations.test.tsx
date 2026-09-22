import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AcademySessionForm } from '../sessions/AcademySessionForm'
import { AcademyRunDetail } from '../sessions/AcademyRunDetail'
import type { AcademyRunDTO, AcademySessionDTO } from '@/lib/types/academy-sessions'

const mocks=vi.hoisted(()=>({save:vi.fn(),replace:vi.fn(),refresh:vi.fn(),complete:vi.fn(),cancelRun:vi.fn(),cancelSession:vi.fn()}))
vi.mock('@/lib/actions/academy-sessions',()=>({saveAcademySession:mocks.save,replaceAcademySession:mocks.replace,confirmAcademySessionWindow:vi.fn(),cancelAcademyRegistration:vi.fn(),cancelAcademyRun:mocks.cancelRun,cancelAcademySession:mocks.cancelSession,publishAcademyRun:vi.fn(),registerAcademyRun:vi.fn(),updateAcademyRun:vi.fn()}))
vi.mock('@/lib/actions/course-learning',()=>({completeAcademyCourse:mocks.complete}))
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh})}))
vi.mock('@/components/shared/ConfirmDialog',()=>({useConfirm:()=>[vi.fn(),()=>null]}))
vi.mock('../sessions/AcademyAttendancePanel',()=>({AcademyAttendancePanel:()=>null}))
const session:AcademySessionDTO={id:'session',runId:'run',title:'Required workshop',startsAt:'2030-01-02T10:00:00Z',endsAt:'2030-01-02T11:00:00Z',timeZone:'UTC',mode:'external_link',required:true,status:'scheduled',joinUrl:'https://teams.microsoft.com/meet/123',syncStatus:'ready',organizerId:null,actualStartsAt:null,actualEndsAt:null,attendanceWindowConfirmed:false}
const props={runId:'run',runPublished:true,organizers:[],managedTeamsAvailable:false,onSaved:vi.fn(),onCancel:vi.fn()}
beforeEach(()=>{vi.clearAllMocks();mocks.save.mockResolvedValue({success:true,data:'session'});mocks.replace.mockResolvedValue({success:true,data:'replacement'})})
afterEach(cleanup)
function setNewDates(){fireEvent.change(screen.getByLabelText('Początek'),{target:{value:'2030-01-03T10:00'}});fireEvent.change(screen.getByLabelText('Koniec'),{target:{value:'2030-01-03T11:00'}})}
describe('Published session obligations',()=>{
 it('locks the requirement and organizer mode while preserving required on a date edit',async()=>{
  render(<AcademySessionForm {...props} initial={session}/>);
  expect(screen.getByRole('checkbox')).toBeDisabled();expect(screen.getByRole('checkbox')).toBeChecked();expect(screen.getByLabelText('Sposób organizacji')).toBeDisabled();
  setNewDates();fireEvent.click(screen.getByRole('button',{name:'Zapisz zmiany'}));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalled());expect(mocks.save.mock.calls[0][0]).toMatchObject({id:'session',required:true,mode:'external_link',startsAt:'2030-01-03T10:00:00.000Z'});expect(mocks.replace).not.toHaveBeenCalled();
 });
 it('allows only an optional additional meeting after publication',async()=>{
  render(<AcademySessionForm {...props}/>);
  expect(screen.getByRole('checkbox')).toBeDisabled();expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.change(screen.getByLabelText('Nazwa spotkania'),{target:{value:'Optional questions'}});setNewDates();fireEvent.change(screen.getByLabelText('Link do spotkania Teams'),{target:{value:'https://teams.microsoft.com/meet/456'}});
  fireEvent.click(screen.getByRole('button',{name:'Dodaj spotkanie'}));await waitFor(()=>expect(mocks.save).toHaveBeenCalled());expect(mocks.save.mock.calls[0][0].required).toBe(false);
 });
 it('requires a fresh link, reason and explicit external cancellation for replacement, preserving the obligation',async()=>{
  render(<AcademySessionForm {...props} replacementFor={{...session,status:'cancelled',canReplace:true}}/>);
  expect(screen.getByLabelText('Link do spotkania Teams')).toHaveValue('');expect(screen.getByLabelText('Sposób organizacji')).not.toBeDisabled();
  setNewDates();fireEvent.change(screen.getByLabelText('Link do spotkania Teams'),{target:{value:'https://teams.microsoft.com/meet/456'}});fireEvent.change(screen.getByLabelText('Uzasadnienie zastępstwa'),{target:{value:'Trener uzgodnił nowy termin'}});
  fireEvent.click(screen.getByLabelText('Potwierdzam odwołanie poprzedniego spotkania u zewnętrznego organizatora Teams.'));fireEvent.click(screen.getByRole('button',{name:'Zaplanuj zastępstwo'}));
  await waitFor(()=>expect(mocks.replace).toHaveBeenCalled());expect(mocks.replace.mock.calls[0][0]).toMatchObject({sessionId:'session',reason:'Trener uzgodnił nowy termin',externalCancellationConfirmed:true,session:{required:true,externalJoinUrl:'https://teams.microsoft.com/meet/456'}});expect(mocks.replace.mock.calls[0][0].session.id).toBeUndefined();expect(mocks.save).not.toHaveBeenCalled();
 });
 it('shows the outstanding cancelled obligation and withholds replacement until cancellation is acknowledged',()=>{
  const run:AcademyRunDTO={id:'run',courseId:'course',versionId:'version',versionNumber:1,courseTitle:'Course',courseSlug:'course',title:'Run',capacity:3,status:'published',confirmedCount:1,waitlistCount:0,canManage:true,canPublish:false,myRegistration:null,sessions:[{...session,status:'cancelled',mode:'managed_teams',syncStatus:'error',canReplace:false}]};
  render(<AcademyRunDetail run={run} participants={[]} organizers={[]} managedTeamsAvailable={false} userId="trainer" now="2029-01-01T00:00:00Z"/>);
  expect(screen.getByText(/Obowiązek uczestnictwa pozostaje niespełniony/)).toBeInTheDocument();expect(screen.getByText(/Zastępstwo będzie dostępne po potwierdzeniu odwołania/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Zaplanuj zastępstwo'})).not.toBeInTheDocument();
 });
 it('never presents a revoked completion as a downloadable certificate',()=>{
  const run:AcademyRunDTO={id:'run',courseId:'course',versionId:'version',versionNumber:1,courseTitle:'Course',courseSlug:'course',title:'Run',capacity:3,status:'published',confirmedCount:1,waitlistCount:0,canManage:false,canPublish:false,myRegistration:{id:'registration',status:'confirmed',enrollmentId:'enrollment',completedAt:'2026-09-01T12:00:00Z',completionRevokedAt:'2026-09-02T12:00:00Z',completionRevokedReason:'Błędnie potwierdzona obecność'},sessions:[]};
  render(<AcademyRunDetail run={run} participants={[]} organizers={[]} managedTeamsAvailable={false} userId="student" now="2026-09-22T00:00:00Z"/>);
  expect(screen.getByText(/Zaliczenie zostało unieważnione/)).toHaveTextContent('Błędnie potwierdzona obecność');expect(screen.queryByRole('link',{name:'Pobierz certyfikat'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Sprawdź ukończenie'})).toBeDisabled();
 });
 it.each(['session','run'] as const)('distinguishes Compass cancellation from the external Teams host action (%s)',async(kind)=>{
  mocks.cancelRun.mockResolvedValue({success:true,data:undefined});mocks.cancelSession.mockResolvedValue({success:true,data:undefined});
  const run:AcademyRunDTO={id:'run',courseId:'course',versionId:'version',versionNumber:1,courseTitle:'Course',courseSlug:'course',title:'Run',capacity:3,status:'published',confirmedCount:1,waitlistCount:0,canManage:true,canPublish:false,myRegistration:null,sessions:[session]};
  render(<AcademyRunDetail run={run} participants={[]} organizers={[]} managedTeamsAvailable={false} userId="trainer" now="2029-01-01T00:00:00Z"/>);
  fireEvent.click(screen.getByRole('button',{name:kind==='session'?'Odwołaj spotkanie':'Odwołaj edycję'}));
  expect(screen.getByText(/Compass nie odwołuje spotkań w zewnętrznym Teams/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Powód odwołania'),{target:{value:'Trener przełożył warsztat'}});
  fireEvent.click(screen.getByRole('button',{name:'Potwierdź odwołanie'}));
  await waitFor(()=>expect(kind==='session'?mocks.cancelSession:mocks.cancelRun).toHaveBeenCalledWith(kind==='session'?{sessionId:'session',reason:'Trener przełożył warsztat'}:{runId:'run',reason:'Trener przełożył warsztat'}));
  expect(await screen.findByRole('status')).toHaveTextContent(kind==='session'?'Odwołano w Compass; odwołaj też spotkanie u gospodarza Teams.':'Odwołano edycję w Compass; odwołaj też zewnętrzne spotkania u ich gospodarzy Teams.');
 });
})

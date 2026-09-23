import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { academyManagedTeamsConfiguration, academyAttendanceRetentionConfiguration, createAcademyIntegrationPorts, runAcademyDatabaseSync } from '../db-worker'

const id='11111111-1111-4111-8111-111111111111'
const validEnv={NODE_ENV:'test' as const,ACADEMY_TEAMS_ENABLED:'true',AZURE_TENANT_ID:id,AZURE_CLIENT_ID:id,AZURE_CLIENT_SECRET:'test-only-placeholder'}
const job={id,sessionId:id,leaseToken:id,revision:1,attempt:1,kind:'sync_meeting' as const}
const session={
    id,revision:1,approved:true,published:true,cancelled:false,mode:'managed_teams',organizerEnabled:true,
    attendanceWindowConfirmed:true,meeting:null,onlineMeetingId:null,externalJoinUrl:null,
    input:{sessionId:id,organizer:{tenantId:id,userId:id},subject:'Session',startDateTime:'2026-09-22T10:00:00+00:00',
        endDateTime:'2026-09-22T11:00:00+00:00',timeZone:'UTC',attendees:[{email:'learner@example.test',name:null}]},
    attendanceWindow:{start:'2026-09-22T10:00:00+00:00',end:'2026-09-22T11:00:00+00:00'},
    attendanceThresholdPercent:80,participants:[],
}
function mockClient(data:unknown,error:null|{code:string;message:string}=null) {
    const rpc=vi.fn(async()=>({data,error}))
    return {rpc,client:{rpc} as unknown as SupabaseClient}
}
describe('Academy durable worker boundary',()=>{
    it('is disabled by default and does not infer consent from credentials',()=>{
        expect(academyManagedTeamsConfiguration({NODE_ENV:'test'}).managedTeamsAvailable).toBe(false)
        expect(academyManagedTeamsConfiguration({...validEnv,ACADEMY_TEAMS_ENABLED:undefined}).managedTeamsAvailable).toBe(false)
        expect(academyManagedTeamsConfiguration({...validEnv,AZURE_CLIENT_SECRET:''}).managedTeamsAvailable).toBe(false)
        expect(academyManagedTeamsConfiguration(validEnv)).toEqual({managedTeamsAvailable:true})
    })
    it('dispatches external-link reminders while Microsoft writes remain disabled',async()=>{
        const {client,rpc}=mockClient(7)
        const result=await runAcademyDatabaseSync({client,env:{NODE_ENV:'test'}})
        expect(result).toMatchObject({managedTeamsEnabled:false,notifications:7,claimed:0})
        expect(rpc).toHaveBeenCalledExactlyOnceWith('academy_dispatch_reminders',{p_limit:500})
    })
    it('retains raw evidence by default and accepts only an explicit bounded policy',()=>{
        expect(academyAttendanceRetentionConfiguration({NODE_ENV:'test'}).rawAttendanceRetentionDays).toBeNull()
        expect(academyAttendanceRetentionConfiguration({NODE_ENV:'test',ACADEMY_ATTENDANCE_RETENTION_DAYS:'1'}).rawAttendanceRetentionDays).toBeNull()
        expect(academyAttendanceRetentionConfiguration({NODE_ENV:'test',ACADEMY_ATTENDANCE_RETENTION_DAYS:'90days'}).rawAttendanceRetentionDays).toBeNull()
        expect(academyAttendanceRetentionConfiguration({NODE_ENV:'test',ACADEMY_ATTENDANCE_RETENTION_DAYS:'90'})).toEqual({rawAttendanceRetentionDays:90})
    })
    it('runs configured retention independently of the Microsoft feature gate',async()=>{
        const {client,rpc}=mockClient(2)
        const result=await runAcademyDatabaseSync({client,env:{NODE_ENV:'test',ACADEMY_ATTENDANCE_RETENTION_DAYS:'90'}})
        expect(result).toMatchObject({managedTeamsEnabled:false,retentionConfigured:true,rawReportsPurged:2})
        expect(rpc).toHaveBeenCalledWith('academy_purge_attendance_reports',{p_retention_days:90})
    })
    it('still claims Teams jobs and reports failure when reminders fail',async()=>{
        const rpc=vi.fn(async(name:string)=>{
            if(name==='academy_dispatch_reminders') return {data:null,error:{code:'PGRST000',message:'private diagnostic'}}
            if(name==='academy_claim_jobs') return {data:[],error:null}
            return {data:0,error:null}
        })
        const result=await runAcademyDatabaseSync({client:{rpc} as unknown as SupabaseClient,env:validEnv})
        expect(rpc).toHaveBeenCalledWith('academy_claim_jobs',expect.any(Object))
        expect(result).toMatchObject({managedTeamsEnabled:true,claimed:0,notifications:null,rawReportsPurged:0,failedOperations:['reminders']})
        expect(JSON.stringify(result)).not.toContain('private diagnostic')
    })
    it('keeps reminders and Teams independent of retention failure',async()=>{
        const rpc=vi.fn(async(name:string)=>{
            if(name==='academy_purge_attendance_reports') return {data:null,error:{code:'PGRST000',message:'private diagnostic'}}
            if(name==='academy_claim_jobs') return {data:[],error:null}
            return {data:2,error:null}
        })
        const result=await runAcademyDatabaseSync({client:{rpc} as unknown as SupabaseClient,env:{...validEnv,ACADEMY_ATTENDANCE_RETENTION_DAYS:'90'}})
        expect(result).toMatchObject({managedTeamsEnabled:true,notifications:2,rawReportsPurged:null,retentionConfigured:true,failedOperations:['retention']})
        expect(rpc).toHaveBeenCalledWith('academy_claim_jobs',expect.any(Object))
    })
    it('reports an integration claim failure after reminders still run',async()=>{
        const rpc=vi.fn(async(name:string)=>{
            if(name==='academy_claim_jobs') return {data:null,error:{code:'PGRST000',message:'private diagnostic'}}
            return {data:3,error:null}
        })
        const result=await runAcademyDatabaseSync({client:{rpc} as unknown as SupabaseClient,env:validEnv})
        expect(result).toMatchObject({managedTeamsEnabled:true,notifications:3,failedOperations:['integration']})
        expect(JSON.stringify(result)).not.toContain('private diagnostic')
    })
    it('rejects malformed claims before any Graph operation',async()=>{
        const {client}=mockClient([{...job,revision:-1}])
        await expect(createAcademyIntegrationPorts(client).claim({workerId:'worker',limit:1,leaseSeconds:180})).rejects.toMatchObject({code:'invalid_response'})
    })
    it('validates trusted DB context and accepts PostgreSQL offset timestamps',async()=>{
        const {client}=mockClient(session)
        expect(await createAcademyIntegrationPorts(client).loadSession(job)).toMatchObject({input:{attendees:[{email:'learner@example.test',name:undefined}]}})
    })
    it('allows cancellation but rejects creation after organizer is disabled',async()=>{
        const {client}=mockClient({...session,organizerEnabled:false})
        await expect(createAcademyIntegrationPorts(client).loadSession(job)).rejects.toMatchObject({code:'configuration'})
        await expect(createAcademyIntegrationPorts(client).loadSession({...job,kind:'cancel_meeting'})).resolves.toBeTruthy()
    })
    it('does not collect attendance before the teaching window is confirmed',async()=>{
        const {client}=mockClient({...session,attendanceWindowConfirmed:false})
        await expect(createAcademyIntegrationPorts(client).loadSession({...job,kind:'sync_attendance'})).rejects.toMatchObject({code:'invalid_input'})
    })
    it('retries serialization failures without exposing DB PII',async()=>{
        const {client}=mockClient(null,{code:'40001',message:'raw private email and URL'})
        await expect(createAcademyIntegrationPorts(client).isLeaseCurrent(job)).rejects.toMatchObject({code:'unavailable',retryable:true,message:'academy_integration:unavailable'})
    })
    it('preserves only allowlisted invitation configuration codes without leaking DB details',async()=>{
        for(const [message,code] of [
            ['academy_invitation_address_ambiguous','invitation_address_ambiguous'],
            ['academy_invitation_address_missing','invitation_address_missing'],
            ['academy_invitation_address_shared','invitation_address_shared'],
        ]) {
            const {client}=mockClient(null,{code:'P0001',message})
            await expect(createAcademyIntegrationPorts(client).loadSession(job)).rejects.toMatchObject({code,retryable:false})
        }
        const {client}=mockClient(null,{code:'P0001',message:'private@example.test'})
        await expect(createAcademyIntegrationPorts(client).loadSession(job)).rejects.toMatchObject({code:'configuration',message:'academy_integration:configuration'})
    })
    it('passes the exact lease token when atomically acknowledging results',async()=>{
        const {client,rpc}=mockClient(null)
        await createAcademyIntegrationPorts(client).complete(job,{kind:'meeting_cancelled'})
        expect(rpc).toHaveBeenCalledWith('academy_complete_job',{p_job_id:id,p_lease_token:id,p_outcome:{kind:'meeting_cancelled'}})
    })
})

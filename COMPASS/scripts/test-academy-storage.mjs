// Hosted-only integration: production TUS transport against native Supabase Auth/Storage.
// This intentionally does not start Next.js and does not claim a full schema replay.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { uploadAcademyFile } from '../lib/academy/resumable-upload.ts';
import { assertHostedStorage, localStatus, installAcademyStorageFixture, appendStorageReport } from './lib/academy-storage-gate.mjs';

assertHostedStorage();
const settings=localStatus(fs.readFileSync(process.env.ACADEMY_STORAGE_STATUS_FILE,'utf8'));
let stage='fixture_install', checks=0, sql;
const passed=[];
const nativeFetch=globalThis.fetch;
const memory=new Map();
const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)}});
const guardedFetch=(url,init={})=>{
    assert.equal(new URL(typeof url==='string'?url:url instanceof URL?url.href:url.url).origin,settings.api,'external_network_forbidden');
    return nativeFetch(url,{...init,redirect:'error',signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
};
const client=key=>createClient(settings.api,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:guardedFetch}});
const service=client(settings.service), anonymous=client(settings.anon);
const ok=(result,label)=>{if(result.error)throw new Error(`${label}:${result.error.code??result.error.statusCode??'request_failed'}`);return result.data;};
const rpc=async(c,name,args={})=>ok(await c.rpc(name,args),name);
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const fails=async(request,label)=>{const result=await request;assert(result.error,label);checks++;return result;};
async function review(admin,versionId){
    const version=ok(await admin.from('course_versions').select('submission_id').eq('id',versionId).single(),'read_review_submission');
    assert(version.submission_id);
    return rpc(admin,'academy_review_course',{p_version_id:versionId,p_approve:true,p_reason:null,p_submission_id:version.submission_id});
}
const digest=buffer=>createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
const milestone=name=>{passed.push(name);console.log(JSON.stringify({check:name,outcome:'passed'}));};
const bytes=new Uint8Array(7*1024*1024+113);bytes.fill(65);bytes.set(new TextEncoder().encode('%PDF-1.7\n'));
const small=new TextEncoder().encode('%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
async function signed(c,asset){return ok(await c.storage.from('academy-materials').createSignedUploadUrl(asset.storage_path,{upsert:false}),'sign_upload').token;}
async function upload(asset,body,token,userId,{abortAfterChunk=false,mime=asset.mime_type}={}){
    const controller=new AbortController(),calls=[];
    globalThis.fetch=async(url,init)=>{
        calls.push({method:init?.method??'GET',offset:new Headers(init?.headers).get('Upload-Offset'),size:init?.body instanceof Blob?init.body.size:0});
        return guardedFetch(url,init);
    };
    try {
        const request=uploadAcademyFile({file:new File([body],asset.filename,{type:mime}),endpoint:`${settings.api}/storage/v1/upload/resumable/sign`,token,storagePath:asset.storage_path,assetId:asset.id,userId,mimeType:mime,signal:controller.signal,onProgress:percent=>{if(abortAfterChunk&&percent>0&&percent<100)controller.abort();}});
        if(abortAfterChunk){await assert.rejects(request);checks++;}else await request;
        return calls;
    } finally {globalThis.fetch=nativeFetch;}
}
async function reserve(c,course,lesson,name,body=small){return rpc(c,'academy_reserve_material',{p_course_id:course.course_id,p_lesson_id:lesson,p_filename:name,p_mime_type:'application/pdf',p_size_bytes:body.length,p_file_modified_at:0});}
async function finish(c,asset){await rpc(c,'academy_finish_material_upload',{p_asset_id:asset.id});}
async function scan(asset,body){
    // Trust boundary deliberately isolated: malware behavior has its own real ClamAV job.
    // Here a trusted scanner verifies actual stored bytes and records a successful scan.
    const file=ok(await service.storage.from('academy-materials').download(asset.storage_path),'scanner_read');
    equal(digest(await file.arrayBuffer()),digest(body));
    const [claim]=await rpc(service,'academy_claim_material_scan');equal(claim.id,asset.id);
    equal(await rpc(service,'academy_accept_material_scan',{p_asset_id:asset.id,p_scan_started_at:claim.scan_started_at,p_sha256:digest(body),p_error:null}),true);
}
async function cannotDownload(c,asset,label){
    await fails(c.storage.from('academy-materials').download(asset.storage_path),`${label}_download`);
    await fails(c.storage.from('academy-materials').createSignedUrl(asset.storage_path,60),`${label}_sign`);
}
async function canDownload(c,asset,body){
    const file=ok(await c.storage.from('academy-materials').download(asset.storage_path),'authorized_download');equal(digest(await file.arrayBuffer()),digest(body));
    const signedUrl=ok(await c.storage.from('academy-materials').createSignedUrl(asset.storage_path,60),'authorized_sign').signedUrl;
    const response=await guardedFetch(signedUrl);equal(response.status,200);equal(digest(await response.arrayBuffer()),digest(body));
}
try {
    sql=await installAcademyStorageFixture(settings);
    stage='native_auth';
    const people={};
    for(const role of ['admin','trainer','learner','other']){
        const email=`academy-${role}-${randomUUID()}@example.test`,password=`LocalOnly!${randomUUID()}`;
        const user=ok(await service.auth.admin.createUser({email,password,email_confirm:true}),'create_synthetic_user').user;
        assert(user);const c=client(settings.anon);
        const session=ok(await c.auth.signInWithPassword({email,password}),'native_sign_in').session;
        assert(session?.access_token);equal(ok(await c.auth.getUser(),'native_validate_token').user.id,user.id);
        await sql.query('insert into public.profiles(id,email,full_name,role)values($1,$2,$3,$4)',[user.id,email,role,role==='admin'?'admin':'consultant']);
        people[role]={id:user.id,client:c};
    }
    const admin=people.admin.client,trainer=people.trainer.client,learner=people.learner.client,other=people.other.client;
    // Bounded schema-cache readiness without bypassing user authentication.
    for(let attempt=0;attempt<30;attempt++){
        const result=await admin.rpc('academy_set_rollout',{p_mode:'open',p_user_ids:[]});
        if(!result.error)break;
        if(attempt===29)ok(result,'schema_cache_ready');
        await new Promise(resolve=>setTimeout(resolve,250));
    }
    await rpc(admin,'academy_set_trainer',{p_user_id:people.trainer.id,p_enabled:true});
    milestone('native_auth_password_sign_in_and_authenticated_rpc');
    stage='course_fixture_through_user_api';
    const course=await rpc(trainer,'academy_create_course',{p_input:{title:'Hosted Storage training',category:'IT',completion_rules:{quiz_required:false,quiz_pass_percent:80,require_all_lessons:true,attendance_percent:80}}});
    // create_course uses defaults; set the explicit no-quiz program through the author RPC.
    await rpc(trainer,'academy_update_course',{p_course_id:course.course_id,p_patch:{completion_rules:{quiz_required:false,quiz_pass_percent:80,require_all_lessons:true,attendance_percent:80}}});
    const lessons=ok(await trainer.from('course_lessons').insert([0,1].map(index=>({course_id:course.course_id,version_id:course.version_id,title:`Lesson ${index+1}`,order_index:index,content_md:'Hosted integration fixture.',unlock_after_days:index===1?2:0}))).select('id,order_index'),'author_lessons').sort((a,b)=>a.order_index-b.order_index);
    equal(lessons.length,2);
    await fails(learner.rpc('academy_reserve_material',{p_course_id:course.course_id,p_lesson_id:lessons[0].id,p_filename:'forged.pdf',p_mime_type:'application/pdf',p_size_bytes:small.length,p_file_modified_at:0}),'learner_cannot_reserve');
    stage='real_tus_interrupt_resume';
    const asset=await reserve(trainer,course,lessons[0].id,'resumable.pdf',bytes);
    await fails(learner.storage.from('academy-materials').createSignedUploadUrl(asset.storage_path,{upsert:false}),'learner_cannot_sign_foreign_upload');
    const token=await signed(trainer,asset);
    const interrupted=await upload(asset,bytes,token,people.trainer.id,{abortAfterChunk:true});
    equal(interrupted.filter(call=>call.method==='POST').length,1);
    equal(interrupted.find(call=>call.method==='PATCH').size,6*1024*1024);
    assert(memory.has(`academy-upload:${people.trainer.id}:${asset.id}`));checks++;
    // Bytes are incomplete: neither browser finalize nor learner access can succeed.
    await fails(trainer.rpc('academy_finish_material_upload',{p_asset_id:asset.id}),'partial_finalize_denied');
    await cannotDownload(learner,asset,'partial_learner');
    const resumed=await upload(asset,bytes,token,people.trainer.id);
    equal(resumed[0].method,'HEAD');equal(resumed.filter(call=>call.method==='POST').length,0);
    equal(resumed.find(call=>call.method==='PATCH').offset,String(6*1024*1024));
    equal(memory.has(`academy-upload:${people.trainer.id}:${asset.id}`),false);
    milestone('real_tus_fixed_6mib_interrupt_head_resume');
    stage='lost_finalization_recovery';
    const recovered=await reserve(trainer,course,lessons[0].id,'resumable.pdf',bytes);
    equal(recovered.id,asset.id);equal(recovered.status,'quarantined');
    await cannotDownload(learner,asset,'quarantined_learner');
    await cannotDownload(trainer,asset,'quarantined_author');
    await fails(trainer.rpc('academy_accept_material_scan',{p_asset_id:asset.id,p_scan_started_at:new Date().toISOString(),p_sha256:digest(bytes),p_error:null}),'author_cannot_scan');
    await scan(asset,bytes);
    milestone('lost_browser_finalization_recovers_same_asset_and_scan_lease');
    stage='storage_final_byte_validation';
    for(const scenario of ['size','mime']){
        const invalid=await reserve(trainer,course,lessons[0].id,`wrong-${scenario}.pdf`,scenario==='size'?new Uint8Array(small.length+1):small);
        const signature=await signed(trainer,invalid);
        await assert.rejects(upload(invalid,small,signature,people.trainer.id,{mime:scenario==='mime'?'text/vtt':'application/pdf'}));checks++;
        await fails(trainer.rpc('academy_finish_material_upload',{p_asset_id:invalid.id}),'mismatch_finalize_denied');
        equal((await sql.query("select count(*)::int n from storage.objects where bucket_id='academy-materials' and name=$1",[invalid.storage_path])).rows[0].n,0);
        await rpc(trainer,'academy_discard_material',{p_asset_id:invalid.id});
    }
    const revoked=await reserve(trainer,course,lessons[0].id,'revoked-grant.pdf',bytes), revokedToken=await signed(trainer,revoked);
    await upload(revoked,bytes,revokedToken,people.trainer.id,{abortAfterChunk:true});
    await rpc(admin,'academy_set_trainer',{p_user_id:people.trainer.id,p_enabled:false});
    // The pre-existing signed token cannot commit after the live capability is revoked.
    const revokedUploadUrl=memory.get(`academy-upload:${people.trainer.id}:${revoked.id}`);assert(revokedUploadUrl);
    const revokedCommit=await guardedFetch(revokedUploadUrl,{method:'PATCH',headers:{'Tus-Resumable':'1.0.0','x-signature':revokedToken,'Content-Type':'application/offset+octet-stream','Upload-Offset':String(6*1024*1024)},body:bytes.slice(6*1024*1024)});
    equal(revokedCommit.ok,false);
    await fails(trainer.rpc('academy_finish_material_upload',{p_asset_id:revoked.id}),'revoked_finalize_denied');
    equal((await sql.query("select count(*)::int n from storage.objects where bucket_id='academy-materials' and name=$1",[revoked.storage_path])).rows[0].n,0);
    await rpc(admin,'academy_set_trainer',{p_user_id:people.trainer.id,p_enabled:true});
    await rpc(trainer,'academy_discard_material',{p_asset_id:revoked.id});
    milestone('real_storage_rejects_size_mime_and_revoked_grant_at_finalization');
    stage='lesson_rls_downloads';
    const delayed=await reserve(trainer,course,lessons[1].id,'delayed.pdf');
    await upload(delayed,small,await signed(trainer,delayed),people.trainer.id);await finish(trainer,delayed);await scan(delayed,small);
    await rpc(trainer,'academy_submit_for_review',{p_course_id:course.course_id});
    await review(admin,course.version_id);
    const enrollment=await rpc(learner,'academy_enroll',{p_course_id:course.course_id,p_version_id:null});
    await canDownload(learner,asset,bytes);await cannotDownload(other,asset,'unenrolled');await cannotDownload(anonymous,asset,'anonymous');
    await cannotDownload(learner,delayed,'drip_locked');
    await rpc(learner,'academy_mark_lesson_complete',{p_enrollment_id:enrollment,p_lesson_id:lessons[0].id});
    await cannotDownload(learner,delayed,'drip_waiting');
    // Time is the sole synthetic learner-state adjustment; do not bypass the download decision.
    await sql.query("update course_enrollments set lesson_completion_dates=jsonb_build_object($2::text,now()-interval '3 days') where id=$1",[enrollment,lessons[0].id]);
    await canDownload(learner,delayed,small);
    const completion=await rpc(learner,'academy_mark_lesson_complete',{p_enrollment_id:enrollment,p_lesson_id:lessons[1].id});
    equal(completion.completion.completed,true);
    equal((await sql.query('select count(*)::int n from course_completions where enrollment_id=$1',[enrollment])).rows[0].n,1);
    milestone('native_storage_download_and_sign_follow_lesson_enrollment_and_drip');
    stage='run_scoped_ready_review';
    const live=await rpc(trainer,'academy_create_course',{p_input:{title:'Hosted live material scope',category:'IT',delivery_mode:'live'}});
    await rpc(trainer,'academy_update_course',{p_course_id:live.course_id,p_patch:{completion_rules:{quiz_required:false,quiz_pass_percent:80,require_all_lessons:false,attendance_percent:80}}});
    await rpc(trainer,'academy_submit_for_review',{p_course_id:live.course_id});await review(admin,live.version_id);
    async function makeRun(title){
        const run=await rpc(trainer,'academy_create_run',{p_input:{courseId:live.course_id,versionId:live.version_id,title,capacity:3}});
        await rpc(trainer,'academy_save_session',{p_input:{runId:run,title:'Fixture meeting metadata',startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),timeZone:'UTC',mode:'external_link',externalJoinUrl:'https://teams.microsoft.com/meet/123456789',required:true}});
        await rpc(admin,'academy_publish_run',{p_run_id:run});return run;
    }
    const run=await makeRun('Learner run'),otherRun=await makeRun('Other run');
    await rpc(learner,'academy_register_run',{p_run_id:run});await rpc(other,'academy_register_run',{p_run_id:otherRun});
    const runAsset=await rpc(trainer,'academy_reserve_run_material',{p_run_id:run,p_filename:'run-notes.pdf',p_mime_type:'application/pdf',p_size_bytes:small.length,p_file_modified_at:0});
    await upload(runAsset,small,await signed(trainer,runAsset),people.trainer.id);await finish(trainer,runAsset);await scan(runAsset,small);
    await cannotDownload(learner,runAsset,'run_not_reviewed');
    await fails(trainer.rpc('academy_review_run_material',{p_asset_id:runAsset.id,p_decision:'approve',p_note:null}),'author_cannot_publish_run_material');
    await rpc(admin,'academy_review_run_material',{p_asset_id:runAsset.id,p_decision:'approve',p_note:null});
    await canDownload(learner,runAsset,small);await cannotDownload(other,runAsset,'different_run_same_course');
    await rpc(learner,'academy_cancel_registration',{p_run_id:run});await cannotDownload(learner,runAsset,'cancelled_registration');
    await rpc(admin,'academy_review_run_material',{p_asset_id:runAsset.id,p_decision:'withdraw',p_note:'Fixture review withdrawal'});
    await cannotDownload(other,runAsset,'withdrawn_material');
    milestone('native_storage_run_isolation_moderation_and_cancellation');
    appendStorageReport({outcome:'passed',assertions:checks,passed,realAuth:true,realStorage:true,realTus:true,fullHistoricalReplay:'separate_manual_history_audit',limits:['Canonical Academy dependencies only; unrelated application schemas and full database restoration are outside this gate.','Native auth and storage schemas/functions/grants were preserved.','Trusted scanner verdict is simulated here; real ClamAV has a separate gate.','No Next.js/browser or production deployment proof; app routes have separate unit/UI gates.','Previously issued signed download URLs remain valid until their short expiry.']});
} catch(error) {
    // Never emit response bodies, URLs, keys, auth sessions, SQL parameters or raw logs.
    const code=typeof error?.code==='string'&&/^[A-Z0-9_]{1,12}$/.test(error.code)?error.code:null;
    appendStorageReport({outcome:'failed',stage,assertions:checks,passed,errorType:error?.name??'Error',code,detail:typeof error?.message==='string'&&/^[a-zA-Z0-9_:.-]{1,128}$/.test(error.message)?error.message:null,fullHistoricalReplay:'separate_manual_history_audit'});
    process.exitCode=1;
} finally {
    globalThis.fetch=nativeFetch;
    if(originalStorage)Object.defineProperty(globalThis,'localStorage',originalStorage);else delete globalThis.localStorage;
    if(sql)await sql.end();
}

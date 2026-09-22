/* eslint-disable no-console -- Standalone SQL verification reports its assertions and failures. */
import assert from 'node:assert/strict';
import {createAcademyDatabase} from './lib/academy-db-fixture.mjs';
process.on('uncaughtException',e=>{console.error({error:e.message,where:e.where,stack:e.stack});process.exit(1)});
const f=await createAcademyDatabase({cleanup:true});
const {sql,actor,rpc,ids,db,service}=f;
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
const denied=async(...args)=>{await f.expectDenied(...args);checks++};
await actor('admin');await rpc('academy_set_trainer',[ids.trainer,true]);
await actor('trainer');
const c=await rpc('academy_create_course',[{title:'Retention course',category:'IT',completion_rules:{quiz_required:false,require_all_lessons:true}}]);
let lesson=(await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Lesson',0,'Material') returning id",[c.course_id,c.version_id])).rows[0].id;
async function reserve(name){await actor('trainer');return rpc('academy_reserve_material',[c.course_id,name,'application/pdf',100,0,lesson]);}
const expired=await reserve('old.pdf');
const fresh=await reserve('fresh.pdf');
await f.owner();await sql("update course_materials set created_at=now()-interval '49 hours' where id=$1",[expired.id]);
await actor('student');
await denied('select academy_material_cleanup_report()');
await denied('select academy_claim_material_cleanup()');
await denied('select academy_finish_material_cleanup($1,$2,null)',[expired.id,expired.id]);
await denied('select academy_retry_material_cleanup($1)',[expired.id],/admin_required/);
await service();
await denied('select academy_claim_material_cleanup(1,30)',[],/invalid_retention_policy/);
eq((await rpc('academy_material_cleanup_report')).eligible,1);
const claim=async()=> (await sql('select to_jsonb(x) item from academy_claim_material_cleanup() x')).rows[0]?.item;
const a=await claim();eq(a.id,expired.id);eq(a.status,'rejected');
eq(await claim(),undefined); // fresh lease is exclusive
await denied("insert into storage.objects(bucket_id,name,version,owner_id,metadata) values('academy-materials',$1,'late',$2,$3)",[a.storage_path,ids.trainer,{size:100,mimetype:'application/pdf'}],/immutable_stored_material/);
eq(await rpc('academy_finish_material_cleanup',[a.id,fresh.id,null]),false);
eq(await rpc('academy_finish_material_cleanup',[a.id,a.cleanup_token,null]),true);
eq(await rpc('academy_finish_material_cleanup',[a.id,a.cleanup_token,null]),false);
eq((await rpc('academy_material_cleanup_report')).purged,1);
eq((await sql('select sum(size_bytes)::int n from course_materials where uploaded_by=$1 and purged_at is null',[ids.trainer])).rows[0].n,100);
eq((await sql("select count(*)::int n from academy_audit_events where action='MATERIAL_PURGED'")).rows[0].n,1);

// Uploaded bytes stay charged until the Storage API has actually removed metadata.
const stored=await reserve('stored.pdf');
await service();await sql("insert into storage.objects(bucket_id,name,version,owner_id,metadata) values('academy-materials',$1,'real-version',$2,$3)",[stored.storage_path,ids.trainer,{size:100,mimetype:'application/pdf'}]);
await f.owner();await sql("update course_materials set created_at=now()-interval '49 hours' where id=$1",[stored.id]);
await service();const uploaded=await claim();
await denied('select academy_finish_material_cleanup($1,$2,null)',[uploaded.id,uploaded.cleanup_token],/material_cleanup_not_confirmed/);
eq(await rpc('academy_finish_material_cleanup',[uploaded.id,uploaded.cleanup_token,'network']),true);
eq((await sql('select purged_at from course_materials where id=$1',[uploaded.id])).rows[0].purged_at,null);
await f.owner();await sql("update course_materials set cleanup_claimed_at=now()-interval '16 minutes' where id=$1",[uploaded.id]);
await service();const retry=await claim();assert.notEqual(retry.cleanup_token,uploaded.cleanup_token);checks++;
eq(await rpc('academy_finish_material_cleanup',[uploaded.id,uploaded.cleanup_token,null]),false);
await sql("delete from storage.objects where bucket_id='academy-materials' and name=$1",[uploaded.storage_path]);
eq(await rpc('academy_finish_material_cleanup',[uploaded.id,retry.cleanup_token,null]),true);

// An asset referenced by any lesson, including an older version, is never a candidate.
const linked=await reserve('history.pdf');
await service();await sql("insert into storage.objects(bucket_id,name,version,owner_id,metadata) values('academy-materials',$1,'linked-version',$2,$3)",[linked.storage_path,ids.trainer,{size:100,mimetype:'application/pdf'}]);
await actor('trainer');await rpc('academy_finish_material_upload',[linked.id]);
await service();const scan=(await sql('select to_jsonb(x) item from academy_claim_material_scan() x')).rows[0].item;
eq(await rpc('academy_accept_material_scan',[linked.id,scan.scan_started_at,'a'.repeat(64),null]),true);
await f.owner();await sql("update course_materials set retention_changed_at=now()-interval '31 days' where id=$1",[linked.id]);
await service();eq((await rpc('academy_material_cleanup_report')).eligible,0);eq(await claim(),undefined);
// Old READY bytes detached today start a NEW grace period; reports never initialize it.
const savedAttachments=(await sql('select attachments from course_lessons where id=$1',[lesson])).rows[0].attachments;
await actor('trainer');await sql("update course_lessons set attachments='[]' where id=$1",[lesson]);
await service();eq((await rpc('academy_material_cleanup_report')).eligible,0);
eq((await sql('select orphaned_since from course_materials where id=$1',[linked.id])).rows[0].orphaned_since,null);
eq(await claim(),undefined);
assert((await sql("select orphaned_since > now()-interval '1 minute' recent from course_materials where id=$1",[linked.id])).rows[0].recent);checks++;
await f.owner();await sql("update course_materials set orphaned_since=now()-interval '30 days'+interval '1 hour' where id=$1",[linked.id]);
await service();eq((await rpc('academy_material_cleanup_report')).eligible,0);eq(await claim(),undefined);
await f.owner();await sql("update course_materials set orphaned_since=now()-interval '30 days'-interval '1 hour' where id=$1",[linked.id]);
await service();eq((await rpc('academy_material_cleanup_report')).eligible,1);
await actor('trainer');await sql('update course_lessons set attachments=$2 where id=$1',[lesson,JSON.stringify(savedAttachments)]);
await service();eq((await sql('select orphaned_since from course_materials where id=$1',[linked.id])).rows[0].orphaned_since,null);eq(await claim(),undefined);
await actor('trainer');await sql("update course_lessons set attachments='[]' where id=$1",[lesson]);
await service();eq(await claim(),undefined);
assert((await sql("select orphaned_since > now()-interval '1 minute' recent from course_materials where id=$1",[linked.id])).rows[0].recent);checks++;
await actor('trainer');await sql('update course_lessons set attachments=$2 where id=$1',[lesson,JSON.stringify(savedAttachments)]);
await actor('trainer');await rpc('academy_discard_material',[fresh.id]);await rpc('academy_submit_for_review',[c.course_id]);
await actor('admin');await rpc('academy_review_course',[c.version_id,true,null]);
await actor('trainer');const next=await rpc('academy_begin_draft',[c.course_id]);lesson=(await sql('select id from course_lessons where version_id=$1',[next])).rows[0].id;
await service();eq(await claim(),undefined);

// Exhausted deletion retries require an auditable admin action.
const exhausted=await reserve('exhausted.pdf');
await f.owner();await sql("update course_materials set created_at=now()-interval '49 hours' where id=$1",[exhausted.id]);
await service();const bad=await claim();
await f.owner();await sql("update course_materials set cleanup_attempts=5,cleanup_claimed_at=now()-interval '16 minutes' where id=$1",[bad.id]);
await service();eq(await claim(),undefined);eq((await rpc('academy_material_cleanup_report')).failed,1);
await actor('admin');await rpc('academy_retry_material_cleanup',[bad.id]);
await service();const last=await claim();eq(last.id,bad.id);
eq(await rpc('academy_finish_material_cleanup',[bad.id,last.cleanup_token,null]),true);
eq((await sql('select count(*)::int n from course_materials where id=$1',[bad.id])).rows[0].n,1);
await denied("update course_materials set status='uploading' where id=$1",[bad.id],/purged_material_immutable/);
// Prove actual reservation behavior, not only the quota aggregate.
await actor('admin');await rpc('academy_set_trainer',[ids.other,true]);
await actor('other');const quotaCourse=await rpc('academy_create_course',[{title:'Quota recovery',category:'IT'}]);
const quotaLesson=(await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Quota',0,'Content') returning id",[quotaCourse.course_id,quotaCourse.version_id])).rows[0].id;
let quotaFirst;
for(let i=0;i<10;i++){
 const q=await rpc('academy_reserve_material',[quotaCourse.course_id,'q'+i+'.mp4','video/mp4',1073741824,0,quotaLesson]);
 if(!quotaFirst)quotaFirst=q;
 await rpc('academy_discard_material',[q.id]);
}
await denied('select academy_reserve_material($1,$2,$3,100,0,$4)',[quotaCourse.course_id,'extra.pdf','application/pdf',quotaLesson],/10 GB/);
await f.owner();await sql("update course_materials set retention_changed_at=now()-interval '31 days' where id=$1",[quotaFirst.id]);
await service();const quotaClaim=await claim();eq(quotaClaim.id,quotaFirst.id);
eq(await rpc('academy_finish_material_cleanup',[quotaClaim.id,quotaClaim.cleanup_token,null]),true);
await actor('other');
const recovered=await rpc('academy_reserve_material',[quotaCourse.course_id,'extra.pdf','application/pdf',100,0,quotaLesson]);
eq(recovered.size_bytes,100);

// Published and withdrawn run materials remain historical references, regardless of age.
await actor('trainer');const live=await rpc('academy_create_course',[{title:'Run retention',category:'IT',delivery_mode:'live',completion_rules:{quiz_required:false,require_all_lessons:false,attendance_percent:80}}]);
await rpc('academy_submit_for_review',[live.course_id]);await actor('admin');await rpc('academy_review_course',[live.version_id,true,null]);
await actor('trainer');const liveRun=await rpc('academy_create_run',[{courseId:live.course_id,versionId:live.version_id,title:'Retention edition',capacity:10}]);
await rpc('academy_save_session',[{runId:liveRun,title:'Workshop',startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),timeZone:'Europe/Warsaw',mode:'external_link',externalJoinUrl:'https://teams.microsoft.com/meet/123456789?p=secret',required:true}]);
await actor('admin');await rpc('academy_publish_run',[liveRun]);
await actor('trainer');const runAsset=await rpc('academy_reserve_run_material',[liveRun,'recording.pdf','application/pdf',100,0]);
await service();await sql("insert into storage.objects(bucket_id,name,version,owner_id,metadata) values('academy-materials',$1,'run-version',$2,$3)",[runAsset.storage_path,ids.trainer,{size:100,mimetype:'application/pdf'}]);
await actor('trainer');await rpc('academy_finish_material_upload',[runAsset.id]);
await service();const runScan=(await sql('select to_jsonb(x) item from academy_claim_material_scan() x')).rows[0].item;
eq(await rpc('academy_accept_material_scan',[runAsset.id,runScan.scan_started_at,'b'.repeat(64),null]),true);
await actor('admin');await rpc('academy_review_run_material',[runAsset.id,'approve',null]);
for(const status of ['published','withdrawn']){
 if(status==='withdrawn'){await actor('admin');await rpc('academy_review_run_material',[runAsset.id,'withdraw','Historical material withdrawn']);}
 await f.owner();await sql("update course_materials set retention_changed_at=now()-interval '31 days',orphaned_since=now()-interval '31 days' where id=$1",[runAsset.id]);
 await service();eq((await rpc('academy_material_cleanup_report')).eligible,0);eq(await claim(),undefined);
 eq((await sql('select orphaned_since from course_materials where id=$1',[runAsset.id])).rows[0].orphaned_since,null);
}

// Independent hosted connections prove attach-first skips and claim-first prevents attachment.
if(f.engine==='postgres'){
 await actor('trainer');const raceCourse=await rpc('academy_create_course',[{title:'Reference cleanup race',category:'IT'}]);
 const raceLesson=(await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Race',0,'Material') returning id",[raceCourse.course_id,raceCourse.version_id])).rows[0].id;
 const raceAsset=await rpc('academy_reserve_material',[raceCourse.course_id,'race.pdf','application/pdf',100,0,raceLesson]);
 await service();await sql("insert into storage.objects(bucket_id,name,version,owner_id,metadata) values('academy-materials',$1,'race-version',$2,$3)",[raceAsset.storage_path,ids.trainer,{size:100,mimetype:'application/pdf'}]);
 await actor('trainer');await rpc('academy_finish_material_upload',[raceAsset.id]);
 await service();const raceScan=(await sql('select to_jsonb(x) item from academy_claim_material_scan() x')).rows[0].item;
 await rpc('academy_accept_material_scan',[raceAsset.id,raceScan.scan_started_at,'c'.repeat(64),null]);
 const attachments=(await sql('select attachments from course_lessons where id=$1',[raceLesson])).rows[0].attachments;
 await actor('trainer');await sql("update course_lessons set attachments='[]' where id=$1",[raceLesson]);
 await f.owner();await sql("update course_materials set orphaned_since=now()-interval '31 days' where id=$1",[raceAsset.id]);
 const author=await f.connectSession('trainer'),worker=await f.connectSession('','service_role');
 try{
  await author.db.exec('BEGIN');
  await author.sql('update course_lessons set attachments=$2 where id=$1',[raceLesson,JSON.stringify(attachments)]);
  eq((await worker.sql('select id from academy_claim_material_cleanup()')).rows,[]);
  await author.db.exec('COMMIT');
  eq((await worker.sql('select id from academy_claim_material_cleanup()')).rows,[]);
  await author.sql("update course_lessons set attachments='[]' where id=$1",[raceLesson]);
  await f.owner();await sql("update course_materials set orphaned_since=now()-interval '31 days' where id=$1",[raceAsset.id]);
  await worker.db.exec('BEGIN');eq((await worker.sql('select id from academy_claim_material_cleanup()')).rows[0].id,raceAsset.id);
  const pid=(await author.sql('select pg_backend_pid() pid')).rows[0].pid;
  const attaching=author.sql('update course_lessons set attachments=$2 where id=$1',[raceLesson,JSON.stringify(attachments)]).then(value=>({value}),error=>({error}));
  let blocked=false;
  for(let i=0;i<100;i++){blocked=(await sql('select cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked;if(blocked)break;await new Promise(resolve=>setTimeout(resolve,10));}
  await worker.db.exec('COMMIT');const outcome=await attaching;
  eq(blocked,true);assert.match(outcome.error?.message??'',/Załącznik jest niedostępny/);checks++;
  eq((await sql('select attachments from course_lessons where id=$1',[raceLesson])).rows[0].attachments,[]);
 }finally{await author.db.exec('ROLLBACK');await worker.db.exec('ROLLBACK');await Promise.all([author.db.close(),worker.db.close()]);}
}else console.log('Link-versus-cleanup races require independent hosted PostgreSQL sessions.');
console.log('PASS '+checks+' material retention SQL checks ('+f.engine+')');
await db.close();

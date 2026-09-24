import assert from 'node:assert/strict';
import {createAcademyDatabase} from './lib/academy-db-fixture.mjs';
process.on('uncaughtException',e=>{console.error({error:e.message,where:e.where,stack:e.stack});process.exit(1)});
const f=await createAcademyDatabase({runMaterials:true,materialProjection:true});
const {db,sql,ids,actor,service,rpc}=f;
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
const denied=async(...args)=>{await f.expectDenied(...args);checks++};
await actor('admin');await rpc('academy_set_trainer',[ids.trainer,true]);await rpc('academy_set_trainer',[ids.other,true]);
await actor('trainer');
const c=await rpc('academy_create_course',[{title:'Run material program',category:'IT',delivery_mode:'live',completion_rules:{quiz_required:false,require_all_lessons:false,attendance_percent:80}}]);
await rpc('academy_submit_for_review',[c.course_id]);
await actor('admin');await rpc('academy_review_course',[c.version_id,true,null]);
async function createRun(title){
  await actor('trainer');
  const run=await rpc('academy_create_run',[{courseId:c.course_id,versionId:c.version_id,title,capacity:2}]);
  await rpc('academy_save_session',[{runId:run,title:'Meeting',startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),timeZone:'Europe/Warsaw',mode:'external_link',externalJoinUrl:'https://teams.microsoft.com/meet/123456789',required:true}]);
  await actor('admin');await rpc('academy_publish_run',[run]);return run;
}
const run=await createRun('First run');const second=await createRun('Second run');
await actor('student');const registration=await rpc('academy_register_run',[run]);
await actor('other');await rpc('academy_register_run',[second]);
await actor('trainer');
const reserve=(name='Recording.mp4')=>rpc('academy_reserve_run_material',[run,name,'video/mp4',100,0]);
const asset=await reserve();
eq(asset.version_id,c.version_id);eq(asset.run_id,run);eq(asset.lesson_id,null);eq(asset.review_status,'pending_review');
eq((await reserve()).id,asset.id);
await denied('select academy_review_run_material($1,$2,null)',[asset.id,'approve'],/admin_required/);
await actor('student');await denied('select academy_reserve_run_material($1,$2,$3,100,0)',[run,'forged.mp4','video/mp4']);
await denied('select id from course_materials where run_id=$1',[run],/permission denied/);
eq((await sql('select id from academy_material_catalog where run_id=$1',[run])).rows.length,0);
await actor('trainer');
await db.exec('BEGIN');
await sql("insert into storage.objects(bucket_id,name,version,owner,owner_id,metadata)values('academy-materials',$1,'1',$2::uuid,$2::text,'{\"contentLength\":2}')",[asset.storage_path,ids.trainer]);
await db.exec('ROLLBACK');checks++;
const store="insert into storage.objects(bucket_id,name,version,owner,owner_id,metadata)values('academy-materials',$1,gen_random_uuid()::text,$2::uuid,$2::text,$3)";
async function scan(a, uploader=ids.trainer) {
  await service();await sql(store,[a.storage_path,uploader,{size:100,mimetype:'video/mp4'}]);
  await actor(uploader);await rpc('academy_finish_material_upload',[a.id]);
  await service();const job=(await sql('select to_jsonb(scan) asset from academy_claim_material_scan() scan')).rows[0].asset;
  eq(job.id,a.id);
  eq(await rpc('academy_accept_material_scan',[a.id,job.scan_started_at,'a'.repeat(64),null]),true);
}
await scan(asset);
await actor('student');eq(await rpc('academy_can_read_asset',[asset.id]),false);
eq((await sql("select name from storage.objects where bucket_id='academy-materials'")).rows.length,0);
await actor('trainer');eq(await rpc('academy_can_read_asset',[asset.id]),true);
await denied("update course_materials set review_status='published' where id=$1",[asset.id]);
await actor('admin');await rpc('academy_review_run_material',[asset.id,'approve','Internal reviewer note']);
await actor('student');eq(await rpc('academy_can_read_asset',[asset.id]),true);
eq((await sql('select review_note,uploaded_by,scan_error from academy_material_catalog where id=$1',[asset.id])).rows[0],{review_note:null,uploaded_by:null,scan_error:null});
await denied('select review_note,sha256 from course_materials where id=$1',[asset.id],/permission denied/);
eq((await sql("select name from storage.objects where bucket_id='academy-materials'")).rows.length,1);
await actor('trainer');eq((await sql('select review_note,uploaded_by from academy_material_catalog where id=$1',[asset.id])).rows[0],{review_note:'Internal reviewer note',uploaded_by:ids.trainer});
await actor('other');eq(await rpc('academy_can_read_asset',[asset.id]),false); // same course, different run
eq((await sql('select id from academy_material_catalog where id=$1',[asset.id])).rows.length,0);
await f.owner();const notifications=(await sql("select count(*)::int n from notifications where type='document_uploaded'")).rows[0].n;
await actor('admin');await rpc('academy_review_run_material',[asset.id,'approve',null]);
await f.owner();eq((await sql("select count(*)::int n from notifications where type='document_uploaded'")).rows[0].n,notifications);
eq(notifications,1);

// A later program and upload for this run do not migrate the enrolled group.
await actor('trainer');const draft=await rpc('academy_begin_draft',[c.course_id]);
const pending=await reserve('Next recording.mp4');
await rpc('academy_submit_for_review',[c.course_id]);
await actor('admin');await rpc('academy_review_course',[draft,true,null]);
await actor('student');
eq((await sql('select version_id from course_enrollments where id=$1',[registration.enrollmentId])).rows[0].version_id,c.version_id);
eq(await rpc('academy_can_read_asset',[asset.id]),true);
await actor('trainer');await rpc('academy_discard_material',[pending.id]);

// Decisions are audited, cannot be silently reversed, and withdrawals cut new downloads.
await actor('admin');
await denied('select academy_review_run_material($1,$2,$3)',[asset.id,'withdraw','x'],/rejection_reason_required/);
await rpc('academy_review_run_material',[asset.id,'withdraw','Replaced with corrected recording']);
await denied('select academy_review_run_material($1,$2,null)',[asset.id,'approve']);
await actor('student');eq(await rpc('academy_can_read_asset',[asset.id]),false);
eq((await sql("select name from storage.objects where bucket_id='academy-materials'")).rows.length,0);

// Facilitator may upload for the assigned run, but cannot author the program or self-publish.
await actor('trainer');await rpc('academy_set_run_staff',[run,ids.other,true]);
await actor('other');const co=await reserve('Facilitator recording.mp4');
eq(co.uploaded_by,ids.other);
await actor('trainer');await rpc('academy_set_run_staff',[run,ids.other,false]);
await service();await denied(store,[co.storage_path,ids.other,{size:100,mimetype:'video/mp4'}],/material_authorization_changed/);
await actor('trainer');await rpc('academy_set_run_staff',[run,ids.other,true]);
await scan(co,ids.other);
await actor('admin');await rpc('academy_review_run_material',[co.id,'approve',null]);
await actor('student');eq(await rpc('academy_can_read_asset',[co.id]),true);
await rpc('academy_cancel_registration',[run]);
eq(await rpc('academy_can_read_asset',[co.id]),false);

// Admin upload requires a different reviewer; no content becomes public by role alone.
await actor('admin');const own=await reserve('Admin upload.mp4');await scan(own,ids.admin);
await actor('admin');await denied('select academy_review_run_material($1,$2,null)',[own.id,'approve'],/inny administrator/);
await denied('select academy_can_lead_run_as($1,$2)',[run,ids.other]);

// Hosted PostgreSQL proves operations serialize against a concurrent cancellation.
if(f.engine==='postgres'){
  for(const operation of ['review','finalize','finish']){
    const racingRun=await createRun('Material race '+operation);
    await actor('trainer');
    const racingAsset=await rpc('academy_reserve_run_material',[racingRun,'race.mp4','video/mp4',100,0]);
    if(operation==='review') await scan(racingAsset);
    if(operation==='finish'){ await service();await sql(store,[racingAsset.storage_path,ids.trainer,{size:100,mimetype:'video/mp4'}]); }
    const canceller=await f.connectSession('trainer');
    const contender=await f.connectSession(operation==='review'?'admin':operation==='finalize'?'':'trainer',operation==='finalize'?'service_role':'authenticated');
    await contender.sql("set statement_timeout='10s'");
    await canceller.db.exec('BEGIN');
    await canceller.rpc('academy_cancel_run',[racingRun,'Cancellation during material action']);
    const pid=(await contender.sql('select pg_backend_pid() pid')).rows[0].pid;
    const request=(operation==='review'
      ? contender.rpc('academy_review_run_material',[racingAsset.id,'approve',null])
      : operation==='finish' ? contender.rpc('academy_finish_material_upload',[racingAsset.id])
      : contender.sql(store,[racingAsset.storage_path,ids.trainer,{size:100,mimetype:'video/mp4'}]))
      .then(value=>({value}),error=>({error}));
    await f.owner();
    let blocked=false;
    for(let i=0;i<100;i++){
      blocked=(await sql('select cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked;
      if(blocked)break;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    await canceller.db.exec('COMMIT');
    const result=await request;
    eq(blocked,true);assert(result.error,'Concurrent '+operation+' must reject after cancellation');checks++;
    await Promise.all([canceller.db.close(),contender.db.close()]);
  }
}

// A signed reservation cannot finish after archive, even with the trusted Storage write.
await actor('trainer');const archived=await reserve('Archive race.mp4');
await actor('student');await rpc('academy_register_run',[run]);
eq(await rpc('academy_can_read_asset',[co.id]),true);
await actor('admin');await rpc('academy_archive_course',[c.course_id]);
await rpc('academy_review_run_material',[co.id,'withdraw','Withdraw archived course material']);
eq((await sql('select review_status from academy_material_catalog where id=$1',[co.id])).rows[0].review_status,'withdrawn');
await actor('student');eq(await rpc('academy_can_read_asset',[co.id]),false);
await service();await denied(store,[archived.storage_path,ids.trainer,{size:100,mimetype:'video/mp4'}],/material_authorization_changed/);
console.log('PASS '+checks+' run material moderation and isolation assertions');
await db.close();

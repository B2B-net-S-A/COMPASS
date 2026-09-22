// Asset, quarantine, version and Storage RLS contract; no network or real files.
import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';
process.on('uncaughtException', error => {
    console.error({ error: error.message, where: error.where, query: error.query });
    process.exit(1);
});
const fixture = await createAcademyDatabase({ materials:true });
const {db,ids,sql,actor,owner,service,rpc} = fixture;
let checks=0;
async function denied(...args){await fixture.expectDenied(...args);checks++;}
await actor('admin');await rpc('academy_set_trainer',[ids.trainer,true]);
await actor('trainer');
const course=await rpc('academy_create_course',[{title:'Materials course',category:'IT',completion_rules:{quiz_required:false,quiz_pass_percent:80,require_all_lessons:true,attendance_percent:80}}]);
const lessons=[];
for(let i=0;i<2;i++)lessons.push((await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md,unlock_after_days)values($1,$2,$3,$4,'Material lesson',$5)returning id",[course.course_id,course.version_id,`Lesson ${i}`,i,i===1?2:0])).rows[0].id);
await denied('select academy_reserve_material($1,$2,$3,$4,0,$5)',[course.course_id,'large.pdf','application/pdf',52428801,lessons[1]]);
await denied('select academy_reserve_material($1,$2,$3,$4,0,$5)',[course.course_id,'../bad.pdf','application/pdf',100,lessons[1]]);
await denied('select academy_reserve_material($1,$2,$3,$4,0,$5)',[course.course_id,'bad.exe','application/octet-stream',100,lessons[1]]);
const asset=await rpc('academy_reserve_material',[course.course_id,'Training.pdf','application/pdf',100,0,lessons[1]]);
assert.equal((await rpc('academy_reserve_material',[course.course_id,'Training.pdf','application/pdf',100,0,lessons[1]])).id,asset.id);checks++;
await denied('select academy_finish_material_upload($1)',[asset.id]);
await denied('select academy_submit_for_review($1)',[course.course_id]);
await actor('student');await denied('select academy_reserve_material($1,$2,$3,$4,0,$5)',[course.course_id,'Training.pdf','application/pdf',100,lessons[1]]);
await denied("insert into storage.objects(bucket_id,name,metadata)values('academy-materials',$1,'{\"size\":100}')",[asset.storage_path]);
assert.equal((await sql('select * from course_materials where id=$1',[asset.id])).rows.length,0);checks++;
await actor('trainer');
// Real Storage first probes permissions with a synthetic version, then rolls back.
await db.exec('BEGIN');
await sql("insert into storage.objects(bucket_id,name,version,owner,owner_id,metadata)values('academy-materials',$1,'1',$2::uuid,$2::text,'{\"contentLength\":2,\"mimetype\":\"application/json\"}')",[asset.storage_path,ids.trainer]);
await db.exec('ROLLBACK');checks++;
await service();
const storeObject="insert into storage.objects(bucket_id,name,version,owner,owner_id,metadata)values('academy-materials',$1,gen_random_uuid()::text,$2::uuid,$2::text,$3)";
await denied(storeObject,[asset.storage_path,ids.trainer,{size:99,mimetype:'application/pdf'}],/stored_material_mismatch/);
await denied(storeObject,[asset.storage_path,ids.trainer,{size:100,mimetype:'text/html'}],/stored_material_mismatch/);
await denied(storeObject,[asset.storage_path,ids.student,{size:100,mimetype:'application/pdf'}],/stored_material_mismatch/);
await sql(storeObject,[asset.storage_path,ids.trainer,{size:100,mimetype:'application/pdf'}]);checks++;
await actor('trainer');await rpc('academy_finish_material_upload',[asset.id]);
assert.equal((await sql('select status from course_materials where id=$1',[asset.id])).rows[0].status,'quarantined');checks++;
assert.equal((await sql("select * from storage.objects where bucket_id='academy-materials'")).rows.length,0);checks++;
await denied('select academy_claim_material_scan()');
await denied('select academy_accept_material_scan($1,now(),$2,null)',[asset.id,'a'.repeat(64)]);
await service();const claimed=(await sql('select to_jsonb(scan) asset from academy_claim_material_scan() scan')).rows[0].asset;
assert.equal(claimed.id,asset.id);checks++;
assert.equal(await rpc('academy_accept_material_scan',[asset.id,'2000-01-01T00:00:00Z','a'.repeat(64),null]),false);checks++;
assert.equal(await rpc('academy_accept_material_scan',[asset.id,claimed.scan_started_at,'a'.repeat(64),null]),true);checks++;
assert.equal(await rpc('academy_accept_material_scan',[asset.id,claimed.scan_started_at,'b'.repeat(64),null]),false);checks++;
assert.equal((await sql('select attachments from course_lessons where id=$1',[lessons[1]])).rows[0].attachments[0].asset_id,asset.id);checks++;
await denied('update storage.objects set version=gen_random_uuid()::text where name=$1',[asset.storage_path],/immutable_stored_material/);
await denied('update course_lessons set title=$1 where id=$2',['Worker edited title',lessons[1]]);
await denied("insert into course_lessons(course_id,version_id,title,order_index)values($1,$2,'Worker insert',2)",[course.course_id,course.version_id]);
await actor('trainer');const attachment={asset_id:asset.id,storage_path:asset.storage_path,name:asset.filename,mime_type:asset.mime_type,size_bytes:asset.size_bytes};
await denied('update course_lessons set attachments=$1 where id=$2',[JSON.stringify([{...attachment,storage_path:'wrong/path'}]),lessons[1]]);
await denied('update course_lessons set attachments=$1 where id=$2',[JSON.stringify([{...attachment,mime_type:'text/html'}]),lessons[1]]);
const foreign=await rpc('academy_create_course',[{title:'Foreign asset course',category:'IT'}]);
await denied("insert into course_lessons(course_id,version_id,title,order_index,attachments)values($1,$2,'Foreign',0,$3)",[foreign.course_id,foreign.version_id,JSON.stringify([attachment])]);
await rpc('academy_submit_for_review',[course.course_id]);
await service();await denied('update course_lessons set attachments=$1 where id=$2',['[]',lessons[1]]);
await actor('admin');await rpc('academy_review_course',[course.version_id,true,null]);
await actor('student');const enrollment=await rpc('academy_enroll',[course.course_id,null]);
assert.equal(await rpc('academy_can_read_asset',[asset.id]),false);checks++;
assert.equal((await sql("select * from storage.objects where bucket_id='academy-materials'")).rows.length,0);checks++;
await rpc('academy_mark_lesson_complete',[enrollment,lessons[0]]);
assert.equal(await rpc('academy_can_read_asset',[asset.id]),false);checks++;
await owner();await sql("update course_enrollments set lesson_completion_dates=jsonb_build_object($2::text,now()-interval '3 days')where id=$1",[enrollment,lessons[0]]);
await actor('student');assert.equal(await rpc('academy_can_read_asset',[asset.id]),true);checks++;
assert.equal((await sql("select * from storage.objects where bucket_id='academy-materials'")).rows.length,1);checks++;
// Existing broad Storage policies must not grant academy mutation or legacy access.
await owner();await db.exec("create policy fixture_broad_storage on storage.objects for all to authenticated using(true)with check(true)");
await actor('student');assert.equal((await sql("update storage.objects set metadata='{}' where name=$1 returning id",[asset.storage_path])).rows.length,0);checks++;
assert.equal((await sql('delete from storage.objects where name=$1 returning id',[asset.storage_path])).rows.length,0);checks++;
await denied("insert into storage.objects(bucket_id,name,metadata)values('documents','courses/forged.pdf','{}')");
await actor('other');assert.equal((await sql('select * from storage.objects where name=$1',[asset.storage_path])).rows.length,0);checks++;
await actor('trainer');const next=await rpc('academy_begin_draft',[course.course_id]);
assert.equal((await sql('select attachments from course_lessons where version_id=$1 and order_index=1',[next])).rows[0].attachments[0].asset_id,asset.id);checks++;
await rpc('academy_submit_for_review',[course.course_id]);await actor('admin');await rpc('academy_review_course',[next,true,null]);
await actor('student');assert.equal(await rpc('academy_can_read_asset',[asset.id]),true);checks++;
await actor('other');await rpc('academy_enroll',[course.course_id,null]);assert.equal(await rpc('academy_can_read_asset',[asset.id]),false);checks++;
// Recovery after a successful object write but interrupted browser finalization.
await actor('trainer');const working=await rpc('academy_begin_draft',[course.course_id]);
const workingLesson=(await sql('select id from course_lessons where version_id=$1 and order_index=0',[working])).rows[0].id;
const pending=[];
for(let i=0;i<10;i++)pending.push(await rpc('academy_reserve_material',[course.course_id,`pending-${i}.pdf`,'application/pdf',100,0,workingLesson]));
await denied('select academy_reserve_material($1,$2,$3,$4,0,$5)',[course.course_id,'eleventh.pdf','application/pdf',100,workingLesson],/maksymalnie 10/);
await service();await sql(storeObject,[pending[0].storage_path,ids.trainer,{size:100,mimetype:'application/pdf'}]);await actor('trainer');
const recovered=await rpc('academy_reserve_material',[course.course_id,'pending-0.pdf','application/pdf',100,0,workingLesson]);
assert.equal(recovered.id,pending[0].id);assert.equal(recovered.status,'quarantined');checks++;
await owner();await sql("update course_materials set status='scanning',scan_attempts=5,scan_started_at=now()where id=$1",[pending[0].id]);
await actor('admin');await denied('select academy_admin_retry_material($1)',[pending[0].id],/material_not_waiting_for_retry/);
await owner();await sql("update course_materials set scan_started_at=now()-interval '16 minutes'where id=$1",[pending[0].id]);
await actor('admin');await rpc('academy_admin_retry_material',[pending[0].id]);
assert.equal((await sql('select scan_attempts from course_materials where id=$1',[pending[0].id])).rows[0].scan_attempts,0);checks++;
await actor('trainer');
for(const item of pending)await rpc('academy_discard_material',[item.id]);
await denied('update course_lessons set attachments=$1 where id=$2',[JSON.stringify(Array.from({length:101},()=>attachment)),workingLesson],/maksymalnie 100/);
await sql('update course_lessons set attachments=$1 where id=$2',[JSON.stringify(Array.from({length:100},()=>attachment)),workingLesson]);
await denied('select academy_reserve_material($1,$2,$3,$4,0,$5)',[course.course_id,'over-100.pdf','application/pdf',100,workingLesson],/maksymalnie 100/);
await sql('update course_lessons set attachments=$1 where id=$2',['[]',workingLesson]);
// A signature minted before a trainer grant is revoked cannot finalize bytes later.
const revokedAsset=await rpc('academy_reserve_material',[course.course_id,'revoked.pdf','application/pdf',100,0,workingLesson]);
await actor('admin');await rpc('academy_set_trainer',[ids.trainer,false]);
await service();await denied(storeObject,[revokedAsset.storage_path,ids.trainer,{size:100,mimetype:'application/pdf'}],/material_authorization_changed/);
await actor('admin');await rpc('academy_set_trainer',[ids.trainer,true]);
await actor('trainer');await rpc('academy_discard_material',[revokedAsset.id]);
// Rejected objects still occupy author quota until trusted cleanup removes bytes.
await owner();
for(let i=0;i<10;i++)await sql("insert into course_materials(course_id,version_id,lesson_id,uploaded_by,filename,storage_path,mime_type,size_bytes,status)values($1,$2,$3,$4,'quota.mp4',$5,'video/mp4',1073741824,'rejected')",[course.course_id,working,workingLesson,ids.trainer,`quota/${i}`]);
await actor('trainer');await denied('select academy_reserve_material($1,$2,$3,$4,0,$5)',[course.course_id,'over-quota.pdf','application/pdf',100,workingLesson],/10 GB/);

// Only hosted PostgreSQL has independent sessions that can demonstrate lock waits.
if(fixture.engine==='postgres'){
    await actor('admin');await rpc('academy_set_trainer',[ids.other,true]);
    await actor('other');
    const race=await rpc('academy_create_course',[{title:'Reservation race',category:'IT',completion_rules:{quiz_required:false,quiz_pass_percent:80,require_all_lessons:true,attendance_percent:80}}]);
    const raceLesson=(await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md)values($1,$2,'Race',0,'Read me')returning id",[race.course_id,race.version_id])).rows[0].id;
    const [a,b]=await Promise.all([fixture.connectSession('other'),fixture.connectSession('other')]);
    const pid=(await b.sql('select pg_backend_pid() pid')).rows[0].pid;
    await a.db.exec('BEGIN');
    await a.rpc('academy_reserve_material',[race.course_id,'race.pdf','application/pdf',100,0,raceLesson]);
    const submission=b.rpc('academy_submit_for_review',[race.course_id]).then(value=>({value}),error=>({error}));
    await owner();
    let blocked=false;
    for(let i=0;i<100;i++){
        blocked=(await sql('select cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked;
        if(blocked)break;
        await new Promise(resolve=>setTimeout(resolve,10));
    }
    await a.db.exec('COMMIT');
    const outcome=await submission;
    assert.equal(blocked,true,'submission must wait on reservation transaction');checks++;
    assert.match(outcome.error?.message??'',/weryfikację materiałów/);checks++;
    assert.equal((await sql('select status from course_versions where id=$1',[race.version_id])).rows[0].status,'draft');checks++;
    await Promise.all([a.db.close(),b.db.close()]);
}

// A scan accepted after archive ends cleanly without altering the archived program.
await actor('admin');await rpc('academy_set_trainer',[ids.other,true]);
await actor('other');
const archiveCourse=await rpc('academy_create_course',[{title:'Archive during scanning',category:'IT'}]);
const archiveLesson=(await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md)values($1,$2,'Archive',0,'Read me')returning id",[archiveCourse.course_id,archiveCourse.version_id])).rows[0].id;
const archiveAsset=await rpc('academy_reserve_material',[archiveCourse.course_id,'archive.pdf','application/pdf',100,0,archiveLesson]);
await service();await sql(storeObject,[archiveAsset.storage_path,ids.other,{size:100,mimetype:'application/pdf'}]);
await actor('other');await rpc('academy_finish_material_upload',[archiveAsset.id]);
await service();const archiveScan=(await sql('select to_jsonb(scan) asset from academy_claim_material_scan() scan')).rows[0].asset;
assert.equal(archiveScan.id,archiveAsset.id);checks++;
await actor('admin');await rpc('academy_archive_course',[archiveCourse.course_id]);
await service();assert.equal(await rpc('academy_accept_material_scan',[archiveAsset.id,archiveScan.scan_started_at,'c'.repeat(64),null]),true);checks++;
assert.equal((await sql('select status from course_materials where id=$1',[archiveAsset.id])).rows[0].status,'ready');checks++;
assert.deepEqual((await sql('select attachments from course_lessons where id=$1',[archiveLesson])).rows[0].attachments,[]);checks++;

console.log(`PASS ${checks} material migration and Storage assertions`);
await db.close();

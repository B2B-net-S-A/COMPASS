import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';
const f=await createAcademyDatabase({materialProjection:true,materialReviewIndependence:true});
const {db,ids,sql,actor,owner,rpc}=f;
const dir=new URL('../supabase/migrations/',import.meta.url);
const matches=readdirSync(dir).filter(name=>name.endsWith('_academy_audio_handover.sql'));
assert.equal(matches.length,1,'handover migration must be unambiguous');
await owner(); await db.exec(readFileSync(new URL(matches[0],dir),'utf8'));
await actor('admin'); await rpc('academy_set_trainer',[ids.trainer,true]); await actor('trainer');
const course=await rpc('academy_create_course',[{title:'Contracted delivery',category:'IT',delivery_mode:'self_paced'}]);
const lesson=(await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Module',0,'Training') returning id",[course.course_id,course.version_id])).rows[0].id;
for(const [filename,mime]of [['audio.mp3','audio/mpeg'],['audio.m4a','audio/mp4']])assert.equal((await rpc('academy_reserve_material',[course.course_id,filename,mime,536870912,0,lesson])).mime_type,mime);
await f.expectDenied('select academy_reserve_material($1,$2,$3,$4,0,$5)',[course.course_id,'large.mp3','audio/mpeg',536870913,lesson],/rozmiar/);
const selected={}; await owner();
for(const [key,mime]of [['presentation','application/pdf'],['participant_materials','application/pdf'],['exercises','application/pdf'],['modular_video','video/mp4'],['audio','audio/mpeg']]){
 const filename=`${key}.file`,path=`${course.course_id}/${key}`;
 const asset=(await sql("insert into course_materials(course_id,version_id,lesson_id,uploaded_by,filename,storage_path,mime_type,size_bytes,status) values($1,$2,$3,$4,$5,$6,$7,100,'ready') returning id",[course.course_id,course.version_id,lesson,ids.trainer,filename,path,mime])).rows[0].id;
 selected[key]=[asset]; await actor('trainer'); const old=(await sql('select attachments from course_lessons where id=$1',[lesson])).rows[0].attachments;
 await sql('update course_lessons set attachments=$1 where id=$2',[JSON.stringify([...old,{asset_id:asset,name:filename,storage_path:path,mime_type:mime,size_bytes:100}]),lesson]);await owner();
}
await actor('trainer');
const args=[course.version_id,null,null,selected,'https://firm.sharepoint.com/sites/training/sources','https://firm.sharepoint.com/sites/legal/rights','2026-10-01',true];
const stmt='select academy_save_handover($1,$2,$3,$4,$5,$6,$7,$8)';
await f.expectDenied(stmt,[...args.slice(0,3),{...selected,audio:[]},...args.slice(4)],/pięć kategorii/);
await f.expectDenied(stmt,[...args.slice(0,4),'https://firm.sharepoint.com/file?token=secret',...args.slice(5)],/firmowy link/);
await f.expectDenied(stmt,[...args.slice(0,3),{...selected,audio:selected.modular_video},...args.slice(4)],/Typ pliku/);
const handover=await rpc('academy_save_handover',args);assert.equal(handover.status,'submitted');
await f.expectDenied('update academy_handovers set status=$1 where id=$2',['accepted',handover.id]);
await actor('student');assert.equal((await sql('select * from academy_handovers')).rows.length,0);await f.expectDenied('select academy_review_handover($1,true,null)',[handover.id],/admin_required/);
await actor('admin');await rpc('academy_review_handover',[handover.id,false,'Verify rights']);
await actor('trainer');const resubmitted=await rpc('academy_save_handover',[...args.slice(0,2),handover.id,...args.slice(3)]);assert.equal(resubmitted.status,'submitted');
await actor('admin');await rpc('academy_review_handover',[handover.id,true,null]);assert.equal((await sql('select status from academy_handovers where id=$1',[handover.id])).rows[0].status,'accepted');
await f.expectDenied('select academy_review_handover($1,true,null)',[handover.id],/nie oczekuje/);
await actor('trainer');await f.expectDenied(stmt,[...args.slice(0,2),handover.id,...args.slice(3)],/edytowalny/);
await actor('admin');const authored=await rpc('academy_save_handover',args);await f.expectDenied('select academy_review_handover($1,true,null)',[authored.id],/independent_admin_review_required/);
await owner();assert.equal((await sql("select count(*)::int n from academy_audit_events where action in ('HANDOVER_SUBMITTED','HANDOVER_ACCEPTED','HANDOVER_REJECTED')")).rows[0].n,5);
await actor('', 'anon');await f.expectDenied('select * from academy_handovers');// A run receipt cannot reference program files or another edition's materials.
await actor('trainer');
const live=await rpc('academy_create_course',[{title:'Live receipt',category:'IT',delivery_mode:'live',completion_rules:{quiz_required:false,require_all_lessons:false,attendance_percent:80}}]);
await rpc('academy_submit_for_review',[live.course_id]);await actor('admin');const submission=(await sql('select submission_id from course_versions where id=$1',[live.version_id])).rows[0].submission_id;await rpc('academy_review_course',[live.version_id,true,null,submission]);await actor('trainer');
const run=await rpc('academy_create_run',[{courseId:live.course_id,versionId:live.version_id,title:'First edition',capacity:2}]);
const second=await rpc('academy_create_run',[{courseId:live.course_id,versionId:live.version_id,title:'Second edition',capacity:2}]);
await rpc('academy_save_session',[{runId:run,title:'Meeting',startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),timeZone:'Europe/Warsaw',mode:'external_link',externalJoinUrl:'https://teams.microsoft.com/meet/123456789',required:true}]);await actor('admin');await rpc('academy_publish_run',[run]);await actor('trainer');
assert.equal((await rpc('academy_reserve_run_material',[run,'audio.m4a','audio/mp4',536870912,0])).mime_type,'audio/mp4');
const runItems={};await owner();
for(const [key,mime]of [['presentation','application/pdf'],['participant_materials','application/pdf'],['exercises','application/pdf'],['modular_video','video/mp4'],['audio','audio/mpeg']]){
 const asset=(await sql("insert into course_materials(course_id,version_id,run_id,uploaded_by,filename,storage_path,mime_type,size_bytes,status,review_status) values($1,$2,$3,$4,$5,$6,$7,100,'ready','pending_review') returning id",[live.course_id,live.version_id,run,ids.trainer,`${key}.file`,`${live.course_id}/${key}`,mime])).rows[0].id;runItems[key]=[asset];
}
await actor('trainer');
const runArgs=[live.version_id,run,null,runItems,...args.slice(4)];
await f.expectDenied(stmt,[live.version_id,second,null,runItems,...args.slice(4)],/niedostępny/);
const runReceipt=await rpc('academy_save_handover',runArgs);
await actor('student');assert.equal((await sql('select * from academy_handovers where run_id=$1',[run])).rows.length,0);
await actor('admin');await f.expectDenied('select academy_review_handover($1,true,null)',[runReceipt.id],/zatwierdź materiały/);
for(const id of Object.values(runItems).flat())await rpc('academy_review_run_material',[id,'approve',null]);
await rpc('academy_review_handover',[runReceipt.id,true,null]);
await db.close();console.log('PASS audio quota, complete handover, staff isolation, immutable review and independent acceptance');

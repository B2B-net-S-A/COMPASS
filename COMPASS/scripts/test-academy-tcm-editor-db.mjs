// Focused native fixture. Hosted CI repeats on PG17; Auth/Storage HTTP are separate gates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';
const f = await createAcademyDatabase({ patrykCycle: true });
const { db, ids, sql, actor, owner, rpc } = f;
let checks = 0;
const equal = (a,b,message) => { assert.deepEqual(a,b,message); checks++; };
const denied = async (...args) => { await f.expectDenied(...args); checks++; };
const tcm='00000000-0000-0000-0000-000000000010',tcm2='00000000-0000-0000-0000-000000000011',noLogin='00000000-0000-0000-0000-000000000012';
const future = hours => new Date(Date.now()+hours*3600000).toISOString();
const protectedFunctions=['is_admin','academy_set_rollout','academy_set_trainer','academy_save_organizer','academy_save_m365_identity','academy_remove_m365_identity','academy_list_m365_identities_page','academy_can_review_version','academy_can_review_run','academy_review_course','academy_publish_run','academy_review_run_material','academy_review_handover','academy_review_legacy_course','academy_archive_course','academy_revoke_completion','academy_retry_material_cleanup','academy_edition_survey_report'];
const definitions=async()=>(await sql("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1::text[]) order by 1",[protectedFunctions])).rows;
const functionAcls=async()=>(await sql("select n.nspname,p.oid::regprocedure::text signature,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','academy_private','academy_material_policy') and p.proname not in('academy_is_global_editor','guard_tcm_path_write','cleanup_pending') order by 1,2")).rows;
const policies=async()=>(await sql('select schemaname,tablename,policyname,cmd,qual,with_check from pg_policies order by 1,2,3')).rows;
try {
 const beforeDefs=await definitions(),beforePolicies=await policies(),beforeAcls=await functionAcls();
 const catalogColumns=async()=>(await sql("select attname from pg_attribute where attrelid='public.academy_material_catalog'::regclass and attnum>0 and not attisdropped order by attnum")).rows.map(r=>r.attname);
 const beforeColumns=await catalogColumns();
 const dir=new URL('../supabase/migrations/',import.meta.url),migrations=fs.readdirSync(dir).filter(n=>n.endsWith('_academy_tcm_full_editor.sql'));
 equal(migrations.length,1);await db.exec(fs.readFileSync(new URL(migrations[0],dir),'utf8'));
 equal(await definitions(),beforeDefs,'Admin moderation/configuration/destructive RPCs unchanged');
 equal(await functionAcls(),beforeAcls,'Existing function execution ACLs unchanged');
 equal(await catalogColumns(),[...beforeColumns,'cleanup_pending']);
 equal((await sql("select reloptions @> array['security_invoker=true','security_barrier=true'] safe from pg_class where oid='public.academy_material_catalog'::regclass")).rows[0].safe,true);
 equal((await sql("select has_function_privilege('authenticated','academy_material_policy.cleanup_pending(uuid)','EXECUTE') editor,has_function_privilege('anon','academy_material_policy.cleanup_pending(uuid)','EXECUTE') anon")).rows[0],{editor:true,anon:false});
 equal((await sql("select has_function_privilege('authenticated','public.academy_is_global_editor(uuid)','EXECUTE') editor,has_function_privilege('anon','public.academy_is_global_editor(uuid)','EXECUTE') anon,has_function_privilege('authenticated','academy_private.guard_tcm_path_write()','EXECUTE') private")).rows[0],{editor:true,anon:false,private:false});
 equal((await sql("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.proname in('academy_is_global_editor','guard_tcm_path_write','cleanup_pending') and a.grantee=0")).rows[0].n,0);
 equal((await sql("select count(*)::int n from pg_proc where proname in('academy_is_global_editor','guard_tcm_path_write','cleanup_pending') and prosecdef and proconfig @> array['search_path=public, pg_temp']")).rows[0].n,2);
 const changed=new Set(['academy_webinar_admin_roster','academy_webinar_admin_batch','academy_webinar_admin_attendance','academy_audit_read','academy_path_enrollments_read']);
 equal((await policies()).filter(p=>!changed.has(p.policyname)&&!p.policyname.startsWith('academy_tcm_')),beforePolicies.filter(p=>!changed.has(p.policyname)),'No HR/role/rollout/Microsoft/learner policy expansion');
 await owner();for(const[id,name]of[[tcm,'tcm'],[tcm2,'tcm2']]){
  await sql('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${name}@example.test`]);
  await sql("insert into profiles(id,role,email,full_name) values($1,'talent_community',$2,$3)",[id,`${name}@example.test`,name]);
 }
 await actor('admin');await rpc('academy_set_trainer',[ids.trainer,true]);await actor('trainer');
 const foreign=await rpc('academy_create_course',[{title:'Foreign Cybersecurity',category:'IT',delivery_mode:'live'}]);
 await actor('admin');await rpc('academy_set_rollout',['closed',[]]);await actor(tcm);
 equal(await rpc('is_admin'),false);equal(await rpc('academy_is_global_editor'),true);equal(await rpc('academy_is_trainer'),true);
 equal((await rpc('academy_rollout_access')).allowed,true);equal((await rpc('academy_rollout_access')).isPilot,false);
 equal((await sql('select can_train from academy_user_capabilities where user_id=$1',[tcm])).rows,[]);
 equal(await rpc('academy_is_global_editor',[noLogin]),false);
 for(const account of['student','internal']){await actor(account);equal(await rpc('academy_can_access'),false);equal(await rpc('academy_is_trainer'),false);}
 await actor(tcm);equal(await rpc('academy_can_manage_course',[foreign.course_id]),true);
 equal((await rpc('academy_teaching_courses')).some(c=>c.id===foreign.course_id),true);
 equal((await sql('select id from courses where id=$1',[foreign.course_id])).rows.length,1);
 await rpc('academy_update_course',[foreign.course_id,{title:'Globally edited Cybersecurity',course_type:'company',is_official:true}]);
 const lesson=(await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'TCM workshop',0,'Verified workshop') returning id",[foreign.course_id,foreign.version_id])).rows[0].id;
 await sql('update course_lessons set title=$1 where id=$2',['Globally edited lesson',lesson]);
 await rpc('academy_replace_quiz',[foreign.course_id,[{question_text:'Safe?',order_index:0,options:Array.from({length:4},(_,i)=>({option_text:'Answer '+i,is_correct:i===0}))}]]);
 const asset=await rpc('academy_reserve_material',[foreign.course_id,'workshop.pdf','application/pdf',100,0,lesson]);
 await sql("insert into storage.objects(bucket_id,name,version,owner,owner_id,metadata) values('academy-materials',$1,gen_random_uuid()::text,$2::uuid,$2::text,$3)",[asset.storage_path,tcm,{size:100,mimetype:'application/pdf'}]);
 await denied('update course_materials set status=$1 where id=$2',['ready',asset.id]);await rpc('academy_finish_material_upload',[asset.id]);
 await owner();await sql("update course_materials set status='quarantined',scan_attempts=5,scan_error='fixture failure' where id=$1",[asset.id]);
 await actor(tcm);const scan=(await sql('select scan_attempts,cleanup_token from academy_material_catalog where id=$1',[asset.id])).rows[0];
 equal(scan.scan_attempts,5);equal(scan.cleanup_token,null);
 equal((await sql('select cleanup_pending from academy_material_catalog where id=$1',[asset.id])).rows[0].cleanup_pending,false);
 await owner();await sql('update course_materials set cleanup_token=gen_random_uuid(),cleanup_claimed_at=now() where id=$1',[asset.id]);await actor(tcm);
 equal((await sql('select cleanup_pending,cleanup_token from academy_material_catalog where id=$1',[asset.id])).rows[0],{cleanup_pending:true,cleanup_token:null});
 equal((await sql('select id from academy_material_catalog where id=$1 and cleanup_pending=false',[asset.id])).rows,[]);
 await actor('student');equal((await sql('select academy_material_policy.cleanup_pending($1) pending',[asset.id])).rows[0].pending,null);
 await owner();await sql('update course_materials set cleanup_token=null,cleanup_claimed_at=null where id=$1',[asset.id]);await actor(tcm);
 await rpc('academy_admin_retry_material',[asset.id]);
 equal((await sql('select scan_attempts from academy_material_catalog where id=$1',[asset.id])).rows[0].scan_attempts,0);
 await owner();await sql("update course_materials set status='ready' where id=$1",[asset.id]);await actor(tcm);
 // Content contribution does not permit publication, even after a later role change.
 await rpc('academy_submit_for_review',[foreign.course_id]);const token=(await sql('select submission_id from course_versions where id=$1',[foreign.version_id])).rows[0].submission_id;
 await denied('select academy_review_course($1,true,null,$2)',[foreign.version_id,token],/admin_required/);
 await owner();await sql("update profiles set role='admin' where id=$1",[tcm]);await actor(tcm);
 equal(await rpc('academy_can_review_version',[foreign.version_id]),false);
 await denied('select academy_review_course($1,true,null,$2)',[foreign.version_id,token],/independent/);
 await owner();await sql("update profiles set role='talent_community' where id=$1",[tcm]);await actor('admin');
 await rpc('academy_review_course',[foreign.version_id,true,null,token]);await actor(tcm);
 equal((await sql('update course_lessons set title=$1 where id=$2 returning id',['Alter published program',lesson])).rows.length,0);
 const next=await rpc('academy_begin_draft',[foreign.course_id]);assert.notEqual(next,foreign.version_id);checks++;
 equal(await rpc('academy_can_edit_version',[next]),true);
 await actor(tcm2);const receipt=await rpc('academy_save_handover',[next,null,null,{},null,null,null,false]);
 await actor(tcm);const revisedReceipt=await rpc('academy_save_handover',[next,null,receipt.id,{},'https://firm.sharepoint.com/sites/training/sources',null,null,false]);
 equal(revisedReceipt.status,'draft');equal([...revisedReceipt.contributors].sort(),[tcm,tcm2].sort());
 await denied('select academy_review_handover($1,true,null)',[receipt.id],/admin_required/);
 await denied('select academy_save_handover($1,null,$2,$3,$4,$5,$6,true)',[next,receipt.id,{},'https://firm.sharepoint.com/sites/training/sources','https://firm.sharepoint.com/sites/legal/rights','2026-10-01'],/pięć kategorii/);
 const own=await rpc('academy_create_course',[{title:'TCM official draft',category:'IT',course_type:'company',is_official:true}]);
 equal((await sql('select metadata from course_versions where id=$1',[own.version_id])).rows[0].metadata.is_official,true);
 // Only drafts, including other authors' paths, may be edited by TCM.
 await owner();const path=(await sql("insert into learning_paths(slug,title,author_id) values('foreign-path','Foreign path',$1) returning id",[ids.admin])).rows[0].id;
 await actor(tcm);equal((await sql('update learning_paths set title=$2 where id=$1 returning id',[path,'TCM path edit'])).rows.length,1);
 await denied('update learning_paths set author_id=$2 where id=$1',[path,tcm],/path_publication/);
 const link=(await sql('insert into learning_path_courses(path_id,course_id,order_index) values($1,$2,0) returning id',[path,foreign.course_id])).rows[0].id;
 await sql('update learning_path_courses set is_required=false where id=$1',[link]);await denied("update learning_paths set status='published' where id=$1",[path]);
 await actor('admin');await sql("update learning_paths set status='published' where id=$1",[path]);await actor(tcm);
 equal((await sql('update learning_paths set title=$2 where id=$1 returning id',[path,'Illegal live edit'])).rows.length,0);
 equal((await sql('delete from learning_path_courses where id=$1 returning id',[link])).rows.length,0);
 equal((await sql('delete from learning_paths where id=$1 returning id',[path])).rows.length,0);
 await denied('insert into learning_path_courses(path_id,course_id,order_index) values($1,$2,1)',[path,own.course_id]);
 const run=await rpc('academy_create_run',[{courseId:foreign.course_id,versionId:foreign.version_id,title:'Existing Teams webinar',capacity:96}]);
 await rpc('academy_update_run',[run,'Edited existing Teams webinar',96]);
 const session=await rpc('academy_save_session',[{runId:run,title:'Live',startsAt:future(24),endsAt:future(27),timeZone:'Europe/Warsaw',mode:'external_link',externalJoinUrl:'https://teams.microsoft.com/meet/123456789',required:true}]);
 await denied('select academy_publish_run($1)',[run],/administrator/);
 await owner();await sql("update profiles set role='admin' where id=$1",[tcm]);await actor(tcm);equal(await rpc('academy_can_review_run',[run]),false);
 await denied('select academy_publish_run($1)',[run],/independent/);
 await owner();await sql("update profiles set role='talent_community' where id=$1",[tcm]);await actor('admin');await rpc('academy_publish_run',[run]);
 await rpc('academy_set_rollout',['pilot',[ids.student]]);await actor(tcm);equal((await rpc('academy_rollout_access')).isPilot,false);
 equal(await rpc('academy_can_manage_run',[run]),true);await actor('student');equal(await rpc('academy_can_access'),true);
 await actor('trainer');equal(await rpc('academy_can_access'),false);await actor('admin');await rpc('academy_set_rollout',['open',[]]);
 // All 96 records are reviewed and committed by the preview's own operator.
 const rows=Array.from({length:96},(_,i)=>({email:i===0?'student@example.test':i===1?'tcm@example.test':`external${i}@example.test`,fullName:`Participant ${i}`}));
 const preview=async(kind,sourceRows,sid=null)=>rpc('academy_preview_webinar_import',[run,kind,JSON.stringify(sourceRows),'a'.repeat(64),sid]);
 await actor(tcm);const batch=await preview('registrations',rows);equal(batch.rows.length,96);equal((await rpc('academy_webinar_roster',[run])).length,0);
 await actor(tcm2);await denied('select academy_commit_webinar_import($1,$2)',[batch.id,{}],/operatora/);await actor(tcm);
 const imported=await rpc('academy_commit_webinar_import',[batch.id,{}]);equal(imported.created,96);equal(imported.linked,2);
 equal((await rpc('academy_commit_webinar_import',[batch.id,{}])).alreadyCommitted,true);equal((await rpc('academy_webinar_roster',[run])).length,96);
 equal((await rpc('academy_list_runs',[null,run]))[0].confirmedCount,96);
 await denied('update academy_webinar_roster set user_id=$2 where run_id=$1',[run,ids.other]);await denied('delete from academy_webinar_roster where run_id=$1',[run]);
 const roster=await rpc('academy_webinar_roster',[run]);
 await rpc('academy_verify_webinar_contractual_email',[roster.find(r=>r.email==='external2@example.test').id,'contract.external2@example.test','Verified contractual address in fixture']);
 const mailing=await rpc('academy_export_webinar_mailing_list',[run]);equal(mailing.rows.length,1);equal(mailing.rows[0].email,'contract.external2@example.test');equal(mailing.excludedMissingEmail,95);
 const participants=await rpc('academy_run_participants',[run]);equal(participants.length,2);
 await rpc('academy_save_edition_survey_settings',[run,'Prepared by TCM',{overall:'Cybersecurity usefulness'}]);
 const start=future(-4),end=future(-1);await owner();await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1',[session,start,end]);await actor(tcm);
 await rpc('academy_confirm_session_window',[session,start,end]);
 const reg=participants.find(r=>r.userId===ids.student),ownReg=participants.find(r=>r.userId===tcm);
 await rpc('academy_record_attendance',[{sessionId:session,enrollmentId:reg.enrollmentId,status:'present',attendedSeconds:8640,note:'Verified duration in fixture'}]);
 await denied('select academy_record_attendance($1)',[{sessionId:session,enrollmentId:ownReg.enrollmentId,status:'present',attendedSeconds:8640,note:'Own attendance'}],/własnej/);
 const attendanceBatch=await preview('attendance',rows.map(r=>({...r,intervals:[{start,end}],reportedSeconds:10800,evidence:'summary'})),session);
 const attendance=await rpc('academy_commit_webinar_import',[attendanceBatch.id,{}]);equal(attendance.preserved,2);equal(attendance.attendance,94);
 await actor('student');await rpc('academy_submit_edition_survey',[run,{overall:5,trainer:4,materials:null,difficulty:'appropriate',futureTopics:'Threat modelling',willingToTeach:true,proposedTopic:'Security',contactPreference:'compass',nps:9}]);
 await actor(tcm);const report=await rpc('academy_edition_survey_report',[run]);equal(report.responseCount,1);equal('teachingInterests' in report,false);
 equal((await rpc('academy_webinar_roster',[run])).filter(r=>r.attendance.length>0).length,94);
 await denied('select academy_reconcile_attendance($1)',[session],/firmowego/);
 equal(await rpc('academy_course_survey_history'),[],'TCM may read historical aggregate report; this fixture has no course-only responses');
 await actor('trainer');await denied('select academy_webinar_roster($1)',[run],/TCM/);
 equal((await sql('select id from academy_webinar_roster where run_id=$1',[run])).rows,[]);
 await actor(tcm);
 const runAsset=await rpc('academy_reserve_run_material',[run,'after-live.mp3','audio/mpeg',100,0]);
 await denied('select academy_review_run_material($1,$2,null)',[runAsset.id,'approve'],/admin_required/);
 await denied('select academy_review_handover($1,true,null)',[tcm],/admin_required/);
 await denied('select academy_archive_course($1)',[foreign.course_id],/admin_required/);
 await denied('select academy_revoke_completion($1,$2)',[tcm,'No certificate authority'],/admin_required/);
 await denied('select academy_retry_material_cleanup($1)',[runAsset.id],/admin_required/);
 await denied('select academy_set_rollout($1,$2)',['open',[]],/admin_required/);await denied('select academy_set_trainer($1,true)',[ids.other],/admin_required/);
 await denied('select academy_save_organizer($1)',[{}],/administrator/);await denied('select academy_save_m365_identity($1)',[{}],/administrator/);
 await denied('select academy_remove_m365_identity($1,$2)',[tcm,'No configuration authority'],/administrator/);
 equal((await sql('select * from academy_rollout_settings')).rows,[]);equal((await sql('select * from academy_m365_identities')).rows,[]);
 await denied('select * from academy_private.edition_teaching_interest');
 // Role/status/auth authority is live; JWT claims cannot restore revoked access.
 await owner();await sql("update profiles set role='internal' where id=$1",[tcm]);await actor(tcm);
 equal(await rpc('academy_can_access'),false);equal(await rpc('academy_can_manage_course',[foreign.course_id]),false);await denied('select academy_webinar_roster($1)',[run]);
 await owner();await sql("update profiles set role='talent_community',employment_status='exited' where id=$1",[tcm]);await actor(tcm);
 equal(await rpc('academy_is_global_editor'),false);equal(await rpc('academy_is_trainer'),false);
 await owner();await sql("update profiles set employment_status='active',is_external=true where id=$1",[tcm]);await actor(tcm);equal(await rpc('academy_is_global_editor'),false);
 await owner();await sql('update profiles set is_external=false where id=$1',[tcm]);await actor(tcm);equal(await rpc('academy_is_global_editor'),true);
 await actor('trainer');equal(await rpc('academy_is_trainer'),true);equal(await rpc('academy_can_manage_course',[own.course_id]),false);
 await actor('student');await sql("select set_config('request.jwt.claim.user_metadata',$1,false)",[JSON.stringify({role:'talent_community',can_train:true})]);equal(await rpc('academy_is_global_editor'),false);equal(await rpc('academy_is_trainer'),false);await actor('internal');equal(await rpc('academy_can_access'),false);
 await actor('','anon');await denied('select academy_is_global_editor()');await denied('select academy_webinar_roster($1)',[run]);
 if(f.engine==='postgres') {
  // Publication owns the same path lock as edits, so a stale RLS snapshot
  // cannot commit a structural change after an administrator publishes.
  await owner();const racePath=(await sql("insert into learning_paths(slug,title,author_id) values('race-path','Race path',$1) returning id",[tcm])).rows[0].id;
  const raceLink=(await sql('insert into learning_path_courses(path_id,course_id,order_index) values($1,$2,0) returning id',[racePath,own.course_id])).rows[0].id;
  const adminSession=await f.connectSession('admin'),editorSession=await f.connectSession(tcm);
  try {
   await adminSession.db.exec('BEGIN');await adminSession.sql("update learning_paths set status='published' where id=$1",[racePath]);
   await editorSession.db.exec('BEGIN');let completed=false;
   const edit=editorSession.sql('update learning_path_courses set is_required=false where id=$1',[raceLink]).then(result=>({result}),error=>({error})).finally(()=>{completed=true;});
   await new Promise(resolve=>setTimeout(resolve,50));equal(completed,false,'TCM waits for publishing parent lock');
   await adminSession.db.exec('COMMIT');const result=await edit;
   assert.match(result.error?.message??'',/published_path_is_not_editable_by_tcm/);checks++;
   await editorSession.db.exec('ROLLBACK');
   equal((await sql('select is_required from learning_path_courses where id=$1',[raceLink])).rows[0].is_required,true);
  } finally {await adminSession.db.close();await editorSession.db.close();}
 }
 console.log(`PASS ${checks} TCM Academy SQL assertions (${f.engine}); HR/admin review/configuration preserved`);
} catch(error) {console.error({error:error.message,where:error.where});process.exitCode=1;}
finally {await db.close();}

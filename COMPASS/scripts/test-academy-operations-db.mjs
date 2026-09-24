import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAcademyDatabase} from './lib/academy-db-fixture.mjs';
const f=await createAcademyDatabase({cleanup:true});
const {db,sql,actor,owner,service,rpc,ids}=f;let checks=0;
try{
 await owner();await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260922154414_academy_operations_health.sql',import.meta.url),'utf8'));
 for(const role of ['student','trainer','admin']){await actor(role);await f.expectDenied('select academy_operations_health()',[],/permission denied/);checks++;}
 await actor('','anon');await f.expectDenied('select academy_operations_health()',[],/permission denied/);checks++;
 await service();let report=await rpc('academy_operations_health');assert.equal(report.workers.length,2);assert(report.workers.every(w=>!w.ok&&w.lastFinishedAt===null));assert.equal(report.materials.pending,0);checks+=3;
 // User-attributed events must never impersonate trusted system worker heartbeats.
 await actor('student');await f.expectDenied("insert into audit_logs(user_id,action,details) values(null,'ACADEMY_MATERIAL_SCAN_RUN','{\"phase\":\"done\",\"status\":200,\"stats\":{\"ok\":true}}')",[],/row-level security/);checks++;
 await owner();await sql("insert into audit_logs(user_id,action,details,created_at) values($1,'ACADEMY_MATERIAL_SCAN_RUN',$2,now())",[ids.student,{phase:'done',status:200,stats:{ok:true}}]);
 await service();report=await rpc('academy_operations_health');assert.equal(report.workers.find(w=>w.kind==='materials').lastFinishedAt,null);checks++;
 await owner();await sql("insert into audit_logs(user_id,action,details,created_at) values(null,'ACADEMY_MATERIAL_SCAN_RUN',$1,now()-interval '2 minutes'),(null,'ACADEMY_MATERIAL_SCAN_RUN',$2,now()-interval '1 minute')",[{phase:'done',status:200,stats:{ok:true}},{phase:'done',status:503,stats:{ok:false}}]);
 await service();report=await rpc('academy_operations_health');assert.equal(report.workers.find(w=>w.kind==='materials').ok,false);checks++;
 await owner();await sql("insert into audit_logs(user_id,action,details) values(null,'ACADEMY_MATERIAL_SCAN_RUN',$1),(null,'ACADEMY_SYNC_RUN',$1)",[{phase:'done',status:200,stats:{ok:true},error:'do not expose raw details'}]);
 await service();report=await rpc('academy_operations_health');assert(report.workers.every(w=>w.ok));assert(!JSON.stringify(report).includes('do not expose'));checks+=2;
 await actor('admin');await rpc('academy_set_trainer',[ids.trainer,true]);await actor('trainer');const course=await rpc('academy_create_course',[{title:'Health aggregate source',category:'IT',delivery_mode:'live'}]);
 await owner();
 const version=course.version_id;
 for(let i=0;i<9;i++)await sql("insert into course_materials(course_id,version_id,uploaded_by,filename,storage_path,mime_type,size_bytes,status,scan_attempts,scan_next_attempt_at,retention_changed_at) values($1,$2,$3,$4,$5,'video/mp4',1073741824,'quarantined',$6,now()-interval '31 minutes',now()-interval '31 minutes')",[course.course_id,version,ids.trainer,`private-${i}.mp4`,`private-path/${i}`,i===0?5:0]);
 await service();report=await rpc('academy_operations_health');assert.equal(report.materials.pending,9);assert.equal(report.materials.failed,1);assert(report.materials.oldestDueAt);assert.equal(report.storage.reservedBytes,9*1024**3);assert.equal(report.storage.authorsNearQuota,1);assert(!JSON.stringify(report).includes(ids.trainer));assert(!JSON.stringify(report).includes('private-path'));checks+=7;
 // Fresh fifth scan is still leased; an expired fifth scan really is exhausted.
 await owner();await sql("update course_materials set status='scanning',scan_attempts=5,scan_started_at=now() where course_id=$1 and filename='private-0.mp4'",[course.course_id]);
 await service();report=await rpc('academy_operations_health');assert.equal(report.materials.failed,0);checks++;
 await owner();await sql("update course_materials set scan_started_at=now()-interval '16 minutes' where course_id=$1 and filename='private-0.mp4'",[course.course_id]);
 await service();report=await rpc('academy_operations_health');assert.equal(report.materials.failed,1);checks++;
 // Simulate a long, resumed upload. The actual status trigger, not a fixture timestamp,
 // must prevent the old reservation date from becoming immediate overdue work.
 await owner();await sql("update course_materials set status='uploading',scan_attempts=0,scan_started_at=null,scan_next_attempt_at=now()-interval '2 hours' where course_id=$1",[course.course_id]);
 await sql("update course_materials set status='quarantined' where course_id=$1",[course.course_id]);
 await service();report=await rpc('academy_operations_health');assert.equal(report.materials.failed,0);assert(Date.parse(report.checkedAt)-Date.parse(report.materials.oldestDueAt)<60000);checks+=2;
 // Active leases have no overdue queue timestamp; exhausted leases do.
 await owner();await sql("update course_materials set status='scanning',scan_attempts=5,scan_started_at=now() where course_id=$1",[course.course_id]);
 await service();report=await rpc('academy_operations_health');assert.equal(report.materials.failed,0);assert.equal(report.materials.oldestDueAt,null);checks+=2;
 await owner();await sql("update course_materials set scan_started_at=now()-interval '46 minutes' where course_id=$1",[course.course_id]);
 await service();report=await rpc('academy_operations_health');assert.equal(report.materials.failed,9);assert(Date.parse(report.checkedAt)-Date.parse(report.materials.oldestDueAt)>30*60000);checks+=2;
 await owner();await sql("update course_materials set purged_at=now() where course_id=$1",[course.course_id]);
 await service();report=await rpc('academy_operations_health');assert.equal(report.storage.reservedBytes,0);assert.equal(report.materials.pending,0);checks+=2;
 await owner();assert.equal((await sql("select count(*)::int n from pg_indexes where indexname='academy_worker_heartbeat_latest'")).rows[0].n,1);checks++;
 console.log(`Academy operations health checks passed: ${checks}`);
}finally{await db.close();}

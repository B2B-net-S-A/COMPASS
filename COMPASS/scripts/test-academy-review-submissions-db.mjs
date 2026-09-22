import assert from 'node:assert/strict';
import {createAcademyDatabase} from './lib/academy-db-fixture.mjs';
process.on('uncaughtException',error=>{console.error({message:error.message,where:error.where,query:error.query});process.exit(1)});
const f=await createAcademyDatabase({reviewSubmissions:true});
const {db,ids,actor,owner,rpc,sql}=f;let checks=0;
async function denied(...args){await f.expectDenied(...args);checks++;}
async function submission(version){return(await sql('select submission_id from course_versions where id=$1',[version])).rows[0].submission_id;}
try{
 await actor('admin');await rpc('academy_set_trainer',[ids.trainer,true]);
 await actor('trainer');const c=await rpc('academy_create_course',[{title:'Review submission identity',category:'IT',delivery_mode:'live'}]);
 assert.equal(await submission(c.version_id),null);checks++;
 await rpc('academy_submit_for_review',[c.course_id]);const first=await submission(c.version_id);assert(first);checks++;
 await denied('select academy_review_course($1,true,null,$2)',[c.version_id,first],/admin_required/);
 await actor('admin');await denied('select academy_review_course($1,true)',[c.version_id],/permission denied/);
 await denied('select academy_review_course($1,true,null)',[c.version_id],/permission denied/);
 await denied('select academy_review_course($1,true,null,null)',[c.version_id],/review_submission_changed/);
 await denied('select academy_review_course($1,true,null,$2)',[c.version_id,'00000000-0000-0000-0000-999999999999'],/review_submission_changed/);
 await rpc('academy_review_course',[c.version_id,false,'Please revise the program',first]);
 await actor('trainer');const edited=await rpc('academy_update_course',[c.course_id,{description:'Changed content after rejection'}]);assert.equal(edited,c.version_id);checks++;
 await rpc('academy_submit_for_review',[c.course_id]);const second=await submission(c.version_id);assert(second);assert.notEqual(second,first);checks+=2;
 // The moderator's still-open first form carries first, never a token freshly fetched by the action.
 await actor('admin');await denied('select academy_review_course($1,true,null,$2)',[c.version_id,first],/review_submission_changed/);
 await denied('select academy_review_course($1,false,$2,$3)',[c.version_id,'Stale rejection must also fail',first],/review_submission_changed/);
 let state=(await sql('select status,metadata from course_versions where id=$1',[c.version_id])).rows[0];assert.equal(state.status,'pending_review');assert.equal(state.metadata.description,'Changed content after rejection');checks+=2;
 await owner();const claimBefore=(await sql("select count(*)::int n from academy_reward_claims where reward_kind='first_publication' and user_id=$1",[ids.trainer])).rows[0].n;assert.equal(claimBefore,0);checks++;
 await actor('admin');const approved=await rpc('academy_review_course',[c.version_id,true,null,second]);assert.equal(approved.published,true);checks++;
 const retry=await rpc('academy_review_course',[c.version_id,true,null,second]);assert.equal(retry.first_publish_bonus,false);checks++;
 assert.equal(await submission(c.version_id),second);checks++;
 await owner();assert.equal((await sql("select count(*)::int n from academy_audit_events where action='COURSE_REVIEW_DECIDED' and details->>'submission_id'=$1",[second])).rows[0].n,1);checks++;
 assert.equal((await sql("select count(*)::int n from academy_reward_claims where reward_kind='first_publication' and user_id=$1",[ids.trainer])).rows[0].n,1);checks++;
 await f.service();await denied('select academy_review_course($1,true)',[c.version_id],/permission denied/);
 await denied('select academy_review_course($1,true,null)',[c.version_id],/permission denied/);
 await denied('select academy_review_course($1,true,null,$2)',[c.version_id,second],/permission denied/);
 await actor('','anon');await denied('select academy_review_course($1,true,null,$2)',[c.version_id,second],/permission denied/);
 console.log(`Academy review submission checks passed: ${checks}`);
}finally{await db.close();}

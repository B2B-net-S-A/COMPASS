// Real SQL/RLS gate: edition answers never depend on later recordings or course-version changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';
process.on('uncaughtException', error => { console.error({error:error.message,where:error.where,query:error.query});process.exit(1); });
const f = await createAcademyDatabase({ activationBudget: true });
const { db, sql, actor, owner, rpc, ids } = f;
let checks=0;
const equal=(a,b)=>{ assert.deepEqual(a,b); checks++; };
const denied=async(...args)=>{ await f.expectDenied(...args); checks++; };
const answers={overall:5,trainer:4,materials:null,difficulty:'appropriate',futureTopics:'AI security',willingToTeach:true,proposedTopic:'Threat modelling',contactPreference:'compass',nps:0};
try {
    const dir=new URL('../supabase/migrations/',import.meta.url);
    const matches=fs.readdirSync(dir).filter(n=>n.endsWith('_academy_edition_surveys.sql'));
    equal(matches.length,1); await db.exec(fs.readFileSync(new URL(matches[0],dir),'utf8'));
    await db.exec(fs.readFileSync(new URL('20261005183000_academy_cycle_gdpr_export.sql',dir),'utf8'));
    await actor('admin'); await rpc('academy_set_trainer',[ids.trainer,true]);
    await actor('trainer');
    const c=await rpc('academy_create_course',[{title:'Cybersecurity survey',category:'IT',delivery_mode:'blended',completion_rules:{quiz_required:false,require_all_lessons:true,attendance_percent:80}}]);
    await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Later recording',0,'Content follows the live training')",[c.course_id,c.version_id]);
    await rpc('academy_submit_for_review',[c.course_id]);
    const submission=(await sql('select submission_id from course_versions where id=$1',[c.version_id])).rows[0].submission_id;
    await actor('admin'); await rpc('academy_review_course',[c.version_id,true,null,submission]);
    async function edition(title) {
        await actor('trainer'); const run=await rpc('academy_create_run',[{courseId:c.course_id,versionId:c.version_id,title,capacity:10}]);
        const s=await rpc('academy_save_session',[{runId:run,title:'Live workshop',startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),timeZone:'Europe/Warsaw',mode:'external_link',externalJoinUrl:'https://teams.microsoft.com/meet/123456789?p=secret',required:true}]);
        await actor('admin'); await rpc('academy_publish_run',[run]);
        await actor('student'); const reg=await rpc('academy_register_run',[run]);
        return {run,s,reg};
    }
    const one=await edition('October edition');
    equal((await rpc('academy_edition_survey_state',[one.run])).eligible,false);
    await denied('select academy_submit_edition_survey($1,$2)',[one.run,answers]);
    await actor('other'); await denied('select academy_edition_survey_state($1)',[one.run]);
    await denied('select academy_submit_edition_survey($1,$2)',[one.run,answers]);
    await actor('student');
    await denied('insert into academy_edition_survey_responses(run_id,user_id,enrollment_id,registration_id,overall,trainer,difficulty,question_snapshot) values($1,$2,$3,$4,5,5,\'appropriate\',\'{}\')',[one.run,ids.student,one.reg.enrollmentId,one.reg.registrationId]);
    await actor('trainer'); await rpc('academy_save_edition_survey_settings',[one.run,'Survey October',{overall:'How useful was Cybersecurity?'}]);
    await denied('select academy_save_edition_survey_settings($1,$2,$3)',[one.run,'intro',{unknown:'bad'}]);
    const start=new Date(Date.now()-7200000).toISOString(), end=new Date(Date.now()-3600000).toISOString();
    async function attend(e) {
        await owner(); await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1',[e.s,start,end]);
        await actor('trainer'); await rpc('academy_confirm_session_window',[e.s,start,end]);
        await rpc('academy_record_attendance',[{sessionId:e.s,enrollmentId:e.reg.enrollmentId,status:'present',attendedSeconds:2880,note:'Verified external Teams attendance'}]);
        await actor('student');
    }
    await attend(one);
    equal((await sql('select completed_at from course_enrollments where id=$1',[one.reg.enrollmentId])).rows[0].completed_at,null);
    equal((await rpc('academy_edition_survey_state',[one.run])).eligible,true);
    for(const bad of [{...answers,overall:0},{...answers,trainer:'4'},{...answers,materials:'3'},{...answers,nps:11},{...answers,difficulty:null},{...answers,willingToTeach:null},{...answers,futureTopics:{bad:true}},{...answers,proposedTopic:'x'.repeat(2001)},{...answers,contactPreference:'spam'}]) await denied('select academy_submit_edition_survey($1,$2)',[one.run,bad]);
    const first=await rpc('academy_submit_edition_survey',[one.run,answers]);
    equal(await rpc('academy_submit_edition_survey',[one.run,{...answers,overall:1}]),first);
    equal((await rpc('academy_edition_survey_state',[one.run])).submitted,true);
    await denied('select academy_edition_survey_report($1)',[one.run]);
    await denied('select * from academy_private.edition_teaching_interest');
    await denied('update academy_edition_survey_responses set run_id=$2 where id=$1',[first,one.run]);
    await actor('other'); equal((await sql('select * from academy_edition_survey_responses')).rows,[]);
    await actor('trainer'); equal((await sql('select * from academy_edition_survey_responses')).rows,[]);
    const report=await rpc('academy_edition_survey_report',[one.run]); equal(report.responseCount,1); equal(report.overall,5); equal(report.materials,null); equal(report.nps,0); equal('teachingInterests' in report,false);
    await rpc('academy_save_edition_survey_settings',[one.run,'Changed intro',{overall:'Changed future question'}]);
    await owner(); equal((await sql('select question_snapshot from academy_edition_survey_responses where id=$1',[first])).rows[0].question_snapshot.labels.overall,'How useful was Cybersecurity?');
    await denied('update academy_edition_survey_responses set run_id=$2 where id=$1',[first,one.run],/niezmienna/);
    await actor('admin');await rpc('academy_set_trainer',[ids.other,true]);
    await actor('other');await denied('select academy_edition_survey_report($1)',[one.run]);
    await actor('trainer');await rpc('academy_set_run_staff',[one.run,ids.other,true]);
    await actor('other');const assignedReport=await rpc('academy_edition_survey_report',[one.run]);equal(assignedReport.responseCount,1);equal('teachingInterests' in assignedReport,false);
    await denied('select * from academy_private.edition_teaching_interest');
    await actor('admin'); equal((await rpc('academy_edition_survey_report',[one.run])).teachingInterests[0],{userId:ids.student,fullName:'student',proposedTopic:'Threat modelling',contactPreference:'compass'});
    const two=await edition('January edition'); await attend(two);
    const second=await rpc('academy_submit_edition_survey',[two.run,{...answers,willingToTeach:false,proposedTopic:'ignored',contactPreference:'contract_email',materials:3}]);
    assert.notEqual(second,first);checks++;
    await owner(); equal((await sql('select count(*)::int n from academy_edition_survey_responses where user_id=$1',[ids.student])).rows[0].n,2);
    equal((await sql('select count(*)::int n from course_survey_responses')).rows[0].n,0);
    equal((await sql('select * from academy_private.edition_teaching_interest where response_id=$1',[second])).rows[0],{response_id:second,willing_to_teach:false,proposed_topic:null,contact_preference:'none'});
    equal((await sql("select count(*)::int n from academy_audit_events where action='ACADEMY_EDITION_SURVEY_SUBMITTED'")).rows[0].n,2);
    await actor('trainer'); const newVersion=await rpc('academy_begin_draft',[c.course_id]);
    assert.notEqual(newVersion,c.version_id);checks++;
    await actor('student'); equal(await rpc('academy_submit_edition_survey',[one.run,answers]),first);
    // Existing course-only responses remain independently reportable, without assigning an edition retroactively.
    await owner(); await sql('insert into course_survey_responses(user_id,course_id,enrollment_id,nps_score,best_part) values($1,$2,$3,8,$4)',[ids.student,c.course_id,one.reg.enrollmentId,'Useful examples']);
    await actor('trainer'); const history=await rpc('academy_course_survey_history',[]); equal(history.length,1);equal(history[0].responseCount,1);equal(history[0].averageNps,8);
    await actor('student');await denied('select academy_course_survey_history()');
    await actor('student');await denied('select * from academy_gdpr_teaching_interest($1)',[ids.student]);
    await f.service();equal((await rpc('academy_gdpr_teaching_interest',[ids.student])).map(row=>row.response_id).sort(),[first,second].sort());
    equal(await rpc('academy_gdpr_teaching_interest',[ids.other]),[]);
    await actor('student','anon');await denied('select * from academy_gdpr_teaching_interest($1)',[ids.student]); await denied('select academy_edition_survey_state($1)',[one.run]); await denied('select * from academy_edition_survey_responses');
    console.log(`PASS ${checks} edition survey database assertions`);
} finally { await db.close(); }

import assert from 'node:assert/strict';
import { createAcademyDatabase } from '../../../COMPASS/scripts/lib/academy-db-fixture.mjs';

/** Synthetic legacy records only, on the exact canonical dependency baseline.
 * Called by the existing PGlite and hosted PostgreSQL migration jobs.
 */
export async function verifyCanonicalBackfill() {
    const ids = {admin:'00000000-0000-0000-0000-000000000001',trainer:'00000000-0000-0000-0000-000000000002',student:'00000000-0000-0000-0000-000000000003',other:'00000000-0000-0000-0000-000000000004',internal:'00000000-0000-0000-0000-000000000005',newStudent:'00000000-0000-0000-0000-000000000006'};
    const before = {};
    let serial = 100;
    const id = () => `10000000-0000-0000-0000-${String(serial++).padStart(12,'0')}`;
    const record = {};
    const oldDate = '2026-08-10T12:00:00+00:00';
    const f = await createAcademyDatabase({materials:true,live:true,staff:true,runMaterials:true,revocations:true,rollout:true,obligations:true,cleanup:true,reviewSubmissions:true,completionGaps:true,
        beforeAcademyMigrations: async db => {
            const sql = (query,args=[]) => db.query(query,args);
            await sql("insert into auth.users(id,email)values($1,'new@example.test')",[ids.newStudent]);
            await sql("insert into profiles(id,email,role,full_name)values($1,'new@example.test','consultant','New learner')",[ids.newStudent]);
            record.courses = {};
            for (const status of ['draft','pending_review','rejected','published','archived']) {
                const course = id(); record.courses[status] = course;
                await sql(`insert into courses(id,author_id,title,slug,description,category,tags,level,duration_minutes,status,created_at,updated_at,published_at,reviewed_by,reviewed_at,rejection_reason)
                    values($1,$2,$3,$4,'Historyczna treść','IT',array['legacy'],'advanced',45,$5,$6,$6,$6,$7,$6,$8)`,
                    [course,ids.trainer,`Zażółć gęślą jaźń — ${status}`,`canonical-${status}`,status,oldDate,ids.admin,status==='rejected'?'Popraw ćwiczenia':null]);
            }
            const course = record.courses.published;
            record.lesson = id(); record.question = id(); record.option = id();
            await sql("insert into course_lessons(id,course_id,title,content_md,order_index,unlock_after_days)values($1,$2,'Pierwsza lekcja','Treść historyczna',0,2)",[record.lesson,course]);
            await sql("insert into course_quiz_questions(id,course_id,order_index,question_text)values($1,$2,0,'Pytanie historyczne?')",[record.question,course]);
            await sql("insert into course_quiz_options(id,question_id,order_index,option_text,is_correct)values($1,$2,0,'Odpowiedź',true)",[record.option,record.question]);
            record.completed = id(); record.active = id(); record.awardedWithoutCompletion = id();
            for (const [enrollment,user,completed,awarded] of [[record.completed,ids.student,oldDate,false],[record.active,ids.other,null,false],[record.awardedWithoutCompletion,ids.trainer,null,true]]) {
                await sql(`insert into course_enrollments(id,user_id,course_id,enrolled_at,completed_at,points_awarded,completed_lessons,last_accessed_lesson_id,last_accessed_at,lesson_completion_dates)
                    values($1,$2,$3,$4::timestamptz,$5,$6,$7,$8::uuid,$4::timestamptz,jsonb_build_object(($8::uuid)::text,$4::timestamptz))`,[enrollment,user,course,oldDate,completed,awarded,[record.lesson],record.lesson]);
            }
            record.attempt = id();
            await sql("insert into course_quiz_attempts(id,enrollment_id,user_id,course_id,answers,score_percent,passed,attempted_at)values($1,$2,$3,$4,$5,100,true,$6)",[record.attempt,record.completed,ids.student,course,JSON.stringify([{question_id:record.question,selected_option_id:record.option}]),oldDate]);
            // Duplicate source categories and old flags must become one claim,
            // without replaying any financial or gamification side effects.
            for (const [user,source,sourceCourse] of [[ids.student,'course_completed_student',course],[ids.student,'course_completed_company_student',course],[ids.trainer,'course_first_publish_bonus',course],[ids.trainer,'course_first_publish_bonus',record.courses.archived]]) {
                await sql("insert into loyalty_transactions(id,user_id,points,source_type,source_id,description,created_at)values($1,$2,20,$3,$4,'Historyczna nagroda',$5)",[id(),user,source,sourceCourse,oldDate]);
            }
            record.discussion = id(); record.unenrolledDiscussion = id(); record.answer = id(); record.survey = id();
            await sql("insert into course_questions(id,course_id,lesson_id,user_id,question_text,created_at,updated_at)values($1,$2,$3,$4,'Jak zastosować to ćwiczenie?',$5,$5)",[record.discussion,course,record.lesson,ids.student,oldDate]);
            await sql("insert into course_questions(id,course_id,user_id,question_text,created_at,updated_at)values($1,$2,$3,'Pytanie bez dawnego zapisu',$4,$4)",[record.unenrolledDiscussion,course,ids.internal,oldDate]);
            await sql("insert into course_answers(id,question_id,user_id,answer_text,created_at,updated_at)values($1,$2,$3,'Odpowiedź autora',$4,$4)",[record.answer,record.discussion,ids.trainer,oldDate]);
            await sql("insert into course_survey_responses(id,user_id,course_id,enrollment_id,nps_score,best_part,submitted_at)values($1,$2,$3,$4,8,'Przykłady',$5)",[record.survey,ids.student,course,record.completed,oldDate]);
            record.path = id(); record.pathEnrollment = id();
            await sql("insert into learning_paths(id,slug,title,status,author_id)values($1,'canonical-path','Ścieżka historyczna','published',$2)",[record.path,ids.admin]);
            for (const [order,courseId,required] of [[0,record.courses.archived,true],[1,record.courses.draft,false],[2,course,true]]) await sql('insert into learning_path_courses(path_id,course_id,order_index,is_required)values($1,$2,$3,$4)',[record.path,courseId,order,required]);
            await sql('insert into learning_path_enrollments(id,path_id,user_id,enrolled_at)values($1,$2,$3,$4)',[record.pathEnrollment,record.path,ids.student,oldDate]);
            await sql("update profiles set learning_streak_current=7,learning_streak_longest=3,learning_streak_last_date='2026-08-10' where id=$1",[ids.student]);
            for (const table of ['courses','course_enrollments','course_quiz_attempts','course_questions','course_answers','course_survey_responses','loyalty_transactions']) before[table]=(await sql(`select to_jsonb(t) as row from ${table} t order by id`)).rows.map(r=>r.row);
        }});
    const {sql,actor,owner,rpc} = f;
    let checks = 0;
    const equal = (a,b) => {assert.deepEqual(a,b);checks++;};
    const row = async (table,recordId) => (await sql(`select to_jsonb(t) as row from ${table} t where id=$1`,[recordId])).rows[0]?.row;
    try {
        equal(f.baselineProof.dependencyParity,true);
        equal(f.appliedMigrations.length,13);
        equal((await sql('select count(*)::integer n from course_versions')).rows[0].n,before.courses.length);
        for (const previous of before.courses) {
            const current = await row('courses',previous.id);
            const version = (await sql('select to_jsonb(v) as row from course_versions v where course_id=$1',[previous.id])).rows[0].row;
            equal(version.version_number,1);equal(version.legacy,true);
            equal(version.status,previous.status==='archived'?'published':previous.status);
            equal(current.status,previous.status);
            equal(version.metadata,{title:previous.title,description:previous.description,category:previous.category,tags:previous.tags,level:previous.level,duration_minutes:previous.duration_minutes,cover_image_url:previous.cover_image_url,delivery_mode:'self_paced',course_type:previous.course_type,is_official:previous.is_official,prerequisite_course_ids:previous.prerequisite_course_ids});
            equal(version.completion_rules,{quiz_required:true,quiz_pass_percent:70,require_all_lessons:false,attendance_percent:80});
            equal(current.published_version_id,['published','archived'].includes(previous.status)?version.id:null);
            equal(current.draft_version_id,['draft','pending_review','rejected'].includes(previous.status)?version.id:null);
            equal(current.legacy_review_required,['published','archived'].includes(previous.status));
            equal(current.enrollments_count,previous.enrollments_count);equal(current.completions_count,previous.completions_count);
            equal(Boolean(version.submission_id),previous.status==='pending_review');
        }
        const published = await row('courses',record.courses.published);
        for (const previous of before.course_enrollments) {
            const current=await row('course_enrollments',previous.id);
            for (const [key,value] of Object.entries(previous)) equal(current[key],value);
            const course = await row('courses',previous.course_id);
            equal(current.version_id,course.published_version_id??course.draft_version_id);
        }
        equal((await row('course_lessons',record.lesson)).version_id,published.published_version_id);
        equal((await row('course_quiz_questions',record.question)).version_id,published.published_version_id);
        equal((await row('course_quiz_options',record.option)).question_id,record.question);
        for (const table of ['course_quiz_attempts','course_answers','course_survey_responses','loyalty_transactions']) equal((await sql(`select to_jsonb(t) as row from ${table} t order by id`)).rows.map(r=>r.row),before[table]);
        const completions=(await sql('select to_jsonb(c) as row from course_completions c order by enrollment_id')).rows.map(r=>r.row);
        equal(completions.length,before.course_enrollments.filter(e=>e.completed_at).length);
        for (const completion of completions) {
            const enrollment=before.course_enrollments.find(e=>e.id===completion.enrollment_id);
            equal(completion.legacy,true);equal(completion.reward_tracking_complete,false);equal(completion.revoked_at,null);
            equal(completion.completed_at,enrollment.completed_at);
            equal(completion.certificate_snapshot.course_title,before.courses.find(c=>c.id===enrollment.course_id).title);
            equal(completion.certificate_snapshot.participant_name,'student');
            if(enrollment.certificate_hash)equal(completion.certificate_snapshot.certificate_hash,enrollment.certificate_hash);
            else {assert.match(completion.certificate_snapshot.certificate_hash,/^[a-f0-9]{64}$/);checks++;}
        }
        equal((await sql("select count(*)::integer n from academy_reward_claims where course_id=$1 and user_id=$2 and reward_kind='completion'",[record.courses.published,ids.student])).rows[0].n,1);
        equal((await sql("select count(*)::integer n from academy_reward_claims where course_id=$1 and user_id=$2 and reward_kind='completion'",[record.courses.published,ids.trainer])).rows[0].n,1);
        equal((await sql("select count(*)::integer n from academy_reward_claims where user_id=$1 and reward_kind='first_publication'",[ids.trainer])).rows[0].n,1);
        equal((await sql("select count(*)::integer n from academy_reward_claims where user_id=$1 and reward_kind='first_publication'",[ids.admin])).rows[0].n,1);
        for (const previous of before.course_questions) {
            const current=await row('course_questions',previous.id);
            equal(current.question_text,previous.question_text);equal(current.created_at,previous.created_at);
            equal(current.version_id,published.published_version_id);
            equal(current.enrollment_id,previous.id===record.discussion?record.completed:null);
        }
        equal((await row('learning_path_enrollments',record.pathEnrollment)).required_course_ids,[record.courses.archived,record.courses.published]);
        equal((await sql('select current_streak,longest_streak,last_activity_date::text from academy_learning_streaks where user_id=$1',[ids.student])).rows[0],{current_streak:7,longest_streak:7,last_activity_date:'2026-08-10'});
        equal((await sql('select count(*)::integer n from academy_user_capabilities')).rows[0].n,0);
        equal((await sql('select mode from academy_rollout_settings')).rows[0].mode,'closed');
        await actor('student');equal(await rpc('academy_can_access'),false);
        await actor('admin');await rpc('academy_set_rollout',['open',[]]);
        await actor(ids.newStudent);await f.expectDenied('select academy_enroll($1,null)',[record.courses.published],/legacy.*review/);checks++;
        await actor('other');await f.expectDenied('select academy_enroll($1,null)',[record.courses.archived]);checks++;
        // An existing enrollment keeps access while the catalogue is held.
        await actor('student');equal(await rpc('academy_enrollment_has_access',[record.completed]),true);
        equal((await sql('select id from course_completions where enrollment_id=$1',[record.completed])).rows.length,1);
        // A genuinely new learner cannot bypass mandatory independent review.
        await actor('admin');await rpc('academy_set_trainer',[ids.trainer,true]);
        await actor('trainer');await f.expectDenied('select academy_review_legacy_course($1,true,null,$2)',[record.courses.published,published.published_version_id],/independent_admin_review_required/);checks++;
        await actor('internal');await f.expectDenied('select academy_enroll($1,null)',[record.courses.published]);checks++;
        await actor('admin');await rpc('academy_review_legacy_course',[record.courses.published,true,null,published.published_version_id]);
        equal((await sql('select legacy_review_required from courses where id=$1',[record.courses.published])).rows[0].legacy_review_required,false);
        await actor(ids.newStudent);assert(await rpc('academy_enroll',[record.courses.published,null]));checks++;
        await actor('admin');
        await f.expectDenied('select academy_review_course($1,false,$2)',[published.published_version_id,'Odrzucone'],/permission denied/);checks++;
        await f.expectDenied('select academy_review_legacy_course($1,true,null,$2)',[f.legacy,(await row('courses',f.legacy)).published_version_id],/independent_admin_review_required/);checks++;
        const archived=await row('courses',record.courses.archived);
        await rpc('academy_review_legacy_course',[archived.id,true,null,archived.published_version_id]);
        equal((await row('courses',archived.id)).status,'archived');
        // Republishing a backfilled author course cannot become a new first
        // publication, nor move historical enrollments/certificates to v2.
        await actor('trainer');const next=await rpc('academy_begin_draft',[published.id]);
        await rpc('academy_update_course',[published.id,{title:'Nowa wersja po aktualizacji',completion_rules:{quiz_required:false,quiz_pass_percent:80,require_all_lessons:true,attendance_percent:80}}]);
        await rpc('academy_replace_quiz',[published.id,[]]);
        await rpc('academy_submit_for_review',[published.id]);
        const token=(await row('course_versions',next)).submission_id;
        await actor('admin');await rpc('academy_review_course',[next,true,null,token]);
        equal((await row('course_enrollments',record.completed)).version_id,published.published_version_id);
        equal((await row('course_versions',next)).version_number,2);
        equal((await sql('select certificate_snapshot from course_completions where enrollment_id=$1',[record.completed])).rows[0].certificate_snapshot.course_title,'Zażółć gęślą jaźń — published');
        const oldCompletion=completions.find(completion=>completion.enrollment_id===record.completed);
        const revocation=await rpc('academy_revoke_completion',[oldCompletion.id,'Kontrolowana korekta historycznego zaliczenia']);
        equal(revocation.rewards_state,'manual_review');equal(revocation.reversed_transactions,0);equal(revocation.manual_reward_review_required,true);
        equal((await row('course_enrollments',record.completed)).completed_at,oldCompletion.completed_at);
        await owner();equal((await sql('select to_jsonb(t) as row from loyalty_transactions t order by id')).rows.map(r=>r.row),before.loyalty_transactions);
        // The real profile guard must preserve privilege columns during a
        // loyalty/streak write while keeping its audit side effect functional.
        await actor('student');await sql("update profiles set role='admin',learning_streak_current=8 where id=$1",[ids.student]);
        equal((await sql('select role::text,learning_streak_current from profiles where id=$1',[ids.student])).rows[0],{role:'consultant',learning_streak_current:8});
        await owner();equal((await sql("select count(*)::integer n from audit_logs where action='PROFILE_PRIVILEGE_CHANGE_BLOCKED' and user_id=$1",[ids.student])).rows[0].n,1);
        return {check:'canonical_dependency_upgrade_and_legacy_backfill',outcome:'passed',engine:f.engine,checks,...f.baselineProof,migrationsApplied:f.appliedMigrations};
    } finally {await f.db.close();}
}

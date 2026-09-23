-- Run only against a supplied, isolated database copy. This script is read-only.
-- psql -X -q -t -A -v ON_ERROR_STOP=1 -f ops/academy/restore/export.sql > export.json
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object(
  'format', 'compass-academy-restore-v2',
  'schemaTables', (SELECT coalesce(jsonb_agg(n.nspname || '.' || c.relname ORDER BY n.nspname, c.relname), '[]'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND ((n.nspname = 'public' AND
      (c.relname ~ '^academy_' OR c.relname ~ '^course_' OR c.relname = 'courses' OR c.relname ~ '^learning_path' OR c.relname = 'session_attendance'))
      OR n.nspname = 'academy_private')),
  'storageObjects', (SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'path', name)
      ORDER BY bucket_id, name), '[]'::jsonb)
    FROM storage.objects
    WHERE bucket_id = 'academy-materials' OR (bucket_id = 'documents' AND name LIKE 'courses/%')),
  'tables', jsonb_build_object(
    'academy_private.run_contributors', coalesce((select jsonb_agg(to_jsonb(t)) from academy_private.run_contributors t), '[]'::jsonb),
    'academy_private.run_obligations', coalesce((select jsonb_agg(to_jsonb(t)) from academy_private.run_obligations t), '[]'::jsonb),
    'academy_private.version_contributors', coalesce((select jsonb_agg(to_jsonb(t)) from academy_private.version_contributors t), '[]'::jsonb),
    'public.academy_attendance_reports', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_attendance_reports t), '[]'::jsonb),
    'public.academy_audit_events', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_audit_events t), '[]'::jsonb),
    'public.academy_completion_revocations', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_completion_revocations t), '[]'::jsonb),
    'public.academy_completion_rewards', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_completion_rewards t), '[]'::jsonb),
    'public.academy_integration_jobs', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_integration_jobs t), '[]'::jsonb),
    'public.academy_learning_streaks', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_learning_streaks t), '[]'::jsonb),
    'public.academy_legacy_reviews', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_legacy_reviews t), '[]'::jsonb),
    'public.academy_m365_identities', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_m365_identities t), '[]'::jsonb),
    'public.academy_notification_receipts', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_notification_receipts t), '[]'::jsonb),
    'public.academy_organizers', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_organizers t), '[]'::jsonb),
    'public.academy_reward_claims', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_reward_claims t), '[]'::jsonb),
    'public.academy_rollout_settings', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_rollout_settings t), '[]'::jsonb),
    'public.academy_session_integrations', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_session_integrations t), '[]'::jsonb),
    'public.academy_user_capabilities', coalesce((select jsonb_agg(to_jsonb(t)) from public.academy_user_capabilities t), '[]'::jsonb),
    'public.course_answers', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_answers t), '[]'::jsonb),
    'public.course_completions', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_completions t), '[]'::jsonb),
    'public.course_enrollments', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_enrollments t), '[]'::jsonb),
    'public.course_lessons', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_lessons t), '[]'::jsonb),
    'public.course_materials', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_materials t), '[]'::jsonb),
    'public.course_questions', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_questions t), '[]'::jsonb),
    'public.course_quiz_attempts', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_quiz_attempts t), '[]'::jsonb),
    'public.course_quiz_options', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_quiz_options t), '[]'::jsonb),
    'public.course_quiz_questions', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_quiz_questions t), '[]'::jsonb),
    'public.course_ratings', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_ratings t), '[]'::jsonb),
    'public.course_run_registrations', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_run_registrations t), '[]'::jsonb),
    'public.course_run_staff', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_run_staff t), '[]'::jsonb),
    'public.course_runs', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_runs t), '[]'::jsonb),
    'public.course_sessions', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_sessions t), '[]'::jsonb),
    'public.course_staff', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_staff t), '[]'::jsonb),
    'public.course_survey_responses', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_survey_responses t), '[]'::jsonb),
    'public.course_versions', coalesce((select jsonb_agg(to_jsonb(t)) from public.course_versions t), '[]'::jsonb),
    'public.courses', coalesce((select jsonb_agg(to_jsonb(t)) from public.courses t), '[]'::jsonb),
    'public.learning_path_courses', coalesce((select jsonb_agg(to_jsonb(t)) from public.learning_path_courses t), '[]'::jsonb),
    'public.learning_path_enrollments', coalesce((select jsonb_agg(to_jsonb(t)) from public.learning_path_enrollments t), '[]'::jsonb),
    'public.learning_paths', coalesce((select jsonb_agg(to_jsonb(t)) from public.learning_paths t), '[]'::jsonb),
    'public.session_attendance', coalesce((select jsonb_agg(to_jsonb(t)) from public.session_attendance t), '[]'::jsonb)
  )
)::text;
COMMIT;

-- Read-only preflight for the legacy LMS before Academy migrations.
-- Run only after confirming the target project. No user identities are returned.
SELECT jsonb_build_object(
  'academy_already_installed', to_regclass('public.course_versions') IS NOT NULL,
  'courses', (SELECT count(*) FROM public.courses),
  'lessons', (SELECT count(*) FROM public.course_lessons),
  'enrollments', (SELECT count(*) FROM public.course_enrollments),
  'completed_enrollments', (SELECT count(*) FROM public.course_enrollments WHERE completed_at IS NOT NULL),
  'certificates', (SELECT count(*) FROM public.course_enrollments WHERE certificate_hash IS NOT NULL),
  'unrecognized_course_states', (SELECT count(*) FROM public.courses
    WHERE status NOT IN ('draft','pending_review','published','rejected','archived')),
  'orphan_enrollments', (SELECT count(*) FROM public.course_enrollments e
    LEFT JOIN public.courses c ON c.id=e.course_id LEFT JOIN public.profiles p ON p.id=e.user_id
    WHERE c.id IS NULL OR p.id IS NULL),
  'required_legacy_constraints', (SELECT count(*) FROM pg_constraint
    WHERE connamespace='public'::regnamespace AND conname IN (
      'course_lessons_course_id_order_index_key',
      'course_quiz_questions_course_id_order_index_key',
      'course_enrollments_user_id_course_id_key')),
  'academy_bucket_exists', EXISTS(SELECT 1 FROM storage.buckets WHERE id='academy-materials')
) AS academy_preflight;

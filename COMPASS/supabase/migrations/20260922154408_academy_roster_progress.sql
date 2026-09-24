-- Read-only roster: authoritative completion state and pinned learning progress.
-- Additive replacement; no changes to enrollment history, answers, or RLS scope.
BEGIN;

CREATE OR REPLACE FUNCTION public.academy_run_participants(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.academy_can_manage_run(p_run_id) THEN
  RAISE EXCEPTION 'Brak uprawnień do listy uczestników.' USING ERRCODE='42501';
 END IF;
 RETURN (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'registrationId',r.id,'userId',r.user_id,'enrollmentId',r.enrollment_id,
   'fullName',p.full_name,'email',p.email,'status',r.status,
   'completedAt',c.completed_at,'completionRevokedAt',c.revoked_at,
   'completionState',CASE WHEN c.revoked_at IS NOT NULL THEN 'revoked'
     WHEN c.id IS NOT NULL THEN 'completed' ELSE 'pending' END,
   'progress',CASE WHEN e.id IS NOT NULL THEN jsonb_build_object(
    'versionNumber',v.version_number,
    'totalLessons',lessons.total,'completedLessons',lessons.completed,
    'lessonPercent',CASE WHEN lessons.total>0 THEN round(lessons.completed*100.0/lessons.total)::integer ELSE 0 END,
    'requireAllLessons',(v.completion_rules->>'require_all_lessons')::boolean,
    'quizRequired',(v.completion_rules->>'quiz_required')::boolean,
    'quizPassPercent',(v.completion_rules->>'quiz_pass_percent')::integer,
    'quizPassed',COALESCE(quiz.passed,false),'quizBestScorePercent',quiz.best_score,
    'quizAttemptCount',quiz.attempts) END,
   'attendance',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'sessionId',a.session_id,'status',a.status,'attendedSeconds',a.attended_seconds,
    'source',a.source,'note',a.note) ORDER BY s.starts_at,s.id),'[]')
    FROM public.session_attendance a JOIN public.course_sessions s ON s.id=a.session_id AND s.run_id=r.run_id
    WHERE a.enrollment_id=e.id)
   ) ORDER BY r.created_at,r.id),'[]')
  FROM public.course_run_registrations r
  JOIN public.course_runs run ON run.id=r.run_id
  JOIN public.profiles p ON p.id=r.user_id
  LEFT JOIN public.course_enrollments e ON e.id=r.enrollment_id AND e.user_id=r.user_id
   AND e.run_id=r.run_id AND e.course_id=run.course_id AND e.version_id=run.version_id
  LEFT JOIN public.course_versions v ON v.id=e.version_id AND v.course_id=e.course_id
  LEFT JOIN public.course_completions c ON c.enrollment_id=e.id AND c.user_id=e.user_id
   AND c.course_id=e.course_id AND c.version_id=e.version_id
  LEFT JOIN LATERAL (
   SELECT count(*)::integer AS total,
    count(*) FILTER(WHERE l.id=ANY(COALESCE(e.completed_lessons,'{}')))::integer AS completed
   FROM public.course_lessons l WHERE l.version_id=e.version_id AND l.course_id=e.course_id
  ) lessons ON true
  LEFT JOIN LATERAL (
   SELECT count(*)::integer AS attempts,max(a.score_percent) AS best_score,bool_or(a.passed) AS passed
   FROM public.course_quiz_attempts a WHERE a.enrollment_id=e.id AND a.user_id=e.user_id AND a.course_id=e.course_id
  ) quiz ON true
  WHERE r.run_id=p_run_id
 );
END $$;
REVOKE ALL ON FUNCTION public.academy_run_participants(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_run_participants(uuid) TO authenticated;

COMMIT;

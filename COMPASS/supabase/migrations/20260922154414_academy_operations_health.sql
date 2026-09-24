-- Read-only aggregate health. Never expose audit payloads, identities or storage paths.
-- Caller must first pass the server admin/cron guard; ordinary clients cannot execute.
CREATE OR REPLACE FUNCTION public.academy_operations_health()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=public,pg_temp SET statement_timeout='8s' AS $$
 SELECT jsonb_build_object(
  'checkedAt',now(),
  'workers',(
   SELECT jsonb_agg(jsonb_build_object('kind',w.kind,'lastFinishedAt',a.created_at,
    'ok',COALESCE(a.details->>'status'='200' AND a.details->'stats'->>'ok'='true' AND COALESCE(a.details->>'failed','false')<>'true',false)))
   FROM (VALUES('materials','ACADEMY_MATERIAL_SCAN_RUN'),('sync','ACADEMY_SYNC_RUN')) AS w(kind,action)
   LEFT JOIN LATERAL (SELECT created_at,details FROM public.audit_logs
    WHERE action=w.action AND user_id IS NULL AND details->>'phase'='done'
    ORDER BY created_at DESC LIMIT 1) a ON true
  ),
  'materials',(
   SELECT jsonb_build_object('pending',count(*) FILTER(WHERE status IN('quarantined','scanning')),
    'failed',count(*) FILTER(WHERE scan_attempts>=5 AND (status='quarantined'
      OR (status='scanning' AND (scan_started_at IS NULL OR scan_started_at<now()-interval '15 minutes')))),
    -- Reservation may precede a resumed upload by hours. Waiting starts only
    -- after finalization (the existing retention trigger records that transition).
    -- A live scanner lease, including its fifth attempt, is not a waiting failure.
    'oldestDueAt',min(CASE
      WHEN status='quarantined' AND greatest(scan_next_attempt_at,retention_changed_at)<=now()
        THEN greatest(scan_next_attempt_at,retention_changed_at)
      WHEN status='scanning' AND (scan_started_at IS NULL OR scan_started_at<now()-interval '15 minutes')
        THEN greatest(scan_next_attempt_at,coalesce(scan_started_at+interval '15 minutes',retention_changed_at))
      END))
   FROM public.course_materials WHERE purged_at IS NULL
  ),
  'integrations',(
   SELECT jsonb_build_object('pending',count(*) FILTER(WHERE status IN('pending','retry','processing')),
    'failed',count(*) FILTER(WHERE status='failed'),
    'oldestDueAt',min(available_at) FILTER(WHERE status IN('pending','retry','processing') AND available_at<=now()))
   FROM public.academy_integration_jobs
  ),
  'storage',(
   SELECT jsonb_build_object('reservedBytes',COALESCE(sum(bytes),0),
    'authorsNearQuota',count(*) FILTER(WHERE bytes>=8589934592))
   FROM (SELECT sum(size_bytes) AS bytes FROM public.course_materials WHERE purged_at IS NULL GROUP BY uploaded_by) q
  )
 );
$$;
REVOKE ALL ON FUNCTION public.academy_operations_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_operations_health() TO service_role;
-- Limit each latest heartbeat lookup even when audit history grows.
CREATE INDEX IF NOT EXISTS academy_worker_heartbeat_latest
 ON public.audit_logs(action,created_at DESC)
 WHERE user_id IS NULL AND action IN('ACADEMY_MATERIAL_SCAN_RUN','ACADEMY_SYNC_RUN') AND details->>'phase'='done';

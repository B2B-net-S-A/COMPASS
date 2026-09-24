-- Read-only, service-role-only counterpart of academy_job_context's confirmed
-- participant roster. The export uses it to resolve Graph records without
-- ever returning another participant's identifiers to the data subject.
CREATE FUNCTION public.academy_gdpr_attendance_roster(p_session_ids uuid[])
RETURNS TABLE(session_id uuid, participants jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF p_session_ids IS NULL OR cardinality(p_session_ids) < 1 OR cardinality(p_session_ids) > 50
        OR array_position(p_session_ids,NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_academy_gdpr_session_ids';
    END IF;

    RETURN QUERY
    SELECT s.id,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('profileId',p.id,
            'identities',(SELECT COALESCE(jsonb_agg(jsonb_build_object('tenantId',x.tenant_id,'objectId',x.object_id)),'[]'::jsonb)
                FROM public.academy_m365_identities x WHERE x.user_id=p.id),
            'verifiedEmails',(SELECT COALESCE(jsonb_agg(email),'[]'::jsonb) FROM (
                SELECT u.email WHERE u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
                UNION SELECT x.verified_email FROM public.academy_m365_identities x
                    WHERE x.user_id=p.id AND x.verified_email IS NOT NULL) verified)
        ))
        FROM public.course_run_registrations reg
        JOIN public.profiles p ON p.id=reg.user_id
        JOIN auth.users u ON u.id=p.id
        WHERE reg.run_id=s.run_id AND reg.status='confirmed'), '[]'::jsonb)
    FROM public.course_sessions s
    WHERE s.id=ANY(p_session_ids);
END $$;

REVOKE ALL ON FUNCTION public.academy_gdpr_attendance_roster(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_gdpr_attendance_roster(uuid[]) TO service_role;

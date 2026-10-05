-- Project private declarations through a service-only bounded subject lookup.
-- A scalar JSON array avoids PostgREST's row-limit silently truncating a set RPC.
-- It does not change retention or delete any evidence.
CREATE FUNCTION public.academy_gdpr_teaching_interest(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_user_id IS NULL THEN RAISE EXCEPTION 'invalid_gdpr_subject'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('response_id',own.response_id,'user_id',own.user_id,
 'willing_to_teach',own.willing_to_teach,'proposed_topic',own.proposed_topic,'contact_preference',own.contact_preference) ORDER BY own.response_id)
 FROM (SELECT i.response_id,r.user_id,i.willing_to_teach,i.proposed_topic,i.contact_preference
 FROM academy_private.edition_teaching_interest i JOIN public.academy_edition_survey_responses r ON r.id=i.response_id
 WHERE r.user_id=p_user_id ORDER BY i.response_id LIMIT 5001) own),'[]');
END $$;
REVOKE ALL ON FUNCTION public.academy_gdpr_teaching_interest(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_gdpr_teaching_interest(uuid) TO service_role;

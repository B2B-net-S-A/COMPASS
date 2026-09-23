-- Page verified Microsoft identities without silently hiding mappings after row 100.
CREATE FUNCTION public.academy_list_m365_identities_page(
    p_search text DEFAULT '', p_page integer DEFAULT 1, p_limit integer DEFAULT 25
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_search text := lower(btrim(COALESCE(p_search, '')));
BEGIN
    IF auth.uid() IS NULL OR NOT public.academy_can_access() OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501';
    END IF;
    IF length(v_search)>100 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
        OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'Nieprawidłowe parametry listy powiązań.';
    END IF;
    RETURN (
        WITH filtered AS (
            SELECT x.id, x.user_id, x.tenant_id, x.object_id, x.verified_email,
                x.verified_at, x.invitation_target, p.full_name, p.email
            FROM public.academy_m365_identities x JOIN public.profiles p ON p.id=x.user_id
            WHERE v_search='' OR position(v_search IN lower(
                COALESCE(p.full_name,'')||' '||p.email||' '||COALESCE(x.verified_email,'')))>0
        ), page_rows AS (
            SELECT * FROM filtered ORDER BY verified_at DESC,id DESC
            LIMIT p_limit OFFSET (p_page-1)*p_limit
        )
        SELECT jsonb_build_object(
            'page',p_page,'pageSize',p_limit,
            'total',(SELECT count(*) FROM filtered),
            'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'id',id,'userId',user_id,'fullName',full_name,'email',email,
                'tenantId',tenant_id,'objectId',object_id,'verifiedEmail',verified_email,
                'verifiedAt',verified_at,'invitationTarget',invitation_target)
                ORDER BY verified_at DESC,id DESC) FROM page_rows),'[]'::jsonb)
        )
    );
END $$;

REVOKE ALL ON FUNCTION public.academy_list_m365_identities_page(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_list_m365_identities_page(text,integer,integer) TO authenticated;

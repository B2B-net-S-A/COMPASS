-- B5.2: publiczna weryfikacja dokumentu. Osobna tabela, bo course_completions i
-- academy_participation_documents są niezmienne (guard_completion_history). Link włącza
-- właściciel dokumentu, a strona czyta dane wyłącznie przez service role, bez wyniku testu.
-- Cofnięcie: supabase/rollbacks/20261110123000_academy_b5_2_document_verify.sql
BEGIN;

CREATE TABLE public.academy_document_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    completion_id uuid UNIQUE REFERENCES public.course_completions(id),
    participation_id uuid UNIQUE REFERENCES public.academy_participation_documents(id),
    public_code text NOT NULL UNIQUE CHECK (public_code ~ '^[a-f0-9]{32}$'),
    share_enabled boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT academy_document_share_one_document CHECK (num_nonnulls(completion_id,participation_id)=1)
);
ALTER TABLE public.academy_document_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_document_shares FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_document_shares TO authenticated;
GRANT ALL ON public.academy_document_shares TO service_role;
CREATE POLICY academy_document_shares_own ON public.academy_document_shares FOR SELECT TO authenticated
    USING (public.academy_can_access() AND user_id=auth.uid());

-- Dwa wyszukania zamiast ON CONFLICT, bo klucz zależy od rodzaju dokumentu.
CREATE FUNCTION public.academy_set_document_share(p_kind text,p_document_id uuid,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_owner uuid; v_course uuid; r public.academy_document_shares;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    IF p_kind='certificate' THEN
        SELECT user_id,course_id INTO v_owner,v_course FROM public.course_completions WHERE id=p_document_id;
        SELECT * INTO r FROM public.academy_document_shares WHERE completion_id=p_document_id FOR UPDATE;
    ELSIF p_kind='participation' THEN
        SELECT user_id,course_id INTO v_owner,v_course FROM public.academy_participation_documents WHERE id=p_document_id;
        SELECT * INTO r FROM public.academy_document_shares WHERE participation_id=p_document_id FOR UPDATE;
    ELSE RAISE EXCEPTION 'invalid_document_kind'; END IF;
    IF v_owner IS NULL OR v_owner<>auth.uid() THEN RAISE EXCEPTION 'own_document_required' USING ERRCODE='42501'; END IF;
    IF r.id IS NULL THEN
        INSERT INTO public.academy_document_shares(user_id,completion_id,participation_id,public_code,share_enabled)
        VALUES(v_owner,CASE WHEN p_kind='certificate' THEN p_document_id END,CASE WHEN p_kind='participation' THEN p_document_id END,
            replace(gen_random_uuid()::text,'-',''),p_enabled) RETURNING * INTO r;
    ELSE
        UPDATE public.academy_document_shares SET share_enabled=p_enabled,updated_at=now() WHERE id=r.id RETURNING * INTO r;
    END IF;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'DOCUMENT_SHARE_SET',v_course,jsonb_build_object('kind',p_kind,'document_id',p_document_id,'enabled',p_enabled));
    RETURN jsonb_build_object('public_code',r.public_code,'share_enabled',r.share_enabled);
END $$;
REVOKE ALL ON FUNCTION public.academy_set_document_share(text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_set_document_share(text,uuid,boolean) TO authenticated;

-- Wyłącznie service role: adres i źródło konta służą tylko decyzji o wyjątku dla kont
-- próbnych i nie trafiają na stronę. Żadnego wyniku testu.
CREATE FUNCTION public.academy_verify_document(p_code text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT jsonb_build_object(
        'kind',CASE WHEN s.completion_id IS NOT NULL THEN 'certificate' ELSE 'participation' END,
        'course_title',COALESCE(c.certificate_snapshot->>'course_title',d.snapshot->>'course_title'),
        'participant_name',COALESCE(c.certificate_snapshot->>'participant_name',d.snapshot->>'participant_name'),
        'issued_at',COALESCE(c.completed_at,d.issued_at),
        'valid_until',c.certificate_snapshot->>'valid_until',
        'revoked_at',c.revoked_at,
        'owner_email',lower(p.email),
        'owner_source',(SELECT a.source FROM public.academy_learner_accounts a WHERE a.user_id=s.user_id LIMIT 1))
    FROM public.academy_document_shares s
    JOIN public.profiles p ON p.id=s.user_id
    LEFT JOIN public.course_completions c ON c.id=s.completion_id
    LEFT JOIN public.academy_participation_documents d ON d.id=s.participation_id
    WHERE s.public_code=p_code AND s.share_enabled;
$$;
REVOKE ALL ON FUNCTION public.academy_verify_document(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_verify_document(text) TO service_role;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF to_regclass('public.academy_document_shares') IS NULL THEN RAISE EXCEPTION 'shares table missing'; END IF;
    IF has_table_privilege('authenticated','public.academy_document_shares','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'users can write shares directly'; END IF;
    IF has_function_privilege('anon','public.academy_verify_document(text)','EXECUTE') OR has_function_privilege('authenticated','public.academy_verify_document(text)','EXECUTE') THEN
        RAISE EXCEPTION 'verification RPC exposed outside service role';
    END IF;
    IF position('score_percent' IN pg_get_functiondef('public.academy_verify_document(text)'::regprocedure))>0 THEN RAISE EXCEPTION 'verification leaks the score'; END IF;
END $$;

COMMIT;

-- Phase 20e — Relax is_manager_of() to not require role='manager'
-- Date: 2026-05-16
--
-- Rationale: po wprowadzeniu Phase 20 okazało się że Finanse (Dorota) ma być
-- managerem dla 4 osób finanse, plus admin (Artur) jest managerem dla 4 osób.
-- Pierwotne is_manager_of() wymagało role='manager' — blokowało finanse/admin.
--
-- Teraz: każdy HR-zone user, kto MA podwładnych przez profiles.manager_id link,
-- automatycznie staje się ich team managerem. Role nadal określa SCOPE
-- (manager landing /internal, finanse aprobuje stage 2, etc.), ale relacja
-- manager-podwładny opiera się WYŁĄCZNIE na manager_id link.

CREATE OR REPLACE FUNCTION public.is_manager_of(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = target_user_id
          AND p.manager_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.is_manager_of IS
    'Phase 20 + 20e. True iff current user is the manager (via profiles.manager_id link) of target_user_id. Role-agnostic — any HR-zone user with direct reports is a team manager.';

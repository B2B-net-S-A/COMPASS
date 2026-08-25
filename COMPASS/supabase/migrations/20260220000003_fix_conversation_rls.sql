-- Fix: conversation_participants RLS infinite recursion
-- The old "View participants" policy self-referenced conversation_participants
-- inside a subquery, causing PostgreSQL to recursively apply the same RLS policy.
-- Solution: use a SECURITY DEFINER function to bypass RLS for the membership check.
-- 1. Drop the recursive policy
DROP POLICY IF EXISTS "View participants" ON public.conversation_participants;
-- 2. Create helper function (SECURITY DEFINER bypasses RLS on the inner query)
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
SELECT EXISTS (
        SELECT 1
        FROM public.conversation_participants
        WHERE conversation_id = conv_id
            AND user_id = auth.uid()
    );
$$;
-- 3. New non-recursive policy
-- You can see participants if: you are that participant, OR you are a member of the same conversation
CREATE POLICY "View participants" ON public.conversation_participants FOR
SELECT USING (
        user_id = auth.uid()
        OR public.is_conversation_member(conversation_id)
    );
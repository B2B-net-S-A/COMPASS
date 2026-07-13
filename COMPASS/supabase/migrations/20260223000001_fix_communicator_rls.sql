-- Fix missing INSERT/UPDATE RLS policies for communicator tables
-- Root cause: m10_communicator_setup.sql only created SELECT policies
-- and INSERT policy on messages, but conversations and conversation_participants
-- had no INSERT or UPDATE policies, blocking conversation creation.

-- ============================================================
-- 1. CONVERSATIONS: INSERT policy
-- Any authenticated user can create a conversation.
-- Business logic (direct vs broadcast, role checks) is enforced in server actions.
-- ============================================================
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
CREATE POLICY "Users can create conversations"
    ON public.conversations
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 2. CONVERSATIONS: UPDATE policy
-- Participants can update conversations they belong to (e.g. last_message_at).
-- ============================================================
DROP POLICY IF EXISTS "Participants can update conversations" ON public.conversations;
CREATE POLICY "Participants can update conversations"
    ON public.conversations
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_participants
            WHERE conversation_id = conversations.id
              AND user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversation_participants
            WHERE conversation_id = conversations.id
              AND user_id = auth.uid()
        )
    );

-- ============================================================
-- 3. CONVERSATION_PARTICIPANTS: INSERT policy
-- Authenticated users can add participants.
-- For direct chats: server action adds both users at creation.
-- For broadcast: server action validates admin role before inserting.
-- ============================================================
DROP POLICY IF EXISTS "Users can add participants" ON public.conversation_participants;
CREATE POLICY "Users can add participants"
    ON public.conversation_participants
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 4. CONVERSATION_PARTICIPANTS: UPDATE policy
-- Users can update their own participant record (e.g. last_read_at).
-- ============================================================
DROP POLICY IF EXISTS "Users can update own participant record" ON public.conversation_participants;
CREATE POLICY "Users can update own participant record"
    ON public.conversation_participants
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 5. Grant table-level permissions to authenticated role
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversation_participants TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

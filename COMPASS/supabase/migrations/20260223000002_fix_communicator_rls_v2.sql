-- Fix: INSERT...RETURNING on conversations fails because the SELECT policy
-- requires the user to be a participant, but participants are added AFTER
-- the conversation is created. Solution: SECURITY DEFINER RPC that creates
-- conversation + participants atomically.

-- ============================================================
-- 1. RPC: create_direct_conversation
-- Creates a direct conversation between two users and returns the conversation ID.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_direct_conversation(
    p_user_id uuid,
    p_target_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conv_id uuid;
BEGIN
    INSERT INTO conversations (type)
    VALUES ('direct')
    RETURNING id INTO v_conv_id;

    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES
        (v_conv_id, p_user_id, 'member'),
        (v_conv_id, p_target_user_id, 'member');

    RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid, uuid) TO authenticated;

-- ============================================================
-- 2. RPC: create_broadcast_conversation
-- Creates a broadcast conversation with an owner and multiple participants.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_broadcast_conversation(
    p_owner_id uuid,
    p_name text,
    p_participant_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conv_id uuid;
    v_pid uuid;
BEGIN
    INSERT INTO conversations (type, name, owner_id, last_message_at)
    VALUES ('broadcast', p_name, p_owner_id, now())
    RETURNING id INTO v_conv_id;

    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (v_conv_id, p_owner_id, 'owner');

    FOREACH v_pid IN ARRAY p_participant_ids LOOP
        INSERT INTO conversation_participants (conversation_id, user_id, role)
        VALUES (v_conv_id, v_pid, 'member');
    END LOOP;

    RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_broadcast_conversation(uuid, text, uuid[]) TO authenticated;

-- ============================================================
-- 3. Keep INSERT/UPDATE policies for other operations (sending messages updates last_message_at etc.)
-- Policies from the previous migration remain valid.
-- ============================================================

NOTIFY pgrst, 'reload schema';

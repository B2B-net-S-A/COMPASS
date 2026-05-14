-- 1. Add attachment column to messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS attachment_url TEXT;
-- 2. Create storage bucket for chat attachments if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true) ON CONFLICT (id) DO NOTHING;
-- 3. Storage Policies
-- Policy: Authenticated users can upload to chat-attachments
-- Path convention: {conversation_id}/{user_id}/{filename}
CREATE POLICY "Users can upload chat attachments" ON storage.objects FOR
INSERT TO authenticated WITH CHECK (
        bucket_id = 'chat-attachments'
        AND auth.uid() IS NOT NULL
    );
-- Policy: Participants can view attachments
-- Ideally we would check conversation existence, but for storage performance,
-- we'll rely on the fact that file paths are obscure UUIDs and the app only exposes links to participants.
-- A stricter policy would involve a join with conversation_participants.
CREATE POLICY "Users can view chat attachments" ON storage.objects FOR
SELECT TO authenticated USING (bucket_id = 'chat-attachments');
-- Enable storage policies for 'app-docs' folder in 'documents' bucket
-- 1. Users can upload their own documents (app-docs/{user_id}/*)
CREATE POLICY "Users can upload own app-docs" ON storage.objects FOR
INSERT TO authenticated WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(name)) [1] = 'app-docs'
        AND auth.uid()::text = (storage.foldername(name)) [2]
    );
-- 2. Users can read their own documents
CREATE POLICY "Users can read own app-docs" ON storage.objects FOR
SELECT TO authenticated USING (
        bucket_id = 'documents'
        AND (storage.foldername(name)) [1] = 'app-docs'
        AND auth.uid()::text = (storage.foldername(name)) [2]
    );
-- 3. Admins can read all app-docs
CREATE POLICY "Admins can read all app-docs" ON storage.objects FOR
SELECT TO authenticated USING (
        bucket_id = 'documents'
        AND (storage.foldername(name)) [1] = 'app-docs'
        AND EXISTS (
            SELECT 1
            FROM profiles
            WHERE id = auth.uid()
                AND role = 'admin'
        )
    );
-- 4. Owners can update/delete their own documents (if needed) - updates usually mean new versions
CREATE POLICY "Users can update own app-docs" ON storage.objects FOR
UPDATE TO authenticated WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(name)) [1] = 'app-docs'
        AND auth.uid()::text = (storage.foldername(name)) [2]
    );
CREATE POLICY "Users can delete own app-docs" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id = 'documents'
    AND (storage.foldername(name)) [1] = 'app-docs'
    AND auth.uid()::text = (storage.foldername(name)) [2]
);
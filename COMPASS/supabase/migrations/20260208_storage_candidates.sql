-- Allow Admins to upload to 'candidates' folder in 'documents' bucket
create policy "Admins can upload Candidates CVs" on storage.objects for
insert to authenticated with check (
        bucket_id = 'documents'
        and (storage.foldername(name)) [1] = 'candidates'
        and exists (
            select 1
            from profiles
            where id = auth.uid()
                and role = 'admin'
        )
    );
-- Enable Storage if not already enabled (usually enabled by default)
-- Create a private bucket for documents
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false) on conflict (id) do nothing;
-- Policy: Consultants can upload their own CV
create policy "Consultants can upload their own CV" on storage.objects for
insert to authenticated with check (
        bucket_id = 'documents'
        and (storage.foldername(name)) [1] = 'cvs'
        and auth.uid()::text = (storage.foldername(name)) [2]
    );
-- Policy: Consultants can read their own CV
create policy "Consultants can read their own CV" on storage.objects for
select to authenticated using (
        bucket_id = 'documents'
        and (storage.foldername(name)) [1] = 'cvs'
        and auth.uid()::text = (storage.foldername(name)) [2]
    );
-- Policy: Admins can upload Project Specs
create policy "Admins can upload Project Specs" on storage.objects for
insert to authenticated with check (
        bucket_id = 'documents'
        and (storage.foldername(name)) [1] = 'specs'
        and exists (
            select 1
            from profiles
            where id = auth.uid()
                and role = 'admin'
        )
    );
-- Policy: Admins can read all documents
create policy "Admins can read all documents" on storage.objects for
select to authenticated using (
        bucket_id = 'documents'
        and exists (
            select 1
            from profiles
            where id = auth.uid()
                and role = 'admin'
        )
    );
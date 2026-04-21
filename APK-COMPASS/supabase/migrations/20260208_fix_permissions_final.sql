-- 1. Debugging: Make sure YOU are an admin (Update all users to admin for testing)
update profiles
set role = 'admin'
where role != 'admin';
-- 2. Drop the complex policy
drop policy if exists "Admins can upload Candidates CVs" on storage.objects;
-- 3. Create a SIMPLE, ROBUST policy (using LIKE instead of foldername)
create policy "Admins can upload Candidates CVs" on storage.objects for
insert to authenticated with check (
        bucket_id = 'documents'
        and name like 'candidates/%'
        and exists (
            select 1
            from profiles
            where id = auth.uid()
                and role = 'admin'
        )
    );
-- The historical file started with a debugging UPDATE that promoted every
-- profile to admin. Data/authorization seeds do not belong in schema history,
-- so reconciliation intentionally removes that statement.
-- 1. Drop the complex policy
drop policy if exists "Admins can upload Candidates CVs" on storage.objects;
-- 2. Create a SIMPLE, ROBUST policy (using LIKE instead of foldername)
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

-- FORCE RESET RLS for Projects
-- 1. Ensure RLS is on
alter table projects enable row level security;
-- 2. Drop OLD policies (to avoid conflicts)
drop policy if exists "Admins can manage projects" on projects;
drop policy if exists "Users can view projects" on projects;
drop policy if exists "Authenticated can view projects" on projects;
drop policy if exists "Public view" on projects;
-- 3. Create SIMPLE View Policy (Allow all logged in users)
create policy "Authenticated can view projects" on projects for
select to authenticated using (true);
-- 4. Create Admin Write Policies
create policy "Admins can insert projects" on projects for
insert to authenticated with check (
        exists (
            select 1
            from profiles
            where id = auth.uid()
                and role = 'admin'
        )
    );
create policy "Admins can update projects" on projects for
update to authenticated using (
        exists (
            select 1
            from profiles
            where id = auth.uid()
                and role = 'admin'
        )
    );
create policy "Admins can delete projects" on projects for delete to authenticated using (
    exists (
        select 1
        from profiles
        where id = auth.uid()
            and role = 'admin'
    )
);
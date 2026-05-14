-- Enable RLS
alter table projects enable row level security;
-- Policy: Admins can do everything
create policy "Admins can manage projects" on projects for all to authenticated using (
    exists (
        select 1
        from profiles
        where id = auth.uid()
            and role = 'admin'
    )
);
-- Policy: Authenticated users can view projects
create policy "Users can view projects" on projects for
select to authenticated using (true);
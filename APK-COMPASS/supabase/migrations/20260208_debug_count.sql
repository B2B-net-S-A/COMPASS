create or replace function get_projects_count() returns integer language plpgsql security definer -- bypasses RLS
    as $$ begin return (
        select count(*)
        from projects
    );
end;
$$;
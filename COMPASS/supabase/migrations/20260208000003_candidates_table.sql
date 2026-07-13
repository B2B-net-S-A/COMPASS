-- Create candidates table for bulk import (CRM)
create table if not exists candidates (
    id uuid primary key default gen_random_uuid(),
    full_name text,
    email text,
    phone text,
    bio text,
    skills text [],
    cv_url text,
    status text check (
        status in (
            'new',
            'contacted',
            'interview',
            'hired',
            'rejected'
        )
    ) default 'new',
    created_at timestamptz default now(),
    embedding vector(1536)
);
-- Enable RLS
alter table candidates enable row level security;
-- Policies
create policy "Admins can manage candidates" on candidates for all to authenticated using (
    exists (
        select 1
        from profiles
        where id = auth.uid()
            and role = 'admin'
    )
);
-- RPC for matching
create or replace function match_projects (
        query_embedding vector(1536),
        match_threshold float,
        match_count int
    ) returns table (
        id uuid,
        title text,
        description text,
        required_skills text [],
        similarity float
    ) language plpgsql as $$ begin return query
select projects.id,
    projects.title,
    projects.description,
    projects.required_skills,
    1 - (projects.embedding <=> query_embedding) as similarity
from projects
where 1 - (projects.embedding <=> query_embedding) > match_threshold
order by projects.embedding <=> query_embedding
limit match_count;
end;
$$;
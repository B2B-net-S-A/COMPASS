-- 1. Enable pgvector extension
create extension if not exists vector;
-- 2. Create projects table
create table if not exists projects (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text not null,
    required_skills text [],
    -- Array of strings e.g. ['React', 'Node.js']
    budget_range text,
    created_at timestamptz default now(),
    embedding vector(1536) -- OpenAI embedding size (text-embedding-3-small)
);
-- 3. Add embedding and bio to profiles
alter table profiles
add column if not exists bio text;
alter table profiles
add column if not exists embedding vector(1536);
-- 4. Create matching function (Cosine Similarity)
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
-- COMPASS P0 / C1 (expand): safe directory, opaque calendar tokens and
-- private chat-attachment metadata. This migration is additive; C2 removes
-- the temporary broad profiles policy only after the app has switched.

begin;

-- -------------------------------------------------------------------------
-- 1. Safe cross-user directory.
-- -------------------------------------------------------------------------

create table public.profile_directory (
  id uuid primary key references public.profiles(id) on delete cascade,
  full_name text,
  avatar_url text,
  job_title text,
  department text
);

alter table public.profile_directory enable row level security;

revoke all privileges on table public.profile_directory from public, anon, authenticated;
grant select on table public.profile_directory to authenticated;
grant select, insert, update, delete on table public.profile_directory to service_role;

create policy "profile_directory_read_authenticated"
on public.profile_directory
for select
to authenticated
using ((select auth.uid()) is not null);

insert into public.profile_directory (id, full_name, avatar_url, job_title, department)
select id, full_name, avatar_url, job_title, department
from public.profiles
on conflict (id) do update
set full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    job_title = excluded.job_title,
    department = excluded.department;

create function private.sync_profile_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profile_directory (
    id,
    full_name,
    avatar_url,
    job_title,
    department
  )
  values (
    new.id,
    new.full_name,
    new.avatar_url,
    new.job_title,
    new.department
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      job_title = excluded.job_title,
      department = excluded.department;

  return new;
end;
$function$;

revoke all on function private.sync_profile_directory()
  from public, anon, authenticated, service_role;

create trigger trg_profiles_sync_safe_directory
after insert or update of full_name, avatar_url, job_title, department
on public.profiles
for each row
execute function private.sync_profile_directory();

comment on table public.profile_directory is
  'Minimal authenticated directory. Deliberately excludes email, phone, role and all HR/financial fields.';

-- -------------------------------------------------------------------------
-- 2. Opaque calendar-feed tokens. Only SHA-256 hex digests are persisted.
-- -------------------------------------------------------------------------

create table public.calendar_feed_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  constraint calendar_feed_tokens_sha256_hex
    check (token_hash ~ '^[0-9a-f]{64}$')
);

alter table public.calendar_feed_tokens enable row level security;

revoke all privileges on table public.calendar_feed_tokens
  from public, anon, authenticated;
grant select, insert, update, delete on table public.calendar_feed_tokens
  to service_role;

comment on table public.calendar_feed_tokens is
  'One opaque calendar-feed token per user. Raw tokens are returned once and never stored.';

-- -------------------------------------------------------------------------
-- 3. Chat attachments: metadata + private bucket + migration review queue.
-- -------------------------------------------------------------------------

alter table public.messages
  add column attachment_path text,
  add column attachment_name text,
  add column attachment_mime text,
  add column attachment_size bigint;

alter table public.messages
  add constraint messages_attachment_size_limit
    check (attachment_size is null or attachment_size between 1 and 10485760),
  add constraint messages_attachment_mime_allowlist
    check (
      attachment_mime is null
      or attachment_mime in (
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'text/plain'
      )
    ),
  add constraint messages_attachment_name_is_filename
    check (
      attachment_name is null
      or (
        length(attachment_name) between 1 and 255
        and attachment_name !~ '[/\\]'
      )
    ),
  add constraint messages_attachment_path_scope
    check (
      attachment_path is null
      or (
        split_part(attachment_path, '/', 1) = conversation_id::text
        and split_part(attachment_path, '/', 2) = sender_id::text
        and attachment_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]+$'
      )
    );

create table private.chat_attachment_migration_review (
  message_id uuid primary key references public.messages(id) on delete cascade,
  original_url text not null,
  reason text not null,
  queued_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

revoke all on table private.chat_attachment_migration_review
  from public, anon, authenticated, service_role;

-- Recognize only the documented Supabase public-object URL and only when the
-- embedded conversation/user folders match the owning message.
with candidates as (
  select
    id,
    regexp_replace(
      attachment_url,
      '^https://[^/]+/storage/v1/object/public/chat-attachments/',
      ''
    ) as object_path
  from public.messages
  where attachment_url ~ '^https://[^/]+/storage/v1/object/public/chat-attachments/'
)
update public.messages as m
set attachment_path = c.object_path,
    attachment_name = regexp_replace(c.object_path, '^.*/', '')
from candidates as c
where m.id = c.id
  and split_part(c.object_path, '/', 1) = m.conversation_id::text
  and split_part(c.object_path, '/', 2) = m.sender_id::text
  and c.object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]+$';

insert into private.chat_attachment_migration_review (
  message_id,
  original_url,
  reason
)
select
  id,
  attachment_url,
  'URL could not be mapped safely to conversation_id/user_id/path'
from public.messages
where attachment_url is not null
  and attachment_path is null
on conflict (message_id) do nothing;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,
  array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/plain'
    ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload chat attachments" on storage.objects;
drop policy if exists "Users can view chat attachments" on storage.objects;

do $function$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%chat-attachments%'
        or coalesce(with_check, '') ilike '%chat-attachments%'
      )
  loop
    execute format('drop policy %I on storage.objects', policy_record.policyname);
  end loop;
end;
$function$;

-- Storage access now goes through guarded server actions which use service
-- role only after checking conversation membership. No authenticated Storage
-- policy is intentionally recreated here.

comment on column public.messages.attachment_path is
  'Private storage object path: {conversation_id}/{sender_id}/{uuid}.{ext}.';

commit;

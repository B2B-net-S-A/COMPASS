-- 1. Add cv_url to profiles
alter table profiles
add column if not exists cv_url text;
-- 2. Create avatars bucket (public)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true) on conflict (id) do nothing;
-- 3. Policies for Avatars
create policy "Avatar images are publicly accessible" on storage.objects for
select using (bucket_id = 'avatars');
create policy "Anyone can upload an avatar" on storage.objects for
insert to authenticated with check (
        bucket_id = 'avatars'
        and (storage.foldername(name)) [1] = 'profiles'
    );
create policy "Anyone can update their own avatar" on storage.objects for
update to authenticated using (
        bucket_id = 'avatars'
        and (storage.foldername(name)) [1] = 'profiles'
    );
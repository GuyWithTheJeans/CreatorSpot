-- CreatorSpot accounts: one public creator profile per Twitch account.
-- Run once in Supabase: SQL Editor > New query > paste all of this > Run. Safe to run again.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  twitch_login text not null unique,
  name text not null check (char_length(name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 160),
  accent text not null default '#7C5CFF' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  category text not null default 'Gaming' check (char_length(category) <= 30),
  avatar_url text,
  platforms jsonb not null default '[]' check (jsonb_typeof(platforms) = 'array' and pg_column_size(platforms) < 4000),
  campaigns jsonb not null default '[]' check (jsonb_typeof(campaigns) = 'array' and pg_column_size(campaigns) < 20000),
  featured boolean not null default false,   -- GuyWithTheJeans and iamDoughnutDude: always shown, and admins
  hidden boolean not null default false,     -- set by an admin to remove someone from everyone's rotation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Admin check that does not recurse through the table's own policies.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and featured);
$$;

drop policy if exists "Anyone can read visible profiles" on public.profiles;
create policy "Anyone can read visible profiles" on public.profiles
  for select using (not hidden or id = auth.uid() or public.is_admin());

drop policy if exists "Creators update their own profile" on public.profiles;
create policy "Creators update their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- People may only change their own profile text, links and campaigns. Never featured/hidden/login.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (name, bio, accent, category, platforms, campaigns, avatar_url) on public.profiles to authenticated;

-- Profile pictures: the Twitch picture, or one uploaded to CreatorSpot's own storage. Nothing else.
alter table public.profiles drop constraint if exists profiles_avatar_ok;
alter table public.profiles add constraint profiles_avatar_ok check (
  avatar_url is null
  or avatar_url like 'https://static-cdn.jtvnw.net/%'
  or avatar_url like 'https://mofktqetaskhsxfgrmpw.supabase.co/storage/v1/object/public/media/%'
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- Called by CreatorSpot right after "Sign in with Twitch": creates the profile the first time, and keeps the
-- Twitch name and picture current. The Twitch login comes from Twitch itself, so nobody can claim a channel
-- they do not own.
create or replace function public.ensure_my_profile() returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  ident jsonb;
  login text;
  result public.profiles;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select identity_data into ident from auth.identities where user_id = auth.uid() and provider = 'twitch' limit 1;
  if ident is null then raise exception 'Sign in with Twitch to get a CreatorSpot profile'; end if;
  login := lower(coalesce(ident->>'name', ident->>'full_name', ident->>'slug', ''));
  if login !~ '^[a-z0-9_]{1,25}$' then raise exception 'Could not read your Twitch name'; end if;
  insert into public.profiles (id, twitch_login, name, avatar_url, platforms, featured)
  values (
    auth.uid(), login, left(coalesce(nullif(ident->>'nickname', ''), login), 40),
    coalesce(ident->>'avatar_url', ident->>'picture'),
    jsonb_build_array(jsonb_build_object('type', 'twitch', 'url', 'https://www.twitch.tv/' || login)),
    login in ('guywiththejeans', 'iamdoughnutdude')
  )
  on conflict (id) do update set
    twitch_login = excluded.twitch_login,
    -- keep a picture the creator uploaded; otherwise follow their current Twitch picture
    avatar_url = case when public.profiles.avatar_url is null or public.profiles.avatar_url like 'https://static-cdn.jtvnw.net/%'
                      then excluded.avatar_url else public.profiles.avatar_url end
  returning * into result;
  return result;
end $$;

-- Admins (the featured creators) can remove or restore anyone else.
create or replace function public.set_hidden(target uuid, value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only CreatorSpot admins can do this'; end if;
  update public.profiles set hidden = value where id = target and not featured;
end $$;

revoke all on function public.ensure_my_profile() from public, anon;
revoke all on function public.set_hidden(uuid, boolean) from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;
grant execute on function public.set_hidden(uuid, boolean) to authenticated;

-- Uploaded pictures and videos: public to read, and each creator can only write inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 8388608, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "CreatorSpot media: read own" on storage.objects;
create policy "CreatorSpot media: read own" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "CreatorSpot media: upload own" on storage.objects;
create policy "CreatorSpot media: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "CreatorSpot media: replace own" on storage.objects;
create policy "CreatorSpot media: replace own" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "CreatorSpot media: delete own" on storage.objects;
create policy "CreatorSpot media: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

select 'CreatorSpot database is ready (v2)' as status;

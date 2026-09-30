-- Word groups, custom recordings, praise clips, and a parent code that guards content edits.
--
-- The app has no login. Anyone can play (read content, write game history/progress),
-- but changing content (groups, words, recordings) requires the parent code, sent by the
-- app in the x-parent-code request header and checked here against a bcrypt hash.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.parent_pin (
  id boolean primary key default true check (id),
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.is_parent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app_private.parent_pin p
    where p.pin_hash = extensions.crypt(
      coalesce(current_setting('request.headers', true)::json ->> 'x-parent-code', ''),
      p.pin_hash)
  );
$$;

create or replace function public.parent_pin_exists()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app_private.parent_pin);
$$;

create or replace function public.check_parent_pin(pin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app_private.parent_pin p
    where p.pin_hash = extensions.crypt(pin, p.pin_hash)
  );
$$;

-- First call sets the code; later calls need the current code in the header.
create or replace function public.set_parent_pin(new_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(coalesce(new_pin, '')) < 6 then
    raise exception 'parent code must be at least 6 characters';
  end if;
  if exists (select 1 from app_private.parent_pin) and not public.is_parent() then
    raise exception 'wrong parent code';
  end if;
  insert into app_private.parent_pin (id, pin_hash)
  values (true, extensions.crypt(new_pin, extensions.gen_salt('bf')))
  on conflict (id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

revoke execute on function public.set_parent_pin(text) from public;
grant execute on function public.set_parent_pin(text) to anon, authenticated;

-- Word groups, played in order
create table public.word_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.words drop constraint words_text_key;
alter table public.words
  add column group_id uuid references public.word_groups(id) on delete cascade,
  add column sort_order integer not null default 0,
  add constraint words_group_text_key unique (group_id, text);
create index words_group_idx on public.words (group_id, sort_order);

alter table public.users
  add column current_group_id uuid references public.word_groups(id) on delete set null;
create index users_current_group_idx on public.users (current_group_id);

-- Recordings can now live in Supabase Storage (bucket 'audio') as well as in the site's static files
alter table public.recordings
  add column source text not null default 'static' check (source in ('static', 'storage'));

create table public.praise_clips (
  id uuid primary key default gen_random_uuid(),
  audio_path text not null,
  created_at timestamptz not null default now()
);

alter table public.word_groups enable row level security;
alter table public.praise_clips enable row level security;

create policy "read groups" on public.word_groups for select to anon, authenticated using (true);
create policy "read praise" on public.praise_clips for select to anon, authenticated using (true);

create policy "parent writes groups" on public.word_groups for all to anon, authenticated
  using (public.is_parent()) with check (public.is_parent());
create policy "parent writes words" on public.words for all to anon, authenticated
  using (public.is_parent()) with check (public.is_parent());
create policy "parent writes recordings" on public.recordings for all to anon, authenticated
  using (public.is_parent()) with check (public.is_parent());
create policy "parent writes praise" on public.praise_clips for all to anon, authenticated
  using (public.is_parent()) with check (public.is_parent());
create policy "parent updates users" on public.users for update to anon, authenticated
  using (public.is_parent()) with check (public.is_parent());

-- The child may move himself to the next group after a good round.
create or replace function public.advance_group(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur_order integer;
  next_id uuid;
begin
  select g.sort_order into cur_order
  from public.users u join public.word_groups g on g.id = u.current_group_id
  where u.id = p_user;

  select g.id into next_id
  from public.word_groups g
  where cur_order is null or g.sort_order > cur_order
  order by g.sort_order
  limit 1;

  if next_id is not null then
    update public.users set current_group_id = next_id where id = p_user;
  end if;
  return next_id;
end;
$$;

-- Storage: public bucket for audio; only the parent may add, replace or delete files
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', true, 5242880, array['audio/*'])
on conflict (id) do nothing;

create policy "audio read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'audio');
create policy "audio parent insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'audio' and public.is_parent());
create policy "audio parent update" on storage.objects for update to anon, authenticated
  using (bucket_id = 'audio' and public.is_parent()) with check (bucket_id = 'audio' and public.is_parent());
create policy "audio parent delete" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'audio' and public.is_parent());

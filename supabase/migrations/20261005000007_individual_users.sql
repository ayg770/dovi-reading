-- Individual users. Each user has a personal code and their own groups, words,
-- recordings, praise clips, progress and game history; nobody sees anyone else's.
-- The app sends x-user-id and x-user-code (base64 of the UTF-8 code) on every request,
-- and current_user_id() checks them against the user's bcrypt hash.
-- Dovi keeps everything he has, and his code is the old parent code.

-- 1. Personal codes ------------------------------------------------------------
alter table public.users add column pin_hash text;
update public.users set pin_hash = (select p.pin_hash from app_private.parent_pin p limit 1)
where name = 'דובי';
create unique index users_name_key on public.users (lower(name));

create or replace function public.current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  headers json := current_setting('request.headers', true)::json;
  uid uuid;
  code text;
begin
  if headers is null then
    return null;
  end if;
  begin
    uid := (headers ->> 'x-user-id')::uuid;
    code := convert_from(decode(headers ->> 'x-user-code', 'base64'), 'UTF8');
  exception when others then
    return null;
  end;
  if uid is null or code is null then
    return null;
  end if;
  return (
    select u.id from public.users u
    where u.id = uid and u.pin_hash is not null and u.pin_hash = extensions.crypt(code, u.pin_hash)
  );
end;
$$;

-- 2. Every piece of content belongs to a user ------------------------------------
alter table public.word_groups add column user_id uuid references public.users(id) on delete cascade;
alter table public.words add column user_id uuid references public.users(id) on delete cascade;
alter table public.praise_clips add column user_id uuid references public.users(id) on delete cascade;
-- recordings: user_id null = shared files that ship with the site (letter names)
alter table public.recordings add column user_id uuid references public.users(id) on delete cascade;

update public.word_groups set user_id = (select id from public.users where name = 'דובי');
update public.words set user_id = (select id from public.users where name = 'דובי');
update public.praise_clips set user_id = (select id from public.users where name = 'דובי');
update public.recordings set user_id = (select id from public.users where name = 'דובי') where source = 'storage';

alter table public.word_groups alter column user_id set not null;
alter table public.words alter column user_id set not null;
alter table public.praise_clips alter column user_id set not null;

alter table public.recordings drop constraint recordings_letter_id_nikud_id_pronunciation_key;
alter table public.recordings add constraint recordings_owner_key unique (user_id, letter_id, nikud_id, pronunciation);

create index word_groups_user_idx on public.word_groups (user_id, sort_order);
create index words_user_idx on public.words (user_id);
create index praise_clips_user_idx on public.praise_clips (user_id);
create index recordings_user_idx on public.recordings (user_id);
create index progress_user_idx on public.progress (user_id);

-- 3. New users start with a copy of these groups ----------------------------------
create table app_private.settings (key text primary key, value text not null);
insert into app_private.settings (key, value)
select 'template_user_id', id::text from public.users where name = 'דובי';

-- 4. Row level security: own rows only ----------------------------------------------
drop policy "read users" on public.users;
drop policy "parent updates users" on public.users;
drop policy "read groups" on public.word_groups;
drop policy "parent writes groups" on public.word_groups;
drop policy "read words" on public.words;
drop policy "parent writes words" on public.words;
drop policy "read recordings" on public.recordings;
drop policy "parent writes recordings" on public.recordings;
drop policy "read praise" on public.praise_clips;
drop policy "parent writes praise" on public.praise_clips;
drop policy "read sessions" on public.game_sessions;
drop policy "insert sessions" on public.game_sessions;
drop policy "finish sessions" on public.game_sessions;
drop policy "read progress" on public.progress;
drop policy "insert progress" on public.progress;
drop policy "update progress" on public.progress;

-- The code hash and the star count are never read or written directly.
revoke select, insert, update, delete on public.users from anon, authenticated;
grant select (id, name, pronunciation, current_group_id, stars, created_at) on public.users to anon, authenticated;
grant update (name, pronunciation, current_group_id) on public.users to anon, authenticated;

create policy "own user" on public.users for select to anon, authenticated
  using (id = (select public.current_user_id()));
create policy "own user update" on public.users for update to anon, authenticated
  using (id = (select public.current_user_id())) with check (id = (select public.current_user_id()));

create policy "own groups" on public.word_groups for all to anon, authenticated
  using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));
create policy "own words" on public.words for all to anon, authenticated
  using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));
create policy "own praise" on public.praise_clips for all to anon, authenticated
  using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));
create policy "shared recordings" on public.recordings for select to anon, authenticated
  using (user_id is null);
create policy "own recordings" on public.recordings for all to anon, authenticated
  using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));
create policy "own sessions" on public.game_sessions for all to anon, authenticated
  using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));
create policy "own progress" on public.progress for all to anon, authenticated
  using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));

-- 5. Account functions --------------------------------------------------------------
create or replace function public.create_user(p_name text, p_code text, p_pronunciation text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  template uuid;
  g record;
  new_group uuid;
begin
  p_name := btrim(coalesce(p_name, ''));
  if length(p_name) < 1 or length(p_name) > 40 then
    raise exception 'name must be 1-40 characters';
  end if;
  if length(coalesce(p_code, '')) < 4 then
    raise exception 'code must be at least 4 characters';
  end if;
  if p_pronunciation not in ('ashkenazi', 'sephardi') then
    raise exception 'unknown pronunciation';
  end if;
  if exists (select 1 from public.users where lower(name) = lower(p_name)) then
    raise exception 'name taken';
  end if;

  insert into public.users (name, pronunciation, pin_hash)
  values (p_name, p_pronunciation, extensions.crypt(p_code, extensions.gen_salt('bf')))
  returning id into new_id;

  -- A copy of the template user's groups and words (not their recordings).
  select value::uuid into template from app_private.settings where key = 'template_user_id';
  for g in select * from public.word_groups where user_id = template order by sort_order loop
    insert into public.word_groups (name, sort_order, user_id)
    values (g.name, g.sort_order, new_id)
    returning id into new_group;
    insert into public.words (group_id, user_id, text, plain_text, meaning, syllables, difficulty, sort_order)
    select new_group, new_id, w.text, w.plain_text, w.meaning, w.syllables, w.difficulty, w.sort_order
    from public.words w where w.group_id = g.id;
  end loop;

  return new_id;
end;
$$;

-- Returns the user's id when name and code match, otherwise null.
create or replace function public.login_user(p_name text, p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from public.users u
  where lower(u.name) = lower(btrim(p_name))
    and u.pin_hash is not null
    and u.pin_hash = extensions.crypt(p_code, u.pin_hash);
$$;

create or replace function public.change_code(p_new_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if length(coalesce(p_new_code, '')) < 4 then
    raise exception 'code must be at least 4 characters';
  end if;
  update public.users set pin_hash = extensions.crypt(p_new_code, extensions.gen_salt('bf')) where id = me;
end;
$$;

create or replace function public.add_stars(p_user uuid, p_count integer default 1)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.users
  set stars = stars + greatest(0, least(p_count, 3))
  where id = p_user and id = public.current_user_id()
  returning stars;
$$;

create or replace function public.advance_group(p_user uuid, p_from uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur_order integer;
  next_id uuid;
begin
  if p_user is distinct from public.current_user_id() then
    return null;
  end if;

  select g.sort_order into cur_order
  from public.word_groups g
  where g.user_id = p_user
    and g.id = coalesce(p_from, (select u.current_group_id from public.users u where u.id = p_user));

  select g.id into next_id
  from public.word_groups g
  where g.user_id = p_user
    and (cur_order is null or g.sort_order > cur_order)
    and exists (select 1 from public.words w where w.group_id = g.id)
  order by g.sort_order
  limit 1;

  if next_id is not null then
    update public.users set current_group_id = next_id where id = p_user;
  end if;
  return next_id;
end;
$$;

-- 6. The single parent code is gone -------------------------------------------------
drop function public.is_parent();
drop function public.parent_pin_exists();
drop function public.check_parent_pin(text);
drop function public.set_parent_pin(text);
drop table app_private.parent_pin;

-- 7. Recordings are private: each user's files live under their own id -------------
update storage.buckets set public = false where id = 'audio';
drop policy "audio read" on storage.objects;
drop policy "audio parent insert" on storage.objects;
drop policy "audio parent update" on storage.objects;
drop policy "audio parent delete" on storage.objects;
create policy "own audio" on storage.objects for all to anon, authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select public.current_user_id())::text)
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = (select public.current_user_id())::text);

-- A shared library of texts and word lists. Users publish copies of their own groups; anyone can add a
-- library item to their own groups. Nothing is ever deleted from the library: taking a text back marks it hidden.
create table public.library_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'text' check (kind in ('words', 'text')),
  category text not null default 'texts',
  sort_order integer not null default 0,
  author uuid references public.users(id) on delete set null,
  source_group_id uuid,
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);
create table public.library_words (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.library_groups(id) on delete cascade,
  text text not null,
  sort_order integer not null default 0
);
create index library_words_group_idx on public.library_words (group_id, sort_order);
create unique index library_groups_source_key on public.library_groups (author, source_group_id) where source_group_id is not null;
alter table public.library_groups enable row level security;
alter table public.library_words enable row level security;
create policy "library readable" on public.library_groups for select to anon, authenticated using (true);
create policy "library words readable" on public.library_words for select to anon, authenticated using (true);
grant select on public.library_groups, public.library_words to anon, authenticated;

alter table public.word_groups add column library_id uuid;

create or replace function public.publish_group(p_group uuid, p_category text default 'texts')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  g public.word_groups;
  lib uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into g from public.word_groups where id = p_group and user_id = me;
  if g.id is null then raise exception 'not your group'; end if;
  -- Publishing again retires the earlier published copy and makes a fresh one.
  update public.library_groups set hidden = true, source_group_id = null where author = me and source_group_id = p_group;
  insert into public.library_groups (name, kind, category, author, source_group_id)
  values (g.name, g.kind, coalesce(p_category, 'texts'), me, p_group) returning id into lib;
  insert into public.library_words (group_id, text, sort_order)
  select lib, w.text, w.sort_order from public.words w where w.group_id = p_group;
  return lib;
end;
$$;

create or replace function public.unpublish_group(p_group uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := public.current_user_id();
begin
  if me is null then raise exception 'not signed in'; end if;
  update public.library_groups set hidden = true, source_group_id = null where author = me and source_group_id = p_group;
end;
$$;

create or replace function public.add_library_group(p_lib uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  lg public.library_groups;
  existing uuid;
  new_id uuid;
  next_order integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into lg from public.library_groups where id = p_lib and not hidden;
  if lg.id is null then raise exception 'not in the library'; end if;
  select id into existing from public.word_groups where user_id = me and library_id = p_lib;
  if existing is not null then return existing; end if;
  select coalesce(max(sort_order), 0) + 1 into next_order from public.word_groups where user_id = me;
  insert into public.word_groups (name, sort_order, user_id, kind, library_id)
  values (lg.name, next_order, me, lg.kind, p_lib) returning id into new_id;
  insert into public.words (group_id, user_id, text, plain_text, syllables, difficulty, sort_order)
  select new_id, me, w.text, regexp_replace(w.text, '[֑-ׇ]', '', 'g'), '[]'::jsonb, 1, w.sort_order
  from public.library_words w where w.group_id = p_lib;
  return new_id;
end;
$$;

grant execute on function public.publish_group(uuid, text), public.unpublish_group(uuid), public.add_library_group(uuid) to anon, authenticated;

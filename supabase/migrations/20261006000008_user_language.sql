-- Interface language per user (he or ru). The learning content is always Hebrew.
alter table public.users add column language text not null default 'he' check (language in ('he', 'ru'));
grant select (language) on public.users to anon, authenticated;
grant update (language) on public.users to anon, authenticated;

-- create_user gets p_language (default he). The old 3-argument version could not be
-- dropped from here, so its execute right is revoked: only the new one is reachable.
create or replace function public.create_user(p_name text, p_code text, p_pronunciation text, p_language text default 'he')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
  template uuid;
  g record;
  new_group uuid;
  group_name text;
begin
  p_name := btrim(coalesce(p_name, ''));
  if length(p_name) < 1 or length(p_name) > 40 then raise exception 'name must be 1-40 characters'; end if;
  if length(coalesce(p_code, '')) < 4 then raise exception 'code must be at least 4 characters'; end if;
  if p_pronunciation not in ('ashkenazi', 'sephardi') then raise exception 'unknown pronunciation'; end if;
  if p_language not in ('he', 'ru') then raise exception 'unknown language'; end if;
  if exists (select 1 from public.users where lower(name) = lower(p_name)) then raise exception 'name taken'; end if;

  insert into public.users (name, pronunciation, language, pin_hash)
  values (p_name, p_pronunciation, p_language, extensions.crypt(p_code, extensions.gen_salt('bf')))
  returning id into new_id;

  select value::uuid into template from app_private.settings where key = 'template_user_id';
  for g in select * from public.word_groups where user_id = template order by sort_order loop
    group_name := g.name;
    if p_language = 'ru' then
      -- The copied groups are named after their nikud; show those names in Russian.
      group_name := replace(replace(replace(group_name, 'קמץ', 'Камац'), 'פתח', 'Патах'), 'חיריק', 'Хирик');
    end if;
    insert into public.word_groups (name, sort_order, user_id) values (group_name, g.sort_order, new_id)
    returning id into new_group;
    insert into public.words (group_id, user_id, text, plain_text, meaning, syllables, difficulty, sort_order)
    select new_group, new_id, w.text, w.plain_text, w.meaning, w.syllables, w.difficulty, w.sort_order
    from public.words w where w.group_id = g.id;
  end loop;
  return new_id;
end;
$$;
revoke execute on function public.create_user_v1_unused(text, text, text) from public, anon, authenticated;

-- The old 3-argument version can't be dropped from here; renamed so that `create_user`
-- is unambiguous for clients that don't send p_language yet.
alter function public.create_user(text, text, text) rename to create_user_v1_unused;

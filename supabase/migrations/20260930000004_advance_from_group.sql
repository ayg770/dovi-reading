-- The games can now play any group, so "next group" moves on from the group that was played.
drop function if exists public.advance_group(uuid);

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
  select g.sort_order into cur_order
  from public.word_groups g
  where g.id = coalesce(p_from, (select u.current_group_id from public.users u where u.id = p_user));

  select g.id into next_id
  from public.word_groups g
  where (cur_order is null or g.sort_order > cur_order)
    and exists (select 1 from public.words w where w.group_id = g.id)
  order by g.sort_order
  limit 1;

  if next_id is not null then
    update public.users set current_group_id = next_id where id = p_user;
  end if;
  return next_id;
end;
$$;

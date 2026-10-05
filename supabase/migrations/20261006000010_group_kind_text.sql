-- A group is either a list of syllables/words to practice or a text (each row a sentence or line).
alter table public.word_groups add column kind text not null default 'words' check (kind in ('words', 'text'));

create or replace function public.advance_group(p_user uuid, p_from uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  cur_order integer;
  next_id uuid;
begin
  if p_user is distinct from public.current_user_id() then return null; end if;
  select g.sort_order into cur_order from public.word_groups g
  where g.user_id = p_user
    and g.id = coalesce(p_from, (select u.current_group_id from public.users u where u.id = p_user));
  select g.id into next_id from public.word_groups g
  where g.user_id = p_user and g.kind = 'words' and (cur_order is null or g.sort_order > cur_order)
    and exists (select 1 from public.words w where w.group_id = g.id)
  order by g.sort_order limit 1;
  if next_id is not null then
    update public.users set current_group_id = next_id where id = p_user;
  end if;
  return next_id;
end;
$$;

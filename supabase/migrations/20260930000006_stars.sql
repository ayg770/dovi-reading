-- Stars Dovi collects across all games (one per right first answer).
alter table public.users add column stars integer not null default 0 check (stars >= 0);

-- Credit what he already earned.
update public.users u
set stars = coalesce((select sum(s.correct_answers) from public.game_sessions s where s.user_id = u.id), 0);

-- The games add stars without the parent code; at most a few per call.
create or replace function public.add_stars(p_user uuid, p_count integer default 1)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.users
  set stars = stars + greatest(0, least(p_count, 3))
  where id = p_user
  returning stars;
$$;

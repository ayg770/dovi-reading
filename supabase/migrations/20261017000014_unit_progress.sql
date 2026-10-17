-- The learning plan: which unit of the plan a group came from, and the progress per unit.
alter table public.word_groups add column unit_code text;

create table public.unit_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  unit_code text not null,
  points integer not null default 0,
  seconds integer not null default 0,
  sessions integer not null default 0,
  correct integer not null default 0,
  total integer not null default 0,
  done boolean not null default false,
  started_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, unit_code)
);
alter table public.unit_progress enable row level security;
create policy "own unit progress" on public.unit_progress for all to anon, authenticated
  using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));
grant select on public.unit_progress to anon, authenticated;

create or replace function public.record_unit_progress(p_unit text, p_points integer, p_seconds integer, p_correct integer, p_total integer)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := public.current_user_id();
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into public.unit_progress (user_id, unit_code, points, seconds, sessions, correct, total)
  values (me, p_unit, greatest(0, p_points), greatest(0, p_seconds), 1, greatest(0, p_correct), greatest(0, p_total))
  on conflict (user_id, unit_code) do update set
    points = public.unit_progress.points + greatest(0, p_points),
    seconds = public.unit_progress.seconds + greatest(0, p_seconds),
    sessions = public.unit_progress.sessions + 1,
    correct = public.unit_progress.correct + greatest(0, p_correct),
    total = public.unit_progress.total + greatest(0, p_total),
    last_at = now();
end;
$$;

create or replace function public.set_unit_done(p_unit text, p_done boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := public.current_user_id();
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into public.unit_progress (user_id, unit_code, done) values (me, p_unit, p_done)
  on conflict (user_id, unit_code) do update set done = p_done, last_at = now();
end;
$$;
grant execute on function public.record_unit_progress(text, integer, integer, integer, integer), public.set_unit_done(text, boolean) to anon, authenticated;

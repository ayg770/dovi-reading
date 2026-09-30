-- dovi-reading: initial schema
-- Reference data (letters, nikud, recordings, words) is public read-only.
-- Learner data (users, game_sessions, progress) is written by the app with the anon key;
-- there is no auth yet (single learner), so writes are open to anon and kept narrow.

create table public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pronunciation text not null default 'ashkenazi' check (pronunciation in ('ashkenazi', 'sephardi')),
  created_at timestamptz not null default now()
);

create table public.letters (
  id smallint primary key,               -- order in the alef-bet (finals come right after their base letter)
  key text not null unique,              -- ascii key used in file names: 'alef', 'bet', 'kaf_sofit'...
  glyph text not null unique,            -- 'א'
  name text not null,                    -- 'אלף'
  is_final boolean not null default false,
  base_letter_id smallint references public.letters(id),
  dagesh_glyph text                      -- 'בּ' for letters whose plosive form needs a dagesh
);

create table public.nikud (
  id smallint primary key,
  key text not null unique,              -- 'patach', 'hiriq', 'kamatz'
  mark text not null,                    -- the combining character, e.g. U+05B7
  name text not null,                    -- 'פתח'
  sound_ashkenazi text not null,         -- 'a', 'i', 'o'
  sound_sephardi text not null,
  sort_order smallint not null
);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  letter_id smallint not null references public.letters(id),
  nikud_id smallint references public.nikud(id),  -- null = recording of the letter's name
  audio_path text not null,                       -- path under /audio, e.g. 'letters/א.mp3'
  pronunciation text not null default 'ashkenazi',
  created_at timestamptz not null default now(),
  unique (letter_id, nikud_id, pronunciation)
);

create table public.words (
  id uuid primary key default gen_random_uuid(),
  text text not null unique,             -- with nikud
  plain_text text not null,              -- without nikud
  meaning text,
  -- ordered syllables: [{"letter_id":2,"nikud_id":1}, ...]
  syllables jsonb not null default '[]'::jsonb,
  audio_path text,
  difficulty smallint not null default 1,
  created_at timestamptz not null default now()
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  game_type text not null,               -- 'hear_syllable', ...
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total_questions smallint not null default 0,
  correct_answers smallint not null default 0,
  details jsonb not null default '[]'::jsonb
);
create index game_sessions_user_idx on public.game_sessions (user_id, started_at desc);

create table public.progress (
  user_id uuid not null references public.users(id) on delete cascade,
  letter_id smallint not null references public.letters(id),
  nikud_id smallint not null references public.nikud(id),
  attempts integer not null default 0,
  correct integer not null default 0,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, letter_id, nikud_id)
);
create index progress_letter_idx on public.progress (letter_id);
create index progress_nikud_idx on public.progress (nikud_id);
create index recordings_nikud_idx on public.recordings (nikud_id);
create index letters_base_idx on public.letters (base_letter_id);

-- Row level security
alter table public.users enable row level security;
alter table public.letters enable row level security;
alter table public.nikud enable row level security;
alter table public.recordings enable row level security;
alter table public.words enable row level security;
alter table public.game_sessions enable row level security;
alter table public.progress enable row level security;

create policy "read letters" on public.letters for select to anon, authenticated using (true);
create policy "read nikud" on public.nikud for select to anon, authenticated using (true);
create policy "read recordings" on public.recordings for select to anon, authenticated using (true);
create policy "read words" on public.words for select to anon, authenticated using (true);
create policy "read users" on public.users for select to anon, authenticated using (true);

create policy "read sessions" on public.game_sessions for select to anon, authenticated using (true);
create policy "insert sessions" on public.game_sessions for insert to anon, authenticated
  with check (exists (select 1 from public.users u where u.id = user_id));
create policy "finish sessions" on public.game_sessions for update to anon, authenticated
  using (finished_at is null) with check (true);

create policy "read progress" on public.progress for select to anon, authenticated using (true);
create policy "insert progress" on public.progress for insert to anon, authenticated
  with check (exists (select 1 from public.users u where u.id = user_id));
create policy "update progress" on public.progress for update to anon, authenticated
  using (true) with check (true);

-- Atomic progress increment used by the app
create or replace function public.record_answer(p_user uuid, p_letter smallint, p_nikud smallint, p_correct boolean)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.progress (user_id, letter_id, nikud_id, attempts, correct, last_seen_at)
  values (p_user, p_letter, p_nikud, 1, case when p_correct then 1 else 0 end, now())
  on conflict (user_id, letter_id, nikud_id) do update
    set attempts = public.progress.attempts + 1,
        correct = public.progress.correct + excluded.correct,
        last_seen_at = now();
$$;

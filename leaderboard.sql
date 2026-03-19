create table if not exists public.leaderboard (
    id bigint generated always as identity primary key,
    race_name text not null,
    race_round integer,
    player_id text not null,
    player_name text not null,
    score integer not null default 0,
    events_hit integer not null default 0,
    position integer not null default 0,
    recorded_at timestamptz not null default now()
);

create unique index if not exists leaderboard_race_player_idx
    on public.leaderboard (race_name, player_id);

create index if not exists leaderboard_race_position_idx
    on public.leaderboard (race_name, position);

alter table public.leaderboard
    add column if not exists race_round integer;

create index if not exists leaderboard_race_round_idx
    on public.leaderboard (race_round, race_name);

alter table public.leaderboard enable row level security;

drop policy if exists leaderboard_select_all on public.leaderboard;
create policy leaderboard_select_all
    on public.leaderboard
    for select
    to anon, authenticated
    using (true);

drop policy if exists leaderboard_insert_all on public.leaderboard;
create policy leaderboard_insert_all
    on public.leaderboard
    for insert
    to anon, authenticated
    with check (true);

drop policy if exists leaderboard_update_all on public.leaderboard;
create policy leaderboard_update_all
    on public.leaderboard
    for update
    to anon, authenticated
    using (true)
    with check (true);

drop policy if exists leaderboard_delete_all on public.leaderboard;
create policy leaderboard_delete_all
    on public.leaderboard
    for delete
    to anon, authenticated
    using (true);

-- leaderboard table update to include pts breakdown
ALTER TABLE leaderboard
ADD COLUMN square_pts INT DEFAULT 0,
ADD COLUMN bingo_bonus INT DEFAULT 0,
ADD COLUMN bingo_count INT DEFAULT 0;

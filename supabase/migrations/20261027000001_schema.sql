-- =====================================================================
-- Les Loups de Vaucombe — étape 4 (1/2) : tables et règles d'accès (RLS)
--
-- Principe : le navigateur ne peut RIEN écrire directement. Toutes les
-- écritures passent par des fonctions « security definer » (fichier 2/2)
-- qui vérifient les règles du jeu. Les lectures sont filtrées par RLS :
-- chacun ne voit que son propre rôle, les loups voient les autres loups.
-- =====================================================================

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pseudo text not null check (char_length(pseudo) between 1 and 16),
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{5}$'),
  host_id uuid not null references auth.users (id),
  status text not null default 'salon' check (status in ('salon', 'en_jeu', 'terminee')),
  settings jsonb not null,
  created_at timestamptz not null default now()
);

create table public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  pseudo text not null check (char_length(pseudo) between 1 and 16),
  joined_at timestamptz not null default now(),
  primary key (room_id, player_id),
  unique (room_id, pseudo)
);

-- Informations publiques d'une partie
create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  settings jsonb not null,
  phase text not null,
  day int not null default 1,
  phase_ends_at timestamptz not null,
  vote_round int not null default 1,
  runoff uuid[],
  eliminated_today uuid,
  announcement text not null default '',
  winner text check (winner in ('village', 'loups', 'amoureux', 'aucun')),
  created_at timestamptz not null default now()
);
create unique index games_one_active_per_room on public.games (room_id) where winner is null;

create table public.game_players (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null,
  seat int not null,
  pseudo text not null,
  alive boolean not null default true,
  death_day int,
  death_cause text check (death_cause in ('loups', 'poison', 'vote', 'chagrin', 'chasseur')),
  death_seq bigint,
  primary key (game_id, player_id),
  unique (game_id, seat)
);

-- SECRET : le rôle de chaque joueur (lecture filtrée par RLS)
create table public.player_roles (
  game_id uuid not null,
  player_id uuid not null,
  role text not null check (role in ('villageois', 'loup', 'voyante', 'sorciere', 'chasseur', 'cupidon')),
  primary key (game_id, player_id),
  foreign key (game_id, player_id) references public.game_players (game_id, player_id) on delete cascade
);

-- SECRET : état caché de la partie (aucune lecture possible depuis le navigateur)
create table public.game_secrets (
  game_id uuid primary key references public.games (id) on delete cascade,
  lovers uuid[],
  wolf_target uuid,
  witch_life boolean not null default true,
  witch_death boolean not null default true,
  witch_save_tonight boolean not null default false,
  witch_kill_tonight uuid,
  hunter_queue uuid[] not null default '{}',
  after_verification text not null default 'debat' check (after_verification in ('debat', 'nuit'))
);

-- SECRET : actions de nuit (cupidon, voyante, loups, sorcière) et tir du chasseur
create table public.night_actions (
  game_id uuid not null references public.games (id) on delete cascade,
  day int not null,
  phase text not null check (phase in ('cupidon', 'voyante', 'loups', 'sorciere', 'chasseur')),
  player_id uuid not null,
  target uuid,
  target2 uuid,
  save boolean,
  created_at timestamptz not null default now(),
  primary key (game_id, day, phase, player_id)
);

-- Votes du jour (publics, comme autour d'une vraie table)
create table public.votes (
  game_id uuid not null references public.games (id) on delete cascade,
  day int not null,
  round int not null check (round in (1, 2)),
  voter_id uuid not null,
  target_id uuid, -- null = abstention
  created_at timestamptz not null default now(),
  primary key (game_id, day, round, voter_id)
);

create table public.messages (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  author_id uuid,
  author text not null,
  channel text not null check (channel in ('public', 'loups', 'systeme')),
  text text not null check (channel = 'systeme' or char_length(text) between 1 and 240),
  created_at timestamptz not null default now()
);
create index messages_game_idx on public.messages (game_id, id);

-- Informations secrètes adressées à un seul joueur (vision, lien des amoureux…)
create table public.private_notes (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null,
  text text not null,
  created_at timestamptz not null default now()
);

-- Historique des transitions de la machine à états
create table public.game_events (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  from_phase text not null,
  to_phase text not null,
  day int not null,
  at timestamptz not null default now()
);

create sequence public.death_seq;

-- ---------------------------------------------------------------- fonctions d'aide pour RLS
-- « security definer » : elles lisent les tables sans repasser par RLS (évite les boucles).

create function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_players where room_id = p_room and player_id = auth.uid());
$$;

create function public.is_game_member(p_game uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from game_players where game_id = p_game and player_id = auth.uid());
$$;

create function public.my_role(p_game uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from player_roles where game_id = p_game and player_id = auth.uid();
$$;

-- Vrai si je suis vivant dans cette partie
create function public.am_alive(p_game uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select alive from game_players where game_id = p_game and player_id = auth.uid()), false);
$$;

create function public.game_over(p_game uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select winner is not null from games where id = p_game), false);
$$;

create function public.is_dead_player(p_game uuid, p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from game_players where game_id = p_game and player_id = p_player and not alive);
$$;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.player_roles enable row level security;
alter table public.game_secrets enable row level security;
alter table public.night_actions enable row level security;
alter table public.votes enable row level security;
alter table public.messages enable row level security;
alter table public.private_notes enable row level security;
alter table public.game_events enable row level security;

create policy "pseudos visibles" on public.profiles for select to authenticated using (true);

create policy "membres du salon" on public.rooms for select to authenticated using (public.is_room_member(id));
create policy "membres du salon" on public.room_players for select to authenticated using (public.is_room_member(room_id));
create policy "membres du salon" on public.games for select to authenticated using (public.is_room_member(room_id));
create policy "joueurs de la partie" on public.game_players for select to authenticated using (public.is_game_member(game_id));
create policy "joueurs de la partie" on public.votes for select to authenticated using (public.is_game_member(game_id));
create policy "joueurs de la partie" on public.game_events for select to authenticated using (public.is_game_member(game_id));

-- Rôles : le mien ; ceux des autres loups si je suis loup ; ceux des morts ;
-- tous si je suis mort (spectateur) ou si la partie est terminée.
create policy "rôles visibles" on public.player_roles for select to authenticated using (
  player_id = auth.uid()
  or (
    public.is_game_member(game_id)
    and (
      (role = 'loup' and public.my_role(game_id) = 'loup')
      or public.is_dead_player(game_id, player_id)
      or not public.am_alive(game_id)
      or public.game_over(game_id)
    )
  )
);

-- Chat : le canal des loups n'est lisible que par les loups, les morts, ou en fin de partie.
create policy "messages visibles" on public.messages for select to authenticated using (
  public.is_game_member(game_id)
  and (
    channel <> 'loups'
    or public.my_role(game_id) = 'loup'
    or not public.am_alive(game_id)
    or public.game_over(game_id)
  )
);

create policy "mes informations secrètes" on public.private_notes for select to authenticated using (player_id = auth.uid());

-- Actions de nuit : les miennes, et celles de la meute pour un loup.
create policy "mes actions et celles de la meute" on public.night_actions for select to authenticated using (
  player_id = auth.uid() or (phase = 'loups' and public.my_role(game_id) = 'loup')
);

-- game_secrets : aucune règle de lecture ⇒ personne ne peut la lire depuis le navigateur.

-- Le navigateur ne peut jamais écrire directement : uniquement via les fonctions du jeu.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on public.game_secrets from anon, authenticated;
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
revoke select on public.game_secrets from authenticated;

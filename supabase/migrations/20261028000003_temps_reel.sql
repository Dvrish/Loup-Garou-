-- =====================================================================
-- Les Loups de Vaucombe — étape 5 : temps réel, présence, chrono serveur
--
-- À exécuter APRÈS les fichiers 1 et 2 (déjà installés), une seule fois.
-- =====================================================================

-- ---------------------------------------------------------------- présence

-- Dernier signe de vie de chaque joueur (le navigateur l'actualise toutes les 15 s)
alter table public.room_players add column last_seen timestamptz not null default now();

-- Signe de vie. Si l'hôte ne répond plus depuis 45 s, le joueur présent le plus ancien
-- du salon devient hôte : la partie ne reste jamais bloquée sans hôte.
create function public.heartbeat(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _me();
  v_host uuid;
  v_next uuid;
begin
  update room_players set last_seen = now() where room_id = p_room and player_id = v_me;
  if not found then
    perform _fail('Vous n’êtes pas dans ce salon.');
  end if;
  select host_id into v_host from rooms where id = p_room for update;
  if not exists (
    select 1 from room_players where room_id = p_room and player_id = v_host and last_seen > now() - interval '45 seconds'
  ) then
    select player_id into v_next from room_players
     where room_id = p_room and last_seen > now() - interval '30 seconds'
     order by joined_at limit 1;
    if v_next is not null then
      update rooms set host_id = v_next where id = p_room;
    end if;
  end if;
end;
$$;

-- L'hôte peut retirer du salon un joueur parti (avant le lancement uniquement).
create function public.kick_player(p_room uuid, p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_id <> _me() then
    perform _fail('Seul l’hôte peut retirer un joueur.');
  end if;
  if v_room.status = 'en_jeu' then
    perform _fail('Impossible pendant une partie.');
  end if;
  if p_player = v_room.host_id then
    perform _fail('L’hôte ne peut pas se retirer lui-même.');
  end if;
  delete from room_players where room_id = p_room and player_id = p_player;
end;
$$;

-- ---------------------------------------------------------------- ce que je sais en secret (v2)

-- Même chose qu'à l'étape 4, avec en plus le rôle de l'être aimé (annoncé par Cupidon).
create or replace function public.my_view(p_game uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := _me();
  g games%rowtype;
  s game_secrets%rowtype;
  v_role text;
  v_partner uuid;
begin
  if not is_game_member(p_game) then
    perform _fail('Vous ne participez pas à cette partie.');
  end if;
  select * into g from games where id = p_game;
  select * into s from game_secrets where game_id = p_game;
  v_role := _role(p_game, v_me);
  if s.lovers is not null and v_me = any (s.lovers) then
    v_partner := case when s.lovers[1] = v_me then s.lovers[2] else s.lovers[1] end;
  end if;
  return jsonb_build_object(
    'role', v_role,
    'partner', v_partner,
    'partner_role', case when v_partner is not null then _role(p_game, v_partner) end,
    'lovers', case when v_role = 'cupidon' or not _alive(p_game, v_me) or g.winner is not null then to_jsonb(s.lovers) end,
    'pending', exists (select 1 from _pending(p_game) p where p = v_me) and not _has_acted(p_game, v_me),
    'acted', exists (select 1 from _pending(p_game) p where p = v_me) and _has_acted(p_game, v_me),
    'wolf_target', case when v_role = 'sorciere' and g.phase = 'sorciere' then s.wolf_target end,
    'witch', case when v_role = 'sorciere' then jsonb_build_object('life', s.witch_life, 'death', s.witch_death) end,
    'seer_results', case when v_role = 'voyante' then (
      select coalesce(jsonb_object_agg(na.target, _role(p_game, na.target)), '{}'::jsonb)
      from night_actions na where na.game_id = p_game and na.phase = 'voyante' and na.player_id = v_me
    ) end
  );
end;
$$;

-- ---------------------------------------------------------------- instantanés lus par le navigateur
-- « security invoker » : ces fonctions s'exécutent avec les droits du joueur, donc
-- les règles RLS filtrent tout ce qu'elles lisent (rôles, chat de la meute…).

create function public.room_state(p_room uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  r rooms%rowtype;
begin
  select * into r from rooms where id = p_room;
  if not found then
    raise exception using message = 'Vous n’êtes pas dans ce salon.', errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'host_id', r.host_id, 'status', r.status, 'settings', r.settings),
    'me', auth.uid(),
    'server_now', now(),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', player_id, 'pseudo', pseudo, 'online', last_seen > now() - interval '35 seconds'
      ) order by joined_at), '[]'::jsonb)
      from room_players where room_id = p_room
    ),
    'game_id', (select id from games where room_id = p_room order by created_at desc limit 1)
  );
end;
$$;

create function public.game_state(p_game uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  g games%rowtype;
begin
  select * into g from games where id = p_game;
  if not found then
    raise exception using message = 'Vous ne participez pas à cette partie.', errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'game', jsonb_build_object(
      'id', g.id, 'room_id', g.room_id, 'settings', g.settings, 'phase', g.phase, 'day', g.day,
      'phase_ends_at', g.phase_ends_at, 'vote_round', g.vote_round, 'runoff', g.runoff,
      'eliminated_today', g.eliminated_today, 'announcement', g.announcement, 'winner', g.winner
    ),
    'me', auth.uid(),
    'server_now', now(),
    'host_id', (select host_id from rooms where id = g.room_id),
    -- Le rôle n'apparaît que si RLS autorise à le voir (sinon null)
    'players', (
      select jsonb_agg(jsonb_build_object(
        'id', gp.player_id, 'pseudo', gp.pseudo, 'seat', gp.seat, 'alive', gp.alive,
        'death_day', gp.death_day, 'death_cause', gp.death_cause, 'death_seq', gp.death_seq,
        'role', pr.role,
        'online', coalesce(rp.last_seen > now() - interval '35 seconds', false)
      ) order by gp.seat)
      from game_players gp
      left join player_roles pr on pr.game_id = gp.game_id and pr.player_id = gp.player_id
      left join room_players rp on rp.room_id = g.room_id and rp.player_id = gp.player_id
      where gp.game_id = p_game
    ),
    'votes', (
      select coalesce(jsonb_agg(jsonb_build_object('voter', voter_id, 'target', target_id, 'at', created_at)), '[]'::jsonb)
      from votes where game_id = p_game and day = g.day and round = g.vote_round
    ),
    -- Choix de la meute cette nuit (visible des seuls loups grâce à RLS)
    'wolf_votes', (
      select coalesce(jsonb_object_agg(player_id, target), '{}'::jsonb)
      from night_actions where game_id = p_game and day = g.day and phase = 'loups'
    ),
    'messages', (
      select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb) from (
        select id, author, author_id, channel, text, created_at from messages
         where game_id = p_game order by id desc limit 300
      ) m
    ),
    'notes', (
      select coalesce(jsonb_agg(jsonb_build_object('text', text, 'at', created_at) order by id), '[]'::jsonb)
      from private_notes where game_id = p_game
    ),
    'view', my_view(p_game)
  );
end;
$$;

-- ---------------------------------------------------------------- chrono tenu par le serveur

-- Fait avancer toutes les parties dont le chrono est écoulé. Appelée toutes les 5 secondes
-- par pg_cron (ci-dessous), même si plus aucun navigateur n'est ouvert.
create function public._tick_all() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from games where winner is null and phase_ends_at <= now() loop
    begin
      if _try_advance(r.id) then
        n := n + 1;
      end if;
    exception when others then
      raise warning 'Partie % : %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('loups-garous-chrono', '5 seconds', 'select public._tick_all()');
  else
    raise notice 'pg_cron indisponible : les navigateurs feront avancer les chronos.';
  end if;
exception when others then
  raise notice 'pg_cron non configuré (%). Les navigateurs feront avancer les chronos.', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------- temps réel

-- Supabase Realtime prévient les navigateurs à chaque changement (en respectant RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.rooms, public.room_players, public.games, public.game_players,
      public.votes, public.messages, public.private_notes, public.night_actions;
  end if;
end;
$$;

-- ---------------------------------------------------------------- droits

revoke execute on function public.heartbeat(uuid), public.kick_player(uuid, uuid), public.room_state(uuid),
  public.game_state(uuid), public._tick_all(), public.my_view(uuid) from public, anon, authenticated;
grant execute on function public.heartbeat(uuid), public.kick_player(uuid, uuid), public.room_state(uuid),
  public.game_state(uuid), public.my_view(uuid) to authenticated;

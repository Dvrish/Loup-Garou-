-- =====================================================================
-- Les Loups de Vaucombe — étape 4 (2/2) : fonctions du jeu
--
-- Le serveur est la source de vérité : ces fonctions appliquent les mêmes
-- règles que le moteur TypeScript (src/game/engine.ts) et la même machine
-- à états (docs/machine-a-etats.md).
--
-- - Les fonctions dont le nom commence par « _ » sont internes : le
--   navigateur ne peut pas les appeler.
-- - Les autres (create_room, join_room, act_*, cast_vote…) sont appelées
--   par le navigateur avec supabase.rpc(…). Elles vérifient qui appelle
--   (auth.uid()) et refusent toute action interdite avec un message clair.
-- =====================================================================

-- ---------------------------------------------------------------- outils

create function public._fail(p_message text) returns void
language plpgsql as $$
begin
  raise exception using message = p_message, errcode = 'P0001';
end;
$$;

create function public._me() returns uuid
language plpgsql stable as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    perform _fail('Vous devez être connecté.');
  end if;
  return v;
end;
$$;

create function public._clean_pseudo(p_pseudo text) returns text
language plpgsql immutable as $$
declare
  v text := btrim(coalesce(p_pseudo, ''));
begin
  if char_length(v) < 1 or char_length(v) > 16 then
    perform _fail('Le pseudo doit faire entre 1 et 16 caractères.');
  end if;
  return v;
end;
$$;

create function public._role_name(p_role text) returns text
language sql immutable as $$
  select case p_role
    when 'villageois' then 'Villageois'
    when 'loup' then 'Loup-garou'
    when 'voyante' then 'Voyante'
    when 'sorciere' then 'Sorcière'
    when 'chasseur' then 'Chasseur'
    when 'cupidon' then 'Cupidon'
  end;
$$;

create function public._pseudo(p_game uuid, p_player uuid) returns text
language sql stable as $$
  select pseudo from game_players where game_id = p_game and player_id = p_player;
$$;

create function public._role(p_game uuid, p_player uuid) returns text
language sql stable as $$
  select role from player_roles where game_id = p_game and player_id = p_player;
$$;

create function public._alive(p_game uuid, p_player uuid) returns boolean
language sql stable as $$
  select coalesce((select alive from game_players where game_id = p_game and player_id = p_player), false);
$$;

create function public._say(p_game uuid, p_text text, p_channel text default 'systeme', p_author uuid default null, p_author_name text default 'Meneur')
returns void language sql as $$
  insert into messages (game_id, author_id, author, channel, text) values (p_game, p_author, p_author_name, p_channel, p_text);
$$;

create function public._note(p_game uuid, p_player uuid, p_text text) returns void
language sql as $$
  insert into private_notes (game_id, player_id, text) values (p_game, p_player, p_text);
$$;

-- ---------------------------------------------------------------- réglages

create function public.default_settings() returns jsonb
language sql immutable as $$
  select '{"playerCount": 8,
           "roles": {"loup": 2, "villageois": 2, "voyante": 1, "sorciere": 1, "chasseur": 1, "cupidon": 1},
           "nightSeconds": 60, "daySeconds": 180, "voteSeconds": 45,
           "allowAbstain": true, "tieRule": "personne", "discussionMode": "chat"}'::jsonb;
$$;

-- Liste des problèmes empêchant de jouer avec ces réglages (vide = tout va bien).
-- Mêmes contrôles que settingsProblems() côté TypeScript, plus la forme des données.
create function public.settings_problems(s jsonb) returns text[]
language plpgsql immutable security definer set search_path = public as $$
declare
  problems text[] := '{}';
  r text;
  n int;
  total int := 0;
  count int;
begin
  if jsonb_typeof(s) <> 'object' or jsonb_typeof(s -> 'roles') <> 'object' then
    return array['Réglages illisibles.'];
  end if;
  foreach r in array array['loup', 'villageois', 'voyante', 'sorciere', 'chasseur', 'cupidon'] loop
    if jsonb_typeof(s -> 'roles' -> r) <> 'number' then
      return array['Réglages illisibles.'];
    end if;
    n := (s -> 'roles' ->> r)::int;
    if n < 0 then
      problems := problems || 'Nombre de rôles invalide.';
    end if;
    if r not in ('loup', 'villageois') and n > 1 then
      problems := problems || format('Le rôle %s ne peut être présent qu’une fois.', _role_name(r));
    end if;
    total := total + n;
  end loop;
  if jsonb_typeof(s -> 'playerCount') <> 'number' then
    return array['Réglages illisibles.'];
  end if;
  count := (s ->> 'playerCount')::int;
  if count < 6 or count > 16 then
    problems := problems || 'Il faut entre 6 et 16 joueurs.'::text;
  end if;
  if total <> count then
    problems := problems || format('Il y a %s rôle(s) pour %s joueurs.', total, count);
  end if;
  if (s -> 'roles' ->> 'loup')::int < 1 then
    problems := problems || 'Il faut au moins un loup-garou.'::text;
  end if;
  if (s -> 'roles' ->> 'loup')::int * 2 >= count then
    problems := problems || 'Trop de loups : ils doivent être moins de la moitié.'::text;
  end if;
  if jsonb_typeof(s -> 'nightSeconds') <> 'number' or (s ->> 'nightSeconds')::numeric not between 30 and 180
     or jsonb_typeof(s -> 'daySeconds') <> 'number' or (s ->> 'daySeconds')::numeric not between 60 and 600
     or jsonb_typeof(s -> 'voteSeconds') <> 'number' or (s ->> 'voteSeconds')::numeric not between 20 and 120 then
    problems := problems || 'Durées des chronos invalides.'::text;
  end if;
  if jsonb_typeof(s -> 'allowAbstain') <> 'boolean'
     or coalesce(s ->> 'tieRule', '') not in ('personne', 'hasard', 'revote')
     or coalesce(s ->> 'discussionMode', '') not in ('chat', 'piece') then
    problems := problems || 'Réglages illisibles.'::text;
  end if;
  return problems;
end;
$$;

-- ---------------------------------------------------------------- profil et salons

create function public.set_pseudo(p_pseudo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _me();
  v_pseudo text := _clean_pseudo(p_pseudo);
begin
  insert into profiles (id, pseudo) values (v_me, v_pseudo)
  on conflict (id) do update set pseudo = excluded.pseudo;
end;
$$;

create function public.create_room(p_pseudo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _me();
  v_pseudo text := _clean_pseudo(p_pseudo);
  v_code text;
  v_room uuid;
begin
  perform set_pseudo(v_pseudo);
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 24)::int, 1), '')
      into v_code from generate_series(1, 5);
    exit when not exists (select 1 from rooms where code = v_code);
  end loop;
  insert into rooms (code, host_id, settings) values (v_code, v_me, default_settings()) returning id into v_room;
  insert into room_players (room_id, player_id, pseudo) values (v_room, v_me, v_pseudo);
  return jsonb_build_object('room_id', v_room, 'code', v_code);
end;
$$;

create function public.join_room(p_code text, p_pseudo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _me();
  v_pseudo text := _clean_pseudo(p_pseudo);
  v_room rooms%rowtype;
begin
  select * into v_room from rooms where code = upper(btrim(p_code)) for update;
  if not found then
    perform _fail('Aucune partie ne correspond à ce code.');
  end if;
  -- Déjà dans le salon : c'est une reconnexion
  if exists (select 1 from room_players where room_id = v_room.id and player_id = v_me) then
    return v_room.id;
  end if;
  if v_room.status <> 'salon' then
    perform _fail('Cette partie a déjà commencé.');
  end if;
  if (select count(*) from room_players where room_id = v_room.id) >= 16 then
    perform _fail('Le salon est complet (16 joueurs).');
  end if;
  if exists (select 1 from room_players where room_id = v_room.id and lower(pseudo) = lower(v_pseudo)) then
    perform _fail('Ce pseudo est déjà pris dans ce salon.');
  end if;
  perform set_pseudo(v_pseudo);
  insert into room_players (room_id, player_id, pseudo) values (v_room.id, v_me, v_pseudo);
  return v_room.id;
end;
$$;

create function public.leave_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _me();
  v_room rooms%rowtype;
  v_next uuid;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or not exists (select 1 from room_players where room_id = p_room and player_id = v_me) then
    perform _fail('Vous n’êtes pas dans ce salon.');
  end if;
  if v_room.status = 'en_jeu' then
    perform _fail('Impossible de quitter une partie en cours.');
  end if;
  delete from room_players where room_id = p_room and player_id = v_me;
  if v_room.host_id = v_me then
    select player_id into v_next from room_players where room_id = p_room order by joined_at limit 1;
    if v_next is null then
      delete from rooms where id = p_room;
    else
      update rooms set host_id = v_next where id = p_room;
    end if;
  end if;
end;
$$;

create function public.update_settings(p_room uuid, p_settings jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _me();
  v_room rooms%rowtype;
  v_problems text[];
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_id <> v_me then
    perform _fail('Seul l’hôte peut modifier les réglages.');
  end if;
  if v_room.status = 'en_jeu' then
    perform _fail('La partie a déjà commencé.');
  end if;
  -- On accepte des réglages incomplets dans le salon (l'hôte les ajuste),
  -- mais pas des données illisibles.
  v_problems := settings_problems(p_settings);
  if 'Réglages illisibles.' = any (v_problems) or 'Durées des chronos invalides.' = any (v_problems) then
    perform _fail(v_problems[1]);
  end if;
  update rooms set settings = p_settings where id = p_room;
end;
$$;

-- ---------------------------------------------------------------- machine à états

create function public._transition_allowed(p_from text, p_to text) returns boolean
language sql immutable as $$
  select p_to = any (case p_from
    when 'lobby' then array['attribution']
    when 'attribution' then array['cupidon', 'voyante', 'loups']
    when 'cupidon' then array['voyante', 'loups']
    when 'voyante' then array['loups']
    when 'loups' then array['sorciere', 'resolution-nuit']
    when 'sorciere' then array['resolution-nuit']
    when 'resolution-nuit' then array['aube']
    when 'aube' then array['chasseur', 'verification']
    when 'chasseur' then array['chasseur', 'verification']
    when 'verification' then array['debat', 'voyante', 'loups', 'fin']
    when 'debat' then array['vote']
    when 'vote' then array['resolution-vote']
    when 'resolution-vote' then array['vote', 'verdict']
    when 'verdict' then array['chasseur', 'verification']
    else array[]::text[]
  end);
$$;

create function public._goto(p_game uuid, p_to text) returns void
language plpgsql as $$
declare
  v_from text;
  v_day int;
begin
  select phase, day into v_from, v_day from games where id = p_game;
  if not _transition_allowed(v_from, p_to) then
    raise exception 'Transition interdite : % → %', v_from, p_to;
  end if;
  insert into game_events (game_id, from_phase, to_phase, day) values (p_game, v_from, p_to, v_day);
  update games set phase = p_to where id = p_game;
end;
$$;

create function public._rest(p_game uuid, p_seconds numeric) returns void
language sql as $$
  update games set phase_ends_at = now() + make_interval(secs => p_seconds) where id = p_game;
$$;

create function public._setting(p_game uuid, p_key text) returns numeric
language sql stable as $$
  select (settings ->> p_key)::numeric from games where id = p_game;
$$;

-- Joueurs dont on attend une action pendant la phase courante
create function public._pending(p_game uuid) returns setof uuid
language plpgsql stable as $$
declare
  g games%rowtype;
  s game_secrets%rowtype;
begin
  select * into g from games where id = p_game;
  select * into s from game_secrets where game_id = p_game;
  if g.phase in ('cupidon', 'voyante', 'loups', 'sorciere') then
    return query
      select gp.player_id from game_players gp join player_roles pr using (game_id, player_id)
      where gp.game_id = p_game and gp.alive
        and pr.role = case g.phase when 'loups' then 'loup' else g.phase end;
  elsif g.phase = 'chasseur' then
    return query select s.hunter_queue[1];
  elsif g.phase = 'vote' then
    return query select player_id from game_players where game_id = p_game and alive;
  end if;
end;
$$;

create function public._has_acted(p_game uuid, p_player uuid) returns boolean
language plpgsql stable as $$
declare
  g games%rowtype;
begin
  select * into g from games where id = p_game;
  if g.phase = 'vote' then
    return exists (select 1 from votes where game_id = p_game and day = g.day and round = g.vote_round and voter_id = p_player);
  end if;
  return exists (select 1 from night_actions where game_id = p_game and day = g.day and phase = g.phase and player_id = p_player);
end;
$$;

-- Tout le monde a-t-il agi ? (faux s'il n'y a personne à attendre : on laisse le chrono courir)
create function public._all_done(p_game uuid) returns boolean
language sql stable as $$
  select exists (select 1 from _pending(p_game))
     and not exists (select 1 from _pending(p_game) p where not _has_acted(p_game, p));
$$;

-- ---------------------------------------------------------------- morts et victoire

create function public._death_line(p_game uuid, p_player uuid, p_cause text) returns text
language plpgsql stable as $$
declare
  v_name text := _pseudo(p_game, p_player);
  v_role text := _role_name(_role(p_game, p_player));
begin
  return case p_cause
    when 'loups' then format('Les loups ont emporté %s. Son rôle : %s.', v_name, v_role)
    when 'poison' then format('%s a succombé à un poison mystérieux. Son rôle : %s.', v_name, v_role)
    when 'vote' then format('Le village a éliminé %s. Son rôle : %s.', v_name, v_role)
    when 'chagrin' then format('Le cœur brisé, %s rejoint l’être aimé dans la mort. Son rôle : %s.', v_name, v_role)
    when 'chasseur' then format('La balle du chasseur atteint %s. Son rôle : %s.', v_name, v_role)
  end;
end;
$$;

-- Tue un joueur et déclenche les effets : chasseur, amoureux.
create function public._kill(p_game uuid, p_player uuid, p_cause text) returns void
language plpgsql as $$
declare
  v_lovers uuid[];
  v_partner uuid;
begin
  if not _alive(p_game, p_player) then
    return;
  end if;
  update game_players
     set alive = false, death_day = (select day from games where id = p_game), death_cause = p_cause, death_seq = nextval('death_seq')
   where game_id = p_game and player_id = p_player;
  if _role(p_game, p_player) = 'chasseur' then
    update game_secrets set hunter_queue = hunter_queue || p_player where game_id = p_game;
  end if;
  select lovers into v_lovers from game_secrets where game_id = p_game;
  if v_lovers is not null and p_player = any (v_lovers) then
    v_partner := case when v_lovers[1] = p_player then v_lovers[2] else v_lovers[1] end;
    if _alive(p_game, v_partner) then
      perform _kill(p_game, v_partner, 'chagrin');
    end if;
  end if;
end;
$$;

create function public._death_seq_now() returns bigint
language sql as $$
  select coalesce(max(death_seq), 0) from game_players;
$$;

create function public._deaths_since(p_game uuid, p_seq bigint) returns text
language sql stable as $$
  select coalesce(string_agg(_death_line(game_id, player_id, death_cause), ' ' order by death_seq), '')
  from game_players where game_id = p_game and death_seq > p_seq;
$$;

create function public._check_winner(p_game uuid) returns text
language plpgsql stable as $$
declare
  v_alive int;
  v_wolves int;
  v_lovers uuid[];
  v_mixed boolean := false;
begin
  select count(*), count(*) filter (where pr.role = 'loup')
    into v_alive, v_wolves
    from game_players gp join player_roles pr using (game_id, player_id)
   where gp.game_id = p_game and gp.alive;
  if v_alive = 0 then
    return 'aucun';
  end if;
  select lovers into v_lovers from game_secrets where game_id = p_game;
  if v_lovers is not null then
    v_mixed := (_role(p_game, v_lovers[1]) = 'loup') <> (_role(p_game, v_lovers[2]) = 'loup');
    if v_mixed and v_alive = 2 and _alive(p_game, v_lovers[1]) and _alive(p_game, v_lovers[2]) then
      return 'amoureux';
    end if;
  end if;
  if v_wolves = 0 then
    return 'village';
  end if;
  if v_wolves >= v_alive - v_wolves then
    return 'loups';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------- nuit

create function public._night_actor(p_step text) returns text
language sql immutable as $$
  select case p_step when 'loups' then 'loup' else p_step end;
$$;

create function public._night_step_active(p_game uuid, p_step text) returns boolean
language plpgsql stable as $$
declare
  g games%rowtype;
  s game_secrets%rowtype;
  v_someone boolean;
begin
  select * into g from games where id = p_game;
  select * into s from game_secrets where game_id = p_game;
  select exists (
    select 1 from game_players gp join player_roles pr using (game_id, player_id)
    where gp.game_id = p_game and gp.alive and pr.role = _night_actor(p_step)
  ) into v_someone;
  if p_step = 'cupidon' then
    return v_someone and g.day = 1 and s.lovers is null;
  elsif p_step = 'sorciere' then
    return v_someone and (s.witch_life or s.witch_death);
  end if;
  return v_someone;
end;
$$;

create function public._next_night_step(p_game uuid, p_after text) returns void
language plpgsql as $$
declare
  v_steps text[] := array['cupidon', 'voyante', 'loups', 'sorciere'];
  i int;
begin
  for i in coalesce(array_position(v_steps, p_after), 0) + 1 .. 4 loop
    if _night_step_active(p_game, v_steps[i]) then
      perform _goto(p_game, v_steps[i]);
      perform _rest(p_game, _setting(p_game, 'nightSeconds'));
      update games set announcement = case v_steps[i]
        when 'cupidon' then 'Cupidon se réveille et désigne deux amoureux…'
        when 'voyante' then 'La voyante se réveille et sonde une âme…'
        when 'loups' then 'Les loups-garous se réveillent et choisissent leur victime…'
        when 'sorciere' then 'La sorcière se réveille et contemple ses potions…'
      end where id = p_game;
      return;
    end if;
  end loop;
  perform _resolve_night(p_game);
end;
$$;

create function public._start_night(p_game uuid) returns void
language plpgsql as $$
begin
  update game_secrets set wolf_target = null, witch_save_tonight = false, witch_kill_tonight = null where game_id = p_game;
  update games set runoff = null, eliminated_today = null, vote_round = 1 where id = p_game;
  perform _next_night_step(p_game, null);
end;
$$;

create function public._end_night_step(p_game uuid, p_step text) returns void
language plpgsql as $$
declare
  g games%rowtype;
  v_a uuid;
  v_b uuid;
  v_cupid uuid;
  v_target uuid;
  v_pair uuid[];
begin
  select * into g from games where id = p_game;
  if p_step = 'cupidon' then
    select target, target2 into v_a, v_b from night_actions where game_id = p_game and day = g.day and phase = 'cupidon';
    if v_a is null then
      -- Cupidon n'a pas choisi à temps : deux amoureux au hasard
      select array_agg(player_id) into v_pair from (
        select player_id from game_players where game_id = p_game and alive order by random() limit 2
      ) t;
      v_a := v_pair[1];
      v_b := v_pair[2];
    end if;
    update game_secrets set lovers = array[v_a, v_b] where game_id = p_game;
    perform _note(p_game, v_a, format('Une flèche de Cupidon vous lie à %s (%s). Si l’un de vous meurt, l’autre meurt de chagrin.', _pseudo(p_game, v_b), _role_name(_role(p_game, v_b))));
    perform _note(p_game, v_b, format('Une flèche de Cupidon vous lie à %s (%s). Si l’un de vous meurt, l’autre meurt de chagrin.', _pseudo(p_game, v_a), _role_name(_role(p_game, v_a))));
    select gp.player_id into v_cupid from game_players gp join player_roles pr using (game_id, player_id)
     where gp.game_id = p_game and gp.alive and pr.role = 'cupidon';
    perform _note(p_game, v_cupid, format('Vous avez uni %s et %s.', _pseudo(p_game, v_a), _pseudo(p_game, v_b)));
  elsif p_step = 'loups' then
    -- Victime : le choix le plus fréquent parmi les loups vivants (tirage au sort en cas d'égalité)
    select na.target into v_target
      from night_actions na
     where na.game_id = p_game and na.day = g.day and na.phase = 'loups'
       and _alive(p_game, na.player_id) and _alive(p_game, na.target) and _role(p_game, na.target) <> 'loup'
     group by na.target
     order by count(*) desc, random()
     limit 1;
    update game_secrets set wolf_target = v_target where game_id = p_game;
  elsif p_step = 'sorciere' then
    perform _resolve_night(p_game);
    return;
  end if;
  perform _next_night_step(p_game, p_step);
end;
$$;

create function public._resolve_night(p_game uuid) returns void
language plpgsql as $$
declare
  s game_secrets%rowtype;
  v_seq bigint := _death_seq_now();
  v_lines text;
  v_text text;
begin
  perform _goto(p_game, 'resolution-nuit');
  select * into s from game_secrets where game_id = p_game;
  if s.wolf_target is not null and not s.witch_save_tonight then
    perform _kill(p_game, s.wolf_target, 'loups');
  end if;
  if s.witch_kill_tonight is not null then
    perform _kill(p_game, s.witch_kill_tonight, 'poison');
  end if;
  v_lines := _deaths_since(p_game, v_seq);
  v_text := 'Le village se réveille. ' || case when v_lines = '' then 'Miracle : personne n’est mort cette nuit.' else v_lines end;
  update games set announcement = v_text where id = p_game;
  perform _say(p_game, v_text);
  perform _goto(p_game, 'aube');
  perform _rest(p_game, 10);
  update game_secrets set after_verification = 'debat' where game_id = p_game;
end;
$$;

-- ---------------------------------------------------------------- chasseur et vérification

create function public._after_deaths(p_game uuid) returns void
language plpgsql as $$
declare
  v_hunter uuid;
begin
  select hunter_queue[1] into v_hunter from game_secrets where game_id = p_game;
  if v_hunter is not null then
    perform _goto(p_game, 'chasseur');
    perform _rest(p_game, 30);
    update games set announcement = format('%s, le chasseur, rassemble ses dernières forces pour tirer…', _pseudo(p_game, v_hunter))
     where id = p_game;
    return;
  end if;
  perform _verify(p_game);
end;
$$;

create function public._end_hunter(p_game uuid) returns void
language plpgsql as $$
declare
  v_hunter uuid;
  v_target uuid;
  v_seq bigint := _death_seq_now();
  v_lines text;
begin
  select hunter_queue[1] into v_hunter from game_secrets where game_id = p_game;
  update game_secrets set hunter_queue = hunter_queue[2:] where game_id = p_game;
  select target into v_target from night_actions
   where game_id = p_game and phase = 'chasseur' and player_id = v_hunter
   order by created_at desc limit 1;
  if v_target is not null and _alive(p_game, v_target) then
    perform _kill(p_game, v_target, 'chasseur');
  end if;
  v_lines := _deaths_since(p_game, v_seq);
  perform _say(p_game, case when v_lines = '' then format('%s meurt sans tirer.', _pseudo(p_game, v_hunter))
                            else format('%s tire une dernière fois. %s', _pseudo(p_game, v_hunter), v_lines) end);
  perform _after_deaths(p_game);
end;
$$;

create function public._verify(p_game uuid) returns void
language plpgsql as $$
declare
  v_winner text;
  v_after text;
  v_text text;
begin
  perform _goto(p_game, 'verification');
  v_winner := _check_winner(p_game);
  if v_winner is not null then
    perform _goto(p_game, 'fin');
    v_text := case v_winner
      when 'village' then 'Le dernier loup est tombé : le village de Vaucombe est sauvé !'
      when 'loups' then 'Les loups sont maintenant aussi nombreux que les villageois : la meute a gagné.'
      when 'amoureux' then 'Seuls les deux amoureux ont survécu : l’amour triomphe de tout !'
      else 'Plus personne ne respire à Vaucombe…'
    end;
    update games set winner = v_winner, announcement = v_text, phase_ends_at = now() where id = p_game;
    update rooms set status = 'terminee' where id = (select room_id from games where id = p_game);
    perform _say(p_game, v_text);
    return;
  end if;
  select after_verification into v_after from game_secrets where game_id = p_game;
  if v_after = 'debat' then
    perform _goto(p_game, 'debat');
    perform _rest(p_game, _setting(p_game, 'daySeconds'));
    update games set announcement = format('Jour %s : le village débat. Qui sont les loups ?', day) where id = p_game;
  else
    update games set day = day + 1 where id = p_game;
    perform _say(p_game, format('La nuit %s tombe sur Vaucombe… Fermez les yeux.', (select day from games where id = p_game)));
    perform _start_night(p_game);
  end if;
end;
$$;

-- ---------------------------------------------------------------- jour

create function public._enter_vote(p_game uuid, p_runoff uuid[]) returns void
language plpgsql as $$
begin
  perform _goto(p_game, 'vote');
  update games set runoff = p_runoff, vote_round = case when p_runoff is null then 1 else 2 end,
    announcement = case when p_runoff is null then 'Le village vote. Qui doit être éliminé ?'
      else 'Égalité ! Second vote entre ' || (select string_agg(_pseudo(p_game, x), ' et ') from unnest(p_runoff) x) || '.' end
   where id = p_game;
  perform _rest(p_game, _setting(p_game, 'voteSeconds'));
end;
$$;

create function public._resolve_vote(p_game uuid) returns void
language plpgsql as $$
declare
  g games%rowtype;
  v_tally jsonb;
  v_max int;
  v_top uuid[];
  v_summary text;
  v_eliminated uuid;
  v_tie text := '';
  v_seq bigint := _death_seq_now();
  v_lines text;
  v_text text;
begin
  perform _goto(p_game, 'resolution-vote');
  select * into g from games where id = p_game;

  -- Décompte : votants vivants, cibles vivantes (et parmi les ex æquo lors d'un second vote)
  select coalesce(jsonb_object_agg(target_id, n), '{}'::jsonb) into v_tally from (
    select v.target_id, count(*)::int as n from votes v
     where v.game_id = p_game and v.day = g.day and v.round = g.vote_round and v.target_id is not null
       and _alive(p_game, v.voter_id) and _alive(p_game, v.target_id)
       and (g.runoff is null or v.target_id = any (g.runoff))
     group by v.target_id
  ) t;
  select max(value::int) into v_max from jsonb_each_text(v_tally);
  select array_agg(key::uuid order by key) into v_top from jsonb_each_text(v_tally) where value::int = v_max;
  select string_agg(format('%s (%s)', _pseudo(p_game, key::uuid), value), ', ' order by value::int desc, _pseudo(p_game, key::uuid))
    into v_summary from jsonb_each_text(v_tally);

  if coalesce(array_length(v_top, 1), 0) = 1 then
    v_eliminated := v_top[1];
  elsif coalesce(array_length(v_top, 1), 0) > 1 then
    if g.settings ->> 'tieRule' = 'hasard' then
      v_eliminated := v_top[1 + floor(random() * array_length(v_top, 1))::int];
      v_tie := 'Égalité : le sort a tranché. ';
    elsif g.settings ->> 'tieRule' = 'revote' and g.runoff is null then
      perform _say(p_game, format('Votes : %s. Égalité, un second vote départage les ex æquo.', v_summary));
      perform _enter_vote(p_game, v_top);
      return;
    else
      v_tie := 'Égalité : personne n’est éliminé. ';
    end if;
  end if;

  update games set eliminated_today = v_eliminated where id = p_game;
  if v_eliminated is not null then
    perform _kill(p_game, v_eliminated, 'vote');
  end if;
  v_lines := _deaths_since(p_game, v_seq);
  v_text := btrim(case when v_summary is null then 'Aucun vote. ' else format('Votes : %s. ', v_summary) end
    || v_tie
    || case when v_lines <> '' then v_lines when v_eliminated is null then 'Le village n’élimine personne aujourd’hui.' else '' end);
  update games set announcement = v_text where id = p_game;
  perform _say(p_game, v_text);
  perform _goto(p_game, 'verdict');
  perform _rest(p_game, 8);
  update game_secrets set after_verification = 'nuit' where game_id = p_game;
end;
$$;

-- ---------------------------------------------------------------- avancer le temps

create function public._end_phase(p_game uuid) returns void
language plpgsql as $$
declare
  v_phase text;
begin
  select phase into v_phase from games where id = p_game;
  case
    when v_phase = 'attribution' then
      perform _say(p_game, 'La nuit tombe sur Vaucombe… Fermez les yeux.');
      perform _start_night(p_game);
    when v_phase in ('cupidon', 'voyante', 'loups', 'sorciere') then
      perform _end_night_step(p_game, v_phase);
    when v_phase in ('aube', 'verdict') then
      perform _after_deaths(p_game);
    when v_phase = 'chasseur' then
      perform _end_hunter(p_game);
    when v_phase = 'debat' then
      perform _enter_vote(p_game, null);
    when v_phase = 'vote' then
      perform _resolve_vote(p_game);
    else
      null;
  end case;
end;
$$;

-- Termine la phase si son chrono est écoulé ou si tous les joueurs attendus ont agi.
-- Renvoie vrai si la partie a avancé.
create function public._try_advance(p_game uuid) returns boolean
language plpgsql as $$
declare
  g games%rowtype;
begin
  select * into g from games where id = p_game for update;
  if not found or g.winner is not null then
    return false;
  end if;
  if now() >= g.phase_ends_at or _all_done(p_game) then
    perform _end_phase(p_game);
    return true;
  end if;
  return false;
end;
$$;

-- Appelée par les navigateurs quand leur chrono arrive à zéro (et plus tard par une tâche planifiée).
-- Sans danger : elle ne fait rien si la phase n'est pas vraiment terminée.
create function public.advance_game(p_game uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_game_member(p_game) then
    perform _fail('Vous ne participez pas à cette partie.');
  end if;
  return _try_advance(p_game);
end;
$$;

create function public.start_game(p_room uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _me();
  v_room rooms%rowtype;
  v_count int;
  v_problems text[];
  v_game uuid;
  v_roles text[];
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_id <> v_me then
    perform _fail('Seul l’hôte peut lancer la partie.');
  end if;
  if v_room.status = 'en_jeu' then
    perform _fail('La partie a déjà commencé.');
  end if;
  select count(*) into v_count from room_players where room_id = p_room;
  if v_count <> (v_room.settings ->> 'playerCount')::int then
    perform _fail(format('Il faut %s joueurs dans le salon (actuellement %s).', v_room.settings ->> 'playerCount', v_count));
  end if;
  v_problems := settings_problems(v_room.settings);
  if array_length(v_problems, 1) > 0 then
    perform _fail(v_problems[1]);
  end if;

  insert into games (room_id, settings, phase, phase_ends_at, announcement)
  values (p_room, v_room.settings, 'lobby', now(), 'Les rôles sont distribués…')
  returning id into v_game;
  insert into game_secrets (game_id) values (v_game);

  -- Places autour de la table et rôles : deux tirages au sort indépendants
  insert into game_players (game_id, player_id, seat, pseudo)
    select v_game, player_id, row_number() over (order by random()), pseudo from room_players where room_id = p_room;
  select array_agg(r order by random()) into v_roles from (
    select r from jsonb_each_text(v_room.settings -> 'roles') e(r, n), generate_series(1, e.n::int)
  ) t;
  insert into player_roles (game_id, player_id, role)
    select v_game, player_id, v_roles[seat] from game_players where game_id = v_game;

  update rooms set status = 'en_jeu' where id = p_room;
  perform _goto(v_game, 'attribution');
  perform _rest(v_game, 12); -- le temps de découvrir sa carte
  perform _say(v_game, 'Les rôles sont distribués. Découvrez votre carte en secret…');
  return v_game;
end;
$$;

-- L'hôte relance une partie avec le même groupe (retour au salon).
create function public.back_to_lobby(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_id <> _me() then
    perform _fail('Seul l’hôte peut rouvrir le salon.');
  end if;
  if v_room.status <> 'terminee' then
    perform _fail('La partie n’est pas terminée.');
  end if;
  update rooms set status = 'salon' where id = p_room;
end;
$$;

-- ---------------------------------------------------------------- actions des joueurs

-- Vérifie que c'est bien à moi d'agir dans cette phase ; verrouille la partie.
create function public._my_turn(p_game uuid, p_phase text) returns games
language plpgsql as $$
declare
  g games%rowtype;
  v_me uuid := _me();
begin
  select * into g from games where id = p_game for update;
  if not found or not exists (select 1 from game_players where game_id = p_game and player_id = v_me) then
    perform _fail('Vous ne participez pas à cette partie.');
  end if;
  if g.winner is not null then
    perform _fail('La partie est terminée.');
  end if;
  if g.phase <> p_phase or not exists (select 1 from _pending(p_game) p where p = v_me) or _has_acted(p_game, v_me) then
    perform _fail('Ce n’est pas à vous d’agir maintenant.');
  end if;
  return g;
end;
$$;

create function public.act_cupidon(p_game uuid, p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games := _my_turn(p_game, 'cupidon');
begin
  if p_a = p_b then perform _fail('Choisissez deux joueurs différents.'); end if;
  if not _alive(p_game, p_a) or not _alive(p_game, p_b) then perform _fail('Les amoureux doivent être vivants.'); end if;
  insert into night_actions (game_id, day, phase, player_id, target, target2) values (p_game, g.day, 'cupidon', auth.uid(), p_a, p_b);
  perform _try_advance(p_game);
end;
$$;

create function public.act_voyante(p_game uuid, p_target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  g games := _my_turn(p_game, 'voyante');
  v_role text;
begin
  if p_target = auth.uid() then perform _fail('Vous connaissez déjà votre rôle.'); end if;
  if not _alive(p_game, p_target) then perform _fail('Ce joueur n’est pas en vie.'); end if;
  v_role := _role(p_game, p_target);
  insert into night_actions (game_id, day, phase, player_id, target) values (p_game, g.day, 'voyante', auth.uid(), p_target);
  perform _note(p_game, auth.uid(), format('Votre vision : %s est %s.', _pseudo(p_game, p_target), _role_name(v_role)));
  perform _try_advance(p_game);
  return v_role;
end;
$$;

create function public.act_loups(p_game uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games := _my_turn(p_game, 'loups');
begin
  if not _alive(p_game, p_target) then perform _fail('Ce joueur n’est pas en vie.'); end if;
  if _role(p_game, p_target) = 'loup' then perform _fail('Un loup ne peut pas dévorer un autre loup.'); end if;
  insert into night_actions (game_id, day, phase, player_id, target) values (p_game, g.day, 'loups', auth.uid(), p_target);
  if g.settings ->> 'discussionMode' = 'chat' then
    perform _say(p_game, format('Je choisis %s.', _pseudo(p_game, p_target)), 'loups', auth.uid(), _pseudo(p_game, auth.uid()));
  end if;
  perform _try_advance(p_game);
end;
$$;

create function public.act_sorciere(p_game uuid, p_save boolean, p_kill uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games := _my_turn(p_game, 'sorciere');
  s game_secrets%rowtype;
begin
  select * into s from game_secrets where game_id = p_game for update;
  if p_save and not s.witch_life then perform _fail('La potion de vie est déjà utilisée.'); end if;
  if p_save and s.wolf_target is null then perform _fail('Personne n’est à sauver cette nuit.'); end if;
  if p_kill is not null then
    if not s.witch_death then perform _fail('La potion de mort est déjà utilisée.'); end if;
    if p_kill = auth.uid() then perform _fail('Vous ne pouvez pas vous empoisonner.'); end if;
    if not _alive(p_game, p_kill) then perform _fail('Ce joueur n’est pas en vie.'); end if;
  end if;
  update game_secrets set
    witch_life = witch_life and not coalesce(p_save, false),
    witch_save_tonight = coalesce(p_save, false),
    witch_death = witch_death and p_kill is null,
    witch_kill_tonight = p_kill
  where game_id = p_game;
  insert into night_actions (game_id, day, phase, player_id, target, save) values (p_game, g.day, 'sorciere', auth.uid(), p_kill, coalesce(p_save, false));
  perform _try_advance(p_game);
end;
$$;

create function public.act_chasseur(p_game uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games := _my_turn(p_game, 'chasseur');
begin
  if p_target is not null and (p_target = auth.uid() or not _alive(p_game, p_target)) then
    perform _fail('Cible invalide.');
  end if;
  insert into night_actions (game_id, day, phase, player_id, target) values (p_game, g.day, 'chasseur', auth.uid(), p_target);
  perform _try_advance(p_game);
end;
$$;

-- p_target null = abstention
create function public.cast_vote(p_game uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games := _my_turn(p_game, 'vote');
begin
  if p_target is null then
    if not (g.settings ->> 'allowAbstain')::boolean then perform _fail('L’abstention n’est pas autorisée.'); end if;
  else
    if p_target = auth.uid() then perform _fail('Vous ne pouvez pas voter contre vous-même.'); end if;
    if not _alive(p_game, p_target) then perform _fail('Ce joueur n’est pas en vie.'); end if;
    if g.runoff is not null and not p_target = any (g.runoff) then perform _fail('Ce second vote ne concerne que les ex æquo.'); end if;
  end if;
  insert into votes (game_id, day, round, voter_id, target_id) values (p_game, g.day, g.vote_round, auth.uid(), p_target);
  perform _try_advance(p_game);
end;
$$;

create function public.send_message(p_game uuid, p_channel text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _me();
  g games%rowtype;
  v_text text := btrim(coalesce(p_text, ''));
begin
  select * into g from games where id = p_game;
  if not found or not exists (select 1 from game_players where game_id = p_game and player_id = v_me) then
    perform _fail('Vous ne participez pas à cette partie.');
  end if;
  if g.winner is not null then perform _fail('La partie est terminée.'); end if;
  if not _alive(p_game, v_me) then perform _fail('Les morts ne parlent pas.'); end if;
  if g.settings ->> 'discussionMode' <> 'chat' then perform _fail('Pas de chat en mode « même pièce ».'); end if;
  if v_text = '' then perform _fail('Message vide.'); end if;
  if char_length(v_text) > 240 then perform _fail('Message trop long.'); end if;
  if p_channel = 'public' and g.phase not in ('aube', 'chasseur', 'debat', 'vote', 'verdict') then
    perform _fail('Le village dort : silence.');
  end if;
  if p_channel = 'loups' and (_role(p_game, v_me) <> 'loup' or g.phase not in ('cupidon', 'voyante', 'loups', 'sorciere')) then
    perform _fail('Seule la meute parle la nuit.');
  end if;
  if p_channel not in ('public', 'loups') then perform _fail('Canal inconnu.'); end if;
  perform _say(p_game, v_text, p_channel, v_me, _pseudo(p_game, v_me));
end;
$$;

create function public.skip_phase(p_game uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games%rowtype;
begin
  select * into g from games where id = p_game for update;
  if not found or (select host_id from rooms where id = g.room_id) <> _me() then
    perform _fail('Seul l’hôte peut passer cette étape.');
  end if;
  if g.phase not in ('aube', 'debat', 'verdict') then
    perform _fail('Cette étape ne peut pas être passée.');
  end if;
  update games set phase_ends_at = now() where id = p_game;
  perform _try_advance(p_game);
end;
$$;

-- ---------------------------------------------------------------- ce que je sais en secret

-- Tout ce que le joueur connecté a le droit de savoir et qui n'est pas public.
create function public.my_view(p_game uuid) returns jsonb
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
    -- Cupidon connaît le couple qu'il a formé ; les morts et la fin de partie aussi
    'lovers', case when v_role = 'cupidon' or not _alive(p_game, v_me) or g.winner is not null then to_jsonb(s.lovers) end,
    'pending', exists (select 1 from _pending(p_game) p where p = v_me) and not _has_acted(p_game, v_me),
    'acted', _has_acted(p_game, v_me),
    -- La sorcière apprend la victime des loups pendant son tour
    'wolf_target', case when v_role = 'sorciere' and g.phase = 'sorciere' then s.wolf_target end,
    'witch', case when v_role = 'sorciere' then jsonb_build_object('life', s.witch_life, 'death', s.witch_death) end,
    'seer_results', case when v_role = 'voyante' then (
      select coalesce(jsonb_object_agg(na.target, _role(p_game, na.target)), '{}'::jsonb)
      from night_actions na where na.game_id = p_game and na.phase = 'voyante' and na.player_id = v_me
    ) end
  );
end;
$$;

-- ---------------------------------------------------------------- droits d'exécution

-- Par défaut, personne ne peut appeler les fonctions…
revoke execute on all functions in schema public from public, anon, authenticated;
-- … sauf celles prévues pour le navigateur (joueurs connectés, y compris anonymes).
grant execute on function
  public.set_pseudo(text),
  public.create_room(text),
  public.join_room(text, text),
  public.leave_room(uuid),
  public.update_settings(uuid, jsonb),
  public.start_game(uuid),
  public.back_to_lobby(uuid),
  public.advance_game(uuid),
  public.act_cupidon(uuid, uuid, uuid),
  public.act_voyante(uuid, uuid),
  public.act_loups(uuid, uuid),
  public.act_sorciere(uuid, boolean, uuid),
  public.act_chasseur(uuid, uuid),
  public.cast_vote(uuid, uuid),
  public.send_message(uuid, text, text),
  public.skip_phase(uuid),
  public.my_view(uuid),
  public.default_settings(),
  public.settings_problems(jsonb),
  -- utilisées par les règles RLS
  public.is_room_member(uuid),
  public.is_game_member(uuid),
  public.my_role(uuid),
  public.am_alive(uuid),
  public.game_over(uuid),
  public.is_dead_player(uuid, uuid)
to authenticated;

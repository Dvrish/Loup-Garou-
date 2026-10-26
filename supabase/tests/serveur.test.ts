// Tests du serveur : chaque joueur est un utilisateur distinct, et chaque requête passe
// par les mêmes droits que depuis le navigateur (rôle « authenticated » + RLS).
import { beforeAll, describe, expect, it } from 'vitest';
import { TRANSITIONS } from '../../src/game/engine';
import type { Phase } from '../../src/game/types';
import { Db } from './db';

const NAMES = ['Aubin', 'Margot', 'Basile', 'Ondine', 'Gaspard', 'Léonie', 'Firmin', 'Adèle', 'Côme', 'Suzon', 'Anatole', 'Philomène', 'Hector', 'Rosalie', 'Augustin', 'Mahaut'];

function settings(count: number, extra: Record<string, unknown> = {}) {
  const wolves = count >= 12 ? 3 : 2;
  return {
    playerCount: count,
    roles: { loup: wolves, villageois: count - wolves - 4, voyante: 1, sorciere: 1, chasseur: 1, cupidon: 1 },
    nightSeconds: 30,
    daySeconds: 60,
    voteSeconds: 30,
    allowAbstain: true,
    tieRule: 'personne',
    discussionMode: 'chat',
    ...extra,
  };
}

/** Crée un salon complet et lance la partie. */
async function setupGame(db: Db, count: number, extra: Record<string, unknown> = {}) {
  const users: string[] = [];
  for (let i = 0; i < count; i++) users.push(await db.newUser());
  const { room_id, code } = await db.rpc<{ room_id: string; code: string }>(users[0], 'create_room', [NAMES[0]]);
  for (let i = 1; i < count; i++) await db.rpc(users[i], 'join_room', [code.toLowerCase(), NAMES[i]]);
  await db.rpc(users[0], 'update_settings', [room_id, JSON.stringify(settings(count, extra))]);
  const game = await db.rpc<string>(users[0], 'start_game', [room_id]);
  const roles = Object.fromEntries(
    (await db.admin<{ player_id: string; role: string }>('select player_id, role from player_roles where game_id = $1', [game])).map((r) => [r.player_id, r.role]),
  );
  const name = Object.fromEntries(users.map((u, i) => [u, NAMES[i]]));
  return { users, room_id, code, game, roles, name };
}

const phaseOf = async (db: Db, game: string) => (await db.admin<{ phase: string }>('select phase from games where id = $1', [game]))[0].phase;

describe('salon', () => {
  let db: Db;
  beforeAll(async () => {
    db = await Db.create();
  }, 60000);

  it('créer, rejoindre, se reconnecter ; les étrangers ne voient rien', async () => {
    const [host, guest, outsider] = [await db.newUser(), await db.newUser(), await db.newUser()];
    const { room_id, code } = await db.rpc<{ room_id: string; code: string }>(host, 'create_room', ['Aubin']);
    expect(code).toMatch(/^[A-Z]{5}$/);
    expect(await db.rpc(guest, 'join_room', [code, 'Margot'])).toBe(room_id);
    expect(await db.rpc(guest, 'join_room', [code, 'Margot'])).toBe(room_id); // reconnexion
    expect(await db.as(guest, 'select pseudo from room_players order by joined_at')).toEqual([{ pseudo: 'Aubin' }, { pseudo: 'Margot' }]);
    expect(await db.as(outsider, 'select * from rooms')).toEqual([]);
    expect(await db.as(outsider, 'select * from room_players')).toEqual([]);
    expect(await db.rpcError(outsider, 'join_room', ['ZZZZZ', 'Côme'])).toBe('Aucune partie ne correspond à ce code.');
    expect(await db.rpcError(outsider, 'join_room', [code, 'margot'])).toBe('Ce pseudo est déjà pris dans ce salon.');
    expect(await db.rpcError(outsider, 'join_room', [code, ''])).toBe('Le pseudo doit faire entre 1 et 16 caractères.');
    expect(await db.rpcError(null, 'create_room', ['Anonyme'])).toMatch(/permission denied/);
  });

  it('seul l’hôte règle et lance ; le nombre de joueurs doit correspondre', async () => {
    const [host, guest] = [await db.newUser(), await db.newUser()];
    const { room_id, code } = await db.rpc<{ room_id: string; code: string }>(host, 'create_room', ['Aubin']);
    await db.rpc(guest, 'join_room', [code, 'Margot']);
    expect(await db.rpcError(guest, 'update_settings', [room_id, JSON.stringify(settings(6))])).toBe('Seul l’hôte peut modifier les réglages.');
    expect(await db.rpcError(host, 'update_settings', [room_id, '{"roles": 3}'])).toBe('Réglages illisibles.');
    expect(await db.rpcError(host, 'update_settings', [room_id, JSON.stringify(settings(6, { nightSeconds: 5 }))])).toBe('Durées des chronos invalides.');
    await db.rpc(host, 'update_settings', [room_id, JSON.stringify(settings(6))]);
    expect(await db.rpcError(guest, 'start_game', [room_id])).toBe('Seul l’hôte peut lancer la partie.');
    expect(await db.rpcError(host, 'start_game', [room_id])).toBe('Il faut 6 joueurs dans le salon (actuellement 2).');
  });

  it('l’hôte qui part transmet son rôle ; le dernier qui part ferme le salon', async () => {
    const [host, guest] = [await db.newUser(), await db.newUser()];
    const { room_id, code } = await db.rpc<{ room_id: string; code: string }>(host, 'create_room', ['Aubin']);
    await db.rpc(guest, 'join_room', [code, 'Margot']);
    await db.rpc(host, 'leave_room', [room_id]);
    expect((await db.admin('select host_id from rooms where id = $1', [room_id]))[0].host_id).toBe(guest);
    await db.rpc(guest, 'leave_room', [room_id]);
    expect(await db.admin('select * from rooms where id = $1', [room_id])).toEqual([]);
  });

  it('réglages : mêmes contrôles que le moteur TypeScript', async () => {
    const u = await db.newUser();
    const problems = (s: unknown) => db.rpc<string[]>(u, 'settings_problems', [JSON.stringify(s)]);
    for (let n = 6; n <= 16; n++) expect(await problems(settings(n))).toEqual([]);
    const base = settings(8);
    expect(await problems({ ...base, playerCount: 5 })).toContain('Il faut entre 6 et 16 joueurs.');
    expect(await problems({ ...base, roles: { ...base.roles, loup: 4, villageois: 0 } })).toContain('Trop de loups : ils doivent être moins de la moitié.');
    expect(await problems({ ...base, roles: { ...base.roles, voyante: 2, villageois: 1 } })).toContain('Le rôle Voyante ne peut être présent qu’une fois.');
  });
});

describe('secret des rôles (RLS)', () => {
  let db: Db;
  let g: Awaited<ReturnType<typeof setupGame>>;
  beforeAll(async () => {
    db = await Db.create();
    g = await setupGame(db, 8);
  }, 60000);

  it('chaque joueur ne voit que son rôle ; les loups voient la meute', async () => {
    const wolves = g.users.filter((u) => g.roles[u] === 'loup');
    expect(wolves).toHaveLength(2);
    for (const u of g.users) {
      const seen = await db.as(u, 'select player_id, role from player_roles order by player_id');
      if (g.roles[u] === 'loup') expect(seen.map((r) => r.player_id).sort()).toEqual([...wolves].sort());
      else expect(seen).toEqual([{ player_id: u, role: g.roles[u] }]);
    }
  });

  it('les tables secrètes et les fonctions internes sont inaccessibles', async () => {
    const u = g.users[1];
    await expect(db.as(u, 'select * from game_secrets')).rejects.toThrow(/permission denied/);
    await expect(db.as(u, `select public._kill($1, $2, 'loups')`, [g.game, g.users[2]])).rejects.toThrow(/permission denied/);
    await expect(db.as(u, `select public._end_phase($1)`, [g.game])).rejects.toThrow(/permission denied/);
    expect(await db.as(u, 'select * from night_actions')).toEqual([]);
  });

  it('aucune écriture directe n’est possible depuis le navigateur', async () => {
    const u = g.users[1];
    await expect(db.as(u, `insert into votes (game_id, day, round, voter_id, target_id) values ($1, 1, 1, $2, $2)`, [g.game, u])).rejects.toThrow(/permission denied/);
    await expect(db.as(u, `update games set winner = 'village'`)).rejects.toThrow(/permission denied/);
    await expect(db.as(u, `update game_players set alive = false`)).rejects.toThrow(/permission denied/);
    await expect(db.as(u, `insert into messages (game_id, author, channel, text) values ($1, 'x', 'systeme', 'triche')`, [g.game])).rejects.toThrow(/permission denied/);
    await expect(db.as(u, `delete from player_roles`)).rejects.toThrow(/permission denied/);
    await expect(db.as(u, `update rooms set host_id = $1`, [u])).rejects.toThrow(/permission denied/);
  });

  it('un étranger ne voit rien de la partie', async () => {
    const outsider = await db.newUser();
    for (const t of ['games', 'game_players', 'player_roles', 'votes', 'messages', 'private_notes', 'game_events']) {
      expect(await db.as(outsider, `select * from ${t}`), t).toEqual([]);
    }
    expect(await db.rpcError(outsider, 'my_view', [g.game])).toBe('Vous ne participez pas à cette partie.');
    expect(await db.rpcError(outsider, 'advance_game', [g.game])).toBe('Vous ne participez pas à cette partie.');
  });

  it('le chat de la meute n’est lisible que par les loups', async () => {
    await db.expire(g.game);
    await db.rpc(g.users[0], 'advance_game', [g.game]); // fin de l'attribution : la nuit commence
    const wolf = g.users.find((u) => g.roles[u] === 'loup')!;
    const villager = g.users.find((u) => g.roles[u] === 'villageois')!;
    expect(await db.rpcError(villager, 'send_message', [g.game, 'loups', 'Je suis un loup ?'])).toBe('Seule la meute parle la nuit.');
    expect(await db.rpcError(villager, 'send_message', [g.game, 'public', 'Bonjour'])).toBe('Le village dort : silence.');
    await db.rpc(wolf, 'send_message', [g.game, 'loups', 'On mange qui ?']);
    expect((await db.as(wolf, `select text from messages where channel = 'loups'`)).map((m) => m.text)).toEqual(['On mange qui ?']);
    expect(await db.as(villager, `select text from messages where channel = 'loups'`)).toEqual([]);
  });
});

describe('actions et informations secrètes', () => {
  it('voyante, loups, sorcière : chacun agit à son tour et apprend ce qu’il doit', async () => {
    const db = await Db.create();
    const g = await setupGame(db, 8);
    const who = (role: string) => g.users.find((u) => g.roles[u] === role)!;
    const villagers = g.users.filter((u) => g.roles[u] === 'villageois');
    const wolves = g.users.filter((u) => g.roles[u] === 'loup');
    const [seer, witch, cupid, hunter] = ['voyante', 'sorciere', 'cupidon', 'chasseur'].map(who);

    expect(await db.rpcError(seer, 'act_voyante', [g.game, wolves[0]])).toBe('Ce n’est pas à vous d’agir maintenant.');
    await db.expire(g.game);
    await db.rpc(seer, 'advance_game', [g.game]);
    expect(await phaseOf(db, g.game)).toBe('cupidon');
    expect(await db.rpcError(cupid, 'act_cupidon', [g.game, villagers[0], villagers[0]])).toBe('Choisissez deux joueurs différents.');
    await db.rpc(cupid, 'act_cupidon', [g.game, villagers[0], villagers[1]]);
    // Cupidon a joué : la phase se termine tout de suite
    expect(await phaseOf(db, g.game)).toBe('voyante');
    const partnerView = await db.rpc<{ partner: string }>(villagers[0], 'my_view', [g.game]);
    expect(partnerView.partner).toBe(villagers[1]);
    expect((await db.as(villagers[0], 'select text from private_notes')).map((n) => n.text)).toEqual([expect.stringContaining(g.name[villagers[1]])]);
    expect(await db.as(hunter, 'select text from private_notes')).toEqual([]);

    expect(await db.rpc(seer, 'act_voyante', [g.game, wolves[0]])).toBe('loup');
    expect((await db.rpc<{ seer_results: Record<string, string> }>(seer, 'my_view', [g.game])).seer_results).toEqual({ [wolves[0]]: 'loup' });
    expect(await phaseOf(db, g.game)).toBe('loups');

    expect(await db.rpcError(wolves[0], 'act_loups', [g.game, wolves[1]])).toBe('Un loup ne peut pas dévorer un autre loup.');
    await db.rpc(wolves[0], 'act_loups', [g.game, hunter]);
    expect(await phaseOf(db, g.game)).toBe('loups'); // l'autre loup n'a pas encore choisi
    // La meute voit le choix de ses membres, pas les autres
    expect((await db.as(wolves[1], `select target from night_actions where phase = 'loups'`)).map((r) => r.target)).toEqual([hunter]);
    expect(await db.as(seer, `select * from night_actions where phase = 'loups'`)).toEqual([]);
    await db.rpc(wolves[1], 'act_loups', [g.game, hunter]);
    expect(await phaseOf(db, g.game)).toBe('sorciere');

    const witchView = await db.rpc<{ wolf_target: string; witch: object }>(witch, 'my_view', [g.game]);
    expect(witchView).toMatchObject({ wolf_target: hunter, witch: { life: true, death: true } });
    expect((await db.rpc<{ wolf_target: string | null }>(seer, 'my_view', [g.game])).wolf_target).toBeNull();
    expect(await db.rpcError(witch, 'act_sorciere', [g.game, false, witch])).toBe('Vous ne pouvez pas vous empoisonner.');
    await db.rpc(witch, 'act_sorciere', [g.game, true, wolves[0]]);
    expect(await phaseOf(db, g.game)).toBe('aube');

    const alive = Object.fromEntries((await db.as(seer, 'select player_id, alive from game_players')).map((r) => [r.player_id, r.alive]));
    expect(alive[hunter]).toBe(true); // sauvé par la sorcière
    expect(alive[wolves[0]]).toBe(false); // empoisonné
    // Le rôle d'un mort devient visible de tous
    expect(await db.as(seer, 'select role from player_roles where player_id = $1', [wolves[0]])).toEqual([{ role: 'loup' }]);
    const ann = (await db.as(seer, 'select announcement from games'))[0].announcement;
    expect(ann).toBe(`Le village se réveille. ${g.name[wolves[0]]} a succombé à un poison mystérieux. Son rôle : Loup-garou.`);
  }, 60000);
});

// ------------------------------------------------------------------ parties complètes

function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('parties complètes jouées par des joueurs simulés', () => {
  it('24 parties de 6 à 16 joueurs, tous réglages : toujours valides', async () => {
    const db = await Db.create();
    for (let seed = 1; seed <= 24; seed++) {
      const rng = makeRng(seed);
      const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
      const count = 6 + (seed % 11);
      const tieRule = (['personne', 'hasard', 'revote'] as const)[seed % 3];
      const g = await setupGame(db, count, { tieRule, allowAbstain: seed % 2 === 0, discussionMode: seed % 4 === 0 ? 'piece' : 'chat' });
      const ctx = `partie ${seed}`;
      let steps = 0;
      let refused = 0;

      while ((await phaseOf(db, g.game)) !== 'fin' && steps++ < 400) {
        const game = (await db.admin('select * from games where id = $1', [g.game]))[0];
        const alive = (await db.admin<{ player_id: string }>('select player_id from game_players where game_id = $1 and alive', [g.game])).map((r) => r.player_id);
        const pending = (await db.admin<{ p: string }>('select p from public._pending($1) p', [g.game])).map((r) => r.p).filter(Boolean);
        const others = (u: string) => alive.filter((x) => x !== u);

        for (const u of pending) {
          if (rng() < 0.15) continue; // certains joueurs laissent filer le chrono
          let err: string | null = null;
          if (rng() < 0.1) {
            // Tentative de triche : agir à la place d'un autre rôle
            err = await db.rpcError(u, 'act_voyante', [g.game, pick(alive)]);
            if (g.roles[u] !== 'voyante' || game.phase !== 'voyante') expect(err, ctx).not.toBeNull();
            refused++;
            continue;
          }
          switch (game.phase) {
            case 'cupidon':
              err = await db.rpcError(u, 'act_cupidon', [g.game, pick(alive), pick(alive)]);
              break;
            case 'voyante':
              err = await db.rpcError(u, 'act_voyante', [g.game, pick(others(u))]);
              break;
            case 'loups':
              err = await db.rpcError(u, 'act_loups', [g.game, pick(alive.filter((x) => g.roles[x] !== 'loup'))]);
              break;
            case 'sorciere':
              err = await db.rpcError(u, 'act_sorciere', [g.game, rng() < 0.5, rng() < 0.3 ? pick(others(u)) : null]);
              break;
            case 'chasseur':
              err = await db.rpcError(u, 'act_chasseur', [g.game, rng() < 0.8 ? pick(others(u)) : null]);
              break;
            case 'vote': {
              const cands = game.runoff ?? alive;
              err = await db.rpcError(u, 'cast_vote', [g.game, rng() < 0.1 ? null : pick(cands.filter((x: string) => x !== u))]);
              break;
            }
          }
          if (err) refused++;
        }
        if (game.phase === 'debat' && game.settings.discussionMode === 'chat') {
          await db.rpc(pick(alive), 'send_message', [g.game, 'public', 'Je soupçonne quelqu’un…']);
        }
        if ((await phaseOf(db, g.game)) === game.phase && (await db.admin('select phase_ends_at from games where id=$1', [g.game]))[0].phase_ends_at.getTime() === new Date(game.phase_ends_at).getTime()) {
          await db.expire(g.game);
          expect(await db.rpc(pick(g.users), 'advance_game', [g.game]), ctx).toBe(true);
        }
      }

      const game = (await db.admin('select * from games where id = $1', [g.game]))[0];
      expect(game.phase, ctx).toBe('fin');
      expect(steps, ctx).toBeLessThan(400);

      // Historique : uniquement des transitions de la table du moteur TypeScript, sans trou
      const events = await db.admin<{ from_phase: Phase; to_phase: Phase }>('select from_phase, to_phase from game_events where game_id = $1 order by id', [g.game]);
      expect(events[0], ctx).toMatchObject({ from_phase: 'lobby', to_phase: 'attribution' });
      events.forEach((e, i) => {
        expect(TRANSITIONS[e.from_phase], `${ctx} : ${e.from_phase} → ${e.to_phase}`).toContain(e.to_phase);
        if (i > 0) expect(e.from_phase, ctx).toBe(events[i - 1].to_phase);
      });

      // Vainqueur cohérent avec les survivants
      const survivors = await db.admin<{ player_id: string; role: string }>(
        'select gp.player_id, pr.role from game_players gp join player_roles pr using (game_id, player_id) where gp.game_id = $1 and gp.alive',
        [g.game],
      );
      const wolves = survivors.filter((s) => s.role === 'loup').length;
      const secrets = (await db.admin('select * from game_secrets where game_id = $1', [g.game]))[0];
      if (game.winner === 'village') expect(wolves, ctx).toBe(0);
      if (game.winner === 'loups') expect(wolves * 2, ctx).toBeGreaterThanOrEqual(survivors.length);
      if (game.winner === 'amoureux') expect(survivors.map((s) => s.player_id).sort(), ctx).toEqual([...secrets.lovers].sort());
      if (secrets.lovers) {
        const [a, b] = secrets.lovers.map((id: string) => survivors.some((s) => s.player_id === id));
        expect(a, ctx).toBe(b);
      }
      expect((await db.admin('select status from rooms where id = $1', [g.room_id]))[0].status, ctx).toBe('terminee');

      // Fin de partie : tout le monde voit tous les rôles
      expect(await db.as(g.users[1], 'select * from player_roles where game_id = $1', [g.game]), ctx).toHaveLength(count);
      // Mode « même pièce » : aucun message de joueur
      if (game.settings.discussionMode === 'piece') {
        expect(await db.admin(`select * from messages where game_id = $1 and channel <> 'systeme'`, [g.game]), ctx).toEqual([]);
      }
      expect(refused, ctx).toBeGreaterThanOrEqual(0);
    }
  }, 600000);
});

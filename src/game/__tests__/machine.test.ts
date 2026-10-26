import { describe, expect, it } from 'vitest';
import { applyEvent, canEnd, checkWinner, createGame, settingsProblems, TRANSITIONS } from '../engine';
import { makeRng } from '../rng';
import { TRANSIENT_PHASES, type GameState, type Phase } from '../types';
import { NAMES, settingsFor } from './outils';

const ALL_PHASES = Object.keys(TRANSITIONS) as Phase[];

describe('table des transitions', () => {
  it('chaque phase est atteignable depuis le lobby', () => {
    const seen = new Set<Phase>(['lobby']);
    const queue: Phase[] = ['lobby'];
    while (queue.length) {
      for (const next of TRANSITIONS[queue.shift()!]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect([...seen].sort()).toEqual([...ALL_PHASES].sort());
  });

  it('seule la fin est terminale', () => {
    for (const phase of ALL_PHASES) {
      if (phase === 'fin') expect(TRANSITIONS.fin).toEqual([]);
      else expect(TRANSITIONS[phase].length, phase).toBeGreaterThan(0);
    }
  });

  it('la fin est atteignable depuis chaque phase', () => {
    for (const from of ALL_PHASES) {
      const seen = new Set<Phase>([from]);
      const queue = [from];
      while (queue.length) for (const n of TRANSITIONS[queue.shift()!]) if (!seen.has(n)) (seen.add(n), queue.push(n));
      expect(seen.has('fin'), from).toBe(true);
    }
  });
});

describe('réglages', () => {
  it('acceptent une configuration correcte', () => {
    for (let n = 6; n <= 16; n++) expect(settingsProblems(settingsFor(n))).toEqual([]);
  });

  it('refusent les configurations impossibles', () => {
    const base = settingsFor(8);
    expect(settingsProblems({ ...base, playerCount: 5 })).toContain('Il faut entre 6 et 16 joueurs.');
    expect(settingsProblems({ ...base, roles: { ...base.roles, villageois: 3 } })).toContain('Il y a 9 rôle(s) pour 8 joueurs.');
    expect(settingsProblems({ ...base, roles: { ...base.roles, loup: 0, villageois: 4 } })).toContain('Il faut au moins un loup-garou.');
    expect(settingsProblems({ ...base, roles: { ...base.roles, loup: 4, villageois: 0 } })).toContain(
      'Trop de loups : ils doivent être moins de la moitié.',
    );
    expect(settingsProblems({ ...base, roles: { ...base.roles, voyante: 2, villageois: 1 } })).toContain(
      'Le rôle Voyante ne peut être présent qu’une fois.',
    );
    expect(() => createGame({ settings: { ...base, playerCount: 5 }, humans: [], botNames: NAMES, seed: 1, now: 0 })).toThrow();
  });

  it('distribuent exactement les rôles demandés', () => {
    const settings = settingsFor(12);
    const s = createGame({ settings, humans: ['Aubin'], botNames: NAMES.slice(1), seed: 7, now: 0 });
    const count: Record<string, number> = {};
    for (const p of s.players) count[p.role] = (count[p.role] ?? 0) + 1;
    expect(count).toEqual(Object.fromEntries(Object.entries(settings.roles).filter(([, n]) => n > 0)));
    expect(s.players.filter((p) => p.isHuman).map((p) => p.name)).toEqual(['Aubin']);
    expect(s.phase).toBe('attribution');
    expect(s.hostId).toBe('p0');
  });
});

/** Joue une partie entière : les robots jouent, les humains tentent des actions au hasard. */
function playRandomGame(seed: number, humans: number): { s: GameState; steps: number; refusals: number } {
  const rng = makeRng(seed * 7919);
  const count = 6 + (seed % 11);
  const tieRules = ['personne', 'hasard', 'revote'] as const;
  const settings = settingsFor(count, {
    tieRule: tieRules[seed % 3],
    allowAbstain: seed % 2 === 0,
    discussionMode: seed % 4 === 0 ? 'piece' : 'chat',
  });
  let s = createGame({ settings, humans: NAMES.slice(0, humans), botNames: NAMES.slice(humans), seed, now: 0 });
  let now = 0;
  s = applyEvent(s, { type: 'demarrer', now });
  let steps = 0;
  let refusals = 0;
  const ids = s.players.map((p) => p.id);
  const randomId = () => ids[Math.floor(rng() * ids.length)];

  while (s.phase !== 'fin' && steps++ < 3000) {
    expect(TRANSIENT_PHASES).not.toContain(s.phase);
    // Chaque humain tente une action plausible (parfois invalide).
    for (const p of s.players.filter((x) => x.isHuman)) {
      if (rng() < 0.3) continue;
      const kinds = ['cupidon', 'voyante', 'loups', 'sorciere', 'chasseur', 'vote', 'chat', 'passer'] as const;
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const action =
        kind === 'cupidon'
          ? { type: kind, targets: [randomId(), randomId()] as [string, string] }
          : kind === 'sorciere'
            ? { type: kind, save: rng() < 0.5, kill: rng() < 0.5 ? randomId() : null }
            : kind === 'vote'
              ? { type: kind, target: rng() < 0.15 ? ('abstention' as const) : randomId() }
              : kind === 'chat'
                ? { type: kind, channel: rng() < 0.5 ? ('public' as const) : ('loups' as const), text: `Je soupçonne ${NAMES[Math.floor(rng() * 16)]}` }
                : kind === 'passer'
                  ? { type: kind }
                  : { type: kind, target: randomId() };
      now += 100;
      const next = applyEvent(s, { type: 'action', playerId: p.id, action: action as never, now });
      if (next === s) refusals++;
      s = next;
    }
    now = Math.max(now + 250, canEnd(s, now) ? now : s.phaseEndsAt);
    s = applyEvent(s, { type: 'tic', now });
  }
  return { s, steps, refusals };
}

describe('parties complètes', () => {
  it('600 parties de robots et 300 parties avec 1 à 4 humains : toujours valides', () => {
    for (let seed = 1; seed <= 900; seed++) {
      const humans = seed <= 600 ? 0 : 1 + (seed % 4);
      const { s, steps } = playRandomGame(seed, humans);
      const ctx = `graine ${seed}`;

      expect(s.phase, ctx).toBe('fin');
      expect(steps, ctx).toBeLessThan(3000);
      expect(s.winner, ctx).toBe(checkWinner(s));

      // Historique : chaînage continu et uniquement des transitions autorisées
      s.history.forEach((t, i) => {
        expect(TRANSITIONS[t.from], `${ctx} : ${t.from} → ${t.to}`).toContain(t.to);
        if (i > 0) expect(t.from, ctx).toBe(s.history[i - 1].to);
      });
      expect(s.history[0]).toMatchObject({ from: 'lobby', to: 'attribution' });

      // Cupidon n'agit qu'une fois, la première nuit
      const cupid = s.history.filter((t) => t.to === 'cupidon');
      expect(cupid.length, ctx).toBeLessThanOrEqual(1);
      cupid.forEach((t) => expect(t.day).toBe(1));

      // Personne ne meurt deux fois ; les morts sont bien morts
      expect(new Set(s.deaths.map((d) => d.id)).size, ctx).toBe(s.deaths.length);
      for (const d of s.deaths) expect(s.players.find((p) => p.id === d.id)!.alive, ctx).toBe(false);

      // Les amoureux meurent ensemble
      if (s.lovers) {
        const [a, b] = s.lovers.map((id) => s.players.find((p) => p.id === id)!);
        expect(a.alive, ctx).toBe(b.alive);
      }

      // Une seule potion de mort au plus ; un seul tir de chasseur au plus
      expect(s.deaths.filter((d) => d.cause === 'poison').length, ctx).toBeLessThanOrEqual(1);
      expect(s.deaths.filter((d) => d.cause === 'chasseur').length, ctx).toBeLessThanOrEqual(1);

      // Aucun message de chat en mode « même pièce », hors annonces du meneur
      if (s.settings.discussionMode === 'piece') {
        expect(s.messages.every((m) => m.channel === 'systeme'), ctx).toBe(true);
      }
      // L'état reste sérialisable en JSON
      expect(JSON.parse(JSON.stringify(s)), ctx).toEqual(s);
    }
  }, 120000);

  it('est reproductible : même graine et mêmes événements ⇒ même partie', () => {
    const a = playRandomGame(123, 2);
    const b = playRandomGame(123, 2);
    expect(a.s).toEqual(b.s);
    const c = playRandomGame(124, 2);
    expect(c.s.players.map((p) => p.role)).not.toEqual(a.s.players.map((p) => p.role));
  });
});

import { describe, expect, it } from 'vitest';
import { act, canEnd, checkWinner, createGame, endPhase, startGame } from './engine';
import { makeRng } from './rng';
import type { GameSettings, RoleId } from '../lib/types';
import type { GameState } from './types';

const NAMES = ['Margot', 'Basile', 'Ondine', 'Gaspard', 'Léonie', 'Firmin', 'Adèle', 'Côme', 'Suzon', 'Anatole', 'Philomène', 'Hector', 'Rosalie', 'Augustin', 'Mahaut', 'Lucien'];

function settingsFor(count: number, extra: Partial<GameSettings> = {}): GameSettings {
  const wolves = count >= 12 ? 3 : 2;
  const specials = { voyante: 1, sorciere: 1, chasseur: 1, cupidon: 1 };
  return {
    playerCount: count,
    roles: { loup: wolves, villageois: count - wolves - 4, ...specials },
    nightSeconds: 30,
    daySeconds: 60,
    voteSeconds: 30,
    allowAbstain: true,
    tieRule: 'personne',
    discussionMode: 'chat',
    ...extra,
  };
}

/** Fait avancer une partie jusqu'à la fin, en sautant les chronos. */
function runToEnd(s: GameState, rng: () => number, maxSteps = 400) {
  let now = 0;
  let steps = 0;
  s = startGame(s, { rng, now });
  while (s.phase !== 'fin' && steps++ < maxSteps) {
    now = Math.max(s.phaseEndsAt, now) + 1;
    expect(canEnd(s, now)).toBe(true);
    s = endPhase(s, { rng, now });
  }
  return { s, steps };
}

describe('partie entièrement jouée par des robots', () => {
  it('se termine toujours, avec un vainqueur cohérent (600 parties)', () => {
    const tieRules = ['personne', 'hasard', 'revote'] as const;
    for (let seed = 1; seed <= 600; seed++) {
      const rng = makeRng(seed);
      const count = 6 + (seed % 11);
      const settings = settingsFor(count, { tieRule: tieRules[seed % 3], allowAbstain: seed % 2 === 0 });
      const game = createGame({ settings, humanName: null, botNames: NAMES, ctx: { rng, now: 0 } });
      const { s, steps } = runToEnd(game, rng);

      expect(s.phase, `seed ${seed}`).toBe('fin');
      expect(steps).toBeLessThan(400);
      expect(s.winner).toBe(checkWinner(s));
      // Personne ne meurt deux fois
      expect(new Set(s.deaths.map((d) => d.id)).size).toBe(s.deaths.length);
      // Les amoureux meurent ensemble
      if (s.lovers) {
        const [a, b] = s.lovers.map((id) => s.players.find((p) => p.id === id)!);
        expect(a.alive).toBe(b.alive);
      }
      // Chaque potion n'a servi qu'une fois au plus
      expect(s.deaths.filter((d) => d.cause === 'poison').length).toBeLessThanOrEqual(1);
    }
  }, 60000);
});

describe('règles', () => {
  function fixed(roles: RoleId[], extra: Partial<GameSettings> = {}) {
    const rng = makeRng(42);
    const s = createGame({
      settings: settingsFor(roles.length, extra),
      humanName: 'Vous',
      botNames: NAMES,
      ctx: { rng, now: 0 },
    });
    roles.forEach((r, i) => (s.players[i].role = r));
    return { s, rng };
  }

  it('les loups gagnent dès qu’ils sont aussi nombreux que les autres', () => {
    const { s } = fixed(['loup', 'villageois', 'villageois', 'loup', 'villageois', 'villageois']);
    s.players[1].alive = false;
    s.players[2].alive = false;
    expect(checkWinner(s)).toBe('loups');
  });

  it('le village gagne quand le dernier loup meurt', () => {
    const { s } = fixed(['villageois', 'loup', 'villageois', 'villageois', 'villageois', 'villageois']);
    s.players[1].alive = false;
    expect(checkWinner(s)).toBe('village');
  });

  it('un couple mixte gagne s’il reste seul', () => {
    const { s } = fixed(['villageois', 'loup', 'villageois', 'villageois', 'villageois', 'villageois']);
    s.lovers = ['p0', 'p1'];
    for (const p of s.players.slice(2)) p.alive = false;
    expect(checkWinner(s)).toBe('amoureux');
  });

  it('la voyante humaine découvre le rôle choisi', () => {
    const { s, rng } = fixed(['voyante', 'loup', 'villageois', 'villageois', 'loup', 'villageois']);
    let g = startGame(s, { rng, now: 0 });
    expect(g.phase).toBe('voyante');
    expect(g.waitingHuman).toBe(true);
    g = act(g, { type: 'voyante', target: 'p1' }, { rng, now: 10 });
    expect(g.seerResults.p1).toBe('loup');
    expect(canEnd(g, 10)).toBe(true);
    // Une seconde vision la même nuit est refusée
    const again = act(g, { type: 'voyante', target: 'p2' }, { rng, now: 11 });
    expect(again).toBe(g);
  });

  it('un loup ne peut pas désigner un autre loup, et la potion de vie sauve la victime', () => {
    const { s, rng } = fixed(['loup', 'loup', 'sorciere', 'villageois', 'villageois', 'villageois', 'villageois']);
    let g = startGame(s, { rng, now: 0 });
    expect(g.phase).toBe('loups');
    expect(act(g, { type: 'loups', target: 'p1' }, { rng, now: 1 })).toBe(g);
    g = act(g, { type: 'loups', target: 'p3' }, { rng, now: 1 });
    expect(g.wolfTarget).toBe('p3');
    g = endPhase(g, { rng, now: 2 });
    expect(g.phase).toBe('sorciere');
    g.witch.saveTonight = true; // la sorcière (robot) sauve forcément pour ce test
    g = endPhase(g, { rng, now: 3 });
    expect(g.phase).toBe('aube');
    expect(g.players[3].alive).toBe(true);
  });

  it('quand un amoureux meurt, l’autre meurt de chagrin et le chasseur tire', () => {
    const { s, rng } = fixed(['villageois', 'loup', 'chasseur', 'villageois', 'villageois', 'loup', 'villageois', 'villageois']);
    s.lovers = ['p0', 'p2'];
    s.phase = 'debat';
    let g = endPhase(s, { rng, now: 0 }); // passage au vote
    for (const p of g.players.filter((p) => !p.isHuman)) g.votes[p.id] = { target: 'p0', at: 0 };
    g = act(g, { type: 'vote', target: 'p3' }, { rng, now: 1 });
    g = endPhase(g, { rng, now: 20000 }); // résultat du vote
    expect(g.players[0].alive).toBe(false);
    expect(g.players[2].alive).toBe(false);
    expect(g.deaths.find((d) => d.id === 'p2')?.cause).toBe('chagrin');
    g = endPhase(g, { rng, now: 30000 }); // fin du verdict → tir du chasseur
    expect(g.phase).toBe('chasseur');
    const before = g.players.filter((p) => p.alive).length;
    g = endPhase(g, { rng, now: 40000 });
    expect(g.players.filter((p) => p.alive).length).toBe(before - 1);
  });

  it('égalité avec règle « second vote » : on revote entre les ex æquo', () => {
    const { s, rng } = fixed(['villageois', 'loup', 'villageois', 'villageois', 'villageois', 'loup'], { tieRule: 'revote' });
    s.phase = 'debat';
    let g = endPhase(s, { rng, now: 0 });
    g.votes = { p1: { target: 'p2', at: 0 }, p2: { target: 'p1', at: 0 }, p3: { target: 'p2', at: 0 }, p4: { target: 'p1', at: 0 }, p5: { target: 'abstention', at: 0 } };
    g = act(g, { type: 'vote', target: 'abstention' }, { rng, now: 1 });
    g = endPhase(g, { rng, now: 50000 });
    expect(g.phase).toBe('vote');
    expect(g.runoff?.sort()).toEqual(['p1', 'p2']);
    expect(act(g, { type: 'vote', target: 'p3' }, { rng, now: 50001 })).toBe(g);
  });

  it('Cupidon humain unit deux joueurs ; ils apprennent leur lien', () => {
    const { s, rng } = fixed(['cupidon', 'loup', 'villageois', 'villageois', 'loup', 'villageois']);
    let g = startGame(s, { rng, now: 0 });
    expect(g.phase).toBe('cupidon');
    expect(act(g, { type: 'cupidon', targets: ['p2', 'p2'] }, { rng, now: 1 })).toBe(g);
    g = act(g, { type: 'cupidon', targets: ['p0', 'p3'] }, { rng, now: 1 });
    g = endPhase(g, { rng, now: 2 });
    expect(g.lovers).toEqual(['p0', 'p3']);
    expect(g.notes.at(-1)?.text).toContain(g.players[3].name);
  });

  it('Sorcière humaine : chaque potion ne sert qu’une fois', () => {
    const { s, rng } = fixed(['sorciere', 'loup', 'villageois', 'villageois', 'loup', 'villageois', 'villageois']);
    let g = startGame(s, { rng, now: 0 });
    expect(g.phase).toBe('loups');
    g = endPhase(g, { rng, now: 1 });
    expect(g.phase).toBe('sorciere');
    const victim = g.wolfTarget!;
    expect(act(g, { type: 'sorciere', save: false, kill: 'p0' }, { rng, now: 2 })).toBe(g); // pas soi-même
    g = act(g, { type: 'sorciere', save: true, kill: 'p4' }, { rng, now: 2 });
    g = endPhase(g, { rng, now: 3 });
    expect(g.players.find((p) => p.id === victim)!.alive).toBe(true);
    expect(g.players[4].alive).toBe(false);
    expect(g.witch).toMatchObject({ life: false, death: false });
  });

  it('Chasseur humain tué la nuit : il tire avant le débat', () => {
    const { s, rng } = fixed(['chasseur', 'loup', 'villageois', 'villageois', 'loup', 'villageois', 'villageois']);
    let g = startGame(s, { rng, now: 0 });
    g.wolfTarget = 'p0';
    g.wolfSuggestions = {};
    g = endPhase(g, { rng, now: 1 }); // fin des loups → résolution de la nuit
    expect(g.phase).toBe('aube');
    expect(g.players[0].alive).toBe(false);
    g = endPhase(g, { rng, now: 20000 });
    expect(g.phase).toBe('chasseur');
    expect(g.waitingHuman).toBe(true);
    g = act(g, { type: 'chasseur', target: 'p1' }, { rng, now: 20001 });
    g = endPhase(g, { rng, now: 20002 });
    expect(g.players[1].alive).toBe(false);
    expect(g.phase).toBe('debat');
  });
});

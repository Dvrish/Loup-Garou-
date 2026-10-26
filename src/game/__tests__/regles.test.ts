import { describe, expect, it } from 'vitest';
import { applyEvent, BOT_PAUSE, canEnd, checkWinner, tally } from '../engine';
import type { GameState } from '../types';
import { act, advanceTo, makeGame, path, player, start, timeout } from './outils';

/** Place la partie au début d'un vote (en sautant la nuit). */
function atVote(s: GameState) {
  s.phase = 'debat';
  s.phaseEndsAt = 0;
  s.minEndsAt = 0;
  return timeout(s);
}

/** Remplace les votes des robots. */
function botVotes(s: GameState, votes: Record<string, string>) {
  s.votes = Object.fromEntries(Object.entries(votes).map(([v, t]) => [v, { target: t, at: 0 }]));
  return s;
}

describe('déroulement de la nuit', () => {
  it('Cupidon, Voyante, Loups puis Sorcière, et enfin l’aube', () => {
    let s = start(makeGame(['villageois', 'loup', 'voyante', 'sorciere', 'chasseur', 'cupidon', 'villageois', 'loup']));
    s = advanceTo(s, 'aube');
    expect(path(s)).toEqual(['attribution', 'cupidon', 'voyante', 'loups', 'sorciere', 'resolution-nuit', 'aube']);
  });

  it('saute les rôles absents, morts, ou la sorcière sans potion', () => {
    const g = makeGame(['villageois', 'loup', 'voyante', 'sorciere', 'villageois', 'loup']);
    g.players[2].alive = false;
    g.witch.life = false;
    g.witch.death = false;
    const s = advanceTo(start(g), 'aube');
    expect(path(s)).toEqual(['attribution', 'loups', 'resolution-nuit', 'aube']);
  });

  it('une étape jouée par un robot dure une courte pause ; celle d’un humain attend son action', () => {
    let s = start(makeGame(['villageois', 'loup', 'voyante', 'villageois', 'villageois', 'loup']), 1000);
    expect(s.phase).toBe('voyante');
    expect(s.pending).toEqual([]);
    expect(s.phaseEndsAt).toBe(1000 + BOT_PAUSE);

    s = start(makeGame(['voyante', 'loup', 'villageois', 'villageois', 'villageois', 'loup']), 1000);
    expect(s.pending).toEqual(['p0']);
    expect(s.phaseEndsAt).toBe(1000 + 30_000);
    expect(canEnd(s, 2000)).toBe(false);
    s = act(s, 'p0', { type: 'voyante', target: 'p1' }, 2000);
    expect(canEnd(s, 2000)).toBe(true);
  });

  it('l’attribution ne se termine qu’avec l’événement « démarrer »', () => {
    const g = makeGame(['villageois', 'loup', 'villageois', 'villageois', 'villageois', 'loup']);
    expect(applyEvent(g, { type: 'tic', now: 1e12 })).toBe(g);
    const started = start(g);
    expect(started.phase).toBe('loups');
    expect(start(started)).toBe(started); // on ne démarre pas deux fois
  });
});

describe('Cupidon et les amoureux', () => {
  it('Cupidon unit deux joueurs, qui apprennent leur lien en secret', () => {
    let s = start(makeGame(['cupidon', 'villageois', 'loup', 'villageois', 'villageois', 'loup'], { humans: 3 }));
    s = act(s, 'p0', { type: 'cupidon', targets: ['p1', 'p3'] });
    s = timeout(s);
    expect(s.lovers).toEqual(['p1', 'p3']);
    expect(s.notes.filter((n) => n.playerId === 'p1').map((n) => n.text)).toEqual([expect.stringContaining('Ondine')]);
    expect(s.notes.filter((n) => n.playerId === 'p0').map((n) => n.text)).toEqual(['Vous avez uni Margot et Ondine.']);
    expect(s.notes.some((n) => n.playerId === 'p2')).toBe(false);
  });

  it('sans choix avant la fin du chrono, deux amoureux sont tirés au sort', () => {
    const s = timeout(start(makeGame(['cupidon', 'villageois', 'loup', 'villageois', 'villageois', 'loup'])));
    expect(s.lovers).toHaveLength(2);
    expect(s.lovers![0]).not.toBe(s.lovers![1]);
  });

  it('quand un amoureux meurt, l’autre meurt de chagrin', () => {
    const g = makeGame(['villageois', 'loup', 'villageois', 'villageois', 'villageois', 'loup', 'villageois']);
    g.lovers = ['p0', 'p2'];
    let s = start(g);
    s.wolfVotes = { p1: 'p2', p5: 'p2' };
    s = advanceTo(s, 'aube');
    expect(s.deaths).toEqual([
      { id: 'p2', cause: 'loups', day: 1 },
      { id: 'p0', cause: 'chagrin', day: 1 },
    ]);
  });

  it('un couple loup + villageois gagne s’il reste seul', () => {
    const s = makeGame(['villageois', 'loup', 'villageois', 'villageois', 'villageois', 'villageois']);
    s.lovers = ['p0', 'p1'];
    for (const p of s.players.slice(2)) p.alive = false;
    expect(checkWinner(s)).toBe('amoureux');
  });
});

describe('Voyante', () => {
  it('découvre un rôle, visible d’elle seule', () => {
    let s = start(makeGame(['voyante', 'loup', 'villageois', 'villageois', 'villageois', 'loup'], { humans: 2 }));
    s = act(s, 'p0', { type: 'voyante', target: 'p1' });
    expect(s.seerResults).toEqual({ p1: 'loup' });
    expect(s.notes).toEqual([expect.objectContaining({ playerId: 'p0', text: 'Votre vision : Margot est Loup-garou.' })]);
    // Une seule vision par nuit
    expect(act(s, 'p0', { type: 'voyante', target: 'p2' })).toBe(s);
  });
});

describe('Loups-garous', () => {
  it('les loups-robots se rallient au choix du loup humain', () => {
    let s = start(makeGame(['loup', 'loup', 'villageois', 'villageois', 'villageois', 'villageois']));
    s = act(s, 'p0', { type: 'loups', target: 'p3' });
    expect(s.wolfVotes).toEqual({ p0: 'p3', p1: 'p3' });
    s = advanceTo(s, 'aube');
    expect(s.deaths).toEqual([{ id: 'p3', cause: 'loups', day: 1 }]);
  });

  it('avec plusieurs loups humains, la majorité l’emporte', () => {
    const roles = ['loup', 'loup', 'loup', 'villageois', 'villageois', 'villageois', 'villageois', 'villageois'] as const;
    let s = start(makeGame([...roles], { humans: 3 }));
    s = act(s, 'p0', { type: 'loups', target: 'p3' });
    s = act(s, 'p1', { type: 'loups', target: 'p3' });
    expect(canEnd(s, s.phaseEndsAt - 1)).toBe(false); // p2 n'a pas encore choisi
    s = act(s, 'p2', { type: 'loups', target: 'p4' });
    expect(canEnd(s, s.phaseEndsAt - 1)).toBe(true);
    s = advanceTo(s, 'aube');
    expect(s.deaths.map((d) => d.id)).toEqual(['p3']);
  });

  it('un loup humain seul qui ne choisit pas : personne ne meurt', () => {
    const s = advanceTo(start(makeGame(['loup', 'villageois', 'villageois', 'villageois', 'villageois', 'villageois'])), 'aube');
    expect(s.deaths).toEqual([]);
    expect(s.announcement).toContain('personne n’est mort');
  });

  it('les loups-robots choisissent toujours un non-loup', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = advanceTo(start(makeGame(['villageois', 'loup', 'loup', 'villageois', 'villageois', 'villageois', 'villageois'], { seed })), 'aube');
      expect(s.deaths).toHaveLength(1);
      expect(player(s, s.deaths[0].id).role).not.toBe('loup');
    }
  });
});

describe('Sorcière', () => {
  it('sauve la victime et empoisonne un autre joueur ; chaque potion ne sert qu’une fois', () => {
    let s = start(makeGame(['sorciere', 'loup', 'villageois', 'villageois', 'villageois', 'loup', 'villageois']));
    s.wolfVotes = { p1: 'p2', p5: 'p2' };
    s = advanceTo(s, 'sorciere');
    expect(s.wolfTarget).toBe('p2');
    s = act(s, 'p0', { type: 'sorciere', save: true, kill: 'p1' });
    s = advanceTo(s, 'aube');
    expect(player(s, 'p2').alive).toBe(true);
    expect(s.deaths).toEqual([{ id: 'p1', cause: 'poison', day: 1 }]);
    expect(s.witch).toMatchObject({ life: false, death: false });
  });

  it('ne fait rien si elle ne joue pas avant la fin du chrono', () => {
    let s = start(makeGame(['sorciere', 'loup', 'villageois', 'villageois', 'villageois', 'loup', 'villageois']));
    s.wolfVotes = { p1: 'p2', p5: 'p2' };
    s = advanceTo(s, 'aube');
    expect(s.deaths.map((d) => d.id)).toEqual(['p2']);
    expect(s.witch).toMatchObject({ life: true, death: true });
  });
});

describe('Chasseur', () => {
  it('tué la nuit, le chasseur humain tire avant le débat', () => {
    let s = start(makeGame(['chasseur', 'loup', 'loup', 'villageois', 'villageois', 'villageois', 'villageois']));
    s.wolfVotes = { p1: 'p0', p2: 'p0' };
    s = advanceTo(s, 'chasseur');
    expect(s.pending).toEqual(['p0']);
    s = act(s, 'p0', { type: 'chasseur', target: 'p1' });
    s = timeout(s);
    expect(s.deaths.at(-1)).toEqual({ id: 'p1', cause: 'chasseur', day: 1 });
    expect(s.phase).toBe('debat');
  });

  it('s’il ne tire pas à temps, il meurt sans tirer', () => {
    let s = start(makeGame(['chasseur', 'loup', 'loup', 'villageois', 'villageois', 'villageois', 'villageois']));
    s.wolfVotes = { p1: 'p0', p2: 'p0' };
    s = timeout(advanceTo(s, 'chasseur'));
    expect(s.deaths).toHaveLength(1);
    expect(s.messages.map((m) => m.text)).toContain('Aubin meurt sans tirer.');
  });

  it('éliminé par le vote, le chasseur-robot tire, puis la nuit tombe', () => {
    let s = atVote(makeGame(['villageois', 'chasseur', 'loup', 'loup', 'villageois', 'villageois', 'villageois']));
    s = botVotes(s, { p2: 'p1', p3: 'p1', p4: 'p1', p5: 'p1', p6: 'p0' });
    s = act(s, 'p0', { type: 'vote', target: 'p1' });
    s = timeout(s);
    expect(s.phase).toBe('verdict');
    s = timeout(s);
    expect(s.phase).toBe('chasseur');
    s = timeout(s);
    expect(s.deaths.map((d) => d.cause)).toEqual(['vote', 'chasseur']);
    expect(['voyante', 'loups', 'fin']).toContain(s.phase);
  });
});

describe('vote du village', () => {
  const roles = ['villageois', 'loup', 'villageois', 'villageois', 'villageois', 'loup', 'villageois'] as const;

  it('élimine le joueur le plus désigné ; abstentions et votes de morts ne comptent pas', () => {
    let s = atVote(makeGame([...roles]));
    expect(s.pending).toEqual(['p0']);
    s.players[6].alive = false;
    s = botVotes(s, { p1: 'p2', p2: 'p3', p3: 'p2', p4: 'abstention', p5: 'p3', p6: 'p3' });
    s = act(s, 'p0', { type: 'vote', target: 'p2' });
    expect(tally(s).count).toEqual({ p2: 3, p3: 2 });
    s = timeout(s);
    expect(s.eliminatedToday).toBe('p2');
    expect(s.announcement).toContain('Votes : Basile (3), Ondine (2).');
  });

  it('égalité, règle « personne » : personne n’est éliminé', () => {
    let s = atVote(makeGame([...roles]));
    s = botVotes(s, { p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p3' });
    s = timeout(s);
    expect(s.phase).toBe('verdict');
    expect(s.eliminatedToday).toBeNull();
    expect(s.announcement).toContain('personne n’est éliminé');
  });

  it('égalité, règle « hasard » : un des ex æquo est éliminé', () => {
    let s = atVote(makeGame([...roles], { settings: { tieRule: 'hasard' } }));
    s = botVotes(s, { p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p3' });
    s = timeout(s);
    expect(['p2', 'p3']).toContain(s.eliminatedToday);
  });

  it('égalité, règle « second vote » : on revote entre les ex æquo, une seule fois', () => {
    let s = atVote(makeGame([...roles], { settings: { tieRule: 'revote' } }));
    s = botVotes(s, { p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p3' });
    s = timeout(s);
    expect(s.phase).toBe('vote');
    expect(s.runoff).toEqual(['p2', 'p3']);
    expect(path(s).slice(-3)).toEqual(['vote', 'resolution-vote', 'vote']);
    // Pendant le second vote, seuls les ex æquo peuvent être désignés
    expect(act(s, 'p0', { type: 'vote', target: 'p4' })).toBe(s);
    s = botVotes(s, { p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p3' });
    s = timeout(s);
    expect(s.phase).toBe('verdict');
    expect(s.eliminatedToday).toBeNull();
  });

  it('le vote ne se termine pas avant que les votes des robots soient tous visibles', () => {
    const s = atVote(makeGame([...roles]));
    const lastBotVote = Math.max(...Object.values(s.votes).map((v) => v.at));
    const voted = act(s, 'p0', { type: 'vote', target: 'p1' }, s.history.at(-1)!.at + 10);
    expect(canEnd(voted, lastBotVote - 1)).toBe(false);
    expect(canEnd(voted, lastBotVote + 600)).toBe(true);
  });
});

describe('victoire', () => {
  const base = () => makeGame(['villageois', 'loup', 'villageois', 'loup', 'villageois', 'villageois']);

  it('le village gagne quand tous les loups sont morts', () => {
    const s = base();
    s.players[1].alive = false;
    s.players[3].alive = false;
    expect(checkWinner(s)).toBe('village');
  });

  it('les loups gagnent dès qu’ils sont aussi nombreux que les autres', () => {
    const s = base();
    s.players[0].alive = false;
    s.players[2].alive = false;
    expect(checkWinner(s)).toBe('loups');
  });

  it('personne ne gagne si tout le monde est mort, et la partie continue sinon', () => {
    const s = base();
    expect(checkWinner(s)).toBeNull();
    for (const p of s.players) p.alive = false;
    expect(checkWinner(s)).toBe('aucun');
  });

  it('la fin de partie est annoncée et plus rien ne bouge', () => {
    let s = atVote(base());
    s.players[3].alive = false;
    s = botVotes(s, { p2: 'p1', p4: 'p1', p5: 'p1' });
    s = timeout(timeout(s));
    expect(s.phase).toBe('fin');
    expect(s.winner).toBe('village');
    expect(path(s).slice(-2)).toEqual(['verification', 'fin']);
    expect(applyEvent(s, { type: 'tic', now: 1e12 })).toBe(s);
  });
});

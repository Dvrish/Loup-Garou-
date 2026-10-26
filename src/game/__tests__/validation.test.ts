// Chaque action interdite doit être refusée avec une raison claire, sans changer l'état.
// Ces mêmes contrôles seront refaits côté serveur à l'étape 4.
import { describe, expect, it } from 'vitest';
import { applyEvent, MAX_CHAT_LENGTH, validateAction } from '../engine';
import type { GameState, PlayerAction } from '../types';
import { act, advanceTo, makeGame, start, timeout } from './outils';

function refused(s: GameState, playerId: string, action: PlayerAction, reason: string) {
  expect(validateAction(s, playerId, action)).toBe(reason);
  expect(applyEvent(s, { type: 'action', playerId, action, now: 1 })).toBe(s);
}

describe('qui peut agir', () => {
  const s = start(makeGame(['voyante', 'loup', 'villageois', 'villageois', 'villageois', 'loup'], { humans: 2 }));

  it('refuse les joueurs inconnus et les robots', () => {
    refused(s, 'p99', { type: 'voyante', target: 'p1' }, 'Joueur inconnu.');
    refused(s, 'p2', { type: 'voyante', target: 'p1' }, 'Ce joueur est un robot.');
  });

  it('refuse une action hors de son tour ou de son rôle', () => {
    refused(s, 'p1', { type: 'loups', target: 'p2' }, 'Ce n’est pas à vous d’agir maintenant.'); // ce n'est pas encore la phase des loups
    refused(s, 'p1', { type: 'voyante', target: 'p2' }, 'Ce n’est pas à vous d’agir maintenant.'); // p1 n'est pas voyante
    refused(s, 'p0', { type: 'vote', target: 'p2' }, 'Ce n’est pas à vous d’agir maintenant.');
  });

  it('refuse tout une fois la partie terminée', () => {
    const over = { ...s, phase: 'fin' as const };
    refused(over, 'p0', { type: 'passer' }, 'La partie est terminée.');
  });
});

describe('actions de nuit', () => {
  it('Cupidon : deux joueurs différents et vivants', () => {
    const g = makeGame(['cupidon', 'loup', 'villageois', 'villageois', 'villageois', 'loup']);
    g.players[2].alive = false;
    const s = start(g);
    refused(s, 'p0', { type: 'cupidon', targets: ['p1', 'p1'] }, 'Choisissez deux joueurs différents.');
    refused(s, 'p0', { type: 'cupidon', targets: ['p1', 'p2'] }, 'Les amoureux doivent être vivants.');
    expect(validateAction(s, 'p0', { type: 'cupidon', targets: ['p0', 'p1'] })).toBeNull();
  });

  it('Voyante : pas soi-même, pas un mort', () => {
    const g = makeGame(['voyante', 'loup', 'villageois', 'villageois', 'villageois', 'loup']);
    g.players[2].alive = false;
    const s = start(g);
    refused(s, 'p0', { type: 'voyante', target: 'p0' }, 'Vous connaissez déjà votre rôle.');
    refused(s, 'p0', { type: 'voyante', target: 'p2' }, 'Ce joueur n’est pas en vie.');
  });

  it('Loups : pas un autre loup, pas un mort', () => {
    const g = makeGame(['loup', 'loup', 'villageois', 'villageois', 'villageois', 'villageois']);
    g.players[2].alive = false;
    const s = start(g);
    refused(s, 'p0', { type: 'loups', target: 'p1' }, 'Un loup ne peut pas dévorer un autre loup.');
    refused(s, 'p0', { type: 'loups', target: 'p2' }, 'Ce joueur n’est pas en vie.');
  });

  it('Sorcière : potions disponibles, cible valide', () => {
    let s = start(makeGame(['sorciere', 'loup', 'villageois', 'villageois', 'villageois', 'loup']));
    s.wolfVotes = {};
    s = advanceTo(s, 'sorciere');
    refused(s, 'p0', { type: 'sorciere', save: true, kill: null }, 'Personne n’est à sauver cette nuit.');
    refused(s, 'p0', { type: 'sorciere', save: false, kill: 'p0' }, 'Vous ne pouvez pas vous empoisonner.');
    const used = { ...s, wolfTarget: 'p2', witch: { life: false, death: false, saveTonight: false, killTonight: null } };
    refused(used, 'p0', { type: 'sorciere', save: true, kill: null }, 'La potion de vie est déjà utilisée.');
    refused(used, 'p0', { type: 'sorciere', save: false, kill: 'p2' }, 'La potion de mort est déjà utilisée.');
  });

  it('Chasseur : pas soi-même', () => {
    let s = start(makeGame(['chasseur', 'loup', 'loup', 'villageois', 'villageois', 'villageois', 'villageois']));
    s.wolfVotes = { p1: 'p0', p2: 'p0' };
    s = advanceTo(s, 'chasseur');
    refused(s, 'p0', { type: 'chasseur', target: 'p0' }, 'Cible invalide.');
    expect(validateAction(s, 'p0', { type: 'chasseur', target: null })).toBeNull();
  });
});

describe('vote', () => {
  function voting(allowAbstain: boolean) {
    const g = makeGame(['villageois', 'loup', 'villageois', 'villageois', 'villageois', 'loup'], { settings: { allowAbstain } });
    g.phase = 'debat';
    g.phaseEndsAt = 0;
    return timeout(g);
  }

  it('refuse le vote contre soi-même, contre un mort, et l’abstention interdite', () => {
    const s = voting(false);
    s.players[2].alive = false;
    refused(s, 'p0', { type: 'vote', target: 'p0' }, 'Vous ne pouvez pas voter contre vous-même.');
    refused(s, 'p0', { type: 'vote', target: 'p2' }, 'Ce joueur n’est pas en vie.');
    refused(s, 'p0', { type: 'vote', target: 'abstention' }, 'L’abstention n’est pas autorisée.');
    expect(validateAction(voting(true), 'p0', { type: 'vote', target: 'abstention' })).toBeNull();
  });

  it('un seul vote par joueur', () => {
    const s = act(voting(true), 'p0', { type: 'vote', target: 'p1' });
    refused(s, 'p0', { type: 'vote', target: 'p2' }, 'Ce n’est pas à vous d’agir maintenant.');
  });
});

describe('chat', () => {
  const roles = ['villageois', 'loup', 'villageois', 'villageois', 'villageois', 'loup'] as const;

  it('la nuit, seule la meute parle ; le jour, tout le village', () => {
    const night = start(makeGame([...roles], { humans: 2 })); // p0 villageois, p1 loup
    refused(night, 'p0', { type: 'chat', channel: 'public', text: 'Bonjour' }, 'Le village dort : silence.');
    refused(night, 'p0', { type: 'chat', channel: 'loups', text: 'Bonjour' }, 'Seule la meute parle la nuit.');
    expect(validateAction(night, 'p1', { type: 'chat', channel: 'loups', text: 'On mange qui ?' })).toBeNull();

    const day = advanceTo({ ...night, wolfVotes: { p5: 'p2' } }, 'debat');
    refused(day, 'p1', { type: 'chat', channel: 'loups', text: 'Psst' }, 'Seule la meute parle la nuit.');
    expect(validateAction(day, 'p0', { type: 'chat', channel: 'public', text: 'Bonjour' })).toBeNull();
  });

  it('refuse les messages vides, trop longs, des morts, et en mode « même pièce »', () => {
    const night = start(makeGame([...roles]));
    night.wolfVotes = { p1: 'p2', p5: 'p2' };
    const day = advanceTo(night, 'debat');
    refused(day, 'p0', { type: 'chat', channel: 'public', text: '   ' }, 'Message vide.');
    refused(day, 'p0', { type: 'chat', channel: 'public', text: 'a'.repeat(MAX_CHAT_LENGTH + 1) }, 'Message trop long.');
    const dead = { ...day, players: day.players.map((p) => (p.id === 'p0' ? { ...p, alive: false } : p)) };
    refused(dead, 'p0', { type: 'chat', channel: 'public', text: 'Bouh' }, 'Les morts ne parlent pas.');
    const roomNight = start(makeGame([...roles], { settings: { discussionMode: 'piece' } }));
    roomNight.wolfVotes = { p1: 'p2', p5: 'p2' }; // les loups épargnent le joueur humain
    const room = advanceTo(roomNight, 'debat');
    refused(room, 'p0', { type: 'chat', channel: 'public', text: 'Salut' }, 'Pas de chat en mode « même pièce ».');
  });

  it('un message valide est publié, et le robot cité peut répondre', () => {
    let day = advanceTo({ ...start(makeGame([...roles], { seed: 3 })), wolfVotes: { p1: 'p2', p5: 'p2' } }, 'debat');
    const target = day.players.find((p) => !p.isHuman && p.alive)!;
    day = act(day, 'p0', { type: 'chat', channel: 'public', text: `Je me méfie de ${target.name}` });
    expect(day.messages.at(-2)?.author === 'Aubin' || day.messages.at(-1)?.author === 'Aubin').toBe(true);
    const replies = day.messages.filter((m) => m.author === target.name && m.at > day.history.at(-1)!.at + 1000);
    expect(replies.length).toBeLessThanOrEqual(2);
  });
});

describe('passer une étape', () => {
  it('réservé à l’hôte, et seulement à l’aube, au débat et au verdict', () => {
    let s = start(makeGame(['villageois', 'loup', 'villageois', 'villageois', 'villageois', 'loup'], { humans: 2 }));
    refused(s, 'p0', { type: 'passer' }, 'Cette étape ne peut pas être passée.');
    s = advanceTo(s, 'aube');
    refused(s, 'p1', { type: 'passer' }, 'Seul l’hôte peut passer cette étape.');
    const skipped = act(s, 'p0', { type: 'passer' }, 5);
    expect(skipped.phaseEndsAt).toBe(5);
    expect(applyEvent(skipped, { type: 'tic', now: 5 }).phase).toBe('debat');
  });
});

// Outils partagés par les tests du moteur.
import { applyEvent, createGame } from '../engine';
import { createMemory } from '../bots';
import { makeRng } from '../rng';
import type { GameState, Phase, PlayerAction } from '../types';
import type { GameSettings, RoleId } from '../../lib/types';

export const NAMES = [
  'Aubin', 'Margot', 'Basile', 'Ondine', 'Gaspard', 'Léonie', 'Firmin', 'Adèle',
  'Côme', 'Suzon', 'Anatole', 'Philomène', 'Hector', 'Rosalie', 'Augustin', 'Mahaut',
];

/** Réglages valides pour `count` joueurs. */
export function settingsFor(count: number, extra: Partial<GameSettings> = {}): GameSettings {
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

/**
 * Crée une partie dont les rôles sont imposés, dans l'ordre des joueurs p0, p1, …
 * Les `humans` premiers joueurs sont humains, les autres sont des robots.
 */
export function makeGame(roles: RoleId[], opts: { humans?: number; settings?: Partial<GameSettings>; seed?: number } = {}) {
  const humans = opts.humans ?? 1;
  const seed = opts.seed ?? 42;
  const s = createGame({
    settings: settingsFor(Math.max(roles.length, 6), opts.settings),
    humans: NAMES.slice(0, humans),
    botNames: NAMES.slice(humans),
    seed,
    now: 0,
  });
  s.players = s.players.slice(0, roles.length);
  roles.forEach((r, i) => (s.players[i].role = r));
  s.memory = {};
  const rng = makeRng(seed);
  for (const p of s.players) if (!p.isHuman) s.memory[p.id] = createMemory(s, p.id, rng);
  return s;
}

export const start = (s: GameState, now = 0) => applyEvent(s, { type: 'demarrer', now });
export const act = (s: GameState, playerId: string, action: PlayerAction, now = s.phaseEndsAt - 1) =>
  applyEvent(s, { type: 'action', playerId, action, now });

/** Laisse le chrono de la phase courante s'écouler. */
export const timeout = (s: GameState) => applyEvent(s, { type: 'tic', now: Math.max(s.phaseEndsAt, s.minEndsAt) });

/** Avance jusqu'à la phase demandée (en laissant les chronos s'écouler). */
export function advanceTo(s: GameState, phase: Phase, maxSteps = 60) {
  for (let i = 0; i < maxSteps && s.phase !== phase; i++) {
    if (s.phase === 'fin') break;
    s = timeout(s);
  }
  if (s.phase !== phase) throw new Error(`Phase ${phase} jamais atteinte (on est en ${s.phase})`);
  return s;
}

/** Suite des phases traversées (sans le lobby). */
export const path = (s: GameState) => s.history.map((t) => t.to);

export const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

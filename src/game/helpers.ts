import { ROLES } from './roles';
import type { GameState, GPlayer } from './types';

export const findPlayer = (s: GameState, id: string | null | undefined) => s.players.find((p) => p.id === id) ?? null;
export const byId = (s: GameState, id: string) => {
  const p = findPlayer(s, id);
  if (!p) throw new Error(`Joueur inconnu : ${id}`);
  return p;
};
export const alivePlayers = (s: GameState) => s.players.filter((p) => p.alive);
export const isAlive = (s: GameState, id: string | null | undefined) => !!findPlayer(s, id)?.alive;
export const isWolf = (s: GameState, id: string) => byId(s, id).role === 'loup';
export const aliveWithRole = (s: GameState, role: GPlayer['role']) => s.players.filter((p) => p.alive && p.role === role);

export function loverOf(s: GameState, id: string): string | null {
  if (!s.lovers) return null;
  if (s.lovers[0] === id) return s.lovers[1];
  if (s.lovers[1] === id) return s.lovers[0];
  return null;
}

/** Couple formé d'un loup et d'un membre du village : il joue pour lui-même. */
export function isMixedCouple(s: GameState) {
  if (!s.lovers) return false;
  const [a, b] = s.lovers.map((id) => ROLES[byId(s, id).role].camp);
  return a !== b;
}

/** Camp pour lequel joue ce joueur (les amoureux d'un couple mixte jouent ensemble). */
export function campOf(s: GameState, id: string): 'village' | 'loups' | 'amoureux' {
  if (isMixedCouple(s) && loverOf(s, id)) return 'amoureux';
  return ROLES[byId(s, id).role].camp;
}

/** Joueurs vivants autres que `except`. */
export const others = (s: GameState, except: string) => alivePlayers(s).filter((p) => p.id !== except);

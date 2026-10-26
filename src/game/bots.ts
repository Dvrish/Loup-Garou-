// Décisions des robots. Elles restent simples : soupçons chiffrés, un peu de hasard,
// et ce que chaque robot sait réellement (rôles révélés, meute, découvertes de la voyante).
import { alivePlayers, byId, isWolf, loverOf, others } from './helpers';
import type { BotMemory, GameState } from './types';

type Rng = () => number;

export function createMemory(s: GameState, botId: string, rng: Rng): BotMemory {
  const me = byId(s, botId);
  const memory: BotMemory = { suspicion: {}, known: { [botId]: me.role }, claimedSeer: false };
  for (const p of s.players) {
    if (p.id === botId) continue;
    memory.suspicion[p.id] = rng() * 0.6;
    if (me.role === 'loup' && p.role === 'loup') memory.known[p.id] = 'loup';
  }
  return memory;
}

const sus = (s: GameState, botId: string, target: string) => s.memory[botId]?.suspicion[target] ?? 0;

/** Soupçon moyen du village envers un joueur (ce que « pense la place publique »). */
export function publicSuspicion(s: GameState, target: string) {
  const judges = alivePlayers(s).filter((p) => !p.isHuman && p.id !== target && p.role !== 'loup');
  if (!judges.length) return 0;
  return judges.reduce((sum, p) => sum + sus(s, p.id, target), 0) / judges.length;
}

function bestBy<T>(items: T[], score: (x: T) => number): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const it of items) {
    const sc = score(it);
    if (sc > bestScore) {
      best = it;
      bestScore = sc;
    }
  }
  return best;
}

/** Soupçon que ce joueur porte sur la meute (menace pour les loups). */
function threatToWolves(s: GameState, id: string) {
  const mem = s.memory[id];
  if (!mem) return 1; // l'humain : menace moyenne
  const wolves = s.players.filter((p) => p.alive && p.role === 'loup');
  if (!wolves.length) return 0;
  return wolves.reduce((sum, w) => sum + (mem.suspicion[w.id] ?? 0), 0) / wolves.length;
}

export function botCupidChoice(s: GameState, botId: string, rng: Rng): [string, string] {
  const pool = alivePlayers(s).map((p) => p.id);
  // Cupidon se choisit lui-même une fois sur trois
  const first = rng() < 0.33 ? botId : pool[Math.floor(rng() * pool.length)];
  const rest = pool.filter((id) => id !== first);
  return [first, rest[Math.floor(rng() * rest.length)]];
}

export function botSeerTarget(s: GameState, botId: string, rng: Rng): string | null {
  const mem = s.memory[botId];
  const pool = others(s, botId).filter((p) => !mem.known[p.id]);
  return bestBy(pool, (p) => sus(s, botId, p.id) + rng())?.id ?? null;
}

export function botWolfTarget(s: GameState, botId: string, rng: Rng): string | null {
  const lover = loverOf(s, botId);
  const pool = alivePlayers(s).filter((p) => p.role !== 'loup' && p.id !== lover);
  return (
    bestBy(pool, (p) => (s.memory[p.id]?.claimedSeer ? 5 : 0) + threatToWolves(s, p.id) + rng() * 1.5)?.id ?? null
  );
}

export function botWitchDecision(s: GameState, botId: string, rng: Rng) {
  const victim = s.wolfTarget;
  let save = false;
  let kill: string | null = null;
  if (s.witch.life && victim && (victim === botId || rng() < (s.day <= 2 ? 0.75 : 0.45))) save = true;
  if (s.witch.death && rng() < 0.5) {
    const mem = s.memory[botId];
    const lover = loverOf(s, botId);
    const pool = others(s, botId).filter((p) => p.id !== lover && p.id !== victim && mem.known[p.id] !== 'villageois');
    const knownWolf = pool.find((p) => mem.known[p.id] === 'loup');
    const suspect = bestBy(pool, (p) => sus(s, botId, p.id));
    if (knownWolf) kill = knownWolf.id;
    else if (suspect && sus(s, botId, suspect.id) >= 2.5) kill = suspect.id;
  }
  return { save, kill };
}

export function botHunterTarget(s: GameState, botId: string, rng: Rng): string | null {
  const mem = s.memory[botId];
  const lover = loverOf(s, botId);
  const pool = others(s, botId).filter((p) => p.id !== lover);
  const knownWolf = pool.find((p) => mem.known[p.id] === 'loup');
  if (knownWolf) return knownWolf.id;
  const innocentPenalty = (id: string) => (mem.known[id] && mem.known[id] !== 'loup' ? 10 : 0);
  return bestBy(pool, (p) => sus(s, botId, p.id) - innocentPenalty(p.id) + rng() * 0.5)?.id ?? null;
}

export function botVote(s: GameState, botId: string, candidates: string[], rng: Rng): string | 'abstention' {
  const mem = s.memory[botId];
  const lover = loverOf(s, botId);
  let pool = candidates.filter((id) => id !== botId && id !== lover && byId(s, id).alive);
  if (isWolf(s, botId)) {
    const prey = pool.filter((id) => !isWolf(s, id));
    if (prey.length) pool = prey;
    const target = bestBy(pool, (id) => publicSuspicion(s, id) + (s.memory[id]?.claimedSeer ? 3 : 0) + rng() * 0.8);
    return target ?? 'abstention';
  }
  const knownWolf = pool.find((id) => mem.known[id] === 'loup');
  if (knownWolf) return knownWolf;
  const score = (id: string) => sus(s, botId, id) - (mem.known[id] && mem.known[id] !== 'loup' ? 10 : 0) + rng() * 0.8;
  const target = bestBy(pool, score);
  if (!target) return 'abstention';
  if (s.settings.allowAbstain && sus(s, botId, target) < 0.6 && rng() < 0.25) return 'abstention';
  return target;
}

/** Ajoute du soupçon envers `target` chez tous les robots du village. */
export function spreadSuspicion(s: GameState, target: string, amount: number, except?: string) {
  for (const [botId, mem] of Object.entries(s.memory)) {
    if (botId === target || botId === except || isWolf(s, botId)) continue;
    if (mem.known[target] && mem.known[target] !== 'loup') continue;
    mem.suspicion[target] = (mem.suspicion[target] ?? 0) + amount;
  }
}

import type { ChatMessage, GameSettings, RoleId } from '../lib/types';

/** Phases de la partie, dans l'ordre où elles peuvent s'enchaîner. */
export type Phase =
  | 'attribution'
  | 'cupidon'
  | 'voyante'
  | 'loups'
  | 'sorciere'
  | 'aube'
  | 'chasseur'
  | 'debat'
  | 'vote'
  | 'verdict'
  | 'fin';

export const NIGHT_PHASES: Phase[] = ['cupidon', 'voyante', 'loups', 'sorciere'];

export type Winner = 'village' | 'loups' | 'amoureux' | 'aucun';

export type DeathCause = 'loups' | 'poison' | 'vote' | 'chagrin' | 'chasseur';

export interface GPlayer {
  id: string;
  name: string;
  role: RoleId;
  alive: boolean;
  isHuman: boolean;
}

export interface Death {
  id: string;
  cause: DeathCause;
  day: number;
}

/** Ce qu'un robot sait et soupçonne. */
export interface BotMemory {
  suspicion: Record<string, number>;
  known: Record<string, RoleId>;
  claimedSeer: boolean;
}

/** Message horodaté : il n'apparaît qu'une fois son heure `at` passée. */
export interface TimedMessage extends ChatMessage {
  at: number;
}

export interface Vote {
  target: string | 'abstention';
  at: number;
}

export interface GameState {
  settings: GameSettings;
  players: GPlayer[];
  humanId: string | null;
  phase: Phase;
  day: number;
  /** Heure de fin de la phase (équivalent local du futur `phase_ends_at`). */
  phaseEndsAt: number;
  /** La phase ne peut pas se terminer avant cette heure (rythme des robots). */
  minEndsAt: number;
  /** La phase attend une action du joueur humain. */
  waitingHuman: boolean;
  /** Le joueur humain a terminé son action pour cette phase. */
  humanDone: boolean;
  lovers: [string, string] | null;
  cupidChoice: string[];
  wolfTarget: string | null;
  wolfSuggestions: Record<string, string>;
  witch: { life: boolean; death: boolean; saveTonight: boolean; killTonight: string | null };
  /** Rôles découverts par la voyante humaine. */
  seerResults: Record<string, RoleId>;
  votes: Record<string, Vote>;
  runoff: string[] | null;
  eliminatedToday: string | null;
  deaths: Death[];
  hunterQueue: string[];
  hunterShot: string | null;
  afterHunter: 'debat' | 'nuit';
  messages: TimedMessage[];
  /** Informations secrètes réservées au joueur humain. */
  notes: { at: number; text: string }[];
  memory: Record<string, BotMemory>;
  announcement: string;
  winner: Winner | null;
}

export interface Ctx {
  rng: () => number;
  now: number;
}

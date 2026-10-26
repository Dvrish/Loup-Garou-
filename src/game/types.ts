import type { ChatMessage, GameSettings, RoleId } from '../lib/types';

/**
 * États de la machine. Certains sont des états « de passage » : la partie les traverse
 * instantanément (ils apparaissent dans l'historique mais jamais comme phase courante).
 * Voir docs/machine-a-etats.md pour le schéma complet.
 */
export type Phase =
  | 'lobby' // passage : création de la partie
  | 'attribution'
  | 'cupidon'
  | 'voyante'
  | 'loups'
  | 'sorciere'
  | 'resolution-nuit' // passage
  | 'aube'
  | 'chasseur'
  | 'verification' // passage : vérification de la victoire
  | 'debat'
  | 'vote'
  | 'resolution-vote' // passage
  | 'verdict'
  | 'fin';

export const NIGHT_PHASES = ['cupidon', 'voyante', 'loups', 'sorciere'] as const satisfies readonly Phase[];
export const TRANSIENT_PHASES: Phase[] = ['lobby', 'resolution-nuit', 'verification', 'resolution-vote'];

export type Winner = 'village' | 'loups' | 'amoureux' | 'aucun';

export type DeathCause = 'loups' | 'poison' | 'vote' | 'chagrin' | 'chasseur';

export interface GPlayer {
  id: string;
  name: string;
  role: RoleId;
  alive: boolean;
  /** Joueur humain (sinon : robot). */
  isHuman: boolean;
  /** Connecté en ce moment (parties en ligne uniquement). */
  online?: boolean;
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

/** Information secrète destinée à un seul joueur. */
export interface Note {
  playerId: string;
  at: number;
  text: string;
}

export interface Vote {
  target: string | 'abstention';
  at: number;
}

export interface Transition {
  from: Phase;
  to: Phase;
  day: number;
  at: number;
}

/** L'état complet d'une partie. Il ne contient que des données (sérialisable en JSON). */
export interface GameState {
  settings: GameSettings;
  players: GPlayer[];
  /** L'hôte peut abréger l'aube, le débat et le verdict. */
  hostId: string | null;
  /** État du générateur aléatoire : même état + mêmes événements ⇒ même partie. */
  seed: number;
  phase: Phase;
  day: number;
  /** Heure de fin de la phase (équivalent local du futur `phase_ends_at`). */
  phaseEndsAt: number;
  /** La phase ne peut pas se terminer avant cette heure (rythme des robots). */
  minEndsAt: number;
  /** Joueurs humains dont on attend une action pendant cette phase… */
  pending: string[];
  /** … et ceux qui l'ont déjà faite. */
  done: string[];
  lovers: [string, string] | null;
  cupidChoice: [string, string] | null;
  /** Choix de chaque loup (humain ou robot) pour la victime de la nuit. */
  wolfVotes: Record<string, string>;
  wolfTarget: string | null;
  witch: { life: boolean; death: boolean; saveTonight: boolean; killTonight: string | null };
  /** Rôles découverts par la voyante. */
  seerResults: Record<string, RoleId>;
  votes: Record<string, Vote>;
  runoff: string[] | null;
  eliminatedToday: string | null;
  deaths: Death[];
  hunterQueue: string[];
  hunterShot: string | null;
  /** Où va la partie après la vérification de victoire. */
  afterVerification: 'debat' | 'nuit';
  messages: TimedMessage[];
  notes: Note[];
  memory: Record<string, BotMemory>;
  announcement: string;
  winner: Winner | null;
  history: Transition[];
}

/** Actions qu'un joueur humain peut envoyer. */
export type PlayerAction =
  | { type: 'cupidon'; targets: [string, string] }
  | { type: 'voyante'; target: string }
  | { type: 'loups'; target: string }
  | { type: 'sorciere'; save: boolean; kill: string | null }
  | { type: 'chasseur'; target: string | null }
  | { type: 'vote'; target: string | 'abstention' }
  | { type: 'chat'; channel: 'public' | 'loups'; text: string }
  | { type: 'passer' };

/** Tout ce qui peut faire évoluer une partie. */
export type GameEvent =
  | { type: 'demarrer'; now: number }
  | { type: 'tic'; now: number }
  | { type: 'action'; playerId: string; action: PlayerAction; now: number };

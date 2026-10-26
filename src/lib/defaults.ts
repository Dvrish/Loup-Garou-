// Réglages proposés par défaut dans le salon.
import type { GameSettings } from './types';

export const DEFAULT_SETTINGS: GameSettings = {
  playerCount: 8,
  roles: { loup: 2, villageois: 2, voyante: 1, sorciere: 1, chasseur: 1, cupidon: 1 },
  nightSeconds: 60,
  daySeconds: 180,
  voteSeconds: 45,
  allowAbstain: true,
  tieRule: 'personne',
  discussionMode: 'chat',
};

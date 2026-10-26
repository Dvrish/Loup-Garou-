// Données de démonstration du salon « en ligne » (le vrai multijoueur arrive à l'étape 5).
import type { GameSettings, Player } from './types';

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

export const LOBBY_PLAYERS: Player[] = [
  { id: 'p1', name: 'Vous', online: true, isHost: true, isMe: true, alive: true },
  { id: 'p2', name: 'Margot', online: true, alive: true },
  { id: 'p3', name: 'Basile', online: true, alive: true },
  { id: 'p4', name: 'Ondine', online: false, alive: true },
  { id: 'p5', name: 'Gaspard', online: true, alive: true },
  { id: 'p6', name: 'Léonie', online: true, alive: true },
  { id: 'p7', name: 'Firmin', online: true, alive: true },
];

export function makeInviteCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

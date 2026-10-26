// Données fictives de l'étape 1 : aucune connexion à un serveur.
import type { ChatMessage, GameSettings, Player, RoleId, RoleInfo } from './types';

export const ROLES: Record<RoleId, RoleInfo> = {
  villageois: {
    id: 'villageois',
    name: 'Villageois',
    camp: 'village',
    tagline: 'Le cœur et la voix de Vaucombe',
    description:
      "Vous n'avez aucun pouvoir la nuit, mais votre vote et votre flair décident du sort du village.",
  },
  loup: {
    id: 'loup',
    name: 'Loup-garou',
    camp: 'loups',
    tagline: 'La meute a faim',
    description:
      'Chaque nuit, vous choisissez avec les autres loups une victime. Le jour, cachez votre nature.',
  },
  voyante: {
    id: 'voyante',
    name: 'Voyante',
    camp: 'village',
    tagline: 'Rien n’échappe à son regard',
    description: 'Chaque nuit, vous découvrez le rôle secret d’un joueur de votre choix.',
  },
  sorciere: {
    id: 'sorciere',
    name: 'Sorcière',
    camp: 'village',
    tagline: 'Une fiole pour sauver, une pour punir',
    description:
      'Vous disposez d’une potion de vie et d’une potion de mort, chacune utilisable une seule fois.',
  },
  chasseur: {
    id: 'chasseur',
    name: 'Chasseur',
    camp: 'village',
    tagline: 'Il ne part jamais seul',
    description: 'Lorsque vous mourez, vous tirez une dernière balle sur le joueur de votre choix.',
  },
  cupidon: {
    id: 'cupidon',
    name: 'Cupidon',
    camp: 'village',
    tagline: 'Deux cœurs, un seul destin',
    description:
      'La première nuit, vous liez deux amoureux. Si l’un meurt, l’autre meurt de chagrin.',
  },
};

export const ROLE_ORDER: RoleId[] = ['loup', 'villageois', 'voyante', 'sorciere', 'chasseur', 'cupidon'];

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

export const TABLE_PLAYERS: Player[] = [
  { id: 'p1', name: 'Vous', online: true, isMe: true, alive: true, role: 'loup' },
  { id: 'p2', name: 'Margot', online: true, alive: true, role: 'voyante' },
  { id: 'p3', name: 'Basile', online: true, alive: true, role: 'loup' },
  { id: 'p4', name: 'Ondine', online: false, alive: false, role: 'villageois' },
  { id: 'p5', name: 'Gaspard', online: true, alive: true, role: 'chasseur', lover: true },
  { id: 'p6', name: 'Léonie', online: true, alive: true, role: 'sorciere', lover: true },
  { id: 'p7', name: 'Firmin', online: true, alive: true, role: 'cupidon' },
  { id: 'p8', name: 'Adèle', online: true, alive: true, role: 'villageois' },
];

export const MY_ROLE: RoleId = 'loup';

export const CHAT_PUBLIC: ChatMessage[] = [
  { id: 'm1', author: 'Meneur', text: 'Le village se réveille… Ondine a été retrouvée sans vie.', channel: 'systeme' },
  { id: 'm2', author: 'Margot', text: 'Hier soir Basile est rentré très tard, je dis ça…', channel: 'public' },
  { id: 'm3', author: 'Basile', text: "J'étais à la taverne, demandez à Firmin !", channel: 'public' },
  { id: 'm4', author: 'Firmin', text: 'Je confirme, il y était. Mais il est parti avant minuit.', channel: 'public' },
];

export const CHAT_LOUPS: ChatMessage[] = [
  { id: 'l1', author: 'Meneur', text: 'La meute se réveille. Choisissez votre victime.', channel: 'systeme' },
  { id: 'l2', author: 'Basile', text: 'Margot me soupçonne déjà. On la vise ?', channel: 'loups' },
];

export const PROFILE = {
  name: 'Vous',
  games: 42,
  wins: 23,
  favoriteRole: 'voyante' as RoleId,
  byRole: { loup: 9, villageois: 14, voyante: 7, sorciere: 5, chasseur: 4, cupidon: 3 } as Record<RoleId, number>,
  history: [
    { result: 'victoire', role: 'loup' as RoleId, players: 10, date: 'Hier' },
    { result: 'défaite', role: 'villageois' as RoleId, players: 8, date: 'Il y a 3 jours' },
    { result: 'victoire', role: 'sorciere' as RoleId, players: 12, date: 'La semaine dernière' },
  ],
};

export function makeInviteCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

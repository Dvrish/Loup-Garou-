// Description des six rôles du jeu.
import type { RoleId, RoleInfo } from '../lib/types';

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

export type RoleId = 'villageois' | 'loup' | 'voyante' | 'sorciere' | 'chasseur' | 'cupidon';

export type Camp = 'village' | 'loups';

export type DiscussionMode = 'chat' | 'piece';

export type TieRule = 'personne' | 'hasard' | 'revote';

export interface RoleInfo {
  id: RoleId;
  name: string;
  camp: Camp;
  tagline: string;
  description: string;
}

export interface Player {
  id: string;
  name: string;
  online: boolean;
  isHost?: boolean;
  isMe?: boolean;
  alive: boolean;
  role?: RoleId;
  lover?: boolean;
}

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  channel: 'public' | 'loups' | 'systeme';
}

export interface GameSettings {
  playerCount: number;
  roles: Record<RoleId, number>;
  nightSeconds: number;
  daySeconds: number;
  voteSeconds: number;
  allowAbstain: boolean;
  tieRule: TieRule;
  discussionMode: DiscussionMode;
}

export type Screen =
  | 'accueil'
  | 'profil'
  | 'audio'
  | 'lobby'
  | 'revelation'
  | 'table'
  | 'fin';

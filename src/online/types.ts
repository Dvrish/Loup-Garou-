// Forme des données renvoyées par les fonctions room_state et game_state du serveur.
import type { GameSettings, RoleId } from '../lib/types';
import type { DeathCause, Phase, Winner } from '../game/types';

export interface RoomSnapshot {
  room: { id: string; code: string; host_id: string; status: 'salon' | 'en_jeu' | 'terminee'; settings: GameSettings };
  me: string;
  server_now: string;
  players: { id: string; pseudo: string; online: boolean }[];
  game_id: string | null;
}

export interface GameSnapshot {
  game: {
    id: string;
    room_id: string;
    settings: GameSettings;
    phase: Phase;
    day: number;
    phase_ends_at: string;
    vote_round: number;
    runoff: string[] | null;
    eliminated_today: string | null;
    announcement: string;
    winner: Winner | null;
  };
  me: string;
  server_now: string;
  host_id: string;
  players: {
    id: string;
    pseudo: string;
    seat: number;
    alive: boolean;
    death_day: number | null;
    death_cause: DeathCause | null;
    death_seq: number | null;
    role: RoleId | null;
    online: boolean;
  }[];
  votes: { voter: string; target: string | null; at: string }[];
  wolf_votes: Record<string, string>;
  messages: { id: number; author: string; author_id: string | null; channel: 'public' | 'loups' | 'systeme'; text: string; created_at: string }[];
  notes: { text: string; at: string }[];
  view: {
    role: RoleId;
    partner: string | null;
    partner_role: RoleId | null;
    lovers: [string, string] | null;
    pending: boolean;
    acted: boolean;
    wolf_target: string | null;
    witch: { life: boolean; death: boolean } | null;
    seer_results: Record<string, RoleId> | null;
  };
}

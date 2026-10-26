// Appels au serveur. Chaque action passe par une fonction SQL qui vérifie les règles ;
// en cas de refus, le message d'erreur (en français) vient directement du serveur.
import { ensureSignedIn, supabase } from '../lib/supabase';
import type { GameSettings } from '../lib/types';
import type { PlayerAction } from '../game/types';
import type { GameSnapshot, RoomSnapshot } from './types';

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const api = {
  createRoom: (pseudo: string) => call<{ room_id: string; code: string }>('create_room', { p_pseudo: pseudo }),
  joinRoom: (code: string, pseudo: string) => call<string>('join_room', { p_code: code, p_pseudo: pseudo }),
  leaveRoom: (room: string) => call<void>('leave_room', { p_room: room }),
  kick: (room: string, player: string) => call<void>('kick_player', { p_room: room, p_player: player }),
  updateSettings: (room: string, settings: GameSettings) => call<void>('update_settings', { p_room: room, p_settings: settings }),
  startGame: (room: string) => call<string>('start_game', { p_room: room }),
  backToLobby: (room: string) => call<void>('back_to_lobby', { p_room: room }),
  heartbeat: (room: string) => call<void>('heartbeat', { p_room: room }),
  roomState: (room: string) => call<RoomSnapshot>('room_state', { p_room: room }),
  gameState: (game: string) => call<GameSnapshot>('game_state', { p_game: game }),
  advance: (game: string) => call<boolean>('advance_game', { p_game: game }),

  /** Traduit une action de l'interface en appel à la bonne fonction du serveur. */
  act(game: string, a: PlayerAction) {
    switch (a.type) {
      case 'cupidon':
        return call('act_cupidon', { p_game: game, p_a: a.targets[0], p_b: a.targets[1] });
      case 'voyante':
        return call('act_voyante', { p_game: game, p_target: a.target });
      case 'loups':
        return call('act_loups', { p_game: game, p_target: a.target });
      case 'sorciere':
        return call('act_sorciere', { p_game: game, p_save: a.save, p_kill: a.kill });
      case 'chasseur':
        return call('act_chasseur', { p_game: game, p_target: a.target });
      case 'vote':
        return call('cast_vote', { p_game: game, p_target: a.target === 'abstention' ? null : a.target });
      case 'chat':
        return call('send_message', { p_game: game, p_channel: a.channel, p_text: a.text });
      case 'passer':
        return call('skip_phase', { p_game: game });
    }
  },
};

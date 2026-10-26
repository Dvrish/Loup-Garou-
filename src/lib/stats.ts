// Statistiques enregistrées sur cet appareil (elles passeront sur Supabase à l'étape 4).
import type { RoleId } from './types';

export interface GameRecord {
  won: boolean;
  role: RoleId;
  players: number;
  date: string; // ISO
}

const KEY = 'lg-stats';

export function loadStats(): GameRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GameRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordGame(rec: GameRecord) {
  try {
    localStorage.setItem(KEY, JSON.stringify([rec, ...loadStats()].slice(0, 200)));
  } catch {
    /* stockage indisponible */
  }
}

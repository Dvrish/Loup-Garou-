// Fait vivre une partie locale : l'horloge envoie un événement « tic » toutes les 250 ms,
// et les actions du joueur sont transmises au moteur sous forme d'événements.
import { useCallback, useEffect, useState } from 'react';
import { applyEvent, createGame } from './engine';
import { newSeed } from './rng';
import type { GameState, PlayerAction } from './types';
import type { GameSettings } from '../lib/types';

export const BOT_NAMES = [
  'Margot', 'Basile', 'Ondine', 'Gaspard', 'Léonie', 'Firmin', 'Adèle', 'Côme',
  'Suzon', 'Anatole', 'Philomène', 'Hector', 'Rosalie', 'Augustin', 'Mahaut',
];

/** En partie locale, le joueur humain est toujours le premier (et l'hôte). */
export const VIEWER_ID = 'p0';

export function useLocalGame() {
  const [game, setGame] = useState<GameState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const create = useCallback((settings: GameSettings, humanName: string, botNames: string[]) => {
    setGame(createGame({ settings, humans: [humanName], botNames, seed: newSeed(), now: Date.now() }));
  }, []);

  const start = useCallback(() => setGame((g) => g && applyEvent(g, { type: 'demarrer', now: Date.now() })), []);
  const act = useCallback(
    (action: PlayerAction) => setGame((g) => g && applyEvent(g, { type: 'action', playerId: VIEWER_ID, action, now: Date.now() })),
    [],
  );
  const reset = useCallback(() => setGame(null), []);

  const running = !!game && game.phase !== 'attribution' && game.phase !== 'fin';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const t0 = Date.now();
      setNow(t0);
      setGame((g) => g && applyEvent(g, { type: 'tic', now: t0 }));
    }, 250);
    return () => clearInterval(t);
  }, [running]);

  return { game, now, create, start, act, reset };
}

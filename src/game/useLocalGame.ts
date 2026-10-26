// Fait vivre une partie locale : l'horloge avance, et les phases se terminent
// quand leur chrono est écoulé ou que le joueur a agi.
import { useCallback, useEffect, useRef, useState } from 'react';
import { act, canEnd, createGame, endPhase, startGame, type HumanAction } from './engine';
import { makeRng } from './rng';
import type { GameState } from './types';
import type { GameSettings } from '../lib/types';

export const BOT_NAMES = [
  'Margot', 'Basile', 'Ondine', 'Gaspard', 'Léonie', 'Firmin', 'Adèle', 'Côme',
  'Suzon', 'Anatole', 'Philomène', 'Hector', 'Rosalie', 'Augustin', 'Mahaut',
];

export function useLocalGame() {
  const rngRef = useRef(makeRng());
  const [game, setGame] = useState<GameState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const ctx = () => ({ rng: rngRef.current, now: Date.now() });

  const create = useCallback((settings: GameSettings, humanName: string, botNames: string[]) => {
    rngRef.current = makeRng();
    setGame(createGame({ settings, humanName, botNames, ctx: { rng: rngRef.current, now: Date.now() } }));
  }, []);

  const start = useCallback(() => setGame((g) => (g ? startGame(g, ctx()) : g)), []);
  const dispatch = useCallback((a: HumanAction) => setGame((g) => (g ? act(g, a, ctx()) : g)), []);
  const reset = useCallback(() => setGame(null), []);

  const running = !!game && game.phase !== 'attribution' && game.phase !== 'fin';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const t0 = Date.now();
      setNow(t0);
      setGame((g) => (g && canEnd(g, t0) ? endPhase(g, { rng: rngRef.current, now: t0 }) : g));
    }, 250);
    return () => clearInterval(t);
  }, [running]);

  return { game, now, create, start, dispatch, reset };
}

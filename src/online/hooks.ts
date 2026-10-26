// Synchronisation avec le serveur : temps réel (Supabase Realtime) quand il est disponible,
// avec une relecture régulière en secours. Le serveur reste la seule source de vérité :
// le navigateur ne fait qu'afficher le dernier instantané reçu.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { PlayerAction } from '../game/types';
import { api } from './api';
import { toGameState } from './mapping';
import type { GameSnapshot, RoomSnapshot } from './types';

const ROOM_KEY = 'lg-salon';

/** Salon en cours, mémorisé sur l'appareil pour pouvoir revenir après un rechargement. */
export const savedRoom = {
  get: () => {
    try {
      return localStorage.getItem(ROOM_KEY);
    } catch {
      return null;
    }
  },
  set: (id: string | null) => {
    try {
      if (id) localStorage.setItem(ROOM_KEY, id);
      else localStorage.removeItem(ROOM_KEY);
    } catch {
      /* stockage indisponible */
    }
  },
};

/** Écoute des changements de tables ; `onChange` est appelé (avec un petit délai groupé). */
function useRealtime(name: string | null, tables: { table: string; filter: string; event?: '*' | 'INSERT' | 'DELETE' }[], onChange: () => void) {
  const [live, setLive] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = JSON.stringify(tables);
  useEffect(() => {
    if (!name) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ping = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 120);
    };
    let channel = supabase.channel(name);
    for (const t of JSON.parse(key) as typeof tables) {
      channel = channel.on('postgres_changes' as never, { event: t.event ?? '*', schema: 'public', table: t.table, filter: t.filter }, ping);
    }
    channel.subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      clearTimeout(timer);
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [name, key]);
  return live;
}

/** Relit l'état à intervalle régulier ; évite deux lectures simultanées. */
function useSnapshot<T>(load: (() => Promise<T>) | null, intervalMs: number, onError: (m: string) => void) {
  const [data, setData] = useState<T | null>(null);
  const busy = useRef(false);
  const again = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const errRef = useRef(onError);
  errRef.current = onError;

  const refresh = useCallback(async () => {
    const fn = loadRef.current;
    if (!fn) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      setData(await fn());
    } catch (e) {
      errRef.current((e as Error).message);
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void refresh();
      }
    }
  }, []);

  const enabled = !!load;
  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    void refresh();
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [enabled, intervalMs, refresh]);

  return { data, refresh };
}

export function useOnlineRoom(roomId: string | null, onError: (m: string) => void) {
  const load = useMemo(() => (roomId ? () => api.roomState(roomId) : null), [roomId]);
  const [interval, setIntervalMs] = useState(3000);
  const { data, refresh } = useSnapshot<RoomSnapshot>(load, interval, onError);
  const live = useRealtime(roomId ? `salon-${roomId}` : null, roomId
    ? [
        { table: 'rooms', filter: `id=eq.${roomId}` },
        { table: 'room_players', filter: `room_id=eq.${roomId}`, event: 'INSERT' },
        { table: 'room_players', filter: `room_id=eq.${roomId}`, event: 'DELETE' },
        { table: 'games', filter: `room_id=eq.${roomId}`, event: 'INSERT' },
      ]
    : [], refresh);
  useEffect(() => setIntervalMs(live ? 8000 : 3000), [live]);

  // Signe de vie toutes les 15 s (présence, transfert d'hôte)
  useEffect(() => {
    if (!roomId) return;
    const beat = () => api.heartbeat(roomId).catch(() => undefined);
    void beat();
    const t = setInterval(beat, 15000);
    return () => clearInterval(t);
  }, [roomId]);

  return { room: data, refresh, live };
}

export function useOnlineGame(gameId: string | null, onError: (m: string) => void) {
  const offset = useRef(0);
  const load = useMemo(
    () =>
      gameId
        ? async () => {
            const t0 = Date.now();
            const snap = await api.gameState(gameId);
            const t1 = Date.now();
            // Décalage d'horloge estimé au milieu de l'aller-retour
            offset.current = Date.parse(snap.server_now) - (t0 + t1) / 2;
            return snap;
          }
        : null,
    [gameId],
  );
  const [interval, setIntervalMs] = useState(2000);
  const { data, refresh } = useSnapshot<GameSnapshot>(load, interval, onError);
  const f = gameId ? `game_id=eq.${gameId}` : '';
  const live = useRealtime(gameId ? `partie-${gameId}` : null, gameId
    ? [
        { table: 'games', filter: `id=eq.${gameId}` },
        { table: 'game_players', filter: f },
        { table: 'votes', filter: f },
        { table: 'messages', filter: f },
        { table: 'private_notes', filter: f },
        { table: 'night_actions', filter: f },
      ]
    : [], refresh);
  useEffect(() => setIntervalMs(live ? 6000 : 2000), [live]);

  const game = useMemo(() => (data ? toGameState(data, offset.current) : null), [data]);

  // Horloge locale, et relance du serveur quand le chrono est écoulé
  const [now, setNow] = useState(() => Date.now());
  const nudged = useRef('');
  useEffect(() => {
    if (!gameId) return;
    const t = setInterval(() => {
      const t0 = Date.now();
      setNow(t0);
      if (!game || game.phase === 'fin' || t0 < game.phaseEndsAt + 400) return;
      const key = `${game.phase}-${game.day}-${game.phaseEndsAt}`;
      if (nudged.current === key) return;
      nudged.current = key;
      // Petit délai aléatoire : tous les joueurs n'appellent pas le serveur en même temps
      setTimeout(() => {
        api
          .advance(gameId)
          .catch(() => undefined)
          .finally(() => {
            void refresh();
            // Si rien n'a bougé, on retentera dans 2 s
            setTimeout(() => {
              if (nudged.current === key) nudged.current = '';
            }, 2000);
          });
      }, Math.random() * 600);
    }, 250);
    return () => clearInterval(t);
  }, [gameId, game, refresh]);

  const act = useCallback(
    async (a: PlayerAction) => {
      if (!gameId) return;
      try {
        await api.act(gameId, a);
      } catch (e) {
        onError((e as Error).message);
      }
      void refresh();
    },
    [gameId, onError, refresh],
  );

  return { game, snapshot: data, now, act, refresh, live };
}

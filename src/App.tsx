import { useCallback, useEffect, useRef, useState } from 'react';
import { Backdrop } from './components/Backdrop';
import { Toast } from './components/Toast';
import { unlockAudio } from './lib/audio';
import { DEFAULT_SETTINGS } from './lib/defaults';
import type { GameSettings, Player, Screen } from './lib/types';
import { BOT_NAMES, VIEWER_ID, useLocalGame } from './game/useLocalGame';
import { api } from './online/api';
import { savedRoom, useOnlineGame, useOnlineRoom } from './online/hooks';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { RoleReveal } from './screens/RoleReveal';
import { GameTable } from './screens/GameTable';
import { EndGame } from './screens/EndGame';
import { Profile } from './screens/Profile';
import { AudioSettings } from './screens/AudioSettings';

type Mode = 'robots' | 'enligne';

const PSEUDO_KEY = 'lg-pseudo';
const readPseudo = () => {
  try {
    return localStorage.getItem(PSEUDO_KEY) ?? '';
  } catch {
    return '';
  }
};
const inviteCode = new URLSearchParams(window.location.search).get('code');

export function App() {
  const [screen, setScreen] = useState<Screen>('accueil');
  const [mode, setMode] = useState<Mode>('robots');
  const [pseudo, setPseudo] = useState(readPseudo);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notify = useCallback((m: string) => setToast(m), []);
  const myName = pseudo.trim() || 'Vous';

  // ----- partie contre les robots
  const local = useLocalGame();

  // ----- partie en ligne (reprise automatique après un rechargement de la page)
  const [roomId, setRoomId] = useState<string | null>(() => (inviteCode ? null : savedRoom.get()));
  const roomErrors = useCallback(
    (m: string) => {
      if (m.includes('pas dans ce salon')) {
        // Salon disparu ou joueur retiré : retour à l'accueil
        savedRoom.set(null);
        setRoomId(null);
        setScreen('accueil');
      }
      notify(m);
    },
    [notify],
  );
  const { room } = useOnlineRoom(roomId, roomErrors);
  const gameId = room && room.room.status !== 'salon' ? room.game_id : null;
  const online = useOnlineGame(gameId, notify);
  const isHost = !!room && room.room.host_id === room.me;

  useEffect(() => {
    try {
      localStorage.setItem(PSEUDO_KEY, pseudo);
    } catch {
      /* stockage indisponible */
    }
  }, [pseudo]);

  // Le navigateur n'autorise le son qu'après un premier geste de l'utilisateur.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);

  // Navigation pilotée par le serveur : lancement de la partie, retour au salon, reprise.
  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!room) return;
    const status = room.room.status;
    const prev = lastStatus.current;
    lastStatus.current = status;
    if (prev === null) {
      // Reprise après rechargement
      setMode('enligne');
      setScreen(status === 'salon' ? 'lobby' : 'table');
    } else if (status === 'en_jeu' && prev !== 'en_jeu') {
      setScreen('revelation');
    }
  }, [room]);

  // Réglages : l'hôte modifie une copie locale, envoyée au serveur après une courte pause.
  const [draft, setDraft] = useState<GameSettings | null>(null);
  useEffect(() => {
    if (!draft || !roomId) return;
    const t = setTimeout(() => {
      api.updateSettings(roomId, draft).catch((e: Error) => notify(e.message));
    }, 400);
    return () => clearTimeout(t);
  }, [draft, roomId, notify]);
  const onlineSettings = (isHost && draft) || room?.room.settings || DEFAULT_SETTINGS;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const enterRoom = (id: string) => {
    savedRoom.set(id);
    lastStatus.current = 'salon';
    setDraft(null);
    setRoomId(id);
    setMode('enligne');
    setScreen('lobby');
    if (inviteCode) window.history.replaceState(null, '', window.location.pathname);
  };

  const leaveOnline = () => {
    savedRoom.set(null);
    setRoomId(null);
    lastStatus.current = null;
    setScreen('accueil');
  };

  const launchRobots = () => {
    local.create(settings, myName, BOT_NAMES);
    setScreen('revelation');
  };

  const lobbyPlayers: Player[] =
    room?.players.map((p) => ({
      id: p.id,
      name: p.pseudo,
      online: p.online,
      isHost: p.id === room.room.host_id,
      isMe: p.id === room.me,
      alive: true,
    })) ?? [];

  const isOnline = mode === 'enligne';
  const game = isOnline ? online.game : local.game;
  const viewerId = isOnline ? (room?.me ?? '') : VIEWER_ID;
  const backdropPhase = screen === 'fin' && game?.winner === 'village' ? 'jour' : 'nuit';

  return (
    <div className="app">
      {screen !== 'table' && <Backdrop phase={backdropPhase} />}
      <main className="screen" key={screen}>
        {screen === 'accueil' && (
          <Home
            initialCode={inviteCode}
            busy={busy}
            pseudo={pseudo}
            onPseudo={setPseudo}
            onPlay={() => {
              setMode('robots');
              setScreen('lobby');
            }}
            onCreate={() => run(async () => enterRoom((await api.createRoom(pseudo.trim())).room_id))}
            onJoin={(c) => run(async () => enterRoom(await api.joinRoom(c, pseudo.trim())))}
            onProfile={() => setScreen('profil')}
            onAudio={() => setScreen('audio')}
          />
        )}
        {screen === 'profil' && <Profile pseudo={myName} onBack={() => setScreen('accueil')} />}
        {screen === 'audio' && <AudioSettings onBack={() => setScreen('accueil')} />}

        {screen === 'lobby' && !isOnline && (
          <Lobby
            mode="robots"
            pseudo={pseudo}
            isHost
            settings={settings}
            onSettings={setSettings}
            onBack={() => setScreen('accueil')}
            onLaunch={launchRobots}
          />
        )}
        {screen === 'lobby' && isOnline && room && (
          <Lobby
            mode="enligne"
            code={room.room.code}
            pseudo={pseudo}
            isHost={isHost}
            players={lobbyPlayers}
            settings={onlineSettings}
            onSettings={setDraft}
            busy={busy}
            onKick={(id) => run(() => api.kick(room.room.id, id))}
            onBack={() =>
              run(async () => {
                await api.leaveRoom(room.room.id).catch(() => undefined);
                leaveOnline();
              })
            }
            onLaunch={() =>
              run(async () => {
                if (draft) await api.updateSettings(room.room.id, draft);
                await api.startGame(room.room.id);
              })
            }
          />
        )}

        {screen === 'revelation' && game && viewerId && game.players.some((p) => p.id === viewerId) && (
          <RoleReveal
            game={game}
            viewerId={viewerId}
            onReady={() => {
              if (!isOnline) local.start();
              setScreen('table');
            }}
          />
        )}
        {screen === 'table' && game && viewerId && game.players.some((p) => p.id === viewerId) && (
          <GameTable
            game={game}
            viewerId={viewerId}
            now={isOnline ? online.now : local.now}
            dispatch={isOnline ? online.act : local.act}
            onFinish={() => setScreen('fin')}
            onQuit={() => {
              if (isOnline) leaveOnline();
              else {
                local.reset();
                setScreen('accueil');
              }
            }}
          />
        )}
        {screen === 'fin' && game && (
          <EndGame
            game={game}
            viewerId={viewerId}
            onReplay={() => setScreen('lobby')}
            onHome={() => (isOnline ? leaveOnline() : setScreen('accueil'))}
          />
        )}
        {(screen === 'table' || screen === 'revelation') && isOnline && !game && (
          <div className="page center">
            <p className="muted">Connexion à la partie…</p>
          </div>
        )}
      </main>
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

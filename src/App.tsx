import { useEffect, useState } from 'react';
import { Backdrop } from './components/Backdrop';
import { unlockAudio } from './lib/audio';
import { DEFAULT_SETTINGS, LOBBY_PLAYERS, makeInviteCode } from './lib/mock';
import type { GameSettings, Screen } from './lib/types';
import { BOT_NAMES, VIEWER_ID, useLocalGame } from './game/useLocalGame';
import { Home } from './screens/Home';
import { Lobby, type LobbyMode } from './screens/Lobby';
import { RoleReveal } from './screens/RoleReveal';
import { GameTable } from './screens/GameTable';
import { EndGame } from './screens/EndGame';
import { Profile } from './screens/Profile';
import { AudioSettings } from './screens/AudioSettings';

export function App() {
  const [screen, setScreen] = useState<Screen>('accueil');
  const [pseudo, setPseudo] = useState('');
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('robots');
  const [isHost, setIsHost] = useState(true);
  const [code, setCode] = useState(makeInviteCode);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const local = useLocalGame();
  const myName = pseudo.trim() || 'Vous';

  // Le navigateur n'autorise le son qu'après un premier geste de l'utilisateur.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);

  const openLobby = (mode: LobbyMode, host: boolean, c = makeInviteCode()) => {
    setLobbyMode(mode);
    setIsHost(host);
    setCode(c);
    setScreen('lobby');
  };

  const launch = () => {
    // En ligne (démo) : les places sont tenues par des robots qui portent les noms du salon.
    const lobbyNames = LOBBY_PLAYERS.filter((p) => !p.isMe).map((p) => p.name);
    const botNames = lobbyMode === 'robots' ? BOT_NAMES : [...lobbyNames, ...BOT_NAMES.filter((n) => !lobbyNames.includes(n))];
    local.create(settings, myName, botNames);
    setScreen('revelation');
  };

  const backdropPhase = screen === 'fin' && local.game?.winner === 'village' ? 'jour' : 'nuit';

  return (
    <div className="app">
      {screen !== 'table' && <Backdrop phase={backdropPhase} />}
      <main className="screen" key={screen}>
        {screen === 'accueil' && (
          <Home
            pseudo={pseudo}
            onPseudo={setPseudo}
            onPlay={() => openLobby('robots', true)}
            onCreate={() => openLobby('enligne', true)}
            onJoin={(c) => openLobby('enligne', false, c)}
            onProfile={() => setScreen('profil')}
            onAudio={() => setScreen('audio')}
          />
        )}
        {screen === 'profil' && <Profile pseudo={myName} onBack={() => setScreen('accueil')} />}
        {screen === 'audio' && <AudioSettings onBack={() => setScreen('accueil')} />}
        {screen === 'lobby' && (
          <Lobby
            mode={lobbyMode}
            code={code}
            pseudo={pseudo}
            isHost={isHost}
            onToggleHost={() => setIsHost((h) => !h)}
            settings={settings}
            onSettings={setSettings}
            onBack={() => setScreen('accueil')}
            onLaunch={launch}
          />
        )}
        {screen === 'revelation' && local.game && (
          <RoleReveal
            game={local.game}
            viewerId={VIEWER_ID}
            onReady={() => {
              local.start();
              setScreen('table');
            }}
          />
        )}
        {screen === 'table' && local.game && (
          <GameTable
            game={local.game}
            viewerId={VIEWER_ID}
            now={local.now}
            dispatch={local.act}
            onFinish={() => setScreen('fin')}
            onQuit={() => {
              local.reset();
              setScreen('accueil');
            }}
          />
        )}
        {screen === 'fin' && local.game && (
          <EndGame game={local.game} viewerId={VIEWER_ID} onReplay={() => setScreen('lobby')} onHome={() => setScreen('accueil')} />
        )}
      </main>
    </div>
  );
}

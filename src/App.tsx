import { useEffect, useState } from 'react';
import { Backdrop } from './components/Backdrop';
import { unlockAudio } from './lib/audio';
import { DEFAULT_SETTINGS, makeInviteCode } from './lib/mock';
import type { GameSettings, Screen } from './lib/types';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { RoleReveal } from './screens/RoleReveal';
import { GameTable } from './screens/GameTable';
import { EndGame } from './screens/EndGame';
import { Profile } from './screens/Profile';
import { AudioSettings } from './screens/AudioSettings';

export function App() {
  const [screen, setScreen] = useState<Screen>('accueil');
  const [pseudo, setPseudo] = useState('');
  const [isHost, setIsHost] = useState(true);
  const [code, setCode] = useState(makeInviteCode);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [winner, setWinner] = useState<'village' | 'loups'>('loups');

  // Le navigateur n'autorise le son qu'après un premier geste de l'utilisateur.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);

  const backdropPhase = screen === 'fin' && winner === 'village' ? 'jour' : 'nuit';

  return (
    <div className="app">
      {screen !== 'table' && <Backdrop phase={backdropPhase} />}
      <main className="screen" key={screen}>
        {screen === 'accueil' && (
          <Home
            pseudo={pseudo}
            onPseudo={setPseudo}
            onCreate={() => {
              setIsHost(true);
              setCode(makeInviteCode());
              setScreen('lobby');
            }}
            onJoin={(c) => {
              setIsHost(false);
              setCode(c);
              setScreen('lobby');
            }}
            onPlay={() => {
              setIsHost(false);
              setCode(makeInviteCode());
              setScreen('lobby');
            }}
            onProfile={() => setScreen('profil')}
            onAudio={() => setScreen('audio')}
          />
        )}
        {screen === 'profil' && <Profile pseudo={pseudo} onBack={() => setScreen('accueil')} />}
        {screen === 'audio' && <AudioSettings onBack={() => setScreen('accueil')} />}
        {screen === 'lobby' && (
          <Lobby
            code={code}
            pseudo={pseudo}
            isHost={isHost}
            onToggleHost={() => setIsHost((h) => !h)}
            settings={settings}
            onSettings={setSettings}
            onBack={() => setScreen('accueil')}
            onLaunch={() => setScreen('revelation')}
          />
        )}
        {screen === 'revelation' && <RoleReveal onReady={() => setScreen('table')} />}
        {screen === 'table' && (
          <GameTable
            settings={settings}
            pseudo={pseudo}
            onEnd={(w) => {
              setWinner(w);
              setScreen('fin');
            }}
            onQuit={() => setScreen('accueil')}
          />
        )}
        {screen === 'fin' && (
          <EndGame winner={winner} pseudo={pseudo} onReplay={() => setScreen('lobby')} onHome={() => setScreen('accueil')} />
        )}
      </main>
    </div>
  );
}

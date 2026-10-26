import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { TopBar } from '../components/TopBar';
import { getAudioPrefs, play, setAudioPrefs, subscribeAudio, type Sound } from '../lib/audio';

const TESTS: [Sound, string][] = [
  ['flip', 'Carte'],
  ['night', 'Nuit'],
  ['day', 'Jour'],
  ['vote', 'Vote'],
  ['alert', 'Alerte'],
  ['victory', 'Victoire'],
];

export function AudioSettings({ onBack }: { onBack: () => void }) {
  const [prefs, setPrefs] = useState(getAudioPrefs());
  useEffect(() => subscribeAudio(setPrefs), []);

  return (
    <div className="page">
      <TopBar onBack={onBack} />
      <section className="panel settings audio">
        <h1>Paramètres audio</h1>
        <label className="setting setting--inline">
          <span className="setting__label">Effets sonores</span>
          <span className="switch">
            <input type="checkbox" checked={prefs.enabled} onChange={(e) => setAudioPrefs({ enabled: e.target.checked })} />
            <span className="switch__track" />
          </span>
        </label>
        <label className="setting setting--inline">
          <span className="setting__label">Ambiance nocturne (bourdon discret)</span>
          <span className="switch">
            <input
              type="checkbox"
              checked={prefs.ambience}
              disabled={!prefs.enabled}
              onChange={(e) => setAudioPrefs({ ambience: e.target.checked })}
            />
            <span className="switch__track" />
          </span>
        </label>
        <label className="setting">
          <span className="setting__label">
            Volume <b>{Math.round(prefs.volume * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={prefs.volume}
            disabled={!prefs.enabled}
            onChange={(e) => setAudioPrefs({ volume: Number(e.target.value) })}
          />
        </label>
        <div className="setting">
          <span className="setting__label">Écouter</span>
          <div className="sound-tests">
            {TESTS.map(([s, label]) => (
              <Button key={s} variant="subtle" size="sm" disabled={!prefs.enabled} onClick={() => play(s)}>
                ▶ {label}
              </Button>
            ))}
          </div>
        </div>
        <p className="muted">Les sons sont générés par le navigateur. Vos préférences restent sur cet appareil.</p>
      </section>
    </div>
  );
}

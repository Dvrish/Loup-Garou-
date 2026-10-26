import { useState } from 'react';
import { Button } from '../components/Button';
import { RolePortrait } from '../components/RolePortrait';
import { play } from '../lib/audio';
import { ROLES } from '../game/roles';
import { human } from '../game/helpers';
import type { GameState } from '../game/types';

export function RoleReveal({ game, onReady }: { game: GameState; onReady: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const me = human(game)!;
  const role = ROLES[me.role];
  const packmates = game.players.filter((p) => p.role === 'loup' && !p.isHuman);

  return (
    <div className="reveal">
      <p className="eyebrow">Le meneur distribue les cartes</p>
      <h1 className="reveal__title">{flipped ? 'Votre rôle secret' : 'Touchez la carte pour la retourner'}</h1>
      <p className="muted">Cachez votre écran : personne d’autre ne doit voir votre carte.</p>

      <button
        className={`flip-card ${flipped ? 'is-flipped' : ''}`}
        onClick={() => {
          if (!flipped) play('flip');
          setFlipped(true);
        }}
        aria-label={flipped ? `Votre rôle : ${role.name}` : 'Retourner la carte'}
      >
        <span className="flip-card__inner">
          <span className="flip-card__face flip-card__back">
            <svg viewBox="0 0 200 260" aria-hidden="true">
              <rect width="200" height="260" rx="12" fill="#0b1124" />
              <rect x="10" y="10" width="180" height="240" rx="8" fill="none" stroke="#ff7a1a" strokeOpacity="0.5" />
              <g fill="none" stroke="#f0e2c4" strokeOpacity="0.18">
                {Array.from({ length: 8 }, (_, i) => (
                  <circle key={i} cx="100" cy="130" r={20 + i * 14} />
                ))}
              </g>
              <circle cx="100" cy="130" r="30" fill="#f0e2c4" opacity="0.9" />
              <circle cx="112" cy="122" r="27" fill="#0b1124" />
              <text x="100" y="230" textAnchor="middle" fill="#f0e2c4" fontFamily="Cinzel" fontSize="12" letterSpacing="3">
                VAUCOMBE
              </text>
            </svg>
          </span>
          <span className={`flip-card__face flip-card__front camp-${role.camp}`}>
            <RolePortrait role={role.id} className="flip-card__portrait" title={role.name} />
            <span className="flip-card__name">{role.name}</span>
          </span>
        </span>
      </button>

      <div className={`reveal__info ${flipped ? 'is-visible' : ''}`}>
        <span className={`camp camp--${role.camp}`}>{role.camp === 'loups' ? 'Camp des loups' : 'Camp du village'}</span>
        <p className="reveal__tagline">« {role.tagline} »</p>
        <p>{role.description}</p>
        {role.id === 'loup' && packmates.length === 0 && <p className="pack">Vous êtes le seul loup de la partie.</p>}
        {role.id === 'loup' && packmates.length > 0 && (
          <p className="pack">
            Votre meute : <strong>{packmates.map((p) => p.name).join(', ')}</strong>
          </p>
        )}
        <Button size="lg" onClick={onReady}>
          Je suis prêt
        </Button>
      </div>
    </div>
  );
}

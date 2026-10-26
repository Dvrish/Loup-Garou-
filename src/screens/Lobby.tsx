import { useState } from 'react';
import { Button } from '../components/Button';
import { RolePortrait } from '../components/RolePortrait';
import { TopBar } from '../components/TopBar';
import { play } from '../lib/audio';
import { LOBBY_PLAYERS } from '../lib/mock';
import { ROLE_ORDER, ROLES } from '../game/roles';
import { BOT_NAMES } from '../game/useLocalGame';
import { settingsProblems } from '../game/engine';
import type { GameSettings, Player, RoleId, TieRule } from '../lib/types';

export type LobbyMode = 'robots' | 'enligne';

interface Props {
  mode: LobbyMode;
  code: string;
  pseudo: string;
  isHost: boolean;
  onToggleHost: () => void;
  settings: GameSettings;
  onSettings: (s: GameSettings) => void;
  onBack: () => void;
  onLaunch: () => void;
}

const UNIQUE_ROLES: RoleId[] = ['voyante', 'sorciere', 'chasseur', 'cupidon'];

const TIE_LABELS: Record<TieRule, string> = {
  personne: 'Personne n’est éliminé',
  hasard: 'Tirage au sort parmi les ex æquo',
  revote: 'Second vote entre les ex æquo',
};

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m} min${r ? ` ${r}s` : ''}` : `${r} s`;
}

export function Lobby({ mode, code, pseudo, isHost, onToggleHost, settings, onSettings, onBack, onLaunch }: Props) {
  const [copied, setCopied] = useState(false);
  const robots = mode === 'robots';
  const players: Player[] = robots
    ? [
        { id: 'me', name: pseudo || 'Vous', online: true, isHost: true, isMe: true, alive: true },
        ...BOT_NAMES.slice(0, settings.playerCount - 1).map((name, i) => ({ id: `b${i}`, name, online: true, isBot: true, alive: true })),
      ]
    : LOBBY_PLAYERS.map((p) => (p.isMe ? { ...p, name: pseudo || 'Vous', isHost } : { ...p, isHost: !isHost && p.id === 'p2' }));
  const link = `${window.location.origin}/?code=${code}`;

  const totalRoles = Object.values(settings.roles).reduce((a, b) => a + b, 0);
  const problems = settingsProblems(settings);
  const canLaunch = isHost && problems.length === 0;

  const set = (patch: Partial<GameSettings>) => onSettings({ ...settings, ...patch });
  // Changer le nombre de joueurs ajuste le nombre de simples villageois.
  const setPlayerCount = (count: number) => {
    const diff = count - totalRoles;
    set({ playerCount: count, roles: { ...settings.roles, villageois: Math.max(0, settings.roles.villageois + diff) } });
  };
  const setRole = (role: RoleId, delta: number) => {
    const max = UNIQUE_ROLES.includes(role) ? 1 : 16;
    const next = Math.max(0, Math.min(max, settings.roles[role] + delta));
    play('click');
    set({ roles: { ...settings.roles, [role]: next } });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* presse-papiers indisponible : le lien reste affiché */
    }
    play('message');
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="lobby">
      <TopBar
        onBack={onBack}
        right={
          robots ? undefined : (
            <button className="chip chip--demo" onClick={onToggleHost} title="Démo : changer de point de vue">
              Vue : {isHost ? 'Hôte' : 'Invité'}
            </button>
          )
        }
      />

      {robots ? (
        <section className="panel lobby__intro">
          <span className="eyebrow">Partie d’entraînement</span>
          <h1>Contre les robots de Vaucombe</h1>
          <p className="muted">
            Les autres villageois sont joués par l’ordinateur. Idéal pour apprendre les règles et tester les réglages avant de
            jouer entre amis.
          </p>
        </section>
      ) : (
      <section className="lobby__invite panel">
        <div>
          <span className="eyebrow">Code d’invitation</span>
          <div className="invite-code">{code.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
        </div>
        <div className="lobby__invite-actions">
          <code className="invite-link">{link}</code>
          <Button variant="ghost" size="sm" onClick={copy}>
            {copied ? '✓ Lien copié' : 'Copier le lien'}
          </Button>
        </div>
        <p className="lobby__note">
          Aperçu : le vrai multijoueur arrive à l’étape 5. En attendant, les places sont tenues par des robots.
        </p>
      </section>
      )}

      <div className="lobby__grid">
        <section className="panel lobby__players">
          <header className="panel__head">
            <h2>{robots ? 'Autour du feu' : 'Villageois présents'}</h2>
            <span className="badge">
              {players.length} / {settings.playerCount}
            </span>
          </header>
          <ul className="player-list">
            {players.map((p) => (
              <li key={p.id} className={`player-row ${p.online ? '' : 'is-offline'}`}>
                <span className="avatar">{p.name.charAt(0).toUpperCase()}</span>
                <span className="player-row__name">
                  {p.name}
                  {p.isMe && pseudo && <small> (vous)</small>}
                </span>
                {p.isHost && <span className="tag tag--host">♛ Hôte</span>}
                {p.isBot && <span className="tag">⚙ Robot</span>}
                <span className={`status ${p.online ? 'status--on' : 'status--off'}`}>
                  {p.online ? 'En ligne' : 'Reconnexion…'}
                </span>
              </li>
            ))}
            {!robots && Array.from({ length: Math.max(0, settings.playerCount - players.length) }, (_, i) => (
              <li key={`e${i}`} className="player-row player-row--empty">
                <span className="avatar avatar--empty">?</span>
                <span className="player-row__name">En attente d’un joueur…</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={`panel lobby__settings ${isHost ? '' : 'is-locked'}`}>
          <header className="panel__head">
            <h2>Réglages de la partie</h2>
            {!isHost && <span className="tag">🔒 Réservé à l’hôte</span>}
          </header>
          <fieldset disabled={!isHost} className="settings">
            <div className="setting">
              <span className="setting__label">Mode de discussion</span>
              <div className="mode-picker">
                <button
                  type="button"
                  className={`mode ${settings.discussionMode === 'chat' ? 'is-active' : ''}`}
                  onClick={() => {
                    play('click');
                    set({ discussionMode: 'chat' });
                  }}
                >
                  <span className="mode__icon">💬</span>
                  <strong>En ligne (chat)</strong>
                  <small>Chat public le jour, chat des loups la nuit.</small>
                </button>
                <button
                  type="button"
                  className={`mode ${settings.discussionMode === 'piece' ? 'is-active' : ''}`}
                  onClick={() => {
                    play('click');
                    set({ discussionMode: 'piece' });
                  }}
                >
                  <span className="mode__icon">🗣️</span>
                  <strong>Même pièce (à voix haute)</strong>
                  <small>Pas de chat : grand chrono, on parle autour de la table.</small>
                </button>
              </div>
            </div>

            <label className="setting">
              <span className="setting__label">
                Nombre de joueurs <b>{settings.playerCount}</b>
              </span>
              <input
                type="range"
                min={6}
                max={16}
                value={settings.playerCount}
                onChange={(e) => setPlayerCount(Number(e.target.value))}
              />
            </label>

            <div className="setting">
              <span className="setting__label">
                Rôles <b className={totalRoles === settings.playerCount ? 'ok' : 'warn'}>{totalRoles} / {settings.playerCount}</b>
              </span>
              <div className="role-picker">
                {ROLE_ORDER.map((r) => (
                  <div key={r} className={`role-pick ${settings.roles[r] ? 'is-on' : ''}`}>
                    <RolePortrait role={r} className="role-pick__img" title={ROLES[r].name} />
                    <span className="role-pick__name">{ROLES[r].name}</span>
                    <div className="stepper">
                      <button type="button" onClick={() => setRole(r, -1)} aria-label={`Retirer ${ROLES[r].name}`}>
                        −
                      </button>
                      <span>{settings.roles[r]}</span>
                      <button type="button" onClick={() => setRole(r, 1)} aria-label={`Ajouter ${ROLES[r].name}`}>
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="setting setting--timers">
              {(
                [
                  ['nightSeconds', 'Nuit', 30, 180],
                  ['daySeconds', 'Débat du jour', 60, 600],
                  ['voteSeconds', 'Vote', 20, 120],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  <span className="setting__label">
                    {label} <b>{formatDuration(settings[key])}</b>
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={10}
                    value={settings[key]}
                    onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<GameSettings>)}
                  />
                </label>
              ))}
            </div>

            <label className="setting setting--inline">
              <span className="setting__label">Abstention autorisée au vote</span>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={settings.allowAbstain}
                  onChange={(e) => set({ allowAbstain: e.target.checked })}
                />
                <span className="switch__track" />
              </span>
            </label>

            <label className="setting">
              <span className="setting__label">En cas d’égalité</span>
              <select
                className="input"
                value={settings.tieRule}
                onChange={(e) => set({ tieRule: e.target.value as TieRule })}
              >
                {Object.entries(TIE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        </section>
      </div>

      <footer className="lobby__footer">
        {problems.length > 0 && isHost && <p className="alert">⚠ {problems[0]}</p>}
        {isHost ? (
          <Button size="lg" disabled={!canLaunch} onClick={onLaunch}>
            Lancer la partie
          </Button>
        ) : (
          <p className="muted waiting">
            <span className="dots" /> En attente du lancement par l’hôte…
            <button className="link" onClick={onLaunch}>
              (démo : simuler le lancement)
            </button>
          </p>
        )}
      </footer>
    </div>
  );
}

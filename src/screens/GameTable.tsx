import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Backdrop } from '../components/Backdrop';
import { Button } from '../components/Button';
import { Chat } from '../components/Chat';
import { Modal } from '../components/Modal';
import { RolePortrait } from '../components/RolePortrait';
import { play } from '../lib/audio';
import { isNight } from '../game/engine';
import { byId, loverOf } from '../game/helpers';
import { ROLES } from '../game/roles';
import type { GameState, GPlayer, Phase, PlayerAction } from '../game/types';
import type { RoleId } from '../lib/types';

interface Props {
  game: GameState;
  viewerId: string;
  now: number;
  dispatch: (a: PlayerAction) => void;
  onFinish: () => void;
  onQuit: () => void;
}

const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'Salon',
  attribution: 'Attribution des rôles',
  'resolution-nuit': 'Fin de la nuit',
  verification: 'Vérification',
  'resolution-vote': 'Dépouillement',
  cupidon: 'Nuit — Cupidon',
  voyante: 'Nuit — Voyante',
  loups: 'Nuit — Loups-garous',
  sorciere: 'Nuit — Sorcière',
  aube: 'L’aube',
  chasseur: 'Le dernier tir',
  debat: 'Jour — débat',
  vote: 'Jour — vote',
  verdict: 'Jour — verdict',
  fin: 'Fin de partie',
};

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  u.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function GameTable({ game, viewerId, now, dispatch, onFinish, onQuit }: Props) {
  const me = byId(game, viewerId);
  const night = isNight(game.phase);
  const roomMode = game.settings.discussionMode === 'piece';
  const spectator = !me.alive;
  const [selected, setSelected] = useState<string[]>([]);
  const [witchSave, setWitchSave] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transition, setTransition] = useState<'nuit' | 'jour' | null>('nuit');
  const [autoRead, setAutoRead] = useState(false);
  const prevNight = useRef<boolean | null>(null);
  const prevDeaths = useRef(game.deaths.length);
  const remaining = Math.max(0, Math.ceil((game.phaseEndsAt - now) / 1000));
  const myTurn = game.pending.includes(me.id) && !game.done.includes(me.id);

  // Transition animée à chaque passage nuit ↔ jour
  useEffect(() => {
    if (game.phase === 'fin') return;
    if (prevNight.current === night) return;
    prevNight.current = night;
    setTransition(night ? 'nuit' : 'jour');
    play(night ? 'night' : 'day');
  }, [night, game.phase]);

  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setTransition(null), 2200);
    return () => clearTimeout(t);
  }, [transition]);

  // Nouvelle phase : on efface la sélection
  useEffect(() => {
    setSelected([]);
    setWitchSave(false);
    setConfirmOpen(false);
    if (game.phase === 'vote') play('vote');
    if (game.phase === 'fin') play(game.winner === 'loups' ? 'night' : 'victory');
  }, [game.phase, game.day, game.runoff?.join()]);

  useEffect(() => {
    if (game.deaths.length > prevDeaths.current) play('alert');
    prevDeaths.current = game.deaths.length;
  }, [game.deaths.length]);

  useEffect(() => {
    if (remaining === 10 && myTurn) play('alert');
  }, [remaining, myTurn]);

  useEffect(() => {
    if (roomMode && autoRead) speak(game.announcement);
  }, [game.announcement, roomMode, autoRead]);

  const partner = loverOf(game, me.id);

  const knownRole = (p: GPlayer): RoleId | null => {
    if (p.id === me.id || !p.alive || spectator || game.phase === 'fin') return p.role;
    if (me.role === 'loup' && p.role === 'loup') return 'loup';
    if (p.id === partner) return p.role;
    return me.role === 'voyante' ? (game.seerResults[p.id] ?? null) : null;
  };

  const canTarget = (p: GPlayer) => {
    if (!myTurn || !p.alive) return false;
    switch (game.phase) {
      case 'cupidon':
        return true;
      case 'voyante':
        return p.id !== me.id && !game.seerResults[p.id];
      case 'loups':
        return p.role !== 'loup';
      case 'sorciere':
        return game.witch.death && p.id !== me.id;
      case 'chasseur':
        return p.id !== me.id;
      case 'vote':
        return p.id !== me.id && (!game.runoff || game.runoff.includes(p.id));
      default:
        return false;
    }
  };

  const toggle = (id: string) => {
    play('click');
    if (game.phase === 'cupidon') {
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)));
    } else {
      setSelected((s) => (s[0] === id ? [] : [id]));
    }
  };

  const visible = game.messages.filter((m) => m.at <= now);
  const publicMsgs = visible.filter((m) => m.channel !== 'loups');
  const wolfMsgs = visible.filter((m) => m.channel === 'loups');
  const notes = game.notes.filter((n) => n.playerId === me.id && n.at <= now);

  const voteCount: Record<string, number> = {};
  if (game.phase === 'vote' || game.phase === 'verdict') {
    for (const v of Object.values(game.votes)) {
      if (v.at <= now && v.target !== 'abstention') voteCount[v.target] = (voteCount[v.target] ?? 0) + 1;
    }
  }

  const name = (id: string | null) => (id ? byId(game, id).name : '');
  const sel = selected[0] ?? null;
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');
  const showBigTimer = roomMode && game.phase === 'debat';
  const myVote = game.votes[me.id];
  const urgent = remaining <= 10 && (myTurn || game.phase === 'debat' || game.phase === 'vote');

  const panel = () => {
    if (game.phase === 'fin') {
      return (
        <>
          <h3 className="action-panel__title">🏁 Fin de partie</h3>
          <p className="announce">{game.announcement}</p>
          <Button onClick={onFinish}>Voir le bilan</Button>
        </>
      );
    }

    if (myTurn) {
      switch (game.phase) {
        case 'cupidon':
          return (
            <>
              <h3 className="action-panel__title">💘 Vous êtes Cupidon</h3>
              <p className="muted">Touchez deux joueurs pour les unir (vous pouvez vous choisir).</p>
              <Button disabled={selected.length !== 2} onClick={() => dispatch({ type: 'cupidon', targets: [selected[0], selected[1]] })}>
                {selected.length === 2 ? `Unir ${name(selected[0])} et ${name(selected[1])}` : `Choisissez ${2 - selected.length} joueur(s)`}
              </Button>
            </>
          );
        case 'voyante':
          return (
            <>
              <h3 className="action-panel__title">🔮 Vous êtes la Voyante</h3>
              <p className="muted">Touchez un joueur pour découvrir son rôle.</p>
              <Button disabled={!sel} onClick={() => sel && dispatch({ type: 'voyante', target: sel })}>
                {sel ? `Sonder ${name(sel)}` : 'Choisissez un joueur'}
              </Button>
            </>
          );
        case 'loups':
          return (
            <>
              <h3 className="action-panel__title alert-title">🐺 La meute chasse</h3>
              <p className="muted">Touchez un villageois pour le désigner comme victime.</p>
              {Object.entries(game.wolfVotes).filter(([wolf]) => wolf !== me.id).map(([wolf, target]) => (
                <p key={wolf} className="suggestion">
                  {name(wolf)} propose <strong>{name(target)}</strong>
                </p>
              ))}
              <Button variant="danger" disabled={!sel} onClick={() => sel && dispatch({ type: 'loups', target: sel })}>
                {sel ? `Dévorer ${name(sel)}` : 'Choisissez une victime'}
              </Button>
            </>
          );
        case 'sorciere':
          return (
            <>
              <h3 className="action-panel__title">⚗ Vous êtes la Sorcière</h3>
              <p>
                {game.wolfTarget ? (
                  <>
                    Les loups ont attaqué <strong>{name(game.wolfTarget)}</strong>.
                  </>
                ) : (
                  'Les loups n’ont attaqué personne cette nuit.'
                )}
              </p>
              {game.witch.life && game.wolfTarget && (
                <label className="setting setting--inline">
                  <span className="setting__label">Potion de vie : sauver {name(game.wolfTarget)}</span>
                  <span className="switch">
                    <input type="checkbox" checked={witchSave} onChange={(e) => setWitchSave(e.target.checked)} />
                    <span className="switch__track" />
                  </span>
                </label>
              )}
              <p className="muted">
                {game.witch.death
                  ? sel
                    ? `Potion de mort : ${name(sel)} (touchez à nouveau pour annuler).`
                    : 'Potion de mort : touchez un joueur pour l’empoisonner (facultatif).'
                  : 'Votre potion de mort est déjà utilisée.'}
              </p>
              <Button
                variant={sel ? 'danger' : 'primary'}
                onClick={() => dispatch({ type: 'sorciere', save: witchSave, kill: sel })}
              >
                {witchSave || sel ? 'Utiliser mes potions' : 'Ne rien faire cette nuit'}
              </Button>
            </>
          );
        case 'chasseur':
          return (
            <>
              <h3 className="action-panel__title alert-title">🎯 Votre dernier tir</h3>
              <p className="muted">Vous êtes mort, mais le chasseur ne part jamais seul. Touchez un joueur.</p>
              <div className="action-panel__row">
                <Button variant="danger" disabled={!sel} onClick={() => sel && dispatch({ type: 'chasseur', target: sel })}>
                  {sel ? `Tirer sur ${name(sel)}` : 'Choisissez une cible'}
                </Button>
                <Button variant="subtle" onClick={() => dispatch({ type: 'chasseur', target: null })}>
                  Ne pas tirer
                </Button>
              </div>
            </>
          );
        case 'vote':
          return (
            <>
              <h3 className="action-panel__title">⚖ {game.runoff ? 'Second vote' : 'Qui doit être éliminé ?'}</h3>
              <p className="muted">
                {game.runoff ? `Départagez ${game.runoff.map(name).join(' et ')}.` : 'Touchez un joueur, puis confirmez.'}
              </p>
              <div className="action-panel__row">
                <Button disabled={!sel} onClick={() => setConfirmOpen(true)}>
                  {sel ? `Voter contre ${name(sel)}` : 'Choisissez un joueur'}
                </Button>
                {game.settings.allowAbstain && (
                  <Button variant="subtle" onClick={() => dispatch({ type: 'vote', target: 'abstention' })}>
                    M’abstenir
                  </Button>
                )}
              </div>
            </>
          );
      }
    }

    if (game.pending.includes(me.id) && game.done.includes(me.id)) {
      return (
        <>
          <h3 className="action-panel__title">✓ Action enregistrée</h3>
          <p className="muted">
            {game.phase === 'vote' && myVote
              ? `Votre vote : ${myVote.target === 'abstention' ? 'abstention' : name(myVote.target)}. Les autres votent…`
              : 'En attente des autres joueurs…'}
          </p>
        </>
      );
    }

    const skippable = me.id === game.hostId && (game.phase === 'aube' || game.phase === 'verdict' || game.phase === 'debat');
    return (
      <>
        <h3 className="action-panel__title">{night ? '☾ Le village dort' : '📜 Le meneur'}</h3>
        <p className="announce">{game.announcement}</p>
        {night && !spectator && <p className="muted">Gardez les yeux fermés… votre rôle n’agit pas maintenant.</p>}
        {spectator && game.phase !== 'chasseur' && <p className="muted">Vous êtes mort : vous suivez la partie en spectateur et voyez tous les rôles.</p>}
        {skippable && (
          <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'passer' })}>
            {game.phase === 'debat' ? 'Passer au vote ›' : 'Continuer ›'}
          </Button>
        )}
      </>
    );
  };

  return (
    <div className={`table table--${night ? 'nuit' : 'jour'} ${roomMode ? 'table--room' : ''}`}>
      <Backdrop phase={night ? 'nuit' : 'jour'} />

      {transition && (
        <div className={`phase-transition phase-transition--${transition}`} aria-live="polite">
          <div className="phase-transition__orb" />
          <h2>{transition === 'nuit' ? 'La nuit tombe sur Vaucombe…' : 'Le jour se lève'}</h2>
          <p>{transition === 'nuit' ? `Nuit ${game.day}` : `Jour ${game.day}`}</p>
        </div>
      )}

      <header className="hud">
        <button className="topbar__back" onClick={onQuit}>
          ‹ <span>Quitter</span>
        </button>
        <div className="hud__phase">
          <span className="hud__icon">{night ? '☾' : '☀'}</span>
          <div>
            <span className="eyebrow">{night ? `Nuit ${game.day}` : `Jour ${game.day}`}</span>
            <strong>{game.phase === 'vote' && game.runoff ? 'Jour — second vote' : PHASE_LABEL[game.phase]}</strong>
          </div>
        </div>
        <div
          className={`timer ${urgent ? 'timer--urgent' : ''} ${showBigTimer ? 'timer--hidden-sm' : ''}`}
        >
          {game.phase === 'fin' ? '—' : `${mm}:${ss}`}
        </div>
      </header>

      <div className="table__layout">
        <section className="table__center">
          <div className="me-card">
            <RolePortrait role={me.role} className="me-card__img" title={ROLES[me.role].name} />
            <div>
              <span className="eyebrow">Votre rôle</span>
              <strong>{ROLES[me.role].name}</strong>
              {partner && <small>♥ Amoureux de {name(partner)}</small>}
              {spectator && <small className="warn">Mort — spectateur</small>}
            </div>
          </div>
          <div className="ring">
            {game.players.map((p, i) => {
              const angle = (i / game.players.length) * Math.PI * 2 - Math.PI / 2;
              const targetable = canTarget(p);
              const role = knownRole(p);
              const isSelected = selected.includes(p.id);
              const marked = game.wolfVotes[me.id] === p.id && me.role === 'loup' && night;
              return (
                <button
                  key={p.id}
                  className={`seat ${p.alive ? '' : 'is-dead'} ${p.id === me.id ? 'is-me' : ''} ${isSelected ? 'is-selected' : ''} ${
                    targetable ? 'is-targetable' : ''
                  } ${marked || (myVote && myVote.target === p.id) ? 'is-marked' : ''}`}
                  style={{ '--x': `${50 + Math.cos(angle) * 42}%`, '--y': `${50 + Math.sin(angle) * 40}%` } as CSSProperties}
                  disabled={!targetable}
                  onClick={() => toggle(p.id)}
                >
                  <span className="seat__avatar">
                    {role ? (
                      <RolePortrait role={role} className="seat__portrait" title={ROLES[role].name} />
                    ) : (
                      <span className="seat__initial">{p.name.charAt(0)}</span>
                    )}
                    {voteCount[p.id] ? <span className="seat__votes">{voteCount[p.id]}</span> : null}
                    {p.online === false && p.alive && <span className="seat__offline" title="Hors ligne" />}
                    {game.lovers?.includes(p.id) && (partner || me.role === 'cupidon' || spectator) && <span className="seat__heart">♥</span>}
                  </span>
                  <span className="seat__name">
                    {p.name}
                    {p.id === me.id && me.name !== 'Vous' && ' (vous)'}
                  </span>
                  {!p.alive && <span className="seat__tag">✝ {ROLES[p.role].name}</span>}
                  {p.alive && p.id !== me.id && role && <span className={`seat__tag ${role === 'loup' ? 'seat__tag--wolf' : ''}`}>{ROLES[role].name}</span>}
                </button>
              );
            })}
            <div className="ring__center">
              {showBigTimer ? (
                <div className="big-timer">
                  <span className="eyebrow">Débattez à voix haute</span>
                  <span className={`big-timer__value ${remaining <= 10 ? 'timer--urgent' : ''}`}>
                    {mm}:{ss}
                  </span>
                </div>
              ) : (
                <div className="ring__fire" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="table__side">
          <section className={`panel action-panel ${myTurn ? 'action-panel--turn' : ''}`}>
            {panel()}
            {notes.length > 0 && (
              <div className="notes">
                <span className="eyebrow">Carnet secret</span>
                {notes.slice(-3).map((n, i) => (
                  <p key={i}>{n.text}</p>
                ))}
              </div>
            )}
          </section>

          {roomMode ? (
            <section className="panel room-hint">
              <h3>🗣️ Mode « même pièce »</h3>
              <p className="muted">Pas de chat : on parle autour de la table. Le téléphone sert aux actions secrètes et aux votes.</p>
              <div className="action-panel__row">
                <Button variant="ghost" size="sm" onClick={() => speak(game.announcement)}>
                  🔊 Lire l’annonce
                </Button>
                <label className="setting setting--inline room-hint__auto">
                  <span className="setting__label">Lecture automatique</span>
                  <span className="switch">
                    <input type="checkbox" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} />
                    <span className="switch__track" />
                  </span>
                </label>
              </div>
            </section>
          ) : (
            <Chat
              night={night}
              showWolfTab={me.role === 'loup' || spectator}
              canWritePublic={me.alive && !night && game.phase !== 'fin'}
              canWriteWolves={me.alive && me.role === 'loup' && night}
              pseudo={me.name}
              publicMessages={publicMsgs}
              wolfMessages={wolfMsgs}
              onSend={(channel, text) => dispatch({ type: 'chat', channel, text })}
            />
          )}
        </aside>
      </div>

      {confirmOpen && sel && (
        <Modal title="Confirmer votre vote" onClose={() => setConfirmOpen(false)}>
          <div className="confirm">
            <span className="avatar avatar--lg">{name(sel).charAt(0)}</span>
            <p>
              Vous accusez <strong>{name(sel)}</strong>. Une fois confirmé, votre vote ne pourra plus être modifié.
            </p>
            <div className="action-panel__row">
              <Button variant="subtle" onClick={() => setConfirmOpen(false)}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  dispatch({ type: 'vote', target: sel });
                  setConfirmOpen(false);
                }}
              >
                Confirmer le vote
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

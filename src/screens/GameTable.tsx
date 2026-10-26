import { useEffect, useState, type CSSProperties } from 'react';
import { Backdrop } from '../components/Backdrop';
import { Button } from '../components/Button';
import { Chat } from '../components/Chat';
import { Modal } from '../components/Modal';
import { RolePortrait } from '../components/RolePortrait';
import { play } from '../lib/audio';
import { CHAT_LOUPS, CHAT_PUBLIC, MY_ROLE, ROLES, TABLE_PLAYERS } from '../lib/mock';
import type { ChatMessage, GameSettings } from '../lib/types';

type Phase = 'nuit' | 'jour' | 'vote';

interface Props {
  settings: GameSettings;
  pseudo: string;
  onEnd: (winner: 'village' | 'loups') => void;
  onQuit: () => void;
}

const PHASE_LABEL: Record<Phase, string> = { nuit: 'Nuit', jour: 'Jour — débat', vote: 'Jour — vote' };
const ANNOUNCE = 'Le village se réveille. Ondine a été retrouvée sans vie cette nuit. Elle était villageoise.';

function useCountdown(endsAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function GameTable({ settings, pseudo, onEnd, onQuit }: Props) {
  const [phase, setPhase] = useState<Phase>('nuit');
  const [day, setDay] = useState(1);
  const [transition, setTransition] = useState<Phase | null>('nuit');
  // Comme le futur « phase_ends_at » côté serveur : on stocke l'heure de fin, pas un compte à rebours.
  const [endsAt, setEndsAt] = useState(() => Date.now() + settings.nightSeconds * 1000);
  const [selected, setSelected] = useState<string | null>(null);
  const [nightChoice, setNightChoice] = useState<string | null>(null);
  const [vote, setVote] = useState<string | 'abstention' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publicMsgs, setPublicMsgs] = useState<ChatMessage[]>(CHAT_PUBLIC);
  const [wolfMsgs, setWolfMsgs] = useState<ChatMessage[]>(CHAT_LOUPS);
  const remaining = useCountdown(endsAt);

  const isWolf = MY_ROLE === 'loup';
  const roomMode = settings.discussionMode === 'piece';
  const players = TABLE_PLAYERS.map((p) => (p.isMe ? { ...p, name: pseudo || 'Vous' } : p));
  const me = players.find((p) => p.isMe)!;

  useEffect(() => {
    play('night');
    const t = setTimeout(() => setTransition(null), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (remaining === 10) play('alert');
  }, [remaining]);

  const goTo = (next: Phase) => {
    setSelected(null);
    if (next !== 'vote') {
      setTransition(next);
      play(next === 'nuit' ? 'night' : 'day');
      setTimeout(() => setTransition(null), 2200);
    } else {
      play('vote');
    }
    if (next === 'nuit') {
      setDay((d) => d + 1);
      setNightChoice(null);
      setVote(null);
    }
    setPhase(next);
    const secs = next === 'nuit' ? settings.nightSeconds : next === 'jour' ? settings.daySeconds : settings.voteSeconds;
    setEndsAt(Date.now() + secs * 1000);
  };

  const nextPhase = () => goTo(phase === 'nuit' ? 'jour' : phase === 'jour' ? 'vote' : 'nuit');

  const canTarget = (id: string) => {
    const p = players.find((x) => x.id === id)!;
    if (!p.alive) return false;
    if (phase === 'nuit') return isWolf && p.role !== 'loup' && !nightChoice;
    if (phase === 'vote') return !p.isMe && !vote;
    return false;
  };

  // Votes fictifs affichés une fois le vôtre confirmé
  const mockVotes: Record<string, number> = {};
  if (vote) {
    Object.assign(mockVotes, { p2: 3, p3: 2 });
    if (vote !== 'abstention') mockVotes[vote] = (mockVotes[vote] ?? 0) + 1;
  }

  const speak = () => {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(ANNOUNCE);
    u.lang = 'fr-FR';
    u.rate = 0.92;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const night = phase === 'nuit';
  const mm = String(Math.floor(remaining / 60)).padStart(1, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const selectedPlayer = players.find((p) => p.id === selected);

  return (
    <div className={`table table--${night ? 'nuit' : 'jour'} ${roomMode ? 'table--room' : ''}`}>
      <Backdrop phase={night ? 'nuit' : 'jour'} />

      {transition && (
        <div className={`phase-transition phase-transition--${transition}`} aria-live="polite">
          <div className="phase-transition__orb" />
          <h2>{transition === 'nuit' ? 'La nuit tombe sur Vaucombe…' : 'Le jour se lève'}</h2>
          <p>{transition === 'nuit' ? `Nuit ${day}` : `Jour ${day}`}</p>
        </div>
      )}

      <header className="hud">
        <button className="topbar__back" onClick={onQuit}>
          ‹ <span>Quitter</span>
        </button>
        <div className="hud__phase">
          <span className="hud__icon">{night ? '☾' : '☀'}</span>
          <div>
            <span className="eyebrow">{night ? `Nuit ${day}` : `Jour ${day}`}</span>
            <strong>{PHASE_LABEL[phase]}</strong>
          </div>
        </div>
        <div className={`timer ${remaining <= 10 ? 'timer--urgent' : ''} ${roomMode && phase === 'jour' ? 'timer--hidden-sm' : ''}`}>
          {mm}:{ss}
        </div>
      </header>

      <div className="table__layout">
        <section className="table__center">
          <div className="ring">
            {players.map((p, i) => {
              const angle = (i / players.length) * Math.PI * 2 - Math.PI / 2;
              const targetable = canTarget(p.id);
              const showRole = !p.alive || p.isMe || (isWolf && p.role === 'loup');
              return (
                <button
                  key={p.id}
                  className={`seat ${p.alive ? '' : 'is-dead'} ${p.isMe ? 'is-me' : ''} ${selected === p.id ? 'is-selected' : ''} ${
                    targetable ? 'is-targetable' : ''
                  } ${nightChoice === p.id || vote === p.id ? 'is-marked' : ''}`}
                  style={{ '--x': `${50 + Math.cos(angle) * 42}%`, '--y': `${50 + Math.sin(angle) * 40}%` } as CSSProperties}
                  disabled={!targetable}
                  onClick={() => {
                    play('click');
                    setSelected(p.id);
                  }}
                >
                  <span className="seat__avatar">
                    {showRole && p.role ? (
                      <RolePortrait role={p.role} className="seat__portrait" title={ROLES[p.role].name} />
                    ) : (
                      <span className="seat__initial">{p.name.charAt(0)}</span>
                    )}
                    {!p.online && p.alive && <span className="seat__offline" title="Déconnecté" />}
                    {mockVotes[p.id] ? <span className="seat__votes">{mockVotes[p.id]}</span> : null}
                  </span>
                  <span className="seat__name">
                    {p.name}
                    {p.isMe && pseudo && ' (vous)'}
                  </span>
                  {!p.alive && <span className="seat__tag">✝ {p.role ? ROLES[p.role].name : ''}</span>}
                  {p.alive && isWolf && p.role === 'loup' && !p.isMe && <span className="seat__tag seat__tag--wolf">Meute</span>}
                </button>
              );
            })}
            <div className="ring__center">
              {roomMode && phase === 'jour' ? (
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
          <section className="panel action-panel">
            {phase === 'nuit' && isWolf && (
              <>
                <h3 className="action-panel__title alert-title">🐺 La meute chasse</h3>
                {nightChoice ? (
                  <p>
                    Vous avez désigné <strong>{players.find((p) => p.id === nightChoice)?.name}</strong>. Attendez le reste de la
                    meute…
                  </p>
                ) : (
                  <>
                    <p className="muted">Touchez un villageois sur la table pour le désigner comme victime.</p>
                    <Button
                      variant="danger"
                      disabled={!selected}
                      onClick={() => {
                        setNightChoice(selected);
                        play('vote');
                      }}
                    >
                      {selectedPlayer ? `Dévorer ${selectedPlayer.name}` : 'Choisissez une victime'}
                    </Button>
                  </>
                )}
              </>
            )}

            {phase === 'jour' && (
              <>
                <h3 className="action-panel__title">📜 Annonce du meneur</h3>
                <p className="announce">{ANNOUNCE}</p>
                {roomMode && (
                  <Button variant="ghost" size="sm" onClick={speak}>
                    🔊 Lire à voix haute
                  </Button>
                )}
              </>
            )}

            {phase === 'vote' && (
              <>
                <h3 className="action-panel__title">⚖ Qui doit être éliminé ?</h3>
                {vote ? (
                  <p>
                    Vote enregistré :{' '}
                    <strong>{vote === 'abstention' ? 'abstention' : players.find((p) => p.id === vote)?.name}</strong>. En attente
                    des autres villageois…
                  </p>
                ) : (
                  <>
                    <p className="muted">Touchez un joueur sur la table, puis confirmez.</p>
                    <div className="action-panel__row">
                      <Button disabled={!selected} onClick={() => setConfirmOpen(true)}>
                        {selectedPlayer ? `Voter contre ${selectedPlayer.name}` : 'Choisissez un joueur'}
                      </Button>
                      {settings.allowAbstain && (
                        <Button variant="subtle" onClick={() => setVote('abstention')}>
                          M’abstenir
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          {roomMode ? (
            <section className="panel room-hint">
              <h3>🗣️ Mode « même pièce »</h3>
              <p className="muted">
                Pas de chat : parlez autour de la table. Votre téléphone sert aux actions de nuit et aux votes, en secret.
              </p>
            </section>
          ) : (
            <Chat
              phase={phase}
              isWolf={isWolf && me.alive}
              pseudo={me.name}
              publicMessages={publicMsgs}
              wolfMessages={wolfMsgs}
              onSend={(channel, text) => {
                const msg: ChatMessage = { id: crypto.randomUUID(), author: me.name, text, channel };
                if (channel === 'public') setPublicMsgs((m) => [...m, msg]);
                else setWolfMsgs((m) => [...m, msg]);
              }}
            />
          )}

          <section className="demo-bar">
            <span className="eyebrow">Démo (sera piloté par le serveur)</span>
            <div className="action-panel__row">
              <Button variant="ghost" size="sm" onClick={nextPhase}>
                Phase suivante ›
              </Button>
              <Button variant="subtle" size="sm" onClick={() => onEnd('village')}>
                Victoire village
              </Button>
              <Button variant="subtle" size="sm" onClick={() => onEnd('loups')}>
                Victoire loups
              </Button>
            </div>
          </section>
        </aside>
      </div>

      {confirmOpen && selectedPlayer && (
        <Modal title="Confirmer votre vote" onClose={() => setConfirmOpen(false)}>
          <div className="confirm">
            <span className="avatar avatar--lg">{selectedPlayer.name.charAt(0)}</span>
            <p>
              Vous accusez <strong>{selectedPlayer.name}</strong>. Une fois confirmé, votre vote ne pourra plus être modifié.
            </p>
            <div className="action-panel__row">
              <Button variant="subtle" onClick={() => setConfirmOpen(false)}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setVote(selectedPlayer.id);
                  setConfirmOpen(false);
                  play('vote');
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

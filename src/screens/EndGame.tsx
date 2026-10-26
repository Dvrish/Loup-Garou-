import { useEffect } from 'react';
import { Button } from '../components/Button';
import { RolePortrait } from '../components/RolePortrait';
import { play } from '../lib/audio';
import { recordGame } from '../lib/stats';
import { campOf, human } from '../game/helpers';
import { ROLES } from '../game/roles';
import type { GameState, Winner } from '../game/types';

interface Props {
  game: GameState;
  onReplay: () => void;
  onHome: () => void;
}

const TITLES: Record<Winner, string> = {
  village: 'Le village est sauvé',
  loups: 'Les loups ont dévoré Vaucombe',
  amoureux: 'L’amour a triomphé',
  aucun: 'Vaucombe est désert',
};

const recorded = new WeakSet<GameState>();

export function EndGame({ game, onReplay, onHome }: Props) {
  const me = human(game)!;
  const winner = game.winner ?? 'aucun';
  const iWon = campOf(game, me.id) === winner;

  useEffect(() => {
    play(iWon ? 'victory' : 'alert');
    if (!recorded.has(game)) {
      recorded.add(game);
      recordGame({ won: iWon, role: me.role, players: game.players.length, date: new Date().toISOString() });
    }
  }, [game, iWon, me.role]);

  return (
    <div className={`end end--${winner}`}>
      <div className="end__banner">
        <span className="eyebrow">
          Fin de partie · {game.day} nuit{game.day > 1 ? 's' : ''}
        </span>
        <h1>{TITLES[winner]}</h1>
        <p className={`end__verdict ${iWon ? 'is-win' : 'is-loss'}`}>{iWon ? 'Victoire !' : 'Défaite…'}</p>
        <p className="muted">{game.announcement}</p>
      </div>

      <section className="panel end__roster">
        <h2>Tous les rôles révélés</h2>
        <ul className="roster">
          {game.players.map((p) => {
            const death = game.deaths.find((d) => d.id === p.id);
            return (
              <li key={p.id} className={`roster__item ${p.alive ? '' : 'is-dead'} camp-${ROLES[p.role].camp}`}>
                <RolePortrait role={p.role} className="roster__img" title={ROLES[p.role].name} />
                <div>
                  <strong>
                    {p.name}
                    {p.isHuman && ' (vous)'}
                    {game.lovers?.includes(p.id) && <span title="Amoureux"> ♥</span>}
                  </strong>
                  <span>{ROLES[p.role].name}</span>
                  <small>{p.alive ? 'Survivant' : `Mort au jour ${death?.day ?? '?'}`}</small>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="end__actions">
        <Button size="lg" onClick={onReplay}>
          Rejouer
        </Button>
        <Button variant="ghost" onClick={onHome}>
          Retour à l’accueil
        </Button>
      </div>
    </div>
  );
}

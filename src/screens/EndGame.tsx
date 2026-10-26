import { useEffect } from 'react';
import { Button } from '../components/Button';
import { RolePortrait } from '../components/RolePortrait';
import { play } from '../lib/audio';
import { MY_ROLE, ROLES, TABLE_PLAYERS } from '../lib/mock';

interface Props {
  winner: 'village' | 'loups';
  pseudo: string;
  onReplay: () => void;
  onHome: () => void;
}

export function EndGame({ winner, pseudo, onReplay, onHome }: Props) {
  const iWon = ROLES[MY_ROLE].camp === winner;
  useEffect(() => {
    play(iWon ? 'victory' : 'alert');
  }, [iWon]);

  return (
    <div className={`end end--${winner}`}>
      <div className="end__banner">
        <span className="eyebrow">Fin de partie · 3 nuits, 3 jours</span>
        <h1>{winner === 'village' ? 'Le village est sauvé' : 'Les loups ont dévoré Vaucombe'}</h1>
        <p className={`end__verdict ${iWon ? 'is-win' : 'is-loss'}`}>{iWon ? 'Victoire !' : 'Défaite…'}</p>
      </div>

      <section className="panel end__roster">
        <h2>Tous les rôles révélés</h2>
        <ul className="roster">
          {TABLE_PLAYERS.map((p) => (
            <li key={p.id} className={`roster__item ${p.alive ? '' : 'is-dead'} camp-${p.role && ROLES[p.role].camp}`}>
              {p.role && <RolePortrait role={p.role} className="roster__img" title={ROLES[p.role].name} />}
              <div>
                <strong>
                  {p.isMe ? pseudo || 'Vous' : p.name}
                  {p.lover && <span title="Amoureux"> ♥</span>}
                </strong>
                <span>{p.role && ROLES[p.role].name}</span>
                <small>{p.alive ? 'Survivant' : 'Mort'}</small>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="end__actions">
        <Button size="lg" onClick={onReplay}>
          Rejouer avec ce groupe
        </Button>
        <Button variant="ghost" onClick={onHome}>
          Retour à l’accueil
        </Button>
      </div>
    </div>
  );
}

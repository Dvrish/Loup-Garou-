import { useState } from 'react';
import { Button } from '../components/Button';
import { RolePortrait } from '../components/RolePortrait';
import type { CheckStep } from '../lib/supabase';
import { TopBar } from '../components/TopBar';
import { loadStats } from '../lib/stats';
import { ROLE_ORDER, ROLES } from '../game/roles';
import type { RoleId } from '../lib/types';

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function Profile({ pseudo, onBack }: { pseudo: string; onBack: () => void }) {
  const [check, setCheck] = useState<CheckStep[] | null>(null);
  const [checking, setChecking] = useState(false);
  const games = loadStats();
  const wins = games.filter((g) => g.won).length;
  const rate = games.length ? Math.round((wins / games.length) * 100) : 0;
  const byRole = Object.fromEntries(ROLE_ORDER.map((r) => [r, games.filter((g) => g.role === r).length])) as Record<RoleId, number>;
  const max = Math.max(1, ...Object.values(byRole));
  const favorite = games.length ? ROLE_ORDER.reduce((a, b) => (byRole[b] > byRole[a] ? b : a)) : 'villageois';

  return (
    <div className="page">
      <TopBar onBack={onBack} />
      <section className="panel profile__head">
        <RolePortrait role={favorite} className="profile__portrait" />
        <div>
          <span className="eyebrow">Profil</span>
          <h1>{pseudo}</h1>
          <p className="muted">{games.length ? `Rôle le plus joué : ${ROLES[favorite].name}` : 'Aucune partie jouée pour l’instant.'}</p>
        </div>
      </section>

      <div className="stats">
        <div className="stat panel">
          <span className="stat__value">{games.length}</span>
          <span className="stat__label">Parties</span>
        </div>
        <div className="stat panel">
          <span className="stat__value">{wins}</span>
          <span className="stat__label">Victoires</span>
        </div>
        <div className="stat panel">
          <span className="stat__value">{rate}%</span>
          <span className="stat__label">Taux de victoire</span>
        </div>
      </div>

      <section className="panel">
        <h2>Rôles joués</h2>
        <ul className="bars">
          {ROLE_ORDER.map((r) => (
            <li key={r}>
              <span>{ROLES[r].name}</span>
              <span className="bars__track">
                <span className="bars__fill" style={{ width: `${(byRole[r] / max) * 100}%` }} />
              </span>
              <b>{byRole[r]}</b>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Dernières parties</h2>
        {games.length === 0 && <p className="muted">Jouez une partie contre les robots pour remplir votre historique.</p>}
        <ul className="history">
          {games.slice(0, 8).map((h, i) => (
            <li key={i}>
              <RolePortrait role={h.role} className="history__img" />
              <div>
                <strong className={h.won ? 'ok' : 'warn'}>{h.won ? 'Victoire' : 'Défaite'}</strong>
                <span className="muted">
                  {ROLES[h.role].name} · {h.players} joueurs
                </span>
              </div>
              <small className="muted">{when(h.date)}</small>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2>Serveur en ligne</h2>
        <p className="muted">Vérifie que la base de données Supabase est prête pour le multijoueur.</p>
        <Button
          variant="ghost"
          size="sm"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            // Chargé à la demande : le client Supabase n'alourdit pas le reste du jeu.
            const { checkServer } = await import('../lib/supabase');
            setCheck(await checkServer(pseudo));
            setChecking(false);
          }}
        >
          {checking ? 'Vérification…' : 'Vérifier la connexion'}
        </Button>
        {check && (
          <ul className="server-check">
            {check.map((c) => (
              <li key={c.label} className={c.ok ? 'ok' : c.ok === false ? 'warn' : 'muted'}>
                {c.ok ? '✓' : c.ok === false ? '✗' : '…'} {c.label}
                {c.detail && <small>{c.detail}</small>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted center">Statistiques enregistrées sur cet appareil uniquement (elles suivront votre compte à l’étape 4).</p>
    </div>
  );
}

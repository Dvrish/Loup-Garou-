import { RolePortrait } from '../components/RolePortrait';
import { TopBar } from '../components/TopBar';
import { PROFILE, ROLE_ORDER, ROLES } from '../lib/mock';

export function Profile({ pseudo, onBack }: { pseudo: string; onBack: () => void }) {
  const max = Math.max(...Object.values(PROFILE.byRole));
  const rate = Math.round((PROFILE.wins / PROFILE.games) * 100);
  return (
    <div className="page">
      <TopBar onBack={onBack} />
      <section className="panel profile__head">
        <RolePortrait role={PROFILE.favoriteRole} className="profile__portrait" />
        <div>
          <span className="eyebrow">Profil</span>
          <h1>{pseudo || 'Vous'}</h1>
          <p className="muted">Rôle favori : {ROLES[PROFILE.favoriteRole].name}</p>
        </div>
      </section>

      <div className="stats">
        <div className="stat panel">
          <span className="stat__value">{PROFILE.games}</span>
          <span className="stat__label">Parties</span>
        </div>
        <div className="stat panel">
          <span className="stat__value">{PROFILE.wins}</span>
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
                <span className="bars__fill" style={{ width: `${(PROFILE.byRole[r] / max) * 100}%` }} />
              </span>
              <b>{PROFILE.byRole[r]}</b>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Dernières parties</h2>
        <ul className="history">
          {PROFILE.history.map((h, i) => (
            <li key={i}>
              <RolePortrait role={h.role} className="history__img" />
              <div>
                <strong className={h.result === 'victoire' ? 'ok' : 'warn'}>{h.result === 'victoire' ? 'Victoire' : 'Défaite'}</strong>
                <span className="muted">
                  {ROLES[h.role].name} · {h.players} joueurs
                </span>
              </div>
              <small className="muted">{h.date}</small>
            </li>
          ))}
        </ul>
      </section>
      <p className="muted center">Statistiques fictives — elles seront enregistrées à partir de l’étape 4.</p>
    </div>
  );
}

import { useState } from 'react';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Modal } from '../components/Modal';
import { RolePortrait } from '../components/RolePortrait';
import { play } from '../lib/audio';

interface Props {
  /** Code reçu dans le lien d'invitation (?code=…) : la fenêtre « Rejoindre » s'ouvre directement. */
  initialCode?: string | null;
  busy?: boolean;
  pseudo: string;
  onPseudo: (p: string) => void;
  onPlay: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onProfile: () => void;
  onAudio: () => void;
}

export function Home({ initialCode, busy, pseudo, onPseudo, onPlay, onCreate, onJoin, onProfile, onAudio }: Props) {
  const [joinOpen, setJoinOpen] = useState(!!initialCode);
  const [code, setCode] = useState((initialCode ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5));
  const [needPseudo, setNeedPseudo] = useState(false);
  /** Le jeu en ligne a besoin d'un pseudo : on le demande avant de continuer. */
  const withPseudo = (fn: () => void) => () => {
    if (pseudo.trim()) fn();
    else {
      setNeedPseudo(true);
      play('alert');
    }
  };
  const valid = /^[A-Z]{5}$/.test(code);

  return (
    <div className="home">
      <div className="home__cards" aria-hidden="true">
        <RolePortrait role="voyante" className="home__card home__card--1" />
        <RolePortrait role="loup" className="home__card home__card--2" />
        <RolePortrait role="sorciere" className="home__card home__card--3" />
      </div>

      <div className="home__hero">
        <Logo />
        <p className="home__tagline">
          La nuit tombe sur Vaucombe. Parmi vous, des loups. <em>Saurez-vous les démasquer avant l’aube ?</em>
        </p>

        <label className="field home__pseudo">
          <span className="field__label">Votre pseudo</span>
          <input
            className="input"
            value={pseudo}
            maxLength={16}
            onChange={(e) => {
              onPseudo(e.target.value);
              setNeedPseudo(false);
            }}
            placeholder="Ex. : Margot"
          />
        </label>
        {needPseudo && <p className="alert home__error">Choisissez d’abord un pseudo pour jouer en ligne.</p>}

        <nav className="home__menu">
          <Button size="lg" className="btn--stack" onClick={onPlay}>
            Jouer
            <small>Partie d’entraînement contre des robots</small>
          </Button>
          <div className="home__row">
            <Button variant="ghost" disabled={busy} onClick={withPseudo(onCreate)}>
              Créer une partie
            </Button>
            <Button variant="ghost" onClick={() => setJoinOpen(true)}>
              Rejoindre
            </Button>
          </div>
          <div className="home__row">
            <Button variant="subtle" onClick={onProfile}>
              ◈ Profil &amp; statistiques
            </Button>
            <Button variant="subtle" onClick={onAudio}>
              ♪ Paramètres audio
            </Button>
          </div>
        </nav>
        <p className="home__foot">De 6 à 16 joueurs · « Créer une partie » pour jouer entre amis, chacun sur son téléphone.</p>
      </div>

      {joinOpen && (
        <Modal title="Rejoindre une partie" onClose={() => setJoinOpen(false)}>
          <p className="muted">Saisissez le code d’invitation à 5 lettres donné par l’hôte.</p>
          <form
            className="join"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && pseudo.trim()) onJoin(code);
              else play('alert');
            }}
          >
            <label className="field">
              <span className="field__label">Votre pseudo</span>
              <input className="input" value={pseudo} maxLength={16} onChange={(e) => onPseudo(e.target.value)} placeholder="Ex. : Margot" />
            </label>
            <input
              className="input input--code"
              value={code}
              autoFocus
              maxLength={5}
              inputMode="text"
              autoCapitalize="characters"
              placeholder="ABCDE"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
            <Button type="submit" disabled={!valid || !pseudo.trim() || busy}>
              {busy ? 'Connexion…' : 'Entrer dans le village'}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

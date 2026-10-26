import { useState } from 'react';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Modal } from '../components/Modal';
import { RolePortrait } from '../components/RolePortrait';
import { play } from '../lib/audio';

interface Props {
  pseudo: string;
  onPseudo: (p: string) => void;
  onPlay: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onProfile: () => void;
  onAudio: () => void;
}

export function Home({ pseudo, onPseudo, onPlay, onCreate, onJoin, onProfile, onAudio }: Props) {
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
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
            onChange={(e) => onPseudo(e.target.value)}
            placeholder="Ex. : Margot"
          />
        </label>

        <nav className="home__menu">
          <Button size="lg" className="btn--stack" onClick={onPlay}>
            Jouer
            <small>Partie d’entraînement contre des robots</small>
          </Button>
          <div className="home__row">
            <Button variant="ghost" onClick={onCreate}>
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
        <p className="home__foot">De 6 à 16 joueurs · Le multijoueur en ligne arrive bientôt : pour l’instant, les autres places sont tenues par des robots.</p>
      </div>

      {joinOpen && (
        <Modal title="Rejoindre une partie" onClose={() => setJoinOpen(false)}>
          <p className="muted">Saisissez le code d’invitation à 5 lettres donné par l’hôte.</p>
          <form
            className="join"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) onJoin(code);
              else play('alert');
            }}
          >
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
            <Button type="submit" disabled={!valid}>
              Entrer dans le village
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

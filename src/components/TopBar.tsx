import type { ReactNode } from 'react';
import { Logo } from './Logo';

export function TopBar({ onBack, right }: { onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack ? (
        <button className="topbar__back" onClick={onBack} aria-label="Retour">
          ‹ <span>Retour</span>
        </button>
      ) : (
        <span />
      )}
      <Logo compact />
      <div className="topbar__right">{right}</div>
    </header>
  );
}

// Logo original : lune croissante, silhouette de loup hurlant et nom du jeu.
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? 'logo--compact' : ''}`}>
      <svg viewBox="0 0 160 120" className="logo__mark" aria-hidden="true">
        <defs>
          <radialGradient id="logo-moon" cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#fff6df" />
            <stop offset="1" stopColor="#e2c99a" />
          </radialGradient>
          <filter id="logo-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <mask id="logo-crescent">
            <rect width="160" height="120" fill="#fff" />
            <circle cx="96" cy="44" r="36" fill="#000" />
          </mask>
        </defs>
        <circle cx="80" cy="54" r="44" fill="#ff7a1a" opacity="0.25" filter="url(#logo-glow)" mask="url(#logo-crescent)" />
        <circle cx="80" cy="54" r="40" fill="url(#logo-moon)" mask="url(#logo-crescent)" />
        {/* Loup hurlant sur un rocher */}
        <path
          d="M30 112 L44 96 L52 98 L58 86 L60 74 L56 64 L62 66 L66 56 L70 50 L76 40 L74 52 L82 50 L80 58 L74 64 L76 76 L86 84 L100 86 L112 94 L124 96 L136 112 Z"
          fill="#05070f"
        />
        <path d="M18 116 Q80 100 142 116 L142 120 L18 120 Z" fill="#05070f" />
        <circle cx="70" cy="56" r="1.6" fill="#ff7a1a" />
      </svg>
      <div className="logo__text">
        <span className="logo__kicker">Les Loups de</span>
        <span className="logo__title">Vaucombe</span>
      </div>
    </div>
  );
}

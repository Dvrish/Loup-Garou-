// Décor animé commun : ciel, étoiles, brume et forêt.
import { useMemo } from 'react';

export function Backdrop({ phase = 'nuit' }: { phase?: 'nuit' | 'jour' }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 65,
        s: Math.random() * 1.6 + 0.4,
        d: Math.random() * 5,
      })),
    [],
  );
  return (
    <div className={`backdrop backdrop--${phase}`} aria-hidden="true">
      <div className="backdrop__sky" />
      <div className="backdrop__sky backdrop__sky--day" />
      <div className="backdrop__stars">
        {stars.map((s) => (
          <span
            key={s.id}
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }}
          />
        ))}
      </div>
      <div className="backdrop__celestial">
        <div className="backdrop__moon" />
        <div className="backdrop__sun" />
      </div>
      <div className="backdrop__fog" />
      <svg className="backdrop__forest" viewBox="0 0 1200 200" preserveAspectRatio="none">
        <path
          d="M0 200 L0 120 L30 70 L60 120 L80 90 L110 140 L140 60 L170 130 L200 100 L230 150 L260 80 L290 140 L330 110 L360 150 L400 70 L440 140 L470 100 L500 150 L540 90 L580 150 L620 120 L660 160 L700 80 L740 140 L780 110 L820 150 L860 70 L900 140 L940 100 L980 150 L1020 90 L1060 140 L1100 110 L1140 150 L1170 80 L1200 130 L1200 200 Z"
        />
      </svg>
    </div>
  );
}

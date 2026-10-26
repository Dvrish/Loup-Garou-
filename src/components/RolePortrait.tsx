// Portraits originaux des six rôles, dessinés entièrement en SVG.
import { useId } from 'react';
import type { RoleId } from '../lib/types';

interface Props {
  role: RoleId;
  className?: string;
  title?: string;
}

const PALETTE: Record<RoleId, { top: string; bottom: string; glow: string }> = {
  villageois: { top: '#2a2216', bottom: '#0a0c16', glow: '#ff9a3c' },
  loup: { top: '#1a2347', bottom: '#05070f', glow: '#ff7a1a' },
  voyante: { top: '#2b1d52', bottom: '#070917', glow: '#7fd7ff' },
  sorciere: { top: '#14301f', bottom: '#060a0d', glow: '#7dff9a' },
  chasseur: { top: '#2b1c14', bottom: '#07090f', glow: '#e5484d' },
  cupidon: { top: '#3d1430', bottom: '#0b0712', glow: '#ff7aa8' },
};

export function RolePortrait({ role, className, title }: Props) {
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${role}-${name}-${uid}`;
  const p = PALETTE[role];

  return (
    <svg
      viewBox="0 0 200 260"
      className={className}
      role="img"
      aria-label={title ?? role}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={id('bg')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.top} />
          <stop offset="1" stopColor={p.bottom} />
        </linearGradient>
        <radialGradient id={id('halo')} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor={p.glow} stopOpacity="0.35" />
          <stop offset="1" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
        <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={id('orb')} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#e9fbff" />
          <stop offset="0.35" stopColor="#7fd7ff" />
          <stop offset="1" stopColor="#3b2a8f" />
        </radialGradient>
        <radialGradient id={id('moon')} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff6df" />
          <stop offset="1" stopColor="#d9c39a" />
        </radialGradient>
      </defs>

      <rect width="200" height="260" fill={`url(#${id('bg')})`} />
      <rect width="200" height="260" fill={`url(#${id('halo')})`} />
      <g fill="#f0e2c4" opacity="0.55">
        <circle cx="22" cy="28" r="1" />
        <circle cx="170" cy="40" r="1.2" />
        <circle cx="150" cy="18" r="0.8" />
        <circle cx="38" cy="70" r="0.7" />
        <circle cx="182" cy="92" r="0.9" />
      </g>

      {role === 'loup' && <Wolf id={id} glow={p.glow} />}
      {role === 'villageois' && <Villager id={id} glow={p.glow} />}
      {role === 'voyante' && <Seer id={id} glow={p.glow} />}
      {role === 'sorciere' && <Witch id={id} glow={p.glow} />}
      {role === 'chasseur' && <Hunter id={id} glow={p.glow} />}
      {role === 'cupidon' && <Cupid id={id} glow={p.glow} />}

      {/* Cadre ornemental */}
      <rect x="5" y="5" width="190" height="250" rx="10" fill="none" stroke="#f0e2c4" strokeOpacity="0.28" strokeWidth="1.5" />
      <rect x="10" y="10" width="180" height="240" rx="7" fill="none" stroke={p.glow} strokeOpacity="0.35" strokeWidth="0.8" />
      <g fill={p.glow} opacity="0.8">
        <path d="M100 4 l4 6 -4 6 -4 -6z" />
        <path d="M100 244 l4 6 -4 6 -4 -6z" />
      </g>
    </svg>
  );
}

type Part = { id: (n: string) => string; glow: string };

function Wolf({ id, glow }: Part) {
  return (
    <g>
      <circle cx="100" cy="92" r="58" fill={`url(#${id('moon')})`} opacity="0.92" />
      <circle cx="82" cy="78" r="7" fill="#c9b289" opacity="0.5" />
      <circle cx="120" cy="108" r="10" fill="#c9b289" opacity="0.4" />
      {/* Collerette de fourrure */}
      <path d="M40 260 L52 196 L36 200 L58 168 L42 166 L70 150 L130 150 L158 166 L142 168 L164 200 L148 196 L160 260 Z" fill="#0d1226" />
      {/* Tête */}
      <path
        d="M100 232 L80 206 L62 168 L54 128 L46 62 L76 98 L90 92 L100 96 L110 92 L124 98 L154 62 L146 128 L138 168 L120 206 Z"
        fill="#0a0e1d"
        stroke="#232c52"
        strokeWidth="1.2"
      />
      {/* Intérieur des oreilles */}
      <path d="M54 76 L74 100 L62 108 Z" fill="#2a1a24" />
      <path d="M146 76 L126 100 L138 108 Z" fill="#2a1a24" />
      {/* Front et museau */}
      <path d="M100 100 L86 128 L90 176 L100 206 L110 176 L114 128 Z" fill="#141a35" />
      <path d="M88 178 L112 178 L106 204 L94 204 Z" fill="#1b2244" />
      <ellipse cx="100" cy="201" rx="7" ry="4.5" fill="#05060c" />
      {/* Crocs */}
      <path d="M92 210 l3 9 3 -8z M108 210 l-3 9 -3 -8z" fill="#f0e2c4" />
      {/* Yeux */}
      <g filter={`url(#${id('glow')})`}>
        <path d="M68 138 L92 146 L84 153 Z" fill={glow} />
        <path d="M132 138 L108 146 L116 153 Z" fill={glow} />
      </g>
      <path d="M80 146 l3 3 M120 146 l-3 3" stroke="#000" strokeWidth="2" />
    </g>
  );
}

function Villager({ id, glow }: Part) {
  return (
    <g>
      {/* Toits du village */}
      <path d="M0 170 L20 150 L40 170 L40 150 L62 128 L84 150 L84 170 L200 170 L200 140 L180 120 L160 140 L160 170 Z" fill="#141526" />
      <g fill={glow} opacity="0.8">
        <rect x="52" y="146" width="6" height="8" />
        <rect x="68" y="146" width="6" height="8" />
        <rect x="174" y="146" width="6" height="8" />
      </g>
      {/* Fourche */}
      <path d="M40 260 L52 96" stroke="#5b4630" strokeWidth="5" strokeLinecap="round" />
      <path d="M40 92 L44 72 M52 94 L54 70 M64 96 L64 74 M40 96 Q52 104 64 98" stroke="#9c9aa8" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* Corps et capuche */}
      <path d="M48 260 C52 200 66 176 100 172 C134 176 148 200 152 260 Z" fill="#3a2c1d" />
      <path d="M100 66 C70 66 62 96 64 126 C66 150 80 170 100 172 C120 170 134 150 136 126 C138 96 130 66 100 66 Z" fill="#4a3824" />
      <ellipse cx="100" cy="124" rx="24" ry="30" fill="#e3c9a0" />
      <path d="M76 116 C80 92 120 92 124 116 C116 104 84 104 76 116 Z" fill="#4a3824" />
      <path d="M88 122 h8 M104 122 h8" stroke="#3a2a1a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M92 140 Q100 145 108 140" stroke="#8a5a3a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M78 168 Q100 184 122 168 L118 182 Q100 192 82 182 Z" fill="#7a2e22" />
      {/* Lanterne */}
      <path d="M150 168 L150 186" stroke="#9c9aa8" strokeWidth="2" />
      <circle cx="150" cy="206" r="26" fill={glow} opacity="0.2" filter={`url(#${id('glow')})`} />
      <rect x="140" y="186" width="20" height="28" rx="4" fill="#2a2016" stroke="#9c9aa8" strokeWidth="2" />
      <ellipse cx="150" cy="201" rx="5" ry="8" fill="#ffd27a" filter={`url(#${id('glow')})`} />
    </g>
  );
}

function Seer({ id, glow }: Part) {
  return (
    <g>
      {/* Voile */}
      <path d="M100 40 C58 40 42 96 44 150 L34 260 L166 260 L156 150 C158 96 142 40 100 40 Z" fill="#1d1847" />
      <path d="M100 40 C72 46 62 90 66 140 L60 260 L140 260 L134 140 C138 90 128 46 100 40 Z" fill="#2a2260" />
      <path d="M58 92 Q100 70 142 92" stroke="#c7a660" strokeWidth="2" fill="none" />
      <g fill="#c7a660">
        <circle cx="72" cy="84" r="2" />
        <circle cx="100" cy="78" r="2.4" />
        <circle cx="128" cy="84" r="2" />
      </g>
      {/* Visage */}
      <ellipse cx="100" cy="124" rx="23" ry="29" fill="#d9c3a6" />
      <path d="M86 124 q5 4 10 0 M104 124 q5 4 10 0" stroke="#3a2a4a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M95 142 Q100 145 105 142" stroke="#8a4a5a" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Troisième œil */}
      <path d="M100 100 l6 6 -6 6 -6 -6z" fill={glow} filter={`url(#${id('glow')})`} />
      {/* Boule de cristal */}
      <circle cx="100" cy="202" r="40" fill={glow} opacity="0.2" filter={`url(#${id('glow')})`} />
      <circle cx="100" cy="200" r="32" fill={`url(#${id('orb')})`} />
      <path d="M84 192 q8 -10 18 -6" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M90 210 q10 6 20 -4 q-6 12 -20 4z" fill="#fff" opacity="0.25" />
      <path d="M78 236 L122 236 L114 226 L86 226 Z" fill="#c7a660" />
      {/* Mains */}
      <path d="M62 214 Q66 196 76 190 Q72 206 78 222 Z M138 214 Q134 196 124 190 Q128 206 122 222 Z" fill="#d9c3a6" />
    </g>
  );
}

function Witch({ id, glow }: Part) {
  return (
    <g>
      {/* Cape */}
      <path d="M40 260 C46 196 64 168 100 164 C136 168 154 196 160 260 Z" fill="#141c22" />
      <path d="M100 164 L88 260 L112 260 Z" fill="#0c1216" />
      {/* Cheveux */}
      <path d="M68 104 C58 140 62 170 72 186 L82 140 Z M132 104 C142 140 138 170 128 186 L118 140 Z" fill="#3a1d1d" />
      {/* Visage */}
      <ellipse cx="100" cy="128" rx="23" ry="28" fill="#cfe0c9" />
      <path d="M78 116 Q100 132 122 116 L122 108 L78 108 Z" fill="#0e1418" opacity="0.6" />
      <g filter={`url(#${id('glow')})`}>
        <ellipse cx="90" cy="126" rx="4" ry="2.6" fill={glow} />
        <ellipse cx="110" cy="126" rx="4" ry="2.6" fill={glow} />
      </g>
      <path d="M92 144 Q100 150 108 142" stroke="#5a2030" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Chapeau pointu */}
      <path d="M96 14 C116 26 128 60 136 100 L64 100 C76 70 86 40 112 30 Z" fill="#1a2430" />
      <path d="M96 14 C110 20 116 26 112 30 C104 26 100 22 96 14 Z" fill="#1a2430" />
      <path d="M68 92 L132 92 L134 100 L66 100 Z" fill="#ff7a1a" />
      <ellipse cx="100" cy="104" rx="64" ry="9" fill="#202c3a" />
      {/* Potion de vie */}
      <g>
        <circle cx="62" cy="214" r="22" fill={glow} opacity="0.2" filter={`url(#${id('glow')})`} />
        <path d="M56 186 h12 v10 c10 5 14 14 14 22 a20 20 0 0 1 -40 0 c0 -8 4 -17 14 -22z" fill="#cfe0c9" fillOpacity="0.2" stroke="#cfe0c9" strokeWidth="1.5" />
        <path d="M44 216 a18 16 0 0 0 36 0 c0 -4 -8 -6 -18 -4 c-10 2 -18 0 -18 4z" fill={glow} />
        <rect x="55" y="180" width="14" height="7" rx="2" fill="#8a6a40" />
        <circle cx="58" cy="220" r="2" fill="#fff" opacity="0.7" />
      </g>
      {/* Potion de mort */}
      <g>
        <circle cx="138" cy="214" r="22" fill="#e5484d" opacity="0.2" filter={`url(#${id('glow')})`} />
        <path d="M132 186 h12 v10 c10 5 14 14 14 22 a20 20 0 0 1 -40 0 c0 -8 4 -17 14 -22z" fill="#e5484d" fillOpacity="0.15" stroke="#e8b4b4" strokeWidth="1.5" />
        <path d="M120 216 a18 16 0 0 0 36 0 c0 -4 -8 -6 -18 -4 c-10 2 -18 0 -18 4z" fill="#e5484d" />
        <rect x="131" y="180" width="14" height="7" rx="2" fill="#8a6a40" />
        <path d="M134 220 l8 8 M142 220 l-8 8" stroke="#2a0a0a" strokeWidth="2" />
      </g>
    </g>
  );
}

function Hunter({ id, glow }: Part) {
  return (
    <g>
      {/* Forêt */}
      <g fill="#0f1a1a">
        <path d="M10 190 L28 120 L46 190 Z" />
        <path d="M150 190 L172 110 L194 190 Z" />
        <path d="M0 200 L14 150 L28 200 Z" />
      </g>
      {/* Mire */}
      <g stroke={glow} strokeOpacity="0.45" fill="none" strokeWidth="1.5">
        <circle cx="100" cy="118" r="62" />
        <path d="M100 48 v24 M100 164 v24 M30 118 h24 M146 118 h24" />
      </g>
      {/* Corps */}
      <path d="M44 260 C48 200 66 176 100 172 C134 176 152 200 156 260 Z" fill="#3b2a1c" />
      <path d="M74 182 L126 182 L120 260 L80 260 Z" fill="#4c5a3a" />
      <path d="M80 182 L100 230 L120 182" stroke="#2a1f14" strokeWidth="3" fill="none" />
      {/* Visage et barbe */}
      <ellipse cx="100" cy="132" rx="24" ry="28" fill="#d7b48e" />
      <path d="M76 132 C78 166 92 176 100 176 C108 176 122 166 124 132 C118 150 82 150 76 132 Z" fill="#5a3a24" />
      <path d="M90 154 Q100 150 110 154" stroke="#3a2414" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M86 126 h9 M105 126 h9" stroke="#2a1a10" strokeWidth="3" strokeLinecap="round" />
      {/* Chapeau à large bord + plume */}
      <ellipse cx="100" cy="108" rx="54" ry="10" fill="#2a1d12" />
      <path d="M72 106 C74 80 86 72 100 72 C114 72 126 80 128 106 Z" fill="#3a2818" />
      <path d="M74 100 L126 100 L127 106 L73 106 Z" fill="#7a2e22" />
      <path d="M124 100 C150 80 160 60 156 46 C146 62 132 78 122 96 Z" fill={glow} opacity="0.85" filter={`url(#${id('glow')})`} />
      <path d="M124 98 L154 50" stroke="#2a0a0a" strokeWidth="1" />
      {/* Fusil */}
      <path d="M36 246 L164 150" stroke="#2a1d12" strokeWidth="9" strokeLinecap="round" />
      <path d="M100 198 L172 144" stroke="#7e8796" strokeWidth="4" strokeLinecap="round" />
      <path d="M36 246 L62 226" stroke="#5b3a20" strokeWidth="13" strokeLinecap="round" />
    </g>
  );
}

function Cupid({ id, glow }: Part) {
  const feathers = (side: 1 | -1) =>
    [0, 1, 2, 3, 4].map((i) => (
      <ellipse
        key={i}
        cx={100 + side * (40 + i * 9)}
        cy={120 + i * 10}
        rx="12"
        ry={30 - i * 3}
        transform={`rotate(${side * (40 + i * 10)} ${100 + side * (40 + i * 9)} ${120 + i * 10})`}
        fill="#f0e2c4"
        opacity={0.9 - i * 0.12}
      />
    ));
  return (
    <g>
      {/* Ailes */}
      <g>{feathers(-1)}</g>
      <g>{feathers(1)}</g>
      {/* Cœurs flottants */}
      <g fill={glow} opacity="0.7">
        <path d="M34 54 c0 -5 7 -5 7 0 c0 -5 7 -5 7 0 c0 5 -7 9 -7 11 c0 -2 -7 -6 -7 -11z" />
        <path d="M156 214 c0 -4 6 -4 6 0 c0 -4 6 -4 6 0 c0 4 -6 8 -6 9 c0 -1 -6 -5 -6 -9z" />
      </g>
      {/* Corps */}
      <path d="M68 260 C70 210 82 188 100 184 C118 188 130 210 132 260 Z" fill="#f2d6c4" />
      <path d="M68 214 C90 226 112 226 134 210 L134 236 C112 248 88 246 66 236 Z" fill="#c43a5e" />
      {/* Tête et boucles */}
      <circle cx="100" cy="134" r="28" fill="#f2d6c4" />
      <g fill="#e0a85a">
        <circle cx="78" cy="118" r="10" />
        <circle cx="92" cy="106" r="11" />
        <circle cx="110" cy="106" r="11" />
        <circle cx="124" cy="118" r="10" />
      </g>
      <path d="M88 136 q4 -4 8 0 M104 136 q4 -4 8 0" stroke="#5a2a3a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="86" cy="146" r="4" fill="#ff7aa8" opacity="0.5" />
      <circle cx="114" cy="146" r="4" fill="#ff7aa8" opacity="0.5" />
      <path d="M94 150 Q100 156 106 150" stroke="#8a2a4a" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Arc et flèche */}
      <path d="M46 176 Q100 110 154 176" stroke="#c7a660" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M46 176 L100 200 L154 176" stroke="#f0e2c4" strokeOpacity="0.7" strokeWidth="1.2" fill="none" />
      <path d="M100 200 L100 120" stroke="#c7a660" strokeWidth="2.5" />
      <path d="M94 204 l6 -8 6 8 M94 210 l6 -8 6 8" stroke="#f0e2c4" strokeWidth="2" fill="none" />
      <path
        d="M90 112 c0 -9 10 -9 10 -2 c0 -7 10 -7 10 2 c0 8 -10 12 -10 16 c0 -4 -10 -8 -10 -16z"
        fill={glow}
        filter={`url(#${id('glow')})`}
      />
    </g>
  );
}

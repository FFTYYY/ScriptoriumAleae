import type { SVGProps } from 'react';
import type { DieKind } from '../engine/dice';

type P = SVGProps<SVGSVGElement>;

const base = (p: P) => ({
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export function DieIcon({ kind, ...p }: { kind: DieKind } & P) {
  const face = 'currentColor';
  const common = base({ viewBox: '0 0 48 48', ...p });
  switch (kind) {
    case 'd4':
      return (
        <svg {...common}>
          <path d="M24 4 L44 40 H4 Z" fill={face} fillOpacity="0.08" />
          <path d="M24 4 L24 28 M24 28 L4 40 M24 28 L44 40" opacity="0.75" />
        </svg>
      );
    case 'd6':
      return (
        <svg {...common}>
          <path d="M24 4 L42 14 V34 L24 44 L6 34 V14 Z" fill={face} fillOpacity="0.08" />
          <path d="M6 14 L24 24 L42 14 M24 24 V44" opacity="0.75" />
          <path d="M24 24 L42 14 V34 L24 44 Z" fill={face} fillOpacity="0.08" stroke="none" />
        </svg>
      );
    case 'd8':
      return (
        <svg {...common}>
          <path d="M24 3 L43 24 L24 45 L5 24 Z" fill={face} fillOpacity="0.08" />
          <path d="M24 3 L24 31 M5 24 L24 31 L43 24 M24 31 L24 45" opacity="0.75" />
        </svg>
      );
    case 'd10':
      return (
        <svg {...common}>
          <path d="M24 3 L44 21 L24 45 L4 21 Z" fill={face} fillOpacity="0.08" />
          <path d="M24 3 L15 25 L24 31 L33 25 Z M4 21 L15 25 M44 21 L33 25 M24 31 L24 45" opacity="0.75" />
        </svg>
      );
    case 'd12':
      return (
        <svg {...common}>
          <path d="M24 3 L43.5 16.5 L36 40 H12 L4.5 16.5 Z" fill={face} fillOpacity="0.08" />
          <path d="M24 13 L33.5 20 L30 31 H18 L14.5 20 Z" opacity="0.85" />
          <path d="M24 3 V13 M43.5 16.5 L33.5 20 M36 40 L30 31 M12 40 L18 31 M4.5 16.5 L14.5 20" opacity="0.65" />
        </svg>
      );
    case 'd20':
      return (
        <svg {...common}>
          <path d="M24 3 L43 14 V34 L24 45 L5 34 V14 Z" fill={face} fillOpacity="0.08" />
          <path d="M24 13 L35 32 H13 Z" opacity="0.85" />
          <path d="M24 3 L24 13 L5 14 M24 13 L43 14 M43 14 L35 32 L43 34 M35 32 L24 45 L13 32 M13 32 L5 34 M5 14 L13 32 M43 34 L24 45" opacity="0.6" />
        </svg>
      );
    case 'd100':
      return (
        <svg {...common}>
          <path d="M17 6 L31 19 L17 42 L3 19 Z" fill={face} fillOpacity="0.06" opacity="0.7" />
          <path d="M31 6 L45 19 L31 42 L17 19 Z" fill={face} fillOpacity="0.1" />
          <path d="M31 6 L25 22 L31 27 L37 22 Z M31 27 V42" opacity="0.7" />
        </svg>
      );
  }
}

export const IconCodex = (p: P) => (
  <svg {...base({ viewBox: '0 0 24 24', ...p })}>
    <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5C4.7 20 4 19.3 4 18.5z" />
    <path d="M20 5.5C20 4.7 19.3 4 18.5 4H13v16h5.5c.8 0 1.5-.7 1.5-1.5z" />
    <path d="M11 4c.5.6 1.5.6 2 0M11 20c.5-.6 1.5-.6 2 0M6.5 8h2.5M6.5 11h2.5M15 8h2.5M15 11h2.5" opacity=".7" />
  </svg>
);

export const IconAstrolabe = (p: P) => (
  <svg {...base({ viewBox: '0 0 24 24', ...p })}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" opacity=".8" />
    <path d="M12 9V3.8M9.6 13.6 5.5 16.5" />
  </svg>
);

export const IconSound = ({ muted, ...p }: P & { muted?: boolean }) => (
  <svg {...base({ viewBox: '0 0 24 24', ...p })}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    {muted ? (
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    ) : (
      <>
        <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
        <path d="M18 6.8a7.5 7.5 0 0 1 0 10.4" opacity=".7" />
      </>
    )}
  </svg>
);

export const IconLedger = (p: P) => (
  <svg {...base({ viewBox: '0 0 24 24', ...p })}>
    <path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v15.5H7.5A1.5 1.5 0 0 1 6 19z" />
    <path d="M6 17.5h12.5M9.5 7.5h5.5M9.5 10.5h5.5M9.5 13.5h3.5" opacity=".75" />
  </svg>
);

export const IconFlame = (p: P) => (
  <svg {...base({ viewBox: '0 0 24 24', ...p })}>
    <path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.2 2.4-4.8 3.2-7.6.9 1.5 1.3 2.7 1.3 3.7C12 9.8 13.2 6.4 12.6 3c3.4 2.4 5.4 6.6 5.4 10.6 0 4.4-2.5 7.4-6 7.4z" />
    <path d="M12 21c-1.5 0-2.6-1.1-2.6-2.6 0-1.7 1.4-2.4 2-4 1.6 1.4 3.2 2.5 3.2 4 0 1.5-1.1 2.6-2.6 2.6z" opacity=".7" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base({ viewBox: '0 0 24 24', ...p })}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base({ viewBox: '0 0 24 24', strokeWidth: 1.8, ...p })}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconMinus = (p: P) => (
  <svg {...base({ viewBox: '0 0 24 24', strokeWidth: 1.8, ...p })}>
    <path d="M5 12h14" />
  </svg>
);

export const IconReroll = (p: P) => (
  <svg {...base({ viewBox: '0 0 24 24', ...p })}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </svg>
);

export const IconFeather = (p: P) => (
  <svg {...base({ viewBox: '0 0 48 48', strokeWidth: 1.2, ...p })}>
    <path d="M40 6C26 8 14 18 11 34l-3 8" />
    <path d="M40 6c-2 10-8 20-19 25-3.2 1.5-6.6 2.6-10 3" />
    <path d="M40 6c-6 2-12 6-16 11M34 14c-4 1.5-8 4-11 7M30 21c-3 1-6 2.5-9 5" opacity=".6" />
  </svg>
);

export const IconSweep = (p: P) => (
  <svg {...base({ viewBox: '0 0 24 24', ...p })}>
    <path d="M14.5 3.5l-3 7" />
    <path d="M7.5 10.5h8l2 10h-12z" />
    <path d="M9 14.5l-.5 6M12 14.5v6M15 14.5l.5 6" opacity=".7" />
  </svg>
);

export const IconHand = (p: P) => (
  <svg {...base({ viewBox: '0 0 24 24', ...p })}>
    <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7-2.6 0-4.4-1.4-5.6-3.6L3.4 14.2a1.5 1.5 0 0 1 2.5-1.6L8 15" />
  </svg>
);

/* ───────────── ornaments ───────────── */

export const Corner = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
    <path d="M1.5 42.5V15C1.5 7.5 7.5 1.5 15 1.5h27.5" />
    <path d="M6.5 42.5V18C6.5 11.6 11.6 6.5 18 6.5h24.5" opacity=".45" />
    <path d="M15 15c5.5 0 7.5 6.5 3.2 8.4-2.8 1.2-5.2-1.2-3.8-3.4.9-1.4 3-1.2 3.4.2" />
    <circle cx="15" cy="15" r="1.6" fill="currentColor" stroke="none" />
    <path d="M24 1.5c0 2.6 1.6 4 4 5M1.5 24c2.6 0 4 1.6 5 4" opacity=".7" />
  </svg>
);

export const Fleuron = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 120 14" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
    <path d="M0 7h46M74 7h46" opacity=".6" />
    <path d="M46 7c4-5 8-5 10 0-2 5-6 5-10 0zM74 7c-4-5-8-5-10 0 2 5 6 5 10 0z" />
    <path d="M60 1.5l4.2 5.5L60 12.5 55.8 7z" fill="currentColor" fillOpacity=".35" />
    <circle cx="40" cy="7" r="1" fill="currentColor" />
    <circle cx="80" cy="7" r="1" fill="currentColor" />
  </svg>
);

export const Sigil = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <circle cx="32" cy="32" r="30" />
    <circle cx="32" cy="32" r="27" opacity=".5" />
    <path d="M32 9 L52 20.5 V43.5 L32 55 L12 43.5 V20.5 Z" />
    <path d="M32 19 L44 40 H20 Z" />
    <path d="M32 9 L32 19 M52 20.5 L44 40 M12 20.5 L20 40 M32 55 L44 40 M32 55 L20 40 M12 20.5 L32 19 L52 20.5 M12 43.5 L20 40 M52 43.5 L44 40" opacity=".55" />
    <text x="32" y="36.2" textAnchor="middle" fontSize="9" fill="currentColor" stroke="none" fontFamily="Cinzel, serif" fontWeight="700">
      XX
    </text>
  </svg>
);

/** An irregular wax blob outline. */
export function sealPath(r: number, cx: number, cy: number, seed = 1): string {
  const pts: string[] = [];
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = 1 + 0.035 * Math.sin(a * 7 + seed) + 0.022 * Math.sin(a * 13 + seed * 2.3) + 0.012 * Math.sin(a * 23 + seed * 0.7);
    pts.push(`${(cx + Math.cos(a) * r * k).toFixed(2)},${(cy + Math.sin(a) * r * k).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

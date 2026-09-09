import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Abstract art cover for a gallery card. A literal mind-map thumbnail can't
// carry a cover (1–3 node maps render as a couple of lonely dots), so this is
// a designed tile instead: layered gradient wash + soft glowing orbs laid out
// on a deterministic golden-angle spiral + a ghost monogram. Pure CSS, no
// data fetching; the orb count loosely reflects the event's task load.
// ---------------------------------------------------------------------------

interface Palette {
  /** Cover gradient wash, corner → transparent. */
  wash: string;
  /** Two orb fill colors (used inside radial-gradients). */
  orbs: [string, string];
}

const PALETTES: Palette[] = [
  { wash: 'from-[#23877B]/20 via-[#23877B]/6 to-transparent', orbs: ['#2aa79a', '#7fd8cd'] },
  { wash: 'from-sky-500/18 via-sky-500/5 to-transparent', orbs: ['#38a8e8', '#93d3f7'] },
  { wash: 'from-violet-500/18 via-violet-500/5 to-transparent', orbs: ['#8b5cf6', '#c4a9fb'] },
  { wash: 'from-amber-500/18 via-amber-500/5 to-transparent', orbs: ['#e0932c', '#f4c983'] },
];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

function orbStyle(cx: number, cy: number, size: number, color: string, opacity: number): CSSProperties {
  return {
    left: `${cx}%`,
    top: `${cy}%`,
    width: `${size}%`,
    aspectRatio: '1',
    transform: 'translate(-50%, -50%)',
    background: `radial-gradient(circle at 35% 35%, ${color}, ${color}00 70%)`,
    opacity,
    filter: 'blur(6px)',
  };
}

export function EventCover({ id, title, total }: { id: string; title: string; total: number }) {
  const seed = hash(id);
  const palette = PALETTES[seed % PALETTES.length];
  const orbCount = Math.min(3 + Math.min(total, 6), 6);
  const orbs = Array.from({ length: orbCount }, (_, i) => {
    // Golden-angle spiral: evenly "random" spread that never clumps.
    const angle = ((seed % 360) + i * 137.508) * (Math.PI / 180);
    const radius = 14 + ((i * 29 + seed) % 22);
    const cx = 50 + Math.cos(angle) * radius * 1.6;
    const cy = 50 + Math.sin(angle) * radius * 0.9;
    const size = 26 - (i % 3) * 6 + (seed % 7);
    const color = palette.orbs[i % palette.orbs.length];
    const opacity = 0.55 - (i % 3) * 0.13;
    return <div key={i} className="absolute rounded-full" style={orbStyle(cx, cy, size, color, opacity)} />;
  });

  return (
    <div className={`relative h-full w-full overflow-hidden bg-gradient-to-br ${palette.wash}`} aria-hidden="true" data-testid="event-cover">
      {orbs}
      <span className="absolute -bottom-4 right-2 select-none text-[88px] font-bold leading-none tracking-tighter text-black/[0.05] dark:text-white/[0.06]">
        {title.trim().charAt(0).toUpperCase() || '·'}
      </span>
    </div>
  );
}

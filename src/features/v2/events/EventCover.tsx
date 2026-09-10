// ---------------------------------------------------------------------------
// Abstract poster cover for a gallery card. A literal mind-map thumbnail can't
// carry a cover (1–3 node maps render as lonely specks), and translucent
// washes read as an empty white tile — so the cover is a *solid* tinted
// poster instead: hand-tuned light/dark gradient pairs, concentric rings
// anchored off-canvas, and a big ghost monogram. Pure CSS, no data fetching.
// ---------------------------------------------------------------------------

interface Palette {
  light: string;
  dark: string;
  /** Motif/monogram ink at 30% (light) — dark mode always uses white/10. */
  ink: string;
}

const PALETTES: Palette[] = [
  { light: 'from-[#d7ece7] to-[#a3d6cb]', dark: 'dark:from-[#12322d] dark:to-[#1d4f47]', ink: 'text-[#23877B]/35 dark:text-white/10' },
  { light: 'from-[#d9e7fb] to-[#a4c6ef]', dark: 'dark:from-[#152436] dark:to-[#1e3c5c]', ink: 'text-[#2f7fd0]/35 dark:text-white/10' },
  { light: 'from-[#e6ddf6] to-[#c0abe9]', dark: 'dark:from-[#241c3d] dark:to-[#372a5b]', ink: 'text-[#7c4fd0]/35 dark:text-white/10' },
  { light: 'from-[#fae9c8] to-[#f2ca8f]', dark: 'dark:from-[#382a11] dark:to-[#59431a]', ink: 'text-[#c07f1d]/40 dark:text-white/10' },
];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

export function EventCover({ id, title }: { id: string; title: string }) {
  const seed = hash(id);
  const p = PALETTES[seed % PALETTES.length];
  const letter = title.trim().charAt(0).toUpperCase() || '·';

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-gradient-to-br ${p.light} ${p.dark}`}
      aria-hidden="true"
      data-testid="event-cover"
    >
      {/* Concentric rings anchored off-canvas bottom-left: structural weight
          that spans the tile no matter how sparse the event is. */}
      <div className={`absolute -bottom-24 -left-16 h-56 w-56 rounded-full border-[10px] ${p.ink} opacity-60`} />
      <div className={`absolute -bottom-16 -left-8 h-40 w-40 rounded-full border-[8px] ${p.ink} opacity-40`} />
      <div className="absolute -bottom-6 left-2 h-24 w-24 rounded-full bg-black/[0.06] dark:bg-white/10" />
      {/* Ghost monogram anchors the right side. */}
      <span className={`absolute -bottom-5 right-1 select-none text-[110px] font-bold leading-none tracking-tighter ${p.ink}`}>
        {letter}
      </span>
    </div>
  );
}

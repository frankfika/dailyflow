export const TAG_COLORS = [
  "text-stone-600 border-stone-300/80 hover:bg-stone-50/80",
  "text-neutral-600 border-neutral-300/80 hover:bg-neutral-50/80",
  "text-zinc-600 border-zinc-300/80 hover:bg-zinc-50/80",
  "text-gray-600 border-gray-300/80 hover:bg-gray-50/80",
  "text-slate-600 border-slate-300/80 hover:bg-slate-50/80",
  "text-stone-500 border-stone-200 hover:bg-stone-50/60",
  "text-neutral-500 border-neutral-200 hover:bg-neutral-50/60",
];

export function getTagColor(tag: string): string {
  if (tag === 'delayed') return 'text-stone-500 border-stone-300 hover:bg-stone-50/60';
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export function getTodayStr(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

export function getWeekRange(date: Date): { start: string; end: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const offset = d.getTimezoneOffset() * 60000;
  return {
    start: new Date(monday.getTime() - offset).toISOString().split('T')[0],
    end: new Date(sunday.getTime() - offset).toISOString().split('T')[0],
  };
}

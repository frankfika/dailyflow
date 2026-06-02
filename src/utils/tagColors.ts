export const TAG_COLORS = [
  "bg-stone-100 text-stone-700 border-stone-200",
  "bg-neutral-100 text-neutral-700 border-neutral-200",
  "bg-zinc-100 text-zinc-700 border-zinc-200",
  "bg-gray-100 text-gray-700 border-gray-200",
  "bg-slate-100 text-slate-700 border-slate-200",
  "bg-stone-50 text-stone-600 border-stone-100",
  "bg-neutral-50 text-neutral-600 border-neutral-100",
];

export function getTagColor(tag: string): string {
  if (tag === 'delayed') return 'bg-stone-200 text-stone-800 border-stone-300';
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

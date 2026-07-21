/**
 * Shared relative-time helper used by both NoteList (in the list
 * column) and NoteEditor (in the empty-state onboarding card +
 * status bar). One source of truth so the two surfaces never
 * disagree on a "5 minutes ago" vs "5m ago" — Frank would notice
 * the inconsistency immediately.
 *
 * Returns a short human label, not a full date. Anything older
 * than a week falls back to ISO date so the label still fits the
 * cell width.
 */
export function relativeTime(iso: string, lang: 'zh' | 'en' = 'en'): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (lang === 'zh') {
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
    return new Date(iso).toISOString().slice(0, 10);
  }
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

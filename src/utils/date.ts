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

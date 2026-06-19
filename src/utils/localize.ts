export type Language = 'en' | 'zh';

export function localize(language: Language, zh: string, en: string): string {
  return language === 'zh' ? zh : en;
}
